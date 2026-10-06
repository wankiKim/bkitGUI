"""네이버페이 부동산 (fin.land.naver.com) 매물 수집.

경로 (2026-08 공개 구현들에서 동작 확인된 방식):
  - 지역 트리: GET m.land.naver.com/map/getRegionList?cortarNo=...  (requests, 키 불필요)
      → result.list[] = {CortarNo, CortarNm, MapXCrdn, MapYCrdn}
  - 매물 목록: POST fin.land.naver.com/front-api/v1/article/legalDivisionArticleList
      → 일반 requests 로는 403/429 가 나므로, 실제 Chrome(Playwright)으로 fin.land
        페이지를 연 뒤 같은 페이지 안에서 fetch 를 실행한다.
      → 응답 {isSuccess, result: {list[], hasNextPage, lastInfo, seed}}, 페이지당 최대 30건.

네이버는 비공식 API 이므로 사이트 개편 시 필드명이 바뀔 수 있다. 그때는
parse_article() 만 고치면 된다 (tests/fixtures 의 샘플과 함께).
"""

import json
import logging
import time
from pathlib import Path

import requests

from .util import Throttle, sido_key, sigungu_matches, to_float, ymd

log = logging.getLogger(__name__)

REGION_URL = "https://m.land.naver.com/map/getRegionList"
ROOT_CORTAR = "0000000000"
FIN_HOME = "https://fin.land.naver.com/home"
ARTICLE_API = "/front-api/v1/article/legalDivisionArticleList"
ARTICLE_PAGE = "https://fin.land.naver.com/articles/{}"
PAGE_SIZE = 30

MOBILE_UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
             "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")

TRADE_TYPE_NAMES = {"A1": "매매", "B1": "전세", "B2": "월세", "B3": "단기임대"}
REAL_ESTATE_TYPE_NAMES = {"A01": "아파트", "A02": "오피스텔", "A04": "재건축", "B01": "분양권",
                          "C02": "빌라"}

FETCH_JS = """async (payload) => {
    const opt = payload.body
        ? {method: 'POST',
           headers: {'Content-Type': 'application/json',
                     'Accept': 'application/json, text/plain, */*'},
           body: JSON.stringify(payload.body)}
        : {headers: {'Accept': 'application/json, text/plain, */*'}};
    const res = await fetch(payload.url, opt);
    return {status: res.status, text: await res.text()};
}"""


class NaverBlocked(RuntimeError):
    pass


# ── 지역 트리 ─────────────────────────────────────────────────────────

class RegionResolver:
    """config regions → 법정동(10자리 코드) 목록. 지역 트리는 거의 안 바뀌므로 파일 캐시."""

    def __init__(self, cache_path: Path, interval_sec: float = 1.0):
        self.cache_path = cache_path
        self.cache = {}
        if cache_path.exists():
            try:
                self.cache = json.loads(cache_path.read_text(encoding="utf-8"))
            except ValueError:
                self.cache = {}
        self.throttle = Throttle(interval_sec)
        self.sess = requests.Session()
        self.sess.headers.update({
            "User-Agent": MOBILE_UA,
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "ko-KR,ko;q=0.9",
            "Referer": "https://m.land.naver.com/",
            "X-Requested-With": "XMLHttpRequest",
        })

    def children(self, code: str) -> list[dict]:
        hit = self.cache.get(code)
        if hit and time.time() - hit["t"] < 30 * 86400:
            return hit["v"]
        self.throttle.wait()
        try:
            r = self.sess.get(REGION_URL, params={"cortarNo": code}, timeout=20)
            r.raise_for_status()
            rows = ((r.json().get("result") or {}).get("list")) or []
        except (requests.RequestException, ValueError):
            if hit:  # 차단/장애 시 오래된 캐시라도 사용 (지역 트리는 사실상 불변)
                log.warning("지역 트리 조회 실패 — 캐시 사용: %s", code)
                return hit["v"]
            raise
        out = [{"code": c.get("CortarNo"), "name": c.get("CortarNm")} for c in rows]
        if out:
            self.cache[code] = {"t": time.time(), "v": out}
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(json.dumps(self.cache, ensure_ascii=False), encoding="utf-8")
        return out

    def resolve(self, regions: dict) -> list[dict]:
        sidos = {sido_key(s["name"]): s for s in self.children(ROOT_CORTAR)}
        dongs = []
        for sido_name, wants in regions.items():
            sido = sidos.get(sido_key(sido_name))
            if not sido:
                raise ValueError(f"시도 이름을 찾지 못했습니다: {sido_name}")
            matched = False
            for sigungu in self.children(sido["code"]):
                if not sigungu_matches(sigungu["name"], wants):
                    continue
                matched = True
                for dong in self.children(sigungu["code"]):
                    dongs.append({"sido": sido["name"], "sigungu": sigungu["name"],
                                  "dong": dong["name"], "code": dong["code"]})
            if not matched:
                raise ValueError(f"{sido_name} 에서 시군구 {wants} 를 찾지 못했습니다")
        return dongs


