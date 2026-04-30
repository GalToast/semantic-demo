from pathlib import Path
import re
from datetime import date

REPO_ROOT = Path(".")
CONTACT_LOG = REPO_ROOT / "outreach" / "logs" / "contact-log.md"
MAPPING_REPORT = REPO_ROOT / "reports" / f"hostinger-contact-log-unmatched-domain-resolve-{date.today().isoformat()}.md"
REPORT_PATH = REPO_ROOT / "reports" / f"hostinger-contact-log-unmatched-drafts-resolve-{date.today().isoformat()}.md"

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")


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


def parse_draft_tables() -> dict[str, dict]:
    mapping = {}
    for path in (REPO_ROOT / "outreach" / "drafts").glob("batch-*-drafts-hostinger.md"):
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        for line in lines:
            if not line.startswith("|"):
                continue
            parts = [part.strip() for part in line.strip("|").split("|")]
            if len(parts) < 5 or parts[0].lower() == "lead id":
                continue
            lead_id, name, email = parts[0], parts[1], parts[2].lower()
            if email and email not in mapping:
                mapping[email] = {"name": name, "lead_id": lead_id, "source": path.as_posix()}
    return mapping


def parse_worklist_hit(email: str) -> tuple[str, str] | None:
    # Format A: | ID | NAME | ... Email: address
    table_pattern = re.compile(rf"\|\\s*(\\d+)\\s*\\|\\s*([^|]+)\\|.*{re.escape(email)}", re.IGNORECASE)
    for path in (REPO_ROOT / "leads" / "batches").glob("registered-entities-batch-*-worklist.md"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        for line in text.splitlines():
            if email.lower() not in line.lower():
                continue
            match = table_pattern.search(line)
            if match:
                name = (match.group(2) or "").strip()
                if not name:
                    continue
                batch = path.stem.replace("-worklist", "")
                return name, batch
            name_match = re.search(r"\*\*(.+?)\*\*", line)
            if name_match:
                name = name_match.group(1).strip()
                if not name:
                    continue
                batch = path.stem.replace("-worklist", "")
                return name, batch
    return None


def main() -> None:
    emails = parse_unmatched(MAPPING_REPORT)
    draft_map = parse_draft_tables()
    lines = CONTACT_LOG.read_text(encoding="utf-8", errors="ignore").splitlines()
    updated = 0
    resolved = []
    still_unmatched = []

    for email in emails:
        mapped = draft_map.get(email)
        if not mapped:
            worklist_hit = parse_worklist_hit(email)
            if worklist_hit:
                mapped = {"name": worklist_hit[0], "lead_id": "", "source": "worklist", "batch": worklist_hit[1]}
        if not mapped:
            still_unmatched.append(email)
            continue

        for i, line in enumerate(lines):
            if not line.startswith("|"):
                continue
            parts = [part.strip() for part in line.strip("|").split("|")]
            if len(parts) < 6 or parts[0].lower() == "date":
                continue
            lead = parts[1].strip().lower()
            batch = parts[2].strip()
            if lead == email:
                parts[1] = mapped["name"]
                if not batch or batch.lower() in {"unknown", "n/a"}:
                    if "batch" in mapped:
                        parts[2] = mapped["batch"]
                lines[i] = "| " + " | ".join(parts) + " |"
                updated += 1
                resolved.append((email, mapped["name"], mapped.get("source", "")))

    CONTACT_LOG.write_text("\n".join(lines) + "\n", encoding="utf-8")

    report = []
    report.append("# Hostinger Contact Log Unmatched Draft/Worklist Resolution")
    report.append(f"Generated: {date.today().isoformat()}")
    report.append(f"- Mapping source: {MAPPING_REPORT.as_posix()}")
    report.append(f"- Rows updated: {updated}")
    report.append("")
    if resolved:
        report.append("## Resolved")
        for email, name, source in resolved:
            report.append(f"- {email} -> {name}")
            if source:
                report.append(f"  - Source: {source}")
        report.append("")
    if still_unmatched:
        report.append("## Still Unmatched")
        for email in sorted(set(still_unmatched)):
            report.append(f"- {email}")
        report.append("")

    REPORT_PATH.write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"Rows updated: {updated}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
