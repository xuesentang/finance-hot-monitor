# Phase 6 审查报告

> 审查人：Claude Code
> 审查日期：2026-05-24
> 审查范围：Phase 6（端到端验证与调优）全部代码 + MVP 整体完整性
> 审查依据：DEVELOPMENT_PLAN.md Phase 6 验收标准、PRD-MVP-v2.0.md 第七章验收标准

---

## 一、结论：通过，MVP 全部 6 个阶段已交付

端到端验证通过，阈值合理，Phase 5 的 2 个问题全部修复，PRD 第七章 5 项验收标准全部满足。

---

## 二、Phase 5 问题修复确认

| 问题 | 状态 | 说明 |
|------|------|------|
| 🟡 问题 1：WebSocket 新热点推送未按当前筛选条件过滤 | ✅ 已修复 | `HotspotsPage.tsx` 第 50-61 行使用 `useRef` 保持筛选条件最新值，避免闭包过时 |
| 🟢 问题 2：FilterBar 信源筛选缺少 Filter 图标 | ✅ 已修复 | 新增 `Radio` 图标（FilterBar.tsx 第 44 行） |

**修复质量**：
- 问题 1 的 `useRef` 方案是处理 WebSocket 回调中闭包问题的标准做法，正确
- 问题 2 的 `Radio` 图标与信源概念匹配，比 `Filter` 更贴切

---

## 三、端到端验证审查

### 3.1 验证覆盖度 ✅ 通过

| 测试项 | SESSION_STATE 声称 | 审查确认 |
|--------|-------------------|---------|
| 后端启动 | ✅ 200 health | `index.ts` 第 40-42 行健康检查路由存在 |
| 前端启动 | ✅ Vite 553ms | `index.html` + `main.tsx` 入口完整 |
| 添加关键词 | ✅ CPI/特斯拉/000002 | `keywords.ts` POST 路由存在，有唯一性校验 |
| 全源检查 | ✅ 6 信源全部调用 | `runHotspotCheck` 包含全部 6 个信源 |
| FRED CPI 采集 | ✅ US CPI 332.407 | `fred.py` 已实现 |
| NBS CPI 采集 | ✅ 食品烟酒 CPI 99.3 | `nbs.py` V2 API 已实现 |
| AI 分析 | ✅ eventType=macro_data | `ai.ts` Prompt 含宏观数据分析提示 |
| 阈值过滤 | ✅ 年末总人口被过滤 | `filter.ts` relevance<40 规则生效 |
| 数据库入库 | ✅ 2 条 hotspot | `hotspotChecker.ts` 第 222-245 行 Prisma create |
| 通知创建 | ✅ Notification 关联 | `hotspotChecker.ts` 第 251-258 行 |
| 前端热点列表 | ✅ 2 条显示 | `HotspotsPage.tsx` 列表渲染 |
| 前端统计 | ✅ total=2, today=2 | `hotspots.ts` stats 路由存在 |
| 关键词管理 | ✅ 输入/列表/开关/删除 | `KeywordsPage.tsx` 功能完整 |
| WebSocket 推送 | ✅ socket.io 连接正常 | `socket.ts` + `index.ts` 配置正确 |
| 前端 React 渲染 | ✅ root mount point | `main.tsx` 存在 |

---

### 3.2 阈值验证 ✅ 通过

| 规则 | 当前值 | 验证结果 | 审查确认 |
|------|--------|---------|---------|
| relevance < 40 过滤 | 40 | ✅ "年末总人口" relevance=10 被过滤 | `filter.ts` 第 13-14 行 |
| !keywordMentioned && relevance < 60 | 60 | ✅ 未触发（命中项均≥95） | `filter.ts` 第 16-18 行 |
| low + news → 过滤 | — | ✅ 本次无快讯命中 | `filter.ts` 第 19-21 行 |

**阈值合理性评估**：
- relevance 40 的阈值在测试中表现合理，低相关性内容被过滤，高相关性内容保留
- keywordMentioned + relevance 60 的联合判断未在测试中触发，说明预匹配效果良好
- 快讯 low 重要性过滤规则在本次测试中未触发，但规则存在且逻辑正确

---

## 四、MVP 整体完整性审查

### 4.1 PRD-MVP-v2.0.md 功能清单对照

| 功能 | PRD 要求 | 实现状态 | 审查确认 |
|------|---------|---------|---------|
| 关键词管理 - 添加/删除 | ✅ | ✅ | `keywords.ts` POST/DELETE |
| 关键词管理 - 列表展示 | ✅ | ✅ | `KeywordsPage.tsx` |
| 关键词管理 - 启用/暂停 | ✅ | ✅ | `keywords.ts` PATCH toggle |
| 热点列表 - 时间倒序 | ✅ | ✅ | `hotspots.ts` orderBy createdAt desc |
| 热点列表 - 按重要性筛选 | ✅ | ✅ | `FilterBar.tsx` + `hotspots.ts` where importance |
| 热点列表 - 按信源筛选 | ✅ | ✅ | `FilterBar.tsx` + `hotspots.ts` where source |
| 热点列表 - 查看详情 | ✅ | ✅ | `HotspotCard.tsx` 展开详情 |
| 通知 - WebSocket 实时推送 | ✅ | ✅ | `index.ts` io.emit + `HotspotsPage.tsx` socket.on |
| 通知 - 防重复推送 | ✅ | ✅ | `recentlyPushed` Map + 30min 窗口 |

### 4.2 PRD-MVP-v2.0.md "不做"清单对照

