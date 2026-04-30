#!/usr/bin/env python3
"""
Move "excluded" lead profiles from `leads/profiles/` to `leads/disqualified/`.

Rationale
- Many profiles contain an `## Exclusion Reason` section (or an explicit `## Status` of `excluded`)
  but still live under `leads/profiles/`, which pollutes qualified views/queues like:
  - leads/views/no-contact.md
  - leads/views/contact-unknown.md

Safety goals
- Never overwrite an existing destination directory.
- Keep the folder name (LeadID + slug) unchanged.
- Update the header `Status:` field to `disqualified` when present.
- Write a report so moves are auditable.
"""

from __future__ import annotations

import argparse
import re
import shutil
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILES_ROOT = REPO_ROOT / "leads" / "profiles"
DISQUALIFIED_ROOT = REPO_ROOT / "leads" / "disqualified"
TODAY = date.today().isoformat()


EXCLUSION_REASON_RE = re.compile(r"^##\s+Exclusion\s+Reason\b", re.IGNORECASE | re.MULTILINE)
STATUS_EXCLUDED_RE = re.compile(r"^##\s+Status\s*$\s*^excluded\b", re.IGNORECASE | re.MULTILINE)
HEADER_STATUS_RE = re.compile(r"^(Status)\s*:\s*(.+?)\s*$", re.IGNORECASE)


@dataclass(frozen=True)
class MoveResult:
    src_dir: Path
    dst_dir: Path
    lead_id: str
    reason: str
    applied: bool
    skipped: bool
    skip_reason: str | None


def parse_lead_id_from_dirname(dirname: str) -> str:
    # dirname like "570-applebees-80022" -> "570"
    m = re.match(r"^(\d+)-", dirname)
    return m.group(1) if m else ""


def lead_range_dir(lead_id: str) -> str:
    # 0-99, 100-199, ...
    n = int(lead_id)
    start = (n // 100) * 100
    end = start + 99
    return f"{start:03d}-{end:03d}" if n < 1000 else f"{start}-{end}"


def is_excluded_profile(text: str) -> tuple[bool, str]:
    if EXCLUSION_REASON_RE.search(text):
        return True, "exclusion_reason_section"
    if STATUS_EXCLUDED_RE.search(text):
        return True, "status_excluded"
    return False, ""


def update_header_status(profile_md: Path) -> bool:
    """
    Update the first matching header 'Status: ...' line to 'Status: disqualified'.
    Returns True if changed.
    """
    lines = profile_md.read_text(encoding="utf-8", errors="ignore").splitlines()
    changed = False
    for i in range(min(80, len(lines))):
        m = HEADER_STATUS_RE.match(lines[i])
        if not m:
            continue
        # Preserve original key casing ("Status") by reusing group 1.
        key = m.group(1)
        current = m.group(2).strip()
        if current.lower() != "disqualified":
            lines[i] = f"{key}: disqualified"
            changed = True
        break
    if changed:
        profile_md.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return changed


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="Actually move directories (default is dry-run).")
    ap.add_argument(
        "--report",
        default=str(REPO_ROOT / "reports" / f"moved-excluded-to-disqualified-{TODAY}.md"),
        help="Report output path",
    )
    args = ap.parse_args()

    if not PROFILES_ROOT.exists():
        raise SystemExit(f"Missing: {PROFILES_ROOT}")

    results: list[MoveResult] = []

    for profile_md in sorted(PROFILES_ROOT.rglob("profile.md")):
        try:
            text = profile_md.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        excluded, reason = is_excluded_profile(text)
        if not excluded:
            continue

        src_dir = profile_md.parent
        lead_id = parse_lead_id_from_dirname(src_dir.name)
        if not lead_id:
            results.append(
                MoveResult(
                    src_dir=src_dir,
                    dst_dir=DISQUALIFIED_ROOT / "UNKNOWN" / src_dir.name,
                    lead_id="",
                    reason=reason,
                    applied=False,
                    skipped=True,
                    skip_reason="no_numeric_lead_id_in_dirname",
                )
            )
            continue

        dst_dir = DISQUALIFIED_ROOT / lead_range_dir(lead_id) / src_dir.name
        if dst_dir.exists():
            results.append(
                MoveResult(
                    src_dir=src_dir,
                    dst_dir=dst_dir,
                    lead_id=lead_id,
                    reason=reason,
                    applied=False,
                    skipped=True,
                    skip_reason="destination_exists",
                )
            )
            continue

        applied = False
        if args.apply:
            dst_dir.parent.mkdir(parents=True, exist_ok=True)
            # Update header status before moving (keeps content consistent regardless of root).
            try:
                update_header_status(profile_md)
            except Exception:
                # Don't block the move on a header edit failure.
                pass
            shutil.move(str(src_dir), str(dst_dir))
            applied = True

        results.append(
            MoveResult(
                src_dir=src_dir,
                dst_dir=dst_dir,
                lead_id=lead_id,
                reason=reason,
                applied=applied,
                skipped=False,
                skip_reason=None,
            )
        )

    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    moved = [r for r in results if not r.skipped]
    skipped = [r for r in results if r.skipped]

    lines = [
        "# Moved Excluded Profiles To Disqualified",
        f"Generated: {TODAY}",
        "",
        "## Summary",
        f"- Apply mode: {'yes' if args.apply else 'no (dry-run)'}",
        f"- Moves planned: {len(moved)}",
        f"- Skipped: {len(skipped)}",
        "",
        "## Moves",
        "| Lead ID | Reason | Applied | Source Dir | Destination Dir |",
        "| --- | --- | --- | --- | --- |",
    ]
    for r in moved:
        lines.append(f"| {r.lead_id} | {r.reason} | {'yes' if r.applied else 'no'} | {r.src_dir.as_posix()} | {r.dst_dir.as_posix()} |")

    lines += [
        "",
        "## Skipped",
        "| Lead ID | Reason | Skip Reason | Source Dir | Destination Dir |",
        "| --- | --- | --- | --- | --- |",
    ]
    for r in skipped:
        lines.append(
            f"| {r.lead_id or 'N/A'} | {r.reason} | {r.skip_reason} | {r.src_dir.as_posix()} | {r.dst_dir.as_posix()} |"
        )

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Report: {report_path}")
    print(f"Moves planned: {len(moved)}")
    print(f"Skipped: {len(skipped)}")


if __name__ == "__main__":
    main()

