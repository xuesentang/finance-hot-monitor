# Phase 4 审查报告

> 审查人：Claude Code
> 审查日期：2026-05-24
> 审查范围：Phase 4（筛选链路串联）全部代码
> 审查依据：DEVELOPMENT_PLAN.md Phase 4 验收标准、design-MVP-v1.0.md 第 5 章

---

## 一、结论：通过，可进入 Phase 5

六层漏斗完整串联，从采集到入库到 WebSocket 推送的端到端链路已跑通。Phase 3 的 4 个问题全部修复，Phase 2 的 2 个遗留问题部分修复。

---

## 二、逐项审查结果

### 2.1 collectFromSourceStub 替换 ✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| stub 已替换 | ✅ | `hotspotChecker.ts` 第 4 行导入 `collectFromSource` |
| 参数传递正确 | ✅ | `collectFromSource(source, collectorKw, watermark)` |
| 快讯源不传关键词 | ✅ | `isFastSource ? [] : [keyword.text]` |
| 水位线读写 | ✅ | `loadWatermark` → `collectFromSource` → `saveWatermark` |

---

### 2.2 SourceWatermark 数据库读写 ✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 读取水位线 | ✅ | `prisma.sourceWatermark.findUnique({ where: { source } })` |
| 写回水位线 | ✅ | `prisma.sourceWatermark.upsert` |
| 字段映射 | ✅ | lastId/lastTimestamp/extraData 正确映射 |
| extraData JSON 解析 | ✅ | try-catch 容错 |
| 异常处理 | ✅ | 无记录时返回 `{}` |

---

### 2.3 六层漏斗串联 ✅ 通过

| 层 | 功能 | 实现位置 | 状态 |
|----|------|---------|------|
| 第 0-1 层 | Python 采集 + 信源内过滤 + 水位线 | `collector.ts` + Python 脚本 | ✅ |
| 第 2 层 | Query Expansion + 预匹配 | `hotspotChecker.ts` 第 86-122 行 | ✅ |
| 第 3 层 | AI 智能分析 | `hotspotChecker.ts` 第 162-164 行 | ✅ |
| 第 4 层 | 阈值过滤 | `hotspotChecker.ts` 第 167-171 行 | ✅ |
| 第 5 层 | 跨源去重 | `hotspotChecker.ts` 第 174-215 行 | ✅ |
| 第 6 层 | 入库 + 通知 + WebSocket 推送 | `hotspotChecker.ts` 第 218-274 行 | ✅ |

**端到端验证**：
- 添加关键词"A股" → 手动触发 `/api/check-hotspots`
- Python 采集 101 条原始数据 → 预匹配 → AI 分析
- 入库 1 条: `[nbs][medium] 境内上市公司数 5130家`
- 通知创建 + WebSocket 推送

---

### 2.4 配额控制 ✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 每信源最多 5 条 | ✅ | `MAX_PER_SOURCE = 5` |
| 总额最多 30 条 | ✅ | `MAX_TOTAL = 30` |
| 配额分配逻辑 | ✅ | 按 allItems 顺序分配，先到先得不公平但简单 |

---

### 2.5 跨源去重 ✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| eventFingerprint 匹配 | ✅ | `prisma.hotspot.findFirst({ where: { eventFingerprint, createdAt: { gte: now-30min } } })` |
| 30 分钟窗口 | ✅ | `Date.now() - 30 * 60 * 1000` |
| 更新 relatedSources | ✅ | `JSON.parse` + `Set` 去重 + `JSON.stringify` |
| 权威性更新 | ✅ | `SOURCE_AUTHORITY` 比较，数字小更权威 |
| 内存防重复推送 | ✅ | `recentlyPushed` Map + 30 分钟清理 |

---

### 2.6 WebSocket 推送 ✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 推送事件名 | ✅ | `hotspot:new` + `notification` |
| 推送条件 | ✅ | `importance` 为 high/medium |
| 推送去重 | ✅ | `recentlyPushed` 内存 Map |
| 推送内容 | ✅ | 完整 hotspot 对象 + 通知对象 |

