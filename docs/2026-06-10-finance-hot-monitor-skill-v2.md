# Finance Hot Monitor Skill 设计文档（最优方案）

> **版本**: v2.0 — 基于对项目全部源码的深度审查，推翻 v1.0 方案，采用零新增代码策略
> **日期**: 2026-06-10
> **核心原则**: 复用已有 collector.py，SKILL.md 是唯一新增物

---

## 一、v1.0 方案问题回顾

| 问题 | 说明 |
|------|------|
| 目录结构错误 | 放在 `skills/` 而非 `.trae/skills/`，不符合 TRAE skill 标准 |
| 过度工程化 | 新增 4 个 Python 脚本，但 collector.py 已提供完全统一的 CLI |
| sys.path 脆弱 | 4 层 parent traversal，跨平台风险高，且 collector.py 运行时天然可导入 sources |
| generate_report.py 多余 | Agent 自身能将 JSON 格式化为 Markdown，不需要 Python 脚本代劳 |
| analysis-guide.md 过度 | 8 维度 JSON schema 是为 DeepSeek API 设计的刚性约束，不适用于前沿模型 |
| 缺少关键信息 | 未包含 A 股代码映射、关键词类型检测、搜索策略路由等 Agent 必需知识 |

---

## 二、最优方案架构

### 设计哲学

**Agent 是编排器，不是终端用户。** 不需要 Python 脚本替 Agent 编排流程，只需要告诉 Agent：
1. 有什么数据源、各自搜什么
2. 怎么调用 collector.py
3. 关键词怎么写才对
4. 拿到数据后怎么分析

### 架构对比

```
v1.0 方案（8 个新文件）:
skills/finance-hot-monitor/
├── SKILL.md
├── scripts/
│   ├── search_news.py          ← 多余，collector.py 已有
│   ├── search_announcements.py ← 多余，collector.py 已有
│   ├── search_macro.py         ← 多余，collector.py 已有
│   ├── generate_report.py      ← 多余，Agent 自己能做
│   └── requirements.txt        ← 多余，复用 scripts/requirements.txt
└── references/
    ├── analysis-guide.md       ← 过度，精简后融入 SKILL.md
    └── search-sources.md       ← 过度，精简后融入 SKILL.md

v2.0 方案（1 个新文件）:
.trae/skills/finance-hot-monitor/
└── SKILL.md                    ← 唯一新增物，包含全部指令
```

### 数据流

```
用户提问 → Agent 读取 SKILL.md → Agent 自主决定搜哪些源
    → Agent 执行: python scripts/collector.py --source xxx ...
    → collector.py 调用 sources/xxx.py → 返回 JSON
    → Agent 解读 JSON → 用自身 AI 能力分析 → 输出结果给用户
```

### 与 Web 应用的关系

| 维度 | Web 应用 | Skill 模式 |
|------|---------|-----------|
| 数据采集 | collector.py（Node child_process 调用） | collector.py（Agent 直接执行） |
| AI 分析 | DeepSeek API（8 维度 schema） | Agent 自身 AI 能力（自然语言分析） |
| 搜索策略 | ai.ts → DeepSeek API 路由 | Agent 自主判断（SKILL.md 提供指导） |
| 关键词扩展 | ai.ts → DeepSeek API 扩展 | Agent 自主扩展（SKILL.md 提供映射表） |
| 数据存储 | SQLite + Prisma | 无持久化，JSON stdout |
| 定时调度 | node-cron | Agent 按需触发 |

---

## 三、SKILL.md 完整内容设计

### 3.1 YAML Front Matter

```yaml
---
name: finance-hot-monitor
description: >
  Search financial news, stock announcements, and macro indicators across 6
  authoritative sources (Cailianshe, Eastmoney, Juchao, SEC EDGAR, FRED, NBS).
  Invoke when user asks about financial hotspots, stock filings, macro data,
  market trends, A-share announcements, US SEC filings, economic indicators,
  or any request to search/discover financial events and market data.
---
```

### 3.2 Markdown 正文结构

#### 第一部分：Quick Start

