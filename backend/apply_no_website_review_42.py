#!/usr/bin/env python3
"""
Apply decisions from the 42-item "no website" REVIEW checklist.

Input (default):
  outreach/queues/research-needed-no-website-triage-review-2026-02-08-prefilled.md

Actions:
- For DQ rows: ensure the lead folder lives under leads/disqualified/... (move if needed)
- For KEEP rows: ensure the lead folder remains under leads/profiles/... (flag if it was disqualified)
- Write output queue files listing the KEEP and DQ sets
- Optionally rename the original REVIEW list to -processed (safe, non-destructive)

This script is intentionally conservative:
- It will NOT auto-restore a lead from disqualified -> profiles for KEEP; it will flag for manual review.
"""

from __future__ import annotations

import argparse
import re
import shutil
from dataclasses import dataclass
from datetime import date
from pathlib import Path


@dataclass(frozen=True)
class Row:
    decision: str  # "DQ" or "KEEP"
    lead_id: str
    name: str
    profile_path: Path  # expected profiles path


ROW_RE = re.compile(
    r"^\-\s+\[(?P<dqmark>[ xX])\]\s*DQ\s+\[(?P<keepmark>[ xX])\]\s*KEEP\s*\|\s*"
    r"(?P<lead_id>\d+)\s*\|\s*(?P<name>.*?)\s*\|\s*(?P<path>leads\/profiles\/.+\/profile\.md)\s*$"
)


def parse_rows(text: str) -> list[Row]:
    rows: list[Row] = []
    for raw in text.splitlines():
        raw = raw.strip()
        if not raw:
            continue
        m = ROW_RE.match(raw)
        if not m:
            raise ValueError(f"Unparseable row:\n{raw}")
        dqmark = m.group("dqmark").strip().lower() == "x"
        keepmark = m.group("keepmark").strip().lower() == "x"
        if dqmark == keepmark:
            raise ValueError(f"Row must be exactly one of DQ or KEEP:\n{raw}")
        decision = "DQ" if dqmark else "KEEP"
        rows.append(
            Row(
                decision=decision,
                lead_id=m.group("lead_id").strip(),
                name=m.group("name").strip(),
                profile_path=Path(m.group("path")),
            )
        )
    return rows


def profile_dir_from_profile_md(profile_md: Path) -> Path:
    return profile_md.parent


def to_disqualified_profile_md(profile_md: Path) -> Path:
    # leads/profiles/xxx/slug/profile.md -> leads/disqualified/xxx/slug/profile.md
    parts = list(profile_md.parts)
    if len(parts) >= 2 and parts[0] == "leads" and parts[1] == "profiles":
        parts[1] = "disqualified"
    else:
        raise ValueError(f"Unexpected profile path: {profile_md}")
    return Path(*parts)


def write_queue(out_path: Path, title: str, rows: list[Row], resolved_paths: dict[str, Path]) -> None:
    lines: list[str] = []
    lines.append(f"# {title}")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append(f"Total: {len(rows)}")
    lines.append("")
    lines.append("Format: LeadID | Name | ProfilePath")
    lines.append("")
    for r in rows:
        p = resolved_paths.get(r.lead_id, r.profile_path)
        lines.append(f"- {r.lead_id} | {r.name} | {p.as_posix()}")
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--checklist",
        default="outreach/queues/research-needed-no-website-triage-review-2026-02-08-prefilled.md",
        help="Path to the triage-review checklist (42 items).",
    )
    ap.add_argument(
        "--review-list",
        default="outreach/queues/research-needed-no-website-review-2026-02-08-prefilled.md",
        help="Path to the original unmarked REVIEW list to optionally rename to -processed.",
    )
    ap.add_argument(
        "--rename-review-list",
        action="store_true",
        help="Rename the unmarked REVIEW list to -processed after running.",
    )
    args = ap.parse_args()

    checklist_path = Path(args.checklist)
    review_list_path = Path(args.review_list)

    rows = parse_rows(checklist_path.read_text(encoding="utf-8"))
    dq_rows = [r for r in rows if r.decision == "DQ"]
    keep_rows = [r for r in rows if r.decision == "KEEP"]

    # Track what we actually resolved to on disk (profile vs disqualified).
    resolved_profile_md: dict[str, Path] = {}

    moved_to_disqualified = 0
    already_disqualified = 0
    keep_conflicts = 0
    missing = 0

    for r in rows:
        expected_profile_md = r.profile_path
        expected_profile_dir = profile_dir_from_profile_md(expected_profile_md)
        expected_dq_md = to_disqualified_profile_md(expected_profile_md)
        expected_dq_dir = profile_dir_from_profile_md(expected_dq_md)

        in_profiles = expected_profile_md.exists()
        in_dq = expected_dq_md.exists()

        if r.decision == "DQ":
            if in_dq:
                already_disqualified += 1
                resolved_profile_md[r.lead_id] = expected_dq_md
                continue
            if in_profiles:
                expected_dq_dir.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(expected_profile_dir), str(expected_dq_dir))
                moved_to_disqualified += 1
                resolved_profile_md[r.lead_id] = expected_dq_md
                continue
            missing += 1
            # Leave path as-is; we'll still list it for visibility.
            resolved_profile_md[r.lead_id] = expected_profile_md
            continue

        # KEEP
        if in_profiles:
            resolved_profile_md[r.lead_id] = expected_profile_md
            continue
        if in_dq:
            # Do not auto-restore; just flag.
            keep_conflicts += 1
            resolved_profile_md[r.lead_id] = expected_dq_md
            continue
        missing += 1
        resolved_profile_md[r.lead_id] = expected_profile_md

    out_dir = Path("outreach/queues")
    out_dq = out_dir / "research-needed-no-website-review-42-dq-2026-02-08.md"
    out_keep = out_dir / "research-needed-no-website-review-42-keepers-2026-02-08.md"
    write_queue(out_dq, "No-Website REVIEW (42): DQ Decisions", dq_rows, resolved_profile_md)
    write_queue(out_keep, "No-Website REVIEW (42): KEEP Decisions", keep_rows, resolved_profile_md)

    if args.rename_review_list and review_list_path.exists():
        processed = review_list_path.with_name(review_list_path.stem + "-processed.md")
        if not processed.exists():
            review_list_path.rename(processed)

    print("Rows:", len(rows))
    print("DQ:", len(dq_rows), "KEEP:", len(keep_rows))
    print("Moved to disqualified:", moved_to_disqualified)
    print("Already disqualified:", already_disqualified)
    print("KEEP conflicts (marked KEEP but already disqualified):", keep_conflicts)
    print("Missing (profile not found in profiles or disqualified):", missing)

    if keep_conflicts:
        print("NOTE: Resolve KEEP conflicts manually before trusting this queue.")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

