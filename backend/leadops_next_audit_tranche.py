from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"

FOCUS_CHOICES = (
    "general",
    "audit_gap",
    "missing_email",
    "missing_contact_form",
    "missing_social",
    "missing_phone",
    "entity_review",
    "enrichment_gap",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Select the next best website-backed audit tranche from crm.sqlite."
    )
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to crm.sqlite")
    parser.add_argument("--limit", type=int, default=10, help="Number of leads to return")
    parser.add_argument("--focus", choices=FOCUS_CHOICES, default="general", help="Primary gap lane to target")
    parser.add_argument(
        "--include-verified-absent",
        action="store_true",
        help="Keep leads even when the target field is already marked verified_absent",
    )
    parser.add_argument("--json", action="store_true", help="Emit machine-readable output")
    return parser.parse_args()


def norm(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def looks_like_web_root(value: str) -> bool:
    text = norm(value).lower()
    return text.startswith("http://") or text.startswith("https://")


def load_candidates(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    return conn.execute(
        """
        WITH negatives AS (
            SELECT
                lead_id,
                MAX(CASE WHEN field_name = 'email' AND observation_status = 'verified_absent' THEN 1 ELSE 0 END) AS email_absent,
                MAX(CASE WHEN field_name = 'phone' AND observation_status = 'verified_absent' THEN 1 ELSE 0 END) AS phone_absent,
                MAX(CASE WHEN field_name = 'contact_form' AND observation_status = 'verified_absent' THEN 1 ELSE 0 END) AS contact_form_absent,
                MAX(CASE WHEN field_name = 'social_media' AND observation_status = 'verified_absent' THEN 1 ELSE 0 END) AS social_absent
            FROM leadops_audit_field_observations
            GROUP BY lead_id
        )
        SELECT
            l.lead_id,
            l.name,
            l.batch,
            l.status,
            l.outreach_status,
            l.website,
            l.email,
            l.phone,
            l.contact_form,
            l.social_media,
            l.updated,
            COALESCE(r.next_action, '') AS next_action,
            COALESCE(r.priority_score, 0) AS priority_score,
            COALESCE(r.priority_bucket, '') AS priority_bucket,
            COALESCE(r.missing_fields, '') AS missing_fields,
            COALESCE(r.missing_field_count, 0) AS missing_field_count,
            COALESCE(ac.audited_status, '') AS audited_status,
            COALESCE(ac.has_audit_artifact, 0) AS has_audit_artifact,
            COALESCE(ac.has_enrichment_artifact, 0) AS has_enrichment_artifact,
            COALESCE(ac.has_structured_audit_findings, 0) AS has_structured_audit_findings,
            COALESCE(ac.has_audit_markdown, 0) AS has_audit_markdown,
            COALESCE(n.email_absent, 0) AS email_absent,
            COALESCE(n.phone_absent, 0) AS phone_absent,
            COALESCE(n.contact_form_absent, 0) AS contact_form_absent,
            COALESCE(n.social_absent, 0) AS social_absent
        FROM leadops_leads l
        LEFT JOIN leadops_v_research_now r ON r.lead_id = l.lead_id
        LEFT JOIN leadops_audit_coverage ac ON ac.lead_id = l.lead_id
        LEFT JOIN negatives n ON n.lead_id = l.lead_id
        WHERE l.disqualified = 0
          AND COALESCE(l.website, '') <> ''
        """
    ).fetchall()


def matches_focus(row: sqlite3.Row, focus: str, include_verified_absent: bool) -> bool:
    if not looks_like_web_root(norm(row["website"])):
        return False
    email_blank = not norm(row["email"])
    phone_blank = not norm(row["phone"])
    form_blank = not norm(row["contact_form"])
    social_blank = not norm(row["social_media"])

    if focus == "audit_gap":
        return not row["has_audit_artifact"] and not row["has_enrichment_artifact"]
    if focus == "missing_email":
        return email_blank and (include_verified_absent or not row["email_absent"])
    if focus == "missing_contact_form":
        return form_blank and (include_verified_absent or not row["contact_form_absent"])
    if focus == "missing_social":
        return social_blank and (include_verified_absent or not row["social_absent"])
    if focus == "missing_phone":
        return phone_blank and (include_verified_absent or not row["phone_absent"])
    if focus == "entity_review":
        return norm(row["next_action"]) == "needs_entity_review"
    if focus == "enrichment_gap":
        return norm(row["next_action"]) in {"needs_enrichment", "needs_audit_or_outreach_angle"}

    return any(
        [
            email_blank and (include_verified_absent or not row["email_absent"]),
            phone_blank and (include_verified_absent or not row["phone_absent"]),
            form_blank and (include_verified_absent or not row["contact_form_absent"]),
            social_blank and (include_verified_absent or not row["social_absent"]),
            norm(row["next_action"]) in {"needs_entity_review", "needs_enrichment", "needs_audit_or_outreach_angle"},
            not row["has_audit_artifact"],
            not row["has_enrichment_artifact"],
        ]
    )


def score_row(row: sqlite3.Row, focus: str) -> int:
    score = int(row["priority_score"] or 0)
    email_blank = not norm(row["email"])
    phone_blank = not norm(row["phone"])
    form_blank = not norm(row["contact_form"])
    social_blank = not norm(row["social_media"])

    if not row["has_audit_artifact"]:
        score += 20
    if not row["has_enrichment_artifact"]:
        score += 15
    if not row["has_structured_audit_findings"]:
        score += 5

    if email_blank and not row["email_absent"]:
        score += 14
    if form_blank and not row["contact_form_absent"]:
        score += 12
    if social_blank and not row["social_absent"]:
        score += 10
    if phone_blank and not row["phone_absent"]:
        score += 8

    if norm(row["next_action"]) == "needs_entity_review":
        score += 18
    if norm(row["next_action"]) == "needs_verified_email":
        score += 16
    if norm(row["next_action"]) == "needs_enrichment":
        score += 10
    if norm(row["next_action"]) == "needs_audit_or_outreach_angle":
        score += 8

    focus_bonus = {
        "audit_gap": 25 if (not row["has_audit_artifact"] and not row["has_enrichment_artifact"]) else 0,
        "missing_email": 25 if (email_blank and not row["email_absent"]) else 0,
        "missing_contact_form": 25 if (form_blank and not row["contact_form_absent"]) else 0,
        "missing_social": 25 if (social_blank and not row["social_absent"]) else 0,
        "missing_phone": 25 if (phone_blank and not row["phone_absent"]) else 0,
        "entity_review": 25 if norm(row["next_action"]) == "needs_entity_review" else 0,
        "enrichment_gap": 25 if norm(row["next_action"]) in {"needs_enrichment", "needs_audit_or_outreach_angle"} else 0,
        "general": 0,
    }
    score += focus_bonus[focus]
    return score


def summarize_gap_state(row: sqlite3.Row) -> str:
    parts: list[str] = []
    if not norm(row["email"]):
        parts.append("email")
        if row["email_absent"]:
            parts[-1] += ":verified_absent"
    if not norm(row["phone"]):
        parts.append("phone")
        if row["phone_absent"]:
            parts[-1] += ":verified_absent"
    if not norm(row["contact_form"]):
        parts.append("contact_form")
        if row["contact_form_absent"]:
            parts[-1] += ":verified_absent"
    if not norm(row["social_media"]):
        parts.append("social_media")
        if row["social_absent"]:
            parts[-1] += ":verified_absent"
    return ", ".join(parts) or "no_primary_gap"


def materialize_rows(rows: list[sqlite3.Row], focus: str) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for row in rows:
        output.append(
            {
                "lead_id": row["lead_id"],
                "name": row["name"],
                "website": row["website"],
                "email": row["email"],
                "phone": row["phone"],
                "contact_form": row["contact_form"],
                "social_media": row["social_media"],
                "next_action": row["next_action"],
                "priority_bucket": row["priority_bucket"],
                "priority_score": row["priority_score"],
                "audited_status": row["audited_status"] or "none",
                "has_audit_artifact": bool(row["has_audit_artifact"]),
                "has_enrichment_artifact": bool(row["has_enrichment_artifact"]),
                "gap_state": summarize_gap_state(row),
                "missing_fields": row["missing_fields"],
                "score": score_row(row, focus),
            }
        )
    return output


def print_text(rows: list[dict[str, Any]], focus: str) -> None:
    if not rows:
        print(f"No tranche candidates found for focus '{focus}'.")
        return
    print(f"Next audit tranche for focus '{focus}'")
    print("")
    for row in rows:
        print(f"[{row['lead_id']}] {row['name']}")
        print(f"  score={row['score']} next_action={row['next_action'] or 'none'} audited={row['audited_status']}")
        print(f"  website={row['website']}")
        print(f"  gaps={row['gap_state']}")
        if row["missing_fields"]:
            print(f"  missing_fields={row['missing_fields']}")
        print("")


def main() -> None:
    args = parse_args()
    conn = sqlite3.connect(args.db)
    try:
        rows = load_candidates(conn)
        filtered = [row for row in rows if matches_focus(row, args.focus, args.include_verified_absent)]
        filtered.sort(
            key=lambda row: (
                -score_row(row, args.focus),
                norm(row["updated"]),
                int(row["lead_id"]),
            )
        )
        materialized = materialize_rows(filtered[: args.limit], args.focus)
        summary = {
            "focus": args.focus,
            "candidate_count": len(filtered),
            "returned": len(materialized),
        }
        if args.json:
            print(json.dumps({"summary": summary, "rows": materialized}, indent=2))
        else:
            print_text(materialized, args.focus)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
