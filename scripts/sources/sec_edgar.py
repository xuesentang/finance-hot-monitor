"""
SEC EDGAR 采集 — 美股公告

端点：
- company_tickers.json → ticker→CIK 映射
- data.sec.gov/submissions/CIK{cik}.json → 提交文件列表

水位线格式：
{
    "extraData": {
        "0000320193": {"lastFilingDate": "2025-05-20"},
        ...
    }
}
"""

import json
import os
import sys
import time
from pathlib import Path

import requests

# User-Agent 格式：CompanyName Email（SEC 要求）
UA = "FinanceHotMonitor/1.0 xuesentang@example.com"
BASE_URL = "https://data.sec.gov"
TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"

# 关注的文件类型及优先级
FILING_TYPES = {
    "8-K": "P0",
    "8-K/A": "P1",
    "13F-HR": "P1",
    "13F-NT": "P1",
    "6-K": "P1",
    "10-Q": "P1",
    "10-K": "P1",
    "S-1": "P1",
    "S-1/A": "P1",
    "DEF 14A": "P2",
    "424B2": "P2",
    "424B3": "P2",
    "424B5": "P2",
    "SC 13G": "P1",
    "SC 13G/A": "P1",
    "SC 13D": "P1",
    "SC 13D/A": "P1",
    "3": "P2",
    "4": "P2",
    "5": "P2",
}

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
TICKERS_CACHE = DATA_DIR / "company_tickers.json"

# 代理配置（国内访问 SEC 需 VPN）
PROXY_URL = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
PROXIES = {"https": PROXY_URL, "http": PROXY_URL} if PROXY_URL else None


def _date_range_start(date_range: str) -> str:
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    if date_range == "7d":
        return (now - timedelta(days=7)).strftime("%Y-%m-%d")
    elif date_range == "30d":
        return (now - timedelta(days=30)).strftime("%Y-%m-%d")
    elif date_range == "90d":
        return (now - timedelta(days=90)).strftime("%Y-%m-%d")
    else:
        return (now - timedelta(days=365)).strftime("%Y-%m-%d")


def collect(keywords: list[str], watermark: dict, mode: str = "monitor", date_range: str = "30d") -> tuple[list[dict], dict]:
    """
    采集 SEC EDGAR 公告。

    Args:
        keywords: 用户关键词（如 ["AAPL", "MSFT"]）
        watermark: {"extraData": {"0000320193": {"lastFilingDate": "2025-05-20"}}}
        mode: "monitor"=监控模式(水位线增量), "search"=搜索模式(指定时间范围)
        date_range: 搜索时间范围 (仅 search 模式生效)

    Returns:
        (items, new_watermark)
    """
    ticker_map = load_ticker_map()

    stock_codes = []
    for kw in keywords:
        upper = kw.strip().upper()
        if upper.isalpha() and 1 <= len(upper) <= 5:
            stock_codes.append(upper)

    if not stock_codes:
        return [], watermark

    extra_data = watermark.get("extraData", {}) if watermark else {}
    new_extra_data = dict(extra_data)
    all_items = []

    session = requests.Session()
    session.headers.update({"User-Agent": UA})

    for ticker in stock_codes:
        cik_info = ticker_map.get(ticker)
        if not cik_info:
            continue

        cik = cik_info["cik_str"]
        cik_padded = str(cik).zfill(10)
        prev = extra_data.get(cik_padded, {})

        try:
            if mode == "search":
                items, new_prev = fetch_submissions(
                    session, cik_padded, ticker, prev, mode="search", date_range=date_range
                )
            else:
                items, new_prev = fetch_submissions(session, cik_padded, ticker, prev)
            all_items.extend(items)
            new_extra_data[cik_padded] = new_prev
            time.sleep(0.15)
        except Exception as e:
            print(f"  SEC EDGAR: {ticker} ({cik_padded}) failed - {e}", file=sys.stderr)
            new_extra_data[cik_padded] = prev

    new_watermark: dict = {"extraData": new_extra_data}
    return all_items, new_watermark


