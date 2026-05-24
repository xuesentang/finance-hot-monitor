# 金融热点监控工具 — 开发计划 v1.0

> 基于 [PRD-MVP-v2.0](./PRD-MVP-v2.0.md) 和 [技术实现方案 v1.0](./design-MVP-v1.0.md)。
> 每步完成后手工验证，确认通畅再进下一步。

---

## 总览

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5 ──→ Phase 6
 骨架        采集层      AI层       筛选链路     前端        端到端

Phase 2 内部可并行（2a→2b→2c→2d→2e→2f，其中 2c+2d 并行，2e+2f 并行）
其余 Phase 全部串行，前一步完成再进下一步
```

---

## 开发阶段必须遵循的一点：
1、每完成一个阶段的代码开发必须停下等我的下一步指令，不能连续开发多个阶段，这是因为我要做代码审查，或许还要修改代码。
2、在获取API的过程中遇到需要API KEY而你不方便操作的情况可以直接暂停进程，指导我去获取API KEY，其他你不方便的事也是同样道理，直接吩咐我就行。
3、我昨天更换了VPN提供商，因此遇到网络问题（保不准啥时候你需要访问外网），尝试新的代理端口：7890

## github仓库地址

https://github.com/xuesentang/finance-hot-monitor

## 项目结构

## Phase 1：项目骨架

**目标**：目录能跑，数据库能连，前后端能通信。

**步骤**：
1. 把 `D:\yupi-hot-monitor\server\` 复制到 `D:\finance-hot-monitor\server\`，删除无用模块（`services/twitter.ts`、`services/chinaSearch.ts`、`services/search.ts`、`services/email.ts`、`test-sources.ts`）
2. 把 `D:\yupi-hot-monitor\client\` 复制到 `D:\finance-hot-monitor\client\`，清理原赛博朋克 UI 组件
3. 用 design-MVP-v1.0.md 第四章的 Prisma Schema 替换 `server/prisma/schema.prisma`
4. 跑 `prisma migrate dev` 建表
5. 安装新依赖（`npm install`），移除无用的 npm 包（`@openrouter/sdk`、`cheerio`、`axios` 等不再需要的）
6. 创建 Python 虚拟环境：`python3 -m venv fhot-venv`，激活后 `pip install -r scripts/requirements.txt`
7. 创建 `scripts/` 目录，初始化 `requirements.txt`
8. 启动后端 `npm run dev`，确认 health check 返回 200
9. 启动前端 `npm run dev`，确认 Vite 正常编译

**用到的 Skill**：
- `superpowers:using-git-worktrees` — 创建隔离工作区，保护原始 yupi-hot-monitor 不被误改

**验证**：`curl localhost:3001/api/health` 返回 200，前端页面能打开。

---

## Phase 2：Python 采集层

**目标**：6 个信源都能独立拉回数据，Node 能通过 child_process 调用 Python。

### 2a：采集框架搭建

1. 写 `scripts/collector.py` — 接收 `--source`、`--keywords`、`--watermark` 参数，路由到对应采集函数，输出 JSON
2. 写 `server/src/services/collector.ts` — `spawn('python3', ['scripts/collector.py', ...])`，解析 stdout JSON
3. 定义 `RawContent` 接口（types.ts）
4. 用 SEC EDGAR 的 `company_tickers.json` 端点写一个简单脚本验证 Node→Python→stdout JSON 管道通畅

**验证**：`npx tsx server/src/services/collector.ts`（手动测试脚本）能打印出 Python 返回的 JSON。

### 2b：SEC EDGAR 采集

1. 写 `scripts/sources/sec_edgar.py`
2. 自动拉取并缓存 `company_tickers.json`（约 2MB），实现 ticker→CIK 映射
3. 调用 submissions API，按 filing 类型过滤，检测新文件
4. 实现水位线逻辑（通过 `--watermark` 参数传入，输出中返回新水位线）
5. Node 侧写回 `SourceWatermark` 表

**验证**：添加关键词 `AAPL`，确认能拉回最近的 8-K/10-Q 等 filing。

### 2c：FRED 采集

1. 写 `scripts/sources/fred.py`
2. 实现关键词→Series ID 搜索（`series/search` 端点）
3. 调用 observations API，检测最新 date 是否变更
4. 计算环比变化

**验证**：添加关键词 `CPI`，确认能拉回最新 CPI 数据。

### 2d：NBS 采集

1. 写 `scripts/sources/nbs.py`，参考 `cn-stats` 库的 `easyquery` 调用
2. 通过 `getTree` 动态查找指标代码
3. 同 FRED 的数据变更检测逻辑

**验证**：添加关键词 `CPI`，确认能拉回中国 CPI 数据。

> 2c 和 2d 互不依赖，可并行开发。用 `superpowers:dispatching-parallel-agents` 分派两个 Agent 同时写。

### 2e：巨潮采集

1. 写 `scripts/sources/juchao.py`，参考 a-stock-data Skill 的 `cninfo_announcements()`
2. 实现例行公告黑名单过滤（采集层直接过滤）
3. 注意 orgId 格式（a-stock-data V3.1 已修复）

**验证**：添加关键词 `000002`（万科），确认能拉回非例行公告。

### 2f：财联社 + 东财采集

> 两个快讯源结构相似，放在一个步骤。

1. 写 `scripts/sources/cailianshe.py`，参考 a-stock-data 的 `cls_telegraph()`
2. 写 `scripts/sources/eastmoney.py`，参考 a-stock-data 的 `eastmoney_global_news()`，注意 `req_trace` 参数
3. 实现时间戳水位线

**验证**：不设关键词（全量快讯），确认能拉回最近快讯列表。

> 2e 和 2f 互不依赖，可并行开发。

**Phase 2 用到的 Skill**：
- `superpowers:dispatching-parallel-agents` — 2c+2d 并行、2e+2f 并行
- `superpowers:test-driven-development` — 每个采集函数先写验证标准再写代码
- `superpowers:verification-before-completion` — 每个子步骤完成后的验证把关

---

## Phase 3：AI 分析层

**目标**：Query Expansion + 内容分析能跑通，DeepSeek API 返回符合预期的 JSON。

**步骤**：
1. 在 `server/src/services/ai.ts` 实现 DeepSeek API 直调（`https://api.deepseek.com/chat/completions`）
2. 实现 Query Expansion：按关键词类型区分扩展策略，本地 Map 缓存
3. 实现预匹配：扩展词列表在文本中做子串匹配
4. 实现 `analyzeFinancialContent()`：构造 Prompt（信息筛选设计 v4 的完整 Prompt）→ 调用 API → 解析 JSON 输出 → 字段校验
5. 实现 Fallback：API 不可用时预匹配命中给 relevance 40
6. 实现并发控制：batchSize=3

