from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
TMP_DIR = REPO_ROOT / "tmp"
INDEX_CSV = REPO_ROOT / "leads" / "index.csv"

EMAIL_RE = re.compile(r"([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})", re.IGNORECASE)


def norm(value: str | None) -> str:
    return (value or "").strip()


def low(value: str | None) -> str:
    return norm(value).lower()


def latest_tmp_json(prefix: str) -> Path:
    files = sorted(TMP_DIR.glob(f"{prefix}_*.json"))
    if not files:
        raise SystemExit(f"Missing tmp/{prefix}_*.json (run scripts/maintenance/imap_export_hostinger.py first)")
    return max(files, key=lambda p: p.stat().st_mtime)


def extract_email(value: str | None) -> str:
    """
    Profiles/index rows sometimes contain annotations like:
    - "custserv@bootbarn.com (corporate customer service)"
    Normalize to the first email so we can match IMAP exports reliably.
    """
    v = norm(value)
    if not v:
        return ""
    m = EMAIL_RE.search(v)
    return m.group(1).lower() if m else ""


def extract_to_emails(index: dict) -> set[str]:
    out: set[str] = set()
    for page in index.get("pages", []) or []:
        for item in page.get("items", []) or []:
            to_field = norm(item.get("to"))
            if not to_field:
                continue
            for e in EMAIL_RE.findall(to_field):
                out.add(e.lower())
    return out


@dataclass
class LeadRow:
    lead_id: str
    name: str
    email: str
    batch: str
    profile_path: str


def pick_canonical(rows: list[dict[str, str]]) -> dict[str, str]:
    """
    Deduplicate by LeadID, prefer non-disqualified entries deterministically.
    """

    def sort_key(r: dict[str, str]) -> tuple[int, str]:
        disq = 1 if low(r.get("Disqualified")) == "yes" or low(r.get("Status")) == "disqualified" else 0
        return (disq, norm(r.get("ProfilePath")))

    return sorted(rows, key=sort_key)[0]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate an 'email uncontacted, needs draft' queue by subtracting IMAP Drafts/Sent recipients."
    )
    parser.add_argument("--index-csv", default=str(INDEX_CSV))
    parser.add_argument("--drafts-index", default="", help="Optional path to hostinger_drafts_index_*.json")
    parser.add_argument("--sent-index", default="", help="Optional path to hostinger_sent_index_*.json")
    parser.add_argument("--batch-from", type=int, default=1)
    parser.add_argument("--batch-to", type=int, default=10)
    parser.add_argument(
        "--out",
        default="outreach/queues/registered-entities-batches-001-010-email-uncontacted-needs-draft.md",
        help="Output queue markdown path.",
    )
    args = parser.parse_args()

    batches = {f"registered-entities-batch-{i:03d}" for i in range(args.batch_from, args.batch_to + 1)}

    # Build candidate queue (LeadID-deduped): qualified AND uncontacted AND has email AND within batch range AND not Source: import
    rows_by_id: dict[str, list[dict[str, str]]] = {}
    index_csv_path = Path(args.index_csv)
    with index_csv_path.open(newline="", encoding="utf-8", errors="ignore") as f:
        for row in csv.DictReader(f):
            if norm(row.get("Batch")) not in batches:
                continue
            if low(row.get("Source")) == "import":
                continue
            lead_id = norm(row.get("LeadID"))
            if not lead_id or not lead_id.isdigit():
                continue
            rows_by_id.setdefault(lead_id, []).append(row)

    candidates: list[dict[str, str]] = []
    for _lead_id, rows in sorted(rows_by_id.items(), key=lambda kv: int(kv[0])):
        row = pick_canonical(rows)
        disqualified = low(row.get("Disqualified")) == "yes" or low(row.get("Status")) == "disqualified"
        if disqualified:
            continue
        if low(row.get("OutreachStatus")) != "uncontacted":
            continue
        if "@" not in extract_email(row.get("Email")):
            continue
        candidates.append(row)

    drafts_path = Path(args.drafts_index) if args.drafts_index else latest_tmp_json("hostinger_drafts_index")
    sent_path = Path(args.sent_index) if args.sent_index else latest_tmp_json("hostinger_sent_index")
    drafts = json.loads(drafts_path.read_text(encoding="utf-8", errors="ignore"))
    sent = json.loads(sent_path.read_text(encoding="utf-8", errors="ignore"))
    drafts_to = extract_to_emails(drafts)
    sent_to = extract_to_emails(sent)

    need_draft: list[LeadRow] = []
    for r in candidates:
        email_addr = extract_email(r.get("Email"))
        if not email_addr:
            continue
        if email_addr in drafts_to or email_addr in sent_to:
            continue
        need_draft.append(
            LeadRow(
                lead_id=norm(r.get("LeadID")),
                name=norm(r.get("Name")),
                email=email_addr,
                batch=norm(r.get("Batch")),
                profile_path=norm(r.get("ProfilePath")),
            )
        )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    lines.append("# Batches 001-010: Email Present + Uncontacted (Needs Draft)")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append(f"Total: {len(need_draft)}")
    lines.append("")
    lines.append("Definition: qualified + OutreachStatus=uncontacted + has Email, and the recipient was not found in IMAP Drafts or Sent.")
    lines.append("")
    lines.append(f"- Drafts index: `{drafts_path.as_posix()}`")
    lines.append(f"- Sent index: `{sent_path.as_posix()}`")
    lines.append("")
    lines.append("Format: LeadID | Name | Email | Batch | ProfilePath")
    lines.append("")
    for r in need_draft:
        lines.append(f"- {r.lead_id} | {r.name} | {r.email} | {r.batch} | {r.profile_path}")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote: {out_path.as_posix()}")


if __name__ == "__main__":
    main()