# ── 매물 파싱 ─────────────────────────────────────────────────────────

def parse_article(item: dict, region: dict | None = None) -> dict | None:
    """legalDivisionArticleList 의 list[] 항목 → 저장용 dict."""
    a = item.get("representativeArticleInfo") or item
    no = a.get("articleNumber")
    if not no:
        return None
    space = a.get("spaceInfo") or {}
    detail = a.get("articleDetail") or {}
    price = a.get("priceInfo") or {}
    verify = a.get("verificationInfo") or {}
    broker = a.get("brokerInfo") or {}
    trade = a.get("tradeType")
    region = region or {}
    return {
        "source": "naver",
        "id": str(no),
        "region_code": region.get("code"),
        "sido": region.get("sido"),
        "sigungu": region.get("sigungu"),
        "dong": region.get("dong"),
        "complex_name": a.get("complexName") or "",
        "article_name": a.get("articleName") or a.get("complexName") or "",
        "building": a.get("dongName") or "",
        "trade_type": TRADE_TYPE_NAMES.get(trade, trade),
        "real_estate_type": REAL_ESTATE_TYPE_NAMES.get(a.get("realEstateType"),
                                                       a.get("realEstateType")),
        # 매매가 / 보증금 / 월세 (원)
        "price": price.get("dealPrice") or price.get("warrantyPrice") or 0,
        "rent": price.get("rentPrice") or 0,
        "area_m2": to_float(space.get("exclusiveSpace")),
        "supply_m2": to_float(space.get("supplySpace")),
        "floor": detail.get("floorInfo") or "",
        "direction": detail.get("direction") or "",
        "description": (detail.get("articleFeatureDescription") or "").strip(),
        "realtor": broker.get("brokerageName") or "",
        "confirm_date": ymd(verify.get("articleConfirmDate")),
        "url": ARTICLE_PAGE.format(no),
    }


def article_filter(dong_code: str, trade_types, real_estate_types) -> dict:
    return {
        "tradeTypes": list(trade_types),
        "realEstateTypes": list(real_estate_types),
        "roomCount": [], "bathRoomCount": [], "optionTypes": [],
        "oneRoomShapeTypes": [], "moveInTypes": [], "filtersExclusiveSpace": False,
        "floorTypes": [], "directionTypes": [], "hasArticlePhoto": False,
        "isAuthorizedByOwner": False, "parkingTypes": [], "entranceTypes": [],
        "hasArticle": False,
        "legalDivisionNumbers": [dong_code], "legalDivisionType": "EUP",
    }


# ── 브라우저 클라이언트 ───────────────────────────────────────────────

