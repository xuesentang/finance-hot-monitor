# Phase 2 审查报告


> 审查日期：2026-05-24
> 审查范围：Phase 2（Python 采集层）全部代码
> 审查依据：DEVELOPMENT_PLAN.md Phase 2 验收标准、design-MVP-v1.0.md 第三章

---

## 一、结论：通过，可进入 Phase 3

6/6 信源全部实现，Node→Python 管道通畅，水位线逻辑正确，缓存机制完善。DeepSeek 在 Phase 2 中顺手修复了 Phase 1 审查中的问题 1（Python stderr→stdout）和问题 3（any→Hotspot 类型）。

---

## 二、逐项审查结果

### 2a 采集框架 ✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| collector.py 参数解析 | ✅ | `--source`、`--keywords`、`--watermark` 三参数正确 |
| collector.py 路由 | ✅ | 6 个信源分支齐全，异常处理改为 stdout + error 字段 |
| collector.ts 调用 | ✅ | child_process.spawn 正确，解析 stdout JSON，判断 error 字段 |
| 管道通畅性 | ✅ | Python 异常时 Node 能拿到结构化错误信息，不再丢失 |

**Phase 1 问题 1 修复确认**：collector.py 第 34-35 行已改为 `print(json.dumps(result, ensure_ascii=False))`（输出到 stdout），Node 侧通过 `result.error` 判断错误。✅

---

### 2b SEC EDGAR ✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| ticker→CIK 映射 | ✅ | 自动下载并缓存 company_tickers.json（792KB） |
| 美股代码过滤 | ✅ | 纯英文 1-5 位字母，非美股代码直接跳过 |
| submissions API | ✅ | `data.sec.gov/submissions/CIK{cik}.json` 正确调用 |
| filing 类型过滤 | ✅ | 18 种类型覆盖 P0/P1/P2，含 8-K/13F/6-K/10-Q/10-K/S-1/DEF 14A/424B/SC 13G/3/4/5 等 |
| 水位线逻辑 | ✅ | 每个 CIK 维护 lastFilingDate，首次运行取最近 7 天 |
| 频率控制 | ✅ | 0.15s 间隔（≤10 req/s），符合 SEC 要求 |
| User-Agent | ✅ | 格式正确 `FinanceHotMonitor/1.0 xuesentang@example.com` |
| 代理配置 | ✅ | 读取 HTTPS_PROXY/HTTP_PROXY 环境变量 |

**验证结果**：AAPL → CIK 0000320193，成功拉回 8-K/10-Q 等 filing。与 SESSION_STATE 描述一致。

---

### 2c FRED ✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| Series ID 搜索 | ✅ | `series/search` 端点，按 popularity 排序取第一条 |
| 关键词→Series ID 缓存 | ✅ | `data/fred_series_cache.json` 持久化 |
| observations API | ✅ | `series/observations` 正确调用，取最新 3 条 |
| 数据变更检测 | ✅ | 比较 latest_date > prev_date |
| 环比变化计算 | ✅ | 先与上次检查值比，无则用 FRED 返回的前一期值 |
| 缺失值过滤 | ✅ | 过滤掉 value == "." 的观测 |
| 水位线 | ✅ | 每个 Series ID 维护 lastDate + lastValue |
| 频率控制 | ✅ | 0.5s 间隔（120 req/min） |
| API Key 检查 | ✅ | 未设置时抛 ValueError |

**验证结果**：CPI → CPIAUCSL，最新 2026-04，环比 +0.64%。与 SESSION_STATE 描述一致。

---

