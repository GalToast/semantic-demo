from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

from run_montgomery_qualifier import DEFAULT_DB, LeadRow, classify_lead


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GOLD_SET = REPO_ROOT / "leads" / "montgomery-county-fresh" / "triage-gold-set-v1.json"


def load_gold_set(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_db_rows(conn: sqlite3.Connection) -> dict[str, sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT lead_id, business_name, city, state, doc_type, website_status FROM montgomery_fresh_leads"
    ).fetchall()
    return {row["lead_id"]: row for row in rows}


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate Montgomery qualifier against the adjudicated Montgomery gold set.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to Montgomery-only SQLite DB.")
    parser.add_argument("--gold-set", default=str(DEFAULT_GOLD_SET), help="Path to Montgomery qualification gold set JSON.")
    args = parser.parse_args()

    db_path = Path(args.db)
    gold_set_path = Path(args.gold_set)
    if not db_path.exists():
        raise FileNotFoundError(f"Missing Montgomery DB: {db_path}")
    if not gold_set_path.exists():
        raise FileNotFoundError(f"Missing gold set: {gold_set_path}")

    conn = sqlite3.connect(db_path)
    try:
        db_rows = load_db_rows(conn)
    finally:
        conn.close()

    gold_rows = load_gold_set(gold_set_path)
    total = 0
    hits = 0
    mismatches: list[tuple[str, str, str, str]] = []

    for item in gold_rows:
        lead_id = item["lead_id"]
        row = db_rows.get(lead_id)
        if row is None:
            mismatches.append((lead_id, item["business_name"], item["expected_decision"], "missing_db_row"))
            continue
        decision = classify_lead(
            LeadRow(
                lead_id=row["lead_id"],
                business_name=row["business_name"],
                city=row["city"] or "",
                state=row["state"] or "TX",
                doc_type=row["doc_type"] or "",
                website_status=row["website_status"] or "",
            )
        )
        total += 1
        if decision.status == item["expected_decision"]:
            hits += 1
        else:
            mismatches.append((lead_id, item["business_name"], item["expected_decision"], decision.status))

    accuracy = (hits / total) if total else 0.0
    print(f"Gold set: {gold_set_path}")
    print(f"DB: {db_path}")
    print(f"Hits: {hits}/{total} ({accuracy * 100:.1f}%)")
    if mismatches:
        print("\nMismatches:")
        for lead_id, name, expected, actual in mismatches:
            print(f"- {lead_id} | {name} | expected={expected} | actual={actual}")


if __name__ == "__main__":
    main()
