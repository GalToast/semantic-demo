from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
QUEUE_DEFAULT = REPO_ROOT / "outreach" / "queues" / "batches-001-010-uncontacted-email.md"

EMAIL_RE = re.compile(r"(?mi)^Email:\s*(.+?)\s*$")
PHONE_RE = re.compile(r"(?mi)^Phone:\s*(.+?)\s*$")
WEBSITE_RE = re.compile(r"(?mi)^Website:\s*(.+?)\s*$")

WORKLIST_LINE_RE = re.compile(r"^\s*-\s*\[[ xX]\]\s+(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$")


def norm(v: str) -> str:
    return (v or "").strip()


def is_missing(v: str) -> bool:
    v = norm(v).lower()
    return v in {"", "unknown", "not found", "n/a", "na", "none", "null"}


def extract_header_field(text: str, rx: re.Pattern[str]) -> str:
    m = rx.search(text)
    return norm(m.group(1)) if m else ""


@dataclass(frozen=True)
class QueueRow:
    lead_id: int
    lead_name: str
    batch: str
    profile_path: Path


def parse_markdown_table_queue(path: Path) -> list[QueueRow]:
    """
    Parse the outreach queue markdown table we use for batches 001-010.
    Expected columns (leading/trailing pipes):
      | LeadID | Name | Batch | ... | Profile |
    """
    rows: list[QueueRow] = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        s = line.strip()
        if not s.startswith("|"):
            continue
        # Skip header separators.
        if s.startswith("| ---"):
            continue
        parts = [p.strip() for p in s.strip("|").split("|")]
        if len(parts) < 12:
            continue
        lead_id_s = parts[0]
        name = parts[1]
        batch = parts[2]
        profile_s = parts[-1]
        if not lead_id_s.isdigit():
            continue
        lead_id = int(lead_id_s)
        profile_path = REPO_ROOT / profile_s
        rows.append(QueueRow(lead_id=lead_id, lead_name=name, batch=batch, profile_path=profile_path))
    # Dedup by LeadID, keep first occurrence.
    seen: set[int] = set()
    out: list[QueueRow] = []
    for r in rows:
        if r.lead_id in seen:
            continue
        seen.add(r.lead_id)
        out.append(r)
    return out


def replace_field_segment(tail: str, key: str, value: str) -> tuple[str, bool]:
    """
    Replace "Key: ..." segment in the worklist tail, preserving delimiters.
    """
    # Prefer matching up to the next pipe, preserving any whitespace before the delimiter.
    rx = re.compile(rf"(\b{re.escape(key)}\s*:\s*)([^|]*?)(\s*\|)")
    m = rx.search(tail)
    if m:
        new_tail = rx.sub(rf"\1{value}\3", tail, count=1)
        return new_tail, new_tail != tail
    # Fallback: key is the last segment in the line.
    rx_end = re.compile(rf"(\b{re.escape(key)}\s*:\s*)(.*)$")
    if not rx_end.search(tail):
        return tail, False
    new_tail = rx_end.sub(rf"\1{value}", tail, count=1)
    return new_tail, new_tail != tail


def ensure_note_tag(tail: str, tag: str) -> tuple[str, bool]:
    if not tag:
        return tail, False
    if tag.lower() in tail.lower():
        return tail, False
    if "| Note:" in tail:
        return tail + f"; {tag}", True
    return tail + f" | Note: {tag}", True


@dataclass(frozen=True)
class Change:
    lead_id: int
    worklist: Path
    old_line: str
    new_line: str


def sync_one_row(row: QueueRow, note_tag: str, *, apply: bool) -> list[Change]:
    if not row.profile_path.exists():
        return []
    profile_text = row.profile_path.read_text(encoding="utf-8", errors="ignore")
    email = extract_header_field(profile_text, EMAIL_RE)
    phone = extract_header_field(profile_text, PHONE_RE)
    website = extract_header_field(profile_text, WEBSITE_RE)

    if all(is_missing(v) for v in (email, phone, website)):
        return []

    worklist_path = REPO_ROOT / "leads" / "batches" / f"{row.batch}-worklist.md"
    if not worklist_path.exists():
        return []

    lines = worklist_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    changes: list[Change] = []
    for i, line in enumerate(lines):
        m = WORKLIST_LINE_RE.match(line)
        if not m:
            continue
        lid = int(m.group(1))
        if lid != row.lead_id:
            continue

        head = line[: m.start(3)]
        tail = m.group(3)

        changed = False
        if not is_missing(email):
            tail, did = replace_field_segment(tail, "Email", email)
            changed = changed or did
        if not is_missing(phone):
            tail, did = replace_field_segment(tail, "Phone", phone)
            changed = changed or did
        if not is_missing(website):
            tail, did = replace_field_segment(tail, "Website", website)
            changed = changed or did

        tail_norm = re.sub(r"\s*\|\s*", " | ", tail).strip()
        if tail_norm != tail.strip():
            tail = tail_norm
            changed = True

        # Always tag the note if we changed something (helps avoid rework later).
        if changed:
            tail, _ = ensure_note_tag(tail, note_tag)
            new_line = head + tail
            if new_line != line:
                lines[i] = new_line
                changes.append(Change(lead_id=lid, worklist=worklist_path, old_line=line, new_line=new_line))
        break

    if changes and apply:
        worklist_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return changes


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill Email/Phone/Website fields in registered-entities worklists from canonical profile headers."
    )
    parser.add_argument("--queue", default=str(QUEUE_DEFAULT), help="Markdown table queue path.")
    parser.add_argument("--apply", action="store_true", help="Write changes to worklist files.")
    parser.add_argument(
        "--note-tag",
        default=f"contact synced from profile {date.today().isoformat()}",
        help="Tag appended to Note when a line is changed.",
    )
    parser.add_argument(
        "--out",
        default="",
        help="Report path (default: reports/worklist-contact-backfill-<date>.md)",
    )
    args = parser.parse_args()

    queue_path = Path(args.queue)
    if not queue_path.exists():
        raise SystemExit(f"Missing queue file: {queue_path.as_posix()}")

    rows = parse_markdown_table_queue(queue_path)
    if not rows:
        raise SystemExit(f"No queue rows parsed from: {queue_path.as_posix()}")

    all_changes: list[Change] = []
    for r in rows:
        all_changes.extend(sync_one_row(r, note_tag=args.note_tag, apply=args.apply))

    report_path = Path(args.out) if args.out else (REPO_ROOT / "reports" / f"worklist-contact-backfill-{date.today().isoformat()}.md")
    report_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    lines.append("# Worklist Contact Backfill (From Profiles)")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append(f"Queue: `{queue_path.as_posix()}`")
    lines.append("")
    lines.append("## Summary")
    lines.append(f"- Mode: {'APPLY' if args.apply else 'DRY-RUN'}")
    lines.append(f"- Queue rows scanned: {len(rows)}")
    lines.append(f"- Lines updated: {len(all_changes)}")
    lines.append("")
    if all_changes:
        lines.append("## Changes")
        for c in all_changes:
            lines.append(f"- {c.worklist.as_posix()} | LeadID {c.lead_id}")
            lines.append(f"  - Old: {c.old_line}")
            lines.append(f"  - New: {c.new_line}")
        lines.append("")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(report_path.as_posix())


if __name__ == "__main__":
    main()