```markdown
## Quick Start

### 前置条件
- Python 3.10+ 已安装
- 在项目根目录执行: `pip install -r scripts/requirements.txt`
- FRED 数据源需要设置环境变量: `FRED_API_KEY=xxx`（从 https://fred.stlouisfed.org/ 免费申请）
- SEC EDGAR 在国内网络可能需要设置: `HTTPS_PROXY=xxx`

### 30 秒上手
```bash
# 搜 A 股快讯
python scripts/collector.py --source cailianshe --keywords '["A股"]' --watermark '{}' --mode search --date-range 7d

# 搜万科公告
python scripts/collector.py --source juchao --keywords '["000002"]' --watermark '{}' --mode search --date-range 30d

# 搜美股公告
python scripts/collector.py --source sec_edgar --keywords '["AAPL"]' --watermark '{}' --mode search --date-range 30d

# 搜宏观数据
python scripts/collector.py --source fred --keywords '["CPI"]' --watermark '{}' --mode search --date-range 90d
```
```

#### 第二部分：数据源速查表

```markdown
## 数据源速查表

| 源 ID | 名称 | 类型 | 搜什么 | API Key | 速率 |
|-------|------|------|--------|---------|------|
| cailianshe | 财联社 | 快讯 | A 股实时财经电报 | 无 | 50条/次 |
| eastmoney | 东财全球 | 快讯 | 7×24 全球财经快讯 | 无 | 50条/次 |
| juchao | 巨潮资讯 | 公告 | A 股上市公司公告 | 无 | 30条/次 |
| sec_edgar | SEC EDGAR | 公告 | 美股上市公司公告 | 无（需代理） | 50条/次 |
| fred | FRED | 宏观 | 美国宏观经济指标 | FRED_API_KEY | 5条/关键词 |
| nbs | 国家统计局 | 宏观 | 中国宏观经济指标 | 无 | 5条/关键词 |

### 各源详细说明

**cailianshe（财联社）**
- 全量拉取最近快讯，不支持关键词过滤（关键词匹配由你在拿到数据后做）
- 输出字段: title, content, url, source, sourceType(news), publishedAt, extraData(teleId, ctime)

**eastmoney（东财全球）**
- 全量拉取最近快讯，不支持关键词过滤
- 输出字段: title, content, url, source, sourceType(news), publishedAt, extraData(newsId, showTime)

**juchao（巨潮资讯）**
- 支持 6 位 A 股代码精确搜索，也支持公司名全文搜索
- 代码搜索更精准；公司名搜索可能返回不相关公司的公告
- 输出字段: title, content, url, source, sourceType(announcement), publishedAt, extraData(stockCode, announcementType, announcementId)

**sec_edgar（SEC EDGAR）**
- 仅支持美股 ticker（1-5 位纯字母，如 AAPL、MSFT）
- 首次使用会自动下载 company_tickers.json 缓存到 data/ 目录
- 只返回关注类型的公告: 8-K, 10-Q, 10-K, 13F-HR, SC 13D/G, S-1 等
- 输出字段: title, content, url, source, sourceType(announcement), publishedAt, extraData(ticker, cik, form, priority, accessionNumber)

**fred（FRED）**
- 需要环境变量 FRED_API_KEY
- 关键词会自动映射到 FRED Series ID（如 CPI→CPIAUCSL），映射结果缓存到 data/fred_series_cache.json
- 输出字段: title, content, url, source, sourceType(macro_data), publishedAt, extraData(seriesId, seriesName, latestDate, latestValue, changePercent)

**nbs（国家统计局）**
- 关键词会自动映射到 NBS 指标 ID，映射结果缓存到 data/nbs_search_cache.json
- 优先返回全国月度数据
- 输出字段: title, content, url, source, sourceType(macro_data), publishedAt, extraData(indicatorCode, indicatorName, latestDate, latestValue, changePercent)
```

#### 第三部分：collector.py 完整调用方法

```markdown
## collector.py 调用方法

### 基本格式
```bash
python scripts/collector.py \
  --source <源ID> \
  --keywords '<JSON数组>' \
  --watermark '{}' \
  --mode search \
  --date-range <时间范围>
