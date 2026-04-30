from __future__ import annotations

import csv
import re
import shutil
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
INDEX_CSV = REPO_ROOT / "leads" / "index.csv"

TARGET_IDS = {
    3427, 3438, 3445, 3452, 3455, 3467, 3474, 3484, 3486, 3489, 3498,
    3517, 3526, 3530, 3537, 3540, 3542, 3548, 3555, 3568, 3584, 3596,
}

HEADER_MAP = {
    "Status": "Status",
    "Outreach status": "OutreachStatus",
    "OutreachStatus": "OutreachStatus",
    "Contact path": "ContactPath",
    "ContactPath": "ContactPath",
    "Contact search": "ContactSearch",
    "ContactSearch": "ContactSearch",
    "Batch": "Batch",
    "Source": "Source",
    "Phone": "Phone",
    "Email": "Email",
    "Website": "Website",
    "Contact form": "ContactForm",
    "ContactForm": "ContactForm",
    "Social media": "SocialMedia",
    "SocialMedia": "SocialMedia",
    "Social check": "SocialChecked",
    "SocialCheck": "SocialChecked",
    "Last updated": "Updated",
    "LastUpdated": "Updated",
}

BLANK_IF_NULLISH_FIELDS = {"Phone", "Email", "Website", "ContactForm", "SocialMedia"}
NULLISH = {"", "unknown", "not found"}


def normalize_profile_value(field: str, value: str) -> str:
    clean = (value or "").strip()
    if field in BLANK_IF_NULLISH_FIELDS and clean.lower() in NULLISH:
        return ""
    return clean


def parse_profile(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    title = ""
    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.lstrip("\ufeff").strip()
        if not line:
            continue
        if not title and line.startswith("# "):
            title = line[2:].strip()
            continue
        if line.startswith("## "):
            continue
        key = ""
        value = ""
        if line.startswith("- **") and ":**" in line:
            match = re.match(r"^- \*\*(.+?)\:\*\*\s*(.*)$", line)
            if match:
                key, value = match.group(1).strip(), match.group(2).strip()
        elif line.startswith("**") and ":**" in line:
            match = re.match(r"^\*\*(.+?)\:\*\*\s*(.*)$", line)
            if match:
                key, value = match.group(1).strip(), match.group(2).strip()
        elif ":" in line:
            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip()
        else:
            continue
        if key in HEADER_MAP:
            target_field = HEADER_MAP[key]
            data[target_field] = normalize_profile_value(target_field, value)
    if title:
        if title.lower().startswith("lead profile:"):
            title = title.split(":", 1)[1].strip()
        data["Name"] = title
    return data


def is_shifted_row(row: dict[str, str]) -> bool:
    name = (row.get("Name") or "").strip().lower()
    batch = (row.get("Batch") or "").strip()
    status = (row.get("Status") or "").strip()
    outreach = (row.get("OutreachStatus") or "").strip()
    contact_path = (row.get("ContactPath") or "").strip()
    contact_search = (row.get("ContactSearch") or "").strip()
    email = (row.get("Email") or "").strip()
    phone = (row.get("Phone") or "").strip()
    website = (row.get("Website") or "").strip()
    contact_form = (row.get("ContactForm") or "").strip()
    return (
        name.startswith("registered-entities-batch-")
        or batch == "$18"
        or status == "$19"
        or outreach == "2026-03-24"
        or (email and phone and email == phone)
        or (website and contact_form and website == contact_form)
        or (outreach and contact_path and outreach == contact_path and contact_search == "email")
    )


def main() -> None:
    if not INDEX_CSV.exists():
        raise SystemExit(f"Missing index: {INDEX_CSV}")

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = INDEX_CSV.with_name(f"index.pre-shift-repair-{timestamp}.csv.bak")
    shutil.copy2(INDEX_CSV, backup)

    with INDEX_CSV.open("r", encoding="utf-8", errors="ignore", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fieldnames = reader.fieldnames or []

    repaired = 0
    for row in rows:
        lead_id_raw = (row.get("LeadID") or "").strip()
        if not lead_id_raw.isdigit():
            continue
        lead_id = int(lead_id_raw)
        if lead_id not in TARGET_IDS:
            continue

        profile_rel = (row.get("ProfilePath") or "").strip()
        profile_path = REPO_ROOT / profile_rel
        if not profile_path.exists():
            continue

        profile = parse_profile(profile_path)
        if profile.get("Name"):
            row["Name"] = profile["Name"]
        for key in (
            "Batch", "Status", "OutreachStatus", "ContactPath", "ContactSearch",
            "Phone", "Email", "Website", "ContactForm", "SocialMedia",
            "SocialChecked", "Source", "Updated",
        ):
            if key in profile:
                row[key] = profile[key]

        # Some compact/diamond profile styles only expose email + website.
        # If the source row was shifted, derive sane contact fields instead of
        # keeping echoed email/website values in the wrong columns.
        if profile.get("Email") and not profile.get("Phone"):
            if (row.get("Phone") or "").strip() == profile["Email"]:
                row["Phone"] = ""
        if profile.get("Website") and not profile.get("ContactForm"):
            if (row.get("ContactForm") or "").strip() == profile["Website"]:
                row["ContactForm"] = ""
        if profile.get("Email") and not profile.get("ContactPath"):
            row["ContactPath"] = "email"
        if profile.get("Email") and not profile.get("ContactSearch"):
            updated = (row.get("Updated") or "").strip()
            row["ContactSearch"] = f"checked {updated}" if updated else "checked"

        # Keep ProfilePath as-is because it points to the actual existing file.
        # Recompute Disqualified from the repaired status.
        row["Disqualified"] = "yes" if (row.get("Status") or "").strip().lower() == "disqualified" else "no"
        repaired += 1

    with INDEX_CSV.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print({
        "backup": str(backup),
        "repaired_rows": repaired,
        "target_ids": len(TARGET_IDS),
    })


if __name__ == "__main__":
    main()
