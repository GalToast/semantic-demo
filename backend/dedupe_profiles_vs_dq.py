from __future__ import annotations

import os
import shutil
from pathlib import Path

REPO_ROOT = Path(".")
PROFILES_ROOT = REPO_ROOT / "leads" / "profiles"
DISQUALIFIED_ROOT = REPO_ROOT / "leads" / "disqualified"

def main():
    # 1. Map all IDs currently in disqualified
    dq_ids = {}
    for profile in DISQUALIFIED_ROOT.rglob("profile.md"):
        # Folder name is like ID-slug
        folder_name = profile.parent.name
        if "-" in folder_name:
            lead_id = folder_name.split("-")[0]
            if lead_id.isdigit():
                dq_ids[lead_id] = profile.parent

    # 2. Find all profiles that have a duplicate in DQ
    removed = 0
    for profile in PROFILES_ROOT.rglob("profile.md"):
        folder_name = profile.parent.name
        if "-" in folder_name:
            lead_id = folder_name.split("-")[0]
            if lead_id in dq_ids:
                # We have a duplicate. Check if the one in PROFILES is a stub.
                p_content = profile.read_text(encoding="utf-8")
                is_stub = "Pending research" in p_content or "Contact search: not started" in p_content
                
                if is_stub:
                    print(f"Removing duplicate stub in profiles: {profile.parent}")
                    try:
                        # On Windows, we might need to be aggressive with permissions or just use shell
                        shutil.rmtree(profile.parent)
                        removed += 1
                    except Exception as e:
                        print(f"Failed to remove {profile.parent}: {e}")
                else:
                    print(f"KEEPING profile {profile.parent} - it has actual content.")

    print(f"Total duplicates removed: {removed}")

if __name__ == "__main__":
    main()
