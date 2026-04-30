#!/usr/bin/env python3
"""
Run a bounded unresolved-address website slice through `audit-lead.js`.

This is intentionally narrow:
- input is a JSON queue of leads that already have websites
- each lead is audited individually via the existing website audit script
- stdout JSON is saved as `audit-<lead_id>.json` for later review/import
- no SQLite writes happen here
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"
DEFAULT_QUEUE = Path(r"C:\Users\HP\semantic-demo-export\website_address_queue.json")
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "tmp" / "address-audit-slices"
AUDIT_SCRIPT = REPO_ROOT / "audit-lead.js"


@dataclass
class QueueItem:
    lead_id: int
    name: str
    website: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a bounded website-address slice through audit-lead.js."
    )
    parser.add_argument("--input", default=str(DEFAULT_QUEUE), help="Queue JSON path.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to crm.sqlite.")
    parser.add_argument("--limit", type=int, default=5, help="Rows to process.")
    parser.add_argument("--offset", type=int, default=0, help="Rows to skip before processing.")
    parser.add_argument(
        "--output-root",
        default=None,
        help="Optional output directory. Defaults to tmp/address-audit-slices/<timestamp>/",
    )
    parser.add_argument(
        "--only-lead-id",
        type=int,
        action="append",
        default=[],
        help="Optional specific lead_id(s) to run instead of offset/limit slicing.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=90,
        help="Hard timeout per site audit.",
    )
    return parser.parse_args()


def load_queue(path: Path) -> list[QueueItem]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    items: list[QueueItem] = []
    for row in payload:
        lead_id = int(row["lead_id"])
        website = str(row.get("website") or "").strip()
        if not website:
            continue
        items.append(
            QueueItem(
                lead_id=lead_id,
                name=str(row.get("name") or row.get("title") or "").strip(),
                website=website,
            )
        )
    return items


def get_profile_range(conn: sqlite3.Connection, lead_id: int) -> str | None:
    row = conn.execute(
        "SELECT profile_path FROM leadops_leads WHERE lead_id = ?",
        (lead_id,),
    ).fetchone()
    if not row or not row[0]:
        return None
    profile_path = str(row[0]).replace("\\", "/")
    parts = profile_path.split("/")
    try:
        profiles_idx = parts.index("profiles")
    except ValueError:
        return None
    if profiles_idx + 1 >= len(parts):
        return None
    return parts[profiles_idx + 1]


def run_audit(
    item: QueueItem,
    profile_range: str,
    output_dir: Path,
    timeout_seconds: int,
) -> dict[str, object]:
    command = [
        "node",
        str(AUDIT_SCRIPT),
        str(item.lead_id),
        item.website,
        profile_range,
    ]
    record: dict[str, object] = {
        "lead_id": item.lead_id,
        "name": item.name,
        "website": item.website,
        "profile_range": profile_range,
        "command": command,
    }
    try:
        completed = subprocess.run(
            command,
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        record["returncode"] = None
        record["timed_out"] = True
        if exc.stderr:
            stderr_path = output_dir / f"audit-{item.lead_id}.stderr.txt"
            stderr_path.write_text(exc.stderr, encoding="utf-8")
            record["stderr_path"] = str(stderr_path)
        return record

    record["returncode"] = completed.returncode

    stdout_text = completed.stdout.strip()
    stderr_text = completed.stderr.strip()
    if stderr_text:
        (output_dir / f"audit-{item.lead_id}.stderr.txt").write_text(stderr_text, encoding="utf-8")
        record["stderr_path"] = str(output_dir / f"audit-{item.lead_id}.stderr.txt")

    if stdout_text:
        json_path = output_dir / f"audit-{item.lead_id}.json"
        json_path.write_text(stdout_text + "\n", encoding="utf-8")
        record["json_path"] = str(json_path)
        try:
            payload = json.loads(stdout_text)
        except json.JSONDecodeError:
            record["json_valid"] = False
        else:
            record["json_valid"] = True
            address = payload.get("address") or {}
            raw_address = (address.get("raw") or "").strip() if isinstance(address, dict) else ""
            record["address_raw"] = raw_address
            record["audit_status"] = payload.get("auditStatus")
            record["audit_score"] = payload.get("auditScore")
    return record


def main() -> int:
    args = parse_args()
    input_path = Path(args.input)
    if not input_path.exists():
        raise SystemExit(f"Input queue not found: {input_path}")
    if not AUDIT_SCRIPT.exists():
        raise SystemExit(f"audit-lead.js not found: {AUDIT_SCRIPT}")

    queue = load_queue(input_path)
    if args.only_lead_id:
        wanted = set(args.only_lead_id)
        queue = [item for item in queue if item.lead_id in wanted]
    else:
        queue = queue[args.offset : args.offset + args.limit]

    if not queue:
        raise SystemExit("No queue items selected.")

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_root = Path(args.output_root) if args.output_root else DEFAULT_OUTPUT_ROOT / timestamp
    output_root.mkdir(parents=True, exist_ok=True)

    summary: list[dict[str, object]] = []
    summary_path = output_root / "summary.json"
    with sqlite3.connect(args.db) as conn:
        for item in queue:
            profile_range = get_profile_range(conn, item.lead_id)
            if not profile_range:
                record = (
                    {
                        "lead_id": item.lead_id,
                        "name": item.name,
                        "website": item.website,
                        "error": "missing_profile_range",
                    }
                )
                summary.append(record)
                summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
                continue
            record = run_audit(item, profile_range, output_root, args.timeout_seconds)
            summary.append(record)
            summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
            print(
                json.dumps(
                    {
                        "lead_id": item.lead_id,
                        "returncode": record.get("returncode"),
                        "timed_out": record.get("timed_out", False),
                        "address_raw": record.get("address_raw", ""),
                    }
                ),
                flush=True,
            )

    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(str(summary_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