**用到的 Skill**：
- `superpowers:test-driven-development` — 先写几个测试用例（已知内容 + 已知关键词 → 预期输出范围），再写实现
- `mcp__context7__query-docs` — 查 DeepSeek API 最新文档

**验证**：写一个手动测试脚本，传入一条已知的公告文本 + 关键词，打印 AI 返回的 JSON。人工抽查 5 条不同事件类型的内容（业绩预告、高管变更、例行公告、宏观数据、行业快讯），确认 eventType 分类正确、relevance 评分合理。

---

## Phase 4：筛选链路 + 入库 + 推送

**目标**：六层漏斗完整串联，新热点能入库并推送到前端。

**步骤**：
1. 写 `server/src/utils/filter.ts` — 四层阈值过滤规则
2. 写 `server/src/jobs/hotspotChecker.ts`：
   - 获取活跃关键词
   - 对每个关键词 → 每个信源调用 collector → 得到 RawContent 列表
   - 第2层：Query Expansion + 预匹配
   - 第3层：调用 AI 分析
   - 第4层：阈值过滤
   - 第5层：跨源去重（eventFingerprint 匹配 + 30min 窗口）
   - 第6层：入库 + WebSocket 推送
3. 注册三个 cron（Phase 1 只跑通骨架，现在接入真实逻辑）
4. 写 `server/src/routes/keywords.ts` 和 `server/src/routes/hotspots.ts`（REST API）
5. 确认 `@@unique([url, source])` 去重生效

**用到的 Skill**：
- `superpowers:test-driven-development` — filter.ts 的阈值逻辑先写单元测试
- `superpowers:systematic-debugging` / `investigate` — 六层链路首次串联大概率有边界情况
- `simplify` — Phase 4 完成后复查 hotspotChecker.ts 是否过于冗长需要拆分

**验证**：添加一个测试关键词，手动触发 `/api/check-hotspots`，确认数据库有新记录，WebSocket 收到推送。

---

