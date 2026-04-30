from __future__ import annotations

from datetime import date
from pathlib import Path
import re

REPO_ROOT = Path(".")
CONTACT_UNKNOWN = REPO_ROOT / "leads" / "views" / "contact-unknown.md"
REPORT_PATH = REPO_ROOT / "reports" / f"contact-unknown-research-queue-{date.today().isoformat()}.md"


def build_name_index() -> dict[str, str]:
    name_to_path: dict[str, str] = {}
    duplicates: set[str] = set()
    for path in (REPO_ROOT / "leads" / "profiles").glob("*/*/profile.md"):
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        if not lines:
            continue
        first = lines[0].lstrip("\ufeff").strip()
        if first.lower().startswith("# lead profile:"):
            name = first.split(":", 1)[1].strip()
        elif first.startswith("# "):
            name = first[2:].strip()
        else:
            name = ""
        if not name:
            continue
        key = name.lower()
        if key in name_to_path:
            duplicates.add(key)
            continue
        name_to_path[key] = path.as_posix()
    for key in duplicates:
        name_to_path.pop(key, None)
    return name_to_path


def compact(text: str) -> str:
    cleaned = text.replace("\\n", " ").replace("\\r", " ")
    return re.sub(r"\s+", " ", cleaned).strip()


def find_profile_path(lead_id: str, name: str, name_index: dict[str, str]) -> str | None:
    if lead_id.isdigit():
        patterns = [
            f"leads/profiles/*/{lead_id}-*/profile.md",
            f"leads/disqualified/*/{lead_id}-*/profile.md",
        ]
        for pattern in patterns:
            hits = list(REPO_ROOT.glob(pattern))
            if hits:
                return hits[0].as_posix()
    if name:
        return name_index.get(name.lower())
    return None


def main() -> None:
    if not CONTACT_UNKNOWN.exists():
        raise SystemExit(f"Contact-unknown view not found: {CONTACT_UNKNOWN}")

    lines = CONTACT_UNKNOWN.read_text(encoding="utf-8", errors="ignore").splitlines()
    name_index = build_name_index()
    queue = []

    for line in lines:
        if not line or "|" not in line or line.startswith("#") or line.startswith("Generated") or line.startswith("Total"):
            continue
        parts = [part.strip() for part in line.split("|")]
        if len(parts) < 2:
            continue
        lead_id = compact(parts[0])
        name = compact(parts[1])
        summary = compact(line)
        path = find_profile_path(lead_id, name, name_index)
        queue.append((lead_id, name, summary, path))

    report_lines = [
        "# Contact Unknown Research Queue",
        f"Generated: {date.today().isoformat()}",
        f"- Total: {len(queue)}",
        "",
        "Columns: LeadID | Name | ProfilePath | Summary",
        "",
    ]
    for lead_id, name, summary, path in queue:
        report_lines.append(f"- {lead_id} | {name} | {path or 'MISSING PROFILE'} | {summary}")

    REPORT_PATH.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
    print(f"Queue entries: {len(queue)}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
