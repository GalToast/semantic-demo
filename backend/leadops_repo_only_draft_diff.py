from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"
DRAFTS_ROOT = REPO_ROOT / "outreach" / "drafts"
DEFAULT_DRAFT_DIRS = [
    "outreach/drafts/safe-send-2026-03-25",
    "outreach/drafts/safe-send-import-next",
    "outreach/drafts/batch-100-worker-sprint-2026-03-09",
    "outreach/drafts/diamond-wave-38-2026-03-11",
    "outreach/drafts/gold-tier-batch-2026-03-19/txt",
]
FAMILY_EXCLUDE_IDS = {1618}
FAMILY_EXCLUDE_PATTERNS = ("coffee cabin", "cj insulation", "cj builders")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Diff repo draft files against mailbox drafts and clear repo-only drafts "
            "against prior email/contact-form outreach."
        )
    )
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to crm.sqlite")
    parser.add_argument("--limit", type=int, default=200, help="Maximum repo-only rows to emit")
    parser.add_argument(
        "--draft-dir",
        action="append",
        default=[],
        help="Restrict scan to specific draft directories relative to repo root. May be passed multiple times.",
    )
    parser.add_argument(
        "--clearance",
        choices=["all", "review", "blocked_prior_contact", "blocked_family"],
        default="all",
        help="Optional clearance filter for emitted rows.",
    )
    parser.add_argument(
        "--safe-only",
        action="store_true",
        help="Only emit repo-only drafts that still appear in leadops_v_send_now_mailbox_safe.",
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
    safe = text.encode(encoding, errors="replace").decode(encoding, errors="replace")
    print(safe)


def resolve_draft_dirs(raw_dirs: list[str]) -> list[Path]:
    dirs = raw_dirs or DEFAULT_DRAFT_DIRS
    resolved: list[Path] = []
    for raw in dirs:
        path = Path(raw)
        if not path.is_absolute():
            path = REPO_ROOT / path
        resolved.append(path)
    return resolved


def parse_repo_drafts(draft_dirs: list[Path]) -> dict[int, list[str]]:
    drafted: dict[int, list[str]] = {}
    for draft_dir in draft_dirs:
        if not draft_dir.exists():
            continue
        for path in sorted(draft_dir.rglob("*.txt")):
            lead_id = parse_lead_id_from_name(path.name)
            if lead_id is None:
                continue
            drafted.setdefault(lead_id, []).append(str(path.relative_to(REPO_ROOT)).replace("\\", "/"))
    return drafted


def parse_lead_id_from_name(name: str) -> int | None:
    parts = name.split("-")
    if parts and parts[0].isdigit():
        return int(parts[0])
    if name.startswith("lead-") and len(parts) > 1 and parts[1].isdigit():
        return int(parts[1])
    return None


def mailbox_draft_lead_ids(conn: sqlite3.Connection) -> set[int]:
    rows = conn.execute("SELECT DISTINCT lead_id FROM leadops_drafts WHERE lead_id IS NOT NULL").fetchall()
    return {int(row[0]) for row in rows}


def load_outreach_state(conn: sqlite3.Connection, lead_ids: list[int]) -> dict[int, sqlite3.Row]:
    if not lead_ids:
        return {}
    placeholders = ",".join("?" for _ in lead_ids)
    query = f"""
        SELECT
            lead_id,
            name,
            outreach_status,
            overall_contact_state,
            email_lane_status,
            contact_form_status,
            has_email_contact,
            has_contact_form_contact,
            has_draft,
            email_contacted_rows,
            contact_form_contacted_rows,
            contacted_channels
        FROM leadops_v_outreach_contact_state
        WHERE lead_id IN ({placeholders})
    """
    return {int(row["lead_id"]): row for row in conn.execute(query, lead_ids)}


def load_lead_details(conn: sqlite3.Connection, lead_ids: list[int]) -> dict[int, sqlite3.Row]:
    if not lead_ids:
        return {}
    placeholders = ",".join("?" for _ in lead_ids)
    query = f"""
        SELECT
            lead_id,
            name,
            email,
            website,
            audience_family,
            audience_type,
            primary_send_hook,
            next_action,
            send_priority
        FROM leadops_v_send_now_mailbox_safe
        WHERE lead_id IN ({placeholders})
    """
    return {int(row["lead_id"]): row for row in conn.execute(query, lead_ids)}


def classify_repo_only(
    repo_drafts: dict[int, list[str]],
    mailbox_ids: set[int],
    state_rows: dict[int, sqlite3.Row],
    safe_rows: dict[int, sqlite3.Row],
) -> list[dict[str, object]]:
    results: list[dict[str, object]] = []
    for lead_id, draft_paths in sorted(repo_drafts.items()):
        if lead_id in mailbox_ids:
            continue

        state = state_rows.get(lead_id)
        safe = safe_rows.get(lead_id)
        name = ""
        if safe is not None:
            name = str(safe["name"] or "")
        elif state is not None:
            name = str(state["name"] or "")

        lowered_name = name.lower()
        family_excluded = lead_id in FAMILY_EXCLUDE_IDS or any(pattern in lowered_name for pattern in FAMILY_EXCLUDE_PATTERNS)
        has_email_contact = bool(state["has_email_contact"]) if state is not None else False
        has_contact_form_contact = bool(state["has_contact_form_contact"]) if state is not None else False

        reasons: list[str] = []
        if family_excluded:
            reasons.append("family_excluded")
        if has_email_contact:
            reasons.append("prior_email_contact")
        if has_contact_form_contact:
            reasons.append("prior_contact_form_contact")
        if not reasons:
            reasons.append("repo_only_review")

        clearance = "review"
        if family_excluded:
            clearance = "blocked_family"
        elif has_email_contact or has_contact_form_contact:
            clearance = "blocked_prior_contact"

        results.append(
            {
                "lead_id": lead_id,
                "name": name,
                "email": safe["email"] if safe is not None else None,
                "website": safe["website"] if safe is not None else None,
                "primary_send_hook": safe["primary_send_hook"] if safe is not None else None,
                "next_action": safe["next_action"] if safe is not None else None,
                "safe_send_ready": bool(safe is not None),
                "overall_contact_state": state["overall_contact_state"] if state is not None else None,
                "email_lane_status": state["email_lane_status"] if state is not None else None,
                "contact_form_status": state["contact_form_status"] if state is not None else None,
                "email_contacted_rows": int(state["email_contacted_rows"]) if state is not None and state["email_contacted_rows"] is not None else 0,
                "contact_form_contacted_rows": int(state["contact_form_contacted_rows"]) if state is not None and state["contact_form_contacted_rows"] is not None else 0,
                "clearance": clearance,
                "reasons": reasons,
                "draft_paths": draft_paths,
            }
        )
    return results


def summarize(rows: list[dict[str, object]]) -> dict[str, int]:
    counts = Counter(str(row["clearance"]) for row in rows)
    counts["repo_only_total"] = len(rows)
    return dict(sorted(counts.items()))


def render_text(rows: list[dict[str, object]], summary: dict[str, int]) -> str:
    lines = ["Repo-only draft clearance", ""]
    for key, value in summary.items():
        lines.append(f"{key}: {value}")
    lines.append("")
    for row in rows:
        lines.append(
            f"{row['lead_id']} | {row['clearance']} | {row['name'] or '(unknown)'} | "
            f"reasons={','.join(row['reasons'])}"
        )
        for draft_path in row["draft_paths"]:
            lines.append(f"  - {draft_path}")
    return "\n".join(lines)


def main() -> None:
    args = build_parser().parse_args()
    draft_dirs = resolve_draft_dirs(args.draft_dir)
    repo_drafts = parse_repo_drafts(draft_dirs)
    repo_ids = sorted(repo_drafts)
    with connect(Path(args.db).resolve()) as conn:
        mailbox_ids = mailbox_draft_lead_ids(conn)
        state_rows = load_outreach_state(conn, repo_ids)
        safe_rows = load_lead_details(conn, repo_ids)
        all_rows = classify_repo_only(repo_drafts, mailbox_ids, state_rows, safe_rows)
        summary = summarize(all_rows)
        rows = all_rows
        if args.clearance != "all":
            rows = [row for row in rows if row["clearance"] == args.clearance]
        if args.safe_only:
            rows = [row for row in rows if bool(row["safe_send_ready"])]
        rows = rows[: args.limit]
        payload = {
            "draft_dirs": [str(path.relative_to(REPO_ROOT)).replace("\\", "/") for path in draft_dirs if path.exists()],
            "summary": summary,
            "filtered_count": len(rows),
            "clearance_filter": args.clearance,
            "safe_only": bool(args.safe_only),
            "rows": rows,
        }
        if args.json:
            print_text(json.dumps(payload, indent=2, ensure_ascii=False))
            return
        print_text(render_text(rows, payload["summary"]))


if __name__ == "__main__":
    main()
