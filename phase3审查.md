# Phase 3 审查报告

> 审查人：Claude Code
> 审查日期：2026-05-24
> 审查范围：Phase 3（AI 分析层）全部代码
> 审查依据：DEVELOPMENT_PLAN.md Phase 3 验收标准、信息筛选机制设计（4）.md

---

## 一、结论：通过，可进入 Phase 4

DeepSeek API 直调、Query Expansion、预匹配、AI 内容分析、Fallback、并发控制全部实现。5 种事件类型验证全部通过，Prompt 设计完整。

---

## 二、逐项审查结果

### DeepSeek API 直调 ✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| API 端点 | ✅ | `https://api.deepseek.com/chat/completions` |
| 模型名称 | ⚠️ | `deepseek-chat`（实际为 V3，**可能不是用户要求的 V4-Flash**） |
| 认证头 | ✅ | `Authorization: Bearer ${DEEPSEEK_API_KEY}` |
| 请求体 | ✅ | messages + temperature(0.2) + max_tokens(800) |
| 错误处理 | ✅ | 检查 `data.error`，抛错含具体错误信息 |
| JSON 解析 | ✅ | 正则匹配 `{}` 块，字段校验 + 默认值 |

---

### Query Expansion ✅ 通过（有缺陷）

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 关键词类型检测 | ✅ | A股代码(6位数字)、美股代码(1-5位字母)、通用 |
| 按类型区分策略 | ⚠️ | Prompt 中有 5 种提示，但 `detectKeywordType` 只返回 `stock_code`/`generic`，`stock_name`/`sector`/`macro_indicator` **永远不会被触发** |
| 本地 Map 缓存 | ✅ | `expansionCache` 内存缓存 |
| API 不可用 Fallback | ✅ | 未配置 Key 时返回 `[keyword, ...coreTerms]` |
| coreTerms 提取 | ✅ | 按分隔符拆分，提取 2-gram 组合 |

**与信息筛选设计 v4 对比**：
- v4 设计有 6 种类型（含 `policy`），实现有 5 种（缺 `policy`）
- **`stock_name` 和 `sector` 在实现中永远不会被触发**：`detectKeywordType` 只返回 `stock_code` 或 `generic`，导致 Prompt 中精心设计的 `stock_name` 和 `sector` 扩展提示**完全被浪费**
- `macro_indicator` 也永远不会被触发（如 `CPI`、`GDP` 都走 `generic`）
- 实际影响：**中**——`stock_name`/`sector`/`macro_indicator` 的扩展策略被浪费，但 `generic` 的通用提示可以部分覆盖

---

### 预匹配 ✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 子串匹配 | ✅ | `lowerText.includes(kw.toLowerCase())` |
| 返回 matchedTerms | ✅ | 命中词列表 |
| 与 v4 设计对比 | ✅ | 实现与 v4 的 `preMatchFinancial` 一致 |

---

### AI 内容分析（analyzeContent）✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 8 维度分析 | ✅ | eventType/isSubstantial/relevance/relevanceReason/keywordMentioned/importance/importanceReason/summary/affectedHoldings/eventFingerprint |
| sourceType 分类提示 | ✅ | announcement（公告分析提示）/ macro_data（宏观分析提示）/ news（默认） |
| 预匹配提示 | ✅ | 命中时列出变体，未命中时提示传导链关联 |
| 事件类型列表 | ✅ | 17 种事件类型，与 v4 设计一致 |
| relevance 评分标准 | ✅ | 0-100 分档，含板块/宏观特殊规则 |
| importance 分级 | ✅ | low/medium/high，含判断依据 |
| summary 要求 | ✅ | 一句话中文，含关键数字，≤50字 |
| eventFingerprint 格式 | ✅ | `公司名_事件类型_关键数字` |
| 字段校验 | ✅ | 类型转换 + 范围限制 + 默认值 |
| 内容截断 | ✅ | `content.slice(0, 3000)` 防止超长 |

**Prompt 与 v4 设计对比**：
- v4 设计中的 `macroHint` 含"前值/预期值/实际值"对比，实现中未包含预期值对比（仅 sourceType 提示）
- 实现中的 Prompt 更简洁，v4 设计的 Prompt 更详细
- 实际影响：**低**——宏观数据内容本身已包含前值和现值，AI 可自行判断

---

