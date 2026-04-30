from __future__ import annotations

from datetime import date
from pathlib import Path
import re

REPO_ROOT = Path(".")
CONTACT_UNKNOWN = REPO_ROOT / "leads" / "views" / "contact-unknown.md"
REPORT_PATH = REPO_ROOT / "reports" / f"backfill-contact-path-diagnostics-{date.today().isoformat()}.md"

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"\(\d{3}\)\s*\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b")


def parse_paths() -> list[Path]:
    if not CONTACT_UNKNOWN.exists():
        raise SystemExit(f"Contact-unknown view not found: {CONTACT_UNKNOWN}")
    lines = CONTACT_UNKNOWN.read_text(encoding="utf-8", errors="ignore").splitlines()
    paths: list[Path] = []
    for line in lines:
        if "| path:" not in line:
            continue
        path = line.split("| path:", 1)[1].strip()
        if path:
            paths.append(REPO_ROOT / path)
    return paths


def main() -> None:
    paths = parse_paths()
    total = 0
    with_email = 0
    with_phone = 0
    samples = []

    for path in paths:
        if not path.exists():
            continue
        total += 1
        text = path.read_text(encoding="utf-8", errors="ignore")
        email = EMAIL_RE.search(text)
        phone = PHONE_RE.search(text)
        if email:
            with_email += 1
        if phone:
            with_phone += 1
        if (email or phone) and len(samples) < 10:
            samples.append((path.as_posix(), email.group(0) if email else "", phone.group(0) if phone else ""))

    lines = [
        "# Backfill Contact Path Diagnostics",
        f"Generated: {date.today().isoformat()}",
        f"- Profiles scanned: {total}",
        f"- With email in text: {with_email}",
        f"- With phone in text: {with_phone}",
        "",
    ]
    if samples:
        lines.append("## Sample Hits")
        for path, email, phone in samples:
            lines.append(f"- {path}")
            if email:
                lines.append(f"  - Email: {email}")
            if phone:
                lines.append(f"  - Phone: {phone}")
        lines.append("")

    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Profiles scanned: {total}")
    print(f"With email: {with_email}")
    print(f"With phone: {with_phone}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
