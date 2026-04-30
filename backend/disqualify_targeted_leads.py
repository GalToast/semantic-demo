from __future__ import annotations

import os
import shutil
from pathlib import Path

REPO_ROOT = Path(".")
PROFILES_ROOT = REPO_ROOT / "leads" / "profiles"
DISQUALIFIED_ROOT = REPO_ROOT / "leads" / "disqualified"

def disqualify_lead(lead_id: int, reason: str):
    matches = list(PROFILES_ROOT.rglob(f"{lead_id}-*"))
    lead_dirs = [m for m in matches if m.is_dir() and m.name.startswith(f"{lead_id}-") ]
    
    if not lead_dirs:
        print(f"Lead {lead_id} not found in profiles.")
        return

    for lead_dir in lead_dirs:
        # Range folder should be the direct parent
        range_folder = lead_dir.parent.name
        if not range_folder or not range_folder[0].isdigit():
            # If we are too deep or something, skip
            continue

        dest_range_folder = DISQUALIFIED_ROOT / range_folder
        dest_range_folder.mkdir(parents=True, exist_ok=True)
        
        dest_dir = dest_range_folder / lead_dir.name
        
        profile_file = lead_dir / "profile.md"
        if profile_file.exists():
            content = profile_file.read_text(encoding="utf-8")
            content = content.replace("Status: new", "Status: disqualified")
            content = content.replace("Contact search: not started", "Contact search: not found")
            if "## Disqualification Note" not in content:
                content += "\n## Disqualification Note\n- Disqualified: " + reason + " (checked 2026-02-15).\n"
            
            dest_dir.mkdir(parents=True, exist_ok=True)
            (dest_dir / "profile.md").write_text(content, encoding="utf-8")
            
            for f in lead_dir.iterdir():
                if f.name != "profile.md" and f.is_file():
                    shutil.copy2(f, dest_dir / f.name)
                elif f.is_dir():
                    shutil.copytree(f, dest_dir / f.name, dirs_exist_ok=True)
            
            shutil.rmtree(lead_dir)
            print(f"Disqualified {lead_id} ({lead_dir.name})")

def main():
    ids_to_disqualify = [
        (2100, "No verifiable commercial presence found; registered to a commercial mailbox with no digital footprint"),
        (2105, "Multi-tenant business park address with no digital footprint or verifiable contact path"),
        (2106, "Registered to a commercial mailbox with no digital footprint or verifiable contact path"),
        (2108, "No digital footprint, website, or verifiable contact path found"),
        (2112, "Residential address with no active public business presence or contact path"),
        (2115, "Residential address with no active public business presence or contact path"),
        (2116, "Part of a group of legal shells at 10450 Mason Rd; no commercial presence"),
        (2118, "Part of Callihan/CalTex group shell cluster; no commercial presence"),
        (2119, "Part of Callihan/CalTex group shell cluster; no commercial presence"),
        (2120, "Part of Callihan/CalTex group shell cluster; no commercial presence"),
        (2121, "Part of Callihan/CalTex group shell cluster; no commercial presence"),
        (2123, "Part of Callihan/CalTex group shell cluster; no commercial presence"),
        (2130, "Mailing address only; no standalone digital presence or distinct contact path from parent ranch"),
        (2133, "No verifiable commercial presence, website, or contact path found"),
        (2134, "Private media/holding shell with no public contact path"),
        (2137, "Private shell with no public contact path"),
        (2139, "Private care/holding shell with no public contact path"),
        (2140, "No verifiable commercial presence; registered to a commercial mailbox"),
    ]
    
    for lid, reason in ids_to_disqualify:
        disqualify_lead(lid, reason)

if __name__ == "__main__":
    main()
