"""
巨潮资讯采集 — A 股公告

端点：https://www.cninfo.com.cn/new/hisAnnouncement/query

水位线格式：
{
    "extraData": {
        "000002": {"lastId": "announcementId_xxx", "lastDate": "2025-05-20"},
        ...
    }
}

参考：a-stock-data SKILL.md — cninfo_announcements()
"""

import json
import os
import sys
import time

import requests

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.51 Safari/537.36"

# 例行公告标题关键词黑名单（采集层直接过滤）
ROUTINE_BLACKLIST = [
    "董事会决议",
    "董事会会议决议",
    "股东大会通知",
    "监事会决议",
    "监事会会议决议",
    "独立董事意见",
    "独立董事述职",
    "独立董事关于",
    "预约披露时间",
    "关于召开股东大会",
    "关于举行",
    "投资者关系活动记录表",
    "关于公司",  # 过于宽泛？先保留，运行后看数据
]


def _date_range_to_se_date(date_range: str) -> str:
    from datetime import datetime, timedelta, timezone
    tz_cn = timezone(timedelta(hours=8))
    now = datetime.now(tz_cn)
    end = now.strftime("%Y-%m-%d")
    if date_range == "7d":
        start = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    elif date_range == "30d":
        start = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    elif date_range == "90d":
        start = (now - timedelta(days=90)).strftime("%Y-%m-%d")
    else:
        start = (now - timedelta(days=365)).strftime("%Y-%m-%d")
    return f"{start}~{end}"


def _monitor_first_run_cutoff() -> str:
    """监控模式首次运行（水位线为空）时，只拉最近7天的数据。"""
    from datetime import datetime, timedelta, timezone
    tz_cn = timezone(timedelta(hours=8))
    now = datetime.now(tz_cn)
    start = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    end = now.strftime("%Y-%m-%d")
    return f"{start}~{end}"


def collect(keywords: list[str], watermark: dict, mode: str = "monitor", date_range: str = "30d") -> tuple[list[dict], dict]:
    """
    采集巨潮公告。

    Args:
        keywords: 用户关键词（如 ["000002", "万科", "600036"]）
        watermark: {"extraData": {"000002": {"lastId": "...", "lastDate": "..."}}}
        mode: "monitor"=监控模式, "search"=搜索模式
        date_range: 搜索时间范围 (仅 search 模式)

    Returns:
        (items, new_watermark)
    """
    extra_data = watermark.get("extraData", {}) if watermark else {}
    new_extra_data = dict(extra_data)
    all_items = []

    for kw in keywords:
        code = _extract_stock_code(kw)
        try:
            if code:
                prev = extra_data.get(code, {"lastId": "", "lastDate": ""})
                if mode == "search":
                    items, new_prev = fetch_announcements(code, prev, mode="search", date_range=date_range)
                else:
                    items, new_prev = fetch_announcements(code, prev)
                all_items.extend(items)
                new_extra_data[code] = new_prev
            else:
                # 非代码关键词 → 全文搜索
                items = search_by_keyword(kw, date_range if mode == "search" else "30d")
                all_items.extend(items)
            time.sleep(1)
        except Exception as e:
            print(f"  巨潮: '{kw}' failed - {e}", file=sys.stderr)
            if code:
                new_extra_data[code] = extra_data.get(code, {"lastId": "", "lastDate": ""})

    new_watermark: dict = {"extraData": new_extra_data}
    return all_items, new_watermark


