# realestate-report — 부동산 매물·경매 일일 리포트

관심 지역(시군구/동 단위)의 **네이버페이 부동산 매물**과 **법원경매 물건**을 매일 수집해
전날과 비교한 HTML 리포트를 만듭니다. **호갱노노**는 관심 단지 요약을 함께 붙입니다(실험적).

```
config.json (관심 지역)
   │
   ├─ 법원경매정보 ── 매각기일 30일 내 물건 → 주소로 지역 필터
   ├─ 네이버페이 부동산 ── 법정동별 매물 전체 (실제 Chrome 으로 조회)
   └─ 호갱노노 ── 관심 단지 페이지 요약 + 원본 JSON 저장 (실험적)
   │
   ▼
data/realestate.db (SQLite, 매일 누적)  →  reports/YYYY-MM-DD.html, reports/latest.html, reports/csv/
```

## 리포트에 담기는 것

| 구분 | 내용 |
|---|---|
| 경매 | N일 내 매각기일(D-day), 신규 경매, **최저가·유찰·기일 변동**, 목록에서 빠진 물건 |
| 매물 | **가격 변동**(이전 → 현재, %), 신규 매물(동별), 내려간 매물, 지역별 매물 수 |
| 호갱노노 | 관심 단지 요약 문구와 전날 대비 변경 여부 |
| 공통 | 소스별 수집 상태·오류, 표 검색 필터, 엑셀용 CSV(UTF-8 BOM) |

첫 실행은 **기준선**을 저장하는 날이라 "신규"를 표시하지 않고, 다음 날부터 변화만 보여 줍니다.

## 설치 (내 PC)

국내 가정용 인터넷에서 실행하는 것을 전제로 합니다. 네이버·법원경매는 해외/데이터센터 IP를
자주 차단하므로 클라우드 서버나 GitHub Actions 에서는 잘 동작하지 않습니다.

```bash
cd apps/realestate-report
python -m venv .venv
# Windows: .venv\Scripts\activate   /  macOS·Linux: source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium        # Chrome 이 설치돼 있으면 Chrome 을 우선 사용합니다
cp config.example.json config.json # Windows: copy config.example.json config.json
```

Python 3.10 이상이 필요합니다. 네이버 매물은 실제 Chrome 브라우저가 있어야 가장 안정적입니다.

## 설정 (`config.json`)

```json
"regions": {
  "경기도": ["수원시", "화성시"]
}
```

- 시도 이름은 `서울`·`서울시`·`서울특별시` 모두 됩니다.
- 시군구에 `"*"` 를 넣으면 시도 전체입니다. `"수원시"` 는 장안·권선·팔달·영통구를,
  `"화성시"` 는 화성시 아래 구(동탄구 등)가 있든 없든 화성시 전체를 포함합니다(앞부분 일치).
- 지역이 어떻게 풀리는지 확인: `python -m realestate regions`

| 키 | 기본값 | 설명 |
|---|---|---|
| `naver.trade_types` | `["A1","B1"]` | A1 매매, B1 전세, B2 월세 |
| `naver.real_estate_types` | `["A01","A04"]` | A01 아파트, A04 재건축 |
| `naver.request_interval_sec` | 0.8 | 요청 간격. 차단되면 늘리세요 |
| `courtauction.usage` | `apartment` | `apartment` 아파트 / `residential` 주거용 전체 / `all` 부동산 전체 |
| `courtauction.window_days` | 30 | 오늘부터 며칠 안의 매각기일을 수집할지 |
| `courtauction.max_failed_bids` | `""` | 유찰 횟수 상한 (빈 값이면 제한 없음) |
| `courtauction.request_interval_sec` | 2.5 | **2초 미만으로 줄이지 마세요** (1시간 IP 차단) |
| `hogangnono.enabled` / `apartments` | false / [] | 관심 단지 URL 목록 (`https://hogangnono.com/apt/...`) |
| `report.upcoming_auction_days` | 14 | "곧 있을 매각기일" 범위 |
| `report.price_change_min_pct` | 0 | 이 % 미만 가격 변동은 숨김 |
| `report.open_in_browser` | false | 실행 후 리포트를 브라우저로 열기 |

## 실행

```bash
python -m realestate run                     # 전체 수집 + 리포트
python -m realestate run --only courtauction # 특정 소스만
python -m realestate report                  # 리포트만 다시 생성
```

## 매일 자동 실행

**Windows** (PowerShell):
```powershell
powershell -ExecutionPolicy Bypass -File scripts\install_task_windows.ps1 -Time 07:10
```
PC가 꺼져 있어 시각을 놓치면 켜진 뒤 바로 실행됩니다. 로그: `data\task.log`

**macOS / Linux**:
```bash
./scripts/install_cron.sh 7 10     # 매일 07:10
```
로그: `data/cron.log`, 소스별 상세 로그: `data/logs/`

## 호갱노노 (실험적)

호갱노노는 공개된 API 문서도, 검증된 공개 구현도 없어 고정 엔드포인트를 가정하지 않았습니다.
지금은 관심 단지 페이지를 실제 브라우저로 열어 **요약 문구(메타 설명)** 를 리포트에 넣고,
페이지가 받은 **JSON 응답 원본**을 `data/raw/hogangnono/날짜/` 에 저장합니다.

```bash
python -m realestate probe-hogangnono
```
위 명령의 출력(엔드포인트·키 목록)을 공유해 주시면 시세·실거래 전용 파서를 붙일 수 있습니다.

## 문제 해결

| 증상 | 조치 |
|---|---|
| 법원경매 `ipcheck=false` 차단 | 약 1시간 뒤 자연 복구. 그 사이 재실행하면 차단이 길어집니다. 간격을 늘리세요 |
| 네이버 `front-api HTTP 403/429` | `naver.request_interval_sec` 를 1.5 이상으로, `headless: false` 로 시도 |
| `Chrome 실행 실패` | Chrome 을 설치하거나 `browser_channel: ""` 로 Playwright Chromium 사용 |
| 필드가 비어 보임 | 사이트 개편 가능성. `realestate/naver.py` 의 `parse_article`, `courtauction.py` 의 `parse_item` 수정 |

## 주의

- 세 사이트 모두 **비공식 경로**로 수집합니다. 사이트 개편 시 수정이 필요할 수 있고,
  각 서비스 이용약관은 자동 수집을 제한할 수 있습니다. **개인 참고용**으로 낮은 빈도(하루 1회)로만 쓰세요.
- 경매 입찰·매물 계약 전에는 반드시 법원경매정보 원문(매각물건명세서 등)과 중개사를 통해 확인하세요.

## 개발

```bash
python -m unittest discover -s tests   # 네트워크 없이 파서·저장소·리포트 검증
```
