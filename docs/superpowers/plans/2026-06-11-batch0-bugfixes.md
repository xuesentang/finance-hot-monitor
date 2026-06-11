# 批次 0：严重 Bug 修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 5 个导致功能完全失效或数据错误的 Bug

**Architecture:** 5 个 Bug 相互独立，可并行修复。每个 Bug 涉及 1-2 个文件的小幅改动。

**Tech Stack:** TypeScript (Node.js/Express), React, Python, Socket.IO, Prisma

---

## File Structure

| Bug | 修改文件 | 改动类型 |
|-----|---------|---------|
| Bug1 | `server/src/jobs/hotspotChecker.ts` | 改 2 行 emit 事件名 |
| Bug2 | `client/src/components/FilterBar.tsx` | 改选项值 |
| Bug2 | `server/src/routes/hotspots.ts` | 加 toLowerCase 防御 |
| Bug3 | `scripts/sources/fred.py` | 改 1 行 raise→return |
| Bug4 | `server/src/routes/hotspots.ts` | 加 isSubstantial 参数接收 |
| Bug5 | `server/src/jobs/hotspotChecker.ts` | 改通知 type 赋值逻辑 |
| Bug5 | `client/src/pages/HotspotsPage.tsx` | 无需改（前端判断逻辑已正确） |

---

### Task 1: Bug1 — WebSocket 事件名不匹配

**Files:**
- Modify: `server/src/jobs/hotspotChecker.ts:333-334`

- [ ] **Step 1: 修改服务端 emit 事件名**

将第 333-334 行：
```typescript
io.emit('hotspot:new', hotspot);
io.emit('notification', {
```
改为：
```typescript
io.emit('newHotspot', hotspot);
io.emit('newNotification', {
```

- [ ] **Step 2: 验证**

启动服务，前端连接 WebSocket，确认 DevTools Network → WS 标签收到 `newHotspot` 事件。

---

### Task 2: Bug2 — 前端筛选值大小写不匹配

**Files:**
- Modify: `client/src/components/FilterBar.tsx:9-16,87-90`
- Modify: `server/src/routes/hotspots.ts:10-19`

- [ ] **Step 1: 修改 FilterBar.tsx 信源选项值**

将第 9-16 行：
```typescript
const sources = [
  { value: 'SEC_EDGAR', label: 'SEC EDGAR' },
  { value: 'JUCHAO', label: '巨潮公告' },
  { value: 'CAILIAN', label: '财联社' },
  { value: 'EASTMONEY', label: '东财全球' },
  { value: 'FRED', label: 'FRED' },
  { value: 'NBS', label: '国家统计局' },
];
```
改为：
```typescript
const sources = [
  { value: 'sec_edgar', label: 'SEC EDGAR' },
  { value: 'juchao', label: '巨潮公告' },
  { value: 'cailianshe', label: '财联社' },
  { value: 'eastmoney', label: '东财全球' },
  { value: 'fred', label: 'FRED' },
  { value: 'nbs', label: '国家统计局' },
];
```

- [ ] **Step 2: 修改 FilterBar.tsx 重要性选项值**

将第 87-90 行：
```typescript
<option value="HIGH">高</option>
<option value="MEDIUM">中</option>
<option value="LOW">低</option>
```
改为：
```typescript
<option value="high">高</option>
<option value="medium">中</option>
<option value="low">低</option>
```

- [ ] **Step 3: 后端 hotspots.ts 加防御性 toLowerCase**

在 query 解构后，where 条件赋值处：
```typescript
if (source) where.source = (source as string).toLowerCase();
if (importance) where.importance = (importance as string).toLowerCase();
```

- [ ] **Step 4: 验证**

前端选择"财联社"筛选，确认 API 请求参数 source=cailianshe，返回对应数据。

---

### Task 3: Bug3 — FRED API Key 缺失硬崩溃

**Files:**
- Modify: `scripts/sources/fred.py:72-73`

- [ ] **Step 1: 修改 raise ValueError 为 return**

将第 72-73 行：
```python
if not API_KEY:
    raise ValueError("FRED_API_KEY not set in environment")
```
改为：
```python
if not API_KEY:
    print("  FRED: API key not set, skipping", file=sys.stderr)
    return [], watermark
```

注意：`watermark` 变量在此处尚未定义，需要用空 dict：
```python
if not API_KEY:
    print("  FRED: API key not set, skipping", file=sys.stderr)
    return [], {}
```

- [ ] **Step 2: 验证**

不设 FRED_API_KEY 环境变量，运行宏观 cron，确认不崩溃且日志输出 skipping。

---

### Task 4: Bug4 — 后端 isSubstantial 筛选参数被忽略

**Files:**
- Modify: `server/src/routes/hotspots.ts:10-19`

- [ ] **Step 1: 在 query 解构中添加 isSubstantial**

将第 10-19 行的解构：
```typescript
const {
  page = '1',
  limit = '20',
  source,
  importance,
  keywordId,
  sourceType,
  sortBy = 'createdAt',
  sortOrder = 'desc',
} = req.query;
```
改为：
```typescript
const {
  page = '1',
  limit = '20',
  source,
  importance,
  keywordId,
  sourceType,
  isSubstantial,
  sortBy = 'createdAt',
  sortOrder = 'desc',
} = req.query;
```

- [ ] **Step 2: 在 where 条件中添加 isSubstantial 过滤**

在现有 where 条件赋值之后（约第 26-29 行之后）添加：
```typescript
if (isSubstantial !== undefined) {
  where.isSubstantial = isSubstantial === 'true';
}
```

- [ ] **Step 3: 验证**

前端选择"实质性事件"筛选，确认 API 请求参数 isSubstantial=true，返回 isSubstantial=true 的热点。

---

### Task 5: Bug5 — 通知面板颜色分类不生效

**Files:**
- Modify: `server/src/jobs/hotspotChecker.ts:314-334`

- [ ] **Step 1: 修改创建通知的 type 赋值**

将第 314-321 行：
```typescript
await prisma.notification.create({
  data: {
    type: 'hotspot',
    title: `新热点: ${hotspot.title.slice(0, 50)}`,
    content: analysis.summary || hotspot.content.slice(0, 100),
    hotspotId: hotspot.id,
  },
});
```
改为：
```typescript
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
```

- [ ] **Step 2: 修改 Socket 推送通知的 type 赋值**

将第 334-340 行：
```typescript
io.emit('newNotification', {
  type: 'hotspot',
  title: '发现新热点',
  content: hotspot.title,
  hotspotId: hotspot.id,
  importance: hotspot.importance,
});
```
改为：
```typescript
io.emit('newNotification', {
  type: analysis.importance === 'high' ? 'HIGH_RELEVANCE'
      : analysis.isSubstantial ? 'SUBSTANTIAL_EVENT'
      : 'hotspot',
  title: '发现新热点',
  content: hotspot.title,
  hotspotId: hotspot.id,
  importance: hotspot.importance,
});
```

- [ ] **Step 3: 验证**

产生 high 重要性热点后，通知面板圆点显示为红色（bg-high class）。
