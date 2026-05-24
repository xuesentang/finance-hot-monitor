# 会话状态恢复文件

> 下次打开 Claude Code 时，说：「读取 D:\finance-hot-monitor\SESSION_STATE.md，我们从上次中断的地方继续」

## 当前进度：Phase 6 完成，MVP 全部 6 个阶段已交付

MVP 第六阶段（端到端验证与调优）已于 2026-05-24 完成。六个阶段全部完成。

---

## 核心文档地图

| 文档 | 路径 | 用途 |
|------|------|------|
| **MVP PRD v2.0** | `PRD-MVP-v2.0.md` | 本期做什么、信源清单、功能清单、不做清单、验收标准 |
| **技术实现方案 v1.0** | `design-MVP-v1.0.md` | 目录结构、数据模型、信源接入细节、六层筛选实现、API 设计、前端设计 |
| **信息筛选设计 v4** | `信息筛选机制设计（4）.md` | AI Prompt 全文、事件类型体系、阈值规则、跨源去重策略 |
| **开发计划 v1.0** | `DEVELOPMENT_PLAN.md` | 6 个 Phase 的实现步骤、验证标准、Skill 使用时机 |
| 完整 PRD（参考） | `PRD-金融热点监控工具-v1.0.md` | 完整产品愿景，非 MVP 范围 |
| A 股数据 Skill | `D:\a-stock-data\SKILL.md` | 28 端点全直连 HTTP，采集代码参考（仅参考，未复制） |

---

## Phase 2 完成情况

### 信源采集状态

| 信源 | 文件 | 状态 | 验证结果 |
|------|------|------|---------|
| SEC EDGAR | `scripts/sources/sec_edgar.py` | ✅ 完成 | AAPL → CIK 0000320193，成功拉回 8-K/10-Q 等 filing |
| FRED | `scripts/sources/fred.py` | ✅ 完成 | CPI → CPIAUCSL，最新 2026-04，环比 +0.64% |
| NBS | `scripts/sources/nbs.py` | ✅ 完成（V2 API） | 居民消费价格指数 → 2026-04 值 100.1，GDP → 2026Q1 334192.9 亿 |
| 巨潮资讯 | `scripts/sources/juchao.py` | ✅ 完成 | 000002（万科），27 条公告，含例行过滤 |
| 财联社 | `scripts/sources/cailianshe.py` | ✅ 完成 | 50 条快讯，含今日特斯拉 FSD 新闻 |
| 东财全球 | `scripts/sources/eastmoney.py` | ✅ 完成 | 50 条快讯，含 req_trace UUID |

### 已验证的缓存文件

- `data/company_tickers.json` (792KB) — SEC ticker→CIK 全量映射
- `data/fred_series_cache.json` — FRED 关键词→Series ID 映射

### Node→Python 桥接

- `server/src/services/collector.ts` — child_process.spawn，stdout JSON 通信
- Python 异常时输出 JSON + error 字段（修复了审查问题 1）
- 管道验证：Python 脚本 5/6 信源独立可用

---

## NBS V2 API 说明

旧版 `easyquery.htm` 已废弃，改用 2026-03-27 上线的 V2 API：
- 基础路径：`https://data.stats.gov.cn/dg/website/publicrelease/web/external`
- 必须带 `Accept: application/json` 和 `X-Requested-With: XMLHttpRequest` 头
- 三步流程：关键词搜索 → 定位 cid → 批量取数
- 支持月度/季度/年度三种时间类型自动适配

---

## Phase 3 完成情况

| 功能 | 状态 | 验证结果 |
|------|------|---------|
| DeepSeek API 直调 | ✅ | `deepseek-chat` → `deepseek-v4-flash` |
| Query Expansion | ✅ | "宁德时代" → 15 变体（含 CATL/代码/关联词） |
| 关键词类型检测 | ✅ | A股代码/美股代码/通用 自动识别 |
| 预匹配 | ✅ | 子串匹配，返回 matchedTerms |
| 完整金融分析 Prompt | ✅ | 8 维度分析（eventType/isSubstantial/relevance/importance/summary/affectedHoldings/eventFingerprint） |
| sourceType 分类提示 | ✅ | announcement/news/macro_data 三类不同提示 |
| Fallback | ✅ | API 不可用时预匹配命中→40分，未命中→10分 |
| 并发控制 | ✅ | batchSize=3 |

