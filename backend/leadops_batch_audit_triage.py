from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

from leadops_draft_workbench import (
    DEFAULT_DB,
    connect,
    emit,
    is_family_excluded,
    looks_like_real_email,
    mailbox_draft_lead_ids,
    needs_audit_rows,
    parse_sent_emails,
    parse_repo_draft_lead_ids,
    profile_issue_rows,
    ready_email_now_rows,
    repo_only_safe_review_rows,
    volume_research_rows,
)


LANES = (
    "ready_email_now",
    "repo_only_safe_review",
    "needs_audit_email",
    "needs_audit_non_email",
    "volume_email_audit",
    "volume_non_email_research",
    "profile_issue_email",
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Batch-triage draft candidates into draft_now, hold, or shelve."
    )
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to crm.sqlite")
    parser.add_argument(
        "--lane",
        choices=LANES,
        default="needs_audit_email",
        help="Workbench lane to triage when lead ids are not supplied",
    )
    parser.add_argument("--limit", type=int, default=5, help="Maximum candidates to triage")
    parser.add_argument(
        "--lead-ids",
        help="Comma-separated lead ids to triage directly instead of pulling from a lane",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON")
    return parser


def parse_lead_ids(raw: str | None) -> list[int]:
    if not raw:
        return []
    ids: list[int] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if not part.isdigit():
            raise SystemExit(f"Invalid lead id: {part}")
        ids.append(int(part))
    return ids


def lane_candidates(
    conn: sqlite3.Connection,
    lane: str,
    repo_ids: set[int],
    mailbox_ids: set[int],
    sent_emails: set[str],
    limit: int,
) -> list[dict[str, object]]:
    if lane == "ready_email_now":
        return ready_email_now_rows(conn, repo_ids, mailbox_ids, sent_emails, limit)
    if lane == "repo_only_safe_review":
        return repo_only_safe_review_rows(conn, repo_ids, mailbox_ids, sent_emails, limit)
    if lane == "needs_audit_email":
        return needs_audit_rows(conn, repo_ids, mailbox_ids, sent_emails, limit, require_email=True)
    if lane == "needs_audit_non_email":
        return needs_audit_rows(conn, repo_ids, mailbox_ids, sent_emails, limit, require_email=False)
    if lane == "volume_email_audit":
        return volume_research_rows(conn, repo_ids, mailbox_ids, sent_emails, limit, require_email=True)
    if lane == "volume_non_email_research":
        return volume_research_rows(conn, repo_ids, mailbox_ids, sent_emails, limit, require_email=False)
    if lane == "profile_issue_email":
        return profile_issue_rows(repo_ids, mailbox_ids, sent_emails, limit)
    raise SystemExit(f"Unsupported lane: {lane}")


def fetch_lead_core(conn: sqlite3.Connection, lead_id: int) -> sqlite3.Row | None:
    query = """
        SELECT
            l.lead_id,
            l.name,
            l.status,
            l.outreach_status,
            l.email,
            l.website,
            COALESCE(rc.priority_bucket, '') AS priority_bucket,
            COALESCE(rc.priority_score, 0) AS priority_score,
            COALESCE(rc.missing_fields, '') AS missing_fields,
            COALESCE(rc.missing_field_count, 0) AS missing_field_count,
            COALESCE(rc.next_action, '') AS research_next_action,
            COALESCE(rc.audience_family, '') AS audience_family,
            COALESCE(rc.audience_type, '') AS audience_type,
            COALESCE(rc.audience_subtype, '') AS audience_subtype,
            COALESCE(rc.outreach_voice, '') AS outreach_voice,
            COALESCE(rc.entity_match_score, 0) AS entity_match_score,
            COALESCE(rc.entity_match_confidence, '') AS entity_match_confidence,
            COALESCE(l.outreach_status, '') AS overall_contact_state,
            '' AS email_lane_status,
            '' AS contact_form_status,
            COALESCE(oe.email_contacted_rows, 0) AS email_contacted_rows,
            COALESCE(oe.contact_form_contacted_rows, 0) AS contact_form_contacted_rows,
            '' AS primary_send_hook,
            '' AS send_next_action
        FROM leadops_leads l
        LEFT JOIN leadops_v_research_now rc
          ON rc.lead_id = l.lead_id
        LEFT JOIN (
            SELECT
                lead_id,
                SUM(CASE WHEN lower(COALESCE(channel, '')) = 'email' THEN 1 ELSE 0 END) AS email_contacted_rows,
                SUM(CASE WHEN lower(COALESCE(channel, '')) = 'contact_form' THEN 1 ELSE 0 END) AS contact_form_contacted_rows
            FROM leadops_outreach_events
            WHERE lower(COALESCE(status, '')) IN ('sent', 'delivered', 'replied', 'opt-out', 'opt_out', 'bounced')
            GROUP BY lead_id
        ) oe
          ON oe.lead_id = l.lead_id
        WHERE l.lead_id = ?
    """
    return conn.execute(query, (lead_id,)).fetchone()


def fetch_audit_summary(conn: sqlite3.Connection, lead_id: int) -> dict[str, object]:
    rows = conn.execute(
        """
        SELECT
            severity,
            issue_type_norm,
            issue_description,
            verified_live,
            verification_method,
            evidence_path,
            next_action,
            note
        FROM leadops_v_audit_findings_actionable
        WHERE lead_id = ?
        ORDER BY
            CASE severity
                WHEN 'critical' THEN 4
                WHEN 'high' THEN 3
                WHEN 'medium' THEN 2
                WHEN 'low' THEN 1
                ELSE 0
            END DESC,
            verified_live DESC,
            id ASC
        """,
        (lead_id,),
    ).fetchall()
    top_findings: list[dict[str, object]] = []
    severity_rank = 0
    has_verified_issue = False
    has_draftworthy_issue = False
    for row in rows[:3]:
        severity = str(row["severity"] or "")
        severity_rank = max(
            severity_rank,
            {"critical": 4, "high": 3, "medium": 2, "low": 1}.get(severity, 0),
        )
        next_action = str(row["next_action"] or "")
        if row["verified_live"]:
            has_verified_issue = True
        if next_action == "draft_from_verified_issue":
            has_draftworthy_issue = True
        top_findings.append(
            {
                "severity": severity,
                "issue_type_norm": row["issue_type_norm"],
                "issue_description": row["issue_description"],
                "verified_live": bool(row["verified_live"]),
                "verification_method": row["verification_method"],
                "evidence_path": row["evidence_path"],
                "next_action": next_action,
                "note": row["note"],
            }
        )
    return {
        "finding_count": len(rows),
        "top_findings": top_findings,
        "max_severity_rank": severity_rank,
        "has_verified_issue": has_verified_issue,
        "has_draftworthy_issue": has_draftworthy_issue,
    }


def classify_candidate(
    core: sqlite3.Row,
    audit: dict[str, object],
    lane: str,
    repo_ids: set[int],
    mailbox_ids: set[int],
) -> tuple[str, list[str]]:
    lead_id = int(core["lead_id"])
    name = str(core["name"] or "")
    email = str(core["email"] or "")
    website = str(core["website"] or "")
    overall_contact_state = str(core["overall_contact_state"] or "")
    research_next_action = str(core["research_next_action"] or "")
    priority_bucket = str(core["priority_bucket"] or "")
    missing_fields = str(core["missing_fields"] or "")

    reasons: list[str] = []
    if is_family_excluded(lead_id, name):
        reasons.append("family-excluded lead")
        return "shelve", reasons
    if lead_id in mailbox_ids:
        reasons.append("already in mailbox drafts")
        return "shelve", reasons
    if lead_id in repo_ids and lane != "repo_only_safe_review":
        reasons.append("already drafted in repo")
        return "shelve", reasons
    if overall_contact_state not in ("", "uncontacted"):
        reasons.append(f"outreach state is {overall_contact_state}")
        return "shelve", reasons
    if lane in ("ready_email_now", "repo_only_safe_review", "needs_audit_email") and not looks_like_real_email(email):
        reasons.append("no verified email lane available")
        return "shelve", reasons
    if not website:
        reasons.append("no website to audit against")
        return "shelve", reasons

    if audit["has_draftworthy_issue"]:
        reasons.append("verified draft-worthy audit finding exists")
        return "draft_now", reasons

    finding_count = int(audit["finding_count"])
    max_severity_rank = int(audit["max_severity_rank"])
    if finding_count == 0:
        reasons.append("no stored audited issue yet")
    else:
        reasons.append("stored findings exist but none are draft-worthy")
    if research_next_action:
        reasons.append(f"research queue says {research_next_action}")
    if priority_bucket:
        reasons.append(f"priority bucket is {priority_bucket}")
    if missing_fields:
        reasons.append(f"missing fields: {missing_fields}")

    if finding_count == 0 and research_next_action in (
        "needs_contact_search",
        "needs_audit_or_outreach_angle",
        "needs_enrichment",
        "needs_manual_review",
    ):
        return "hold", reasons

    if max_severity_rank >= 2 and audit["has_verified_issue"]:
        return "hold", reasons

    return "shelve", reasons


def build_rows(
    conn: sqlite3.Connection,
    candidate_ids: list[int],
    lane: str,
    repo_ids: set[int],
    mailbox_ids: set[int],
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for lead_id in candidate_ids:
        core = fetch_lead_core(conn, lead_id)
        if core is None:
            continue
        audit = fetch_audit_summary(conn, lead_id)
        decision, reasons = classify_candidate(core, audit, lane, repo_ids, mailbox_ids)
        rows.append(
            {
                "lead_id": lead_id,
                "name": core["name"],
                "email": core["email"],
                "website": core["website"],
                "lane": lane,
                "decision": decision,
                "reasons": reasons,
                "priority_score": int(core["priority_score"] or 0),
                "priority_bucket": core["priority_bucket"],
                "research_next_action": core["research_next_action"],
                "missing_fields": core["missing_fields"],
                "overall_contact_state": core["overall_contact_state"],
                "primary_send_hook": core["primary_send_hook"],
                "audit_summary": audit,
            }
        )
    return rows


def render_text(rows: list[dict[str, object]]) -> None:
    for row in rows:
        print(f"{row['lead_id']} {row['name']}")
        print(f"  decision: {row['decision']}")
        print(f"  email: {row['email'] or '-'}")
        print(f"  website: {row['website'] or '-'}")
        print(f"  priority: {row['priority_score']} ({row['priority_bucket'] or 'n/a'})")
        print(f"  research_next_action: {row['research_next_action'] or '-'}")
        print(f"  reasons: {'; '.join(row['reasons'])}")
        top_findings = row["audit_summary"]["top_findings"]
        if top_findings:
            top = top_findings[0]
            print(
                "  top_finding: "
                f"{top['severity']} / {top['issue_type_norm'] or 'unknown'} / "
                f"{(top['issue_description'] or '').strip()}"
            )
        else:
            print("  top_finding: none")
        print()


def main() -> None:
    args = build_parser().parse_args()
    db_path = Path(args.db).resolve()
    with connect(db_path) as conn:
        repo_ids = parse_repo_draft_lead_ids()
        mailbox_ids = mailbox_draft_lead_ids(conn)
        sent_emails = parse_sent_emails()
        explicit_ids = parse_lead_ids(args.lead_ids)
        if explicit_ids:
            candidate_ids = explicit_ids[: args.limit]
        else:
            candidates = lane_candidates(conn, args.lane, repo_ids, mailbox_ids, sent_emails, args.limit)
            candidate_ids = [int(row["lead_id"]) for row in candidates]
        rows = build_rows(conn, candidate_ids, args.lane, repo_ids, mailbox_ids)
        payload = {
            "db": str(db_path),
            "lane": args.lane,
            "candidate_count": len(rows),
            "decision_counts": {
                "draft_now": sum(1 for row in rows if row["decision"] == "draft_now"),
                "hold": sum(1 for row in rows if row["decision"] == "hold"),
                "shelve": sum(1 for row in rows if row["decision"] == "shelve"),
            },
            "rows": rows,
        }
        if args.json:
            emit(payload, True)
            return
        render_text(rows)


if __name__ == "__main__":
    main()