## Phase 5：前端页面

**目标**：关键词管理和热点列表两个页面可用。

**步骤**：
1. 写 `client/src/services/api.ts` — REST API 封装
2. 写 `client/src/services/socket.ts` — WebSocket 客户端
3. 写 `client/src/pages/KeywordsPage.tsx` — 输入框 + 关键词列表 + 启用/暂停开关 + 删除
4. 写 `client/src/pages/HotspotsPage.tsx` — 筛选栏 + 热点卡片列表 + 详情展开
5. 写 `client/src/components/HotspotCard.tsx` — 标题/来源标签/AI 摘要/重要性标记/关联信源数
6. 写 `client/src/components/FilterBar.tsx` — 重要性下拉 + 信源下拉 + 关键词下拉
7. 写 `App.tsx` — 路由配置（`/` → HotspotsPage, `/keywords` → KeywordsPage）
8. 替换 Tailwind 样式为简洁金融工具风（去掉原项目的赛博朋克色系）

**用到的 Skill**：
- `ui-ux-pro-max` — 金融工具风格设计参考（配色、信息密度、卡片布局）
- `superpowers:verification-before-completion` — 页面完成后逐个交互验证

**验证**：添加关键词 → 等定时任务触发或手动触发 → 热点列表自动刷新 → 点击卡片展开详情。所有交互不报错。

---

## Phase 6：端到端验证与调优

**目标**：全链路跑通，阈值合理，没有明显 bug。

**步骤**：
1. 添加 3 个不同类型的关键词（如 `AAPL` 美股代码 + `宁德时代` A 股公司名 + `CPI` 宏观指标）
2. 让系统运行 1 小时，观察：
   - 各信源成功率（是否有某个源持续失败）
   - AI 分析延迟（每条从采集到入库的时间）
   - 误报率（人工抽查 20 条 medium/high 推送，是否确实相关）
   - 漏报（是否有已知重大事件没被捕获）
3. 根据观察调整：
   - 阈值（relevance 40 太宽/太窄？keywordMentioned+relevance 60 是否合理？）
   - Prompt（AI 是否稳定输出正确的事件类型？eventFingerprint 格式是否一致？）
   - 配额（30 条总额是否够？每个信源 5 条是否合理？）

**用到的 Skill**：
- `superpowers:verification-before-completion` — 验收标准逐条对照
- `superpowers:requesting-code-review` — 整体代码质量复查
- `code-reviewer` Agent — 对照 PRD 和 Design 审查实现完整性

**验证**：PRD 第七章 5 项验收标准全部通过。

---

## 技能使用总览

| Skill | 用在哪个 Phase | 用途 |
|-------|---------------|------|
| `superpowers:using-git-worktrees` | Phase 1 | 隔离工作区，保护原 yupi-hot-monitor |
| `superpowers:test-driven-development` | Phase 2, 3, 4 | 采集函数、AI 分析、过滤规则的验证先行 |
| `superpowers:dispatching-parallel-agents` | Phase 2 | 2c+2d 并行、2e+2f 并行 |
| `mcp__context7__query-docs` | Phase 3 | DeepSeek API 最新文档 |
| `superpowers:verification-before-completion` | 每个 Phase 结束 | 验证把关，不过关不进下一步 |
| `superpowers:systematic-debugging` / `investigate` | Phase 4, 6 | 六层链路串联时的边界情况排查 |
| `simplify` | Phase 4 | hotspotChecker.ts 代码质量复查 |
| `ui-ux-pro-max` | Phase 5 | 金融工具风格设计指导 |
| `superpowers:requesting-code-review` | Phase 6 | 全链路代码审查 |
| `code-reviewer` Agent | Phase 6 | 对照 PRD/Design 审查实现完整性 |




---

## 原则

1. **每一步都要验证**——跑通了再进下一步，不在错误基础上盖楼
2. **先跑通最小闭环再扩展**——Phase 2 先把 SEC EDGAR 一个源跑通（2a→2b），验证 Node→Python 管道，再并行铺开其余 5 个源
3. **真实数据验证优于假设**——阈值 40 合不合理、Prompt 好不好用，用真实数据跑一轮再调，不在纸上纠结
4. **不跳跃**——Phase 1→6 按顺序来，不做「先把前端做完再补后端」这种打乱依赖的事

---

> **文档状态**：待确认
> **下一步**：确认后从 Phase 1 开始编码。
