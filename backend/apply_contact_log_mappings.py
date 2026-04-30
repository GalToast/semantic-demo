from pathlib import Path
import re
from datetime import date

REPO_ROOT = Path(".")
CONTACT_LOG = REPO_ROOT / "outreach" / "logs" / "contact-log.md"
MAPPING_REPORT = REPO_ROOT / "reports" / f"hostinger-unmatched-email-map-{date.today().isoformat()}.md"
REPORT_PATH = REPO_ROOT / "reports" / f"hostinger-contact-log-mapped-{date.today().isoformat()}.md"


def parse_single_mappings(path: Path) -> dict[str, str]:
    if not path.exists():
        raise SystemExit(f"Mapping report not found: {path}")
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    mapping = {}
    in_single = False
    current_email = None
    for line in lines:
        if line.startswith("## "):
            in_single = line.strip() == "## Mapped (Single)"
            current_email = None
            continue
        if not in_single:
            continue
        if line.startswith("- "):
            current_email = line[2:].strip().lower()
            continue
        if current_email and line.startswith("  - "):
            mapping[current_email] = line[4:].strip()
            current_email = None
    return mapping


def load_profile_info(path: Path) -> tuple[str, str]:
    text = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    name = path.parent.name
    batch = ""
    for line in text:
        if line.startswith("# "):
            name = line[2:].strip()
            break
    for line in text:
        if line.startswith("Batch:"):
            batch = line.split(":", 1)[1].strip()
            break
        if line.startswith("## "):
            break
    return name, batch


def main() -> None:
    mapping = parse_single_mappings(MAPPING_REPORT)
    if not CONTACT_LOG.exists():
        raise SystemExit("contact-log.md not found.")

    lines = CONTACT_LOG.read_text(encoding="utf-8", errors="ignore").splitlines()
    updated = 0
    changes = []

    for i, line in enumerate(lines):
        if not line.startswith("|"):
            continue
        parts = [part.strip() for part in line.strip("|").split("|")]
        if len(parts) < 6 or parts[0].lower() == "date":
            continue
        date_val, lead, batch, channel, status, notes = parts[:6]
        lead_key = lead.strip().lower()
        if lead_key in mapping:
            profile_path = Path(mapping[lead_key])
            if not profile_path.exists():
                continue
            name, profile_batch = load_profile_info(profile_path)
            new_lead = name
            new_batch = batch
            if not new_batch or new_batch.lower() in {"unknown", "n/a"}:
                new_batch = profile_batch or batch

            if new_lead != lead or new_batch != batch:
                parts[1] = new_lead
                parts[2] = new_batch
                lines[i] = "| " + " | ".join(parts) + " |"
                updated += 1
                changes.append((lead, new_lead, new_batch, profile_path.as_posix()))

    CONTACT_LOG.write_text("\n".join(lines) + "\n", encoding="utf-8")

    report = []
    report.append("# Hostinger Contact Log Mapping (Single Matches)")
    report.append(f"Generated: {date.today().isoformat()}")
    report.append(f"- Mapping source: {MAPPING_REPORT.as_posix()}")
    report.append(f"- Rows updated: {updated}")
    report.append("")
    if changes:
        report.append("## Updates")
        for old_lead, new_lead, new_batch, path in changes:
            report.append(f"- {old_lead} -> {new_lead}")
            report.append(f"  - Batch: {new_batch}")
            report.append(f"  - Profile: {path}")
        report.append("")

    REPORT_PATH.write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"Rows updated: {updated}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
