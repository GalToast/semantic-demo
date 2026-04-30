from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
import re

REPO_ROOT = Path(".")
PROFILE_GLOBS = [
    REPO_ROOT / "leads" / "profiles",
    REPO_ROOT / "leads" / "disqualified",
]
REPORT_PATH = REPO_ROOT / "reports" / f"profile-id-backfill-{date.today().isoformat()}.md"

ID_LABEL_RE = re.compile(r"^\s*(?:[-*]\s*)?ID\s*:\s*(\d+)\s*$", re.IGNORECASE)
SUFFIX_ID_RE = re.compile(r"-(\d{3,4})$")
PREFIX_ID_RE = re.compile(r"^(\d+)")


@dataclass
class Update:
    profile: str
    slug: str
    inferred_id: str


def has_id_label(lines: list[str]) -> bool:
    return any(ID_LABEL_RE.match(line) for line in lines)


def insert_id_label(lines: list[str], inferred_id: str) -> list[str]:
    # Place near the top so tooling can find it quickly.
    # Strategy:
    # - If first line is a header, insert after the first blank line if present, otherwise after the header.
    # - Otherwise insert at top.
    if not lines:
        return [f"ID: {inferred_id}"]

    idx = 0
    if lines[0].lstrip("\ufeff").startswith("# "):
        idx = 1
        # If next line is blank, insert after that blank line.
        if len(lines) > 1 and lines[1].strip() == "":
            idx = 2
    return lines[:idx] + [f"ID: {inferred_id}"] + lines[idx:]


def main() -> None:
    updates: list[Update] = []
    scanned = 0

    for root in PROFILE_GLOBS:
        if not root.exists():
            continue
        for path in root.glob("*/*/profile.md"):
            scanned += 1
            slug = path.parent.name
            if PREFIX_ID_RE.match(slug):
                continue
            suffix = SUFFIX_ID_RE.search(slug)
            if not suffix:
                continue
            inferred_id = suffix.group(1)

            lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
            if has_id_label(lines):
                continue

            new_lines = insert_id_label(lines, inferred_id)
            path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
            updates.append(Update(profile=path.as_posix(), slug=slug, inferred_id=inferred_id))

    report = [
        "# Profile ID Backfill",
        f"Generated: {date.today().isoformat()}",
        f"- Profiles scanned: {scanned}",
        f"- Profiles updated: {len(updates)}",
        "",
    ]

    if updates:
        report.append("## Updates")
        for u in updates:
            report.append(f"- {u.profile}")
            report.append(f"  - Slug: {u.slug}")
            report.append(f"  - ID: {u.inferred_id}")
        report.append("")

    REPORT_PATH.write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"Profiles updated: {len(updates)}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