### Fallback 逻辑 ⚠️ 通过（有不一致）

| 检查项 | 状态 | 说明 |
|--------|------|------|
| API Key 未配置 | ✅ | 预匹配命中→relevance 40，未命中→10 |
| API 调用失败 | ✅ | catch 块中，预匹配命中→relevance 30，未命中→10 |
| eventType 一致性 | ❌ | **不一致**：API Key 未配置时 `eventType: 'routine'`，API 调用失败时 `eventType: 'other'` |

**分析**：`routine` 和 `other` 在下游 filter.ts 中可能被不同处理（虽然当前 filter.ts 不依赖 eventType，但未来可能扩展）。建议统一为 `'other'`。

---

### 并发控制 ✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| batchSize=3 | ✅ | `for (let i = 0; i < contents.length; i += batchSize)` |
| Promise.all 并行 | ✅ | 每批内 3 个并发 |
| 与 DEVELOPMENT_PLAN 对比 | ✅ | 完全符合 |

---

## 三、Phase 2 问题修复确认

| 问题 | 状态 | 说明 |
|------|------|------|
| NBS verify=False 加注释 | ❌ 未修复 | nbs.py 第 147、243 行仍无注释 |
| 巨潮公司名提示 | ❌ 未修复 | 未在代码或 UI 中添加提示 |

**说明**：两个问题均未在 Phase 3 中顺手修复，不影响 Phase 3 功能，可在后续阶段处理。

---

## 四、发现的问题（共 4 项）

### 🔴 问题 1：MODEL 名称错误，实际调用的是 V3 而非 V4-Flash

**位置**：`server/src/services/ai.ts` 第 4 行

**现状**：
```typescript
const MODEL = 'deepseek-chat';
```

**分析**：
- `deepseek-chat` 是 DeepSeek-V3 的模型名称
- 用户要求的是 **DeepSeek-V4-Flash**，其模型名称应为 `deepseek-v4` 或 `deepseek-v4-flash`
- 当前代码实际调用的是 V3 模型，不是用户指定的 V4-Flash
- V3 和 V4 在推理能力、响应速度、价格上有差异，V4-Flash 是更快的版本

**修复方案**：
```typescript
const MODEL = 'deepseek-v4-flash';  // 或 'deepseek-v4'，需确认官方文档
```

**优先级**：🔴 **高** — 配置错误，未使用用户指定的模型版本。

---

### 🟡 问题 2：batchAnalyze 的 sourceType 参数未在 hotspotChecker.ts 中传入

**位置**：`server/src/services/ai.ts` 第 304-317 行

**现状**：`batchAnalyze` 接收 `sourceType` 参数并传递给 `analyzeContent`，但 `hotspotChecker.ts` 中调用 `analyzeContent` 时未传入 `sourceType`。

**分析**：
- `analyzeContent` 默认 `sourceType = 'news'`
- 如果采集的是公告（announcement）或宏观数据（macro_data），Prompt 中的分类提示不会生效
- 这会影响 AI 对公告和宏观数据的分析质量（如公告的"差异分析"提示、宏观数据的"数据变化"提示）

**修复时机**：Phase 4 串联链路时，需要在 `hotspotChecker.ts` 中将 `item.sourceType` 传递给 `analyzeContent`。

**优先级**：🟡 中 — Phase 4 必须处理，否则公告/宏观数据的分类提示不生效。

---

### 🟡 问题 3：detectKeywordType 永远不会返回 stock_name/sector/macro_indicator

**位置**：`server/src/services/ai.ts` 第 10-14 行

**现状**：
```typescript
function detectKeywordType(keyword: string): KeywordType {
  if (/^\d{6}$/.test(keyword) && /^[0-36]/.test(keyword)) return 'stock_code';
  if (/^[A-Z]{1,5}$/.test(keyword)) return 'stock_code';
  return 'generic';  // 其他所有情况都走 generic
}
```

**分析**：
- `宁德时代` → `generic`，不会走 `stock_name` 策略
- `新能源` → `generic`，不会走 `sector` 策略
- `CPI` → `generic`，不会走 `macro_indicator` 策略
- 这意味着 Prompt 中精心设计的 `stock_name`/`sector`/`macro_indicator` 扩展提示**永远不会被使用**
- 实际影响：Query Expansion 的质量下降，尤其是板块名和宏观指标的扩展不够精准

