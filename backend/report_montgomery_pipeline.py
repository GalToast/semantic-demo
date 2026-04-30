from __future__ import annotations

import argparse
import shutil
import sqlite3
from collections import Counter
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MONTGOMERY_ROOT = REPO_ROOT / "leads" / "montgomery-county-fresh"
DEFAULT_DB = MONTGOMERY_ROOT / "montgomery-fresh.sqlite"
DEFAULT_REPORT_DIR = MONTGOMERY_ROOT / "reports"


def now_stamp() -> tuple[str, str]:
    dt = datetime.now().astimezone()
    return dt.isoformat(timespec="seconds"), dt.strftime("%Y%m%d-%H%M%S")


def fetch_counts(cur: sqlite3.Cursor, sql: str, params: tuple = ()) -> list[tuple[str, int]]:
    return [(str(k), int(v)) for k, v in cur.execute(sql, params).fetchall()]


def fetch_rows(cur: sqlite3.Cursor, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    return list(cur.execute(sql, params).fetchall())


def split_reason_counter(rows: list[tuple[str, int]]) -> Counter:
    counter: Counter[str] = Counter()
    for reason_blob, count in rows:
        if not reason_blob:
            continue
        for reason in [part.strip() for part in reason_blob.split(";") if part.strip()]:
            counter[reason] += count
    return counter


def format_table(headers: list[str], rows: list[list[str]]) -> list[str]:
    if not rows:
        return ["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"]
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"]
    for row in rows:
        lines.append("| " + " | ".join(row) + " |")
    return lines


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Montgomery-only pipeline queue/status report.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to Montgomery-only SQLite DB.")
    parser.add_argument("--report-dir", default=str(DEFAULT_REPORT_DIR), help="Directory for generated reports.")
    parser.add_argument("--sample-limit", type=int, default=10, help="How many sample leads to show per queue.")
    args = parser.parse_args()

    db_path = Path(args.db)
    report_dir = Path(args.report_dir)
    if not db_path.exists():
        raise FileNotFoundError(f"Missing Montgomery DB: {db_path}")

    report_dir.mkdir(parents=True, exist_ok=True)
    generated_at, stamp = now_stamp()
    report_path = report_dir / f"pipeline-status-{stamp}.md"
    latest_path = report_dir / "pipeline-status-latest.md"

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.cursor()

        pipeline_counts = fetch_counts(cur, "select metric, value from montgomery_v_pipeline_summary")
        website_status_counts = fetch_counts(
            cur,
            """
            select case when website_status = '' then '(blank)' else website_status end as status, count(*)
            from montgomery_fresh_leads
            group by case when website_status = '' then '(blank)' else website_status end
            order by count(*) desc, status asc
            """,
        )
        qualification_counts = fetch_counts(
            cur,
            """
            select qualification_status, count(*)
            from montgomery_fresh_leads
            group by qualification_status
            order by count(*) desc, qualification_status asc
            """,
        )
        final_status_counts = fetch_counts(
            cur,
            """
            select case when final_pipeline_status = '' then '(blank)' else final_pipeline_status end, count(*)
            from montgomery_fresh_leads
            group by case when final_pipeline_status = '' then '(blank)' else final_pipeline_status end
            order by count(*) desc, 1 asc
            """,
        )
        audit_gate_counts = fetch_counts(
            cur,
            """
            select case when audit_gate_decision = '' then '(blank)' else audit_gate_decision end, count(*)
            from montgomery_fresh_leads
            group by case when audit_gate_decision = '' then '(blank)' else audit_gate_decision end
            order by count(*) desc, 1 asc
            """,
        )

        manual_review_rows = fetch_counts(
            cur,
            """
            select manual_review_reason, count(*)
            from montgomery_fresh_leads
            where manual_review_required = 1
            group by manual_review_reason
            order by count(*) desc
            """,
        )
        audit_reason_rows = fetch_counts(
            cur,
            """
            select audit_gate_reason, count(*)
            from montgomery_fresh_leads
            where audit_gate_reason <> ''
            group by audit_gate_reason
            order by count(*) desc
            """,
        )

        top_manual_reasons = split_reason_counter(manual_review_rows).most_common(10)

        website_queue_rows = fetch_rows(
            cur,
            """
            select lead_id, business_name, city, qualification_status
            from montgomery_v_website_queue
            order by lead_id
            limit ?
            """,
            (args.sample_limit,),
        )
        review_queue_rows = fetch_rows(
            cur,
            """
            select lead_id, business_name, website_status, qualification_status, manual_review_reason
            from montgomery_v_review_queue
            order by lead_id
            limit ?
            """,
            (args.sample_limit,),
        )
        audit_queue_rows = fetch_rows(
            cur,
            """
            select lead_id, business_name, website_domain, website_confidence, qualification_confidence
            from montgomery_v_audit_queue
            order by lead_id
            limit ?
            """,
            (args.sample_limit,),
        )
    finally:
        conn.close()

    lines: list[str] = [
        "# Montgomery Pipeline Status Report",
        "",
        f"Generated: {generated_at}",
        "",
        f"- DB: `{db_path}`",
        "- Scope: Montgomery-only isolated pipeline",
        "",
        "## Executive Summary",
        "",
    ]

    summary_map = dict(pipeline_counts)
    lines.extend(
        [
            f"- Total leads: **{summary_map.get('total_leads', 0)}**",
            f"- Website queue: **{summary_map.get('website_queue', 0)}**",
            f"- Review queue: **{summary_map.get('review_queue', 0)}**",
            f"- Audit-ready queue: **{summary_map.get('audit_queue', 0)}**",
            "",
        ]
    )

    lines.append("## Pipeline Counts")
    lines.append("")
    lines.extend(format_table(["Metric", "Value"], [[k, str(v)] for k, v in pipeline_counts]))
    lines.append("")

    lines.append("## Website Status")
    lines.append("")
    lines.extend(format_table(["Website status", "Count"], [[k, str(v)] for k, v in website_status_counts]))
    lines.append("")

    lines.append("## Qualification Status")
    lines.append("")
    lines.extend(format_table(["Qualification status", "Count"], [[k, str(v)] for k, v in qualification_counts]))
    lines.append("")

    lines.append("## Final Pipeline Status")
    lines.append("")
    lines.extend(format_table(["Final status", "Count"], [[k, str(v)] for k, v in final_status_counts]))
    lines.append("")

    lines.append("## Audit Gate Decisions")
    lines.append("")
    lines.extend(format_table(["Gate decision", "Count"], [[k, str(v)] for k, v in audit_gate_counts]))
    lines.append("")

    lines.append("## Top Manual Review Reasons")
    lines.append("")
    lines.extend(format_table(["Reason", "Count"], [[reason, str(count)] for reason, count in top_manual_reasons]))
    lines.append("")

    lines.append("## Audit Gate Reasons")
    lines.append("")
    lines.extend(format_table(["Reason", "Count"], [[reason, str(count)] for reason, count in audit_reason_rows]))
    lines.append("")

    lines.append(f"## Sample Website Queue ({args.sample_limit})")
    lines.append("")
    lines.extend(
        format_table(
            ["Lead ID", "Business", "City", "Qualification"],
            [
                [row["lead_id"], row["business_name"], row["city"] or "", row["qualification_status"] or ""]
                for row in website_queue_rows
            ],
        )
    )
    lines.append("")

    lines.append(f"## Sample Review Queue ({args.sample_limit})")
    lines.append("")
    lines.extend(
        format_table(
            ["Lead ID", "Business", "Website", "Qualification", "Review reason"],
            [
                [
                    row["lead_id"],
                    row["business_name"],
                    row["website_status"] or "",
                    row["qualification_status"] or "",
                    row["manual_review_reason"] or "",
                ]
                for row in review_queue_rows
            ],
        )
    )
    lines.append("")

    lines.append(f"## Sample Audit Queue ({args.sample_limit})")
    lines.append("")
    lines.extend(
        format_table(
            ["Lead ID", "Business", "Domain", "Website conf", "Qualification conf"],
            [
                [
                    row["lead_id"],
                    row["business_name"],
                    row["website_domain"] or "",
                    row["website_confidence"] or "",
                    row["qualification_confidence"] or "",
                ]
                for row in audit_queue_rows
            ],
        )
    )
    lines.append("")

    lines.append("## Recommended Next Wave")
    lines.append("")
    if summary_map.get("audit_queue", 0) > 0:
        lines.append("- Safe next move: run a tiny Montgomery-only deep-audit wave from the current audit queue.")
    elif summary_map.get("website_queue", 0) > 0:
        lines.append("- Safe next move: process a 50-lead Montgomery website-finder wave, then rerun qualification and audit gate.")
    else:
        lines.append("- Safe next move: rerun pipeline reporting after the next Montgomery stage execution.")
    lines.append("")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    shutil.copyfile(report_path, latest_path)

    print(f"Report written to: {report_path}")
    print(f"Latest report: {latest_path}")


if __name__ == "__main__":
    main()