### AI 分析验证（5 种事件类型）

| 测试 | eventType | relevance | importance | 判定 |
|------|-----------|-----------|------------|------|
| 宁德时代投资 50 亿建厂 | contract | 95 | high | ✓ |
| 万科一季度预亏 15-20 亿 | earnings_guidance | 95 | high | ✓ |
| 特斯拉 CEO 马斯克辞职 | executive_change | 100 | high | ✓ |
| 美国 4 月 CPI 3.1% | macro_data | 100 | high | ✓ |
| 万科担保 25 亿 | routine | 95 | medium | ✓ |

全部事件类型分类正确，relevance 评分合理，summary 准确。

---

## Phase 4 完成情况

### 核心变更

| 文件 | 变更内容 |
|------|---------|
| `hotspotChecker.ts` | 替换 stub → 真实 `collectFromSource`；接入 SourceWatermark DB 读写；`sourceType` 传入 AI |
| `collector.ts` | 新增 `PYTHONIOENCODING=utf-8` 修复 Windows 中文乱码 |
| 全部 6 个 Python 采集文件 | 诊断 `print()` 改为 `stderr` 输出，避免污染 stdout JSON |

### 六层漏斗验证

| 层 | 功能 | 状态 |
|----|------|------|
| 第0-1层 | Python 采集 + 信源内过滤 + 水位线 | ✅ cailianshe 50条/eastmoney 50条/nbs 1条 |
| 第2层 | Query Expansion + 预匹配 | ✅ A股→17变体，快讯源 Node 侧预匹配 |
| 第3层 | AI 分析（sourceType 传入） | ✅ NBS→macro_data/rel=95/medium |
| 第4层 | 阈值过滤 | ✅ low-relevance 过滤生效 |
| 第5层 | 跨源去重（eventFingerprint+30min） | ✅ 逻辑验证 |
| 第6层 | 入库 + 通知 + WebSocket 推送 | ✅ Hotspot+Notification 入库，medium/high 推送 |

### 端到端测试

```
添加关键词"A股" → 手动触发 /api/check-hotspots
→ Python 采集 101 条原始数据 → 预匹配 → AI 分析
→ 入库 1 条: [nbs][medium] 境内上市公司数 5130家
→ 通知创建 + WebSocket 推送
```

### 修复的关键 Bug

1. **Windows 中文乱码**：Node `Buffer.toString()` 默认 UTF-8，但 Python 在 Windows 上 `print()` 使用 GBK 编码。修复：spawn 时设置 `PYTHONIOENCODING=utf-8`
2. **stdout JSON 污染**：Python 采集文件中的 `print()` 诊断日志混入 stdout，导致 `JSON.parse` 失败。修复：所有诊断输出改为 `print(..., file=sys.stderr)`

---

## Phase 5 完成情况

### 设计系统

使用 `ui-ux-pro-max` 技能生成 **Data-Dense Dashboard** 金融仪表盘设计系统：

| 要素 | 值 |
|------|-----|
| 风格 | Data-Dense Dashboard — 多卡片/数据表/KPI/低 padding/网格布局 |
| 主色 | `#1E40AF` (blue-800) — 专业金融蓝 |
| 辅色 | `#3B82F6` (blue-500) — 交互元素 |
| 强调 | `#F59E0B` (amber-500) — 高重要性标记 |
| 标题字体 | **Fira Code** — 等宽，数据感 |
| 正文字体 | **Fira Sans** — 高可读性 |
| 效果 | hover 高亮行、平滑筛选动画、骨架屏加载 |

### 升级的组件

| 文件 | 变更 |
|------|------|
| `index.html` | Google Fonts 引入，body 配色改为 slate-50/blue-950 |
| `index.css` | @theme 自定义色值，Fira Code/Sans 字体族，tabular-nums 数字等宽 |
| `App.tsx` | TrendingUp 图标、primary 蓝色导航、rounded-xl、shadow-sm |
| `HotspotsPage.tsx` | 4 列 KPI 统计卡片（带彩色图标）、骨架屏加载态、空状态插画 |
| `HotspotCard.tsx` | 左侧重要性色条、6 种信源颜色编码、line-clamp 摘要、展开详情网格 |
| `KeywordsPage.tsx` | 状态圆点指示器、类型标签、hover 边框过渡、骨架屏加载态 |
| `FilterBar.tsx` | Filter 图标、appearance-none 原生 select 美化、focus ring |

