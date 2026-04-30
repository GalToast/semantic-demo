from __future__ import annotations

import argparse
import csv
import re
import shutil
from collections import Counter
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
INDEX_CSV = REPO_ROOT / "leads" / "index.csv"
PROFILE_ROOTS = [
    REPO_ROOT / "leads" / "profiles",
    REPO_ROOT / "leads" / "disqualified",
]

PLACEHOLDER_EMAILS = {
    "to be verified",
}

HEADER_PATTERNS = [
    re.compile(r"(?im)^(?P<prefix>\*\*Email:\*\*\s*)(?P<value>To be verified)\s*$"),
    re.compile(r"(?im)^(?P<prefix>Email:\s*)(?P<value>To be verified)\s*$"),
]


def backup_file(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = path.with_name(f"{path.stem}.pre-placeholder-email-normalize-{stamp}{path.suffix}.bak")
    shutil.copy2(path, backup)
    return backup


def read_text_lossless(path: Path) -> tuple[str, str]:
    for encoding in ("utf-8", "cp1252", "latin-1"):
        try:
            return path.read_text(encoding=encoding), encoding
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("unknown", b"", 0, 1, f"Could not decode {path}")


def normalize_index_csv(path: Path) -> tuple[int, Path]:
    backup = backup_file(path)
    with path.open("r", newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        fieldnames = reader.fieldnames
        if not fieldnames:
            raise RuntimeError("index.csv has no header row")
        rows = list(reader)

    changed = 0
    for row in rows:
        email = (row.get("Email") or "").strip()
        if email.lower() in PLACEHOLDER_EMAILS:
            row["Email"] = ""
            changed += 1

    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(rows)
    return changed, backup


def normalize_profile_file(path: Path) -> bool:
    text, encoding = read_text_lossless(path)
    updated = text
    for pattern in HEADER_PATTERNS:
        updated = pattern.sub(lambda m: f"{m.group('prefix')}", updated)
    if updated == text:
        return False
    backup_file(path)
    path.write_text(updated, encoding=encoding)
    return True


def iter_profile_files() -> list[Path]:
    files: list[Path] = []
    for root in PROFILE_ROOTS:
        if root.exists():
            files.extend(sorted(root.rglob("profile.md")))
    return files


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize placeholder email values in lead source files.")
    parser.add_argument("--index-only", action="store_true", help="Only repair leads/index.csv.")
    args = parser.parse_args()

    index_changed, index_backup = normalize_index_csv(INDEX_CSV)

    changed_profiles = 0
    profile_counter: Counter[str] = Counter()
    if not args.index_only:
        profile_files = iter_profile_files()
        for path in profile_files:
            if normalize_profile_file(path):
                changed_profiles += 1
                profile_counter[str(path.parent)] += 1

    print(f"INDEX_CHANGED={index_changed}")
    print(f"INDEX_BACKUP={index_backup}")
    print(f"PROFILES_CHANGED={changed_profiles}")
    if profile_counter:
        for parent, count in profile_counter.most_common():
            print(f"PROFILE_DIR_CHANGED={count}\t{parent}")


if __name__ == "__main__":
    main()
