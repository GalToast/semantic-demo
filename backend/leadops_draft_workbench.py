from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"
DRAFTS_ROOT = REPO_ROOT / "outreach" / "drafts"
SENT_ITEMS_PATH = REPO_ROOT / "outreach" / "exports" / "sent-items.json"
PROFILES_ROOT = REPO_ROOT / "leads" / "profiles"
FAMILY_EXCLUDE_IDS = {1618, 90005}
FAMILY_EXCLUDE_PATTERNS = ("coffee cabin", "cj insulation", "cj builders")
PROFILE_ISSUE_KEYWORDS = (
    "hello world",
    "register",
    "log in",
    "wp-login",
    "default wordpress",
    "bad gateway",
    "dns",
    "certificate",
    "mixed content",
    "form transport",
    "blank shell",
    "missing security headers",
    "public wordpress login endpoint",
    "http transport",
    "insecure",
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Surface a broader draft workbench across safe, repo-only, and research lanes."
    )
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to crm.sqlite")
    parser.add_argument("--limit-per-lane", type=int, default=15, help="Maximum rows per lane")
    parser.add_argument(
        "--mode",
        choices=("strict", "volume"),
        default="strict",
        help="Strict mirrors the earlier narrow drafting funnel. Volume opens broader audit/enrichment tranches.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON")
    return parser


def connect(db_path: Path) -> sqlite3.Connection:
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def print_text(text: str) -> None:
    encoding = sys.stdout.encoding or "utf-8"
    safe_text = text.encode(encoding, errors="replace").decode(encoding, errors="replace")
    print(safe_text)


def emit(payload: object, as_json: bool) -> None:
    text = json.dumps(payload, indent=2, ensure_ascii=False)
    print_text(text)


def is_family_excluded(lead_id: int, name: str) -> bool:
    lowered = (name or "").lower()
    return lead_id in FAMILY_EXCLUDE_IDS or any(pattern in lowered for pattern in FAMILY_EXCLUDE_PATTERNS)


def looks_like_real_email(value: str) -> bool:
    email = (value or "").strip().lower()
    if not email or "@" not in email:
        return False
    bad_tokens = (
        "via website contact form",
        "contact form",
        "not publicly listed",
        "unknown",
    )
    return not any(token in email for token in bad_tokens)


def normalized_email(value: str) -> str:
    return (value or "").strip().lower()


def normalized_website_host(value: str) -> str:
    website = (value or "").strip().lower()
    if not website:
        return ""
    for prefix in ("https://", "http://"):
        if website.startswith(prefix):
            website = website[len(prefix) :]
            break
    website = website.split("/", 1)[0]
    if website.startswith("www."):
        website = website[4:]
    return website.strip()


def parse_repo_draft_lead_ids() -> set[int]:
    drafted_ids: set[int] = set()
    if not DRAFTS_ROOT.exists():
        return drafted_ids
    for path in DRAFTS_ROOT.rglob("*.txt"):
        name = path.name
        parts = name.split("-")
        if parts and parts[0].isdigit():
            drafted_ids.add(int(parts[0]))
            continue
        if name.startswith("lead-") and len(parts) > 1 and parts[1].isdigit():
            drafted_ids.add(int(parts[1]))
    return drafted_ids


def mailbox_draft_lead_ids(conn: sqlite3.Connection) -> set[int]:
    rows = conn.execute("SELECT DISTINCT lead_id FROM leadops_drafts WHERE lead_id IS NOT NULL").fetchall()
    return {int(row[0]) for row in rows}


def parse_sent_emails() -> set[str]:
    if not SENT_ITEMS_PATH.exists():
        return set()
    payload = json.loads(SENT_ITEMS_PATH.read_text(encoding="utf-8"))
    emails: set[str] = set()
    for row in payload:
        email = normalized_email(str(row.get("email") or ""))
        if looks_like_real_email(email):
            emails.add(email)
    return emails