---

### 2.7 Prisma 入库 ✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| URL + source 唯一约束 | ✅ | `@@unique([url, source])` |
| 字段映射完整 | ✅ | 所有 AI 分析字段正确映射 |
| Notification 创建 | ✅ | 每条 hotspot 创建一条通知 |
| keyword 关联 | ✅ | `keywordId: keyword.id` |
| publishedAt 处理 | ✅ | `item.publishedAt ? new Date(item.publishedAt) : null` |

---

### 2.8 定时任务 ✅ 通过

| 任务 | 频率 | 信源 | 状态 |
|------|------|------|------|
| 快讯 | 每 2 分钟 | cailianshe, eastmoney | ✅ |
| 公告 | 每 10 分钟 | sec_edgar, juchao | ✅ |
| 宏观 | 每小时 | fred, nbs | ✅ |

---

## 三、Phase 3 问题修复确认

| 问题 | 状态 | 说明 |
|------|------|------|
| 🔴 问题 1：MODEL 名称错误 | ✅ 已修复 | `deepseek-v4-flash`（ai.ts 第 4 行） |
| 🟡 问题 2：sourceType 未传入 | ✅ 已修复 | `analyzeContent(fullText, keyword.text, preMatch, item.sourceType)`（hotspotChecker.ts 第 162-164 行） |
| 🟡 问题 3：detectKeywordType 不完整 | ✅ 已修复 | 新增 `MACRO_INDICATORS`/`SECTOR_NAMES`/`COMPANY_SUFFIX` 检测（ai.ts 第 10-34 行） |
| 🟡 问题 4：Fallback eventType 不一致 | ✅ 已修复 | 统一为 `'other'`（ai.ts 第 248、308 行） |

**全部 4 个问题已修复。**

---

## 四、Phase 2 遗留问题修复确认

| 问题 | 状态 | 说明 |
|------|------|------|
| NBS verify=False 加注释 | ❌ 未修复 | nbs.py 第 148 行仍无注释 |
| 巨潮公司名提示 | ❌ 未修复 | 未在代码或 UI 中添加提示 |

**说明**：两个问题均未在 Phase 4 中顺手修复，不影响 Phase 4 功能，可在 Phase 5/6 处理。

---

## 五、发现的新问题（共 3 项）

### 🟡 问题 1：配额分配不公平可能导致重要内容被截断

**位置**：`hotspotChecker.ts` 第 131-140 行

**现状**：
```typescript
for (const item of allItems) {
  const count = quotaBySource.get(item.source) || 0;
  if (count >= MAX_PER_SOURCE) continue;
  if (quotaItems.length >= MAX_TOTAL) break;
  quotaBySource.set(item.source, count + 1);
  quotaItems.push(item);
}
```

**分析**：
- 配额按 `allItems` 的顺序分配，先到先得
- 如果某个信源的前 5 条都是低质量内容，会占满配额，导致后续高质量内容被截断
- 例如：财联社前 5 条都是弱相关快讯，SEC EDGAR 第 1 条就是重大并购公告，但配额已满

**建议**：配额分配前按 `sourceType` 或信源权威性排序，优先分配权威性高的信源。或者在 AI 分析后再做配额控制（但会增加 API 调用成本）。

**优先级**：🟡 中 — 功能正常，但可能导致重要内容丢失。

**修复方案**：
```typescript
// 按信源权威性排序后再分配配额
const sortedItems = [...allItems].sort((a, b) => {
  return (SOURCE_AUTHORITY[a.source] || 99) - (SOURCE_AUTHORITY[b.source] || 99);
});

for (const item of sortedItems) {
  // ... 原有配额逻辑
}
```

---

### 🟡 问题 2：快讯源预匹配后 allItems.filter 计数逻辑有误

**位置**：`hotspotChecker.ts` 第 116 行

**现状**：
```typescript
console.log(`  ${source}: ${result.items.length} raw → ${allItems.filter(i => i.expandedTerms).length} matched`);
```

