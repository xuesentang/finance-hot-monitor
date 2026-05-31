"""
财联社采集 — A 股快讯（电报）

端点：https://www.cls.cn/nodeapi/telegraphList

水位线格式：
{"lastTimestamp": 1768900000}
"""

import time

import requests

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


def _date_range_cutoff(date_range: str) -> int:
    from datetime import datetime, timezone, timedelta
    tz_cn = timezone(timedelta(hours=8))
    now = datetime.now(tz_cn)
    if date_range == "7d":
        cutoff = now - timedelta(days=7)
    elif date_range == "30d":
        cutoff = now - timedelta(days=30)
    elif date_range == "90d":
        cutoff = now - timedelta(days=90)
    else:
        cutoff = now - timedelta(days=365)
    return int(cutoff.timestamp())


def collect(keywords: list[str], watermark: dict, mode: str = "monitor", date_range: str = "30d") -> tuple[list[dict], dict]:
    """
    采集财联社电报。

    快讯源不按关键词筛选（全量拉取），关键词匹配由 Node 侧第 2 层处理。

    Args:
        keywords: 未使用（留接口统一）
        watermark: {"lastTimestamp": 1768900000}
        mode: "monitor"=监控模式, "search"=搜索模式
        date_range: 搜索时间范围 (仅 search 模式)

    Returns:
        (items, new_watermark)
    """
    last_ts = watermark.get("lastTimestamp", 0) if watermark else 0

    url = "https://www.cls.cn/nodeapi/telegraphList"
    params = {"rn": "50", "page": "1"}
    headers = {
        "User-Agent": UA,
        "Referer": "https://www.cls.cn/",
    }

    resp = requests.get(url, params=params, headers=headers, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    roll_data = data.get("data", {}).get("roll_data", [])
    if not roll_data:
        return [], watermark

    cutoff_ts = _date_range_cutoff(date_range) if mode == "search" else 0

    new_last_ts = last_ts
    items = []

    for item in roll_data:
        ctime = int(item.get("ctime", 0))
        title = item.get("title", "") or item.get("brief", "")
        content = item.get("content", "") or item.get("brief", "")
        brief = item.get("brief", "")

        if mode == "monitor" and ctime <= last_ts:
            continue

        if mode == "search" and ctime < cutoff_ts:
            continue

        if ctime > new_last_ts:
            new_last_ts = ctime

        from datetime import datetime, timezone, timedelta
        tz_cn = timezone(timedelta(hours=8))
        dt = datetime.fromtimestamp(ctime, tz=tz_cn)
        published_at = dt.isoformat()

        full_text = f"{title}\n\n{brief}\n\n{content}".strip()

        items.append({
            "title": title,
            "content": full_text[:3000],
            "url": f"https://www.cls.cn/detail/{item.get('id', '')}" if item.get("id") else "https://www.cls.cn/telegraph",
            "source": "cailianshe",
            "sourceType": "news",
            "publishedAt": published_at,
            "extraData": {
                "teleId": str(item.get("id", "")),
                "ctime": ctime,
            },
        })

    new_watermark: dict = {"lastTimestamp": new_last_ts}
    if mode == "search":
        return items, watermark
    return items, new_watermark
