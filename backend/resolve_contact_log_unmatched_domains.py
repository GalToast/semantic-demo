from pathlib import Path
import re
from datetime import date

REPO_ROOT = Path(".")
CONTACT_LOG = REPO_ROOT / "outreach" / "logs" / "contact-log.md"
MAPPING_REPORT = REPO_ROOT / "reports" / f"hostinger-unmatched-email-map-{date.today().isoformat()}.md"
REPORT_PATH = REPO_ROOT / "reports" / f"hostinger-contact-log-unmatched-domain-resolve-{date.today().isoformat()}.md"

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")


def parse_unmatched(path: Path) -> list[str]:
    if not path.exists():
        raise SystemExit(f"Mapping report not found: {path}")
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


def normalize_domain(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"^https?://", "", value)
    value = re.sub(r"^www\\.", "", value)
    value = value.split("/")[0]
    return value


def load_profiles() -> list[dict]:
    profiles = []
    for root in (REPO_ROOT / "leads" / "profiles", REPO_ROOT / "leads" / "disqualified"):
        if not root.exists():
            continue
        for path in root.rglob("profile.md"):
            text = path.read_text(encoding="utf-8", errors="ignore").splitlines()
            name = path.parent.name
            website = ""
            batch = ""
            for line in text:
                if line.startswith("# "):
                    name = line[2:].strip()
                    break
            for line in text:
                if line.startswith("Website:"):
                    website = line.split(":", 1)[1].strip()
                elif line.startswith("Batch:"):
                    batch = line.split(":", 1)[1].strip()
                if line.startswith("## "):
                    break
            profiles.append(
                {
                    "name": name,
                    "website": website,
                    "batch": batch,
                    "path": path.as_posix(),
                }
            )
    return profiles


def main() -> None:
    emails = parse_unmatched(MAPPING_REPORT)
    profiles = load_profiles()
    domain_map = {}
    for profile in profiles:
        if not profile["website"]:
            continue
        domain = normalize_domain(profile["website"])
        if not domain:
            continue
        domain_map.setdefault(domain, []).append(profile)

    lines = CONTACT_LOG.read_text(encoding="utf-8", errors="ignore").splitlines()
    updated = 0
    resolved = []
    ambiguous = {}
    still_unmatched = []

    for email in emails:
        domain = email.split("@")[-1]
        candidates = domain_map.get(domain, [])
        if len(candidates) == 1:
            profile = candidates[0]
            # Update any contact-log rows with lead == email
            for i, line in enumerate(lines):
                if not line.startswith("|"):
                    continue
                parts = [part.strip() for part in line.strip("|").split("|")]
                if len(parts) < 6 or parts[0].lower() == "date":
                    continue
                lead = parts[1].strip().lower()
                batch = parts[2].strip()
                if lead == email:
                    parts[1] = profile["name"]
                    if not batch or batch.lower() in {"unknown", "n/a"}:
                        parts[2] = profile["batch"] or batch
                    lines[i] = "| " + " | ".join(parts) + " |"
                    updated += 1
                    resolved.append((email, profile["name"], profile["path"]))
        elif len(candidates) > 1:
            ambiguous[email] = candidates
        else:
            still_unmatched.append(email)

    CONTACT_LOG.write_text("\n".join(lines) + "\n", encoding="utf-8")

    report = []
    report.append("# Hostinger Contact Log Unmatched Domain Resolution")
    report.append(f"Generated: {date.today().isoformat()}")
    report.append(f"- Mapping source: {MAPPING_REPORT.as_posix()}")
    report.append(f"- Rows updated: {updated}")
    report.append("")
    if resolved:
        report.append("## Resolved")
        for email, name, path in resolved:
            report.append(f"- {email} -> {name}")
            report.append(f"  - Profile: {path}")
        report.append("")
    if ambiguous:
        report.append("## Ambiguous (Multiple Domain Matches)")
        for email, candidates in ambiguous.items():
            report.append(f"- {email}")
            for candidate in candidates:
                report.append(f"  - {candidate['path']}")
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
