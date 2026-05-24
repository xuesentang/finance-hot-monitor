# Phase 5 审查报告

> 审查人：Claude Code
> 审查日期：2026-05-24
> 审查范围：Phase 5（前端 UI 升级）全部代码
> 审查依据：DEVELOPMENT_PLAN.md Phase 5 验收标准、design-MVP-v1.0.md 第 7 章

---

## 一、结论：通过，可进入 Phase 6

前端两个页面（热点列表、关键词管理）功能完整，设计系统一致，WebSocket 实时推送处理正确。Vite build 零报错，前后端联调通过。

---

## 二、逐项审查结果

### 2.1 热点列表页面（HotspotsPage.tsx）✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 统计概览卡片 | ✅ | 4 列 KPI（总热点/今日新增/高重要性/活跃信源） |
| 筛选栏 | ✅ | 重要性 + 信源 双筛选 |
| 手动检测按钮 | ✅ | 调用 `/api/check-hotspots` |
| 热点列表 | ✅ | HotspotCard 组件渲染 |
| 分页 | ✅ | 页码按钮，当前页高亮 |
| 骨架屏加载态 | ✅ | 3 个脉冲占位卡片 |
| 空状态 | ✅ | 图标 + 提示文字 |
| WebSocket 实时接收 | ✅ | `hotspot:new` 事件处理 |
| 新热点高亮动画 | ✅ | 蓝色边框，5 秒后移除 |

---

### 2.2 关键词管理页面（KeywordsPage.tsx）✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 添加输入框 | ✅ | placeholder 含巨潮提示（000002） |
| 添加按钮 | ✅ | Enter 快捷键支持 |
| 关键词列表 | ✅ | 状态圆点 + 文本 + 类型标签 + 热点计数 |
| 启用/暂停开关 | ✅ | Power/PowerOff 图标切换 |
| 删除按钮 | ✅ | confirm 确认对话框 |
| 骨架屏加载态 | ✅ | 3 个脉冲占位条 |
| 空状态 | ✅ | 图标 + 提示文字 |

---

### 2.3 热点卡片组件（HotspotCard.tsx）✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 重要性色条 | ✅ | 左侧红/琥珀/灰三色指示条 |
| 信源标签 | ✅ | 6 种信源颜色编码 |
| 重要性标签 | ✅ | 高/中/低三色 |
| 事件类型标签 | ✅ | 非 other 时显示 |
| 关联信源数 | ✅ | Share2 图标 + 数量 |
| 标题链接 | ✅ | 可点击跳转原文，ExternalLink 图标 |
| AI 摘要 | ✅ | line-clamp-2 截断 |
| 展开详情 | ✅ | 原始内容 + AI 分析详情网格 |
| 时间格式化 | ✅ | zh-CN 本地化 |
| 相关性百分比 | ✅ | Target 图标 + 数值 |

---

### 2.4 筛选栏组件（FilterBar.tsx）✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 重要性筛选 | ✅ | 全部/高/中/低 |
| 信源筛选 | ✅ | 全部信源 + 6 个具体信源 |
| Filter 图标 | ✅ | 重要性筛选有图标（信源筛选无，见问题 1） |

---

### 2.5 API 对接 ✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| REST API 封装 | ✅ | `request` 统一处理，类型完整 |
| Keywords API | ✅ | list/create/update/toggle/remove |
| Hotspots API | ✅ | list/get/stats/remove/triggerCheck |
| Notifications API | ✅ | list/markRead |
| 类型定义匹配 | ✅ | 前端 `Hotspot`/`Keyword` 与后端 Prisma 模型一致 |
| 分页响应类型 | ✅ | `PaginatedResponse<T>` |

---

### 2.6 WebSocket ✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| Socket 单例 | ✅ | `getSocket()` 确保只有一个连接 |
| 自动重连 | ✅ | `transports: ['websocket', 'polling']` 降级 |
| 内存泄漏防护 | ✅ | `useEffect` 返回清理函数 `socket.off` |
| 新热点接收 | ✅ | `hotspot:new` 事件处理 |

