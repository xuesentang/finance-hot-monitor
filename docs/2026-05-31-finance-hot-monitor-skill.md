# Finance Hot Monitor Skill 模块实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 finance-hot-monitor 项目新增 Agent Skill 技能包模块，使项目具备"Web 应用 + AI Agent Skill"双模式能力，让 Cursor、VSCode Copilot、Claude Code 等 AI 编程工具可以直接调用金融热点监控能力。

**Architecture:** 采用与 yupi-hot-monitor 一致的 Skill 协议规范（SKILL.md 清单 + Python 脚本 + 参考文档）。脚本层通过 sys.path 导入项目已有的 `scripts/sources/` 采集模块，避免代码重复。AI 分析由 Agent 自身能力完成，不依赖外部 AI API。通信协议为命令行参数输入 + JSON stdout 输出。

**Tech Stack:** Python 3 + requests + urllib3（复用项目已有依赖），Agent Skills 协议（SKILL.md YAML Front Matter + Markdown）

---

## 全局架构分析

### 现有项目架构

```
finance-hot-monitor/
├── client/          # React 前端
├── server/          # Express 后端 + AI 分析 + Cron 调度
└── scripts/         # Python 采集脚本（6 个信源）
    ├── collector.py           # CLI 路由器
    ├── sources/               # 各信源采集模块
    │   ├── cailianshe.py     # 财联社快讯
    │   ├── eastmoney.py      # 东财全球资讯
    │   ├── juchao.py         # 巨潮 A 股公告
    │   ├── sec_edgar.py      # SEC EDGAR 美股公告
    │   ├── fred.py           # FRED 美国宏观数据
    │   └── nbs.py            # 国家统计局中国宏观数据
    └── utils/                 # 工具模块
        ├── rate_limiter.py   # 令牌桶限速
        └── watermark.py      # 水位线持久化
```

### 目标 Skill 架构

```
finance-hot-monitor/
├── client/          # 不变
├── server/          # 不变
├── scripts/         # 不变
└── skills/                              # ★ 新增 Skill 模块
    └── finance-hot-monitor/             # 技能目录
        ├── SKILL.md                     # 技能清单（YAML 元数据 + 使用指南）
        ├── scripts/                     # 搜索脚本
        │   ├── search_news.py           # 金融快讯搜索（财联社 + 东财）
        │   ├── search_announcements.py  # 公告搜索（巨潮 + SEC EDGAR）
        │   ├── search_macro.py          # 宏观数据搜索（FRED + NBS）
        │   ├── generate_report.py       # 报告生成
        │   └── requirements.txt         # Python 依赖
        └── references/                  # 参考文档
            ├── analysis-guide.md        # 金融分析框架
            └── search-sources.md        # 数据源参考
```

### 双模式对比

| 维度 | Web 应用模式 | Skill 模式 |
|------|-------------|-----------|
| 运行环境 | Node.js 服务器 | AI Agent 本地执行 Python 脚本 |
| 数据采集 | Python 脚本（child_process 调用） | Python 脚本（Agent 直接执行） |
| AI 分析 | DeepSeek API | Agent 自身 AI 能力 |
| 数据存储 | SQLite (Prisma ORM) | 无持久化，JSON 输出到 stdout |
| 实时通知 | WebSocket + 通知面板 | 无 |
| 定时调度 | node-cron（2min/10min/1h） | Agent 按需触发 |
| 增量采集 | 水位线机制 | 无（每次全量搜索） |
| 依赖 | 服务器 + 数据库 + API Key | 仅 Python + pip 依赖 + 部分可选 API Key |

### 脚本复用策略

**核心决策：通过 sys.path 导入已有模块，而非复制代码。**

理由：
1. 项目已有 6 个成熟的 Python 采集模块，经过实际运行验证
2. 避免代码重复导致的维护负担（修 bug 需要改两处）
3. Skill 脚本作为薄封装层，只负责接口适配（CLI 参数 → 函数调用 → JSON 输出）

