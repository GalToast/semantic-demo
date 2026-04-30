from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(".")
PROFILES_ROOT = REPO_ROOT / "leads" / "profiles"
DISQUALIFIED_ROOT = REPO_ROOT / "leads" / "disqualified"

def main():
    dq_ids = {}
    for profile in DISQUALIFIED_ROOT.rglob("profile.md"):
        folder_name = profile.parent.name
        if "-" in folder_name:
            lead_id = folder_name.split("-")[0]
            if lead_id.isdigit():
                dq_ids[lead_id] = profile.parent

    paths_to_delete = []
    for profile in PROFILES_ROOT.rglob("profile.md"):
        folder_name = profile.parent.name
        if "-" in folder_name:
            lead_id = folder_name.split("-")[0]
            if lead_id in dq_ids:
                p_content = profile.read_text(encoding="utf-8")
                is_stub = "Pending research" in p_content or "Contact search: not started" in p_content
                if is_stub:
                    paths_to_delete.append(profile.parent.as_posix())

    Path("tmp_delete_list.txt").write_text("
".join(paths_to_delete), encoding="utf-8")
    print(f"Identified {len(paths_to_delete)} paths to delete.")

if __name__ == "__main__":
    main()
