"""공통 유틸 — 금액 표기, 지역명 정규화, 요청 간격 제어."""

import random
import re
import time

_SIDO_SUFFIX = re.compile(r"(특별자치|특별|광역)?(시|도)$")

# 주소 앞머리에 오는 시도 약칭 → 정규화 키
_SIDO_ALIASES = {
    "서울": "서울", "부산": "부산", "대구": "대구", "인천": "인천", "광주": "광주",
    "대전": "대전", "울산": "울산", "세종": "세종", "경기": "경기", "강원": "강원",
    "충북": "충청북", "충남": "충청남", "전북": "전라북", "전남": "전라남",
    "경북": "경상북", "경남": "경상남", "제주": "제주",
    "충청북": "충청북", "충청남": "충청남", "전라북": "전라북", "전라남": "전라남",
    "경상북": "경상북", "경상남": "경상남", "전북특별자치": "전라북", "강원특별자치": "강원",
}


def sido_key(name: str) -> str:
    """'서울특별시'/'서울시'/'서울' → '서울', '경상남도'/'경남' → '경상남'."""
    n = (name or "").replace(" ", "")
    n = _SIDO_SUFFIX.sub("", n)
    return _SIDO_ALIASES.get(n, n)


def compact(s: str) -> str:
    return (s or "").replace(" ", "")


def sigungu_matches(sigungu_name: str, wants) -> bool:
    """config 의 시군구 목록과 일치하는지. '*' 는 전체.
    '성남시' 는 '성남시 분당구'·'성남시 수정구' 를 모두 포함한다."""
    if "*" in wants:
        return True
    name = compact(sigungu_name)
    return any(name.startswith(compact(w)) for w in wants if w)


def address_in_regions(address: str, regions: dict) -> bool:
    """'서울특별시 강남구 대치동 ...' 같은 주소가 config regions 에 속하는지."""
    parts = (address or "").split()
    if not parts:
        return False
    a_sido = sido_key(parts[0])
    rest = compact(" ".join(parts[1:]))
    for sido, wants in regions.items():
        if sido_key(sido) != a_sido:
            continue
        if "*" in wants:
            return True
        if any(rest.startswith(compact(w)) for w in wants if w):
            return True
    return False


def won_to_text(won) -> str:
    """원 단위 금액 → '12억 3,500만' 표기."""
    if won is None or won == "":
        return "-"
    try:
        won = int(won)
    except (TypeError, ValueError):
        return str(won)
    if won == 0:
        return "0"
    sign = "-" if won < 0 else ""
    won = abs(won)
    eok, rest = divmod(won, 100_000_000)
    man = rest // 10_000
    if eok and man:
        return f"{sign}{eok}억 {man:,}만"
    if eok:
        return f"{sign}{eok}억"
    if man:
        return f"{sign}{man:,}만"
    return f"{sign}{won:,}원"


def to_int(v):
    if v is None or v == "":
        return None
    try:
        return int(float(str(v).replace(",", "")))
    except (TypeError, ValueError):
        return None


def to_float(v):
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def ymd(s) -> str | None:
    """'20261015' / '2026.10.15' / '2026-10-15' → '2026-10-15'."""
    if not s:
        return None
    m = re.match(r"(\d{4})\D?(\d{1,2})\D?(\d{1,2})", str(s))
    if not m:
        return None
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


class Throttle:
    """요청 사이 최소 간격 + 지터. 사이트 차단을 피하는 가장 중요한 장치."""

    def __init__(self, interval_sec: float, jitter_sec: float = 0.4):
        self.interval = interval_sec
        self.jitter = jitter_sec
        self._last = 0.0

    def wait(self):
        gap = self.interval + random.uniform(0, self.jitter) - (time.time() - self._last)
        if gap > 0:
            time.sleep(gap)
        self._last = time.time()