实现方式：
```python
# Skill 脚本头部添加路径
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent / "scripts"))
from sources.cailianshe import collect
from sources.eastmoney import collect as eastmoney_collect
```

---

## 文件清单

| 操作 | 文件路径 | 职责 |
|------|---------|------|
| 创建 | `skills/finance-hot-monitor/SKILL.md` | 技能清单文件，YAML 元数据 + Markdown 使用指南 |
| 创建 | `skills/finance-hot-monitor/scripts/search_news.py` | 金融快讯搜索脚本（财联社 + 东财） |
| 创建 | `skills/finance-hot-monitor/scripts/search_announcements.py` | 公告搜索脚本（巨潮 + SEC EDGAR） |
| 创建 | `skills/finance-hot-monitor/scripts/search_macro.py` | 宏观数据搜索脚本（FRED + NBS） |
| 创建 | `skills/finance-hot-monitor/scripts/generate_report.py` | 报告生成脚本（JSON → Markdown） |
| 创建 | `skills/finance-hot-monitor/scripts/requirements.txt` | Python 依赖声明 |
| 创建 | `skills/finance-hot-monitor/references/analysis-guide.md` | 金融分析框架参考 |
| 创建 | `skills/finance-hot-monitor/references/search-sources.md` | 数据源详细参考 |

---

## Task 1: 创建 Skill 目录结构和 requirements.txt

**Files:**
- Create: `skills/finance-hot-monitor/scripts/requirements.txt`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p skills/finance-hot-monitor/scripts
mkdir -p skills/finance-hot-monitor/references
```

- [ ] **Step 2: 创建 requirements.txt**

`skills/finance-hot-monitor/scripts/requirements.txt` 内容：

```
requests>=2.34.0
urllib3>=2.7.0
```

与项目 `scripts/requirements.txt` 保持一致，因为 Skill 脚本复用同一套采集模块。

- [ ] **Step 3: 验证目录结构**

```bash
ls -R skills/finance-hot-monitor/
```

预期输出包含 `scripts/` 和 `references/` 两个子目录。

---

## Task 2: 创建 search_news.py — 金融快讯搜索脚本

**Files:**
- Create: `skills/finance-hot-monitor/scripts/search_news.py`

此脚本搜索实时金融快讯源（财联社 + 东财），适用于用户想了解最新市场动态的场景。

- [ ] **Step 1: 编写 search_news.py**

```python
"""
金融快讯搜索 — 财联社 + 东财全球资讯

用法：
  python scripts/search_news.py "A股" --sources cailianshe,eastmoney --limit 20

输出 JSON 数组到 stdout，错误信息到 stderr。
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent / "scripts"))

from sources.cailianshe import collect as cailianshe_collect
from sources.eastmoney import collect as eastmoney_collect


COLLECTORS = {
    "cailianshe": cailianshe_collect,
    "eastmoney": eastmoney_collect,
}

SOURCE_NAMES = {
    "cailianshe": "财联社",
    "eastmoney": "东财全球",
}


def search(keyword: str, sources: list[str], limit: int = 20, date_range: str = "7d") -> list[dict]:
    all_items = []

    for source in sources:
        collector = COLLECTORS.get(source)
        if not collector:
            print(f"Unknown source: {source}", file=sys.stderr)
            continue

        try:
            items, _ = collector(
                keywords=[keyword],
                watermark={},
                mode="search",
                date_range=date_range,
            )
            for item in items[:limit]:
                item["sourceName"] = SOURCE_NAMES.get(source, source)
                all_items.append(item)
        except Exception as e:
            print(f"{SOURCE_NAMES.get(source, source)} search failed: {e}", file=sys.stderr)

    return all_items


def main():
    parser = argparse.ArgumentParser(description="金融快讯搜索（财联社 + 东财）")
    parser.add_argument("keyword", help="搜索关键词")
    parser.add_argument("--sources", default="cailianshe,eastmoney", help="数据源，逗号分隔 (cailianshe,eastmoney)")
    parser.add_argument("--limit", type=int, default=20, help="每源最大结果数 (默认 20)")
    parser.add_argument("--date-range", default="7d", dest="date_range", help="时间范围: 7d/30d/90d/all (默认 7d)")
    args = parser.parse_args()

    sources = [s.strip() for s in args.sources.split(",") if s.strip()]
    results = search(args.keyword, sources, args.limit, args.date_range)
    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 测试脚本运行**

```bash
cd D:\finance-hot-monitor
python skills/finance-hot-monitor/scripts/search_news.py "A股" --sources cailianshe --limit 5
```

预期：输出 JSON 数组，每条包含 `title`、`content`、`url`、`source`、`sourceType`、`publishedAt` 字段。如果财联社 API 不可达，应输出 `[]` 并在 stderr 打印错误信息。

---

## Task 3: 创建 search_announcements.py — 公告搜索脚本

**Files:**
- Create: `skills/finance-hot-monitor/scripts/search_announcements.py`

此脚本搜索公司公告源（巨潮 + SEC EDGAR），适用于用户查询特定公司公告、财报、股权变动等。

- [ ] **Step 1: 编写 search_announcements.py**

```python
"""
公司公告搜索 — 巨潮资讯 + SEC EDGAR