def search_by_keyword(keyword: str, date_range: str = "30d") -> list[dict]:
    """
    用关键词在巨潮做全文搜索（不使用股票代码）。
    使用 searchkey 参数匹配公司名。
    """
    import urllib3
    urllib3.disable_warnings()

    payload = {
        "stock": "",
        "tabName": "fulltext",
        "pageSize": "30",
        "pageNum": "1",
        "column": "",
        "category": "",
        "plate": "",
        "seDate": _date_range_to_se_date(date_range),
        "searchkey": keyword,
        "secid": "",
        "sortName": "",
        "sortType": "",
        "isHLtitle": "true",
    }

    headers = {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "https://www.cninfo.com.cn/new/disclosure",
        "Origin": "https://www.cninfo.com.cn",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
    }

    session = requests.Session()
    session.trust_env = False
    resp = session.post(
        "https://www.cninfo.com.cn/new/hisAnnouncement/query",
        data=payload,
        headers=headers,
        verify=False,
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    announcements = data.get("announcements", []) or []
    if not announcements:
        return []

    items = []
    for ann in announcements[:20]:
        ann_id = ann.get("announcementId", "")
        ann_title = ann.get("announcementTitle", "")
        ann_type = ann.get("announcementTypeName", "")
        ann_ts = ann.get("announcementTime", 0)
        stock_code = ann.get("secCode", "")

        if isinstance(ann_ts, (int, float)) and ann_ts > 0:
            from datetime import datetime, timezone, timedelta
            tz_cn = timezone(timedelta(hours=8))
            ann_dt = datetime.fromtimestamp(ann_ts / 1000, tz=tz_cn)
            ann_date = ann_dt.isoformat()
        else:
            ann_date = str(ann_ts) if ann_ts else ""

        ann_url = (
            f"https://www.cninfo.com.cn/new/disclosure/detail?announcementId={ann_id}"
            if ann_id else ""
        )

        items.append({
            "title": f"[{stock_code}] {ann_title}" if stock_code else ann_title,
            "content": (
                f"Stock: {stock_code}\n"
                f"Type: {ann_type}\n"
                f"Title: {ann_title}"
            ),
            "url": ann_url,
            "source": "juchao",
            "sourceType": "announcement",
            "publishedAt": ann_date if ann_date else None,
            "extraData": {
                "stockCode": stock_code,
                "announcementType": ann_type,
                "announcementId": ann_id,
            },
        })

    return items


def _extract_stock_code(keyword: str) -> str | None:
    """
    从关键词中提取 6 位 A 股代码。

    支持格式：000002 / 万科A / 600036.SH
    """
    kw = keyword.strip()
    # 纯数字 6 位
    if kw.isdigit() and len(kw) == 6:
        return kw
    # 含后缀的（如 600036.SH）
    if len(kw) > 6 and kw[:6].isdigit():
        return kw[:6]
    # 非代码关键词（如公司名）→ 暂返回 None，由 AI 层处理
    return None


def _make_org_id(code: str) -> str:
    """构造巨潮 orgId 参数。

    a-stock-data V3.1 已验证格式：
    - 6xxxxx → gssh0{code} (上海)
    - 8xxxxx / 4xxxxx → gsbj0{code} (北交所)
    - 其余 → gssz0{code} (深圳)
    """
    if code.startswith("6"):
        return f"gssh0{code}"
    elif code.startswith("8") or code.startswith("4"):
        return f"gsbj0{code}"
    else:
        return f"gssz0{code}"


def _is_routine(title: str) -> bool:
    """检查是否为例行公告。"""
    for keyword in ROUTINE_BLACKLIST:
        if keyword in title:
            return True
    return False


def fetch_announcements(
    code: str, prev: dict, mode: str = "monitor", date_range: str = "30d"
) -> tuple[list[dict], dict]:
    """
    拉取指定股票的公告列表。

    Args:
        code: 6 位股票代码
        prev: {"lastId": "...", "lastDate": "..."}
        mode: "monitor" 或 "search"
        date_range: 搜索时间范围 (仅 search 模式)

    Returns:
        (items, new_prev)
    """
    import urllib3
    urllib3.disable_warnings()

    # 使用 searchkey 而非 stock+orgId —— orgId 映射对科创板(688xxx)等不准确
    # searchkey 支持股票代码全文搜索，对所有板块都有效
    # 监控模式首次运行（lastId 和 lastDate 都为空）时，兜底只拉最近7天
    is_first_run = mode == "monitor" and not prev.get("lastId") and not prev.get("lastDate")
    se_date = _date_range_to_se_date(date_range) if mode == "search" else (_monitor_first_run_cutoff() if is_first_run else "")
    payload = {
        "stock": "",
        "tabName": "fulltext",
        "pageSize": "50" if mode == "search" else "30",
        "pageNum": "1",
        "column": "",
        "category": "",
        "plate": "",
        "seDate": se_date,
        "searchkey": code,
        "secid": "",
        "sortName": "",
        "sortType": "",
        "isHLtitle": "true",
    }

    headers = {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "https://www.cninfo.com.cn/new/disclosure",
        "Origin": "https://www.cninfo.com.cn",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
    }

    session = requests.Session()
    session.trust_env = False
    resp = session.post(
        "https://www.cninfo.com.cn/new/hisAnnouncement/query",
        data=payload,
        headers=headers,
        verify=False,
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    announcements = data.get("announcements", []) or []
    if not announcements:
        return [], prev

    last_id = prev.get("lastId", "")
    last_date = prev.get("lastDate", "")

    new_last_id = last_id
    new_last_date = last_date
    items = []

    for item in announcements:
        ann_id = item.get("announcementId", "")
        ann_title = item.get("announcementTitle", "")
        ann_type = item.get("announcementTypeName", "")
        ann_ts = item.get("announcementTime", 0)
        if isinstance(ann_ts, (int, float)) and ann_ts > 0:
            from datetime import datetime, timezone, timedelta
            tz_cn = timezone(timedelta(hours=8))
            ann_dt = datetime.fromtimestamp(ann_ts / 1000, tz=tz_cn)
            ann_date = ann_dt.isoformat()
            ann_date_short = ann_dt.strftime("%Y-%m-%d")
        else:
            ann_date = str(ann_ts) if ann_ts else ""
            ann_date_short = ann_date[:10] if ann_date else ""

        if mode == "monitor":
            try:
                if ann_id and int(ann_id) <= int(last_id):
                    continue
            except (ValueError, TypeError):
                if ann_id and ann_id <= last_id:
                    continue
            if ann_date_short and ann_date_short <= last_date:
                continue

        try:
            if ann_id and (not new_last_id or int(ann_id) > int(new_last_id)):
                new_last_id = ann_id
        except (ValueError, TypeError):
            if ann_id and (not new_last_id or ann_id > new_last_id):
                new_last_id = ann_id
        if ann_date_short and (not new_last_date or ann_date_short > new_last_date):
            new_last_date = ann_date_short

        if mode == "monitor" and _is_routine(ann_title):
            continue

        adj_id = item.get("adjunctUrl", "")
        ann_url = (
            f"https://www.cninfo.com.cn/new/disclosure/detail?announcementId={ann_id}"
            if ann_id
            else ""
        )

        items.append({
            "title": f"[{code}] {ann_title}",
            "content": (
                f"Stock: {code}\n"
                f"Type: {ann_type}\n"
                f"Date: {ann_date}\n"
                f"Title: {ann_title}"
            ),
            "url": ann_url,
            "source": "juchao",
            "sourceType": "announcement",
            "publishedAt": ann_date if ann_date else None,
            "extraData": {
                "stockCode": code,
                "announcementType": ann_type,
                "announcementId": ann_id,
            },
        })

    new_prev = {"lastId": new_last_id, "lastDate": new_last_date}
    if mode == "search":
        return items, prev
    return items, new_prev
