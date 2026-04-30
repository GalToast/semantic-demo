from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import date
from pathlib import Path
import re

REPO_ROOT = Path(".")
BATCH_DIR = REPO_ROOT / "leads" / "batches"

LINE_RE = re.compile(r"^(\d+)\.\s+(\*\*.*)$")


@dataclass
class ProfileMatch:
    lead_id: int
    paths: list[str]


def is_import_profile(profile_md: Path) -> bool:
    """
    We have a legacy/CRM-style dataset marked with `Source: import` that reuses
    numeric LeadIDs. Batch worklists should not treat those as registered-entity
    profiles, otherwise checkmarks and notes become misleading.
    """
    try:
        text = profile_md.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False
    return bool(re.search(r"^Source:\s*import\b", text, re.IGNORECASE | re.MULTILINE))


def find_profile_paths(lead_id: int) -> list[str]:
    paths: list[str] = []
    rng = f"{(lead_id//100)*100:03d}-{(lead_id//100)*100+99:03d}"
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


def create_worklist(batch_id: str) -> None:
    batch_id_clean = batch_id.zfill(3)
    src = BATCH_DIR / f"registered-entities-batch-{batch_id_clean}-not-processed.md"
    dst = BATCH_DIR / f"registered-entities-batch-{batch_id_clean}-worklist.md"

    if not src.exists():
        raise SystemExit(f"Source not found: {src}")

    src_lines = src.read_text(encoding="utf-8", errors="ignore").splitlines()
    items: list[str] = []

    for line in src_lines:
        match = LINE_RE.match(line.strip())
        if not match:
            continue
        lead_id = int(match.group(1))
        rest = match.group(0)
        profile_paths = find_profile_paths(lead_id)
        checked = "x" if profile_paths else " "
        note = format_note(profile_paths)
        items.append(f"- [{checked}] {rest}{note}")

    header = [
        f"# Registered Entities Batch {batch_id_clean} Worklist",
        "Status: in progress",
        f"Source file: {src.name}",
        f"Generated: {date.today().isoformat()}",
        "",
    ]

    dst.write_text("\n".join(header + items) + "\n", encoding="utf-8")
    print(f"Wrote: {dst}")
    print(f"Items: {len(items)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", required=True, help="Batch id, e.g. 008")
    args = parser.parse_args()
    create_worklist(args.batch)


if __name__ == "__main__":
    main()
