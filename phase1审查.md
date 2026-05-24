# Phase 1 审查报告


> 审查日期：2026-05-24
> 审查范围：Phase 1（项目骨架）全部代码
> 审查依据：DEVELOPMENT_PLAN.md、design-MVP-v1.0.md、PRD-MVP-v2.0.md

---

## 一、结论：通过，可进入 Phase 2

Phase 1 实现质量良好，代码结构清晰，与设计文档一致，前后端骨架完整，六层筛选链路逻辑正确，类型定义完备。

---

## 二、确认通过项（共 12 项）

| 序号 | 检查项 | 状态 |
|------|--------|------|
| 1 | 项目目录结构 | 完全匹配 design-MVP-v1.0.md 第一章 |
| 2 | Prisma Schema | 5 个模型与设计文档 4.1 完全一致 |
| 3 | 后端框架搭建 | Express 5 + Socket.io + node-cron 结构清晰 |
| 4 | 路由 API | keywords/hotspots/notifications 三个路由完整 |
| 5 | 类型定义 | types.ts 中全部类型已定义 |
| 6 | 六层筛选链路骨架 | 第 2-6 层逻辑完整，第 0-1 层 stub 占位符合预期 |
| 7 | AI 服务骨架 | Query Expansion + 预匹配 + analyzeContent + batchAnalyze 完整 |
| 8 | 阈值过滤 | filter.ts 四层规则与设计文档一致 |
| 9 | Python 采集入口 | collector.py 参数解析、路由、JSON 输出格式正确 |
| 10 | 信源 stubs | 6 个信源文件齐全，函数签名统一 |
| 11 | 前端骨架 | React 19 + Vite + Tailwind，hash 路由，两页面 + 两组件 |
| 12 | .gitignore | 覆盖了 node_modules/dist/.env/db/fhot-venv/data/__pycache__ |

---

## 三、问题清单（共 4 项，均为非阻塞性）

### ⚠️ 问题 1：Python 异常输出到 stderr，Node 侧未处理（建议 Phase 2 前修复）

**位置**：`scripts/collector.py` 第 34-36 行

**现状**：
```python
except Exception as e:
    result = {"items": [], "watermark": watermark, "error": str(e)}
    print(json.dumps(result, ensure_ascii=False), file=sys.stderr)  # 输出到 stderr
    sys.exit(1)
```

Node 的 `collector.ts` 只监听 `stdout`，Python 异常时 Node 收到的 stdout 为空，`JSON.parse("")` 会抛异常，**错误信息完全丢失**。

**风险**：Phase 2 联调 Node→Python 管道时，Python 异常会导致 Node 侧只能看到 "Failed to parse collector JSON"，无法定位真实错误。

**修复方案（推荐方案 A）**：

```python
# 将 stderr 改为 stdout，确保 Node 总能拿到结构化数据
except Exception as e:
    result = {"items": [], "watermark": watermark, "error": str(e)}
    print(json.dumps(result, ensure_ascii=False))  # 输出到 stdout
    sys.exit(1)
```

**优先级**：🔴 高 — 建议 Phase 2 开始前修复，避免调试时抓瞎。

---

### ⚠️ 问题 2：hotspotChecker.ts 中 collectFromSourceStub 与 collector.ts 的导入关系（Phase 2 顺带处理）

**位置**：`server/src/jobs/hotspotChecker.ts` 第 213-218 行

**现状**：`hotspotChecker.ts` 内部定义了 `collectFromSourceStub`，但 `collector.ts` 已实现了 `collectFromSource` 函数，当前未导入。

**处理时机**：Phase 2 把 stub 替换为真实调用时，一并添加 `import { collectFromSource } from '../services/collector.js'` 并替换函数调用。

**优先级**：🟡 中 — 预期内的占位代码，Phase 2 自然解决。

---

### ⚠️ 问题 3：前端 api.ts 中 hotspotsApi.list 返回类型为 any（Phase 3/5 顺带处理）

**位置**：`client/src/services/api.ts` 第 43 行

**现状**：
```typescript
return request<PaginatedResponse<any>>(`/hotspots${qs}`);
```

**建议**：改为 `PaginatedResponse<Hotspot>`，保持类型安全。

**优先级**：🟢 低 — 纯类型问题，不影响功能。

---

### ⚠️ 问题 4：.env 中 DEEPSEEK_API_KEY 占位值缺少明确提示（Phase 3 前提醒）

**位置**：`server/.env` 第 2 行

**现状**：`DEEPSEEK_API_KEY="sk-xxx"` 是占位值，但缺少文档提醒用户在 Phase 3 前替换为真实 Key。

**处理时机**：Phase 3（AI 层）开始前，提醒用户替换为真实 DeepSeek API Key。

**优先级**：🟢 低 — 不影响当前阶段。

---

## 四、修复建议汇总

| 问题 | 建议处理时机 | 预计工作量 |
|------|-------------|-----------|
| 问题 1：Python stderr → stdout | Phase 2 开始前 | 1 行代码 |
| 问题 2：stub 替换为真实调用 | Phase 2 进行中 | 自然替换 |
| 问题 3：any → Hotspot 类型 | Phase 3/5 顺带 | 1 行代码 |
| 问题 4：.env 提示 | Phase 3 开始前 | 文档提醒 |

---

## 五、设计一致性检查结果

| 设计文档章节 | 实现状态 | 备注 |
|-------------|---------|------|
| 4.1 Prisma Schema | 完全一致 | |
| 4.2 source 枚举 | 6 个值全对 | |
| 4.3 sourceType 枚举 | 3 个值全对 | |
| 5.1 采集架构 | 骨架完成 | Python 入口 + Node 桥接 |
| 5.2 六层筛选 | 第 2-6 层完成 | 第 0-1 层 stub 占位 |
| 5.3 AI 分析 | Prompt 骨架完成 | 含 fallback 逻辑 |
| 5.4 阈值过滤 | 四层规则实现 | |
| 5.5 跨源去重 | eventFingerprint + 30min 窗口 | |
| 6.1 REST API | 三个路由完整 | |
| 6.2 WebSocket | 推送逻辑完整 | |
| 7.1 前端页面 | 两页面 + 两组件 | |
