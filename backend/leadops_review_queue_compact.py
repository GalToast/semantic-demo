from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Show a compact, operator-friendly view of the open normalized audit review queue."
    )
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to crm.sqlite")
    parser.add_argument("--limit", type=int, default=10, help="Maximum queue items to show")
    parser.add_argument("--lead-id", type=int, help="Optional lead filter")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable output")
    return parser.parse_args()


def norm(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def current_field_state(conn: sqlite3.Connection, lead_id: int, field_name: str) -> dict[str, Any]:
    conn.row_factory = sqlite3.Row
    if field_name in {"email", "phone", "website", "contact_form", "social_media"}:
        row = conn.execute(
            f"SELECT {field_name} AS value FROM leadops_leads WHERE lead_id = ?",
            (lead_id,),
        ).fetchone()
        return {"table": "leadops_leads", "value": norm(row["value"]) if row else ""}
    if field_name == "address":
        row = conn.execute("SELECT address FROM leadops_profiles WHERE lead_id = ?", (lead_id,)).fetchone()
        return {"table": "leadops_profiles", "value": norm(row["address"]) if row else ""}
    row = conn.execute(
        """
        SELECT value, label, source
        FROM leadops_contacts
        WHERE lead_id = ?
          AND contact_type = 'social'
          AND (label = ? OR label IS NULL)
        ORDER BY is_primary DESC, id DESC
        LIMIT 1
        """,
        (lead_id, field_name),
    ).fetchone()
    if row:
        return {"table": "leadops_contacts", "value": norm(row["value"]), "label": norm(row["label"]), "source": norm(row["source"])}
    return {"table": "leadops_contacts", "value": ""}


def source_excerpt(relative_path: str, proposed_value: str) -> str:
    path = REPO_ROOT / relative_path
    if not path.exists() or not path.is_file():
        return ""
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""
    needle = norm(proposed_value).strip()
    if not needle:
        return ""
    idx = text.find(needle)
    if idx < 0:
        idx = text.find(needle.rstrip("\"'}]),.;:"))
    if idx < 0:
        return ""
    start = max(0, idx - 80)
    end = min(len(text), idx + len(needle) + 80)
    excerpt = " ".join(text[start:end].split())
    return excerpt[:220]


def load_rows(conn: sqlite3.Connection, lead_id: int | None, limit: int) -> list[dict[str, Any]]:
    conn.row_factory = sqlite3.Row
    params: list[Any] = []
    where = ""
    if lead_id is not None:
        where = "WHERE q.lead_id = ?"
        params.append(lead_id)
    rows = conn.execute(
        f"""
        SELECT
            q.lead_id,
            l.name,
            l.website,
            q.queue_key,
            q.field_name,
            q.proposed_value,
            q.priority,
            q.reason,
            q.source_kind,
            q.source_ref
        FROM leadops_v_audit_review_queue_open q
        JOIN leadops_leads l ON l.lead_id = q.lead_id
        {where}
        ORDER BY
            CASE q.priority
                WHEN 'high' THEN 1
                WHEN 'medium' THEN 2
                ELSE 3
            END,
            q.lead_id ASC,
            q.field_name ASC
        LIMIT ?
        """,
        (*params, limit),
    ).fetchall()
    output: list[dict[str, Any]] = []
    for row in rows:
        current_state = current_field_state(conn, int(row["lead_id"]), norm(row["field_name"]))
        output.append(
            {
                "lead_id": row["lead_id"],
                "name": row["name"],
                "website": row["website"],
                "queue_key": row["queue_key"],
                "field_name": row["field_name"],
                "priority": row["priority"],
                "proposed_value": row["proposed_value"],
                "reason": row["reason"],
                "source_kind": row["source_kind"],
                "source_ref": row["source_ref"],
                "current_value": current_state.get("value", ""),
                "current_table": current_state.get("table", ""),
                "source_excerpt": source_excerpt(norm(row["source_ref"]), norm(row["proposed_value"])),
            }
        )
    return output


def print_text(rows: list[dict[str, Any]]) -> None:
    if not rows:
        print("Open normalized audit review queue is empty.")
        return
    print("Open normalized audit review queue")
    print("")
    for row in rows:
        print(f"[{row['lead_id']}] {row['name']} :: {row['field_name']} ({row['priority']})")
        print(f"  proposed={row['proposed_value']}")
        print(f"  current={row['current_value'] or '<blank>'} [{row['current_table']}]")
        print(f"  reason={row['reason']}")
        print(f"  source={row['source_ref']}")
        if row["source_excerpt"]:
            print(f"  excerpt={row['source_excerpt']}")
        print("")


def main() -> None:
    args = parse_args()
    conn = sqlite3.connect(args.db)
    try:
        rows = load_rows(conn, args.lead_id, args.limit)
        if args.json:
            print(json.dumps({"count": len(rows), "rows": rows}, indent=2))
        else:
            print_text(rows)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
