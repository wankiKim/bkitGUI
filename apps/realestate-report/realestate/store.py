"""SQLite 저장소 — 매일 수집분을 누적해 신규/가격변동/종료를 판정한다."""

import json
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS listings (
    source TEXT, id TEXT, region_code TEXT, sido TEXT, sigungu TEXT, dong TEXT,
    complex_name TEXT, article_name TEXT, building TEXT, trade_type TEXT,
    real_estate_type TEXT, price INTEGER, rent INTEGER, area_m2 REAL, supply_m2 REAL,
    floor TEXT, direction TEXT, description TEXT, realtor TEXT, confirm_date TEXT, url TEXT,
    first_seen TEXT, last_seen TEXT, closed_on TEXT,
    PRIMARY KEY (source, id)
);
CREATE TABLE IF NOT EXISTS listing_prices (
    source TEXT, id TEXT, seen_date TEXT, price INTEGER, rent INTEGER,
    PRIMARY KEY (source, id, seen_date)
);
CREATE TABLE IF NOT EXISTS auctions (
    id TEXT PRIMARY KEY, case_no TEXT, item_seq TEXT, court TEXT, court_code TEXT,
    dept TEXT, phone TEXT, address TEXT, building TEXT, usage TEXT, area TEXT, area_m2 REAL,
    appraisal INTEGER, min_price INTEGER, min_ratio INTEGER, failed_bids INTEGER,
    sale_date TEXT, url TEXT, first_seen TEXT, last_seen TEXT, closed_on TEXT
);
CREATE TABLE IF NOT EXISTS auction_snapshots (
    id TEXT, seen_date TEXT, min_price INTEGER, failed_bids INTEGER, sale_date TEXT,
    PRIMARY KEY (id, seen_date)
);
CREATE TABLE IF NOT EXISTS hogangnono (
    id TEXT, seen_date TEXT, name TEXT, url TEXT, summary TEXT,
    PRIMARY KEY (id, seen_date)
);
CREATE TABLE IF NOT EXISTS runs (
    run_date TEXT, source TEXT, status TEXT, count INTEGER, errors TEXT,
    PRIMARY KEY (run_date, source)
);
"""

LISTING_COLS = ["source", "id", "region_code", "sido", "sigungu", "dong", "complex_name",
                "article_name", "building", "trade_type", "real_estate_type", "price", "rent",
                "area_m2", "supply_m2", "floor", "direction", "description", "realtor",
                "confirm_date", "url"]
AUCTION_COLS = ["id", "case_no", "item_seq", "court", "court_code", "dept", "phone", "address",
                "building", "usage", "area", "area_m2", "appraisal", "min_price", "min_ratio",
                "failed_bids", "sale_date", "url"]


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path))
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)

    def close(self):
        self.db.commit()
        self.db.close()

    # ── 매물 ──────────────────────────────────────────────────────────

    def save_listings(self, rows: list[dict], today: str, done_region_codes=None):
        """수집분 upsert. done_region_codes 에 속한 동에서 오늘 안 보인 매물은 종료 처리."""
        cols = LISTING_COLS
        upd = ", ".join(f"{c}=excluded.{c}" for c in cols if c not in ("source", "id"))
        sql = (f"INSERT INTO listings ({', '.join(cols)}, first_seen, last_seen, closed_on) "
               f"VALUES ({', '.join('?' * len(cols))}, ?, ?, NULL) "
               f"ON CONFLICT(source, id) DO UPDATE SET {upd}, last_seen=excluded.last_seen, "
               f"closed_on=NULL")
        for r in rows:
            self.db.execute(sql, [r.get(c) for c in cols] + [today, today])
            self.db.execute("INSERT OR REPLACE INTO listing_prices VALUES (?,?,?,?,?)",
                            (r["source"], r["id"], today, r.get("price"), r.get("rent")))
        if done_region_codes:
            marks = ",".join("?" * len(done_region_codes))
            self.db.execute(
                f"UPDATE listings SET closed_on=? WHERE closed_on IS NULL AND last_seen < ? "
                f"AND region_code IN ({marks})", [today, today, *done_region_codes])
        self.db.commit()

    def new_listings(self, today):
        return self._q("SELECT * FROM listings WHERE first_seen=? ORDER BY sigungu, dong, "
                       "complex_name, price", today)

    def closed_listings(self, today):
        return self._q("SELECT * FROM listings WHERE closed_on=? ORDER BY sigungu, dong, "
                       "complex_name", today)

    def listing_price_changes(self, today):
        """오늘 가격이 직전 관측 가격과 다른 매물."""
        return self._q("""
            SELECT l.*, p.price AS prev_price, p.rent AS prev_rent, p.seen_date AS prev_date
            FROM listings l
            JOIN listing_prices t ON t.source=l.source AND t.id=l.id AND t.seen_date=?
            JOIN listing_prices p ON p.source=l.source AND p.id=l.id AND p.seen_date = (
                SELECT MAX(seen_date) FROM listing_prices
                WHERE source=l.source AND id=l.id AND seen_date < ?)
            WHERE (t.price IS NOT p.price OR t.rent IS NOT p.rent)
            ORDER BY l.sigungu, l.dong, l.complex_name""", today, today)

    def active_listing_stats(self, today):
        return self._q("""
            SELECT sigungu, dong, trade_type, COUNT(*) AS cnt,
                   SUM(first_seen = ?) AS new_cnt
            FROM listings WHERE last_seen = ?
            GROUP BY sigungu, dong, trade_type ORDER BY sigungu, dong, trade_type""", today, today)

    # ── 경매 ──────────────────────────────────────────────────────────

    def save_auctions(self, items: list[dict], today: str, complete: bool):
        cols = AUCTION_COLS
        upd = ", ".join(f"{c}=excluded.{c}" for c in cols if c != "id")
        sql = (f"INSERT INTO auctions ({', '.join(cols)}, first_seen, last_seen, closed_on) "
               f"VALUES ({', '.join('?' * len(cols))}, ?, ?, NULL) "
               f"ON CONFLICT(id) DO UPDATE SET {upd}, last_seen=excluded.last_seen, closed_on=NULL")
        for it in items:
            self.db.execute(sql, [it.get(c) for c in cols] + [today, today])
            self.db.execute("INSERT OR REPLACE INTO auction_snapshots VALUES (?,?,?,?,?)",
                            (it["id"], today, it.get("min_price"), it.get("failed_bids"),
                             it.get("sale_date")))
        if complete:
            self.db.execute("UPDATE auctions SET closed_on=? WHERE closed_on IS NULL "
                            "AND last_seen < ?", (today, today))
        self.db.commit()

    def new_auctions(self, today):
        return self._q("SELECT * FROM auctions WHERE first_seen=? ORDER BY sale_date", today)

    def upcoming_auctions(self, today, until):
        return self._q("SELECT * FROM auctions WHERE last_seen=? AND sale_date BETWEEN ? AND ? "
                       "ORDER BY sale_date, address", today, today, until)

    def auction_changes(self, today):
        """최저가·유찰횟수·매각기일이 바뀐 물건 (보통 유찰로 가격이 내려간 것)."""
        return self._q("""
            SELECT a.*, p.min_price AS prev_min_price, p.failed_bids AS prev_failed_bids,
                   p.sale_date AS prev_sale_date
            FROM auctions a
            JOIN auction_snapshots t ON t.id=a.id AND t.seen_date=?
            JOIN auction_snapshots p ON p.id=a.id AND p.seen_date = (
                SELECT MAX(seen_date) FROM auction_snapshots WHERE id=a.id AND seen_date < ?)
            WHERE t.min_price IS NOT p.min_price OR t.failed_bids IS NOT p.failed_bids
               OR t.sale_date IS NOT p.sale_date
            ORDER BY a.sale_date""", today, today)

    def closed_auctions(self, today):
        return self._q("SELECT * FROM auctions WHERE closed_on=? ORDER BY sale_date", today)

    def active_auction_count(self, today):
        return self.db.execute("SELECT COUNT(*) FROM auctions WHERE last_seen=?",
                               (today,)).fetchone()[0]

    # ── 호갱노노 ──────────────────────────────────────────────────────

    def save_hogangnono(self, rows, today):
        for r in rows:
            self.db.execute("INSERT OR REPLACE INTO hogangnono VALUES (?,?,?,?,?)",
                            (r["id"], today, r["name"], r["url"], r["summary"]))
        self.db.commit()

    def hogangnono_today(self, today):
        return self._q("""
            SELECT h.*, (SELECT summary FROM hogangnono p WHERE p.id=h.id AND p.seen_date<?
                         ORDER BY seen_date DESC LIMIT 1) AS prev_summary
            FROM hogangnono h WHERE h.seen_date=? ORDER BY h.name""", today, today)

    # ── 실행 기록 ─────────────────────────────────────────────────────

    def log_run(self, today, source, status, count, errors):
        self.db.execute("INSERT OR REPLACE INTO runs VALUES (?,?,?,?,?)",
                        (today, source, status, count, json.dumps(errors, ensure_ascii=False)))
        self.db.commit()

    def had_previous_run(self, source, today) -> bool:
        """오늘 이전에 성공한 수집이 있는지 — 첫 실행이면 '신규'가 전부라 의미가 없다."""
        return self.db.execute("SELECT 1 FROM runs WHERE source=? AND run_date<? "
                               "AND status!='failed' LIMIT 1", (source, today)).fetchone() is not None

    def runs(self, today):
        out = []
        for r in self._q("SELECT * FROM runs WHERE run_date=? ORDER BY source", today):
            r["errors"] = json.loads(r["errors"] or "[]")
            out.append(r)
        return out

    def _q(self, sql, *args):
        return [dict(r) for r in self.db.execute(sql, args).fetchall()]
