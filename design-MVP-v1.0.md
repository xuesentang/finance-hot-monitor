# 金融热点监控工具 — 技术实现方案 v1.0

> 基于 [PRD-MVP](./PRD-MVP.md) 和 [信息筛选机制设计 v4](./信息筛选机制设计（4）.md)。
> 本文档定义 MVP 第一期的完整技术实现方案，不涉及编码细节。
>
> **搜索功能状态**：搜索功能曾实现（代码仍在 `SearchPage.tsx`、`SearchResultCard.tsx`、`search.ts` 等文件中），但因效果不佳已阶段性放弃。前端入口已封禁（import/路由/API/类型定义均已注释隔离），后端路由也已注释。用户界面仅保留监控功能（热点+关键词）。后续如需恢复，取消注释即可。

---

## 一、项目目录结构

```
D:\finance-hot-monitor\
├── server/                    # Node.js 后端（复用 yupi-hot-monitor 骨架）
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts       # 测试配置
│   ├── prisma/
│   │   └── schema.prisma      # 数据模型（重写）
│   └── src/
│       ├── index.ts            # Express + Socket.io 入口
│       ├── db.ts               # Prisma 客户端
│       ├── types.ts            # TypeScript 类型定义
│       ├── routes/
│       │   ├── keywords.ts     # 关键词 CRUD
│       │   ├── hotspots.ts     # 热点查询、筛选
│       │   ├── notifications.ts# 通知查询
│       │   └── search.ts       # [已隔离] 搜索路由，import 已注释
│       ├── services/
│       │   ├── ai.ts           # DeepSeek API 调用（重写）
│       │   ├── collector.ts    # 调用 Python 采集脚本
│       │   └── search.ts       # [已隔离] 搜索服务，import 已注释
│       ├── jobs/
│       │   └── hotspotChecker.ts # 定时任务：采集→筛选→入库→推送
│       ├── config/
│       │   ├── sources.ts      # 信源配置
│       │   └── stockCodes.ts   # 股票代码映射
│       └── utils/
│           ├── filter.ts       # 阈值过滤规则
│           └── sortHotspots.ts # 热点排序
│
├── client/                    # React 前端（复用 yupi-hot-monitor 骨架）
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx             # 路由配置（仅 hotspots + keywords）
│       ├── pages/
│       │   ├── KeywordsPage.tsx  # 关键词管理
│       │   ├── HotspotsPage.tsx  # 热点列表
│       │   └── SearchPage.tsx    # [已隔离] 搜索页面，import 已注释
│       ├── components/
│       │   ├── HotspotCard.tsx   # 热点详情卡片
│       │   ├── FilterBar.tsx     # 筛选条件栏
│       │   └── SearchResultCard.tsx # [已隔离] 搜索结果卡片，import 已注释
│       ├── services/
│       │   ├── api.ts           # REST API 调用（searchApi 已注释隔离）
│       │   └── socket.ts        # WebSocket 客户端
│       └── types/
│           └── index.ts         # 类型定义（搜索相关类型已注释隔离）
│
├── scripts/                   # Python 数据采集脚本
│   ├── requirements.txt
│   ├── collector.py           # 采集入口，命令行调度
│   ├── sources/
│   │   ├── sec_edgar.py       # SEC EDGAR 采集
│   │   ├── fred.py            # FRED 采集
│   │   ├── nbs.py             # 国家统计局采集
│   │   ├── juchao.py          # 巨潮公告采集
│   │   ├── cailianshe.py      # 财联社快讯采集
│   │   └── eastmoney.py       # 东财全球资讯采集
│   └── utils/
│       ├── rate_limiter.py    # 频率控制
│       └── watermark.py       # 水位线持久化
│
├── fhot-venv/                 # Python 虚拟环境（gitignore）
│
├── data/                      # 运行时数据（gitignore）
│   └── company_tickers.json   # SEC ticker→CIK 映射缓存（自动拉取）
│
├── PRD-MVP.md
├── 信息筛选机制设计（4）.md
├── design-MVP-v1.0.md         # 本文件
└── SESSION_STATE.md
```

---

## 二、技术栈

### 后端
| 组件 | 选型 | 来源 |
|------|------|------|
| 运行时 | Node.js + TypeScript | 继承 yupi-hot-monitor |
| Web 框架 | Express 5 | 继承 |
| ORM | Prisma 6 + SQLite | 继承 |
| WebSocket | Socket.io 4 | 继承 |
| 定时任务 | node-cron | 继承 |
| AI 模型 | DeepSeek-V4-Flash（直调 HTTP API） | 替换 OpenRouter |

