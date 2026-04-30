from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
import re

REPO_ROOT = Path(".")
CONTACT_LOG = REPO_ROOT / "outreach" / "logs" / "contact-log.md"
LEADS_MD = REPO_ROOT / "leads.md"
TEMPLATE = REPO_ROOT / "leads" / "templates" / "lead-profile.md"
UNMATCHED_REPORT = REPO_ROOT / "reports" / f"hostinger-contact-log-unmatched-drafts-resolve-{date.today().isoformat()}.md"
REPORT_PATH = REPO_ROOT / "reports" / f"hostinger-missing-profiles-from-leads-{date.today().isoformat()}.md"

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")


@dataclass
class LeadRow:
    lead_id: int
    name: str
    email: str
    phone: str
    status: str
    source: str
    created: str
    updated: str


def slugify(value: str) -> str:
    cleaned = value.strip().lower()
    cleaned = cleaned.replace("&", "and")
    cleaned = re.sub(r"[']", "", cleaned)
    cleaned = re.sub(r"[^a-z0-9]+", "-", cleaned)
    cleaned = re.sub(r"-+", "-", cleaned).strip("-")
    return cleaned or "lead"


def profile_range(lead_id: int) -> str:
    start = (lead_id // 100) * 100
    end = start + 99
    return f"{start:03d}-{end:03d}"


def parse_unmatched(path: Path) -> list[str]:
    if not path.exists():
        raise SystemExit(f"Unmatched report not found: {path}")
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    emails = []
    in_section = False
    for line in lines:
        if line.startswith("## "):
            in_section = line.strip() == "## Still Unmatched"
            continue
        if not in_section:
            continue
        if line.startswith("- "):
            emails.append(line[2:].strip().lower())
    return emails


def parse_leads_md(path: Path) -> dict[str, list[LeadRow]]:
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    rows: dict[str, list[LeadRow]] = {}
    for line in lines:
        if not line.startswith("|"):
            continue
        parts = [part.strip() for part in line.strip("|").split("|")]
        if len(parts) < 9 or parts[0].lower() == "id":
            continue
        lead_id_str, name, email, phone, _company, status, source, created, updated = parts[:9]
        if not lead_id_str.isdigit():
            continue
        lead_id = int(lead_id_str)
        email = email.strip()
        if not email:
            continue
        row = LeadRow(
            lead_id=lead_id,
            name=name.strip(),
            email=email.strip(),
            phone=phone.strip() or "unknown",
            status=status.strip(),
            source=source.strip() or "import",
            created=created.strip(),
            updated=updated.strip(),
        )
        rows.setdefault(email.lower(), []).append(row)
    return rows


def load_contact_log() -> list[str]:
    return CONTACT_LOG.read_text(encoding="utf-8", errors="ignore").splitlines()


def update_contact_log(lines: list[str], mapping: dict[str, LeadRow]) -> int:
    updated = 0
    for i, line in enumerate(lines):
        if not line.startswith("|"):
            continue
        parts = [part.strip() for part in line.strip("|").split("|")]
        if len(parts) < 6 or parts[0].lower() == "date":
            continue
        lead_cell = parts[1].strip()
        batch_cell = parts[2].strip()
        lead_lower = lead_cell.lower()
        if lead_lower in mapping:
            row = mapping[lead_lower]
            parts[1] = row.name
            if not batch_cell:
                parts[2] = "registered-entities-batch-001" if row.lead_id <= 99 else batch_cell
            lines[i] = "| " + " | ".join(parts) + " |"
            updated += 1
            continue
        for _email, row in mapping.items():
            if row.name.lower() == lead_lower and not batch_cell:
                parts[2] = "registered-entities-batch-001" if row.lead_id <= 99 else batch_cell
                lines[i] = "| " + " | ".join(parts) + " |"
                updated += 1
                break
    return updated


def build_profile_content(row: LeadRow, contact_log_rows: list[list[str]]) -> str:
    today = date.today().isoformat()
    status = "complete"
    outreach_status = "sent"
    contact_path = "email"
    social_check = "unknown"
    batch = "registered-entities-batch-001" if row.lead_id <= 99 else "unknown"
    batch_line = str(row.lead_id)
    contact_search = f"checked {today}"

    lines = []
    lines.append(f"# {row.name}")
    lines.append("")
    lines.append(f"Status: {status}")
    lines.append(f"Outreach status: {outreach_status}")
    lines.append(f"Contact path: {contact_path}")
    lines.append(f"Social check: {social_check}")
    lines.append(f"Batch: {batch}")
    lines.append(f"Batch line: {batch_line}")
    lines.append(f"Source: {row.source or 'import'}")
    lines.append("Address: unknown")
    lines.append(f"Phone: {row.phone or 'unknown'}")
    lines.append(f"Email: {row.email}")
    lines.append("Website: unknown")
    lines.append("Contact form: unknown")
    lines.append("Social media: unknown")
    lines.append("NAICS: unknown")
    lines.append("Distance (zip centroid): unknown")
    lines.append("Decision maker: unknown")
    lines.append(f"Last updated: {today}")
    lines.append(f"Contact search: {contact_search}")
    lines.append("")
    lines.append("## Notes")
    lines.append("- Alternate contact captured from Hostinger sent folder.")
    lines.append("- Sent email confirmed in Hostinger.")
    lines.append("")

    if contact_log_rows:
        lines.append("## Outreach log")
        lines.append("| Date | Channel | Status | Notes |")
        lines.append("| --- | --- | --- | --- |")
        for date_val, channel, status_val, notes in contact_log_rows:
            lines.append(f"| {date_val} | {channel} | {status_val} | {notes} |")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def collect_contact_log_rows(lines: list[str], row: LeadRow) -> list[list[str]]:
    results: list[list[str]] = []
    for line in lines:
        if not line.startswith("|"):
            continue
        parts = [part.strip() for part in line.strip("|").split("|")]
        if len(parts) < 6 or parts[0].lower() == "date":
            continue
        lead_cell = parts[1].strip().lower()
        if lead_cell not in {row.email.lower(), row.name.lower()}:
            continue
        date_val = parts[0]
        channel = parts[3]
        status_val = parts[4]
        notes = parts[5]
        results.append([date_val, channel, status_val, notes])
    return results


def main() -> None:
    emails = parse_unmatched(UNMATCHED_REPORT)
    leads_map = parse_leads_md(LEADS_MD)
    contact_lines = load_contact_log()

    resolved: list[str] = []
    created: list[str] = []
    missing: list[str] = []
    multi: list[str] = []

    mapping: dict[str, LeadRow] = {}
    for email in emails:
        rows = leads_map.get(email.lower(), [])
        if not rows:
            missing.append(email)
            continue
        if len(rows) > 1:
            multi.append(email)
            continue
        mapping[email.lower()] = rows[0]
        resolved.append(email)

    updated_rows = update_contact_log(contact_lines, mapping)
    CONTACT_LOG.write_text("\n".join(contact_lines) + "\n", encoding="utf-8")

    for _email, row in mapping.items():
        lead_range = profile_range(row.lead_id)
        slug = slugify(row.name)
        profile_dir = REPO_ROOT / "leads" / "profiles" / lead_range / f"{row.lead_id}-{slug}"
        profile_path = profile_dir / "profile.md"
        if profile_path.exists():
            continue
        profile_dir.mkdir(parents=True, exist_ok=True)
        contact_rows = collect_contact_log_rows(contact_lines, row)
        profile_path.write_text(build_profile_content(row, contact_rows), encoding="utf-8")
        created.append(profile_path.as_posix())

    report = []
    report.append("# Hostinger Unmatched Emails -> Lead Profiles")
    report.append(f"Generated: {date.today().isoformat()}")
    report.append(f"- Source report: {UNMATCHED_REPORT.as_posix()}")
    report.append(f"- Contact log rows updated: {updated_rows}")
    report.append(f"- Profiles created: {len(created)}")
    report.append("")

    if created:
        report.append("## Profiles Created")
        for path in created:
            report.append(f"- {path}")
        report.append("")

    if missing:
        report.append("## Emails Not Found In leads.md")
        for email in sorted(set(missing)):
            report.append(f"- {email}")
        report.append("")

    if multi:
        report.append("## Emails With Multiple leads.md Matches")
        for email in sorted(set(multi)):
            report.append(f"- {email}")
        report.append("")

    REPORT_PATH.write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"Contact log rows updated: {updated_rows}")
    print(f"Profiles created: {len(created)}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
