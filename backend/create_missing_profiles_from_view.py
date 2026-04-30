from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
import re

REPO_ROOT = Path(".")
MISSING_PROFILES_REPORT = REPO_ROOT / "leads" / "views" / "missing-profiles.md"
REPORT_PATH = REPO_ROOT / "reports" / f"create-missing-profiles-{date.today().isoformat()}.md"

SUFFIX_MAP = {
    "llc": "LLC",
    "inc": "Inc.",
    "co": "Co.",
    "lp": "LP",
    "pllc": "PLLC",
    "pc": "PC",
    "ltd": "Ltd.",
    "llp": "LLP",
    "dba": "DBA",
}


@dataclass
class ProfileStub:
    path: Path
    name: str
    lead_id: str | None


def title_from_slug(slug: str) -> str:
    cleaned = re.sub(r"^\d+-", "", slug)
    cleaned = re.sub(r"-\d+$", "", cleaned)
    parts = [p for p in cleaned.split("-") if p]
    words = []
    for part in parts:
        if part.isdigit():
            words.append(part)
            continue
        if part.lower() in SUFFIX_MAP:
            words.append(SUFFIX_MAP[part.lower()])
            continue
        words.append(part.capitalize())
    return " ".join(words) if words else slug


def parse_missing_profiles() -> list[ProfileStub]:
    if not MISSING_PROFILES_REPORT.exists():
        raise SystemExit(f"Missing profiles report not found: {MISSING_PROFILES_REPORT}")
    lines = MISSING_PROFILES_REPORT.read_text(encoding="utf-8", errors="ignore").splitlines()
    stubs: list[ProfileStub] = []
    for line in lines:
        if not line.startswith("leads/"):
            continue
        path = REPO_ROOT / line.strip()
        slug = path.name
        lead_id = None
        match = re.search(r"\b(\d{3,4})\b", slug)
        if match:
            lead_id = match.group(1)
        name = title_from_slug(slug)
        stubs.append(ProfileStub(path=path, name=name, lead_id=lead_id))
    return stubs


def build_stub(stub: ProfileStub) -> str:
    today = date.today().isoformat()
    batch_line = stub.lead_id or "unassigned"
    lines = [
        f"# {stub.name}",
        "",
        "Status: new",
        "Outreach status: uncontacted",
        "Contact path: unknown",
        "Social check: not started",
        "Batch: unassigned",
        f"Batch line: {batch_line}",
        "Source: unknown",
        "Address: unknown",
        "Phone: unknown",
        "Email: unknown",
        "Website: unknown",
        "Contact form: unknown",
        "Social media: unknown",
        "NAICS: unknown",
        "Distance (zip centroid): unknown",
        "Decision maker: unknown",
        f"Last updated: {today}",
        "Contact search: not started",
        "",
        "## Snapshot",
        "- Pending research.",
        "",
        "## Observations",
        "- Pending research.",
        "",
        "## Outreach angle",
        "- Pending research.",
        "",
        "## Next steps",
        "- Research contact methods.",
        "",
        "## Evidence",
        "- evidence/ (none yet)",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    stubs = parse_missing_profiles()
    created = []
    for stub in stubs:
        stub.path.mkdir(parents=True, exist_ok=True)
        profile_path = stub.path / "profile.md"
        if profile_path.exists():
            continue
        profile_path.write_text(build_stub(stub), encoding="utf-8")
        created.append(profile_path.as_posix())

    report_lines = [
        "# Create Missing Profiles",
        f"Generated: {date.today().isoformat()}",
        f"- Profiles created: {len(created)}",
        "",
    ]
    if created:
        report_lines.append("## Profiles")
        for item in created:
            report_lines.append(f"- {item}")
        report_lines.append("")

    REPORT_PATH.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
    print(f"Profiles created: {len(created)}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
