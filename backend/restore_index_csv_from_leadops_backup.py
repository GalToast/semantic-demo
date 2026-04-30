from __future__ import annotations

import argparse
import csv
import json
import re
import sqlite3
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
LEADS_ROOT = REPO_ROOT / "leads"
DEFAULT_DB = REPO_ROOT / "crm.pre-leadops-20260323-165430.sqlite.bak"
DEFAULT_OUTPUT = REPO_ROOT / "leads" / "index.csv"
LEAD_ID_PREFIX_RE = re.compile(r"^(\d+)[-_]")

FIELDNAMES = [
    "LeadID",
    "Name",
    "Batch",
    "Status",
    "OutreachStatus",
    "ContactPath",
    "ContactSearch",
    "Email",
    "Phone",
    "Website",
    "ContactForm",
    "SocialMedia",
    "WebsiteStatus",
    "SocialChecked",
    "Source",
    "Disqualified",
    "Updated",
    "ProfilePath",
]


def norm(value: object) -> str:
    return str(value or "").strip()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Restore leads/index.csv from a leadops SQLite backup."
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB,
        help="Path to the SQLite database containing leadops_leads.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Output CSV path to write.",
    )
    return parser.parse_args()


def is_iso_date(value: str) -> bool:
    return bool(re.match(r"^20\d{2}-\d{2}-\d{2}$", norm(value)))


def is_yes_no(value: str) -> bool:
    return norm(value).lower() in {"yes", "no"}


def looks_like_profile_path(value: str) -> bool:
    return norm(value).endswith("profile.md")


def build_profile_file_map() -> dict[int, Path]:
    mapping: dict[int, Path] = {}
    for root in (LEADS_ROOT / "profiles", LEADS_ROOT / "disqualified"):
        if not root.exists():
            continue
        for path in root.rglob("profile.md"):
            match = LEAD_ID_PREFIX_RE.match(path.parent.name)
            if not match:
                continue
            lead_id = int(match.group(1))
            if lead_id not in mapping:
                mapping[lead_id] = path
    return mapping


def parse_profile_frontmatter(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if line.startswith("## "):
            break
        if ":" not in line or line.startswith("|"):
            continue
        key, value = line.split(":", 1)
        values[key.strip()] = value.strip()
    return values


def row_needs_repair(restored: dict[str, str]) -> bool:
    return (
        (restored["ProfilePath"] and not looks_like_profile_path(restored["ProfilePath"]))
        or (restored["Updated"] and not is_iso_date(restored["Updated"]))
        or is_yes_no(restored["Source"])
        or restored["Source"].lower().startswith("checked ")
    )


def normalize_row(
    raw_index_json: str,
    row: sqlite3.Row,
    profile_file_map: dict[int, Path],
) -> dict[str, str]:
    payload = json.loads(raw_index_json)
    restored = {field: norm(payload.get(field, "")) for field in FIELDNAMES}

    if not restored["LeadID"]:
        restored["LeadID"] = str(row["lead_id"])
    if not restored["Name"]:
        restored["Name"] = norm(row["name"])
    if not restored["Batch"]:
        restored["Batch"] = norm(row["batch"])
    if not restored["Status"]:
        restored["Status"] = norm(row["status"])
    if not restored["OutreachStatus"]:
        restored["OutreachStatus"] = norm(row["outreach_status"])
    if not restored["ContactPath"]:
        restored["ContactPath"] = norm(row["contact_path"])
    if not restored["ContactSearch"]:
        restored["ContactSearch"] = norm(row["contact_search"])
    if not restored["Email"]:
        restored["Email"] = norm(row["email"])
    if not restored["Phone"]:
        restored["Phone"] = norm(row["phone"])
    if not restored["Website"]:
        restored["Website"] = norm(row["website"])
    if not restored["ContactForm"]:
        restored["ContactForm"] = norm(row["contact_form"])
    if not restored["SocialMedia"]:
        restored["SocialMedia"] = norm(row["social_media"])
    if not restored["WebsiteStatus"]:
        restored["WebsiteStatus"] = norm(row["website_status"])
    if not restored["SocialChecked"]:
        restored["SocialChecked"] = norm(row["social_checked"])
    if not restored["Source"]:
        restored["Source"] = norm(row["source"])
    if not restored["Updated"]:
        restored["Updated"] = norm(row["updated"])
    if not restored["ProfilePath"]:
        restored["ProfilePath"] = norm(row["profile_path"])

    restored["Disqualified"] = "yes" if row["disqualified"] else "no"

    if row_needs_repair(restored):
        lead_id = int(row["lead_id"])
        profile_file = profile_file_map.get(lead_id)
        profile_kv = parse_profile_frontmatter(profile_file) if profile_file else {}

        if profile_file:
            restored["ProfilePath"] = str(profile_file.relative_to(REPO_ROOT)).replace("\\", "/")

        profile_source = norm(profile_kv.get("Source"))
        if profile_source:
            restored["Source"] = profile_source

        profile_updated = norm(profile_kv.get("Last updated"))
        if is_iso_date(profile_updated):
            restored["Updated"] = profile_updated

        if not looks_like_profile_path(restored["ProfilePath"]) and profile_file:
            restored["ProfilePath"] = str(profile_file.relative_to(REPO_ROOT)).replace("\\", "/")

        if not is_iso_date(restored["Updated"]):
            for candidate in (
                norm(row["updated"]),
                norm(payload.get("ProfilePath")),
                norm(payload.get("Updated")),
            ):
                if is_iso_date(candidate):
                    restored["Updated"] = candidate
                    break

        if is_yes_no(restored["Source"]) or restored["Source"].lower().startswith("checked "):
            for candidate in (
                profile_source,
                norm(payload.get("Disqualified")),
                norm(row["source"]),
            ):
                if candidate and not is_yes_no(candidate) and not candidate.lower().startswith("checked "):
                    restored["Source"] = candidate
                    break

    return restored


def main() -> None:
    args = parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    con = sqlite3.connect(args.db)
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    rows = cur.execute(
        """
        SELECT
            lead_id,
            name,
            batch,
            status,
            outreach_status,
            contact_path,
            contact_search,
            email,
            phone,
            website,
            contact_form,
            social_media,
            website_status,
            social_checked,
            source,
            disqualified,
            updated,
            profile_path,
            raw_index_json
        FROM leadops_leads
        ORDER BY lead_id
        """
    ).fetchall()
    profile_file_map = build_profile_file_map()

    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        for row in rows:
            writer.writerow(normalize_row(row["raw_index_json"], row, profile_file_map))

    con.close()
    print(f"Restored {len(rows)} rows to {args.output}")


if __name__ == "__main__":
    main()