### 前端
| 组件 | 选型 | 来源 |
|------|------|------|
| 框架 | React 19 + TypeScript | 继承 yupi-hot-monitor |
| 构建 | Vite 5 | 继承 |
| 样式 | Tailwind CSS v4 | 继承 |
| UI 风格 | **暗色金融科技风**（Dark Fintech） | 参考 Borea AI + Krypcore Dashboard 重新设计 |

**设计特征**：
- 深色基底 `#0B0E14` + 紫→粉→橙渐变强调色体系
- 左侧深色侧边栏导航（参考 Krypcore Dashboard）
- 字体：Space Grotesk（标题）+ DM Sans（正文）+ JetBrains Mono（数字）
- 玻璃拟态卡片：半透明深色底 + 渐变顶部线 + hover 发光效果
- 丰富的微动效：stagger 入场、slideIn 新热点、hover 上浮、glow、float 空状态、shimmer 加载

### 数据采集
| 组件 | 选型 | 说明 |
|------|------|------|
| 语言 | Python 3 | 金融数据生态最好，a-stock-data Skill 全部是 Python |
| 虚拟环境 | `fhot-venv` | 项目根目录下，隔离依赖 |
| HTTP 库 | requests | 所有信源均为 HTTP 直连 |
| TCP 行情 | mootdx | 仅后续行情验证层需要，MVP 暂不用 |

### 通信方式

```
┌─────────────┐   REST API     ┌──────────────┐   HTTP API    ┌─────────────┐
│   React 前端  │ ←──────────→ │  Express 后端  │ ←─────────── │ DeepSeek AI │
│  (Vite)      │  WebSocket    │  (Prisma+WS)  │              │ (Flash)     │
└─────────────┘               └──────┬───────┘              └─────────────┘
                                     │
                                     │ child_process (stdout JSON)
                                     ▼
                              ┌──────────────┐
                              │  Python 脚本   │
                              │  (collector)  │
                              └──────┬───────┘
                                     │ HTTP requests
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
        SEC EDGAR / FRED      巨潮 / 财联社 / 东财      NBS 统计局
        (美股公告+宏观)         (A股公告+快讯)          (中国宏观)
```

Node 后端通过 `child_process.spawn` 调用 Python 采集脚本（使用 `fhot-venv` 虚拟环境中的 Python 解释器），Python 脚本输出 JSON 到 stdout，Node 解析后进入筛选链路。

**为什么用 child_process 而不是 HTTP 微服务？** MVP 阶段部署简单——一个进程启动前后端，Python 脚本作为子进程按需调用，不需要额外的进程管理和端口分配。

---

## 三、信源接入方案

### 3.1 架构说明

每个信源对应一个 Python 文件（`scripts/sources/<name>.py`），暴露统一的采集函数签名：

```python
def collect(watermark: dict) -> list[dict]:
    """
    采集新内容。
    watermark: 该信源的水位线信息（last_timestamp / last_id 等）
    返回: RawContent 列表，每个元素为 {title, content, url, source, publishedAt, sourceType}
    """
```

采集入口 `scripts/collector.py` 接收命令行参数（信源名 + 关键词列表），路由到对应的采集函数，输出 JSON 到 stdout。

### 3.2 SEC EDGAR（美股公告）

| 项目 | 内容 |
|------|------|
| 端点 | `https://data.sec.gov/submissions/CIK{cik}.json` |
| 方法 | GET |
| 认证 | 无，需 User-Agent（格式：`Name email@domain.com`） |
| 频率 | 每 10 分钟，≤10 req/s |
| 水位线 | 维护每个 CIK 的 `lastFilingDate`，只返回 filingDate > lastFilingDate 的新文件 |
| 关键词映射 | 用户关键词（如 `AAPL`）→ CIK 编码（如 `0000320193`），需维护 `关键词→CIK` 映射表 |

**采集逻辑**：
1. 关键词 → CIK 映射查询
2. 调用 submissions API 获取 filing 列表
3. 过滤 filing 类型：保留 8-K/13F/6-K/10-Q/10-K/8-K/A/S-1/DEF 14A
4. 对 P0/P1 优先级文件拉取详情文本
5. 返回结构化数据