class FinLandBrowser:
    """실제 Chrome 한 세션으로 fin.land front-api 를 호출한다. with 문으로 사용."""

    def __init__(self, interval_sec=0.8, headless=True, channel="chrome"):
        self.throttle = Throttle(interval_sec, 0.4)
        self.headless = headless
        self.channel = channel
        self._pw = self._browser = self._page = None

    def __enter__(self):
        from playwright.sync_api import sync_playwright
        self._pw = sync_playwright().start()
        self._open()
        return self

    def __exit__(self, *exc):
        try:
            if self._browser:
                self._browser.close()
        finally:
            if self._pw:
                self._pw.stop()

    def _launch(self):
        args = ["--disable-blink-features=AutomationControlled"]
        try:
            return self._pw.chromium.launch(channel=self.channel or None,
                                            headless=self.headless, args=args, timeout=120000)
        except Exception as e:  # Chrome 미설치 → Playwright 내장 Chromium
            if not self.channel:
                raise
            log.warning("Chrome(%s) 실행 실패, 내장 Chromium 으로 재시도: %s", self.channel, e)
            return self._pw.chromium.launch(headless=self.headless, args=args, timeout=120000)

    def _open(self):
        if self._browser:
            try:
                self._browser.close()
            except Exception:
                pass
        self._browser = self._launch()
        ctx = self._browser.new_context(user_agent=MOBILE_UA, locale="ko-KR",
                                        viewport={"width": 390, "height": 844}, is_mobile=True)
        self._page = ctx.new_page()
        self._page.goto(FIN_HOME, wait_until="domcontentloaded", timeout=45000)
        self._page.wait_for_timeout(2000)
        if "fin.land" not in self._page.url:
            raise NaverBlocked(f"fin.land 홈 로드 실패(봇 감지 가능성): {self._page.url}")

    def post(self, url: str, body: dict, _retried=False) -> dict:
        self.throttle.wait()
        try:
            r = self._page.evaluate(FETCH_JS, {"url": url, "body": body})
        except Exception:
            if _retried:
                raise
            self._open()
            return self.post(url, body, _retried=True)
        if r["status"] != 200:
            if not _retried:
                time.sleep(10)
                self._open()
                return self.post(url, body, _retried=True)
            raise NaverBlocked(f"front-api HTTP {r['status']}: {r['text'][:150]}")
        d = json.loads(r["text"])
        if not d.get("isSuccess"):
            raise NaverBlocked(f"front-api 실패 응답: {r['text'][:150]}")
        return d.get("result") or {}

    def dong_articles(self, region: dict, trade_types, real_estate_types, max_pages=40):
        """법정동 하나의 매물 전체 (페이지 끝까지). 반환: (rows, truncated)"""
        body = {
            "filter": article_filter(region["code"], trade_types, real_estate_types),
            "articlePagingRequest": {"size": PAGE_SIZE, "userChannelType": "MOBILE",
                                     "articleSortType": "RANKING_DESC", "lastInfo": []},
        }
        rows, seen = [], set()
        for _ in range(max_pages):
            res = self.post(ARTICLE_API, body)
            for item in res.get("list") or []:
                row = parse_article(item, region)
                if row and row["id"] not in seen:
                    seen.add(row["id"])
                    rows.append(row)
            if not res.get("hasNextPage"):
                return rows, False
            body["articlePagingRequest"]["lastInfo"] = res.get("lastInfo") or []
            if res.get("seed"):
                body["articlePagingRequest"]["seed"] = res["seed"]
        return rows, True


def collect(cfg: dict, data_dir: Path):
    """설정된 지역 전체의 네이버 매물. 반환: (rows, done_dong_codes, errors)"""
    ncfg = cfg["naver"]
    resolver = RegionResolver(data_dir / "cache" / "naver_regions.json")
    dongs = resolver.resolve(cfg["regions"])
    log.info("네이버: 법정동 %d곳 수집 시작", len(dongs))
    rows, done, errors = [], [], []
    with FinLandBrowser(ncfg["request_interval_sec"], ncfg["headless"],
                        ncfg.get("browser_channel")) as fin:
        for i, d in enumerate(dongs, 1):
            try:
                got, truncated = fin.dong_articles(d, ncfg["trade_types"],
                                                   ncfg["real_estate_types"],
                                                   ncfg["max_pages_per_dong"])
            except NaverBlocked as e:
                errors.append(f"{d['sigungu']} {d['dong']}: {e}")
                log.error("네이버 차단 감지 — 남은 동 수집 중단: %s", e)
                break
            except Exception as e:  # 한 동의 실패가 전체를 멈추지 않게
                errors.append(f"{d['sigungu']} {d['dong']}: {type(e).__name__}: {e}")
                log.warning("네이버 %s %s 실패: %s", d["sigungu"], d["dong"], e)
                continue
            rows.extend(got)
            # 페이지 상한으로 잘린 동은 '사라진 매물' 판정에서 제외한다
            if truncated:
                errors.append(f"{d['sigungu']} {d['dong']}: 페이지 상한 도달 — 일부 누락")
            else:
                done.append(d["code"])
            log.info("  [%d/%d] %s %s: %d건", i, len(dongs), d["sigungu"], d["dong"], len(got))
    return rows, done, errors
