from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
import re

REPO_ROOT = Path(".")
CONTACT_LOG = REPO_ROOT / "outreach" / "logs" / "contact-log.md"
REPORT_PATH = REPO_ROOT / "reports" / f"contact-log-name-normalization-{date.today().isoformat()}.md"
PROFILE_ROOTS = [REPO_ROOT / "leads" / "profiles", REPO_ROOT / "leads" / "disqualified"]

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
INTERNAL_EMAILS = {"fredjaur33guy@gmail.com", "fredjaur33guy@hotmail.com"}


@dataclass
class ProfileRecord:
    name: str
    slug: str
    email: str | None
    batch: str | None


def load_profiles() -> tuple[dict[str, ProfileRecord], dict[str, ProfileRecord]]:
    by_slug: dict[str, ProfileRecord] = {}
    by_email: dict[str, ProfileRecord] = {}

    for root in PROFILE_ROOTS:
        if not root.exists():
            continue
        for path in root.glob("*/*/profile.md"):
            slug = path.parent.name
            text = path.read_text(encoding="utf-8", errors="ignore")
            lines = text.splitlines()
            name = None
            email = None
            batch = None
            for line in lines:
                if line.startswith("# "):
                    name = line[2:].strip()
                    break
            for line in lines:
                if line.lower().startswith("email:"):
                    email = line.split(":", 1)[1].strip()
                elif line.lower().startswith("batch:"):
                    batch = line.split(":", 1)[1].strip()
            if not name:
                continue
            record = ProfileRecord(name=name, slug=slug, email=email, batch=batch)
            by_slug[slug.lower()] = record
            if email and email.lower() not in {"unknown", "not found", "n/a", "na", ""}:
                by_email[email.lower()] = record

    return by_slug, by_email


def main() -> None:
    by_slug, by_email = load_profiles()
    lines = CONTACT_LOG.read_text(encoding="utf-8", errors="ignore").splitlines()

    updated = []
    for i, line in enumerate(lines):
        if not line.startswith("|"):
            continue
        parts = [part.strip() for part in line.strip("|").split("|")]
        if len(parts) < 6 or parts[0].lower() == "date":
            continue

        lead = parts[1].strip()
        batch = parts[2].strip()
        lead_lower = lead.lower()
        updated_row = False

        if lead_lower in INTERNAL_EMAILS:
            parts[1] = "Fred (internal test)"
            if not batch or batch.lower() in {"unknown", "n/a"}:
                parts[2] = "internal"
            updated_row = True
        elif "@" in lead_lower and lead_lower in by_email:
            record = by_email[lead_lower]
            parts[1] = record.name
            if (not batch or batch.lower() in {"unknown", "n/a"}) and record.batch:
                parts[2] = record.batch
            updated_row = True
        elif lead_lower in by_slug:
            record = by_slug[lead_lower]
            parts[1] = record.name
            if (not batch or batch.lower() in {"unknown", "n/a"}) and record.batch:
                parts[2] = record.batch
            updated_row = True

        if updated_row:
            lines[i] = "| " + " | ".join(parts) + " |"
            updated.append((lead, parts[1]))

    CONTACT_LOG.write_text("\n".join(lines) + "\n", encoding="utf-8")

    report = [
        "# Contact Log Lead Name Normalization",
        f"Generated: {date.today().isoformat()}",
        f"- Rows updated: {len(updated)}",
        "",
    ]
    if updated:
        report.append("## Updated Lead Names")
        for before, after in updated:
            report.append(f"- {before} -> {after}")
        report.append("")

    REPORT_PATH.write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"Rows updated: {len(updated)}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