**filing 类型优先级**（来自信息筛选设计 v4）：
- P0：8-K（重大事件即时披露）
- P1：13F、6-K、10-Q、10-K、8-K/A、S-1
- P2：DEF 14A、424B

### 3.3 FRED（美国宏观）

| 项目 | 内容 |
|------|------|
| 端点 | `https://api.stlouisfed.org/fred/series/observations?series_id={id}&api_key={key}&file_type=json` |
| 方法 | GET |
| 认证 | API Key（免费申请） |
| 频率 | 每 1 小时，≤60 次/时 |
| 水位线 | 维护每个 Series ID 的 `lastObservationDate`，只返回 date > lastObservationDate 的新观测 |
| 关键词映射 | 用户关键词 → FRED Series ID（如 `CPI` → `CPIAUCSL`），需维护映射表 |

**宏观数据特殊处理**：
- 不走新鲜度过滤，走数据变更检测
- 获取最新 observation 后，与上次记录的 `lastObservationDate` 比较
- 日期相同 → 数据未更新，不触发
- 日期更新 → 取最新值，计算与上一期的环比变化，返回结构化数据（含前值、现值、变化幅度）

### 3.4 国家统计局 NBS（中国宏观）

| 项目 | 内容 |
|------|------|
| 端点 | `https://data.stats.gov.cn/easyquery.htm` |
| 方法 | POST |
| 认证 | 无，需 User-Agent |
| 频率 | 每 1 小时 |
| 水位线 | 同 FRED，维护指标代码的 `lastObservationDate` |
| 关键词映射 | 用户关键词 → 指标代码（如 `CPI` → `A01010B`），需维护映射表 |

参考 `cn-stats` 库的实现（已安装在本地），核心调用代码 ~20 行。

**注意**：NBS 指标代码约每 5 年更换一次基准。MVP 通过 `getTree` 端点动态拉取最新指标树来查找代码，不硬编码。

### 3.5 巨潮公告（A 股公告）

| 项目 | 内容 |
|------|------|
| 端点 | `https://www.cninfo.com.cn/new/hisAnnouncement/query` |
| 方法 | POST |
| 认证 | 无 |
| 频率 | 每 10 分钟 |
| 水位线 | 维护每只股票的 `lastAnnouncementId` |
| 代码参考 | a-stock-data Skill — `cninfo_announcements()` |

**例行公告过滤**（采集层直接过滤，不进 AI）：
- 董事会决议、股东大会通知、监事会决议、独立董事意见
- 预约披露时间提醒

### 3.6 财联社快讯（A 股快讯）

| 项目 | 内容 |
|------|------|
| 端点 | `https://www.cls.cn/nodeapi/telegraphList` |
| 方法 | GET |
| 认证 | 无 |
| 频率 | 每 2 分钟 |
| 水位线 | 维护 `lastTimestamp`，只返回时间戳更大的内容 |
| 代码参考 | a-stock-data Skill — `cls_telegraph()` |

### 3.7 东财全球资讯（A 股快讯）

| 项目 | 内容 |
|------|------|
| 端点 | `https://np-weblist.eastmoney.com/comm/web/getFastNewsList` |
| 方法 | GET |
| 认证 | 无 |
| 频率 | 每 2 分钟 |
| 水位线 | 维护 `lastTimestamp` |
| 代码参考 | a-stock-data Skill — `eastmoney_global_news()` |

**注意**：需要 `req_trace` 参数（uuid），a-stock-data V3.1 已修复此问题。

---

## 四、数据模型

### 4.1 Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Keyword {
  id        String    @id @default(uuid())
  text      String    @unique
  type      String    @default("generic")  // stock_code / stock_name / sector / macro / policy / generic
  isActive  Boolean   @default(true)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  hotspots  Hotspot[]
}