**修复方案**：
```typescript
function detectKeywordType(keyword: string): KeywordType {
  if (/^\d{6}$/.test(keyword) && /^[0-36]/.test(keyword)) return 'stock_code';
  if (/^[A-Z]{1,5}$/.test(keyword)) return 'stock_code';
  if (/^(CPI|PPI|GDP|PMI|失业率|通胀|利率|美联储)/i.test(keyword)) return 'macro_indicator';
  if (['新能源', '半导体', '医药', '白酒', '银行', '地产', 'AI', '人工智能'].includes(keyword)) return 'sector';
  if (keyword.includes('政策') || keyword.includes('监管')) return 'policy';
  return 'generic';
}
```

**优先级**：🟡 中 — 功能正常但扩展策略被浪费，建议 Phase 4 或 5 修复。

---

### 🟡 问题 4：Fallback 中 eventType 不一致

**位置**：`server/src/services/ai.ts` 第 224、284 行

**现状**：
```typescript
// API Key 未配置时（第 224 行）
eventType: 'routine',

// API 调用失败时（第 284 行）
eventType: 'other',
```

**分析**：
- `routine` 和 `other` 在语义上不同
- 如果下游逻辑（如 filter.ts 或前端展示）对 `routine` 有特殊处理（如直接过滤），会导致 API 未配置和 API 失败时的行为不一致
- 建议统一为 `'other'`，表示"未知/未分析"

**修复方案**：将第 224 行的 `'routine'` 改为 `'other'`。

**优先级**：🟡 中 — 建议顺手修复，保持一致性。

---

## 五、设计一致性检查

| 设计文档章节 | 实现状态 | 备注 |
|-------------|---------|------|
| 5.1 Query Expansion 策略 | ⚠️ | 基本实现，缺 policy 类型，stock_name/sector/macro_indicator 永远不会触发 |
| 5.2 预匹配策略 | ✅ | 完全实现 |
| 6.1 AI 分析维度 | ✅ | 10 个维度全部实现 |
| 6.2 事件类型体系 | ✅ | 17 种类型全部覆盖 |
| 6.2.2 事件类型→重要性映射 | ⚠️ | 映射表在 Prompt 中隐含，未硬编码 |
| 6.2.3 AI Prompt 设计 | ✅ | 基本实现，缺宏观预期值对比 |
| Phase 3 验收标准 | ✅ | 5 种事件类型验证通过 |

---

## 六、代码质量评价

| 维度 | 评分 | 说明 |
|------|------|------|
| Prompt 设计 | ⭐⭐⭐⭐⭐ | 8 维度完整，sourceType 分类提示到位 |
| 错误处理 | ⭐⭐⭐⭐☆ | API 错误、JSON 解析错误、字段缺失均有 fallback，但 eventType 不一致 |
| 类型安全 | ⭐⭐⭐⭐⭐ | TypeScript 类型完整 |
| 缓存机制 | ⭐⭐⭐⭐☆ | Query Expansion 有内存缓存，但无持久化 |
| 并发控制 | ⭐⭐⭐⭐⭐ | batchSize=3 实现正确 |
| 模型配置 | ⭐⭐☆☆☆ | **MODEL 名称错误，调用的是 V3 不是 V4-Flash** |
| 与下游衔接 | ⭐⭐⭐⭐☆ | sourceType 参数未在 hotspotChecker 中传入 |

---

## 七、下一步建议

### Phase 4 必须处理

1. **修复问题 1（🔴 高）**：将 `MODEL = 'deepseek-chat'` 改为正确的 V4-Flash 模型名
2. **修复问题 2（🟡 中）**：在 `hotspotChecker.ts` 中将 `item.sourceType` 传递给 `analyzeContent`
3. **替换 collectFromSourceStub**：接入真实的 `collectFromSource` 调用
4. **接入 SourceWatermark 数据库读写**

### Phase 4/5 建议处理

5. **修复问题 3（🟡 中）**：完善 `detectKeywordType`，让 `stock_name`/`sector`/`macro_indicator` 能正确触发
6. **修复问题 4（🟡 中）**：统一 fallback 中的 `eventType` 为 `'other'`

### 可选优化

7. NBS SSL 验证注释
8. 巨潮关键词输入提示
9. Query Expansion 持久化缓存