def profile_issue_rows(
    repo_ids: set[int],
    mailbox_ids: set[int],
    sent_emails: set[str],
    limit: int,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    if not PROFILES_ROOT.exists():
        return rows
    for path in sorted(PROFILES_ROOT.rglob("profile.md")):
        text = path.read_text(encoding="utf-8", errors="ignore")
        id_match = re.search(r"profiles[\\/](\d+-\d+)[\\/](\d+)-", str(path))
        if not id_match:
            continue
        lead_id = int(id_match.group(2))
        if lead_id in repo_ids or lead_id in mailbox_ids:
            continue
        status_match = re.search(r"^Status:\s*(.+)$", text, re.M)
        outreach_match = re.search(r"^Outreach status:\s*(.+)$", text, re.M)
        email_match = re.search(r"^Email:\s*(.+)$", text, re.M)
        website_match = re.search(r"^Website:\s*(.+)$", text, re.M)
        name_match = re.search(r"^#\s+(.+)$", text, re.M)
        if not status_match or not outreach_match or not email_match or not website_match:
            continue
        status = str(status_match.group(1)).strip().lower()
        outreach_status = str(outreach_match.group(1)).strip().lower()
        email = str(email_match.group(1)).strip()
        website = str(website_match.group(1)).strip()
        name = str(name_match.group(1)).strip() if name_match else path.parent.name
        if status not in {"ready", "draft-prepared"}:
            continue
        if outreach_status != "uncontacted":
            continue
        if is_family_excluded(lead_id, name):
            continue
        if not looks_like_real_email(email):
            continue
        if normalized_email(email) in sent_emails:
            continue
        if not website or website.lower() == "unknown":
            continue
        findings: list[tuple[int, str]] = []
        for label, rank in (("Giant/Critical", 3), ("Big", 2), ("Medium", 1)):
            pattern = rf"^-\s+{re.escape(label)}:\s*(.+)$"
            for match in re.finditer(pattern, text, re.M):
                issue = str(match.group(1)).strip()
                lowered = issue.lower()
                if any(keyword in lowered for keyword in PROFILE_ISSUE_KEYWORDS):
                    findings.append((rank, issue))
        if not findings:
            continue
        findings.sort(key=lambda item: (-item[0], item[1]))
        rows.append(
            {
                "lead_id": lead_id,
                "name": name,
                "email": email,
                "website": website,
                "top_issue": findings[0][1],
                "issue_rank": findings[0][0],
                "profile_path": str(path.relative_to(REPO_ROOT)),
                "lane_reason": "profile_issue_email",
            }
        )
        if len(rows) >= limit:
            break
    return rows


def repo_only_safe_review_rows(
    conn: sqlite3.Connection,
    repo_ids: set[int],
    mailbox_ids: set[int],
    sent_emails: set[str],
    limit: int,
) -> list[dict[str, object]]:
    if not repo_ids:
        return []
    ids = sorted(repo_ids - mailbox_ids)
    placeholders = ",".join("?" for _ in ids)
    query = f"""
        SELECT
            s.lead_id,
            s.name,
            s.email,
            s.website,
            s.primary_send_hook,
            s.next_action,
            o.overall_contact_state,
            o.email_lane_status,
            o.contact_form_status,
            o.email_contacted_rows,
            o.contact_form_contacted_rows
        FROM leadops_v_send_now_mailbox_safe s
        JOIN leadops_v_outreach_contact_state o
          USING (lead_id)
        WHERE s.lead_id IN ({placeholders})
        ORDER BY s.lead_id ASC
    """
    rows: list[dict[str, object]] = []
    for row in conn.execute(query, ids):
        lead_id = int(row["lead_id"])
        name = str(row["name"] or "")
        email = normalized_email(str(row["email"] or ""))
        if is_family_excluded(lead_id, name):
            continue
        if email and email in sent_emails:
            continue
        rows.append(
            {
                "lead_id": lead_id,
                "name": name,
                "email": row["email"],
                "website": row["website"],
                "primary_send_hook": row["primary_send_hook"],
                "next_action": row["next_action"],
                "overall_contact_state": row["overall_contact_state"],
                "email_lane_status": row["email_lane_status"],
                "contact_form_status": row["contact_form_status"],
                "email_contacted_rows": int(row["email_contacted_rows"] or 0),
                "contact_form_contacted_rows": int(row["contact_form_contacted_rows"] or 0),
                "lane_reason": "repo_only_safe_review",
            }
        )
        if len(rows) >= limit:
            break
    return rows


def ready_email_now_rows(
    conn: sqlite3.Connection,
    repo_ids: set[int],
    mailbox_ids: set[int],
    sent_emails: set[str],
    limit: int,
) -> list[dict[str, object]]:
    query = """
        WITH audit AS (
            SELECT
                lead_id,
                MAX(
                    CASE severity
                        WHEN 'critical' THEN 4
                        WHEN 'high' THEN 3
                        WHEN 'medium' THEN 2
                        WHEN 'low' THEN 1
                        ELSE 0
                    END
                ) AS audit_severity_rank,
                GROUP_CONCAT(DISTINCT issue_type_norm) AS audit_issue_types
            FROM leadops_v_audit_findings_actionable
            WHERE next_action = 'draft_from_verified_issue'
            GROUP BY lead_id
        )
        SELECT
            s.lead_id,
            s.name,
            s.email,
            s.website,
            s.primary_send_hook,
            s.next_action,
            s.audience_family,
            s.audience_type,
            COALESCE(a.audit_severity_rank, 0) AS audit_severity_rank,
            COALESCE(a.audit_issue_types, '') AS audit_issue_types
        FROM leadops_v_send_now_mailbox_safe s
        LEFT JOIN audit a USING (lead_id)
        ORDER BY
            COALESCE(a.audit_severity_rank, 0) DESC,
            CASE WHEN s.primary_send_hook = 'website_audit' THEN 1 ELSE 0 END DESC,
            s.lead_id ASC
    """
    rows: list[dict[str, object]] = []
    for row in conn.execute(query):
        lead_id = int(row["lead_id"])
        name = str(row["name"] or "")
        email = normalized_email(str(row["email"] or ""))
        if lead_id in repo_ids or lead_id in mailbox_ids:
            continue
        if is_family_excluded(lead_id, name):
            continue
        if email and email in sent_emails:
            continue
        rows.append(
            {
                "lead_id": lead_id,
                "name": name,
                "email": row["email"],
                "website": row["website"],
                "audience_family": row["audience_family"],
                "audience_type": row["audience_type"],
                "primary_send_hook": row["primary_send_hook"],
                "next_action": row["next_action"],
                "audit_severity_rank": int(row["audit_severity_rank"] or 0),
                "audit_issue_types": row["audit_issue_types"],
                "lane_reason": "ready_email_now",
            }
        )
        if len(rows) >= limit:
            break
    return rows


def needs_audit_rows(
    conn: sqlite3.Connection,
    repo_ids: set[int],
    mailbox_ids: set[int],
    sent_emails: set[str],
    limit: int,
    require_email: bool,
) -> list[dict[str, object]]:
    query = """
        SELECT
            lead_id,
            name,
            email,
            website,
            priority_bucket,
            priority_score,
            missing_fields,
            missing_field_count,
            audience_family,
            audience_type,
            audience_subtype,
            outreach_voice,
            entity_match_score,
            entity_match_confidence,
            next_action
        FROM leadops_v_research_now
        WHERE status = 'ready'
          AND outreach_status = 'uncontacted'
        ORDER BY
            priority_score DESC,
            CASE entity_match_confidence
                WHEN 'high' THEN 3
                WHEN 'medium' THEN 2
                WHEN 'low' THEN 1
                ELSE 0
            END DESC,
            lead_id ASC
    """
    rows: list[dict[str, object]] = []
    for row in conn.execute(query):
        lead_id = int(row["lead_id"])
        name = str(row["name"] or "")
        email = str(row["email"] or "").strip()
        website = str(row["website"] or "").strip()
        confidence = str(row["entity_match_confidence"] or "")
        email_key = normalized_email(email)
        if lead_id in repo_ids or lead_id in mailbox_ids:
            continue
        if is_family_excluded(lead_id, name):
            continue
        if email_key and email_key in sent_emails:
            continue
        if require_email and not looks_like_real_email(email):
            continue
        if not require_email and looks_like_real_email(email):
            continue
        if not website:
            continue
        if confidence == "mismatch":
            continue
        rows.append(
            {
                "lead_id": lead_id,
                "name": name,
                "email": email or None,
                "website": website,
                "priority_bucket": row["priority_bucket"],
                "priority_score": int(row["priority_score"] or 0),
                "missing_fields": row["missing_fields"],
                "missing_field_count": int(row["missing_field_count"] or 0),
                "audience_family": row["audience_family"],
                "audience_type": row["audience_type"],
                "audience_subtype": row["audience_subtype"],
                "outreach_voice": row["outreach_voice"],
                "entity_match_score": int(row["entity_match_score"] or 0),
                "entity_match_confidence": confidence,
                "next_action": row["next_action"],
                "lane_reason": "needs_audit_email" if require_email else "needs_audit_non_email",
            }
        )
        if len(rows) >= limit:
            break
    return rows


def volume_research_rows(
    conn: sqlite3.Connection,
    repo_ids: set[int],
    mailbox_ids: set[int],
    sent_emails: set[str],
    limit: int,
    require_email: bool,
) -> list[dict[str, object]]:
    query = """
        SELECT
            lead_id,
            name,
            email,
            website,
            priority_bucket,
            priority_score,
            missing_fields,
            missing_field_count,
            audience_family,
            audience_type,
            audience_subtype,
            outreach_voice,
            entity_match_score,
            entity_match_confidence,
            next_action
        FROM leadops_v_research_now
        WHERE status = 'ready'
          AND outreach_status = 'uncontacted'
          AND next_action IN (
                'needs_contact_search',
                'needs_audit_or_outreach_angle',
                'needs_enrichment',
                'needs_verified_email',
                'needs_contact_path'
          )
        ORDER BY
            CASE next_action
                WHEN 'needs_contact_search' THEN 5
                WHEN 'needs_audit_or_outreach_angle' THEN 4
                WHEN 'needs_enrichment' THEN 3
                WHEN 'needs_verified_email' THEN 2
                WHEN 'needs_contact_path' THEN 1
                ELSE 0
            END DESC,
            priority_score DESC,
            CASE entity_match_confidence
                WHEN 'high' THEN 3
                WHEN 'medium' THEN 2
                WHEN 'low' THEN 1
                ELSE 0
            END DESC,
            lead_id ASC
    """
    rows: list[dict[str, object]] = []
    seen_email_keys: set[str] = set()
    seen_host_keys: set[str] = set()
    for row in conn.execute(query):
        lead_id = int(row["lead_id"])
        name = str(row["name"] or "")
        email = str(row["email"] or "").strip()
        website = str(row["website"] or "").strip()
        confidence = str(row["entity_match_confidence"] or "")
        email_key = normalized_email(email) if looks_like_real_email(email) else ""
        host_key = normalized_website_host(website)
        if lead_id in repo_ids or lead_id in mailbox_ids:
            continue
        if is_family_excluded(lead_id, name):
            continue
        if email_key and email_key in sent_emails:
            continue
        if require_email and not looks_like_real_email(email):
            continue
        if not require_email and looks_like_real_email(email):
            continue
        if not website:
            continue
        if confidence == "mismatch":
            continue
        if email_key and email_key in seen_email_keys:
            continue
        if host_key and host_key in seen_host_keys:
            continue
        rows.append(
            {
                "lead_id": lead_id,
                "name": name,
                "email": email or None,
                "website": website,
                "priority_bucket": row["priority_bucket"],
                "priority_score": int(row["priority_score"] or 0),
                "missing_fields": row["missing_fields"],
                "missing_field_count": int(row["missing_field_count"] or 0),
                "audience_family": row["audience_family"],
                "audience_type": row["audience_type"],
                "audience_subtype": row["audience_subtype"],
                "outreach_voice": row["outreach_voice"],
                "entity_match_score": int(row["entity_match_score"] or 0),
                "entity_match_confidence": confidence,
                "next_action": row["next_action"],
                "email_key": email_key or None,
                "website_host_key": host_key or None,
                "lane_reason": "volume_email_audit" if require_email else "volume_non_email_research",
            }
        )
        if email_key:
            seen_email_keys.add(email_key)
        if host_key:
            seen_host_keys.add(host_key)
        if len(rows) >= limit:
            break
    return rows


def main() -> None:
    args = build_parser().parse_args()
    with connect(Path(args.db).resolve()) as conn:
        repo_ids = parse_repo_draft_lead_ids()
        mailbox_ids = mailbox_draft_lead_ids(conn)
        sent_emails = parse_sent_emails()

        ready_email_now = ready_email_now_rows(conn, repo_ids, mailbox_ids, sent_emails, args.limit_per_lane)
        repo_only_safe_review = repo_only_safe_review_rows(conn, repo_ids, mailbox_ids, sent_emails, args.limit_per_lane)
        needs_audit_email = needs_audit_rows(conn, repo_ids, mailbox_ids, sent_emails, args.limit_per_lane, require_email=True)
        needs_audit_non_email = needs_audit_rows(conn, repo_ids, mailbox_ids, sent_emails, args.limit_per_lane, require_email=False)
        volume_email_audit = volume_research_rows(conn, repo_ids, mailbox_ids, sent_emails, args.limit_per_lane, require_email=True)
        volume_non_email_research = volume_research_rows(
            conn,
            repo_ids,
            mailbox_ids,
            sent_emails,
            args.limit_per_lane,
            require_email=False,
        )
        profile_issue_email = profile_issue_rows(repo_ids, mailbox_ids, sent_emails, args.limit_per_lane)

        payload = {
            "repo_drafted_ids_count": len(repo_ids),
            "mailbox_drafted_ids_count": len(mailbox_ids),
            "sent_emails_count": len(sent_emails),
            "family_excluded_ids": sorted(FAMILY_EXCLUDE_IDS),
            "mode": args.mode,
            "lane_counts": {
                "ready_email_now": len(ready_email_now),
                "repo_only_safe_review": len(repo_only_safe_review),
                "needs_audit_email": len(needs_audit_email),
                "needs_audit_non_email": len(needs_audit_non_email),
                "volume_email_audit": len(volume_email_audit),
                "volume_non_email_research": len(volume_non_email_research),
                "profile_issue_email": len(profile_issue_email),
            },
            "lanes": {
                "ready_email_now": ready_email_now,
                "repo_only_safe_review": repo_only_safe_review,
                "needs_audit_email": needs_audit_email,
                "needs_audit_non_email": needs_audit_non_email,
                "profile_issue_email": profile_issue_email,
            },
        }
        if args.mode == "volume":
            payload["lanes"]["volume_email_audit"] = volume_email_audit
            payload["lanes"]["volume_non_email_research"] = volume_non_email_research
        emit(payload, args.json)


if __name__ == "__main__":
    main()
