from __future__ import annotations

import csv
import sqlite3
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
DB_PATH = REPO_ROOT / "crm.sqlite"
REPORT_PATH = REPO_ROOT / "reports" / f"leadops-bounced-leads-{date.today().isoformat()}.md"
CSV_PATH = REPO_ROOT / "tmp" / f"leadops-bounced-leads-{date.today().isoformat()}.csv"


QUERY = """
SELECT
    lead_id,
    name,
    batch,
    status,
    outreach_status,
    email,
    phone,
    website,
    updated,
    profile_path,
    last_outreach_event_at
FROM leadops_leads
WHERE outreach_status = 'bounced'
ORDER BY CAST(lead_id AS INTEGER), name
"""


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(QUERY).fetchall()
    finally:
        conn.close()

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = [
        "lead_id",
        "name",
        "batch",
        "status",
        "outreach_status",
        "email",
        "phone",
        "website",
        "updated",
        "profile_path",
        "last_outreach_event_at",
    ]

    with CSV_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row[key] for key in fieldnames})

    lines = [
        "# LeadOps Bounced Leads Snapshot",
        f"Generated: {date.today().isoformat()}",
        "",
        f"- Total bounced leads: {len(rows)}",
        f"- CSV export: `{CSV_PATH.as_posix()}`",
        "",
        "| LeadID | Name | Batch | Status | Outreach | Email | Updated | Last Outreach Event | Profile |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]

    for row in rows:
        lines.append(
            "| "
            + " | ".join(
                [
                    str(row["lead_id"] or ""),
                    str(row["name"] or ""),
                    str(row["batch"] or ""),
                    str(row["status"] or ""),
                    str(row["outreach_status"] or ""),
                    str(row["email"] or ""),
                    str(row["updated"] or ""),
                    str(row["last_outreach_event_at"] or ""),
                    str(row["profile_path"] or ""),
                ]
            )
            + " |"
        )

    REPORT_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")

    print(f"Total bounced leads: {len(rows)}")
    print(f"CSV: {CSV_PATH}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
