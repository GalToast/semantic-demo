from __future__ import annotations

import os
import shutil
from pathlib import Path

REPO_ROOT = Path(".")
PROFILES_ROOT = REPO_ROOT / "leads" / "profiles"
DISQUALIFIED_ROOT = REPO_ROOT / "leads" / "disqualified"

def main() -> None:
    # Identify all IDs in disqualified
    disqualified_ids = set()
    for profile in DISQUALIFIED_ROOT.rglob("*.md"):
        # Dir name usually starts with ID-
        name = profile.parent.name
        if "-" in name:
            lead_id = name.split("-")[0]
            if lead_id.isdigit():
                disqualified_ids.add(lead_id)

    to_remove = []
    # Search for these IDs in profiles
    for profile in PROFILES_ROOT.rglob("profile.md"):
        name = profile.parent.name
        if "-" in name:
            lead_id = name.split("-")[0]
            if lead_id in disqualified_ids:
                to_remove.append(profile)

    removed_count = 0
    for profile in to_remove:
        if not profile.exists():
            continue
        parent = profile.parent
        # Double check it's actually a stub (less than 1500 bytes)
        if profile.stat().st_size < 1500:
            # Check for subdirectories (like evidence)
            has_subdirs = any(f.is_dir() for f in parent.iterdir())
            
            if not has_subdirs:
                print(f"Removing duplicate stub: {parent}")
                shutil.rmtree(parent)
                removed_count += 1
            else:
                print(f"SKIPPING removal of {parent} because it contains subdirectories.")
        else:
            print(f"SKIPPING removal of {profile} because it looks like it has content ({profile.stat().st_size} bytes)")

    print(f"Total duplicate stubs removed: {removed_count}")

if __name__ == "__main__":
    main()