```

### 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| --source | 是 | 数据源 ID: cailianshe / eastmoney / juchao / sec_edgar / fred / nbs |
| --keywords | 是 | JSON 数组格式的关键词列表，如 '["000002", "万科"]' |
| --watermark | 否 | 水位线 JSON，搜索模式传 '{}' 即可 |
| --mode | 否 | 运行模式: search（搜索，默认）或 monitor（监控增量） |
| --date-range | 否 | 时间范围: 7d / 30d / 90d / all（默认 30d） |

### 输出格式
JSON 对象输出到 stdout:
```json
{
  "items": [
    {
      "title": "标题",
      "content": "内容",
      "url": "链接",
      "source": "源ID",
      "sourceType": "news|announcement|macro_data",
      "publishedAt": "ISO时间",
      "extraData": {}
    }
  ],
  "watermark": {}
}
```
错误信息输出到 stderr，items 为空数组表示无结果。

### 多源搜索
collector.py 一次只搜一个源。要搜多个源，依次执行多次:
```bash
python scripts/collector.py --source cailianshe --keywords '["A股"]' --watermark '{}' --mode search --date-range 7d
python scripts/collector.py --source eastmoney --keywords '["A股"]' --watermark '{}' --mode search --date-range 7d
```
```

#### 第四部分：关键词技巧

```markdown
## 关键词技巧（极其重要）

### A 股公司 → 必须用 6 位股票代码
巨潮资讯用公司名搜索会返回不相关公司的公告，必须用代码:
- 万科A → 000002
- 贵州茅台 → 600519
- 宁德时代 → 300750
- 比亚迪 → 002594

### 常用 A 股代码速查表
| 公司 | 代码 | 公司 | 代码 |
|------|------|------|------|
| 贵州茅台 | 600519 | 寒武纪 | 688256 |
| 万科A | 000002 | 宁德时代 | 300750 |
| 比亚迪 | 002594 | 招商银行 | 600036 |
| 中国平安 | 601318 | 五粮液 | 000858 |
| 美的集团 | 000333 | 格力电器 | 000651 |
| 恒瑞医药 | 600276 | 药明康德 | 603259 |
| 中芯国际 | 688981 | 海康威视 | 002415 |
| 隆基绿能 | 601012 | 中国中免 | 601888 |
| 迈瑞医疗 | 300760 | 顺丰控股 | 002352 |
| 伊利股份 | 600887 | 海天味业 | 603288 |
| 牧原股份 | 002714 | 中国神华 | 601088 |
| 紫金矿业 | 601899 | 长江电力 | 600900 |
| 中兴通讯 | 000063 | 立讯精密 | 002475 |
| 工业富联 | 601138 | 韦尔股份 | 603501 |
| 北方华创 | 002371 | 金山办公 | 688111 |
| 中微公司 | 688012 | 科大讯飞 | 002230 |
| 阳光电源 | 300274 | 三一重工 | 600031 |
| 海尔智家 | 600690 | | |

如果用户提到的公司不在表中，推断最可能的 6 位代码。

### 美股公司 → 用 ticker
- 苹果 → AAPL
- 微软 → MSFT
- 特斯拉 → TSLA
- 英伟达 → NVDA

### 宏观指标 → 用标准名称
- CPI / PPI / GDP / PMI / 失业率 / M2 / LPR
- FRED 源会自动将关键词映射到 Series ID（如 CPI → CPIAUCSL）
- NBS 源会自动将关键词映射到指标 ID

### 关键词类型判断规则
根据用户查询判断关键词类型，选择正确的数据源:
- **股票代码**（6位数字/纯字母ticker）→ juchao 或 sec_edgar
- **公司名**（含集团/股份/科技等后缀）→ 先转代码，再搜 juchao 或 sec_edgar
- **板块/概念**（新能源/半导体/AI等）→ cailianshe + eastmoney（快讯源可能提及）
- **宏观指标**（CPI/GDP/利率等）→ fred + nbs
- **政策/监管**（含政策/监管/央行等）→ cailianshe + eastmoney
- **泛查询**（如"最近金融热点"）→ cailianshe + eastmoney
```

#### 第五部分：搜索策略指导