---

### 2.7 设计系统 ✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 风格 | ✅ | Data-Dense Dashboard |
| 主色 | ✅ | `#1E40AF` (blue-800) |
| 辅色 | ✅ | `#3B82F6` (blue-500) |
| 强调色 | ✅ | `#F59E0B` (amber-500) |
| 标题字体 | ✅ | Fira Code |
| 正文字体 | ✅ | Fira Sans |
| 数字等宽 | ✅ | tabular-nums |

---

## 三、发现的问题（共 2 项）

### 🟡 问题 1：WebSocket 新热点推送未按当前筛选条件过滤

**位置**：`client/src/pages/HotspotsPage.tsx` 第 53-66 行

**现状**：
```typescript
const handleNew = (hotspot: Hotspot) => {
  setNewIds((prev) => new Set([...prev, hotspot.id]));
  setHotspots((prev) => {
    if (prev.some((h) => h.id === hotspot.id)) return prev;
    return [hotspot, ...prev];
  });
  // ...
};
```

**分析**：
- 用户当前可能设置了筛选条件（如只看 `importance=high` 或 `source=cailianshe`）
- WebSocket 推送的新热点**直接插入列表顶部**，没有检查是否符合当前筛选条件
- 例如：用户筛选了"高重要性"，但 WebSocket 推送了一个 medium 的热点，这个热点会显示在列表中，与筛选条件矛盾

**修复方案**：
```typescript
const handleNew = (hotspot: Hotspot) => {
  // 检查是否符合当前筛选条件
  if (source && hotspot.source !== source) return;
  if (importance && hotspot.importance !== importance) return;
  
  setNewIds((prev) => new Set([...prev, hotspot.id]));
  setHotspots((prev) => {
    if (prev.some((h) => h.id === hotspot.id)) return prev;
    return [hotspot, ...prev];
  });
  // ...
};
```

**优先级**：🟡 中 — 功能正常，但筛选体验不一致。

---

### 🟢 问题 2：FilterBar 信源筛选 select 缺少 Filter 图标

**位置**：`client/src/components/FilterBar.tsx` 第 43-53 行

**现状**：重要性筛选有 Filter 图标，信源筛选没有。

**分析**：视觉上不一致，但功能完全正常。

**优先级**：🟢 低 — 纯视觉细节，不影响功能。

---

## 四、Phase 4 修正保留确认

| 修正项 | 状态 | 说明 |
|--------|------|------|
| 配额按权威性排序 | ✅ | `hotspotChecker.ts` 中 `sortedItems` 保留 |
| 日志计数修复 | ✅ | `matchedCount` 局部变量保留 |
| 权威性更新不覆盖 content/title | ✅ | 只更新 source/sourceType/url |

---

## 五、代码质量评价

| 维度 | 评分 | 说明 |
|------|------|------|
| 页面功能完整性 | ⭐⭐⭐⭐⭐ | 两页面功能齐全 |
| 组件设计 | ⭐⭐⭐⭐⭐ | 卡片/筛选栏职责清晰 |
| WebSocket 处理 | ⭐⭐⭐⭐☆ | 实时接收正确，但缺筛选过滤 |
| API 对接 | ⭐⭐⭐⭐⭐ | 类型完整，错误处理到位 |
| 设计系统一致性 | ⭐⭐⭐⭐⭐ | 配色/字体/间距统一 |
| 加载态/空状态 | ⭐⭐⭐⭐⭐ | 骨架屏+空状态都有 |

---

## 六、下一步建议

### Phase 6 建议处理

1. **修复问题 1（🟡 中）**：WebSocket 推送时按当前筛选条件过滤
2. **修复问题 2（🟢 低）**：FilterBar 信源筛选添加 Filter 图标（可选）

### Phase 6 核心任务

3. 端到端全链路验证
4. 阈值调优
5. Bug 修复
