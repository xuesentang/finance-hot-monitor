"""
FRED 采集 — 美国宏观数据

端点：
- series/search  → 关键词→Series ID 搜索
- series/observations → 最新观测值

水位线格式：
{
    "extraData": {
        "CPIAUCSL": {"lastDate": "2025-04-01", "lastValue": 318.5},
        ...
    }
}
"""

import os
import sys
import time

import requests

API_KEY = os.environ.get("FRED_API_KEY", "")
BASE_URL = "https://api.stlouisfed.org/fred"

UA = "FinanceHotMonitor/1.0"
PROXY_URL = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
PROXIES = {"https": PROXY_URL, "http": PROXY_URL} if PROXY_URL else None

# 用户关键词到 FRED Series ID 的映射缓存（文件持久化）
_CACHE_PATH = None


def _cache_file():
    global _CACHE_PATH
    if _CACHE_PATH is None:
        from pathlib import Path
        data_dir = Path(__file__).resolve().parent.parent.parent / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        _CACHE_PATH = data_dir / "fred_series_cache.json"
    return _CACHE_PATH


def load_series_cache() -> dict:
    import json
    path = _cache_file()
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_series_cache(cache: dict) -> None:
    import json
    with open(_cache_file(), "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def collect(keywords: list[str], watermark: dict) -> tuple[list[dict], dict]:
    """
    采集 FRED 宏观数据。

    Args:
        keywords: 用户关键词（如 ["CPI", "GDP", "unemployment"]）
        watermark: {"extraData": {"CPIAUCSL": {"lastDate": "...", "lastValue": ...}}}

    Returns:
        (items, new_watermark)
    """
    if not API_KEY:
        raise ValueError("FRED_API_KEY not set in environment")

    extra_data = watermark.get("extraData", {}) if watermark else {}
    new_extra_data = dict(extra_data)
    all_items = []

    series_cache = load_series_cache()

    for kw in keywords:
        try:
            # 尝试从缓存获取 Series ID
            series_id = series_cache.get(kw.upper())
            if not series_id:
                series_id = search_series(kw)
                if series_id:
                    series_cache[kw.upper()] = series_id
                    save_series_cache(series_cache)

            if not series_id:
                print(f"  FRED: no series found for '{kw}'", file=sys.stderr)
                continue

            prev = extra_data.get(series_id, {})
            item, new_prev = fetch_latest(series_id, kw, prev)

            if item:
                all_items.append(item)

            new_extra_data[series_id] = new_prev
            time.sleep(0.5)  # FRED 限制 120 req/min

        except Exception as e:
            print(f"  FRED: '{kw}' failed - {e}", file=sys.stderr)
            if series_id:
                new_extra_data[series_id] = extra_data.get(series_id, {})

    new_watermark: dict = {"extraData": new_extra_data}
    return all_items, new_watermark


def search_series(keyword: str) -> str | None:
    """搜索匹配关键词的 Series ID。"""
    url = f"{BASE_URL}/series/search"
    params = {
        "search_text": keyword,
        "api_key": API_KEY,
        "file_type": "json",
        "limit": 5,
        "order_by": "popularity",
    }
    resp = requests.get(url, params=params, headers={"User-Agent": UA}, proxies=PROXIES, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    series_list = data.get("seriess", [])
    if not series_list:
        return None

    # 取最匹配的结果（第一个）
    best = series_list[0]
    series_id = best.get("id", "")
    print(f"  FRED: '{keyword}' → {series_id} ({best.get('title', '')})", file=sys.stderr)
    return series_id


def fetch_latest(
    series_id: str, keyword: str, prev: dict
) -> tuple[dict | None, dict]:
    """
    获取最新观测值，与水位线比较。

    Args:
        series_id: FRED Series ID
        keyword: 原始搜索关键词
        prev: {"lastDate": "2025-04-01", "lastValue": 318.5}

    Returns:
        (item_or_None, new_prev)
    """
    url = f"{BASE_URL}/series/observations"
    params = {
        "series_id": series_id,
        "api_key": API_KEY,
        "file_type": "json",
        "sort_order": "desc",
        "limit": 3,  # 取最新两条用于环比计算
    }
    resp = requests.get(url, params=params, headers={"User-Agent": UA}, proxies=PROXIES, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    obs_list = data.get("observations", [])
    if not obs_list:
        return None, prev

    # 过滤掉非数值的观测（如 "." 表示缺失）
    valid_obs = [o for o in obs_list if o.get("value", ".") != "."]
    if not valid_obs:
        return None, prev

    latest = valid_obs[0]
    latest_date = latest.get("date", "")
    latest_value = float(latest.get("value", "0"))

    prev_date = prev.get("lastDate", "")
    prev_value = prev.get("lastValue")

    # 检查是否有新数据
    if latest_date <= prev_date:
        return None, prev

    # 计算环比变化
    change_pct = None
    prev_obs_value = None
    if prev_value is not None:
        if prev_value != 0:
            change_pct = round((latest_value - prev_value) / abs(prev_value) * 100, 2)

    # 也计算与上一期的环比（如果 FRED 返回了前一期数据）
    if change_pct is None and len(valid_obs) >= 2:
        prev_val = float(valid_obs[1].get("value", "0"))
        if prev_val != 0:
            change_pct = round((latest_value - prev_val) / abs(prev_val) * 100, 2)
        prev_obs_value = prev_val

    # 获取 series 名称
    series_name = keyword
    try:
        info_url = f"{BASE_URL}/series"
        info_params = {
            "series_id": series_id,
            "api_key": API_KEY,
            "file_type": "json",
        }
        info_resp = requests.get(info_url, params=info_params, headers={"User-Agent": UA}, proxies=PROXIES, timeout=10)
        info_data = info_resp.json()
        series_info = info_data.get("seriess", [])
        if series_info:
            series_name = series_info[0].get("title", keyword)
    except Exception:
        pass

    item = {
        "title": f"[FRED] {series_name}",
        "content": (
            f"Indicator: {series_name} ({series_id})\n"
            f"Latest Date: {latest_date}\n"
            f"Latest Value: {latest_value}\n"
            + (f"Previous Value: {prev_obs_value}\n" if prev_obs_value else "")
            + (f"Change: {change_pct}%\n" if change_pct is not None else "")
            + (f"Previous Value (last check): {prev_value}\n" if prev_value is not None else "")
        ),
        "url": f"https://fred.stlouisfed.org/series/{series_id}",
        "source": "fred",
        "sourceType": "macro_data",
        "publishedAt": f"{latest_date}T00:00:00Z",
        "extraData": {
            "seriesId": series_id,
            "seriesName": series_name,
            "latestDate": latest_date,
            "latestValue": latest_value,
            "previousValue": prev_obs_value,
            "changePercent": change_pct,
        },
    }

    new_prev = {"lastDate": latest_date, "lastValue": latest_value}
    return item, new_prev
