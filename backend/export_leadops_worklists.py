from __future__ import annotations

import argparse
import sqlite3
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"
REPORTS_DIR = REPO_ROOT / "reports"


def fetch_rows(conn: sqlite3.Connection, sql: str, limit: int) -> list[sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    return cur.execute(f"{sql} LIMIT {limit}").fetchall()


def fmt(value: object) -> str:
    text = str(value or "").strip()
    return text if text else "-"


def render_section(title: str, rows: list[sqlite3.Row], columns: list[tuple[str, str]]) -> list[str]:
    lines = [f"## {title}", ""]
    if not rows:
        lines.append("_No rows_")
        lines.append("")
        return lines

    for row in rows:
        first_label, first_key = columns[0]
        lines.append(f"- `{row[first_key]}` {fmt(row['name'])}")
        for label, key in columns[1:]:
            lines.append(f"  {label}: {fmt(row[key])}")
        lines.append("")
    return lines


def main() -> None:
    parser = argparse.ArgumentParser(description="Export top leadops work queues into a Markdown report.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to sqlite database.")
    parser.add_argument("--limit", type=int, default=25, help="Rows per queue.")
    parser.add_argument("--report", default="", help="Optional explicit report path.")
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    report_path = (
        Path(args.report).resolve()
        if args.report
        else REPORTS_DIR / f"leadops-worklists-{datetime.now().strftime('%Y-%m-%d')}.md"
    )
    report_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        reviewed_send_rows = fetch_rows(
            conn,
            """
            SELECT lead_id, name, email, website, primary_send_hook, send_priority,
                   audience_family,
                   audience_type, audience_subtype, outreach_voice,
                   entity_match_score, entity_match_confidence, next_action
            FROM leadops_v_send_now_reviewed
            ORDER BY send_priority DESC, COALESCE(website, '') DESC, lead_id ASC
            """,
            args.limit,
        )
        send_rows = fetch_rows(
            conn,
            """
            SELECT lead_id, name, email, website, primary_send_hook, send_priority,
                   audience_family,
                   audience_type, audience_subtype, outreach_voice,
                   entity_match_score, entity_match_confidence, next_action
            FROM leadops_v_send_now
            ORDER BY send_priority DESC, COALESCE(website, '') DESC, lead_id ASC
            """,
            args.limit,
        )
        research_rows = fetch_rows(
            conn,
            """
            SELECT lead_id, name, priority_bucket, priority_score, missing_fields,
                   audience_family,
                   audience_type, audience_subtype, outreach_voice,
                   entity_match_score, entity_match_confidence, next_action, email, website
            FROM leadops_v_research_now
            ORDER BY priority_score DESC, COALESCE(website, '') DESC, lead_id ASC
            """,
            args.limit,
        )
        do_not_work_rows = fetch_rows(
            conn,
            """
            SELECT lead_id, name, exclusion_reason, next_action, email, website, status, outreach_status,
                   audience_family,
                   audience_type, audience_subtype, outreach_voice
            FROM leadops_v_do_not_work
            ORDER BY COALESCE(status, '') DESC, lead_id ASC
            """,
            args.limit,
        )
        audit_rows = fetch_rows(
            conn,
            """
            SELECT lead_id, name, issue_type_raw, severity, diamond_worthy,
                   finding_class, next_action, source_file, evidence_path
            FROM leadops_v_audit_findings_actionable
            ORDER BY
                CASE severity
                    WHEN 'high' THEN 1
                    WHEN 'medium' THEN 2
                    WHEN 'low' THEN 3
                    ELSE 4
                END,
                diamond_worthy DESC,
                lead_id ASC
            """,
            args.limit,
        )
        task_rows = fetch_rows(
            conn,
            """
            SELECT lead_id, name, task_type, priority, next_action, website, email,
                   audience_family, audience_type, audience_subtype, outreach_voice
            FROM leadops_v_research_tasks_open
            ORDER BY
                CASE lower(COALESCE(priority, ''))
                    WHEN 'high' THEN 1
                    WHEN 'medium' THEN 2
                    WHEN 'low' THEN 3
                    ELSE 4
                END,
                lead_id ASC
            """,
            args.limit,
        )
        bounce_rows = fetch_rows(
            conn,
            """
            SELECT lead_id, name, recipient, bounce_event_count, latest_bounce_at,
                   bounce_types, suppression_actions, is_hard_suppressed
            FROM leadops_v_bounce_risk_summary
            ORDER BY is_hard_suppressed DESC, bounce_event_count DESC, latest_bounce_at DESC
            """,
            args.limit,
        )
    finally:
        conn.close()

    lines = [
        "# LeadOps Worklists",
        "",
        f"- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"- Database: `{db_path}`",
        f"- Rows per queue: `{args.limit}`",
        "",
    ]
    lines.extend(
        render_section(
            "Send Now Reviewed",
            reviewed_send_rows,
            [
                ("Lead", "lead_id"),
                ("Email", "email"),
                ("Website", "website"),
                ("Hook", "primary_send_hook"),
                ("Priority", "send_priority"),
                ("Family", "audience_family"),
                ("Audience", "audience_type"),
                ("Subtype", "audience_subtype"),
                ("Voice", "outreach_voice"),
                ("Match", "entity_match_confidence"),
                ("Score", "entity_match_score"),
                ("Next", "next_action"),
            ],
        )
    )
    lines.extend(
        render_section(
            "Send Now",
            send_rows,
            [
                ("Lead", "lead_id"),
                ("Email", "email"),
                ("Website", "website"),
                ("Hook", "primary_send_hook"),
                ("Priority", "send_priority"),
                ("Family", "audience_family"),
                ("Audience", "audience_type"),
                ("Subtype", "audience_subtype"),
                ("Voice", "outreach_voice"),
                ("Match", "entity_match_confidence"),
                ("Score", "entity_match_score"),
                ("Next", "next_action"),
            ],
        )
    )
    lines.extend(
        render_section(
            "Research Now",
            research_rows,
            [
                ("Lead", "lead_id"),
                ("Bucket", "priority_bucket"),
                ("Score", "priority_score"),
                ("Missing", "missing_fields"),
                ("Family", "audience_family"),
                ("Audience", "audience_type"),
                ("Subtype", "audience_subtype"),
                ("Voice", "outreach_voice"),
                ("Match", "entity_match_confidence"),
                ("Entity score", "entity_match_score"),
                ("Next", "next_action"),
                ("Email", "email"),
                ("Website", "website"),
            ],
        )
    )
    lines.extend(
        render_section(
            "Do Not Work",
            do_not_work_rows,
            [
                ("Lead", "lead_id"),
                ("Reason", "exclusion_reason"),
                ("Status", "status"),
                ("Outreach", "outreach_status"),
                ("Family", "audience_family"),
                ("Audience", "audience_type"),
                ("Subtype", "audience_subtype"),
                ("Voice", "outreach_voice"),
                ("Email", "email"),
                ("Website", "website"),
                ("Next", "next_action"),
            ],
        )
    )
    lines.extend(
        render_section(
            "Audit Findings",
            audit_rows,
            [
                ("Lead", "lead_id"),
                ("Issue", "issue_type_raw"),
                ("Severity", "severity"),
                ("Diamond", "diamond_worthy"),
                ("Class", "finding_class"),
                ("Next", "next_action"),
                ("Evidence", "evidence_path"),
                ("Source", "source_file"),
            ],
        )
    )
    lines.extend(
        render_section(
            "Research Tasks",
            task_rows,
            [
                ("Lead", "lead_id"),
                ("Task", "task_type"),
                ("Priority", "priority"),
                ("Next", "next_action"),
                ("Family", "audience_family"),
                ("Audience", "audience_type"),
                ("Subtype", "audience_subtype"),
                ("Voice", "outreach_voice"),
                ("Email", "email"),
                ("Website", "website"),
            ],
        )
    )
    lines.extend(
        render_section(
            "Bounce Risk",
            bounce_rows,
            [
                ("Lead", "lead_id"),
                ("Recipient", "recipient"),
                ("Bounce count", "bounce_event_count"),
                ("Latest", "latest_bounce_at"),
                ("Types", "bounce_types"),
                ("Suppression", "suppression_actions"),
                ("Hard suppressed", "is_hard_suppressed"),
            ],
        )
    )

    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(report_path)


if __name__ == "__main__":
    main()