### 2d NBS（国家统计局）✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| V2 API 适配 | ✅ | 2026-03-27 上线的 V2 API，非旧版 easyquery.htm |
| 请求头 | ✅ | Accept + X-Requested-With 正确 |
| 三步流程 | ✅ | query 搜索 → queryIndicatorsByCid 元数据 → getEsDataByCidAndDt 取数 |
| 指标搜索缓存 | ✅ | `data/nbs_search_cache.json` 持久化 |
| 数据类型适配 | ✅ | MM（月度）/ SS（季度）/ YY（年度）自动适配时间格式 |
| 优先级选择 | ✅ | 月度+全国 > 任意月度 > 第一个结果 |
| 数据变更检测 | ✅ | latest_date > prev_date 才返回 |
| 环比计算 | ✅ | 在返回的记录中找前一期有值记录计算 |
| 水位线 | ✅ | 每个 indic_id 维护 lastDate + lastValue |
| 时间格式转换 | ✅ | _dt_to_iso 函数处理 YY/SS/MM 三种格式 |

**验证结果**：居民消费价格指数 → 2026-04 值 100.1，GDP → 2026Q1 334192.9 亿。与 SESSION_STATE 描述一致。

---

### 2e 巨潮资讯 ✅ 通过

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 股票代码提取 | ✅ | 6 位纯数字或含后缀（如 600036.SH） |
| orgId 构造 | ✅ | 6xxxxx→gssh0、8/4xxxxx→gsbj0、其余→gssz0 |
| 公告接口 | ✅ | `hisAnnouncement/query` POST 正确 |
| 例行公告过滤 | ✅ | 10 个黑名单关键词（董事会决议/股东大会通知/监事会决议/独立董事/预约披露/投资者关系等） |
| 水位线 | ✅ | 每只股票维护 lastId + lastDate |
| 时间处理 | ✅ | announcementTime 毫秒时间戳转 ISO |

**验证结果**：000002（万科）拉回 27 条公告，含例行过滤。与 SESSION_STATE 描述一致。

---

### 2f 财联社 + 东财 ✅ 通过

#### 财联社

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 端点 | ✅ | `cls.cn/nodeapi/telegraphList` |
| 全量拉取 | ✅ | 不按关键词筛选，50 条 |
| 时间戳水位线 | ✅ | ctime 比较，维护 lastTimestamp |
| 内容合并 | ✅ | title + brief + content 合并，截断 3000 字符 |

#### 东财全球

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 端点 | ✅ | `np-weblist.eastmoney.com/comm/web/getFastNewsList` |
| req_trace | ✅ | UUID 生成，a-stock-data V3.1 修复点已落实 |
| 全量拉取 | ✅ | 50 条 |
| 时间解析 | ✅ | showTime 字符串 "%Y-%m-%d %H:%M:%S" 解析为时间戳 |
| 水位线 | ✅ | 时间戳比较，维护 lastTimestamp |

**验证结果**：财联社 50 条快讯，东财 50 条快讯。与 SESSION_STATE 描述一致。

---

## 三、Phase 1 问题修复确认

| 问题 | 状态 | 说明 |
|------|------|------|
| 问题 1：Python stderr → stdout | ✅ 已修复 | collector.py 异常时输出到 stdout，Node 通过 error 字段判断 |
| 问题 3：any → Hotspot 类型 | ✅ 已修复 | `client/src/services/api.ts` 第 43 行已改为 `PaginatedResponse<Hotspot>` |

---

## 四、发现的新问题（共 3 项，均为非阻塞性）

### ⚠️ 问题 1：hotspotChecker.ts 中 collectFromSourceStub 仍未替换（Phase 3/4 必须修）

**位置**：`server/src/jobs/hotspotChecker.ts` 第 213-218 行

**现状**：Phase 2 完成了 Python 采集层，但 `hotspotChecker.ts` 中仍然使用 `collectFromSourceStub`（返回空数组），没有接入真实的 `collectFromSource`。

**影响**：当前定时任务和手动触发 `/api/check-hotspots` 都不会实际采集数据，只是空跑。

**修复时机**：Phase 4（筛选链路串联）必须修复。需要：
1. 导入 `collectFromSource` from `../services/collector.js`
2. 替换 `collectFromSourceStub` 调用
3. 从数据库读取 SourceWatermark 作为水位线传入
4. 采集后将新水位线写回数据库

