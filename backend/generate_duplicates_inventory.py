from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import date
from pathlib import Path
import re

REPO_ROOT = Path(".")
DUPE_ROOT = REPO_ROOT / "leads" / "duplicates"
PROFILES_ROOT = REPO_ROOT / "leads" / "profiles"
DISQUALIFIED_ROOT = REPO_ROOT / "leads" / "disqualified"

LABEL_RE = re.compile(r"^\s*([A-Za-z][A-Za-z /_-]*?):\s*(.*?)\s*$")


def norm(value: str | None) -> str:
    return (value or "").strip()


def low(value: str | None) -> str:
    return norm(value).lower()


def parse_labels(text: str) -> dict[str, str]:
    labels: dict[str, str] = {}
    for line in text.splitlines():
        m = LABEL_RE.match(line)
        if not m:
            continue
        labels[m.group(1).strip().lower()] = m.group(2).strip()
    return labels


def extract_title(text: str) -> str:
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return ""


def lead_id_from_dirname(dirname: str) -> int | None:
    m = re.match(r"^(\d+)-", dirname)
    return int(m.group(1)) if m else None


def range_dir_for_id(lead_id: int) -> str:
    start = (lead_id // 100) * 100
    end = start + 99
    return f"{start:03d}-{end:03d}"


def is_import_profile(profile_md: Path) -> bool:
    try:
        text = profile_md.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False
    return bool(re.search(r"^Source:\s*import\b", text, re.IGNORECASE | re.MULTILINE))


def find_active_paths(lead_id: int) -> list[str]:
    rng = range_dir_for_id(lead_id)
    paths: list[str] = []
    for base in [PROFILES_ROOT / rng, DISQUALIFIED_ROOT / rng]:
        if not base.exists():
            continue
        for profile_md in base.glob(f"{lead_id}-*/profile.md"):
            if is_import_profile(profile_md):
                continue
            paths.append(profile_md.relative_to(REPO_ROOT).as_posix())
    return sorted(set(paths))


@dataclass
class DupeRec:
    root_kind: str
    lead_id: int
    name: str
    batch: str
    source: str
    status: str
    outreach: str
    contact_path: str
    email: str
    website: str
    last_updated: str
    dupe_path: str
    active_paths: list[str]


def iter_dupe_profile_mds() -> list[Path]:
    if not DUPE_ROOT.exists():
        return []
    return sorted(DUPE_ROOT.rglob("profile.md"))


def parse_dupe(profile_md: Path) -> DupeRec | None:
    root_kind = profile_md.parents[2].name if len(profile_md.parents) >= 3 else "unknown"
    dirname = profile_md.parent.name
    lead_id = lead_id_from_dirname(dirname)
    if lead_id is None:
        return None

    text = profile_md.read_text(encoding="utf-8", errors="ignore")
    labels = parse_labels(text)
    title = extract_title(text)

    name = title or norm(labels.get("name")) or dirname
    batch = norm(labels.get("batch"))
    source = norm(labels.get("source"))
    status = norm(labels.get("status")) or ("disqualified" if root_kind == "disqualified" else "")
    outreach = low(labels.get("outreach status"))
    contact_path = low(labels.get("contact path"))
    email = norm(labels.get("email"))
    website = norm(labels.get("website"))
    last_updated = norm(labels.get("last updated"))

    return DupeRec(
        root_kind=root_kind,
        lead_id=lead_id,
        name=name,
        batch=batch,
        source=source,
        status=status,
        outreach=outreach,
        contact_path=contact_path,
        email=email,
        website=website,
        last_updated=last_updated,
        dupe_path=profile_md.parent.relative_to(REPO_ROOT).as_posix(),
        active_paths=find_active_paths(lead_id),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate inventory of leads/duplicates/*/*/profile.md")
    parser.add_argument(
        "--out",
        default="",
        help="Output report path (default: reports/duplicates-inventory-<date>.md)",
    )
    args = parser.parse_args()

    report_path = Path(args.out) if args.out else Path("reports") / f"duplicates-inventory-{date.today().isoformat()}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    recs: list[DupeRec] = []
    skipped = 0
    for profile_md in iter_dupe_profile_mds():
        rec = parse_dupe(profile_md)
        if not rec:
            skipped += 1
            continue
        recs.append(rec)

    by_root: dict[str, int] = {}
    for rec in recs:
        by_root[rec.root_kind] = by_root.get(rec.root_kind, 0) + 1

    lines: list[str] = []
    lines.append("# Duplicates Inventory")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append("")
    lines.append("## Summary")
    lines.append(f"- Duplicate directories (with profile.md): {len(recs)}")
    lines.append(f"- Skipped (no numeric LeadID): {skipped}")
    for root_kind, count in sorted(by_root.items(), key=lambda kv: kv[0]):
        lines.append(f"- {root_kind}: {count}")
    lines.append("")
    lines.append("## Inventory")
    lines.append("| Lead ID | Root | Name | Batch | Source | Status | Outreach | Contact | Email | Website | Updated | Dupe Path | Active Paths |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for rec in sorted(recs, key=lambda r: (r.lead_id, r.root_kind, r.dupe_path)):
        active = "; ".join(rec.active_paths) if rec.active_paths else "(none found)"
        lines.append(
            f"| {rec.lead_id} | {rec.root_kind} | {rec.name} | {rec.batch or 'unknown'} | {rec.source or 'unknown'} | "
            f"{rec.status or 'unknown'} | {rec.outreach or 'unknown'} | {rec.contact_path or 'unknown'} | "
            f"{rec.email or 'unknown'} | {rec.website or 'unknown'} | {rec.last_updated or 'unknown'} | "
            f"{rec.dupe_path} | {active} |"
        )

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote: {report_path}")


if __name__ == "__main__":
    main()