**分析**：
- `allItems.filter(i => i.expandedTerms)` 统计的是**所有已加入 allItems 的项**中 `expandedTerms` 存在的数量
- 但此时 allItems 可能已包含之前信源的数据，导致计数不准确
- 例如：先处理财联社（加入 3 条），再处理东财（加入 2 条），统计时显示 5 条 matched，但实际东财只匹配了 2 条

**建议**：改为统计当前信源本次匹配的条数：
```typescript
const matchedCount = result.items.filter(item => {
  const fullText = `${item.title}\n${item.content}`;
  return preMatchKeyword(fullText, expandedKeywords).matched;
}).length;
console.log(`  ${source}: ${result.items.length} raw → ${matchedCount} matched`);
```

**优先级**：🟡 低 — 只是日志计数不准确，不影响功能。

---

### 🟡 问题 3：跨源去重时权威性更新逻辑可能覆盖已推送内容

**位置**：`hotspotChecker.ts` 第 198-212 行

**现状**：
```typescript
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
      content: item.content,
      title: item.title,
    },
  });
}
```

**分析**：
- 如果新信源权威性更高，会更新主记录的 `source`/`url`/`content`
- 但 `eventFingerprint` 不变，所以 `recentlyPushed` 的防重仍然有效
- **潜在问题**：如果主记录已经被前端展示，更新 `url` 后前端点击链接会跳转到新的信源，可能导致用户困惑
- 另一个问题：更新 `content` 后，AI 分析的 `summary` 可能与新的 `content` 不匹配（因为 summary 是基于旧的 content 生成的）

**建议**：权威性更新时，同时重新触发 AI 分析，或者只更新 `source` 和 `relatedSources`，不更新 `content`/`title`/`url`。

**优先级**：🟡 中 — 功能正常，但可能导致展示内容不一致。

---

## 六、设计一致性检查

| 设计文档章节 | 实现状态 | 备注 |
|-------------|---------|------|
| 5.1 采集架构 | ✅ | Node→Python 管道通畅，stdout JSON 通信 |
| 5.2 六层筛选 | ✅ | 全部 6 层串联完成 |
| 5.3 AI 分析 | ✅ | sourceType 传入正确 |
| 5.4 阈值过滤 | ✅ | 四层规则集成 |
| 5.5 跨源去重 | ✅ | eventFingerprint + 30min + 权威性更新 |
| 6.1 REST API | ✅ | `/api/check-hotspots` 手动触发 |
| 6.2 WebSocket | ✅ | `hotspot:new` + `notification` 事件 |
| 7.1 定时任务 | ✅ | 快讯/公告/宏观 三种频率 |
| Phase 4 验收标准 | ✅ | 端到端验证通过 |

---

## 七、代码质量评价

| 维度 | 评分 | 说明 |
|------|------|------|
| 六层串联逻辑 | ⭐⭐⭐⭐⭐ | 清晰完整，每层职责明确 |
| 错误处理 | ⭐⭐⭐⭐⭐ | 信源级 try-catch + 项级 try-catch |
| 配额控制 | ⭐⭐⭐⭐☆ | 实现正确但分配策略可优化 |
| 跨源去重 | ⭐⭐⭐⭐☆ | 功能完整但权威性更新可能不一致 |
| 水位线管理 | ⭐⭐⭐⭐⭐ | 读写正确，extraData 容错 |
| WebSocket 推送 | ⭐⭐⭐⭐⭐ | 条件正确，内存去重有效 |
| 类型安全 | ⭐⭐⭐⭐⭐ | TypeScript 类型完整 |

---

## 八、下一步建议

### Phase 5 必须处理

1. **前端页面完善**：验证热点列表、通知中心、关键词管理页面功能

### Phase 5/6 建议处理

2. **修复问题 1（🟡 中）**：配额分配前按信源权威性排序
3. **修复问题 3（🟡 中）**：权威性更新时同步更新 AI 分析字段，或不更新 content/title/url

### 可选优化

4. **修复问题 2（🟡 低）**：快讯源日志计数逻辑
5. NBS SSL 验证注释
6. 巨潮关键词输入提示
