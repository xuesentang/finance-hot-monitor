import type { Server } from 'socket.io';
import { prisma } from '../db.js';
import { expandKeyword, searchStrategy, preMatchKeyword, analyzeContent, normalizeSourceNames, extractCoreEntity, detectKeywordType } from '../services/ai.js';
import { collectFromSource } from '../services/collector.js';
import { shouldFilter } from '../utils/filter.js';
import { SOURCE_AUTHORITY } from '../config/sources.js';
import { A_STOCK_CODE_MAP, ensureStockCodes, matchStockBySubstr } from '../config/stockCodes.js';
import type { RawContent, SourceName, Watermark } from '../types.js';

// 配额按关键词类型分档
function getQuotaByType(keywordType: string): { maxPerSource: number; maxTotal: number } {
  switch (keywordType) {
    case 'stock_code':
    case 'stock_name':
      return { maxPerSource: 15, maxTotal: 80 };
    case 'sector':
      return { maxPerSource: 10, maxTotal: 50 };
    case 'macro_indicator':
      return { maxPerSource: 3, maxTotal: 10 };
    case 'policy':
      return { maxPerSource: 10, maxTotal: 50 };
    default:
      return { maxPerSource: 10, maxTotal: 50 };
  }
}

// 防重复推送：30 分钟内相同 eventFingerprint 不重复推送
const recentlyPushed = new Map<string, number>();
const PUSH_DEDUP_WINDOW = 30 * 60 * 1000;

// 定期清理过期记录，防止 Map 无限增长
setInterval(() => {
  const threshold = Date.now() - PUSH_DEDUP_WINDOW;
  for (const [fp, ts] of recentlyPushed) {
    if (ts < threshold) recentlyPushed.delete(fp);
  }
}, 10 * 60 * 1000); // 每 10 分钟清理一次

/**
 * 从数据库读取信源水位线。
 */
async function loadWatermark(source: SourceName): Promise<Record<string, unknown>> {
  const row = await prisma.sourceWatermark.findUnique({ where: { source } });
  if (!row) return {};

  const wm: Record<string, unknown> = {};
  if (row.lastId) wm.lastId = row.lastId;
  if (row.lastTimestamp != null) wm.lastTimestamp = row.lastTimestamp;
  if (row.extraData) {
    try {
      wm.extraData = JSON.parse(row.extraData);
    } catch {
      wm.extraData = {};
    }
  }
  return wm;
}

/**
 * 将水位线写回数据库。
 */
async function saveWatermark(
  source: SourceName,
  watermark: Record<string, unknown> | Watermark
): Promise<void> {
  const data: {
    lastId?: string | null;
    lastTimestamp?: number | null;
    extraData?: string | null;
  } = {};

  if (typeof watermark.lastId === 'string') data.lastId = watermark.lastId;
  if (typeof watermark.lastTimestamp === 'number') data.lastTimestamp = watermark.lastTimestamp;
  if (watermark.extraData && typeof watermark.extraData === 'object') {
    data.extraData = JSON.stringify(watermark.extraData);
  }

  await prisma.sourceWatermark.upsert({
    where: { source },
    update: data,
    create: { source, ...data },
  });
}

/**
 * 并发池：同时运行最多 concurrency 个异步任务。
 */