```markdown
## 搜索策略指导

### 按查询意图选择数据源

| 用户意图 | 推荐源 | 关键词示例 |
|---------|--------|-----------|
| "万科最近有什么公告" | juchao | ["000002"] |
| "苹果最新财报" | sec_edgar | ["AAPL"] |
| "最近A股市场动态" | cailianshe, eastmoney | ["A股"] |
| "CPI数据怎么样" | fred, nbs | ["CPI"] |
| "新能源板块有什么消息" | cailianshe, eastmoney | ["新能源"] |
| "美联储加息" | fred, cailianshe | ["美联储", "利率"] |
| "帮我查一下招商银行和万科的公告" | juchao | ["600036", "000002"] |

### 搜索流程
1. 理解用户意图，判断查询类型
2. 如果涉及 A 股公司名，先转换为 6 位代码
3. 选择合适的数据源（1-3 个通常足够）
4. 依次执行 collector.py 搜索
5. 汇总结果，用你的 AI 能力分析内容
6. 向用户呈现分析结果

### 注意事项
- 快讯源（cailianshe/eastmoney）是全量拉取，不支持关键词过滤。拿到数据后你需要自行筛选与用户查询相关的条目
- 公告源（juchao/sec_edgar）支持关键词搜索，结果更精准
- 宏观源（fred/nbs）按指标搜索，返回时间序列数据
- 每次搜索建议设置合理的 date-range，避免返回过多数据
```

#### 第六部分：分析框架

```markdown
## 分析框架

拿到搜索结果后，请遵循以下原则分析:

1. **相关性优先**: 先判断内容是否与用户查询直接相关，过滤掉无关条目
2. **重要性分级**:
   - 高: 明显影响投资决策（并购、高管变更、业绩暴雷、监管处罚、货币政策变化）
   - 中: 需要关注但不一定立即行动（定期财报、行业政策、再融资）
   - 低: 了解即可（例行公告、历史回顾）
3. **宏观数据重点**: 关注变化方向、幅度、与历史对比
4. **公告重点**: 8-K/6-K 等重大事件公告优先；定期财报关注与上期差异
5. **跨源去重**: 同一事件可能被多个源报道，合并为一条

### 过滤阈值（参考）
- 非实质内容且与查询无关 → 丢弃
- 相关性极低（仅同行业但无直接关联） → 丢弃
- 未提及关键词但存在传导链关联 → 保留但标注间接相关
```

#### 第七部分：输出格式建议

```markdown
## 输出格式建议

根据用户查询类型，选择最合适的呈现方式:

### 快讯类查询
按时间倒序，每条包含: 标题、来源、时间、核心内容（1-2 句）、原文链接

### 公告类查询
按重要性排序，每条包含: 公司名、公告类型、关键信息、日期、链接
重大公告（8-K/6-K/SC 13D 等）用醒目标记

### 宏观数据查询
表格形式: 指标名、最新值、环比变化、数据日期
附上简要解读

### 综合查询
分板块呈现: 重大公告 → 财经快讯 → 宏观数据
开头给出 2-3 句总结
```

---

## 四、文件清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 创建 | `.trae/skills/finance-hot-monitor/SKILL.md` | 唯一新增文件 |

无需创建任何 Python 脚本、requirements.txt 或 reference 文档。

---

## 五、与 v1.0 方案的完整对比

| 维度 | v1.0 方案 | v2.0 最优方案 |
|------|----------|-------------|
| 新增文件数 | 8 | 1 |
| 新增 Python 代码 | ~300 行 | 0 |
| 维护负担 | 4 脚本需与 collector.py 同步 | 零 |
| sys.path 风险 | 有（4 层 parent） | 无 |
| 数据一致性 | 间接（通过 sys.path 导入） | 直接（用同一 collector.py） |
| Agent 自主性 | 低（脚本规定了流程） | 高（Agent 自主编排） |
| 跨平台兼容 | 弱（路径依赖） | 强（collector.py 已处理） |
| 信息完整度 | 缺少代码映射和策略指导 | 完整 |
| 可扩展性 | 新增源需改脚本 | 新增源只需更新 SKILL.md |

---

## 六、实施步骤

1. 创建目录: `.trae/skills/finance-hot-monitor/`
2. 创建 `SKILL.md`，内容为上述第三部分的完整 Markdown
3. 验证: 在 TRAE 中测试 Agent 是否能识别并正确调用 skill
4. 验证: 在 Claude Code 中测试（将 SKILL.md 内容作为项目指令）