用法：
  python scripts/search_announcements.py "000002" --sources juchao,sec_edgar --limit 20
  python scripts/search_announcements.py "AAPL" --sources sec_edgar --limit 10

输出 JSON 数组到 stdout，错误信息到 stderr。

环境变量：
  HTTPS_PROXY — 可选，访问 SEC EDGAR 的代理地址（国内网络可能需要）
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent / "scripts"))

from sources.juchao import collect as juchao_collect
from sources.sec_edgar import collect as sec_edgar_collect


COLLECTORS = {
    "juchao": juchao_collect,
    "sec_edgar": sec_edgar_collect,
}

SOURCE_NAMES = {
    "juchao": "巨潮资讯",
    "sec_edgar": "SEC EDGAR",
}


def search(keyword: str, sources: list[str], limit: int = 20, date_range: str = "30d") -> list[dict]:
    keywords = [k.strip() for k in keyword.split(",") if k.strip()]
    all_items = []

    for source in sources:
        collector = COLLECTORS.get(source)
        if not collector:
            print(f"Unknown source: {source}", file=sys.stderr)
            continue

        try:
            items, _ = collector(
                keywords=keywords,
                watermark={},
                mode="search",
                date_range=date_range,
            )
            for item in items[:limit]:
                item["sourceName"] = SOURCE_NAMES.get(source, source)
                all_items.append(item)
        except Exception as e:
            print(f"{SOURCE_NAMES.get(source, source)} search failed: {e}", file=sys.stderr)

    return all_items


def main():
    parser = argparse.ArgumentParser(description="公司公告搜索（巨潮 + SEC EDGAR）")
    parser.add_argument("keyword", help="搜索关键词（股票代码/公司名/ticker，多个用逗号分隔）")
    parser.add_argument("--sources", default="juchao,sec_edgar", help="数据源，逗号分隔 (juchao,sec_edgar)")
    parser.add_argument("--limit", type=int, default=20, help="每源最大结果数 (默认 20)")
    parser.add_argument("--date-range", default="30d", dest="date_range", help="时间范围: 7d/30d/90d/all (默认 30d)")
    args = parser.parse_args()

    sources = [s.strip() for s in args.sources.split(",") if s.strip()]
    results = search(args.keyword, sources, args.limit, args.date_range)
    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 测试脚本运行**

```bash
cd D:\finance-hot-monitor
python skills/finance-hot-monitor/scripts/search_announcements.py "000002" --sources juchao --limit 5
```

预期：输出万科A在巨潮的公告列表 JSON 数组。

---

## Task 4: 创建 search_macro.py — 宏观数据搜索脚本

**Files:**
- Create: `skills/finance-hot-monitor/scripts/search_macro.py`