async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number = 3
): Promise<void> {
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    const p = fn(item).then(() => { executing.delete(p); });
    executing.add(p);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

/**
 * 对每个关键词、每个信源调用 Python 采集，串联筛选→AI→去重→入库→推送。
 */
async function checkSources(
  sources: SourceName[],
  io: Server
): Promise<number> {
  const keywords = await prisma.keyword.findMany({
    where: { isActive: true },
  });

  if (keywords.length === 0) {
    console.log('No active keywords to monitor');
    return 0;
  }

  let totalNew = 0;

  // 快讯源预拉取：关键词循环前先拉一次，循环内复用缓存
  const fastSourceCache = new Map<SourceName, RawContent[]>();
  const fastSources = sources.filter(s => s === 'cailianshe' || s === 'eastmoney') as SourceName[];
  for (const source of fastSources) {
    try {
      const watermark = await loadWatermark(source);
      const result = await collectFromSource(source, [], watermark);
      await saveWatermark(source, result.watermark);
      fastSourceCache.set(source, result.items);
      console.log(`  📦 Pre-fetched ${source}: ${result.items.length} items`);
    } catch (error) {
      console.error(`  ${source} pre-fetch failed:`, error);
      fastSourceCache.set(source, []);
    }
  }

  await runWithConcurrency(keywords, async (keyword) => {
    console.log(`\n📎 Checking keyword: "${keyword.text}"`);

    try {
      // 计算 normalizedKey（用于策略共享）
      const normalizedKey = keyword.normalizedKey || extractCoreEntity(keyword.text, keyword.type as any);
      if (!keyword.normalizedKey) {
        await prisma.keyword.update({
          where: { id: keyword.id },
          data: { normalizedKey },
        });
      }

      // 前置跳过：用已有策略判断与本次 cron 信源是否有交集，无交集直接跳过
      {
        const cachedStrategy = keyword.searchStrategy;
        if (cachedStrategy) {
          try {
            const parsed = JSON.parse(cachedStrategy);
            const targetSources = normalizeSourceNames(parsed.targetSources || []);
            const overlap = sources.filter(s => targetSources.includes(s));
            if (overlap.length === 0) {
              console.log(`  ⏭ Early skip: "${keyword.text}" has no matching sources for this cron`);
              return;
            }
          } catch { /* ignore */ }
        }
      }

      // 搜索策略：A股快车道优先，否则读取/生成AI策略
      let strategy: { searchTerms: string[]; targetSources: string[] } | null = null;

      // A 股快车道：子串匹配公司名 → 跳过 AI，直接用代码搜巨潮+快讯
      const stockMatch = matchStockBySubstr(keyword.text);
      const kwType = detectKeywordType(keyword.text);
      if (stockMatch.length > 0 && (kwType === 'stock_name' || kwType === 'stock_code' || kwType === 'generic')) {
        const [, code] = stockMatch[0];
        strategy = {
          searchTerms: [code],
          targetSources: ['juchao', 'cailianshe', 'eastmoney'],
        };
        console.log(`  🚀 A-stock fast lane: "${keyword.text}" → ${code} → juchao+cailianshe+eastmoney`);
      } else if (keyword.searchStrategy) {
        try {
          const parsed = JSON.parse(keyword.searchStrategy);
          if (parsed.searchTerms?.length) {
            // normalize 纠正旧策略中的错误信源名
            parsed.targetSources = normalizeSourceNames(parsed.targetSources || []);
            strategy = parsed;
          }
        } catch { /* ignore malformed JSON */ }
      }

      // 跨关键词策略共享：用 normalizedKey 查找同实体的已有策略
      if (!strategy && normalizedKey) {
        const existing = await prisma.keyword.findFirst({
          where: { normalizedKey, searchStrategy: { not: null }, id: { not: keyword.id } },
          select: { searchStrategy: true },
        });
        if (existing?.searchStrategy) {
          try {
            const parsed = JSON.parse(existing.searchStrategy);
            if (parsed.searchTerms?.length) {
              parsed.targetSources = normalizeSourceNames(parsed.targetSources || []);
              strategy = parsed;
              console.log(`  🔄 Reused strategy from same entity (${normalizedKey})`);
            }
          } catch { /* ignore */ }
        }
      }

      if (!strategy || !strategy.searchTerms?.length) {
        const result = await searchStrategy(keyword.text);
        strategy = { searchTerms: result.searchTerms, targetSources: result.targetSources };
        await prisma.keyword.update({
          where: { id: keyword.id },
          data: { searchStrategy: JSON.stringify(strategy) },
        });
        console.log(`  🧠 Strategy cached: [${strategy.searchTerms.join(', ')}] → [${strategy.targetSources.join(', ')}]`);
      }

      // 策略检索词 → 传给采集脚本；快讯源用空（全量拉取）
      let collectorKw = strategy.searchTerms.length > 0
        ? strategy.searchTerms
        : [keyword.text];

      // 硬编码兜底：确保公司名有对应股票代码
      collectorKw = ensureStockCodes(keyword.text, collectorKw);

      // 策略推荐信源 → 与调度层传入的 sources 取交集
      let strategySources = strategy.targetSources.length > 0
        ? sources.filter(s => strategy.targetSources.includes(s))
        : sources;

      // 硬编码兜底：A 股公司关键词强制加入 juchao
      if (stockMatch.length > 0 && !strategySources.includes('juchao')) {
        strategySources = [...new Set([...strategySources, 'juchao' as SourceName])];
      }

      if (strategySources.length === 0) {
        console.log(`  ⏭ No matching sources for strategy`);
        return;
      }

      // 第2层：Query Expansion（仍用于 Node 层预匹配）
      const expandedKeywords = await expandKeyword(keyword.text);

      // 第0-1层：从各信源采集数据
      const allItems: RawContent[] = [];

      for (const source of strategySources) {
        try {
          const isFastSource = source === 'cailianshe' || source === 'eastmoney';

          if (isFastSource) {
            // 快讯源：使用预拉取的缓存数据
            const cachedItems = fastSourceCache.get(source) || [];
            if (cachedItems.length > 0) {
              let matchedCount = 0;
              for (const item of cachedItems) {
                const fullText = `${item.title}\n${item.content}`;
                const pm = preMatchKeyword(fullText, expandedKeywords);
                if (pm.matched) {
                  item.expandedTerms = pm.matchedTerms;
                  allItems.push(item);
                  matchedCount++;
                }
              }
              console.log(`  ${source}: ${cachedItems.length} cached → ${matchedCount} matched`);
            }
          } else {
            // 非快讯源：正常采集
            const watermark = await loadWatermark(source);
            const sourceKw = collectorKw;
            const result = await collectFromSource(source, sourceKw, watermark);
            await saveWatermark(source, result.watermark);
            allItems.push(...result.items);
            if (result.items.length > 0) {
              console.log(`  ${source}: ${result.items.length} items`);
            }
          }
        } catch (error) {
          console.error(`  ${source}: failed -`, error);
        }
      }

      if (allItems.length === 0) return;

      // 配额控制：按信源权威性排序，权威信源优先分配配额
      const { maxPerSource, maxTotal } = getQuotaByType(keyword.type);
      const sortedItems = [...allItems].sort((a, b) => {
        return (SOURCE_AUTHORITY[a.source] || 99) - (SOURCE_AUTHORITY[b.source] || 99);
      });

      const quotaBySource = new Map<SourceName, number>();
      const quotaItems: RawContent[] = [];

      for (const item of sortedItems) {
        const count = quotaBySource.get(item.source) || 0;
        if (count >= maxPerSource) continue;
        if (quotaItems.length >= maxTotal) break;
        quotaBySource.set(item.source, count + 1);
        quotaItems.push(item);
      }

      console.log(`  Total ${allItems.length} raw → ${quotaItems.length} under quota`);

      let keywordNew = 0;

      for (const item of quotaItems) {
        try {
          // DB 去重检查：URL + source 唯一
          const existing = await prisma.hotspot.findFirst({
            where: { url: item.url, source: item.source },
          });

          if (existing) continue;

          // 第2层：关键词预匹配
          const fullText = `${item.title}\n${item.content}`;
          const preMatch = item.expandedTerms
            ? { matched: true, matchedTerms: item.expandedTerms }
            : preMatchKeyword(fullText, expandedKeywords);

          // 第3层：AI 智能分析（传入 sourceType 以触发公告/宏观专用提示）
          const analysis = await analyzeContent(
            fullText, keyword.text, preMatch, item.sourceType
          );

          // 第4层：阈值过滤
          const filterResult = shouldFilter(item, analysis, keyword.type as 'stock_code' | 'stock_name' | 'sector' | 'macro_indicator' | 'policy' | 'generic');
          if (!filterResult.pass) {
            console.log(`  ⏭ Filtered [${filterResult.reason}]: ${item.title.slice(0, 50)}...`);
            continue;
          }

          // 第5层：跨源去重（eventFingerprint + 30min 窗口）
          let isPrimary = true;
          let relatedSources: string[] = [];

          if (analysis.eventFingerprint) {
            const dup = await prisma.hotspot.findFirst({
              where: {
                eventFingerprint: analysis.eventFingerprint,
                createdAt: {
                  gte: new Date(Date.now() - 30 * 60 * 1000),
                },
              },
            });

            if (dup) {
              isPrimary = false;
              const existingSources: string[] = JSON.parse(dup.relatedSources || '[]');
              relatedSources = [...new Set([...existingSources, item.source])];

              await prisma.hotspot.update({
                where: { id: dup.id },
                data: { relatedSources: JSON.stringify(relatedSources) },
              });

              // 如果新的信源权威性更高，提升主记录的 source
              if (
                (SOURCE_AUTHORITY[item.source] || 99) <
                (SOURCE_AUTHORITY[dup.source as SourceName] || 99)
              ) {
                await prisma.hotspot.update({
                  where: { id: dup.id },
                  data: {
                    source: item.source,
                    sourceType: item.sourceType,
                    url: item.url,
                  },
                });
              }
              continue;
            }
          }

          // 入库
          const hotspot = await prisma.hotspot.create({
            data: {
              title: item.title,
              content: item.content,
              url: item.url,
              source: item.source,
              sourceType: item.sourceType,
              eventType: analysis.eventType,
              isSubstantial: analysis.isSubstantial,
              relevance: analysis.relevance,
              relevanceReason: analysis.relevanceReason,
              keywordMentioned: analysis.keywordMentioned,
              importance: analysis.importance,
              importanceReason: analysis.importanceReason,
              summary: analysis.summary,
              affectedHoldings: analysis.affectedHoldings,
              eventFingerprint: analysis.eventFingerprint || null,
              relatedSources: JSON.stringify(relatedSources),
              isPrimary,
              publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
              keywordId: keyword.id,
            },
            include: { keyword: true },
          });

          totalNew++;
          keywordNew++;

          // 创建通知
          await prisma.notification.create({
            data: {
              type: analysis.importance === 'high' ? 'HIGH_RELEVANCE'
                  : analysis.isSubstantial ? 'SUBSTANTIAL_EVENT'
                  : 'hotspot',
              title: `新热点: ${hotspot.title.slice(0, 50)}`,
              content: analysis.summary || hotspot.content.slice(0, 100),
              hotspotId: hotspot.id,
            },
          });

          // 第6层：推送决策
          if (['high', 'medium'].includes(analysis.importance)) {
            const fp = analysis.eventFingerprint;
            const now = Date.now();

            if (fp && recentlyPushed.has(fp) && now - recentlyPushed.get(fp)! < PUSH_DEDUP_WINDOW) {
              continue;
            }
            if (fp) recentlyPushed.set(fp, now);

            io.emit('newHotspot', hotspot);
            io.emit('newNotification', {
              type: analysis.importance === 'high' ? 'HIGH_RELEVANCE'
                  : analysis.isSubstantial ? 'SUBSTANTIAL_EVENT'
                  : 'hotspot',
              title: '发现新热点',
              content: hotspot.title,
              hotspotId: hotspot.id,
              importance: hotspot.importance,
            });
          }

          console.log(`  ✅ [${item.source}][${analysis.importance}] ${hotspot.title.slice(0, 60)}...`);
        } catch (error: any) {
          if (error.code === 'P2002') {
            console.log(`  ⏭ Duplicate on create, skipping`);
            continue;
          }
          console.error(`  Error processing item:`, error);
        }
      }

      if (keywordNew > 0) {
        console.log(`  ${keywordNew} new hotspots for "${keyword.text}"`);
      }

    } catch (error) {
      console.error(`Error checking keyword "${keyword.text}":`, error);
    }
  }, 3);

  // 清理过期防重复记录
  const threshold = Date.now() - PUSH_DEDUP_WINDOW;
  for (const [fp, ts] of recentlyPushed) {
    if (ts < threshold) recentlyPushed.delete(fp);
  }

  return totalNew;
}

// ---- 三个独立 cron 任务 ----

export async function checkFastSources(io: Server): Promise<void> {
  console.log('🚀 Running fast-source check...');
  try {
    const count = await checkSources(['cailianshe', 'eastmoney'], io);
    console.log(`✅ Fast-source check done: ${count} new hotspots`);
  } catch (error) {
    console.error('❌ Fast-source check failed:', error);
  }
}

export async function checkAnnouncementSources(io: Server): Promise<void> {
  console.log('📋 Running announcement-source check...');
  try {
    const count = await checkSources(['sec_edgar', 'juchao'], io);
    console.log(`✅ Announcement check done: ${count} new hotspots`);
  } catch (error) {
    console.error('❌ Announcement check failed:', error);
  }
}

export async function checkMacroSources(io: Server): Promise<void> {
  console.log('📊 Running macro-source check...');
  try {
    const count = await checkSources(['fred', 'nbs'], io);
    console.log(`✅ Macro check done: ${count} new hotspots`);
  } catch (error) {
    console.error('❌ Macro check failed:', error);
  }
}

// 全源检查（手动触发用）
export async function runHotspotCheck(io: Server): Promise<void> {
  console.log('🔍 Starting full hotspot check...');
  const count = await checkSources(
    ['sec_edgar', 'juchao', 'cailianshe', 'eastmoney', 'fred', 'nbs'],
    io
  );
  console.log(`✨ Full check completed: ${count} new hotspots`);
}
