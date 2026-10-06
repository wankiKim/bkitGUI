"""호갱노노 (hogangnono.com) 관심 단지 요약 수집 — 실험적.

호갱노노는 공개 API 문서가 없고 내부 API 구조도 검증된 공개 자료가 없다.
그래서 고정 엔드포인트를 가정하지 않고, 실제 Chrome 으로 단지 페이지를 연 뒤
  1) 페이지의 제목/메타 설명(시세 요약 문구)을 읽고
  2) 페이지가 호출한 JSON 응답을 data/raw/hogangnono/ 에 그대로 저장한다.
2) 의 원본은 `python -m realestate probe-hogangnono` 로 구조를 확인한 뒤
전용 파서를 붙이는 데 쓴다.

config 예: "apartments": ["https://hogangnono.com/apt/xxxxx", {"name": "은마", "url": "..."}]
"""

import json
import logging
import re
from datetime import date
from pathlib import Path

from .util import Throttle

log = logging.getLogger(__name__)

DESKTOP_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

META_JS = """() => {
    const m = (sel) => { const e = document.querySelector(sel); return e ? e.getAttribute('content') : null; };
    return {
        title: document.title,
        description: m('meta[name="description"]') || m('meta[property="og:description"]'),
        og_title: m('meta[property="og:title"]'),
    };
}"""


def normalize_targets(entries) -> list[dict]:
    out = []
    for e in entries or []:
        if isinstance(e, str):
            e = {"url": e}
        url = (e.get("url") or "").strip()
        if not url:
            continue
        m = re.search(r"/apt/([^/?#]+)", url)
        out.append({"id": m.group(1) if m else url, "name": e.get("name") or "", "url": url})
    return out


class HogangnonoBrowser:
    def __init__(self, interval_sec=3.0, headless=True, channel="chrome"):
        self.throttle = Throttle(interval_sec, 1.5)
        self.headless = headless
        self.channel = channel
        self._pw = self._browser = self._ctx = None

    def __enter__(self):
        from playwright.sync_api import sync_playwright
        self._pw = sync_playwright().start()
        args = ["--disable-blink-features=AutomationControlled"]
        try:
            self._browser = self._pw.chromium.launch(channel=self.channel or None,
                                                     headless=self.headless, args=args)
        except Exception as e:
            if not self.channel:
                raise
            log.warning("Chrome 실행 실패, 내장 Chromium 사용: %s", e)
            self._browser = self._pw.chromium.launch(headless=self.headless, args=args)
        self._ctx = self._browser.new_context(user_agent=DESKTOP_UA, locale="ko-KR",
                                              viewport={"width": 1366, "height": 900})
        return self

    def __exit__(self, *exc):
        try:
            if self._browser:
                self._browser.close()
        finally:
            if self._pw:
                self._pw.stop()

    def visit(self, url: str) -> dict:
        """페이지를 열고 메타 정보 + 페이지가 받은 JSON 응답들을 반환."""
        self.throttle.wait()
        captured = []

        def on_response(resp):
            ctype = resp.headers.get("content-type", "")
            if "json" not in ctype or "hogangnono" not in resp.url:
                return
            try:
                captured.append({"url": resp.url, "status": resp.status, "body": resp.json()})
            except Exception:
                pass

        page = self._ctx.new_page()
        page.on("response", on_response)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            try:
                page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass
            meta = page.evaluate(META_JS)
            meta["final_url"] = page.url
        finally:
            page.close()
        return {"meta": meta, "responses": captured}


def summarize(target: dict, visit: dict) -> dict:
    meta = visit.get("meta") or {}
    name = target["name"] or (meta.get("og_title") or meta.get("title") or "").split("|")[0].strip()
    return {
        "id": target["id"],
        "name": name or target["id"],
        "url": target["url"],
        "summary": (meta.get("description") or "").strip(),
        "api_calls": len(visit.get("responses") or []),
    }


def collect(cfg: dict, data_dir: Path):
    hcfg = cfg["hogangnono"]
    targets = normalize_targets(hcfg.get("apartments"))
    if not targets:
        return [], ["호갱노노: hogangnono.apartments 에 관심 단지 URL 이 없습니다"]
    raw_dir = data_dir / "raw" / "hogangnono" / date.today().isoformat()
    raw_dir.mkdir(parents=True, exist_ok=True)
    rows, errors = [], []
    with HogangnonoBrowser(hcfg["request_interval_sec"], hcfg["headless"],
                           hcfg.get("browser_channel")) as hb:
        for t in targets:
            try:
                v = hb.visit(t["url"])
            except Exception as e:
                errors.append(f"호갱노노 {t['url']}: {type(e).__name__}: {e}")
                continue
            safe = re.sub(r"[^\w.-]", "_", t["id"])[:80]
            (raw_dir / f"{safe}.json").write_text(json.dumps(v, ensure_ascii=False, indent=1),
                                                  encoding="utf-8")
            rows.append(summarize(t, v))
            log.info("  호갱노노 %s: API 응답 %d개", rows[-1]["name"], rows[-1]["api_calls"])
    return rows, errors


def probe(cfg: dict, data_dir: Path) -> str:
    """첫 단지의 페이지가 호출하는 JSON 엔드포인트 목록 — 전용 파서를 만들 때 사용."""
    targets = normalize_targets(cfg["hogangnono"].get("apartments"))
    if not targets:
        return "hogangnono.apartments 에 단지 URL 을 하나 이상 넣어 주세요."
    hcfg = cfg["hogangnono"]
    with HogangnonoBrowser(hcfg["request_interval_sec"], hcfg["headless"],
                           hcfg.get("browser_channel")) as hb:
        v = hb.visit(targets[0]["url"])
    out = data_dir / "raw" / "hogangnono_probe.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(v, ensure_ascii=False, indent=1), encoding="utf-8")
    lines = [f"페이지: {v['meta'].get('final_url')}", f"제목: {v['meta'].get('title')}",
             f"설명: {v['meta'].get('description')}", "", "JSON 응답:"]
    for r in v["responses"]:
        keys = list(r["body"].keys())[:8] if isinstance(r["body"], dict) else type(r["body"]).__name__
        lines.append(f"  [{r['status']}] {r['url'][:140]}  keys={keys}")
    lines.append(f"\n전체 원본: {out}")
    return "\n".join(lines)