**优先级**：🔴 高 — Phase 4 必须处理，否则全链路跑不通。

---

### ⚠️ 问题 2：NBS 使用 `verify=False` 禁用 SSL 验证

**位置**：`scripts/sources/nbs.py` 第 146、243 行

**现状**：
```python
resp = session.get(..., verify=False, ...)
resp = session.post(..., verify=False, ...)
```

**风险**：
1. 安全风险：禁用 SSL 验证使连接容易受到中间人攻击
2. 维护风险：如果 NBS 修复了证书问题，这段代码会静默继续工作，但留下技术债务

**建议**：添加注释说明原因（如 `# NBS V2 API 证书链不完整，临时禁用验证`），并在注释中标记 TODO 后续跟进。

**优先级**：🟡 中 — 功能正常，但建议加注释说明。

---

### ⚠️ 问题 3：巨潮 `_extract_stock_code` 对公司名关键词返回 None

**位置**：`scripts/sources/juchao.py` 第 77-91 行

**现状**：如果用户关键词是公司名（如"万科"而非"000002"），`_extract_stock_code` 返回 None，该关键词被跳过。

**设计意图**：注释说明"非代码关键词→暂返回 None，由 AI 层处理"。但 Phase 2 的巨潮采集层直接跳过，不会进入 AI 层。

**分析**：这是设计上的折中——巨潮接口需要股票代码，无法直接用公司名查询。用户需要输入代码而非公司名。这在 DEVELOPMENT_PLAN.md 的验证标准中也是用 `000002` 而非"万科"作为关键词。

**建议**：在关键词输入界面或文档中提示用户：巨潮监控需要输入 6 位股票代码。

**优先级**：🟢 低 — 符合当前设计，但建议后续加提示。

---

## 五、设计一致性检查

| 设计文档章节 | 实现状态 | 备注 |
|-------------|---------|------|
| 3.1 统一采集函数签名 | ✅ | `collect(keywords, watermark) -> (items, new_watermark)` |
| 3.2 SEC EDGAR 接入 | ✅ | 全部实现 |
| 3.3 FRED 接入 | ✅ | 全部实现 |
| 3.4 NBS 接入 | ✅ | V2 API 适配 |
| 3.5 巨潮接入 | ✅ | 全部实现 |
| 3.6 财联社接入 | ✅ | 全部实现 |
| 3.7 东财接入 | ✅ | 全部实现 |
| 4.1 Prisma Schema | ✅ | 无变更 |

---

## 六、代码质量评价

| 维度 | 评分 | 说明 |
|------|------|------|
| 结构清晰度 | ⭐⭐⭐⭐⭐ | 每个信源独立文件，函数职责单一 |
| 错误处理 | ⭐⭐⭐⭐⭐ | try/except 包裹，错误信息完整，水位线不丢失 |
| 缓存机制 | ⭐⭐⭐⭐⭐ | ticker 映射、series ID、指标搜索均有持久化缓存 |
| 频率控制 | ⭐⭐⭐⭐⭐ | 各信源按设计文档要求控制请求间隔 |
| 水位线设计 | ⭐⭐⭐⭐⭐ | 每个信源/每只股票/每个指标独立维护 |
| 类型安全 | ⭐⭐⭐⭐⭐ | Python 类型注解完整 |
| 与 Node 桥接 | ⭐⭐⭐⭐☆ | 管道通畅，但 hotspotChecker 未接入（Phase 4 处理） |

---

## 七、下一步建议

1. **Phase 3（AI 层）**：需要 DeepSeek API Key，替换 `sk-xxx`
2. **Phase 4（筛选链路串联）**：必须将 `collectFromSourceStub` 替换为真实的 `collectFromSource`，并接入 SourceWatermark 读写
3. **可选优化**：NBS SSL 验证注释、巨潮关键词输入提示