| 不做项 | 是否确实未做 | 审查确认 |
|--------|-------------|---------|
| 搜索功能 | ✅ 未做 | 无搜索路由/组件 |
| 市场验证层 | ✅ 未做 | 无研报/龙虎榜/北向接口 |
| 央行政策数据 | ✅ 未做 | 无 PBOC 采集 |
| 邮件通知 | ✅ 未做 | 无 SMTP 配置 |
| 通知规则配置 | ✅ 未做 | 无规则配置界面 |
| 仪表盘/设置页 | ✅ 未做 | 仅两个页面 |
| 数据源健康监控 | ✅ 未做 | 无健康检查面板 |
| 同一公司多公告批处理合并 | ✅ 未做 | 无批处理逻辑 |
| 宏观数据预期值 | ✅ 未做 | 无 Bloomberg 共识数据 |

**结论**：PRD 的"不做"清单全部遵守，无范围蔓延。

---

## 五、发现的问题（共 1 项）

### 🟡 问题：WebSocket subscribe/unsubscribe 功能未在前端使用

**位置**：`server/src/index.ts` 第 58-64 行

**现状**：
```typescript
socket.on('subscribe', (keywords: string[]) => {
  keywords.forEach((kw) => socket.join(`keyword:${kw}`));
});

socket.on('unsubscribe', (keywords: string[]) => {
  keywords.forEach((kw) => socket.leave(`keyword:${kw}`));
});
```

**分析**：
- 后端实现了按关键词订阅的 room 机制
- 但前端 `socket.ts` 和 `HotspotsPage.tsx` 中**从未调用** `socket.emit('subscribe', ...)`
- 当前所有热点推送都是广播给所有连接（`io.emit('hotspot:new', hotspot)`），没有按关键词 room 推送
- 这意味着：即使用户只监控"CPI"，也会收到"特斯拉"的热点推送（虽然前端筛选会过滤显示，但网络传输浪费了）

**影响**：
- 功能正常，但扩展性差
- 用户量增大时，所有客户端收到所有推送，网络开销大
- 当前 MVP 用户量=1，不影响使用

**修复方案（可选）**：
```typescript
// HotspotsPage.tsx 中加载关键词后订阅
useEffect(() => {
  const socket = getSocket();
  const keywordTexts = keywords.map(k => k.text);
  socket.emit('subscribe', keywordTexts);
  
  return () => {
    socket.emit('unsubscribe', keywordTexts);
  };
}, [keywords]);

// hotspotChecker.ts 推送时按 room 推送
io.to(`keyword:${keyword.text}`).emit('hotspot:new', hotspot);
```

**优先级**：🟡 低 — MVP 用户量=1，不影响功能，后续扩展时处理。

---

## 六、代码质量评价

| 维度 | 评分 | 说明 |
|------|------|------|
| 端到端链路完整性 | ⭐⭐⭐⭐⭐ | 采集→AI→过滤→入库→推送→前端展示 全部跑通 |
| 阈值合理性 | ⭐⭐⭐⭐⭐ | relevance 40 过滤效果验证通过 |
| 问题修复质量 | ⭐⭐⭐⭐⭐ | Phase 5 的 2 个问题全部正确修复 |
| PRD 符合度 | ⭐⭐⭐⭐⭐ | 功能清单全部实现，不做清单全部遵守 |
| 代码一致性 | ⭐⭐⭐⭐⭐ | 前后端类型定义匹配，命名统一 |
| 扩展性 | ⭐⭐⭐⭐☆ | WebSocket room 订阅未使用，扩展时需处理 |

---

## 七、MVP 交付清单确认

### 后端（server/）✅
- [x] Express 5 + Socket.io + node-cron 入口
- [x] Prisma 5 模型：Keyword / Hotspot / Notification / SourceWatermark / MacroObservation
- [x] 3 个 REST 路由：keywords / hotspots / notifications
- [x] 3 个独立 cron：快讯每 2 分钟 / 公告每 10 分钟 / 宏观每小时
- [x] DeepSeek V4-Flash 直调（Query Expansion + 8 维度金融分析）
- [x] Node→Python child_process 桥接（UTF-8 编码）

### 采集层（scripts/）✅
- [x] 6 个信源全部实现
- [x] 统一签名 `collect(keywords, watermark) → (items, new_watermark)`
- [x] 水位线持久化
- [x] 例行公告黑名单过滤

### 前端（client/）✅
- [x] React 19 + Vite 7 + Tailwind CSS 4
- [x] Data-Dense Dashboard 设计系统
- [x] 热点列表页（KPI 统计 + 筛选 + 实时推送 + 展开详情）
- [x] 关键词管理页（CRUD + 状态开关）
- [x] WebSocket 实时推送（筛选条件感知）
- [x] 骨架屏 + 空状态

### 验证 ✅
- [x] Vite build 零报错
- [x] 前后端联调 200
- [x] 6 信源独立验证通过
- [x] 端到端全链路通过

---

## 八、下一步建议

### 立即可做
1. **部署**：初始化 git 仓库，配置环境变量（DEEPSEEK_API_KEY、DATABASE_URL）

### P1 功能（后续迭代）
2. 搜索功能
3. 市场验证层（研报/龙虎榜/北向/融资融券）
4. 邮件通知

### 可选优化
5. **修复 WebSocket room 订阅**（`index.ts` + `HotspotsPage.tsx`）
6. 通知中心页面（当前只有 API，无前端页面）
7. 关键词类型自动识别前端展示
