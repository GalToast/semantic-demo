from __future__ import annotations

from pathlib import Path
from datetime import date
import re

REPO_ROOT = Path(".")
PROFILE_ROOTS = [REPO_ROOT / "leads" / "profiles", REPO_ROOT / "leads" / "disqualified"]
REPORT_PATH = REPO_ROOT / "reports" / f"profile-title-normalization-{date.today().isoformat()}.md"

LABEL_PATTERNS = [
    re.compile(r"^\s*(?:[-*]\s*)?(?:Business Name|Company|Name)\s*:\s*(.+?)\s*$", re.IGNORECASE),
    re.compile(r"^\s*-\s*\*\*(?:Business Name|Company|Name)\*\*\s*:\s*(.+?)\s*$", re.IGNORECASE),
]

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


def title_from_slug(slug: str) -> str:
    cleaned = re.sub(r"^\d+-", "", slug)
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


def find_best_name(lines: list[str]) -> tuple[str | None, int | None]:
    for idx, line in enumerate(lines):
        cleaned = line.lstrip("\ufeff")
        if "Lead Profile:" in cleaned:
            parts = cleaned.split("Lead Profile:", 1)
            name = parts[1].strip()
            if name:
                return name, idx
    for idx, line in enumerate(lines[1:], start=1):
        if line.startswith("# "):
            candidate = line[2:].strip()
            if candidate and not re.match(r"^\d+-", candidate):
                return candidate, idx
    for line in lines:
        for pattern in LABEL_PATTERNS:
            match = pattern.match(line)
            if match:
                name = match.group(1).strip()
                if name:
                    return name, None
    return None, None


def main() -> None:
    updated = []
    total = 0
    for root in PROFILE_ROOTS:
        if not root.exists():
            continue
        for path in root.glob("*/*/profile.md"):
            total += 1
            lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
            if not lines:
                continue

            slug = path.parent.name
            first_raw = lines[0].lstrip("\ufeff")
            prefix = "# Lead Profile:"
            new_title = None
            remove_idx = None

            if first_raw.startswith(prefix):
                new_title = first_raw[len(prefix):].strip()
            elif first_raw.startswith("# ") and re.match(r"^#\s*\d+-", first_raw):
                new_title, remove_idx = find_best_name(lines)
                if not new_title:
                    new_title = title_from_slug(slug)
            elif not first_raw.startswith("# "):
                new_title = title_from_slug(slug)

            if new_title and new_title != first_raw.lstrip("# ").strip():
                if first_raw.startswith("# "):
                    lines[0] = f"# {new_title}"
                else:
                    lines.insert(0, f"# {new_title}")
                    lines.insert(1, "")
                if remove_idx is not None and 0 <= remove_idx < len(lines):
                    if remove_idx != 0:
                        lines.pop(remove_idx)
                path.write_text("\n".join(lines) + "\n", encoding="utf-8")
                updated.append(path.as_posix())
            elif first_raw != lines[0]:
                lines[0] = first_raw
                path.write_text("\n".join(lines) + "\n", encoding="utf-8")
                updated.append(path.as_posix())

    report = [
        "# Profile Title Normalization",
        f"Generated: {date.today().isoformat()}",
        f"- Profiles scanned: {total}",
        f"- Titles updated: {len(updated)}",
        "",
    ]
    if updated:
        report.append("## Updated Profiles")
        for item in updated:
            report.append(f"- {item}")
        report.append("")

    REPORT_PATH.write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"Profiles scanned: {total}")
    print(f"Titles updated: {len(updated)}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
