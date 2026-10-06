"""명령행 진입점.

  python -m realestate run               # 수집 + 리포트 (매일 실행)
  python -m realestate run --only naver  # 특정 소스만
  python -m realestate report            # 이미 수집된 데이터로 리포트만 다시 생성
  python -m realestate regions           # config 지역이 어떤 법정동으로 풀리는지 확인
  python -m realestate probe-hogangnono  # 호갱노노 페이지가 쓰는 API 구조 덤프
"""

import argparse
import logging
import sys
import webbrowser
from datetime import date
from pathlib import Path

from . import courtauction, hogangnono, naver
from .config import load_config
from .report import write_report
from .store import Store

log = logging.getLogger("realestate")
SOURCES = ("courtauction", "naver", "hogangnono")


def setup_logging(data_dir: Path, verbose: bool):
    (data_dir / "logs").mkdir(parents=True, exist_ok=True)
    handlers = [logging.StreamHandler(sys.stdout),
                logging.FileHandler(data_dir / "logs" / f"{date.today().isoformat()}.log",
                                    encoding="utf-8")]
    logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO, handlers=handlers,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def run_source(name: str, cfg: dict, store: Store, data_dir: Path, today: str) -> bool:
    try:
        if name == "courtauction":
            items, complete, errors = courtauction.collect(cfg)
            store.save_auctions(items, today, complete)
            count = len(items)
            status = "ok" if complete else "partial"
        elif name == "naver":
            rows, done, errors = naver.collect(cfg, data_dir)
            store.save_listings(rows, today, done)
            count = len(rows)
            status = "ok" if not errors else ("partial" if rows else "failed")
        else:
            rows, errors = hogangnono.collect(cfg, data_dir)
            store.save_hogangnono(rows, today)
            count = len(rows)
            status = "ok" if not errors else ("partial" if rows else "failed")
    except Exception as e:  # 한 소스 실패가 리포트 전체를 막지 않게
        log.exception("%s 수집 실패", name)
        store.log_run(today, name, "failed", 0, [f"{type(e).__name__}: {e}"])
        return False
    store.log_run(today, name, status, count, errors)
    log.info("%s: %s, %d건", name, status, count)
    return status != "failed"


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="realestate", description="부동산 매물·경매 일일 리포트")
    p.add_argument("command", choices=["run", "report", "regions", "probe-hogangnono"])
    p.add_argument("-c", "--config", default=str(Path(__file__).resolve().parent.parent / "config.json"))
    p.add_argument("--only", choices=SOURCES, action="append", help="이 소스만 수집 (여러 번 지정 가능)")
    p.add_argument("-v", "--verbose", action="store_true")
    a = p.parse_args(argv)

    cfg = load_config(Path(a.config))
    data_dir = Path(cfg["data_dir"])
    setup_logging(data_dir, a.verbose)
    today = date.today()

    if a.command == "regions":
        dongs = naver.RegionResolver(data_dir / "cache" / "naver_regions.json").resolve(cfg["regions"])
        for d in dongs:
            print(f"{d['code']}  {d['sido']} {d['sigungu']} {d['dong']}")
        print(f"\n총 {len(dongs)}개 법정동")
        return 0
    if a.command == "probe-hogangnono":
        print(hogangnono.probe(cfg, data_dir))
        return 0

    store = Store(data_dir / "realestate.db")
    ok = True
    try:
        if a.command == "run":
            for name in a.only or SOURCES:
                if not cfg[name].get("enabled", True):
                    log.info("%s: 비활성화(config) — 건너뜀", name)
                    continue
                ok &= run_source(name, cfg, store, data_dir, today.isoformat())
        path = write_report(store, cfg, today)
    finally:
        store.close()
    log.info("리포트: %s", path)
    print(path)
    if cfg["report"].get("open_in_browser"):
        webbrowser.open(path.as_uri())
    return 0 if ok else 1
