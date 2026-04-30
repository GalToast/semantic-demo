from __future__ import annotations

import csv
import re
import shutil
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
INDEX_CSV = REPO_ROOT / "leads" / "index.csv"

TARGETS = {
    "279": "",
    "1298": "https://canalyticstech.com",
    "1620": "",
    "2613": "https://pooliron.com",
    "3228": "https://hfh-tx.com",
    "4171": "https://ameritexpipe.com",
    "6674": "",
    "6681": "",
    "7018": "",
    "7389": "",
}

PROFILE_PATHS = {
    "279": [REPO_ROOT / "leads" / "disqualified" / "200-299" / "279-adasope-inc" / "profile.md"],
    "1298": [REPO_ROOT / "leads" / "profiles" / "1200-1299" / "1298-canalytics-technologies-llc" / "profile.md"],
    "1620": [REPO_ROOT / "leads" / "profiles" / "1600-1699" / "1620-coffee-experts-llc" / "profile.md"],
    "2613": [REPO_ROOT / "leads" / "profiles" / "2600-2699" / "2613-f-and-f-elm-creek-llc" / "profile.md"],
    "3228": [REPO_ROOT / "leads" / "profiles" / "3200-3299" / "3228-handyman-for-hire" / "profile.md"],
    "4171": [REPO_ROOT / "leads" / "profiles" / "4100-4199" / "4171-kjz-group-llc" / "profile.md"],
    "6674": [
        REPO_ROOT / "leads" / "profiles" / "6600-6699" / "6674-tacos-el-caudillo-del-sur-llc" / "profile.md",
        REPO_ROOT / "leads" / "profiles" / "6600-6699" / "6674-tacos-el-caudillo" / "profile.md",
    ],
    "6681": [REPO_ROOT / "leads" / "profiles" / "6600-6699" / "6681-smith-towing-llc" / "profile.md"],
    "7018": [REPO_ROOT / "leads" / "profiles" / "7000-7099" / "7018-the-gold-spoon-llc" / "profile.md"],
    "7389": [REPO_ROOT / "leads" / "profiles" / "7300-7399" / "7389-the-gold-spoon-llc" / "profile.md"],
}

WEBSITE_PATTERNS = [
    re.compile(r"(?im)^(?P<prefix>\*\*Website:\*\*\s*)(?P<value>.+?)\s*$"),
    re.compile(r"(?im)^(?P<prefix>Website:\s*)(?P<value>.+?)\s*$"),
]


def backup_file(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = path.with_name(f"{path.stem}.pre-dirty-website-normalize-{stamp}{path.suffix}.bak")
    shutil.copy2(path, backup)
    return backup


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
        lead_id = (row.get("LeadID") or "").strip()
        if lead_id in TARGETS and row.get("Website", "") != TARGETS[lead_id]:
            row["Website"] = TARGETS[lead_id]
            changed += 1

    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(rows)
    return changed, backup


def read_text_lossless(path: Path) -> tuple[str, str]:
    for encoding in ("utf-8", "cp1252", "latin-1"):
        try:
            return path.read_text(encoding=encoding), encoding
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("unknown", b"", 0, 1, f"Could not decode {path}")


def normalize_profile_file(path: Path, replacement: str) -> bool:
    text, encoding = read_text_lossless(path)
    lines = text.splitlines()
    updated = False
    for idx, line in enumerate(lines):
        for pattern in WEBSITE_PATTERNS:
            match = pattern.match(line.strip())
            if not match:
                continue
            lines[idx] = f"{match.group('prefix')}{replacement}"
            updated = True
            break
        if updated:
            break

    if not updated:
        return False

    new_text = "\n".join(lines) + ("\n" if text.endswith("\n") else "")
    if new_text == text:
        return False

    backup_file(path)
    path.write_text(new_text, encoding=encoding)
    return True


def normalize_profiles() -> int:
    changed = 0
    for lead_id, paths in PROFILE_PATHS.items():
        replacement = TARGETS[lead_id]
        for path in paths:
            if path.exists() and normalize_profile_file(path, replacement):
                changed += 1
    return changed


def main() -> None:
    index_changed, index_backup = normalize_index_csv(INDEX_CSV)
    profile_changed = normalize_profiles()
    print(f"INDEX_CHANGED={index_changed}")
    print(f"INDEX_BACKUP={index_backup}")
    print(f"PROFILES_CHANGED={profile_changed}")


if __name__ == "__main__":
    main()
