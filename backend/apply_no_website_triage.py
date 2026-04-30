"""
Apply KEEP/DQ decisions from a triage checklist to lead profiles.

Input format (one per line):
  - [ ] DQ [ ] KEEP | <LeadID> | <Name> | <ProfilePath>

Rules:
- You may leave both boxes unchecked to skip that lead for now.
- You must not check both boxes.
- DQ: mark profile disqualified and move folder into leads/disqualified/<range>/...
- KEEP: leave in place; we'll emit a keepers queue for the selected items.
"""

from __future__ import annotations

import argparse
import re
import shutil
from dataclasses import dataclass
from datetime import date
from pathlib import Path


RE_LINE = re.compile(
    r"^\s*-\s*\[(?P<dq>[ xX])\]\s*DQ\s*\[(?P<keep>[ xX])\]\s*KEEP\s*\|\s*"
    r"(?P<id>\d+)\s*\|\s*(?P<name>[^|]+?)\s*\|\s*(?P<path>\S+)\s*$"
)


def lead_range_folder(lead_id: int) -> str:
    start = (lead_id // 100) * 100
    end = start + 99
    return f"{start:03d}-{end:03d}"


def update_profile_text_for_disqualified(text: str, reason: str, today_iso: str) -> str:
    # Only touch the header fields; keep the rest intact.
    lines = text.splitlines()
    out = []
    saw_status = False
    saw_outreach = False
    saw_last_updated = False
    for ln in lines:
        if ln.startswith("Status:"):
            out.append("Status: disqualified")
            saw_status = True
            continue
        if ln.startswith("Outreach status:"):
            out.append("Outreach status: disqualified")
            saw_outreach = True
            continue
        if ln.startswith("Last updated:"):
            out.append(f"Last updated: {today_iso}")
            saw_last_updated = True
            continue
        out.append(ln)

    if not saw_status:
        # Insert after title if possible
        for i, ln in enumerate(out):
            if ln.startswith("# "):
                out.insert(i + 1, "")
                out.insert(i + 2, "Status: disqualified")
                break
        else:
            out.insert(0, "Status: disqualified")

    if not saw_outreach:
        # Best-effort: place near Status (if present)
        for i, ln in enumerate(out):
            if ln.startswith("Status:"):
                out.insert(i + 1, "Outreach status: disqualified")
                break
        else:
            out.insert(0, "Outreach status: disqualified")

    if not saw_last_updated:
        # Best-effort: place near Status (if present)
        for i, ln in enumerate(out):
            if ln.startswith("Status:"):
                out.insert(i + 1, f"Last updated: {today_iso}")
                break
        else:
            out.insert(0, f"Last updated: {today_iso}")

    # Add a Disqualification section if missing.
    joined = "\n".join(out) + "\n"
    if "\n## Disqualification\n" not in joined:
        joined = joined.rstrip("\n") + "\n\n## Disqualification\n"
        joined += f"- {reason}\n"
    return joined


@dataclass(frozen=True)
class TriageItem:
    lead_id: int
    name: str
    profile_path: Path
    dq: bool
    keep: bool


def parse_triage(path: Path) -> list[TriageItem]:
    items: list[TriageItem] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        m = RE_LINE.match(line)
        if not m:
            continue
        dq = m.group("dq").strip().lower() == "x"
        keep = m.group("keep").strip().lower() == "x"
        items.append(
            TriageItem(
                lead_id=int(m.group("id")),
                name=m.group("name").strip(),
                profile_path=Path(m.group("path")),
                dq=dq,
                keep=keep,
            )
        )
    return items


def write_keepers_queue(out_path: Path, items: list[TriageItem]) -> None:
    lines = []
    lines.append("# No-Website Triage: KEEPERS")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append("Source: triage checklist (KEEP decisions)")
    lines.append(f"Total: {len(items)}")
    lines.append("")
    lines.append("Format: LeadID | Name | ProfilePath")
    lines.append("")
    for it in sorted(items, key=lambda x: x.lead_id):
        lines.append(f"- {it.lead_id} | {it.name} | {it.profile_path.as_posix()}")
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def disqualified_profile_path(original_profile_md: Path, lead_id: int) -> Path:
    """
    Given a profile.md path under leads/profiles, compute the expected profile.md
    path under leads/disqualified after moving the folder.
    """
    folder = original_profile_md.parent
    parts = list(folder.parts)
    try:
        idx = parts.index("profiles")
    except ValueError:
        return original_profile_md
    return Path(*parts[:idx]) / "disqualified" / lead_range_folder(lead_id) / folder.name / "profile.md"


def write_simple_queue(out_path: Path, title: str, items: list[tuple[int, str, Path]]) -> None:
    lines = []
    lines.append(f"# {title}")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append(f"Total: {len(items)}")
    lines.append("")
    lines.append("Format: LeadID | Name | ProfilePath")
    lines.append("")
    for lead_id, name, path in sorted(items, key=lambda x: x[0]):
        lines.append(f"- {lead_id} | {name} | {path.as_posix()}")
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--triage", required=True, help="Path to triage checklist markdown")
    ap.add_argument("--dry-run", action="store_true", help="Do not write/move anything")
    args = ap.parse_args()

    triage_path = Path(args.triage)
    if not triage_path.exists():
        raise SystemExit(f"triage not found: {triage_path}")

    items = parse_triage(triage_path)
    if not items:
        print("No triage rows parsed (did you keep the exact checkbox format?)")
        return 1

    bad = [it for it in items if (it.dq and it.keep)]
    if bad:
        print(f"Invalid rows (DQ and KEEP both checked): {len(bad)}")
        for it in bad[:20]:
            print(f"- {it.lead_id} {it.name} dq={it.dq} keep={it.keep}")
        return 2

    dq_items = [it for it in items if it.dq and not it.keep]
    keep_items = [it for it in items if it.keep and not it.dq]
    unmarked_items = [it for it in items if (not it.dq and not it.keep)]

    print(f"Parsed: {len(items)} rows")
    print(f"- KEEP: {len(keep_items)}")
    print(f"- DQ: {len(dq_items)}")
    print(f"- UNMARKED: {len(unmarked_items)}")

    today_iso = date.today().isoformat()
    reason = f"Triage disqualification ({today_iso}): no public presence / not a fit / duplicate (as marked)."

    moved = 0
    updated = 0
    skipped = 0

    for it in dq_items:
        prof = it.profile_path
        if not prof.exists():
            print(f"SKIP (missing profile): {it.lead_id} {prof}")
            skipped += 1
            continue
        folder = prof.parent
        if folder.name.startswith(("000-", "100-", "200-", "300-", "400-", "500-", "600-", "700-", "800-", "900-", "1000-")):
            # sometimes profile.md might be at range root; be cautious
            pass

        # Update profile.md
        text = prof.read_text(encoding="utf-8", errors="replace")
        new_text = update_profile_text_for_disqualified(text, reason, today_iso)

        if not args.dry_run:
            prof.write_text(new_text, encoding="utf-8")
        updated += 1

        # Move folder if currently under leads/profiles
        parts = list(folder.parts)
        try:
            idx = parts.index("profiles")
        except ValueError:
            # Already disqualified or elsewhere
            continue

        dest = Path(*parts[:idx]) / "disqualified" / lead_range_folder(it.lead_id) / folder.name
        if dest.exists():
            print(f"SKIP (dest exists): {it.lead_id} -> {dest}")
            skipped += 1
            continue

        if args.dry_run:
            print(f"DRY-RUN move: {folder} -> {dest}")
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(folder.as_posix(), dest.as_posix())
        moved += 1

    keepers_out = triage_path.parent / (triage_path.stem.replace("triage", "keepers") + ".md")
    dq_out = triage_path.parent / (triage_path.stem.replace("triage", "dq") + ".md")
    review_out = triage_path.parent / (triage_path.stem.replace("triage", "review") + ".md")
    if args.dry_run:
        print(f"DRY-RUN write keepers queue: {keepers_out}")
        print(f"DRY-RUN write dq queue: {dq_out}")
        print(f"DRY-RUN write review queue: {review_out}")
    else:
        write_keepers_queue(keepers_out, keep_items)
        print(f"Wrote keepers queue: {keepers_out}")
        write_simple_queue(
            dq_out,
            "No-Website Triage: DISQUALIFIED",
            [(it.lead_id, it.name, disqualified_profile_path(it.profile_path, it.lead_id)) for it in dq_items],
        )
        print(f"Wrote dq queue: {dq_out}")
        write_simple_queue(
            review_out,
            "No-Website Triage: REVIEW (Unmarked)",
            [(it.lead_id, it.name, it.profile_path) for it in unmarked_items],
        )
        print(f"Wrote review queue: {review_out}")

    print(f"Updated profiles: {updated}")
    print(f"Moved to disqualified: {moved}")
    print(f"Skipped: {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
