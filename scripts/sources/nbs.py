"""
国家统计局 NBS V2 采集 — 中国宏观数据

API 版本：V2.0（2026-03-27 上线）
基础路径：https://data.stats.gov.cn/dg/website/publicrelease/web/external

三步工作流：
1. /query?search=关键词 → 搜索找到 cid
2. /new/queryIndicatorsByCid?cid=xxx → 获取指标元数据
3. POST /getEsDataByCidAndDt → 批量获取数值

水位线格式：
{
    "extraData": {
        "f9698ec2ec7143faa...": {"lastDate": "202604", "lastValue": 99.3},
        ...
    }
}
"""

import json
import sys
import time
from datetime import datetime, timezone, timedelta

import requests
import urllib3

# NBS V2 API 的 SSL 证书链在部分网络环境下不完整，需禁用验证
# TODO: 后续如 NBS 修复证书问题，移除此配置
urllib3.disable_warnings()

BASE_URL = "https://data.stats.gov.cn/dg/website/publicrelease/web/external"

# 月度数据根节点 ID（固定）
ROOT_ID = "fc982599aa684be7969d7b90b1bd0e84"

# 全国地区代码
DA_NATIONAL = "000000000000"

# 请求头（必须带 X-Requested-With 和 Accept，否则返回 HTML 错误页）
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://data.stats.gov.cn/",
}

# 指标缓存路径
from pathlib import Path
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def _cache_file(filename: str) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR / filename


