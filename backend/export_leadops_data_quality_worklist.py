from __future__ import annotations

import argparse
import csv
import sqlite3
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"


def main() -> None:
    parser = argparse.ArgumentParser(description="Export a prioritized leadops data-quality worklist.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to crm.sqlite")
    parser.add_argument("--limit", type=int, default=200, help="Maximum rows to export")
    parser.add_argument(
        "--issue-type",
        default="",
        help="Optional issue_type filter (for example: low_confidence_contactable)",
    )
    parser.add_argument(
        "--csv",
        default=str(REPO_ROOT / "tmp" / f"leadops-data-quality-worklist-{datetime.now().strftime('%Y-%m-%d')}.csv"),
        help="CSV output path",
    )
    parser.add_argument(
        "--md",
        default=str(REPO_ROOT / "reports" / f"leadops-data-quality-worklist-{datetime.now().strftime('%Y-%m-%d')}.md"),
        help="Markdown output path",
    )
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    csv_path = Path(args.csv).resolve()
    md_path = Path(args.md).resolve()

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    issue_type = (args.issue_type or "").strip()
    base_sql = """
            SELECT
                lead_id,
                name,
                issue_type,
                issue_value,
                issue_reason,
                status,
                outreach_status,
                email,
                website,
                latest_review_decision,
                latest_review_reason,
                next_action,
                priority_score
            FROM leadops_v_data_quality_priority
    """
    where_clause = "WHERE issue_type = ?" if issue_type else ""
    order_clause = "ORDER BY priority_score DESC, COALESCE(updated, '') DESC, lead_id ASC LIMIT ?"
    params = [issue_type, args.limit] if issue_type else [args.limit]
    rows = [
        dict(row)
        for row in con.execute(
            f"{base_sql}\n{where_clause}\n{order_clause}",
            params,
        ).fetchall()
    ]
    con.close()

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.parent.mkdir(parents=True, exist_ok=True)

    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "lead_id",
                "name",
                "issue_type",
                "issue_value",
                "issue_reason",
                "status",
                "outreach_status",
                "email",
                "website",
                "latest_review_decision",
                "latest_review_reason",
                "next_action",
                "priority_score",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    issue_counts: dict[str, int] = {}
    for row in rows:
        issue_counts[row["issue_type"]] = issue_counts.get(row["issue_type"], 0) + 1

    lines = [
        "# LeadOps Data Quality Worklist",
        "",
        f"- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"- Database: `{db_path}`",
        f"- Issue type filter: `{issue_type or 'all'}`",
        f"- Rows: {len(rows)}",
        "",
        "## Issue Counts",
        "",
    ]
    for issue_type, count in sorted(issue_counts.items(), key=lambda item: (-item[1], item[0])):
        lines.append(f"- `{issue_type}`: {count}")
    lines.extend(["", "## Worklist", ""])
    for row in rows:
        line = (
            f"- `{row['lead_id']}` {row['name']} | `{row['issue_type']}` | "
            f"`{row['next_action']}` | `{row['email']}` | `{row['website']}`"
        )
        if row["latest_review_decision"]:
            line += f" | latest review: `{row['latest_review_decision']}`"
        lines.append(line)
        lines.append(f"  issue: {row['issue_reason']}")
        if row["latest_review_reason"]:
            lines.append(f"  review note: {row['latest_review_reason']}")

    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"CSV={csv_path}")
    print(f"MD={md_path}")
    print(f"COUNT={len(rows)}")


if __name__ == "__main__":
    main()