model Hotspot {
  id                String    @id @default(uuid())
  title             String
  content           String                        // 原始内容全文
  url               String
  source            String                        // sec_edgar / juchao / cailianshe / eastmoney / fred / nbs
  sourceType        String                        // announcement / news / macro_data

  // AI 分析结果
  eventType         String                        // 事件类型枚举值
  isSubstantial     Boolean
  relevance         Int                           // 0-100
  relevanceReason   String?
  keywordMentioned  Boolean
  importance        String                        // low / medium / high
  importanceReason  String?
  summary           String?                       // AI 生成的一句话摘要
  affectedHoldings  Boolean
  eventFingerprint  String?                       // AI 生成的事件指纹

  // 去重与聚合
  relatedSources    String?                       // JSON 数组，相关信源列表
  isPrimary         Boolean   @default(true)

  // 时间
  publishedAt       DateTime?
  createdAt         DateTime  @default(now())

  // 关联
  keywordId         String
  keyword           Keyword   @relation(fields: [keywordId], references: [id], onDelete: Cascade)
  notifications     Notification[]

  @@unique([url, source])
  @@index([keywordId])
  @@index([eventFingerprint])
  @@index([publishedAt])
}

model Notification {
  id        String    @id @default(uuid())
  type      String    @default("hotspot")
  title     String
  content   String?
  isRead    Boolean   @default(false)
  createdAt DateTime  @default(now())

  hotspotId String
  hotspot   Hotspot   @relation(fields: [hotspotId], references: [id], onDelete: Cascade)

  @@index([createdAt])
}

model SourceWatermark {
  id            String    @id @default(uuid())
  source        String    @unique
  lastId        String?
  lastTimestamp Int?
  extraData     String?                        // JSON，额外数据（如 CIK→lastFilingDate 映射）
  updatedAt     DateTime  @updatedAt
}

