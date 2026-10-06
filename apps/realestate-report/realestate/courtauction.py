"""법원경매정보 (courtauction.go.kr) 부동산 경매 물건 수집.

2024 개편 사이트(WebSquare)의 JSON 엔드포인트를 사용한다. 인증은 필요 없지만
세션 쿠키가 없으면 '보안정책' 차단이 나므로 index.on 을 먼저 GET 한다.

  POST /pgj/pgjsearch/searchControllerMain.on
    body {dma_pageInfo: {...}, dma_srchGdsDtlSrchInfo: {...}}
    resp data.dlt_srchResult[] (물건), data.dma_pageInfo.totalCnt, data.ipcheck

IP 차단이 공격적이다(30초에 16회 정도면 1시간 차단 사례). 요청 간격은 2초 이상,
차단(ipcheck=false) 감지 시 재시도하지 않고 즉시 중단한다 — 재시도하면 차단이 길어진다.

매각기일이 [오늘, 오늘+window_days] 인 물건을 전국 단위로 받은 뒤 주소로 지역을 거른다
(법원 지역코드 체계에 의존하지 않기 위함).
"""

import logging
import time
from datetime import date, timedelta

import requests

from .util import Throttle, address_in_regions, to_float, to_int, ymd

log = logging.getLogger(__name__)

BASE = "https://www.courtauction.go.kr"
SEARCH_PATH = "/pgj/pgjsearch/searchControllerMain.on"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
MAX_PAGE_SIZE = 50  # 100 은 HTTP 400

# 용도 코드: (대분류, 중분류, 소분류)
USAGE_CODES = {
    "apartment": ("20000", "20100", "20104"),   # 건물 > 주거용 > 아파트
    "residential": ("20000", "20100", ""),      # 건물 > 주거용 전체
    "all": ("", "", ""),
}
USAGE_LABEL = {"apartment": "아파트", "residential": "주거용", "all": ""}


class CourtAuctionBlocked(RuntimeError):
    pass


def search_payload(page_no: int, page_size: int, begin: str, end: str,
                   usage: str = "apartment", max_failed_bids="", total=None) -> dict:
    lcl, mcl, scl = USAGE_CODES.get(usage, USAGE_CODES["apartment"])
    return {
        "dma_pageInfo": {
            "pageNo": page_no, "pageSize": page_size, "bfPageNo": "",
            "startRowNo": (page_no - 1) * page_size + 1,
            "totalCnt": total if total is not None else "",
            "totalYn": "Y" if total is None else "N",
            "groupTotalCount": "",
        },
        "dma_srchGdsDtlSrchInfo": {
            "rletDspslSpcCondCd": "", "bidDvsCd": "000331",
            "mvprpRletDvsCd": "00031R", "cortAuctnSrchCondCd": "0004601",
            "rprsAdongSdCd": "", "rprsAdongSggCd": "", "rprsAdongEmdCd": "",
            "rdnmSdCd": "", "rdnmSggCd": "", "rdnmNo": "",
            "mvprpDspslPlcAdongSdCd": "", "mvprpDspslPlcAdongSggCd": "",
            "mvprpDspslPlcAdongEmdCd": "", "rdDspslPlcAdongSdCd": "",
            "rdDspslPlcAdongSggCd": "", "rdDspslPlcAdongEmdCd": "",
            "cortOfcCd": "", "jdbnCd": "", "execrOfcDvsCd": "",
            "lclDspslGdsLstUsgCd": lcl, "mclDspslGdsLstUsgCd": mcl,
            "sclDspslGdsLstUsgCd": scl,
            "cortAuctnMbrsId": "", "aeeEvlAmtMin": "", "aeeEvlAmtMax": "",
            "lwsDspslPrcRateMin": "", "lwsDspslPrcRateMax": "",
            "flbdNcntMin": "", "flbdNcntMax": str(max_failed_bids or ""),
            "objctArDtsMin": "", "objctArDtsMax": "",
            "mvprpArtclKndCd": "", "mvprpArtclNm": "", "mvprpAtchmPlcTypCd": "",
            "notifyLoc": "off", "lafjOrderBy": "", "pgmId": "PGJ151F01",
            "csNo": "", "cortStDvs": "1", "statNum": 1,
            "bidBgngYmd": begin, "bidEndYmd": end,
            "dspslDxdyYmd": "", "fstDspslHm": "", "scndDspslHm": "",
            "thrdDspslHm": "", "fothDspslHm": "", "dspslPlcNm": "",
            "lwsDspslPrcMin": "", "lwsDspslPrcMax": "",
            "grbxTypCd": "", "gdsVendNm": "", "fuelKndCd": "",
            "carMdyrMax": "", "carMdyrMin": "", "carMdlNm": "", "sideDvsCd": "",
        },
    }


