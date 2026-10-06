"""일일 HTML 리포트 생성 (+ 엑셀용 CSV)."""

import csv
import html
from datetime import date, timedelta
from pathlib import Path

from .util import won_to_text

STATUS_LABEL = {"ok": "정상", "partial": "일부 실패", "failed": "실패", "skipped": "건너뜀"}
SOURCE_LABEL = {"naver": "네이버페이 부동산", "courtauction": "법원경매정보", "hogangnono": "호갱노노"}


def e(v) -> str:
    return html.escape("" if v is None else str(v))


def link(text, url) -> str:
    return f'<a href="{e(url)}" target="_blank" rel="noopener">{e(text)}</a>' if url else e(text)


def pct(new, old):
    if not old or new is None:
        return None
    return (new - old) / old * 100


def price_text(row) -> str:
    if row.get("trade_type") == "월세":
        return f"{won_to_text(row.get('price'))} / {won_to_text(row.get('rent'))}"
    return won_to_text(row.get("price"))


def area_text(row) -> str:
    a = row.get("area_m2")
    return f"{a:.1f}㎡ ({a / 3.3058:.0f}평)" if a else "-"


def d_day(sale_date: str, today: date) -> str:
    if not sale_date:
        return ""
    try:
        n = (date.fromisoformat(sale_date) - today).days
    except ValueError:
        return ""
    return "D-day" if n == 0 else (f"D-{n}" if n > 0 else f"D+{-n}")