此脚本搜索宏观经济数据源（FRED + NBS），适用于用户查询 CPI、GDP、失业率等经济指标。

- [ ] **Step 1: 编写 search_macro.py**

```python
"""
宏观数据搜索 — FRED + 国家统计局

用法：
  python scripts/search_macro.py "CPI" --sources fred,nbs --limit 5
  python scripts/search_macro.py "GDP" --sources fred --limit 3

输出 JSON 数组到 stdout，错误信息到 stderr。

环境变量：
  FRED_API_KEY  — 必需（仅 FRED 源需要），从 https://fred.stlouisfed.org/ 免费申请
  HTTPS_PROXY   — 可选，访问 FRED 的代理地址
"""

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent / "scripts"))

from sources.fred import collect as fred_collect
from sources.nbs import collect as nbs_collect


COLLECTORS = {
    "fred": fred_collect,
    "nbs": nbs_collect,
}

SOURCE_NAMES = {
    "fred": "FRED",
    "nbs": "国家统计局",
}

REQUIRED_ENV = {
    "fred": ["FRED_API_KEY"],
}


def check_env(source: str) -> list[str]:
    missing = []
    for var in REQUIRED_ENV.get(source, []):
        if not os.environ.get(var):
            missing.append(var)
    return missing


def search(keyword: str, sources: list[str], limit: int = 5, date_range: str = "90d") -> list[dict]:
    keywords = [k.strip() for k in keyword.split(",") if k.strip()]
    all_items = []

    for source in sources:
        collector = COLLECTORS.get(source)
        if not collector:
            print(f"Unknown source: {source}", file=sys.stderr)
            continue

        missing = check_env(source)
        if missing:
            print(f"{SOURCE_NAMES.get(source, source)} skipped: missing env vars {', '.join(missing)}", file=sys.stderr)
            continue

        try:
            items, _ = collector(
                keywords=keywords,
                watermark={},
                mode="search",
                date_range=date_range,
            )
            for item in items[:limit]:
                item["sourceName"] = SOURCE_NAMES.get(source, source)
                all_items.append(item)
        except Exception as e:
            print(f"{SOURCE_NAMES.get(source, source)} search failed: {e}", file=sys.stderr)

    return all_items


def main():
    parser = argparse.ArgumentParser(description="宏观数据搜索（FRED + 国家统计局）")
    parser.add_argument("keyword", help="搜索关键词（CPI/GDP/失业率等，多个用逗号分隔）")
    parser.add_argument("--sources", default="fred,nbs", help="数据源，逗号分隔 (fred,nbs)")
    parser.add_argument("--limit", type=int, default=5, help="每源最大结果数 (默认 5)")
    parser.add_argument("--date-range", default="90d", dest="date_range", help="时间范围: 7d/30d/90d/all (默认 90d)")
    args = parser.parse_args()

    sources = [s.strip() for s in args.sources.split(",") if s.strip()]
    results = search(args.keyword, sources, args.limit, args.date_range)
    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 测试脚本运行**

```bash
cd D:\finance-hot-monitor
python skills/finance-hot-monitor/scripts/search_macro.py "CPI" --sources nbs --limit 3
```

预期：输出国家统计局 CPI 相关数据 JSON 数组。FRED 源需要设置 `FRED_API_KEY` 环境变量。

---

## Task 5: 创建 generate_report.py — 报告生成脚本

**Files:**
- Create: `skills/finance-hot-monitor/scripts/generate_report.py`

此脚本读取搜索结果的 JSON，生成格式化的 Markdown 报告，支持管道输入。

- [ ] **Step 1: 编写 generate_report.py**

```python
"""
金融热点报告生成器

用法：
  python scripts/search_news.py "A股" | python scripts/generate_report.py --keyword "A股"
  python scripts/generate_report.py --keyword "万科" --file results.json

从 stdin 或文件读取 JSON 数组，输出 Markdown 格式报告。
"""

