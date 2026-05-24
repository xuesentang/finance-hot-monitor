"""
金融热点监控 — 数据采集入口

Node.js 后端通过 child_process 调用本脚本：
  python collector.py --source <source> --keywords '["kw1","kw2"]' --watermark '{"lastId":"x"}'

输出 JSON 到 stdout：
  {"items": [...], "watermark": {...}}
"""

import argparse
import json
import sys


def main():
    parser = argparse.ArgumentParser(description="金融热点数据采集")
    parser.add_argument("--source", required=True, help="信源名称: sec_edgar|juchao|cailianshe|eastmoney|fred|nbs")
    parser.add_argument("--keywords", required=True, help="关键词列表 JSON 数组")
    parser.add_argument("--watermark", default="{}", help="水位线 JSON 对象")
    args = parser.parse_args()

    source = args.source
    keywords = json.loads(args.keywords)
    watermark = json.loads(args.watermark)

    collector = get_collector(source)

    try:
        items, new_watermark = collector(keywords, watermark)
        output = {"items": items, "watermark": new_watermark}
        print(json.dumps(output, ensure_ascii=False))
    except Exception as e:
        result = {"items": [], "watermark": watermark, "error": str(e)}
        print(json.dumps(result, ensure_ascii=False))


def get_collector(source: str):
    """路由到对应信源的采集函数。"""
    if source == "sec_edgar":
        from sources.sec_edgar import collect
    elif source == "juchao":
        from sources.juchao import collect
    elif source == "cailianshe":
        from sources.cailianshe import collect
    elif source == "eastmoney":
        from sources.eastmoney import collect
    elif source == "fred":
        from sources.fred import collect
    elif source == "nbs":
        from sources.nbs import collect
    else:
        raise ValueError(f"Unknown source: {source}")

    return collect


if __name__ == "__main__":
    main()
