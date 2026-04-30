from __future__ import annotations

import argparse
import csv
import re
import shutil
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
INDEX_CSV = REPO_ROOT / "leads" / "index.csv"
PROFILE_ROOTS = [
    REPO_ROOT / "leads" / "profiles",
    REPO_ROOT / "leads" / "disqualified",
]

EXACT_GARBAGE_EMAILS = {
    "name@example.com",
    "user@domain.com",
    "example@domain.com",
    "[email protected]",
    "abc@example.com",
    "foo@bar.com",
    "john.doe@gmail.com",
    "via contact form",
    "not publicly listed",
    "not",
    "s",
    "i",
    "n",
}

GARBAGE_DOMAIN_PATTERNS = (
    "@duckduckgo.com",
    "@error-tracking.reddit.com",
    "@crash2.zhihu.com",
    "@bug-reporting-",
)

GARBAGE_SUBSTRINGS = (
    "bug-reporting",
    "error-tracking",
    "mailto:name@example.com",
)

IMAGE_SUFFIXES = (
    ".png",
    ".gif",
    ".jpg",
    ".jpeg",
    ".webp",
    ".svg",
    ".avif",
)

HEADER_PATTERNS = [
    re.compile(r"(?im)^(?P<prefix>\*\*Email:\*\*\s*)(?P<value>.+?)\s*$"),
    re.compile(r"(?im)^(?P<prefix>Email:\s*)(?P<value>.+?)\s*$"),
]


def backup_file(path: Path, suffix_label: str) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = path.with_name(f"{path.stem}.{suffix_label}-{stamp}{path.suffix}.bak")
    shutil.copy2(path, backup)
    return backup


def read_text_lossless(path: Path) -> tuple[str, str]:
    for encoding in ("utf-8", "cp1252", "latin-1"):
        try:
            return path.read_text(encoding=encoding), encoding
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("unknown", b"", 0, 1, f"Could not decode {path}")


def normalize_email_value(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).strip()


def is_garbage_email(value: str) -> bool:
    email = normalize_email_value(value).lower()
    if not email:
        return False
    if email in EXACT_GARBAGE_EMAILS:
        return True
    if any(token in email for token in GARBAGE_SUBSTRINGS):
        return True
    if any(token in email for token in GARBAGE_DOMAIN_PATTERNS):
        return True
    if any(suffix in email for suffix in IMAGE_SUFFIXES):
        return True
    if email.startswith("help@mapquest.com"):
        return True
    return False


def build_profile_path_index() -> dict[str, list[Path]]:
    index: dict[str, list[Path]] = defaultdict(list)
    for root in PROFILE_ROOTS:
        if not root.exists():
            continue
        for path in root.rglob("profile.md"):
            lead_dir = path.parent.name
            lead_id, _, _ = lead_dir.partition("-")
            if lead_id.isdigit():
                index[lead_id].append(path)
    return {lead_id: sorted(paths) for lead_id, paths in index.items()}


def normalize_index_csv(path: Path) -> tuple[int, Path, dict[str, str]]:
    backup = backup_file(path, "pre-garbage-email-normalize")
    with path.open("r", newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        fieldnames = reader.fieldnames
        if not fieldnames:
            raise RuntimeError("index.csv has no header row")
        rows = list(reader)

    changed = 0
    changed_map: dict[str, str] = {}
    for row in rows:
        lead_id = (row.get("LeadID") or "").strip()
        email = row.get("Email") or ""
        if is_garbage_email(email):
            row["Email"] = ""
            changed += 1
            if lead_id:
                changed_map[lead_id] = email

    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(rows)
    return changed, backup, changed_map


def normalize_profile_file(path: Path, original_email: str) -> bool:
    text, encoding = read_text_lossless(path)
    updated = text
    original_norm = normalize_email_value(original_email)
    changed = False

    for pattern in HEADER_PATTERNS:
        def repl(match: re.Match[str]) -> str:
            nonlocal changed
            current = normalize_email_value(match.group("value"))
            if current.lower() == original_norm.lower():
                changed = True
                return match.group("prefix")
            return match.group(0)

        updated = pattern.sub(repl, updated)

    if not changed or updated == text:
        return False

    backup_file(path, "pre-garbage-email-normalize")
    path.write_text(updated, encoding=encoding)
    return True


def normalize_profiles(changed_map: dict[str, str]) -> tuple[int, Counter[str]]:
    changed = 0
    counter: Counter[str] = Counter()
    profile_index = build_profile_path_index()
    for lead_id, original_email in changed_map.items():
        for path in profile_index.get(lead_id, []):
            if normalize_profile_file(path, original_email):
                changed += 1
                counter[str(path.parent)] += 1
    return changed, counter


def main() -> None:
    parser = argparse.ArgumentParser(description="Blank obviously garbage email values from lead source files.")
    parser.add_argument("--index-only", action="store_true", help="Only repair leads/index.csv.")
    args = parser.parse_args()

    index_changed, index_backup, changed_map = normalize_index_csv(INDEX_CSV)
    profile_changed = 0
    profile_counter: Counter[str] = Counter()
    if not args.index_only:
        profile_changed, profile_counter = normalize_profiles(changed_map)

    print(f"INDEX_CHANGED={index_changed}")
    print(f"INDEX_BACKUP={index_backup}")
    print(f"PROFILES_CHANGED={profile_changed}")
    for parent, count in profile_counter.most_common():
        print(f"PROFILE_DIR_CHANGED={count}\t{parent}")


if __name__ == "__main__":
    main()
