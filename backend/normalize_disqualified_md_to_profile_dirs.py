from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import re
import shutil

REPO_ROOT = Path(".")
DISQUALIFIED_ROOT = REPO_ROOT / "leads" / "disqualified"
DUPE_ROOT = REPO_ROOT / "leads" / "duplicates"


def range_dir_for_id(lead_id: int) -> str:
    start = (lead_id // 100) * 100
    end = start + 99
    return f"{start:03d}-{end:03d}"


def slugify(value: str) -> str:
    lowered = value.strip().lower()
    lowered = lowered.replace("&", " and ")
    lowered = re.sub(r"[^\w\s-]", "", lowered)
    lowered = re.sub(r"[\s_]+", "-", lowered)
    lowered = re.sub(r"-{2,}", "-", lowered)
    return lowered.strip("-") or "lead"


def extract_title(text: str) -> str:
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return ""


@dataclass
class MovePlan:
    src_file: Path
    lead_id: int
    dst_dir: Path
    dst_profile: Path
    quarantine_path: Path | None
    reason: str


def plan_moves() -> list[MovePlan]:
    plans: list[MovePlan] = []
    if not DISQUALIFIED_ROOT.exists():
        return plans

    for src in DISQUALIFIED_ROOT.rglob("*.md"):
        if src.name.lower() == "profile.md":
            continue
        # Only normalize leaf files directly under a range folder.
        # Example: leads/disqualified/600-699/608-something.md
        if src.parent == DISQUALIFIED_ROOT:
            continue
        if src.parent.name.startswith("duplicates"):
            continue

        m = re.match(r"^(\d+)-(.+)\.md$", src.name, re.IGNORECASE)
        if not m:
            continue
        lead_id = int(m.group(1))
        raw_slug = m.group(2)

        rng = range_dir_for_id(lead_id)
        # Prefer title-derived slug if it exists (better readability), otherwise filename.
        try:
            text = src.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            text = ""
        title = extract_title(text)
        slug = slugify(title) if title else slugify(raw_slug)

        dst_dir = DISQUALIFIED_ROOT / rng / f"{lead_id}-{slug}"
        dst_profile = dst_dir / "profile.md"

        quarantine_path: Path | None = None
        reason = "move"
        if dst_profile.exists():
            # Avoid clobbering existing profiles.
            quarantine_path = DUPE_ROOT / "disqualified-legacy-md" / rng / src.name
            reason = "quarantine_existing_profile"

        plans.append(
            MovePlan(
                src_file=src,
                lead_id=lead_id,
                dst_dir=dst_dir,
                dst_profile=dst_profile,
                quarantine_path=quarantine_path,
                reason=reason,
            )
        )

    return sorted(plans, key=lambda p: (p.lead_id, p.src_file.as_posix()))


def apply_moves(plans: list[MovePlan], apply: bool) -> None:
    moved = 0
    quarantined = 0
    skipped = 0

    for plan in plans:
        if plan.reason == "quarantine_existing_profile" and plan.quarantine_path:
            quarantined += 1
            if apply:
                plan.quarantine_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(plan.src_file.as_posix(), plan.quarantine_path.as_posix())
            continue

        # Normal move into a directory profile.md
        if plan.dst_profile.exists():
            skipped += 1
            continue
        moved += 1
        if apply:
            plan.dst_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(plan.src_file.as_posix(), plan.dst_profile.as_posix())

    print(f"apply: {apply}")
    print(f"planned: {len(plans)}")
    print(f"moved: {moved}")
    print(f"quarantined: {quarantined}")
    print(f"skipped: {skipped}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Normalize legacy disqualified single-file markdown records into <id>-<slug>/profile.md directories."
    )
    parser.add_argument("--apply", action="store_true", help="Apply moves (default: dry-run)")
    args = parser.parse_args()

    plans = plan_moves()
    apply_moves(plans, apply=args.apply)


if __name__ == "__main__":
    main()

