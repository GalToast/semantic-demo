from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path
import re

REPO_ROOT = Path(".")
BATCH_DIR = REPO_ROOT / "leads" / "batches"

LINE_RE = re.compile(r"^(\d+)\.\s+(\*\*.*)$")
WORKLIST_ITEM_RE = re.compile(r"^\s*-\s*\[[ xX]\]\s*(\d+)\.\s+\*\*.*$")


def is_import_profile(profile_md: Path) -> bool:
    try:
        text = profile_md.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False
    return bool(re.search(r"^Source:\s*import\b", text, re.IGNORECASE | re.MULTILINE))


def range_dir_for_id(lead_id: int) -> str:
    start = (lead_id // 100) * 100
    end = start + 99
    return f"{start:03d}-{end:03d}"


def find_profile_paths(lead_id: int) -> list[str]:
    paths: list[str] = []
    rng = range_dir_for_id(lead_id)
    for base in [REPO_ROOT / "leads" / "profiles" / rng, REPO_ROOT / "leads" / "disqualified" / rng]:
        if not base.exists():
            continue
        for profile in base.glob("*/profile.md"):
            slug = profile.parent.name
            if slug.startswith(f"{lead_id}-") or slug.endswith(f"-{lead_id}"):
                if is_import_profile(profile):
                    continue
                rel = profile.relative_to(REPO_ROOT).as_posix()
                if rel not in paths:
                    paths.append(rel)
    paths.sort()
    return paths


def format_note(paths: list[str]) -> str:
    if not paths:
        return ""
    if len(paths) == 1:
        return f" | Note: profile ({paths[0]})"
    shown = ", ".join(paths[:3])
    more = "" if len(paths) <= 3 else f" (+{len(paths)-3} more)"
    return f" | Note: multiple profiles ({shown}{more})"


def read_existing_worklist_items(path: Path) -> dict[int, str]:
    """
    Map lead_id -> full existing line (preserving notes and check status).
    Only supports the standard numeric-dot format.
    """
    items: dict[int, str] = {}
    if not path.exists():
        return items
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        m = re.match(r"^\s*-\s*\[[ xX]\]\s*(\d+)\.", line)
        if not m:
            continue
        lid = int(m.group(1))
        items[lid] = line.rstrip()
    return items


def detect_status(existing_worklist: Path) -> str:
    if not existing_worklist.exists():
        return "in progress"
    text = existing_worklist.read_text(encoding="utf-8", errors="ignore")
    m = re.search(r"^(?:Status:\s*|\*\*Status:\*\*\s*)(.+)$", text, re.IGNORECASE | re.MULTILINE)
    return m.group(1).strip() if m else "in progress"


def normalize_worklist(batch_id: str, apply: bool) -> None:
    batch_id_clean = batch_id.zfill(3)
    src = BATCH_DIR / f"registered-entities-batch-{batch_id_clean}-not-processed.md"
    dst = BATCH_DIR / f"registered-entities-batch-{batch_id_clean}-worklist.md"

    if not src.exists():
        raise SystemExit(f"Source not found: {src}")

    existing_items = read_existing_worklist_items(dst)
    status = detect_status(dst)

    src_lines = src.read_text(encoding="utf-8", errors="ignore").splitlines()
    items: list[str] = []

    for line in src_lines:
        match = LINE_RE.match(line.strip())
        if not match:
            continue
        lead_id = int(match.group(1))
        rest = match.group(0)
        if lead_id in existing_items:
            items.append(existing_items[lead_id])
            continue

        profile_paths = find_profile_paths(lead_id)
        checked = "x" if profile_paths else " "
        note = format_note(profile_paths)
        items.append(f"- [{checked}] {rest}{note}")

    header = [
        f"# Registered Entities Batch {batch_id_clean} Worklist",
        f"Status: {status}",
        f"Source file: {src.name}",
        f"Generated: {date.today().isoformat()}",
        "",
    ]

    if not apply:
        print(f"DRY-RUN would write: {dst}")
        print(f"Items: {len(items)}")
        missing_count = len([line for line in items if WORKLIST_ITEM_RE.match(line)])
        print(f"Parsed items: {missing_count}")
        return

    # Preserve existing worklist as legacy (non-destructive).
    if dst.exists():
        legacy = BATCH_DIR / f"registered-entities-batch-{batch_id_clean}-worklist-legacy.md"
        if not legacy.exists():
            legacy.write_text(dst.read_text(encoding="utf-8", errors="ignore"), encoding="utf-8")

    dst.write_text("\n".join(header + items) + "\n", encoding="utf-8")
    print(f"Wrote: {dst}")
    print(f"Items: {len(items)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", required=True, help="Batch id, e.g. 001")
    parser.add_argument("--apply", action="store_true", help="Write changes")
    args = parser.parse_args()
    normalize_worklist(args.batch, apply=args.apply)


if __name__ == "__main__":
    main()

