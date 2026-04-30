#!/usr/bin/env python3
"""
Sync profile header contact fields (Email/Phone/Website + Contact search/Social check/Contact path)
from the registered-entities batch worklists.

Why:
- Many leads have been researched and annotated in `leads/batches/*-worklist.md`,
  but the corresponding `leads/profiles/*/*/profile.md` headers still show
  `Contact search: not started`, which keeps them in the "needs research" queues.

Safety:
- Conservative: only update profiles whose `Contact search` is still `not started` (or missing).
- Only overwrite header values when the current value is missing-ish (unknown / blank).
- Never disqualifies leads (Status is not changed).
- Always appends a short provenance note in the Notes section when applying.
"""

from __future__ import annotations

import argparse
import csv
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Optional


REPO_ROOT = Path(__file__).resolve().parents[2]
LEADS_ROOT = REPO_ROOT / "leads"
BATCHES_DIR = LEADS_ROOT / "batches"

TODAY = date.today().isoformat()

WORKLIST_LINE_RE = re.compile(r"^\s*-\s*\[[ xX]\]\s*(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$")

MISSING_VALUES = {
    "",
    "unknown",
    "not found",
    "n/a",
    "na",
    "none",
    "null",
}


def norm(v: str) -> str:
    return re.sub(r"\s+", " ", (v or "").strip())


def is_missing(v: str) -> bool:
    return norm(v).lower() in MISSING_VALUES


