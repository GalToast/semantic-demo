from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
import re

REPO_ROOT = Path(".")
MISSING_FIELDS_REPORT = REPO_ROOT / "leads" / "views" / "missing-fields.md"
CONTACT_LOG = REPO_ROOT / "outreach" / "logs" / "contact-log.md"
REPORT_PATH = REPO_ROOT / "reports" / f"fill-missing-required-fields-{date.today().isoformat()}.md"

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"\(\d{3}\)\s*\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b")

REQUIRED_FIELDS = [
    "Status",
    "Outreach status",
    "Contact path",
    "Social check",
    "Batch",
    "Batch line",
    "Source",
    "Address",
    "Phone",
    "Email",
    "Website",
    "Contact form",
    "Social media",
    "NAICS",
    "Distance (zip centroid)",
    "Decision maker",
    "Last updated",
    "Contact search",
]


@dataclass
class ContactLogIndex:
    by_email: set[str]
    by_name: set[str]


def load_contact_log() -> ContactLogIndex:
    by_email: set[str] = set()
    by_name: set[str] = set()
    lines = CONTACT_LOG.read_text(encoding="utf-8", errors="ignore").splitlines()
    for line in lines:
        if not line.startswith("|"):
            continue
        parts = [part.strip() for part in line.strip("|").split("|")]
        if len(parts) < 6 or parts[0].lower() == "date":
            continue
        lead = parts[1].strip()
        by_name.add(lead.lower())
        for email in EMAIL_RE.findall(line):
            by_email.add(email.lower())
    return ContactLogIndex(by_email=by_email, by_name=by_name)


def has_label(lines: list[str], label: str) -> bool:
    pattern = re.compile(rf"^\s*(?:[-*]\s*)?{re.escape(label)}\s*:\s*.+$", re.IGNORECASE)
    return any(pattern.match(line) for line in lines)


def find_first_email(text: str) -> str | None:
    matches = EMAIL_RE.findall(text)
    if matches:
        return matches[0]
    return None


def find_first_phone(text: str) -> str | None:
    match = PHONE_RE.search(text)
    if match:
        return match.group(0)
    return None


def infer_contact_path(text: str) -> str:
    if EMAIL_RE.search(text):
        return "email"
    if PHONE_RE.search(text):
        return "phone-only"
    if re.search(r"contact form", text, re.IGNORECASE):
        return "form"
    if re.search(r"facebook|instagram|linkedin|twitter|x.com", text, re.IGNORECASE):
        return "social"
    return "unknown"


def load_missing_field_paths() -> list[Path]:
    if not MISSING_FIELDS_REPORT.exists():
        raise SystemExit(f"Missing fields report not found: {MISSING_FIELDS_REPORT}")
    lines = MISSING_FIELDS_REPORT.read_text(encoding="utf-8", errors="ignore").splitlines()
    paths: list[Path] = []
    for line in lines:
        if "| path:" not in line:
            continue
        path = line.split("| path:", 1)[1].strip()
        if path:
            paths.append(REPO_ROOT / path)
    return paths


def ensure_fields(path: Path, contact_index: ContactLogIndex) -> list[str]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()
    if not lines:
        lines = ["# Lead"]

    header_idx = 0
    if lines[0].startswith("# "):
        header_idx = 1

    existing_text = "\n".join(lines)
    lead_name = lines[0].lstrip("# ").strip()
    lead_id_match = re.search(r"\b(\d{3,4})\b", path.as_posix())
    lead_id = lead_id_match.group(1) if lead_id_match else ""

    email = find_first_email(existing_text) or "unknown"
    phone = find_first_phone(existing_text) or "unknown"
    contact_path = infer_contact_path(existing_text)

    today = date.today().isoformat()
    status = "new"
    outreach_status = "uncontacted"
    if email != "unknown" and email.lower() in contact_index.by_email:
        outreach_status = "sent"
    elif lead_name and lead_name.lower() in contact_index.by_name:
        outreach_status = "sent"

    contact_search = "not started"
    if contact_path in {"email", "phone-only", "form", "social"}:
        contact_search = f"checked {today}"

    batch_value = "unassigned"
    batch_line_value = lead_id or "unassigned"

    additions = []
    if not has_label(lines, "Status"):
        additions.append(f"Status: {status}")
    if not has_label(lines, "Outreach status"):
        additions.append(f"Outreach status: {outreach_status}")
    if not has_label(lines, "Contact path"):
        additions.append(f"Contact path: {contact_path}")
    if not has_label(lines, "Social check"):
        additions.append("Social check: not started")
    if not has_label(lines, "Batch"):
        additions.append(f"Batch: {batch_value}")
    if not has_label(lines, "Batch line"):
        additions.append(f"Batch line: {batch_line_value}")
    if not has_label(lines, "Source"):
        additions.append("Source: unknown")
    if not has_label(lines, "Address"):
        additions.append("Address: unknown")
    if not has_label(lines, "Phone"):
        additions.append(f"Phone: {phone}")
    if not has_label(lines, "Email"):
        additions.append(f"Email: {email}")
    if not has_label(lines, "Website"):
        additions.append("Website: unknown")
    if not has_label(lines, "Contact form"):
        additions.append("Contact form: unknown")
    if not has_label(lines, "Social media"):
        additions.append("Social media: unknown")
    if not has_label(lines, "NAICS"):
        additions.append("NAICS: unknown")
    if not has_label(lines, "Distance (zip centroid)"):
        additions.append("Distance (zip centroid): unknown")
    if not has_label(lines, "Decision maker"):
        additions.append("Decision maker: unknown")
    if not has_label(lines, "Last updated"):
        additions.append(f"Last updated: {today}")
    if not has_label(lines, "Contact search"):
        additions.append(f"Contact search: {contact_search}")

    if not additions:
        return []

    insert_at = header_idx
    new_lines = lines[:insert_at] + [""] + additions + [""] + lines[insert_at:]
    path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    return additions


def main() -> None:
    contact_index = load_contact_log()
    paths = load_missing_field_paths()
    updated = []

    for path in paths:
        if not path.exists():
            continue
        additions = ensure_fields(path, contact_index)
        if additions:
            updated.append((path.as_posix(), additions))

    report_lines = [
        "# Fill Missing Required Fields",
        f"Generated: {date.today().isoformat()}",
        f"- Profiles updated: {len(updated)}",
        "",
    ]
    if updated:
        report_lines.append("## Updates")
        for path, additions in updated:
            report_lines.append(f"- {path}")
            for item in additions:
                report_lines.append(f"  - {item}")
        report_lines.append("")

    REPORT_PATH.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
    print(f"Profiles updated: {len(updated)}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
