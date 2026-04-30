from __future__ import annotations

import argparse
import sqlite3
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"
REPORTS_DIR = REPO_ROOT / "reports"


def fmt(value: object) -> str:
    text = str(value or "").strip()
    return text if text else "-"


def main() -> None:
    parser = argparse.ArgumentParser(description="Export a focused leadops entity-review worklist.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to sqlite database.")
    parser.add_argument("--limit", type=int, default=100, help="Maximum rows to export.")
    parser.add_argument("--report", default="", help="Optional explicit report path.")
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    report_path = (
        Path(args.report).resolve()
        if args.report
        else REPORTS_DIR / f"leadops-entity-review-worklist-{datetime.now().strftime('%Y-%m-%d')}.md"
    )
    report_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            f"""
            SELECT
                r.lead_id,
                r.name,
                l.profile_path,
                l.batch,
                l.status,
                l.outreach_status,
                r.email,
                r.website,
                r.entity_match_confidence,
                r.entity_match_score,
                em.rationale AS entity_match_rationale,
                e.is_contact_verified,
                e.is_audited,
                e.is_outreach_ready
            FROM leadops_v_research_now r
            JOIN leadops_leads l
              ON l.lead_id = r.lead_id
            LEFT JOIN leadops_entity_match em
              ON em.lead_id = r.lead_id
            LEFT JOIN leadops_v_enrichment_summary e
              ON e.lead_id = r.lead_id
            WHERE r.next_action = 'needs_entity_review'
            ORDER BY
                COALESCE(e.is_outreach_ready, 0) DESC,
                COALESCE(e.is_audited, 0) DESC,
                COALESCE(e.is_contact_verified, 0) DESC,
                COALESCE(r.entity_match_score, 0) DESC,
                r.lead_id ASC
            LIMIT ?
            """,
            (args.limit,),
        ).fetchall()
    finally:
        conn.close()

    lines = [
        "# LeadOps Entity Review Worklist",
        "",
        f"- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"- Database: `{db_path}`",
        f"- Row limit: `{args.limit}`",
        "",
    ]

    if not rows:
        lines.extend(["_No rows_", ""])
    else:
        for row in rows:
            lines.append(f"- `{row['lead_id']}` {fmt(row['name'])}")
            lines.append(f"  Email: {fmt(row['email'])}")
            lines.append(f"  Website: {fmt(row['website'])}")
            lines.append(f"  Match: {fmt(row['entity_match_confidence'])} ({fmt(row['entity_match_score'])})")
            lines.append(f"  Rationale: {fmt(row['entity_match_rationale'])}")
            lines.append(f"  Ready flags: contact_verified={fmt(row['is_contact_verified'])}, audited={fmt(row['is_audited'])}, outreach_ready={fmt(row['is_outreach_ready'])}")
            lines.append(f"  Status: {fmt(row['status'])} / {fmt(row['outreach_status'])}")
            lines.append(f"  Batch: {fmt(row['batch'])}")
            lines.append(f"  Profile: {fmt(row['profile_path'])}")
            lines.append("")

    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(report_path)


if __name__ == "__main__":
    main()
