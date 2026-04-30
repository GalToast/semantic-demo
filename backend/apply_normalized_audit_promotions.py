from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"


def now_utc() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Promote ready normalized audit candidates into crm.sqlite and record "
            "review/adjudication decisions."
        )
    )
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to crm.sqlite")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable output")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing changes")
    parser.add_argument("--apply-ready", action="store_true", help="Promote all current ready candidates")
    parser.add_argument("--limit", type=int, default=0, help="Optional limit when applying ready candidates")
    parser.add_argument("--list-open", action="store_true", help="List open review queue items")
    parser.add_argument("--lead-id", type=int, help="Select a queue item by lead_id")
    parser.add_argument("--field-name", help="Select a queue item by field_name together with --lead-id")
    parser.add_argument("--candidate-key", help="Promote one specific candidate key")
    parser.add_argument("--queue-key", help="Resolve one specific review queue item")
    parser.add_argument("--approve", action="store_true", help="Mark the selected queue item approved")
    parser.add_argument("--reject", action="store_true", help="Mark the selected queue item rejected")
    parser.add_argument("--defer", action="store_true", help="Mark the selected queue item deferred")
    parser.add_argument("--promote-queue", action="store_true", help="Promote the selected queue item and record it as promoted")
    parser.add_argument(
        "--status",
        choices=["open", "approved", "promoted", "rejected", "deferred"],
        help="Review status to store for --queue-key",
    )
    parser.add_argument("--reviewer", default="codex", help="Reviewer name for adjudication history")
    parser.add_argument("--note", default="", help="Optional review/promotion note")
    return parser.parse_args()


def norm(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def normalize_phone(value: str) -> str:
    return "".join(ch for ch in norm(value) if ch.isdigit())


def normalize_url(value: str) -> str:
    return norm(value).rstrip("/")


def normalize_candidate_value(field_name: str, value: str) -> str:
    if field_name == "phone":
        return normalize_phone(value)
    if field_name in {"contact_form", "website", "facebook_url", "instagram_url", "twitter_url", "linkedin_url", "youtube_url", "tiktok_url", "yelp_url", "google_business_url"}:
        return normalize_url(value)
    return norm(value)


def ensure_profile_stub(conn: sqlite3.Connection, lead_id: int) -> None:
    exists = conn.execute("SELECT 1 FROM leadops_profiles WHERE lead_id = ?", (lead_id,)).fetchone()
    if exists:
        return
    conn.execute(
        """
        INSERT INTO leadops_profiles (lead_id, raw_markdown, kv_json, sections_json)
        VALUES (?, '', '{}', '{}')
        """,
        (lead_id,),
    )


def insert_contact(
    conn: sqlite3.Connection,
    *,
    lead_id: int,
    contact_type: str,
    value: str,
    label: str | None,
    source: str,
) -> bool:
    normalized = normalize_candidate_value(contact_type if contact_type != "social" else (label or "social"), value)
    exists = conn.execute(
        """
        SELECT 1
        FROM leadops_contacts
        WHERE lead_id = ?
          AND contact_type = ?
          AND normalized_value = ?
        """,
        (lead_id, contact_type, normalized),
    ).fetchone()
    if exists:
        return False
    conn.execute(
        """
        INSERT INTO leadops_contacts (
            lead_id,
            contact_type,
            value,
            normalized_value,
            label,
            is_primary,
            source
        ) VALUES (?, ?, ?, ?, ?, 0, ?)
        """,
        (lead_id, contact_type, norm(value), normalized, label, source),
    )
    return True


def fetch_candidate(conn: sqlite3.Connection, candidate_key: str) -> sqlite3.Row | None:
    conn.row_factory = sqlite3.Row
    return conn.execute(
        """
        SELECT *
        FROM leadops_audit_autofill_candidates
        WHERE candidate_key = ?
        """,
        (candidate_key,),
    ).fetchone()


def list_open_queue(conn: sqlite3.Connection, limit: int) -> list[dict[str, Any]]:
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT queue_key, lead_id, name, field_name, proposed_value, priority, source_kind, source_ref
        FROM leadops_v_audit_review_queue_open
        ORDER BY
            CASE priority
                WHEN 'high' THEN 1
                WHEN 'medium' THEN 2
                ELSE 3
            END,
            lead_id ASC,
            field_name ASC
        """
    ).fetchall()
    if limit > 0:
        rows = rows[:limit]
    return [dict(row) for row in rows]


def select_queue_item(
    conn: sqlite3.Connection,
    *,
    queue_key: str | None = None,
    lead_id: int | None = None,
    field_name: str | None = None,
) -> sqlite3.Row | None:
    conn.row_factory = sqlite3.Row
    if queue_key:
        return conn.execute(
            "SELECT * FROM leadops_audit_review_queue WHERE queue_key = ?",
            (queue_key,),
        ).fetchone()
    if lead_id is None:
        return None
    if field_name:
        rows = conn.execute(
            """
            SELECT q.*
            FROM leadops_audit_review_queue q
            LEFT JOIN leadops_audit_review_history h ON h.queue_key = q.queue_key
            WHERE q.lead_id = ?
              AND q.field_name = ?
              AND lower(COALESCE(h.review_status, q.status, 'open')) = 'open'
            """,
            (lead_id, field_name),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT q.*
            FROM leadops_audit_review_queue q
            LEFT JOIN leadops_audit_review_history h ON h.queue_key = q.queue_key
            WHERE q.lead_id = ?
              AND lower(COALESCE(h.review_status, q.status, 'open')) = 'open'
            ORDER BY q.id ASC
            """,
            (lead_id,),
        ).fetchall()
    if len(rows) != 1:
        return None
    return rows[0]