def parse_tail_fields(tail: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    if not tail:
        return fields
    parts = [p.strip() for p in tail.split("|")]
    for p in parts:
        if ":" not in p:
            continue
        k, v = p.split(":", 1)
        fields[k.strip().lower()] = v.strip()
    return fields


def find_first_label(lines: list[str], label: str) -> Optional[tuple[int, str]]:
    rx = re.compile(rf"^\s*{re.escape(label)}\s*:\s*(.+?)\s*$", re.IGNORECASE)
    for idx, line in enumerate(lines):
        m = rx.match(line)
        if m:
            return idx, m.group(1).strip()
    return None


def set_label(lines: list[str], label: str, value: str) -> bool:
    found = find_first_label(lines, label)
    if not found:
        return False
    idx, cur = found
    cur_n = norm(cur)
    val_n = norm(value)
    if cur_n == val_n:
        return False
    lines[idx] = f"{label}: {val_n}"
    return True


def append_note(lines: list[str], note_line: str) -> bool:
    """
    Append a bullet to the Notes section if it doesn't already exist (case-insensitive contains match).
    """
    needle = note_line.strip().lower()
    if not needle:
        return False

    text_l = "\n".join(lines).lower()
    if needle in text_l:
        return False

    # Find "## Notes" header.
    try:
        notes_idx = next(i for i, ln in enumerate(lines) if ln.strip().lower() == "## notes")
    except StopIteration:
        return False

    # Insert after existing note bullets if possible, otherwise right after header.
    insert_at = notes_idx + 1
    for i in range(notes_idx + 1, len(lines)):
        if lines[i].startswith("## "):
            insert_at = i
            break
        insert_at = i + 1

    # Ensure there's at least one blank line between sections.
    if insert_at < len(lines) and lines[insert_at].strip() == "":
        pass
    lines.insert(insert_at, note_line)
    return True


def extract_research_date(note: str) -> str:
    """
    Best-effort: if the worklist note says "RESEARCHED YYYY-MM-DD", use that date.
    Otherwise use TODAY (the date we synced).
    """
    m = re.search(r"(?i)\bRESEARCHED\s+(20\d{2}-\d{2}-\d{2})\b", note or "")
    if m:
        return m.group(1)
    return TODAY


def normalize_worklist_value(v: str) -> str:
    v = norm(v)
    if not v or v.lower() == "unknown":
        return "unknown"
    if v.lower() == "not found":
        return "not found"
    return v


def contact_path_from_fields(email: str, phone: str, form: str, social: str) -> str:
    if not is_missing(email) and "@" in email:
        return "email"
    if not is_missing(form):
        return "form"
    if not is_missing(phone) and re.search(r"\d", phone):
        return "phone-only"
    if not is_missing(social):
        return "social"
    return "unknown"


@dataclass(frozen=True)
class WorklistItem:
    lead_id: int
    name: str
    email: str
    phone: str
    website: str
    note: str


def parse_worklist_items(path: Path) -> list[WorklistItem]:
    items: list[WorklistItem] = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        m = WORKLIST_LINE_RE.match(line)
        if not m:
            continue
        lead_id = int(m.group(1))
        name = m.group(2).strip()
        tail = m.group(3).strip()
        fields = parse_tail_fields(tail)
        email = normalize_worklist_value(fields.get("email", "unknown"))
        phone = normalize_worklist_value(fields.get("phone", "unknown"))
        website = normalize_worklist_value(fields.get("website", "unknown"))
        # Worklist conventions vary by batch:
        # - "Notes:" or "Deep Search:" often contain the research narrative
        # - "Note:" is often auxiliary metadata (commonly profile path)
        note = fields.get("notes", "") or fields.get("deep search", "") or fields.get("note", "")
        items.append(WorklistItem(lead_id=lead_id, name=name, email=email, phone=phone, website=website, note=norm(note)))
    return items


def load_index_profile_map() -> dict[int, Path]:
    path = LEADS_ROOT / "index.csv"
    out: dict[int, Path] = {}
    with path.open(newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            raw = (row.get("LeadID") or "").strip()
            if not raw.isdigit():
                continue
            lead_id = int(raw)
            prof = (row.get("ProfilePath") or "").strip()
            if not prof:
                continue
            out[lead_id] = REPO_ROOT / prof
    return out


def should_sync_from_worklist(note: str, email: str, phone: str, website: str) -> bool:
    """
    We sync when:
    - the worklist has explicit contact data, OR
    - the note suggests research happened (SKIP / deep search / no footprint / etc).
    """
    if not is_missing(email) and email != "unknown":
        return True
    if not is_missing(phone) and phone != "unknown":
        return True
    if not is_missing(website) and website != "unknown":
        return True
    lowered = (note or "").lower()
    for kw in [
        "skip",
        "deep search",
        "no verifiable",
        "no footprint",
        "po box",
        "p.o. box",
        "holding company",
        "residential",
        "permanently closed",
        "closed",
        "duplicate",
        "related entity",
        "same as",
    ]:
        if kw in lowered:
            return True
    return False


def main() -> None:
    ap = argparse.ArgumentParser(description="Sync profile contact headers from registered-entities worklist lines.")
    ap.add_argument("--batch", required=True, help="Batch number like 011 or 12 (will be zero-padded).")
    ap.add_argument("--apply", action="store_true", help="Write changes.")
    ap.add_argument("--out", default="", help="Report path (default: reports/profile-worklist-sync-<date>-batch-<n>.md)")
    args = ap.parse_args()

    batch_n = int(str(args.batch).lstrip("0") or "0")
    batch_slug = f"registered-entities-batch-{batch_n:03d}"
    worklist = BATCHES_DIR / f"{batch_slug}-worklist.md"
    if not worklist.exists():
        raise SystemExit(f"Missing worklist: {worklist.as_posix()}")

    idx_map = load_index_profile_map()
    items = parse_worklist_items(worklist)

    changed = 0
    scanned = 0
    skipped = 0
    report_lines: list[str] = []
    report_lines.append("# Profile Sync From Worklist")
    report_lines.append(f"Generated: {TODAY}")
    report_lines.append(f"Worklist: `{worklist.relative_to(REPO_ROOT).as_posix()}`")
    report_lines.append(f"Mode: {'APPLY' if args.apply else 'DRY-RUN'}")
    report_lines.append("")

    for it in items:
        prof = idx_map.get(it.lead_id)
        if not prof or not prof.exists():
            continue
        scanned += 1

        text = prof.read_text(encoding="utf-8", errors="ignore")
        lines = text.splitlines()

        cs = find_first_label(lines, "Contact search")
        cs_val = norm(cs[1]) if cs else ""
        if cs_val.lower().startswith("checked") or cs_val.lower().startswith("not found"):
            skipped += 1
            continue

        if not should_sync_from_worklist(it.note, it.email, it.phone, it.website):
            skipped += 1
            continue

        before = "\n".join(lines)
        changed_fields: list[str] = []

        # Only overwrite when current value is missing-ish.
        for label, val in [("Email", it.email), ("Phone", it.phone), ("Website", it.website)]:
            found = find_first_label(lines, label)
            cur = norm(found[1]) if found else ""
            if is_missing(cur) and not is_missing(val):
                if set_label(lines, label, val):
                    changed_fields.append(f"{label} <- {val}")
            elif is_missing(cur) and val.lower() == "not found":
                if set_label(lines, label, "not found"):
                    changed_fields.append(f"{label} <- not found")

        # If worklist suggests "skip/no presence", mark as not found (research finished),
        # otherwise mark as checked if we have any non-missing contact data.
        research_date = extract_research_date(it.note)
        note_l = (it.note or "").lower()
        has_any = any(
            (v and v.lower() not in {"unknown", "not found"}) for v in [it.email, it.phone, it.website]
        )
        # Treat these as "research completed; no viable contact methods found" signals.
        no_contact_signals = [
            "skip",
            "no verifiable",
            "no footprint",
            "po box",
            "p.o. box",
            "holding company",
            "residential",
            "permanently closed",
            "closed",
            "duplicate",
            "related entity",
            "same as",
        ]
        if any(sig in note_l for sig in no_contact_signals) and not has_any:
            if set_label(lines, "Contact search", f"not found (checked {research_date})"):
                changed_fields.append(f"Contact search <- not found (checked {research_date})")
            if set_label(lines, "Social check", f"checked {research_date}"):
                changed_fields.append(f"Social check <- checked {research_date}")
        elif has_any:
            if set_label(lines, "Contact search", f"checked {research_date}"):
                changed_fields.append(f"Contact search <- checked {research_date}")
            if set_label(lines, "Social check", f"checked {research_date}"):
                changed_fields.append(f"Social check <- checked {research_date}")

        # Recompute contact path based on header fields.
        email_val = norm(find_first_label(lines, "Email")[1]) if find_first_label(lines, "Email") else "unknown"
        phone_val = norm(find_first_label(lines, "Phone")[1]) if find_first_label(lines, "Phone") else "unknown"
        form_val = norm(find_first_label(lines, "Contact form")[1]) if find_first_label(lines, "Contact form") else "unknown"
        social_val = norm(find_first_label(lines, "Social media")[1]) if find_first_label(lines, "Social media") else "unknown"
        cp = contact_path_from_fields(email_val, phone_val, form_val, social_val)
        if set_label(lines, "Contact path", cp):
            changed_fields.append(f"Contact path <- {cp}")

        if changed_fields:
            set_label(lines, "Last updated", TODAY)
            note_bits = []
            if it.note:
                note_bits.append(it.note)
            note_bits = note_bits[:1]
            note_msg = (
                f"- {TODAY}: synced from worklist ({batch_slug}): {note_bits[0]}"
                if note_bits
                else f"- {TODAY}: synced from worklist ({batch_slug})."
            )
            append_note(lines, note_msg)

        after = "\n".join(lines)
        if after != before:
            changed += 1
            report_lines.append(f"- LeadID {it.lead_id}: `{prof.relative_to(REPO_ROOT).as_posix()}`")
            for cf in changed_fields:
                report_lines.append(f"  - {cf}")
            if args.apply:
                prof.write_text(after + "\n", encoding="utf-8", newline="\n")
        else:
            skipped += 1

    report_lines.append("")
    report_lines.append("## Summary")
    report_lines.append(f"- Worklist items parsed: {len(items)}")
    report_lines.append(f"- Profiles scanned: {scanned}")
    report_lines.append(f"- Profiles changed: {changed}")
    report_lines.append(f"- Profiles skipped: {skipped}")
    report_lines.append("")

    out_path = Path(args.out) if args.out else (REPO_ROOT / "reports" / f"profile-worklist-sync-{TODAY}-batch-{batch_n:03d}.md")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(report_lines) + "\n", encoding="utf-8", newline="\n")
    print(out_path.as_posix())


if __name__ == "__main__":
    main()