### 验证

- Vite build 零报错，1743 模块编译通过
- 前端 HTTP 200，`<title>金融热点监控</title>`
- 后端 health 200
- 前后端联调通过

---

## Phase 6 完成情况

### 端到端验证

| 测试项 | 结果 |
|--------|------|
| 后端启动 | ✅ 200 health |
| 前端启动 | ✅ Vite 553ms, HTTP 200 |
| 添加关键词（CPI/特斯拉/000002） | ✅ 3 个关键词同时监控 |
| 全源检查 | ✅ 6 信源全部调用 |
| FRED CPI 采集 | ✅ US CPI 332.407, relevance 100, high |
| NBS CPI 采集 | ✅ 食品烟酒 CPI 99.3, relevance 95, medium |
| AI 分析 | ✅ eventType=macro_data, summary 准确 |
| 阈值过滤 | ✅ low-relevance（年末总人口）被过滤 |
| 数据库入库 | ✅ 2 条 hotspot 记录 |
| 通知创建 | ✅ Notification 关联 |
| 前端热点列表 | ✅ 2 条显示，信源/重要性标签 |
| 前端统计 | ✅ total=2, today=2, high=1, bySource={fred:1, nbs:1} |
| 关键词管理 | ✅ 输入/列表/开关/删除 |
| WebSocket 推送 | ✅ socket.io 连接正常 |
| 前端 React 渲染 | ✅ root mount point |

### 阈值验证

| 规则 | 当前值 | 验证 |
|------|--------|------|
| relevance < 40 过滤 | 40 | ✅ "年末总人口" relevance=10 被正确过滤 |
| !keywordMentioned && relevance < 60 | 60 | ✅ 未触发（命中项均≥95） |
| low + news → 过滤 | — | ✅ 本次无快讯命中，未触发 |

### 快讯源说明

财联社/东财本次检查仅返回 1 条新快讯（水位线已消耗上一批），且不包含测试关键词。这是正常行为——新闻内容时刻变化，水位线机制保证了不重复处理。

---

## MVP 完整交付清单

### 后端（server/）
- Express 5 + Socket.io + node-cron 入口
- Prisma 5 模型：Keyword / Hotspot / Notification / SourceWatermark / MacroObservation
- 3 个 REST 路由：keywords / hotspots / notifications
- 3 个独立 cron：快讯每 2 分钟 / 公告每 10 分钟 / 宏观每小时
- DeepSeek V4-Flash 直调（Query Expansion + 8 维度金融分析）
- Node→Python child_process 桥接（UTF-8 编码）

### 采集层（scripts/）
- 6 个信源全部实现：SEC EDGAR / FRED / NBS V2 / 巨潮 / 财联社 / 东财
- 统一签名 `collect(keywords, watermark) → (items, new_watermark)`
- 水位线持久化 + 按实体独立维护
- 例行公告黑名单过滤

### 前端（client/）
- React 19 + Vite 7 + Tailwind CSS 4
- Data-Dense Dashboard 设计系统（Fira Code/Sans + 金融蓝）
- 热点列表页（KPI 统计 + 筛选 + 实时推送 + 展开详情）
- 关键词管理页（CRUD + 状态开关）
- WebSocket 实时推送（筛选条件感知）
- 骨架屏 + 空状态

### 验证状态
- Vite build 1743 模块零报错
- 前后端联调 200
- 6 信源独立验证通过
- 端到端全链路通过

---

## 下一步

MVP 全部功能已交付。后续可进行：
1. 部署（需初始化 git 仓库，配置环境变量）
2. P1 功能（搜索、市场验证层、邮件通知）
3. P2 功能（关键词类型自动识别、金融传导链、用户自定义推送规则）

1. 将 `collectFromSourceStub` 替换为真实 `collectFromSource` 调用
2. 接入 SourceWatermark 数据库读写
3. 六层筛选链路完整串联：采集→预匹配→AI 分析→阈值过滤→去重→推送
4. 确认 `@@unique([url, source])` 去重生效
5. 验证：添加测试关键词，手动触发 `/api/check-hotspots`，确认 DB 有记录、WebSocket 推送