import argparse
import json
import sys
from datetime import datetime, timezone, timedelta


IMPORTANCE_ORDER = {"high": 0, "medium": 1, "low": 2}
IMPORTANCE_LABELS = {
    "high": "🔴 重要",
    "medium": "🟡 关注",
    "low": "🟢 低优先",
}
SOURCE_TYPE_LABELS = {
    "news": "快讯",
    "announcement": "公告",
    "macro_data": "宏观数据",
}


def classify_item(item: dict) -> str:
    source_type = item.get("sourceType", "news")
    extra = item.get("extraData", {})

    if source_type == "macro_data":
        return "macro"
    if source_type == "announcement":
        form = extra.get("form", "")
        if form in ("8-K", "6-K", "SC 13D", "SC 13G"):
            return "urgent_announcement"
        return "announcement"
    return "news"


def generate_report(items: list[dict], keyword: str) -> str:
    tz_cn = timezone(timedelta(hours=8))
    now = datetime.now(tz_cn)
    timestamp = now.strftime("%Y-%m-%d %H:%M")

    source_counts = {}
    for item in items:
        src = item.get("sourceName", item.get("source", "unknown"))
        source_counts[src] = source_counts.get(src, 0) + 1

    sources_str = "、".join(f"{k}({v})" for k, v in source_counts.items())

    lines = [
        f"## 📊 金融热点报告 — {keyword}",
        f"> 扫描时间: {timestamp} | 数据源: {sources_str} | 共 {len(items)} 条",
        "",
    ]

    categories = {
        "urgent_announcement": ("🚨 重大公告", []),
        "announcement": ("📋 公司公告", []),
        "news": ("📰 财经快讯", []),
        "macro": ("📈 宏观数据", []),
    }

    for item in items:
        cat = classify_item(item)
        categories[cat][1].append(item)

    for cat_key, (cat_title, cat_items) in categories.items():
        if not cat_items:
            continue

        lines.append(f"### {cat_title}")
        lines.append("")

        for item in cat_items:
            title = item.get("title", "无标题")
            url = item.get("url", "")
            source = item.get("sourceName", item.get("source", ""))
            published = item.get("publishedAt", "")
            content = item.get("content", "")
            extra = item.get("extraData", {})

            if published:
                pub_short = published[:16] if len(published) > 16 else published
                time_info = f" | {pub_short}"
            else:
                time_info = ""

            link = f"[原文链接]({url})" if url else "无链接"
            lines.append(f"- **{title}**")
            lines.append(f"  来源: {source}{time_info} | {link}")

            if cat_key == "macro" and extra:
                val = extra.get("latestValue", "")
                change = extra.get("changePercent")
                if val:
                    change_str = f" (环比 {change:+.2f}%)" if change is not None else ""
                    lines.append(f"  最新值: {val}{change_str}")
            elif cat_key == "announcement" and extra:
                form = extra.get("form", extra.get("announcementType", ""))
                if form:
                    lines.append(f"  类型: {form}")

            lines.append("")

    lines.append("---")
    lines.append(f"共发现 {len(items)} 条信息")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="金融热点报告生成器")
    parser.add_argument("--keyword", required=True, help="监控关键词")
    parser.add_argument("--file", help="JSON 文件路径（不指定则从 stdin 读取）")
    args = parser.parse_args()

    try:
        if args.file:
            with open(args.file, "r", encoding="utf-8") as f:
                items = json.load(f)
        else:
            raw = sys.stdin.read()
            items = json.loads(raw) if raw.strip() else []
    except Exception as e:
        print(f"Failed to read input: {e}", file=sys.stderr)
        items = []

    if not isinstance(items, list):
        items = []

    report = generate_report(items, args.keyword)
    print(report)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 测试管道模式**

```bash
cd D:\finance-hot-monitor
python skills/finance-hot-monitor/scripts/search_news.py "A股" --sources cailianshe --limit 5 | python skills/finance-hot-monitor/scripts/generate_report.py --keyword "A股"
```