def promote_candidate(
    conn: sqlite3.Connection,
    candidate: sqlite3.Row,
    *,
    reviewer: str,
    note: str,
    dry_run: bool,
) -> dict[str, Any]:
    lead_id = int(candidate["lead_id"])
    field_name = norm(candidate["field_name"])
    target_table = norm(candidate["target_table"])
    target_column = norm(candidate["target_column"] or field_name)
    candidate_value = norm(candidate["candidate_value"])
    candidate_key = norm(candidate["candidate_key"])
    source_ref = norm(candidate["source_ref"])

    outcome = {
        "candidate_key": candidate_key,
        "lead_id": lead_id,
        "field_name": field_name,
        "target_table": target_table,
        "target_column": target_column,
        "candidate_value": candidate_value,
        "action": "skipped",
        "reason": "",
    }

    existing_promotion = conn.execute(
        "SELECT 1 FROM leadops_audit_candidate_promotions WHERE candidate_key = ?",
        (candidate_key,),
    ).fetchone()
    if existing_promotion:
        outcome["reason"] = "already promoted"
        return outcome

    if target_table == "leadops_leads":
        current = conn.execute(
            f"SELECT {target_column} FROM leadops_leads WHERE lead_id = ?",
            (lead_id,),
        ).fetchone()
        if current is None:
            outcome["reason"] = "lead missing"
            return outcome
        if norm(current[0]):
            outcome["reason"] = "target already populated"
            return outcome
        if not dry_run:
            conn.execute(
                f"UPDATE leadops_leads SET {target_column} = ? WHERE lead_id = ?",
                (candidate_value, lead_id),
            )
    elif target_table == "leadops_profiles":
        ensure_profile_stub(conn, lead_id)
        current = conn.execute(
            f"SELECT {target_column} FROM leadops_profiles WHERE lead_id = ?",
            (lead_id,),
        ).fetchone()
        if current and norm(current[0]):
            outcome["reason"] = "target already populated"
            return outcome
        if not dry_run:
            conn.execute(
                f"UPDATE leadops_profiles SET {target_column} = ? WHERE lead_id = ?",
                (candidate_value, lead_id),
            )
    elif target_table == "leadops_contacts":
        contact_type = "social" if field_name.endswith("_url") else field_name
        inserted = True if dry_run else insert_contact(
            conn,
            lead_id=lead_id,
            contact_type=contact_type,
            value=candidate_value,
            label=field_name if contact_type == "social" else None,
            source=f"normalized_audit:{source_ref}",
        )
        if not inserted:
            outcome["reason"] = "contact already exists"
            return outcome
    else:
        outcome["reason"] = f"unsupported target_table {target_table}"
        return outcome

    if not dry_run:
        conn.execute(
            """
            INSERT INTO leadops_audit_candidate_promotions (
                candidate_key,
                lead_id,
                field_name,
                promoted_to_table,
                promoted_to_column,
                promoted_value,
                promoted_at,
                promoted_by,
                promotion_note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                candidate_key,
                lead_id,
                field_name,
                target_table,
                target_column,
                candidate_value,
                now_utc(),
                reviewer,
                note,
            ),
        )

    outcome["action"] = "promoted"
    outcome["reason"] = "applied"
    return outcome


def apply_ready_candidates(
    conn: sqlite3.Connection,
    *,
    reviewer: str,
    note: str,
    dry_run: bool,
    limit: int,
) -> list[dict[str, Any]]:
    conn.row_factory = sqlite3.Row
    query = """
        SELECT *
        FROM leadops_v_audit_autofill_ready
        ORDER BY lead_id ASC, field_name ASC
    """
    rows = conn.execute(query).fetchall()
    if limit > 0:
        rows = rows[:limit]
    results = []
    for view_row in rows:
        candidate = fetch_candidate(conn, norm(view_row["candidate_key"]))
        if candidate is None:
            continue
        results.append(promote_candidate(conn, candidate, reviewer=reviewer, note=note, dry_run=dry_run))
    return results


def resolve_queue_item(
    conn: sqlite3.Connection,
    *,
    queue_key: str,
    status: str,
    reviewer: str,
    note: str,
    dry_run: bool,
) -> dict[str, Any]:
    conn.row_factory = sqlite3.Row
    queue_row = conn.execute(
        "SELECT * FROM leadops_audit_review_queue WHERE queue_key = ?",
        (queue_key,),
    ).fetchone()
    if queue_row is None:
        return {"queue_key": queue_key, "action": "missing", "reason": "queue item not found"}

    promoted = None
    candidate_key = norm(queue_row["candidate_key"])
    if status == "promoted" and candidate_key:
        candidate = fetch_candidate(conn, candidate_key)
        if candidate is not None:
            promoted = promote_candidate(conn, candidate, reviewer=reviewer, note=note, dry_run=dry_run)

    if not dry_run:
        conn.execute(
            """
            INSERT INTO leadops_audit_review_history (
                queue_key,
                review_status,
                reviewer,
                reviewed_at,
                resolution_note,
                promoted_candidate_key
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(queue_key) DO UPDATE SET
                review_status = excluded.review_status,
                reviewer = excluded.reviewer,
                reviewed_at = excluded.reviewed_at,
                resolution_note = excluded.resolution_note,
                promoted_candidate_key = excluded.promoted_candidate_key
            """,
            (
                queue_key,
                status,
                reviewer,
                now_utc(),
                note,
                candidate_key or None,
            ),
        )

    return {
        "queue_key": queue_key,
        "action": "resolved",
        "status": status,
        "candidate_key": candidate_key or None,
        "promotion": promoted,
    }


def summarize(conn: sqlite3.Connection) -> dict[str, Any]:
    conn.row_factory = sqlite3.Row
    return {
        "ready_count": int(conn.execute("SELECT COUNT(*) FROM leadops_v_audit_autofill_ready").fetchone()[0]),
        "queue_open_count": int(conn.execute("SELECT COUNT(*) FROM leadops_v_audit_review_queue_open").fetchone()[0]),
        "verified_negative_count": int(conn.execute("SELECT COUNT(*) FROM leadops_v_audit_verified_negatives").fetchone()[0]),
        "promotion_count": int(conn.execute("SELECT COUNT(*) FROM leadops_v_audit_promotion_status").fetchone()[0]),
    }


def main() -> int:
    args = parse_args()
    conn = sqlite3.connect(Path(args.db))
    try:
        results: dict[str, Any] = {"summary_before": summarize(conn)}

        if args.list_open:
            results["open_queue"] = list_open_queue(conn, args.limit)

        if args.apply_ready:
            results["applied_ready"] = apply_ready_candidates(
                conn,
                reviewer=args.reviewer,
                note=args.note,
                dry_run=args.dry_run,
                limit=args.limit,
            )

        if args.candidate_key:
            candidate = fetch_candidate(conn, args.candidate_key)
            if candidate is None:
                results["candidate"] = {"candidate_key": args.candidate_key, "action": "missing"}
            else:
                results["candidate"] = promote_candidate(
                    conn,
                    candidate,
                    reviewer=args.reviewer,
                    note=args.note,
                    dry_run=args.dry_run,
                )

        queue_status = args.status
        if args.promote_queue:
            queue_status = "promoted"
        elif args.approve:
            queue_status = "approved"
        elif args.reject:
            queue_status = "rejected"
        elif args.defer:
            queue_status = "deferred"

        selected_queue = None
        if args.queue_key or args.lead_id is not None:
            selected_queue = select_queue_item(
                conn,
                queue_key=args.queue_key,
                lead_id=args.lead_id,
                field_name=args.field_name,
            )
            if selected_queue is None:
                selector = {"queue_key": args.queue_key, "lead_id": args.lead_id, "field_name": args.field_name}
                results["queue_lookup"] = {"action": "missing_or_ambiguous", "selector": selector}

        if selected_queue is not None:
            results["queue_lookup"] = {
                "queue_key": norm(selected_queue["queue_key"]),
                "lead_id": int(selected_queue["lead_id"]),
                "field_name": norm(selected_queue["field_name"]),
                "proposed_value": norm(selected_queue["proposed_value"]),
            }

        if selected_queue is not None and queue_status:
            results["queue_resolution"] = resolve_queue_item(
                conn,
                queue_key=norm(selected_queue["queue_key"]),
                status=queue_status,
                reviewer=args.reviewer,
                note=args.note,
                dry_run=args.dry_run,
            )

        results["summary_after"] = summarize(conn)
        if args.dry_run:
            conn.rollback()
        else:
            conn.commit()
    finally:
        conn.close()

    if args.json:
        print(json.dumps(results, ensure_ascii=True, indent=2, sort_keys=True))
    else:
        print(json.dumps(results, ensure_ascii=True, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