def load_ticker_map() -> dict:
    """加载 company_tickers.json，自动拉取并缓存。"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if not TICKERS_CACHE.exists():
        print("  Downloading company_tickers.json (SEC ticker→CIK mapping)...", file=sys.stderr)
        resp = requests.get(TICKERS_URL, headers={"User-Agent": UA}, proxies=PROXIES, timeout=30)
        resp.raise_for_status()
        TICKERS_CACHE.write_text(resp.text, encoding="utf-8")
        print(f"  Cached: {TICKERS_CACHE} ({TICKERS_CACHE.stat().st_size:,} bytes)", file=sys.stderr)

    with open(TICKERS_CACHE, "r", encoding="utf-8") as f:
        tickers = json.load(f)

    # 转换为 {ticker: info} 的字典
    result = {}
    for item in tickers.values():
        result[item["ticker"]] = item

    return result


def fetch_submissions(
    session: requests.Session,
    cik_padded: str,
    ticker: str,
    prev: dict,
    mode: str = "monitor",
    date_range: str = "30d",
) -> tuple[list[dict], dict]:
    """
    拉取单个 CIK 的 submissions，返回新文件和水位线。

    Args:
        session: requests Session
        cik_padded: 10 位零填充 CIK
        ticker: 原始 ticker 代码
        prev: 该 CIK 上一次的水位线 {"lastFilingDate": "2025-05-20"}
        mode: "monitor" 或 "search"
        date_range: 搜索时间范围 (仅 search 模式)

    Returns:
        (items, new_prev)
    """
    url = f"{BASE_URL}/submissions/CIK{cik_padded}.json"
    resp = session.get(url, proxies=PROXIES, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    from datetime import datetime, timedelta

    if mode == "search":
        last_filing_date = _date_range_start(date_range)
    else:
        last_filing_date = prev.get("lastFilingDate", "")
        if not last_filing_date:
            last_filing_date = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")

    latest_date = last_filing_date

    filings = data.get("filings", {}).get("recent", {})
    if not filings:
        return [], prev

    forms = filings.get("form", [])
    dates = filings.get("filingDate", [])
    acc_numbers = filings.get("accessionNumber", [])
    primary_docs = filings.get("primaryDocument", [])
    report_dates = filings.get("reportDate", [])
    descriptions = filings.get("primaryDocDescription", [])

    items = []
    search_limit = 50
    for i in range(len(forms)):
        form = forms[i] if i < len(forms) else ""
        filing_date = dates[i] if i < len(dates) else ""
        acc_num = acc_numbers[i] if i < len(acc_numbers) else ""

        if filing_date <= last_filing_date:
            continue

        if filing_date > latest_date:
            latest_date = filing_date

        if form not in FILING_TYPES:
            continue

        doc = primary_docs[i] if i < len(primary_docs) else ""
        filing_url = (
            f"https://www.sec.gov/Archives/edgar/data/{int(cik_padded)}/{acc_num.replace('-', '')}/{acc_num}-index.htm"
            if acc_num
            else ""
        )
        doc_url = (
            f"https://www.sec.gov/Archives/edgar/data/{int(cik_padded)}/{acc_num.replace('-', '')}/{doc}"
            if acc_num and doc
            else filing_url
        )

        report_date = report_dates[i] if i < len(report_dates) else ""
        desc = descriptions[i] if i < len(descriptions) else ""

        items.append({
            "title": f"[{form}] {ticker} - {desc}" if desc else f"[{form}] {ticker} Filing",
            "content": (
                f"Company: {data.get('name', ticker)}\n"
                f"Form: {form}\n"
                f"Filing Date: {filing_date}\n"
                f"Report Date: {report_date}\n"
                f"Description: {desc}\n"
                f"Accession: {acc_num}"
            ),
            "url": filing_url,
            "source": "sec_edgar",
            "sourceType": "announcement",
            "publishedAt": f"{filing_date}T00:00:00Z",
            "extraData": {
                "ticker": ticker,
                "cik": cik_padded,
                "form": form,
                "priority": FILING_TYPES.get(form, "P2"),
                "accessionNumber": acc_num,
            },
        })

        if mode == "search" and len(items) >= search_limit:
            break

    items.reverse()

    if mode == "search":
        return items, prev

    new_prev = {"lastFilingDate": latest_date} if latest_date else prev
    return items, new_prev
