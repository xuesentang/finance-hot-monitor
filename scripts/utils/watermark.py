"""水位线持久化工具 — 供采集脚本使用"""

import json
import os
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def load_watermark(source: str) -> dict:
    """加载指定信源的水位线。"""
    filepath = DATA_DIR / f"watermark_{source}.json"
    if filepath.exists():
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_watermark(source: str, watermark: dict) -> None:
    """保存指定信源的水位线到磁盘。"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    filepath = DATA_DIR / f"watermark_{source}.json"
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(watermark, f, ensure_ascii=False, indent=2)