def load_json_cache(filename: str) -> dict:
    path = _cache_file(filename)
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_json_cache(filename: str, data: dict) -> None:
    with open(_cache_file(filename), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def collect(keywords: list[str], watermark: dict, mode: str = "monitor", date_range: str = "30d") -> tuple[list[dict], dict]:
    """
    采集 NBS 宏观数据（V2 API）。

    Args:
        keywords: 用户关键词（如 ["CPI", "GDP", "居民消费价格指数"]）
        watermark: {"extraData": {"indicator_uuid": {"lastDate": "202604", "lastValue": 99.3}}}
        mode: "monitor"=监控模式, "search"=搜索模式
        date_range: 搜索时间范围 (仅 search 模式)

    Returns:
        (items, new_watermark)
    """
    extra_data = watermark.get("extraData", {}) if watermark else {}
    new_extra_data = dict(extra_data)
    all_items = []

    search_cache = load_json_cache("nbs_search_cache.json")

    session = requests.Session()
    session.trust_env = False

    for kw in keywords:
        try:
            cached = search_cache.get(kw)

            if not cached:
                cached = search_indicator(session, kw)
                if cached:
                    search_cache[kw] = cached
                    save_json_cache("nbs_search_cache.json", search_cache)

            if not cached:
                print(f"  NBS: no indicator found for '{kw}'", file=sys.stderr)
                continue

            cid = cached["cid"]
            indic_id = cached["indic_id"]
            indicator_name = cached.get("name", kw)
            dt_type = cached.get("dt_type", "MM")

            if mode == "search":
                items, new_prev = fetch_range(session, cid, indic_id, indicator_name, kw, dt_type, date_range)
            else:
                prev = extra_data.get(indic_id, {})
                prev_date = prev.get("lastDate", "")
                item, new_prev = fetch_latest(session, cid, indic_id, indicator_name, kw, prev_date, dt_type)
                items = [item] if item else []

            all_items.extend(items)
            new_extra_data[indic_id] = new_prev

            time.sleep(1)

        except Exception as e:
            print(f"  NBS: '{kw}' failed - {e}", file=sys.stderr)
            cached = search_cache.get(kw, {})
            indic_id = cached.get("indic_id", "")
            if indic_id:
                new_extra_data[indic_id] = extra_data.get(indic_id, {})

    new_watermark: dict = {"extraData": new_extra_data}
    return all_items, new_watermark


def search_indicator(session: requests.Session, keyword: str) -> dict | None:
    """
    搜索指标，返回 {cid, indic_id, name, unit}。

    优先匹配全国月度数据。
    """
    print(f"  NBS V2: searching '{keyword}'...", file=sys.stderr)

    resp = session.get(
        f"{BASE_URL}/query",
        params={"search": keyword, "pagenum": "1", "pageSize": "10"},
        headers=HEADERS,
        verify=False,
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    results = data.get("data", {}).get("data", [])
    if not results:
        return None

    # 优先选月度、全国数据
    best = None
    for r in results:
        dt_type = r.get("dt_type", "")
        da = r.get("da", "")
        # 月度 + 全国 = 最佳
        if dt_type == "MM" and da == DA_NATIONAL:
            best = r
            break

    # 降级：任意月度
    if not best:
        for r in results:
            if r.get("dt_type") == "MM":
                best = r
                break

    # 再降级：第一个结果
    if not best:
        best = results[0]

    cid = best.get("cid", "")
    indic_id = best.get("indic_id", "")
    show_name = best.get("show_name", keyword)
    dt_name = best.get("dt_name", "")
    dt_type = best.get("dt_type", "MM")  # MM=月, SS=季, YY=年

    if not cid or not indic_id:
        return None

    print(f"  NBS V2: '{keyword}' → {show_name} (cid={cid[:12]}..., {dt_name})", file=sys.stderr)
    return {
        "cid": cid,
        "indic_id": indic_id,
        "name": show_name,
        "dt_type": dt_type,
    }


def fetch_latest(
    session: requests.Session,
    cid: str,
    indic_id: str,
    indicator_name: str,
    keyword: str,
    prev_date: str,
    dt_type: str = "MM",
) -> tuple[dict | None, dict]:
    """
    查询数据并检测是否有更新。

    dt_type: MM=月度, SS=季度, YY=年度
    """
    tz_cn = timezone(timedelta(hours=8))
    now = datetime.now(tz_cn)

    # 根据数据类型构造时间范围和格式
    if dt_type == "YY":
        # 年度：YYYY
        end_str = now.strftime("%Y")
        start_str = str(now.year - 5)
        dts = f"{start_str}YY-{end_str}YY"
    elif dt_type == "SS":
        # 季度：YYYY+QQ（两位季度）
        quarter = (now.month - 1) // 3 + 1
        end_str = f"{now.year}{quarter:02d}"
        start_str = f"{now.year - 2}{quarter:02d}"
        dts = f"{start_str}SS-{end_str}SS"
    else:
        # 月度：YYYYMM
        end_str = now.strftime("%Y%m")
        start_dt = now - timedelta(days=180)
        start_str = start_dt.strftime("%Y%m")
        dts = f"{start_str}MM-{end_str}MM"

    payload = {
        "cid": cid,
        "indicatorIds": [indic_id],
        "das": [{"text": "全国", "value": DA_NATIONAL}],
        "dts": [dts],
        "showType": "1",
        "rootId": ROOT_ID,
    }

    resp = session.post(
        f"{BASE_URL}/getEsDataByCidAndDt",
        json=payload,
        headers={**HEADERS, "Content-Type": "application/json"},
        verify=False,
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    if not data.get("success"):
        msg = data.get("message", "Unknown error")
        raise RuntimeError(f"getEsDataByCidAndDt failed: {msg}")

    records = data.get("data", [])
    if not records:
        return None, {"lastDate": prev_date, "lastValue": None}

    # 按时间倒序排列，跳过无值记录
    records.sort(key=lambda r: r.get("code", ""), reverse=True)

    latest = None
    latest_date = ""
    latest_value = None
    for rec in records:
        vals = rec.get("values", [])
        if vals and vals[0].get("value", "").strip():
            latest = rec
            latest_date = rec.get("code", "").replace("MM", "").replace("SS", "").replace("YY", "")
            latest_value = _safe_float(vals[0].get("value", ""))
            break

    if latest is None or latest_value is None or not latest_date:
        return None, {"lastDate": prev_date, "lastValue": None}

    values = latest.get("values", [])

    # 检查是否有更新
    if latest_date <= prev_date:
        return None, {"lastDate": prev_date, "lastValue": None}

    # 获取前一期的值用于环比计算
    prev_value = None
    change_pct = None

    # 找到第一个比 latest_date 早且有值的记录
    for rec in records:
        rec_date = rec.get("code", "").replace("MM", "").replace("SS", "").replace("YY", "")
        if rec_date >= latest_date:
            continue
        prev_vals = rec.get("values", [])
        if prev_vals and prev_vals[0].get("value", "").strip():
            prev_val = _safe_float(prev_vals[0].get("value", ""))
            if prev_val is not None and prev_val != 0:
                change_pct = round((latest_value - prev_val) / abs(prev_val) * 100, 2)
                prev_value = prev_val
            break

    dt_name = f"{latest_date[:4]}年{latest_date[4:6]}月" if len(latest_date) == 6 else latest_date

    item = {
        "title": f"[NBS] {indicator_name}",
        "content": (
            f"Indicator: {indicator_name}\n"
            f"Period: {dt_name}\n"
            f"Value: {latest_value}\n"
            + (f"Previous Value: {prev_value}\n" if prev_value is not None else "")
            + (f"Change: {change_pct}%\n" if change_pct is not None else "")
        ),
        "url": "https://data.stats.gov.cn/",
        "source": "nbs",
        "sourceType": "macro_data",
        "publishedAt": f"{_dt_to_iso(latest_date, dt_type)}",
        "extraData": {
            "indicatorCode": indic_id,
            "indicatorName": indicator_name,
            "cid": cid,
            "latestDate": latest_date,
            "latestValue": latest_value,
            "previousValue": prev_value,
            "changePercent": change_pct,
        },
    }

    new_prev = {"lastDate": latest_date, "lastValue": latest_value}
    return item, new_prev


def _date_range_to_dts(date_range: str, dt_type: str = "MM") -> str:
    tz_cn = timezone(timedelta(hours=8))
    now = datetime.now(tz_cn)
    if date_range == "7d":
        delta = timedelta(days=7)
    elif date_range == "30d":
        delta = timedelta(days=30)
    elif date_range == "90d":
        delta = timedelta(days=90)
    else:
        delta = timedelta(days=365)
    start_dt = now - delta

    if dt_type == "YY":
        end_str = now.strftime("%Y")
        start_str = start_dt.strftime("%Y")
        return f"{start_str}YY-{end_str}YY"
    elif dt_type == "SS":
        quarter = (now.month - 1) // 3 + 1
        end_str = f"{now.year}{quarter:02d}"
        start_quarter = (start_dt.month - 1) // 3 + 1
        start_str = f"{start_dt.year}{start_quarter:02d}"
        return f"{start_str}SS-{end_str}SS"
    else:
        end_str = now.strftime("%Y%m")
        start_str = start_dt.strftime("%Y%m")
        return f"{start_str}MM-{end_str}MM"


def fetch_range(
    session: requests.Session,
    cid: str,
    indic_id: str,
    indicator_name: str,
    keyword: str,
    dt_type: str = "MM",
    date_range: str = "30d",
    max_records: int = 5,
) -> tuple[list[dict], dict]:
    """
    搜索模式：获取指定时间范围内的数据（最多 max_records 条）。

    Returns:
        (items, {}) — 搜索模式不更新水位线
    """
    dts = _date_range_to_dts(date_range, dt_type)

    payload = {
        "cid": cid,
        "indicatorIds": [indic_id],
        "das": [{"text": "全国", "value": DA_NATIONAL}],
        "dts": [dts],
        "showType": "1",
        "rootId": ROOT_ID,
    }

    resp = session.post(
        f"{BASE_URL}/getEsDataByCidAndDt",
        json=payload,
        headers={**HEADERS, "Content-Type": "application/json"},
        verify=False,
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    if not data.get("success"):
        return [], {}

    records = data.get("data", [])
    if not records:
        return [], {}

    records.sort(key=lambda r: r.get("code", ""), reverse=True)

    items = []
    prev_value = None
    count = 0
    for rec in records:
        vals = rec.get("values", [])
        if not vals or not vals[0].get("value", "").strip():
            continue

        rec_date_raw = rec.get("code", "")
        rec_date = rec_date_raw.replace("MM", "").replace("SS", "").replace("YY", "")
        rec_value = _safe_float(vals[0].get("value", ""))
        if rec_value is None or not rec_date:
            continue

        change_pct = None
        if prev_value is not None and prev_value != 0:
            change_pct = round((rec_value - prev_value) / abs(prev_value) * 100, 2)

        dt_name = f"{rec_date[:4]}年{rec_date[4:6]}月" if len(rec_date) == 6 else rec_date

        items.append({
            "title": f"[NBS] {indicator_name} — {dt_name}",
            "content": (
                f"Indicator: {indicator_name}\n"
                f"Period: {dt_name}\n"
                f"Value: {rec_value}\n"
                + (f"Change: {change_pct}%\n" if change_pct is not None else "")
            ),
            "url": "https://data.stats.gov.cn/",
            "source": "nbs",
            "sourceType": "macro_data",
            "publishedAt": _dt_to_iso(rec_date, dt_type),
            "extraData": {
                "indicatorCode": indic_id,
                "indicatorName": indicator_name,
                "cid": cid,
                "latestDate": rec_date,
                "latestValue": rec_value,
                "changePercent": change_pct,
            },
        })

        prev_value = rec_value
        count += 1
        if count >= max_records:
            break

    return items, {}


def _safe_float(val: str) -> float | None:
    """安全转换数值。"""
    if not val or val in ("-", "—", "..", ".", ""):
        return None
    try:
        return float(val.replace(",", ""))
    except (ValueError, AttributeError):
        return None


def _dt_to_iso(dt: str, dt_type: str = "MM") -> str:
    """将 NBS 时间格式转为 ISO 日期。"""
    if dt_type == "YY" and len(dt) == 4 and dt.isdigit():
        return f"{dt}-01-01T00:00:00+08:00"
    if dt_type == "SS" and len(dt) == 6 and dt.isdigit():
        q = int(dt[4:6])
        month = (q - 1) * 3 + 1
        return f"{dt[:4]}-{month:02d}-01T00:00:00+08:00"
    if len(dt) == 6 and dt.isdigit():
        return f"{dt[:4]}-{dt[4:6]}-01T00:00:00+08:00"
    if len(dt) == 4 and dt.isdigit():
        return f"{dt}-01-01T00:00:00+08:00"
    return dt