model MacroObservation {
  id         String    @id @default(uuid())
  seriesId   String    @unique               // FRED Series ID 或 NBS 指标代码
  lastDate   String                          // 最新 observation 的 date
  lastValue  Float?                         // 最新值
  updatedAt  DateTime  @updatedAt
}
```

### 4.2 Hotspot.source 枚举

| 值 | 含义 |
|----|------|
| `sec_edgar` | SEC EDGAR 公告 |
| `juchao` | 巨潮资讯公告 |
| `cailianshe` | 财联社快讯 |
| `eastmoney` | 东财全球资讯 |
| `fred` | FRED 宏观数据 |
| `nbs` | 国家统计局宏观数据 |

### 4.3 Hotspot.sourceType 枚举

| 值 | 含义 |
|----|------|
| `announcement` | 公告类（SEC EDGAR / 巨潮） |
| `news` | 快讯类（财联社 / 东财） |
| `macro_data` | 宏观数据类（FRED / NBS） |

---

## 五、六层筛选链路实现

### 5.1 第0层：信源采集

**实现位置**：`scripts/collector.py` + `scripts/sources/*.py`

Node 定时任务 `hotspotChecker.ts` 对每个活跃关键词调用 Python 采集脚本：

```typescript
// server/src/services/collector.ts
import { spawn } from 'child_process';

async function collectFromSource(
  source: string, 
  keywords: string[], 
  watermark: object
): Promise<RawContent[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [
      'scripts/collector.py',
      '--source', source,
      '--keywords', JSON.stringify(keywords),
      '--watermark', JSON.stringify(watermark)
    ]);
    
    let stdout = '';
    proc.stdout.on('data', (data) => { stdout += data; });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(JSON.parse(stdout));
      } else {
        reject(new Error(`collector exited with code ${code}`));
      }
    });
  });
}
```

Python 采集脚本的调度由 `collector.py` 统一管理：解析命令行参数 → 路由到对应采集函数 → 输出 JSON。

### 5.2 第1层：信源内过滤

**实现位置**：在各 Python 采集函数内部完成

- **公告类**：例行公告黑名单过滤。黑名单配置放在 `scripts/sources/juchao.py` 和 `scripts/sources/sec_edgar.py` 的常量中
- **快讯类**：时间戳水位线去重。水位线存储在 `SourceWatermark` 数据库表，Node 通过 `collector.ts` 传给 Python 脚本作为参数，采集完成后 Python 返回新水位线，Node 写回数据库
- **宏观类**：`MacroObservation` 表记录每个指标的最新 observation date，采集时对比

### 5.3 第2层：关键词匹配

**实现位置**：`server/src/services/ai.ts` — Query Expansion + 预匹配

**Query Expansion**：
1. 调用 DeepSeek-V4-Flash 生成扩展关键词
2. 本地缓存（Map），同一关键词不重复调用
3. 按关键词类型区分扩展策略（代码→公司名+简称 / 板块→成分股等）

**板块成分股获取**：
- 成分股扩展在 Python 采集脚本中完成，复用 a-stock-data Skill 的 `baidu_concept_blocks()` 端点
- 采集脚本输出的每条内容附加 `expandedTerms` 字段（已包含成分股代码/名称），Node 侧直接用于预匹配
- 结果缓存 7 天（成分股每季度调整）

**预匹配**：扩展词列表在全文文本中做子串匹配，结果传给 AI。

**关键词子集检测**：检查当前关键词是否与已处理关键词存在子集/超集关系，避免重复分析。实现为内存 Map。

### 5.4 第3层：AI 智能分析

**实现位置**：`server/src/services/ai.ts`

**API 调用**：
- 模型：`deepseek-chat`（DeepSeek-V4-Flash）
- Endpoint：`https://api.deepseek.com/chat/completions`
- 认证：Bearer Token（环境变量 `DEEPSEEK_API_KEY`）
- temperature：0.2，maxTokens：800

**Prompt 设计**：使用信息筛选设计 v4 中的完整 Prompt（含事件分类、实质判断、相关性评分、重要性分级、摘要、事件指纹生成）。

**输出解析**：正则提取 JSON 块 → `JSON.parse` → 字段校验（relevance 钳位 0-100，importance 校验枚举值）。

**并发控制**：batchSize = 3，每批并行，批次间串行（继承原项目设计）。

**Fallback**：API 不可用时，预匹配命中的给 relevance 40（刚好过阈值）、importance low——通过过滤入库但不推送，用户可在热点列表中查看；未命中的给 relevance 10、importance low，过滤丢弃。AI 连续失败 3 次后，前端显示「AI 分析服务异常」警告条。不中断整体采集流程。

### 5.5 第4层：阈值过滤

**实现位置**：`server/src/utils/filter.ts`

四层规则函数，按顺序判断，任一不通过即返回 false：

```typescript
function shouldFilter(item: RawContent, analysis: AIAnalysis): { pass: boolean; reason: string } {
  if (!analysis.isSubstantial) return { pass: false, reason: 'not-substantial' };
  if (analysis.relevance < 40) return { pass: false, reason: 'low-relevance' };
  if (!analysis.keywordMentioned && analysis.relevance < 60) return { pass: false, reason: 'not-mentioned-low-relevance' };
  if (analysis.importance === 'low' && item.sourceType === 'news') return { pass: false, reason: 'low-importance-news' };
  return { pass: true, reason: 'ok' };
}
```

### 5.6 第5层：跨源去重

**实现位置**：`server/src/jobs/hotspotChecker.ts` — 入库前检查

1. 用 AI 生成的 `eventFingerprint` 查数据库（30 分钟内已入库的同指纹记录）
2. 存在 → 更新已有记录的 `relatedSources` 列表，不新建
3. 不存在 → 新建记录，标记 `isPrimary = true`
4. 主源选择逻辑：按 SOURCE_AUTHORITY 排序，取最低值（最高权威）

```typescript
const SOURCE_AUTHORITY: Record<string, number> = {
  sec_edgar: 1, juchao: 2, cailianshe: 3, eastmoney: 4, fred: 5, nbs: 6
};
```

### 5.7 第6层：推送决策

**实现位置**：`server/src/jobs/hotspotChecker.ts` — 入库后

| importance | 动作 |
|-----------|------|
| high | `io.emit('hotspot:new', hotspot)` |
| medium | `io.emit('hotspot:new', hotspot)` |
| low | 不推送，仅入库 |

**防重复推送**：内存 Map 记录 30 分钟内已推送的 `eventFingerprint`，相同指纹跳过。

**配额控制**：每关键词每轮次，每个信源最多 5 条进入 AI 分析，总额 30 条。

**配额排序**（对 v4 鸡生蛋问题的处理）：
- 公告类：按公告类型优先级（P0 → P1 → P2）
- 快讯类：先到先得（`publishedAt` 倒序）
- 宏观类：按数据变更时间倒序
- 快讯类不按「事件类型优先级」排序——事件类型是 AI 分析后才知道的，配额控制发生在分析之前。此优化留待后续。

---

## 六、对信息筛选设计 v4 四个问题的处理

| # | 问题 | MVP 处理方式 |
|---|------|-------------|
| 1 | `SECTOR_STOCKS` 静态常量的代码残留 | Python 脚本中调用 a-stock-data 的 `baidu_concept_blocks()` 动态获取板块成分股，Node 侧通过 collector 调用。不写任何静态映射表 |
| 2 | 快讯配额「按事件类型优先级排序」的鸡生蛋问题 | MVP 使用「先到先得」（publishedAt 倒序）。事件类型排序方案在 AI 分析后做二次排序的理论优化，标注为 P2 待评估 |
| 3 | 同一公司多公告批处理合并 | MVP 不做。同公司 30 分钟内多条公告各自独立分析、独立入库。多公告合并可能将不相关事件硬拼在一起降低信息清晰度，需在实际运行中观察后再决定是否引入 |
| 4 | 宏观数据预期值来源未指定 | MVP 不获取市场预期值。`MacroObservation` 表只存储 `lastDate` + `lastValue`（实际公布值），AI Prompt 中移除「预期 vs 实际」对比提示。预期值对比功能标注为 P2，需解决数据源问题后才能实现 |

---

## 七、后端 API 设计

### 7.1 REST API

| 方法 | 路径 | 功能 | 请求体 / 参数 |
|------|------|------|-------------|
| GET | `/api/keywords` | 获取所有关键词 | 无 |
| POST | `/api/keywords` | 添加关键词 | `{ text: string }` |
| PATCH | `/api/keywords/:id` | 更新关键词（启用/暂停） | `{ isActive?: boolean, text?: string }` |
| DELETE | `/api/keywords/:id` | 删除关键词 | 无 |
| GET | `/api/hotspots` | 获取热点列表 | `?importance=high&source=sec_edgar&keywordId=xxx&limit=50&offset=0` |
| GET | `/api/hotspots/:id` | 获取热点详情 | 无 |
| GET | `/api/notifications` | 获取通知列表 | `?isRead=false&limit=20` |
| PATCH | `/api/notifications/:id` | 标记通知已读 | `{ isRead: true }` |
| GET | `/api/health` | 健康检查 | 无 |
| POST | `/api/check-hotspots` | 手动触发热点检查 | 无 |
| GET | `/api/goto` | 代理跳转（绕过目标 WAF） | `?url=<encoded_url>` |

### 7.2 WebSocket 事件

| 事件名 | 方向 | 数据 | 说明 |
|--------|------|------|------|
| `hotspot:new` | Server → Client | Hotspot 对象 | 新热点入库后广播 |
| `notification` | Server → Client | `{ type, title, content, hotspotId, importance }` | 通知提醒 |

### 7.3 定时任务

按信源类型注册三个独立 cron，频率与 PRD 第二章一致：

| cron | 频率 | 覆盖信源 | 说明 |
|------|------|---------|------|
| `checkFastSources` | 每 2 分钟 | 财联社、东财全球资讯 | 快讯类需要高频轮询 |
| `checkAnnouncementSources` | 每 10 分钟 | SEC EDGAR、巨潮资讯 | 公告类中等频率 |
| `checkMacroSources` | 每 1 小时 | FRED、NBS | 宏观数据按发布周期，低频即可 |

每个 cron 内遍历活跃关键词，调用对应信源的采集函数 → 筛选 → 入库 → 推送。独立 cron 确保快讯不因公告采集耗时而被延迟，宏观不浪费 API 配额。

---

## 八、前端页面设计

### 8.1 路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | 重定向到 `/hotspots` | — |
| `/hotspots` | HotspotsPage | 热点列表（默认首页） |
| `/keywords` | KeywordsPage | 关键词管理 |

> **搜索功能**：搜索页面 `SearchPage` 的路由、import、API 均已注释隔离，用户界面不可见。代码保留在仓库中，后续如需恢复取消注释即可。

### 8.2 关键词管理页（KeywordsPage）

**布局**：顶部输入框 + 添加按钮，下方列表。

**列表项**：关键词文本 + 类型标签 + 启用/暂停开关 + 删除按钮。

**交互**：
- 输入框输入文本 → 点击添加 → 调用 POST `/api/keywords`
- 开关切换 → 调用 PATCH `/api/keywords/:id`
- 删除 → 确认弹窗 → 调用 DELETE `/api/keywords/:id`

### 8.3 热点列表页（HotspotsPage）

**布局**：顶部筛选栏（重要性/信源下拉） + 热点卡片列表。

**HotspotCard**：
- 标题 + 来源标签
- AI 摘要（`summary` 字段）
- 重要性标记（high/medium 不同颜色）
- 关联信源数（`relatedSources` 不为空时显示「N 个信源报道」）
- 点击展开详情：原始内容全文 + AI 分析详情（事件类型、相关性分数、相关性理由、重要性理由）+ 原始链接

**实时更新**：WebSocket 监听 `hotspot:new`，新热点自动出现在列表顶部。

**筛选条件**：重要性（全部/high/medium/low）、信源（全部/6 个信源各自）、关键词（全部/各活跃关键词）。

### 8.4 状态管理

不引入 Redux/Zustand。MVP 用 React 内置 `useState` + `useEffect`，通过 `api.ts` 和 `socket.ts` 管理数据流。两个页面各自独立获取数据，不共享全局状态。

---

## 九、关键配置文件

### 9.1 后端环境变量（`.env`）

```
DATABASE_URL="file:./dev.db"
DEEPSEEK_API_KEY="sk-xxx"
FRED_API_KEY="xxx"
CLIENT_URL="http://localhost:5173"
PORT=3001
HTTPS_PROXY=http://127.0.0.1:7890
HTTP_PROXY=http://127.0.0.1:7890
```

### 9.2 信源配置（`server/src/config/sources.ts`）

```typescript
export const SOURCE_CONFIG = {
  sec_edgar:   { pollIntervalMin: 10, rateLimitPerSec: 10,  timeout: 15000 },
  fred:        { pollIntervalMin: 60, rateLimitPerHour: 60, timeout: 15000 },
  nbs:         { pollIntervalMin: 60, rateLimitPerSec: 0.5, timeout: 15000 },
  juchao:      { pollIntervalMin: 10, rateLimitPerSec: 0.5, timeout: 15000 },
  cailianshe:  { pollIntervalMin: 2,  rateLimitPerSec: 0.5, timeout: 10000 },
  eastmoney:   { pollIntervalMin: 2,  rateLimitPerSec: 0.5, timeout: 10000 },
};
```

### 9.3 例行公告黑名单

存储在 Python 采集脚本中，作为常量列表。巨潮过滤：`['董事会决议', '股东大会通知', '监事会决议', '独立董事意见', '预约披露时间']`。EDGAR 过滤：`['DEFA14A', '424B', 'SUPPL', 'PRE 14A']`。

### 9.4 关键词→ID 映射表

映射通过以下方式自动获取，只有自动匹配失败的冷门指标才手动补：

- **SEC CIK**：通过 `https://www.sec.gov/files/company_tickers.json` 自动获取全量 ticker→CIK 映射（SEC 官方维护，每日更新）。用户输入 `AAPL` → 匹配 JSON 中的 `ticker` 字段 → 得到 CIK
- **FRED Series ID**：通过 `https://api.stlouisfed.org/fred/series/search?search_text={keyword}&api_key={key}` 自动搜索，取最匹配结果的 `id` 字段
- **NBS 指标代码**：通过 `data.stats.gov.cn/easyquery.htm` 的 `getTree` 端点动态拉取最新指标树，按名称匹配

初始运行时自动拉取 SEC company_tickers.json 全量缓存到本地（约 2MB），FRED 和 NBS 按关键词按需查询并缓存结果。只有搜索无结果时才需手动指定。

---

## 十、实现顺序

### 第一期：最小可运行闭环

按依赖关系排列，前一步完成再进入下一步：

1. **项目骨架**：复用 yupi-hot-monitor 的 `server/` 和 `client/` 目录，清理无用模块（twitter/chinaSearch/search.ts 等），重写 `prisma/schema.prisma`，跑 `prisma migrate`
2. **Python 采集层**：先写 `scripts/sources/sec_edgar.py`（美股公告，API 最规范），验证 `collector.py` → Node `collector.ts` → JSON 打通，再逐个加其他 5 个信源
3. **AI 分析层**：`server/src/services/ai.ts` — DeepSeek API 调用 + Query Expansion + 预匹配 + Prompt + 输出解析
4. **筛选 + 入库 + 推送**：`server/src/jobs/hotspotChecker.ts` — 六层漏斗串联，WebSocket 推送，定时任务调度
5. **前端页面**：关键词管理 + 热点列表，两个页面即可验证完整链路
6. **端到端验证**：添加一个测试关键词，确认 采集→分析→推送→前端展示 全链路通畅

每一步完成后跑手工验证，确认通畅再进下一步。不追求一步到位。

---

> **文档状态**：已更新，反映项目当前实际状态（搜索功能已隔离封禁）
> **下一步**：专注监控功能优化与测试。
