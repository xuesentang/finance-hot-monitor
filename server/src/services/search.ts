import { expandKeyword, searchStrategy, preMatchKeyword, analyzeContent } from './ai.js';
import { collectFromSource } from './collector.js';
import { A_STOCK_CODE_MAP, ensureStockCodes } from '../config/stockCodes.js';
import type { SourceName, RawContent, SearchParams, SearchResultItem, SearchResponse } from '../types.js';

const SEARCH_MAX_PER_SOURCE = 20;
const SEARCH_MAX_TOTAL = 100;
const SEARCH_AI_BATCH_SIZE = 5;

const ALL_SOURCES: SourceName[] = ['sec_edgar', 'juchao', 'cailianshe', 'eastmoney', 'fred', 'nbs'];

function normalizeSources(raw: string[]): SourceName[] {
  // 常见 AI 输出错误 → 纠正
  const aliasMap: Record<string, SourceName> = {
    sec: 'sec_edgar', edgar: 'sec_edgar', 'sec edgar': 'sec_edgar',
    cls: 'cailianshe', clen: 'cailianshe', '财联社': 'cailianshe',
    eastmoney: 'eastmoney', east_money: 'eastmoney', '东财': 'eastmoney',
    juchao: 'juchao', '巨潮': 'juchao',
    fred: 'fred', nbs: 'nbs',
    '国家统计局': 'nbs',
  };

  const result: SourceName[] = [];
  const seen = new Set<SourceName>();
  for (const s of raw) {
    const key = s.toLowerCase().trim();
    const mapped = aliasMap[key] ?? (ALL_SOURCES.includes(key as SourceName) ? (key as SourceName) : null);
    if (mapped && !seen.has(mapped)) {
      seen.add(mapped);
      result.push(mapped);
    } else if (!mapped) {
      console.warn(`  ⚠ Unknown source from strategy: "${s}", ignored`);
    }
  }
  return result.length > 0 ? result : ALL_SOURCES;
}

export async function searchContent(params: SearchParams): Promise<SearchResponse> {
  const startTime = Date.now();
  const { query, sources, dateRange = '30d', limit = 50 } = params;

  const [expandedKeywords, strategy] = await Promise.all([
    expandKeyword(query),
    searchStrategy(query),
  ]);

  // 策略给出的检索词 → 传给采集脚本做精准检索
  let collectorKeywords = strategy.searchTerms.length > 0
    ? strategy.searchTerms
    : expandedKeywords;

  // 硬编码兜底：确保 A 股公司名有对应股票代码
  collectorKeywords = ensureStockCodes(query, collectorKeywords);

  console.log(`  🧠 Search strategy: ${strategy.reasoning || 'N/A'}`);
  console.log(`  🔍 Collector keywords: [${collectorKeywords.join(', ')}]`);

  // 策略推荐信源 → 经白名单校验 + 别名纠正
  let targetSources: SourceName[];
  if (sources?.length) {
    targetSources = sources as SourceName[];
  } else if (strategy.targetSources.length > 0) {
    targetSources = normalizeSources(strategy.targetSources);
  } else {
    targetSources = ALL_SOURCES;
  }

  const collectPromises = targetSources.map(source =>
    collectFromSource(source, collectorKeywords, {}, 'search', dateRange)
      .catch(err => {
        console.error(`Search: ${source} failed -`, err);
        return { items: [], watermark: {} };
      })
  );
  const collectResults = await Promise.all(collectPromises);

  const allItems: RawContent[] = [];
  const seen = new Set<string>();
  for (const result of collectResults) {
    for (const item of result.items) {
      const key = `${item.url}::${item.source}`;
      if (!seen.has(key)) {
        seen.add(key);
        allItems.push(item);
      }
    }
  }

  const quotaItems = applySearchQuota(allItems, limit);

  const analyzedItems = await analyzeSearchResults(quotaItems, query, expandedKeywords);

  const filteredItems = analyzedItems.filter(item =>
    !item.aiAnalysis || item.aiAnalysis.relevance >= 20
  );

  filteredItems.sort((a, b) => {
    const relA = a.aiAnalysis?.relevance ?? 0;
    const relB = b.aiAnalysis?.relevance ?? 0;
    return relB - relA;
  });

  const sourceStats: Record<string, number> = {};
  for (const item of filteredItems) {
    sourceStats[item.source] = (sourceStats[item.source] || 0) + 1;
  }

  return {
    query,
    totalResults: filteredItems.length,
    searchTimeMs: Date.now() - startTime,
    items: filteredItems,
    expandedKeywords,
    sourceStats,
  };
}

function applySearchQuota(items: RawContent[], limit: number): RawContent[] {
  const quotaBySource = new Map<SourceName, number>();
  const result: RawContent[] = [];

  for (const item of items) {
    const count = quotaBySource.get(item.source) || 0;
    if (count >= SEARCH_MAX_PER_SOURCE) continue;
    if (result.length >= SEARCH_MAX_TOTAL) break;
    quotaBySource.set(item.source, count + 1);
    result.push(item);
  }

  return result.slice(0, limit);
}

async function analyzeSearchResults(
  items: RawContent[],
  query: string,
  expandedKeywords: string[]
): Promise<SearchResultItem[]> {
  const results: SearchResultItem[] = [];
  const batchSize = SEARCH_AI_BATCH_SIZE;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const fullText = `${item.title}\n${item.content}`;
        const preMatch = preMatchKeyword(fullText, expandedKeywords);

        let aiAnalysis = null;
        try {
          aiAnalysis = await analyzeContent(fullText, query, preMatch, item.sourceType);
        } catch (error) {
          console.error('Search AI analysis failed:', error);
        }

        return {
          title: item.title,
          content: item.content,
          url: item.url,
          source: item.source,
          sourceType: item.sourceType,
          publishedAt: item.publishedAt,
          aiAnalysis,
          matchedTerms: preMatch.matchedTerms,
        };
      })
    );
    results.push(...batchResults);
  }

  return results;
}