预期：输出格式化的 Markdown 报告，包含标题、来源、时间、链接等信息。

---

## Task 6: 创建 references/analysis-guide.md — 金融分析框架

**Files:**
- Create: `skills/finance-hot-monitor/references/analysis-guide.md`

此文件定义 AI Agent 对搜索结果进行分析时必须遵循的金融分析框架，从项目已有的 `server/src/services/ai.ts` 分析 prompt 中提炼而来。

- [ ] **Step 1: 编写 analysis-guide.md**

内容要点：
1. 分析输出 Schema（8 维度：eventType / isSubstantial / relevance / keywordMentioned / importance / summary / affectedHoldings / eventFingerprint）
2. 事件类型分类体系（公司事件 / 宏观事件 / 市场事件 / 其他）
3. 相关性评分标准（金融场景特化）
4. 重要性分级标准
5. 摘要生成规则
6. 过滤阈值规则
7. 持仓影响判断

- [ ] **Step 2: 验证内容完整性**

对照 `server/src/services/ai.ts` 中的 `buildAnalysisPrompt()` 和 `server/src/utils/filter.ts` 中的 `shouldFilter()`，确保分析框架与 Web 应用一致。

---

## Task 7: 创建 references/search-sources.md — 数据源参考

**Files:**
- Create: `skills/finance-hot-monitor/references/search-sources.md`

此文件为 AI Agent 提供每个金融数据源的详细信息，帮助 Agent 在搜索失败时自行诊断问题。

- [ ] **Step 1: 编写 search-sources.md**

内容要点（6 个数据源，每个包含）：
1. 信源名称和中英文说明
2. 数据类型（快讯/公告/宏观数据）
3. API 端点和请求方式
4. 是否需要 API Key
5. 速率限制
6. 已知问题和注意事项
7. 搜索关键词建议（如 A 股用 6 位代码，美股用 ticker）

- [ ] **Step 2: 验证内容准确性**

对照各采集模块源码，确认端点 URL、请求方式、参数格式等信息准确。

---

## Task 8: 创建 SKILL.md — 技能清单文件（核心）

**Files:**
- Create: `skills/finance-hot-monitor/SKILL.md`

这是整个 Skill 的入口和定义文件，AI Agent 通过读取此文件了解如何使用技能。遵循 Agent Skills 协议规范。

- [ ] **Step 1: 编写 SKILL.md 的 YAML Front Matter**

```yaml
---
name: finance-hot-monitor
description: >
  Financial hotspot monitoring and market intelligence across 6 authoritative sources (Cailianshe, Eastmoney,
  Juchao/CNInfo, SEC EDGAR, FRED, NBS). Use when users ask about: financial news, stock announcements,
  corporate filings, macroeconomic data, market trends, A-share announcements, US stock SEC filings,
  economic indicators, "最近金融热点", "查一下万科公告", "美股AAPL最新财报", "CPI数据", "A股快讯",
  "帮我监控XX股票", "宏观数据", "financial monitoring", "stock filing", "macro indicators",
  or any request to search/track/discover financial events and market data.
---
```

- [ ] **Step 2: 编写 SKILL.md 的 Markdown 正文**

正文结构：
1. **Quick Start** — 安装依赖 + 环境变量配置
2. **Core Workflow** — 四步工作流（理解意图 → 执行搜索 → 分析结果 → 呈现报告）
3. **Script Reference** — 各脚本的用法、数据源、API Key 需求、输出格式
4. **Keyword Tips** — 金融关键词的特殊规则（A 股代码格式、美股 ticker、宏观指标名）
5. **Advanced Patterns** — 多关键词批量、管道组合、报告生成
6. **Reference Files** — 指向 references/ 目录

- [ ] **Step 3: 验证 SKILL.md 格式**

确认：
- YAML Front Matter 的 `name` 与目录名 `finance-hot-monitor` 一致
- `description` 包含中英文触发词，覆盖所有使用场景
- Markdown 正文中的脚本路径和参数与实际脚本一致
- Quick Start 中的安装命令可执行

