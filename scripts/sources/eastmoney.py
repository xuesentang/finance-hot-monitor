"""
东财全球资讯采集 — A 股快讯（7x24）

端点：https://np-weblist.eastmoney.com/comm/web/getFastNewsList

注意：需要 req_trace 参数（UUID），否则服务端返回空列表。

水位线格式：
{"lastTimestamp": 1768900000}
（showTime 是日期字符串，内部转为时间戳比较）
"""

import time
import uuid
from datetime import datetime, timezone, timedelta

import requests

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


def collect(keywords: list[str], watermark: dict) -> tuple[list[dict], dict]:
    """
    采集东财全球资讯。

    Args:
        keywords: 未使用（全量拉取）
        watermark: {"lastTimestamp": 1768900000}

    Returns:
        (items, new_watermark)
    """
    last_ts = watermark.get("lastTimestamp", 0) if watermark else 0

    url = "https://np-weblist.eastmoney.com/comm/web/getFastNewsList"
    params = {
        "client": "web",
        "biz": "web_724",
        "fastColumn": "102",
        "sortEnd": "",
        "pageSize": "50",
        "req_trace": str(uuid.uuid4()),
    }
    headers = {
        "User-Agent": UA,
        "Referer": "https://kuaixun.eastmoney.com/",
    }

    resp = requests.get(url, params=params, headers=headers, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    news_list = data.get("data", {}).get("fastNewsList", [])
    if not news_list:
        return [], watermark

    new_last_ts = last_ts
    items = []
    tz_cn = timezone(timedelta(hours=8))

    for item in news_list:
        title = item.get("title", "")
        summary = item.get("summary", "") or ""
        show_time = item.get("showTime", "")  # e.g. "2026-05-24 16:30:00"

        if not title:
            continue

        # 解析时间
        try:
            dt = datetime.strptime(show_time, "%Y-%m-%d %H:%M:%S").replace(tzinfo=tz_cn)
        except ValueError:
            dt = datetime.now(tz=tz_cn)

        ts = int(dt.timestamp())

        if ts <= last_ts:
            continue

        if ts > new_last_ts:
            new_last_ts = ts

        published_at = dt.isoformat()

        full_text = f"{title}\n\n{summary}".strip() if summary else title

        # 构造 URL
        news_id = item.get("code", "") or item.get("id", "")
        url_str = (
            f"https://finance.eastmoney.com/a/{news_id}.html"
            if news_id
            else "https://kuaixun.eastmoney.com/"
        )

        items.append({
            "title": title,
            "content": full_text[:3000],
            "url": url_str,
            "source": "eastmoney",
            "sourceType": "news",
            "publishedAt": published_at,
            "extraData": {
                "newsId": news_id,
                "showTime": show_time,
            },
        })

    new_watermark: dict = {"lastTimestamp": new_last_ts}
    return items, new_watermark
