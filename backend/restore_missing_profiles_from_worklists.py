from __future__ import annotations

import re
from datetime import date
from pathlib import Path

REPO_ROOT = Path(".")
LEADS_ROOT = REPO_ROOT / "leads"
BATCHES_ROOT = LEADS_ROOT / "batches"
PROFILES_ROOT = LEADS_ROOT / "profiles"

TODAY = date.today().isoformat()

def build_stub(name: str, lead_id: str, batch: str, address: str, source: str, naics: str, distance: str) -> str:
    lines = [
        f"# {name}",
        "",
        "Status: new",
        "Outreach status: uncontacted",
        "Contact path: unknown",
        "Social check: not started",
        f"Batch: {batch}",
        f"Batch line: {lead_id}",
        f"Source: {source}",
        f"Address: {address}",
        "Phone: unknown",
        "Email: unknown",
        "Website: unknown",
        "Contact form: unknown",
        "Social media: unknown",
        f"NAICS: {naics}",
        f"Distance (zip centroid): {distance}",
        "Decision maker: unknown",
        f"Last updated: {TODAY}",
        "Contact search: not started",
        "",
        "## Snapshot",
        "- Pending research.",
        "",
        "## Observations",
        "- Pending research.",
        "",
        "## Outreach angle",
        "- Pending research.",
        "",
        "## Next steps",
        "- Research contact methods.",
        "",
        "## Evidence",
        "- evidence/ (none yet)",
        "",
    ]
    return "\n".join(lines)

def main() -> None:
    worklist_files = sorted(BATCHES_ROOT.glob("registered-entities-batch-*-worklist.md"))
    created_count = 0
    
    for worklist in worklist_files:
        text = worklist.read_text(encoding="utf-8", errors="ignore")
        batch_name = worklist.stem.replace("-worklist", "")
        
        # Regex to parse the worklist lines
        # - [x] 2101. **DESIGNED BY KELLY THOMAS, LLC** | Source: franchise-tax | Distance (zip centroid): 8.19 mi | Address: 25505 ROSE CREEK DR, CLEVELAND, TX, 77328 | Email: not found | Phone: not found | Website: not found | NAICS: 541430 | Note: profile (leads/profiles/2100-2199/2101-designed-by-kelly-thomas-llc/profile.md)
        pattern = re.compile(
            r"^\s*-\s*\[[ xX]\]\s*(?P<id>\d+)\.\s*\**(?P<name>.+?)\**\s*\|\s*Source:\s*(?P<source>.*?)\s*\|\s*Distance.*?: (?P<dist>.*?)\s*\|\s*Address:\s*(?P<addr>.*?)\s*\|.*?NAICS:\s*(?P<naics>.*?)\s*\|.*?Note:\s*profile\s*\((?P<path>.*?)\)",
            re.MULTILINE
        )
        
        for match in pattern.finditer(text):
            data = match.groupdict()
            lead_id = data["id"]
            name = data["name"].strip("* ")
            source = data["source"].strip()
            dist = data["dist"].strip()
            addr = data["addr"].strip()
            naics = data["naics"].strip()
            profile_path = REPO_ROOT / data["path"].strip()
            
            if not profile_path.exists():
                profile_path.parent.mkdir(parents=True, exist_ok=True)
                profile_path.write_text(build_stub(name, lead_id, batch_name, addr, source, naics, dist), encoding="utf-8")
                created_count += 1
                print(f"Restored: {profile_path}")

    print(f"Total profiles restored: {created_count}")

if __name__ == "__main__":
    main()
