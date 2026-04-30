from __future__ import annotations

import argparse
import json
import re
import sqlite3
from email.utils import getaddresses
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"
DEFAULT_DRAFT_DIR = REPO_ROOT / "outreach" / "drafts" / "safe-send-2026-03-25"
TMP_DIR = REPO_ROOT / "tmp"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Clear repo draft candidates against actual IMAP Drafts and Sent indexes, "
            "using lead email fields from crm.sqlite."
        )
    )
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to crm.sqlite")
    parser.add_argument(
        "--draft-dir",
        action="append",
        default=[],
        help="Repo draft directory to scan (relative to repo root unless absolute). May be passed multiple times.",
    )
    parser.add_argument(
        "--drafts-index",
        default="",
        help="Explicit path to hostinger_drafts_index_*.json (defaults to latest in tmp/).",
    )
    parser.add_argument(
        "--sent-index",
        default="",
        help="Explicit path to hostinger_sent_index_*.json (defaults to latest in tmp/).",
    )
    parser.add_argument("--limit", type=int, default=1000, help="Limit emitted clean rows.")
    parser.add_argument("--json", action="store_true", help="Emit JSON.")
    return parser


def connect(db_path: Path) -> sqlite3.Connection:
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def resolve_draft_dirs(raw_dirs: list[str]) -> list[Path]:
    if not raw_dirs:
        return [DEFAULT_DRAFT_DIR]
    resolved: list[Path] = []
    for raw in raw_dirs:
        path = Path(raw)
        if not path.is_absolute():
            path = REPO_ROOT / path
        resolved.append(path)
    return resolved


def parse_lead_id_from_name(name: str) -> int | None:
    parts = name.split("-")
    if parts and parts[0].isdigit():
        return int(parts[0])
    if name.startswith("lead-") and len(parts) > 1 and parts[1].isdigit():
        return int(parts[1])
    return None


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


def find_latest_index(prefix: str) -> Path:
    files = sorted(TMP_DIR.glob(f"{prefix}_*.json"))
    if not files:
        raise SystemExit(f"No {prefix}_*.json found in {TMP_DIR}")
    return max(files, key=lambda p: p.stat().st_mtime)


def resolve_index(path_str: str, prefix: str) -> Path:
    if path_str:
        path = Path(path_str)
        if not path.is_absolute():
            path = REPO_ROOT / path
        if not path.exists():
            raise SystemExit(f"Index not found: {path}")
        return path
    return find_latest_index(prefix)


def emails_from_field(value: str | None) -> list[str]:
    if not value:
        return []
    parts = getaddresses([value])
    out: list[str] = []
    for _, addr in parts:
        addr = (addr or "").strip().lower()
        if addr:
            out.append(addr)
    if out:
        return sorted(set(out))
    fallback = [e.lower() for e in re.findall(r"([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})", value)]
    return sorted(set(fallback))


def load_index_emails(path: Path) -> set[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    emails: set[str] = set()
    for page in data.get("pages", []):
        for item in page.get("items", []):
            for email_addr in emails_from_field(item.get("to", "")):
                emails.add(email_addr)
    return emails


def load_lead_rows(conn: sqlite3.Connection, lead_ids: list[int]) -> dict[int, sqlite3.Row]:
    if not lead_ids:
        return {}
    placeholders = ",".join("?" for _ in lead_ids)
    query = f"""
        SELECT
            lead_id,
            name,
            email,
            website,
            outreach_status,
            contact_path
        FROM leadops_leads
        WHERE lead_id IN ({placeholders})
    """
    return {int(row["lead_id"]): row for row in conn.execute(query, lead_ids)}


def classify_rows(
    repo_drafts: dict[int, list[str]],
    lead_rows: dict[int, sqlite3.Row],
    draft_emails: set[str],
    sent_emails: set[str],
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for lead_id, draft_paths in sorted(repo_drafts.items()):
        lead = lead_rows.get(lead_id)
        email_values = emails_from_field(str(lead["email"] or "")) if lead is not None else []
        reasons: list[str] = []
        clearance = "clean"
        if not email_values:
            clearance = "blocked_missing_email"
            reasons.append("missing_email")
        elif any(email in draft_emails for email in email_values):
            clearance = "blocked_imap_draft_overlap"
            reasons.append("imap_draft_overlap")
        elif any(email in sent_emails for email in email_values):
            clearance = "blocked_imap_sent_overlap"
            reasons.append("imap_sent_overlap")
        else:
            reasons.append("clean_against_imap")

        rows.append(
            {
                "lead_id": lead_id,
                "name": str(lead["name"] or "") if lead is not None else "",
                "emails": email_values,
                "website": str(lead["website"] or "") if lead is not None else "",
                "outreach_status": str(lead["outreach_status"] or "") if lead is not None else "",
                "contact_path": str(lead["contact_path"] or "") if lead is not None else "",
                "clearance": clearance,
                "reasons": reasons,
                "draft_paths": draft_paths,
            }
        )
    return rows


def summarize(rows: list[dict[str, object]]) -> dict[str, int]:
    summary: dict[str, int] = {}
    for row in rows:
        key = str(row["clearance"])
        summary[key] = summary.get(key, 0) + 1
    summary["repo_bank_total"] = len(rows)
    return dict(sorted(summary.items()))


def render_text(payload: dict[str, object]) -> str:
    lines = ["IMAP Import Clearance", ""]
    lines.append(f"draft_dirs: {', '.join(payload['draft_dirs'])}")
    lines.append(f"drafts_index: {payload['drafts_index']}")
    lines.append(f"sent_index: {payload['sent_index']}")
    lines.append("")
    summary = payload["summary"]
    for key, value in summary.items():
        lines.append(f"{key}: {value}")
    lines.append("")
    for row in payload["rows"]:
        lines.append(
            f"{row['lead_id']} | {row['clearance']} | {row['name'] or '(unknown)'} | "
            f"emails={','.join(row['emails']) if row['emails'] else '(none)'}"
        )
    return "\n".join(lines)


def print_text(text: str) -> None:
    encoding = "utf-8"
    safe = text.encode(encoding, errors="replace").decode(encoding, errors="replace")
    print(safe)


def main() -> None:
    args = build_parser().parse_args()
    draft_dirs = resolve_draft_dirs(args.draft_dir)
    repo_drafts = parse_repo_drafts(draft_dirs)
    repo_ids = sorted(repo_drafts)
    drafts_index = resolve_index(args.drafts_index, "hostinger_drafts_index")
    sent_index = resolve_index(args.sent_index, "hostinger_sent_index")

    with connect(Path(args.db).resolve()) as conn:
        lead_rows = load_lead_rows(conn, repo_ids)

    draft_emails = load_index_emails(drafts_index)
    sent_emails = load_index_emails(sent_index)
    all_rows = classify_rows(repo_drafts, lead_rows, draft_emails, sent_emails)
    clean_rows = [row for row in all_rows if row["clearance"] == "clean"][: args.limit]
    payload = {
        "draft_dirs": [str(path.relative_to(REPO_ROOT)).replace("\\", "/") for path in draft_dirs if path.exists()],
        "drafts_index": str(drafts_index.relative_to(REPO_ROOT)).replace("\\", "/"),
        "sent_index": str(sent_index.relative_to(REPO_ROOT)).replace("\\", "/"),
        "summary": summarize(all_rows),
        "filtered_count": len(clean_rows),
        "rows": clean_rows,
    }
    if args.json:
        print_text(json.dumps(payload, indent=2, ensure_ascii=False))
        return
    print_text(render_text(payload))


if __name__ == "__main__":
    main()