---

## Task 9: 端到端测试与验证

**Files:**
- 无新文件创建，验证已有文件

- [ ] **Step 1: 测试快讯搜索**

```bash
cd D:\finance-hot-monitor
python skills/finance-hot-monitor/scripts/search_news.py "A股" --limit 5
```

预期：输出 JSON 数组，包含财联社和东财的快讯。

- [ ] **Step 2: 测试公告搜索**

```bash
python skills/finance-hot-monitor/scripts/search_announcements.py "000002" --sources juchao --limit 5
```

预期：输出万科A的巨潮公告列表。

- [ ] **Step 3: 测试宏观数据搜索**

```bash
python skills/finance-hot-monitor/scripts/search_macro.py "CPI" --sources nbs --limit 3
```

预期：输出国家统计局 CPI 数据。

- [ ] **Step 4: 测试管道组合 + 报告生成**

```bash
python skills/finance-hot-monitor/scripts/search_news.py "A股" --limit 5 | python skills/finance-hot-monitor/scripts/generate_report.py --keyword "A股"
```

预期：输出格式化的 Markdown 报告。

- [ ] **Step 5: 测试错误处理**

```bash
python skills/finance-hot-monitor/scripts/search_news.py "测试" --sources invalid_source
```

预期：输出 `[]`，stderr 包含 "Unknown source" 错误信息。

- [ ] **Step 6: 验证 SKILL.md 可被 AI Agent 正确解析**

在 Cursor 或 Claude Code 中打开项目，确认 Agent 能识别 `skills/finance-hot-monitor/SKILL.md` 并理解技能描述。

---

## Task 10: 更新项目根目录 .gitignore（如需要）

**Files:**
- Modify: `.gitignore`（仅在需要排除 Skill 产生的缓存文件时修改）

- [ ] **Step 1: 检查 .gitignore 是否需要更新**

Skill 脚本运行时可能产生缓存文件（如 `data/company_tickers.json`、`data/fred_series_cache.json`），确认这些已在 .gitignore 中。

- [ ] **Step 2: 如需更新，添加缓存目录规则**

---

## 风险与注意事项

### 1. sys.path 依赖风险

Skill 脚本通过 `sys.path.insert(0, ...)` 导入项目 `scripts/sources/` 模块。这意味着：
- **Skill 脚本必须在项目根目录下运行**（`cd D:\finance-hot-monitor` 后执行）
- 如果用户将 Skill 单独复制到其他位置，脚本将无法找到采集模块

**缓解方案**：在 SKILL.md 中明确说明运行要求；后续可考虑将采集模块打包为 pip 包。

### 2. API Key 依赖

- FRED 源需要 `FRED_API_KEY` 环境变量
- SEC EDGAR 在国内网络可能需要 `HTTPS_PROXY`
- 财联社、东财、巨潮、NBS 不需要 API Key

**缓解方案**：在 SKILL.md 和 search_macro.py 中明确标注 API Key 需求；脚本在缺少 Key 时输出友好提示而非崩溃。

### 3. 数据源稳定性

- NBS 的 SSL 证书链可能不完整（已在 nbs.py 中禁用验证）
- 巨潮资讯需要禁用 SSL 验证
- SEC EDGAR 对 User-Agent 格式有要求

**缓解方案**：在 references/search-sources.md 中详细记录各数据源的已知问题和注意事项。

### 4. 与 Web 应用的代码一致性

Skill 脚本复用 Web 应用的采集模块，因此两者的数据采集逻辑天然一致。但 AI 分析逻辑不同：
- Web 应用：调用 DeepSeek API（8 维分析 + 阈值过滤 + 跨源去重）
- Skill：Agent 自身 AI 能力（按 analysis-guide.md 框架分析）

**缓解方案**：analysis-guide.md 从 ai.ts 和 filter.ts 中完整提炼分析规则，确保分析标准一致。