def table(headers, rows, cls="") -> str:
    if not rows:
        return '<p class="empty">해당 없음</p>'
    head = "".join(f"<th>{e(h)}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<div class="tbl"><table class="{cls}"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'


def listing_name(r) -> str:
    name = r.get("complex_name") or r.get("article_name") or "-"
    if r.get("building"):
        name += f" {r['building']}"
    return link(name, r.get("url"))


# ── 섹션 ──────────────────────────────────────────────────────────────

def auction_rows(items, today):
    out = []
    for a in items:
        ratio = f" <span class='muted'>({a['min_ratio']}%)</span>" if a.get("min_ratio") else ""
        out.append([
            f"{e(a.get('sale_date') or '-')}<br><span class='badge'>{d_day(a.get('sale_date'), today)}</span>",
            f"{e(a.get('address'))}<br><span class='muted'>{e(a.get('building'))} {e(a.get('area'))}</span>",
            e(won_to_text(a.get("appraisal"))),
            f"<b>{e(won_to_text(a.get('min_price')))}</b>{ratio}",
            e(a.get("failed_bids") or 0),
            f"{e(a.get('court'))}<br>{link(a.get('case_no'), a.get('url'))}",
        ])
    return out


AUCTION_HEAD = ["매각기일", "소재지", "감정가", "최저매각가", "유찰", "법원/사건"]


def auction_change_rows(items, today):
    out = []
    for a in items:
        changes = []
        if a.get("prev_min_price") != a.get("min_price"):
            p = pct(a.get("min_price"), a.get("prev_min_price"))
            changes.append(f"최저가 {won_to_text(a.get('prev_min_price'))} → "
                           f"<b>{won_to_text(a.get('min_price'))}</b>"
                           + (f" ({p:+.0f}%)" if p is not None else ""))
        if a.get("prev_failed_bids") != a.get("failed_bids"):
            changes.append(f"유찰 {a.get('prev_failed_bids')} → {a.get('failed_bids')}")
        if a.get("prev_sale_date") != a.get("sale_date"):
            changes.append(f"기일 {a.get('prev_sale_date')} → {a.get('sale_date')}")
        out.append([
            f"{e(a.get('sale_date') or '-')}<br><span class='badge'>{d_day(a.get('sale_date'), today)}</span>",
            f"{e(a.get('address'))}<br><span class='muted'>{e(a.get('building'))}</span>",
            "<br>".join(changes),
            f"{e(a.get('court'))}<br>{link(a.get('case_no'), a.get('url'))}",
        ])
    return out


def price_change_rows(items, min_pct):
    out = []
    for r in items:
        if r.get("trade_type") == "월세" and r.get("prev_price") == r.get("price"):
            new, old = r.get("rent"), r.get("prev_rent")
        else:
            new, old = r.get("price"), r.get("prev_price")
        p = pct(new, old)
        if p is not None and abs(p) < min_pct:
            continue
        cls = "down" if (p or 0) < 0 else "up"
        prev = dict(r, price=r.get("prev_price"), rent=r.get("prev_rent"))
        out.append([
            f"{e(r.get('sigungu'))} {e(r.get('dong'))}",
            listing_name(r),
            e(r.get("trade_type")),
            area_text(r),
            e(r.get("floor")),
            f"{e(price_text(prev))} → <b>{e(price_text(r))}</b>",
            f"<span class='{cls}'>{p:+.1f}%</span>" if p is not None else "-",
        ])
    return out


def listing_rows(items):
    return [[
        listing_name(r), e(r.get("trade_type")), f"<b>{e(price_text(r))}</b>", area_text(r),
        e(r.get("floor")), e(r.get("direction")),
        f"<span class='muted'>{e((r.get('description') or '')[:60])}</span>",
        e(r.get("realtor")),
    ] for r in items]


LISTING_HEAD = ["단지/매물", "거래", "가격", "전용면적", "층", "향", "특징", "중개사"]


def grouped_listings(items, open_first=True) -> str:
    groups = {}
    for r in items:
        groups.setdefault(f"{r.get('sigungu') or ''} {r.get('dong') or ''}".strip(), []).append(r)
    parts = []
    for i, (k, rows) in enumerate(groups.items()):
        opened = " open" if open_first and len(groups) <= 3 else ""
        parts.append(f"<details{opened}><summary>{e(k or '기타')} <span class='count'>{len(rows)}</span>"
                     f"</summary>{table(LISTING_HEAD, listing_rows(rows), 'filterable')}</details>")
    return "".join(parts) or '<p class="empty">해당 없음</p>'


def stats_rows(stats):
    pivot = {}
    for s in stats:
        key = (s["sigungu"], s["dong"])
        pivot.setdefault(key, {})[s["trade_type"]] = (s["cnt"], s["new_cnt"])
    types = sorted({s["trade_type"] for s in stats})
    rows = []
    for (sgg, dong), v in pivot.items():
        cells = []
        for t in types:
            cnt, new = v.get(t, (0, 0))
            cells.append(f"{cnt:,}" + (f" <span class='up'>+{new}</span>" if new else ""))
        rows.append([e(sgg), e(dong), *cells])
    return ["시군구", "법정동", *types], rows


# ── 전체 페이지 ───────────────────────────────────────────────────────

CSS = """
:root{--bg:#f7f7f5;--card:#fff;--fg:#1d1d1f;--muted:#6e6e73;--line:#e3e3e0;--accent:#2f6fde;
--up:#d0312d;--down:#1f5fbf;--badge:#eef2fb;--warn:#b26a00}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#151516;--card:#1f1f21;
--fg:#ececec;--muted:#a0a0a5;--line:#333336;--accent:#7aa7ff;--up:#ff7b6b;--down:#7aa7ff;
--badge:#26324a;--warn:#ffb74d}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);
font:14px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 10px;padding-bottom:6px;
border-bottom:1px solid var(--line)}h3{font-size:15px;margin:20px 0 8px}
.muted{color:var(--muted)}.empty{color:var(--muted);font-style:italic}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:16px 0}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.tile .n{font-size:24px;font-weight:700}.tile .l{color:var(--muted);font-size:12px}
.tbl{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;min-width:640px}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:12px;color:var(--muted);font-weight:600;white-space:nowrap}
tr:last-child td{border-bottom:0}a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.badge{display:inline-block;background:var(--badge);border-radius:6px;padding:0 6px;font-size:12px}
.up{color:var(--up);font-weight:600}.down{color:var(--down);font-weight:600}
.warn{color:var(--warn)}
details{background:var(--card);border:1px solid var(--line);border-radius:10px;margin:8px 0}
details>summary{cursor:pointer;padding:10px 14px;font-weight:600}
details .tbl{border:0;border-top:1px solid var(--line);border-radius:0 0 10px 10px}
.count{background:var(--badge);border-radius:10px;padding:0 8px;font-size:12px;margin-left:6px}
.status li{margin:2px 0}#q{width:100%;max-width:360px;padding:8px 10px;border:1px solid var(--line);
border-radius:8px;background:var(--card);color:var(--fg);margin:4px 0 8px}
"""

FILTER_JS = """
document.getElementById('q').addEventListener('input',function(){
  var q=this.value.trim().toLowerCase();
  document.querySelectorAll('table.filterable tbody tr').forEach(function(tr){
    tr.style.display=!q||tr.textContent.toLowerCase().indexOf(q)>=0?'':'none';});
  if(q)document.querySelectorAll('details').forEach(function(d){d.open=true;});
});
"""


def build_html(store, cfg, today: date) -> str:
    t = today.isoformat()
    rcfg = cfg["report"]
    until = (today + timedelta(days=rcfg["upcoming_auction_days"])).isoformat()
    runs = store.runs(t)
    sources = {r["source"] for r in runs}

    naver_baseline = "naver" in sources and not store.had_previous_run("naver", t)
    auction_baseline = "courtauction" in sources and not store.had_previous_run("courtauction", t)

    new_l = store.new_listings(t)
    closed_l = store.closed_listings(t)
    changes_l = price_change_rows(store.listing_price_changes(t), rcfg["price_change_min_pct"])
    new_a = store.new_auctions(t)
    upcoming = store.upcoming_auctions(t, until)
    changes_a = store.auction_changes(t)
    closed_a = store.closed_auctions(t)
    hogang = store.hogangnono_today(t)

    regions = ", ".join(f"{k} {'/'.join(v)}" for k, v in cfg["regions"].items())
    status_items = "".join(
        f"<li><b>{e(SOURCE_LABEL.get(r['source'], r['source']))}</b>: "
        f"<span class='{'warn' if r['status'] != 'ok' else ''}'>{e(STATUS_LABEL.get(r['status'], r['status']))}</span>"
        f" · {r['count']:,}건"
        + ("".join(f"<br><span class='muted'>· {e(x)}</span>" for x in r["errors"][:8]))
        + "</li>" for r in runs) or "<li class='empty'>오늘 수집 기록 없음</li>"

    def tile(n, label):
        return f"<div class='tile'><div class='n'>{n:,}</div><div class='l'>{e(label)}</div></div>"

    tiles = "".join([
        tile(len(upcoming), f"{rcfg['upcoming_auction_days']}일 내 매각기일"),
        tile(0 if auction_baseline else len(new_a), "신규 경매"),
        tile(len(changes_a), "경매 변동(유찰 등)"),
        tile(0 if naver_baseline else len(new_l), "신규 매물"),
        tile(len(changes_l), "매물 가격 변동"),
        tile(len(closed_l), "내려간 매물"),
    ])

    parts = [f"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>부동산 일일 리포트 {t}</title><style>{CSS}</style></head><body><main>
<h1>부동산 일일 리포트 · {t}</h1>
<div class="muted">관심 지역: {e(regions)}</div>
<div class="tiles">{tiles}</div>
<h2>수집 상태</h2><ul class="status">{status_items}</ul>
<input id="q" type="search" placeholder="단지명·동·중개사로 표 필터">"""]

    parts.append("<h2>경매 (법원경매정보)</h2>")
    parts.append(f"<h3>{rcfg['upcoming_auction_days']}일 내 매각기일</h3>")
    parts.append(table(AUCTION_HEAD, auction_rows(upcoming, today), "filterable"))
    parts.append("<h3>최저가·유찰·기일 변동</h3>")
    parts.append(table(["매각기일", "소재지", "변동 내용", "법원/사건"],
                       auction_change_rows(changes_a, today), "filterable"))
    if auction_baseline:
        parts.append(f"<h3>신규 경매</h3><p class='muted'>첫 수집입니다 — 현재 진행 물건 "
                     f"{store.active_auction_count(t):,}건을 기준선으로 저장했고, 내일부터 신규만 표시합니다.</p>")
    else:
        parts.append("<h3>신규 경매</h3>")
        parts.append(table(AUCTION_HEAD, auction_rows(new_a, today), "filterable"))
    if closed_a:
        parts.append(f"<details><summary>목록에서 빠진 경매 (매각·취하·기일 경과 등) "
                     f"<span class='count'>{len(closed_a)}</span></summary>"
                     f"{table(AUCTION_HEAD, auction_rows(closed_a, today), 'filterable')}</details>")

    parts.append("<h2>매물 (네이버페이 부동산)</h2>")
    parts.append("<h3>가격 변동</h3>")
    parts.append(table(["지역", "단지/매물", "거래", "전용면적", "층", "가격", "변동"],
                       changes_l, "filterable"))
    parts.append("<h3>신규 매물</h3>")
    if naver_baseline:
        parts.append(f"<p class='muted'>첫 수집입니다 — 현재 매물 {len(new_l):,}건을 기준선으로 "
                     f"저장했고, 내일부터 새로 올라온 매물만 표시합니다.</p>")
    else:
        parts.append(grouped_listings(new_l))
    if closed_l:
        parts.append(f"<h3>내려간 매물 (거래완료·삭제 추정)</h3>{grouped_listings(closed_l, False)}")
    stat_head, stat_rows = stats_rows(store.active_listing_stats(t))
    if stat_rows:
        parts.append("<details><summary>지역별 현재 매물 수</summary>"
                     f"{table(stat_head, stat_rows, 'filterable')}</details>")

    if hogang:
        parts.append("<h2>관심 단지 (호갱노노)</h2>")
        rows = []
        for h in hogang:
            changed = h.get("prev_summary") is not None and h["prev_summary"] != h["summary"]
            rows.append([link(h["name"], h["url"]),
                         ("<span class='up'>변경</span> " if changed else "") + e(h["summary"] or "-")])
        parts.append(table(["단지", "요약 (페이지 설명 문구)"], rows))

    parts.append("<p class='muted' style='margin-top:40px'>비공식 경로로 수집한 참고용 자료입니다. "
                 "입찰·계약 전에는 반드시 원문(법원경매정보, 중개사 확인)을 확인하세요.</p>")
    parts.append(f"<script>{FILTER_JS}</script></main></body></html>")
    return "".join(parts)


def write_csv(path: Path, rows: list[dict], cols: list[str]):
    with path.open("w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig: 엑셀 한글 깨짐 방지
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def write_report(store, cfg, today: date) -> Path:
    out_dir = Path(cfg["report"]["output_dir"])
    out_dir.mkdir(parents=True, exist_ok=True)
    t = today.isoformat()
    page = build_html(store, cfg, today)
    path = out_dir / f"{t}.html"
    path.write_text(page, encoding="utf-8")
    (out_dir / "latest.html").write_text(page, encoding="utf-8")

    csv_dir = out_dir / "csv"
    csv_dir.mkdir(exist_ok=True)
    from .store import AUCTION_COLS, LISTING_COLS
    write_csv(csv_dir / f"{t}_new_listings.csv", store.new_listings(t), LISTING_COLS)
    write_csv(csv_dir / f"{t}_auctions.csv",
              store.upcoming_auctions(t, "9999-12-31"), AUCTION_COLS)
    return path
