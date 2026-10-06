"""설정 로드 — config.json 을 기본값 위에 덮어쓴다."""

import copy
import json
from pathlib import Path

DEFAULTS = {
    # {"시도": ["시군구", ...]} — 시군구에 "*" 를 넣으면 해당 시도 전체
    "regions": {},
    "naver": {
        "enabled": True,
        # A1 매매 / B1 전세 / B2 월세
        "trade_types": ["A1", "B1"],
        # A01 아파트 / A04 재건축
        "real_estate_types": ["A01", "A04"],
        "max_pages_per_dong": 40,
        "request_interval_sec": 0.8,
        "headless": True,
        "browser_channel": "chrome",
    },
    "courtauction": {
        "enabled": True,
        # apartment: 아파트만 / residential: 주거용 건물 전체 / all: 부동산 전체
        "usage": "apartment",
        "window_days": 30,
        "max_failed_bids": "",
        "page_size": 50,
        "max_pages": 60,
        "request_interval_sec": 2.5,
    },
    "hogangnono": {
        "enabled": False,
        "apartments": [],
        "request_interval_sec": 3.0,
        "headless": True,
        "browser_channel": "chrome",
    },
    "report": {
        "output_dir": "reports",
        "upcoming_auction_days": 14,
        "price_change_min_pct": 0.0,
        "open_in_browser": False,
    },
    "data_dir": "data",
}


def _merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict) and k != "regions":
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def load_config(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(
            f"설정 파일이 없습니다: {path}\n"
            "config.example.json 을 config.json 으로 복사한 뒤 regions 를 수정하세요.")
    cfg = _merge(DEFAULTS, json.loads(path.read_text(encoding="utf-8")))
    if not cfg["regions"]:
        raise ValueError("config.json 의 regions 가 비어 있습니다. 예: {\"서울시\": [\"강남구\"]}")
    base = path.resolve().parent
    cfg["_base_dir"] = str(base)
    cfg["data_dir"] = str((base / cfg["data_dir"]).resolve())
    cfg["report"]["output_dir"] = str((base / cfg["report"]["output_dir"]).resolve())
    return cfg