def parse_item(row: dict, usage_label: str = "") -> dict | None:
    case_no = row.get("srnSaNo") or ""
    court_cd = row.get("boCd") or ""
    seq = str(row.get("maemulSer") or "1")
    item_id = row.get("docid") or (f"{court_cd}-{case_no}-{seq}" if case_no else None)
    if not item_id:
        return None
    addr = (row.get("printSt") or "").strip()
    if not addr:
        addr = " ".join(x for x in (row.get("hjguSido"), row.get("hjguSigu"),
                                    row.get("hjguDong"), row.get("daepyoLotno")) if x)
    appraisal = to_int(row.get("gamevalAmt"))
    min_price = to_int(row.get("minmaePrice"))
    ratio = round(min_price / appraisal * 100) if appraisal and min_price else None
    return {
        "id": str(item_id),
        "case_no": case_no,
        "item_seq": seq,
        "court": row.get("jiwonNm") or "",
        "court_code": court_cd,
        "dept": row.get("jpDeptNm") or "",
        "phone": row.get("tel") or "",
        "address": addr,
        "building": row.get("buldNm") or "",
        "usage": usage_label,
        "area": str(row.get("areaList") or row.get("buldList") or "").strip(),
        "area_m2": to_float(row.get("objctArDts")),
        "appraisal": appraisal,
        "min_price": min_price,
        "min_ratio": ratio,
        "failed_bids": to_int(row.get("yuchalCnt")) or 0,
        "sale_date": ymd(row.get("maeGiil")),
        "url": f"{BASE}/pgj/index.on",
    }


class CourtAuctionClient:
    def __init__(self, interval_sec: float = 2.5):
        self.throttle = Throttle(max(interval_sec, 2.0), 1.0)
        self.sess = self._new_session()

    @staticmethod
    def _new_session():
        s = requests.Session()
        s.headers.update({"User-Agent": UA, "Accept": "application/json",
                          "Origin": BASE, "Referer": f"{BASE}/pgj/index.on"})
        r = s.get(f"{BASE}/pgj/index.on", timeout=30)
        r.raise_for_status()
        return s

    def post(self, path: str, payload: dict) -> dict:
        last = None
        for attempt in range(3):
            self.throttle.wait()
            try:
                r = self.sess.post(f"{BASE}{path}", json=payload, timeout=60,
                                   headers={"Content-Type": "application/json;charset=UTF-8"})
                r.raise_for_status()
                body = r.json()
            except (requests.RequestException, ValueError) as e:
                last = e
                wait = 10 * (2 ** attempt)
                log.warning("법원경매 요청 실패(%d/3) — %ds 후 재시도: %s", attempt + 1, wait, e)
                time.sleep(wait)
                try:
                    self.sess = self._new_session()
                except requests.RequestException:
                    pass
                continue
            data = body.get("data") or {}
            if data.get("ipcheck") is False:
                raise CourtAuctionBlocked(
                    "법원경매정보가 이 IP를 일시 차단했습니다(ipcheck=false). 약 1시간 뒤 풀리며, "
                    "그 전에 재시도하면 차단이 길어질 수 있습니다. request_interval_sec 를 늘리세요.")
            msg = str(body.get("message") or "")
            if any(k in msg for k in ("보안정책", "차단", "비정상")):
                raise CourtAuctionBlocked(f"법원경매 차단 응답: {msg[:120]}")
            if body.get("errors"):
                raise RuntimeError(f"법원경매 오류 응답: {body['errors']}")
            return data
        raise last

    def search(self, window_days=30, usage="apartment", max_failed_bids="",
               page_size=50, max_pages=60):
        page_size = min(int(page_size), MAX_PAGE_SIZE)
        today = date.today()
        begin, end = today.strftime("%Y%m%d"), (today + timedelta(days=window_days)).strftime("%Y%m%d")
        rows, seen, total = [], set(), None
        for page in range(1, max_pages + 1):
            data = self.post(SEARCH_PATH, search_payload(page, page_size, begin, end, usage,
                                                         max_failed_bids, total))
            got = data.get("dlt_srchResult") or []
            total = to_int((data.get("dma_pageInfo") or {}).get("totalCnt")) or 0
            new = [r for r in got if (r.get("docid") or id(r)) not in seen]
            seen.update(r.get("docid") or id(r) for r in got)
            rows.extend(new)
            log.info("  법원경매 %d페이지: %d건 (전체 %d)", page, len(got), total)
            # 같은 페이지가 반복되면(서버가 pageNo 무시) 중단
            if not got or not new or page * page_size >= total:
                return rows, False
        return rows, True


def collect(cfg: dict):
    """반환: (items, complete, errors) — complete=False 면 '종료된 물건' 판정을 하지 않는다."""
    ccfg = cfg["courtauction"]
    client = CourtAuctionClient(ccfg["request_interval_sec"])
    raw, truncated = client.search(ccfg["window_days"], ccfg["usage"], ccfg["max_failed_bids"],
                                   ccfg["page_size"], ccfg["max_pages"])
    label = USAGE_LABEL.get(ccfg["usage"], "")
    items = []
    for r in raw:
        it = parse_item(r, label)
        if it and address_in_regions(it["address"], cfg["regions"]):
            items.append(it)
    errors = ["법원경매: 페이지 상한 도달 — 일부 누락 (courtauction.max_pages 를 늘리세요)"] \
        if truncated else []
    log.info("법원경매: 전국 %d건 중 관심 지역 %d건", len(raw), len(items))
    return items, not truncated, errors
