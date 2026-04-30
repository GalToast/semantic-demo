from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
import re

REPO_ROOT = Path(".")
CONTACT_UNKNOWN = REPO_ROOT / "leads" / "views" / "contact-unknown.md"
REPORT_PATH = REPO_ROOT / "reports" / f"backfill-contact-path-{date.today().isoformat()}.md"

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"\(\d{3}\)\s*\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b")


@dataclass
class UpdateResult:
    path: str
    email: str | None
    phone: str | None
    contact_path: str
    contact_search: str


def parse_paths() -> list[Path]:
    if not CONTACT_UNKNOWN.exists():
        raise SystemExit(f"Contact-unknown view not found: {CONTACT_UNKNOWN}")
    lines = CONTACT_UNKNOWN.read_text(encoding="utf-8", errors="ignore").splitlines()
    paths: list[Path] = []
    for line in lines:
        if "| path:" in line:
            path = line.split("| path:", 1)[1].strip()
            if path:
                paths.append(REPO_ROOT / path)
            continue
        # Fallback: parse LeadID at line start
        match = re.match(r"^(\d+)\s*\|", line)
        if not match:
            continue
        lead_id = match.group(1)
        lead_path = find_profile_by_id(lead_id)
        if lead_path:
            paths.append(lead_path)
    return sorted(set(paths))


def find_profile_by_id(lead_id: str) -> Path | None:
    pattern = re.compile(rf"^\s*#\s*{re.escape(lead_id)}\b", re.IGNORECASE)
    for root in (REPO_ROOT / "leads" / "profiles").glob("*/*/profile.md"):
        if root.parent.name.startswith(f"{lead_id}-"):
            return root
        text = root.read_text(encoding="utf-8", errors="ignore")
        if pattern.search(text):
            return root
    return None


def has_label(lines: list[str], label: str) -> bool:
    pattern = re.compile(rf"^\s*(?:[-*]\s*)?{re.escape(label)}\s*:\s*.+$", re.IGNORECASE)
    return any(pattern.match(line) for line in lines)


def replace_label(lines: list[str], label: str, value: str) -> tuple[list[str], bool]:
    pattern = re.compile(rf"^(\s*(?:[-*]\s*)?{re.escape(label)}\s*:)\s*(.+)$", re.IGNORECASE)
    updated = False
    new_lines = []
    for line in lines:
        match = pattern.match(line)
        if match:
            new_lines.append(f"{match.group(1)} {value}")
            updated = True
        else:
            new_lines.append(line)
    return new_lines, updated


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


def infer_contact_path(email: str | None, phone: str | None, text: str) -> str:
    if email:
        return "email"
    if phone:
        return "phone-only"
    if re.search(r"contact form", text, re.IGNORECASE):
        return "form"
    if re.search(r"facebook|instagram|linkedin|twitter|x.com", text, re.IGNORECASE):
        return "social"
    return "unknown"


def ensure_label(lines: list[str], label: str, value: str) -> tuple[list[str], bool]:
    if has_label(lines, label):
        return replace_label(lines, label, value)
    insert_at = 1 if lines and lines[0].startswith("# ") else 0
    new_lines = lines[:insert_at] + [f"{label}: {value}"] + lines[insert_at:]
    return new_lines, True


def main() -> None:
    paths = parse_paths()
    updated = []

    for path in paths:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        lines = text.splitlines()
        email = find_first_email(text)
        phone = find_first_phone(text)
        contact_path = infer_contact_path(email, phone, text)
        if contact_path == "unknown":
            continue

        changed = False
        if email:
            lines, changed_email = ensure_label(lines, "Email", email)
            changed = changed or changed_email
        if phone:
            lines, changed_phone = ensure_label(lines, "Phone", phone)
            changed = changed or changed_phone

        lines, changed_cp = ensure_label(lines, "Contact path", contact_path)
        changed = changed or changed_cp

        if contact_path in {"email", "phone-only", "form", "social"}:
            lines, changed_cs = ensure_label(lines, "Contact search", f"checked {date.today().isoformat()}")
            changed = changed or changed_cs

        if changed:
            path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            updated.append(UpdateResult(path=path.as_posix(), email=email, phone=phone, contact_path=contact_path, contact_search=f"checked {date.today().isoformat()}"))

    report_lines = [
        "# Backfill Contact Path",
        f"Generated: {date.today().isoformat()}",
        f"- Profiles updated: {len(updated)}",
        "",
    ]
    if updated:
        report_lines.append("## Updates")
        for item in updated:
            report_lines.append(f"- {item.path}")
            report_lines.append(f"  - Contact path: {item.contact_path}")
            if item.email:
                report_lines.append(f"  - Email: {item.email}")
            if item.phone:
                report_lines.append(f"  - Phone: {item.phone}")
        report_lines.append("")

    REPORT_PATH.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
    print(f"Profiles updated: {len(updated)}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
