from __future__ import annotations

import argparse
import csv
import json
from datetime import date
from pathlib import Path
import re


def norm(value: str | None) -> str:
    return (value or "").strip()


def lower(value: str | None) -> str:
    return norm(value).lower()


def has_email(value: str | None) -> bool:
    return bool(extract_email(value))


EMAIL_RE = re.compile(r"([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})", re.IGNORECASE)


def extract_email(value: str | None) -> str:
    """
    Profiles sometimes contain annotations like:
    - "custserv@bootbarn.com (corporate customer service)"
    This normalizes to the first email address so we can match IMAP exports reliably.
    """
    v = norm(value)
    if not v:
        return ""
    m = EMAIL_RE.search(v)
    return m.group(1).lower() if m else ""


def extract_to_emails(index: dict) -> set[str]:
    out: set[str] = set()
    for page in index.get("pages", []):
        for item in page.get("items", []):
            to = norm(item.get("to"))
            if not to:
                continue
            for part in to.replace(";", ",").split(","):
                part = part.strip()
                if "<" in part and ">" in part:
                    part = part.split("<", 1)[1].split(">", 1)[0].strip()
                if "@" in part:
                    out.add(part.lower())
    return out


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare the registered-entities uncontacted+email queue against exported Hostinger drafts/sent indexes."
    )
    parser.add_argument(
        "--index-csv",
        default="leads/index.csv",
        help="Path to leads index CSV (default: leads/index.csv)",
    )
    parser.add_argument("--sent-index", required=True, help="Path to sent index JSON")
    parser.add_argument("--drafts-index", required=True, help="Path to drafts index JSON")
    parser.add_argument(
        "--batch-from",
        type=int,
        default=1,
        help="Start batch number inclusive (default: 1)",
    )
    parser.add_argument(
        "--batch-to",
        type=int,
        default=10,
        help="End batch number inclusive (default: 10)",
    )
    parser.add_argument(
        "--out",
        default="",
        help="Output report path. If omitted, writes to reports/imap-drift-audit-<date>.md",
    )
    args = parser.parse_args()

    batches = {
        f"registered-entities-batch-{i:03d}"
        for i in range(args.batch_from, args.batch_to + 1)
    }

    # Build queue (LeadID-deduped): qualified AND uncontacted AND has email AND within batch range AND not Source: import
    rows_by_id: dict[str, list[dict[str, str]]] = {}
    index_csv_path = Path(args.index_csv)
    with index_csv_path.open(newline="", encoding="utf-8", errors="ignore") as f:
        for row in csv.DictReader(f):
            if norm(row.get("Batch")) not in batches:
                continue
            if lower(row.get("Source")) == "import":
                continue
            lead_id = norm(row.get("LeadID"))
            if not lead_id or not lead_id.isdigit():
                continue
            rows_by_id.setdefault(lead_id, []).append(row)

    def pick_canonical(rows: list[dict[str, str]]) -> dict[str, str]:
        def sort_key(r: dict[str, str]) -> tuple[int, str]:
            disq = 1 if lower(r.get("Disqualified")) == "yes" or lower(r.get("Status")) == "disqualified" else 0
            return (disq, norm(r.get("ProfilePath")))

        return sorted(rows, key=sort_key)[0]

    queue_rows: list[dict[str, str]] = []
    for _lead_id, rows in sorted(rows_by_id.items(), key=lambda kv: int(kv[0])):
        row = pick_canonical(rows)
        disqualified = lower(row.get("Disqualified")) == "yes" or lower(row.get("Status")) == "disqualified"
        if disqualified:
            continue
        if lower(row.get("OutreachStatus")) != "uncontacted":
            continue
        if not has_email(row.get("Email")):
            continue
        queue_rows.append(row)

    sent = json.loads(Path(args.sent_index).read_text(encoding="utf-8", errors="ignore"))
    drafts = json.loads(Path(args.drafts_index).read_text(encoding="utf-8", errors="ignore"))

    sent_to = extract_to_emails(sent)
    drafts_to = extract_to_emails(drafts)

    def email_for_row(r: dict[str, str]) -> str:
        return extract_email(r.get("Email"))

    in_sent = [r for r in queue_rows if email_for_row(r) in sent_to]
    in_drafts = [r for r in queue_rows if email_for_row(r) in drafts_to]
    in_both = [r for r in queue_rows if email_for_row(r) in sent_to and email_for_row(r) in drafts_to]
    in_neither = [r for r in queue_rows if email_for_row(r) not in sent_to and email_for_row(r) not in drafts_to]

    report_path = Path(args.out) if args.out else Path("reports") / f"imap-drift-audit-uncontacted-email-batch-{args.batch_from:03d}-{args.batch_to:03d}-{date.today().isoformat()}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    lines.append("# IMAP Drift Audit: Uncontacted+Email Queue")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append("")
    lines.append("## Inputs")
    lines.append(f"- Index CSV: `{index_csv_path.as_posix()}`")
    lines.append(f"- Sent index: `{Path(args.sent_index).as_posix()}`")
    lines.append(f"- Drafts index: `{Path(args.drafts_index).as_posix()}`")
    lines.append(f"- Batches: {args.batch_from:03d}-{args.batch_to:03d}")
    lines.append("")
    lines.append("## Results")
    lines.append(f"- Queue size (uncontacted+email): {len(queue_rows)}")
    lines.append(f"- In Sent: {len(in_sent)}")
    lines.append(f"- In Drafts: {len(in_drafts)}")
    lines.append(f"- In Both: {len(in_both)}")
    lines.append(f"- In Neither: {len(in_neither)}")
    lines.append("")

    # Only include small samples to keep report readable.
    def add_sample(title: str, rows: list[dict[str, str]]) -> None:
        lines.append(f"## Sample: {title}")
        if not rows:
            lines.append("- (none)")
            lines.append("")
            return
        lines.append("| Lead ID | Name | Batch | Email | Outreach | Profile |")
        lines.append("| --- | --- | --- | --- | --- | --- |")
        for r in rows[:25]:
            lines.append(
                f"| {norm(r.get('LeadID'))} | {norm(r.get('Name'))} | {norm(r.get('Batch'))} | {norm(r.get('Email'))} | {norm(r.get('OutreachStatus')) or 'unknown'} | {norm(r.get('ProfilePath'))} |"
            )
        lines.append("")

    add_sample("In Sent (should probably not be 'uncontacted')", in_sent)
    add_sample("In Drafts (should probably be 'drafted')", in_drafts)
    add_sample("In Neither (clean queue candidates)", in_neither)

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {report_path}")


if __name__ == "__main__":
    main()
