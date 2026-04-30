from __future__ import annotations

import argparse
import re
import shutil
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
PROFILES_ROOT = REPO_ROOT / "leads" / "profiles"
DISQUALIFIED_ROOT = REPO_ROOT / "leads" / "disqualified"
DUPE_ROOT = REPO_ROOT / "leads" / "duplicates"

REGISTERED_BATCH_RE = re.compile(r"^registered-entities-batch-\d{3}\b", re.IGNORECASE)
EMAIL_RE = re.compile(r"([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})", re.IGNORECASE)
LABEL_RE = re.compile(r"^\s*([A-Za-z][A-Za-z /_-]*?):\s*(.*?)\s*$")
RELIGIOUS_KEYWORDS = (
    "church",
    "baptist",
    "catholic",
    "christ",
    "christian",
    "cathedral",
    "chapel",
    "congregation",
    "diocese",
    "fellowship",
    "holy",
    "lutheran",
    "ministry",
    "mission",
    "mosque",
    "parish",
    "prayer",
    "religious",
    "synagogue",
    "temple",
)


def norm(value: str | None) -> str:
    return (value or "").strip()


def low(value: str | None) -> str:
    return norm(value).lower()


def extract_email(value: str | None) -> str:
    v = norm(value)
    if not v:
        return ""
    m = EMAIL_RE.search(v)
    return m.group(1).lower() if m else ""


def parse_labels(text: str) -> dict[str, str]:
    labels: dict[str, str] = {}
    for line in text.splitlines():
        m = LABEL_RE.match(line)
        if not m:
            continue
        labels[m.group(1).strip().lower()] = m.group(2).strip()
    return labels


@dataclass
class ProfileRec:
    lead_id: int
    root_kind: str  # profiles|disqualified
    dir_path: Path
    profile_md: Path
    name: str
    batch: str
    source: str
    status: str
    outreach_status: str
    contact_path: str
    email: str
    website: str
    contact_form: str
    social_media: str
    phone: str
    last_updated: str


def iter_registered_entity_profiles() -> list[ProfileRec]:
    recs: list[ProfileRec] = []
    for root_kind, root in (("profiles", PROFILES_ROOT), ("disqualified", DISQUALIFIED_ROOT)):
        if not root.exists():
            continue
        for profile_md in root.rglob("profile.md"):
            slug = profile_md.parent.name
            m = re.match(r"^(\d+)-", slug)
            if not m:
                continue
            lead_id = int(m.group(1))

            text = profile_md.read_text(encoding="utf-8", errors="ignore")
            labels = parse_labels(text)

            batch = norm(labels.get("batch"))
            source = norm(labels.get("source"))
            if not batch or not REGISTERED_BATCH_RE.match(batch):
                continue
            if low(source) == "import":
                continue

            recs.append(
                ProfileRec(
                    lead_id=lead_id,
                    root_kind=root_kind,
                    dir_path=profile_md.parent,
                    profile_md=profile_md,
                    name=norm(labels.get("name")) or slug,
                    batch=batch,
                    source=source,
                    status=norm(labels.get("status")),
                    outreach_status=low(labels.get("outreach status")),
                    contact_path=low(labels.get("contact path")),
                    email=extract_email(labels.get("email")),
                    website=norm(labels.get("website")),
                    contact_form=norm(labels.get("contact form")),
                    social_media=norm(labels.get("social media")),
                    phone=norm(labels.get("phone")),
                    last_updated=norm(labels.get("last updated")),
                )
            )
    return recs


def is_religious_organization(text: str) -> bool:
    haystack = re.sub(r"[^a-z0-9]+", " ", text.lower())
    return any(re.search(rf"\b{re.escape(token)}\b", haystack) for token in RELIGIOUS_KEYWORDS)


def score(rec: ProfileRec) -> tuple[int, int, int, int, int, int, str, int, str]:
    # Higher is better.
    return (
        1 if rec.email else 0,
        1 if rec.website and low(rec.website) not in {"unknown", "not found", "not verified"} else 0,
        1 if rec.contact_form and low(rec.contact_form) not in {"unknown", "not found"} else 0,
        1 if rec.phone and low(rec.phone) not in {"unknown", "not found"} else 0,
        1 if rec.social_media and low(rec.social_media) not in {"unknown", "not found"} else 0,
        1 if rec.outreach_status in {"sent", "bounced", "drafted", "uncontacted"} else 0,
        rec.last_updated,
        rec.profile_md.stat().st_size if rec.profile_md.exists() else 0,
        rec.dir_path.as_posix(),
    )


def quarantine_path(rec: ProfileRec) -> Path:
    # Preserve original relative path under leads/duplicates/{profiles|disqualified}/...
    base = PROFILES_ROOT if rec.root_kind == "profiles" else DISQUALIFIED_ROOT
    rel = rec.dir_path.relative_to(base)
    return DUPE_ROOT / rec.root_kind / rel


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Quarantine duplicate registered-entities profiles so each LeadID has one active directory under leads/profiles or leads/disqualified."
    )
    parser.add_argument("--apply", action="store_true", help="Apply moves (default: dry-run)")
    parser.add_argument(
        "--include-disqualified",
        action="store_true",
        help="Also quarantine duplicates where all records are disqualified (default: only duplicates among qualified roots).",
    )
    parser.add_argument(
        "--out",
        default="",
        help="Output report path (default: reports/quarantine-registered-entities-duplicates-<date>.md)",
    )
    args = parser.parse_args()

    recs = iter_registered_entity_profiles()
    by_id: dict[int, list[ProfileRec]] = {}
    for rec in recs:
        by_id.setdefault(rec.lead_id, []).append(rec)

    dup_groups = {lid: items for lid, items in by_id.items() if len(items) > 1}

    quarantined: list[ProfileRec] = []
    kept: list[ProfileRec] = []
    mixed_groups: list[tuple[int, list[ProfileRec]]] = []
    skipped: list[tuple[int, str]] = []

    for lid, items in sorted(dup_groups.items()):
        roots = {rec.root_kind for rec in items}
        if any(
            is_religious_organization(rec.name) or is_religious_organization(rec.dir_path.name)
            for rec in items
        ):
            skipped.append((lid, "religious organization excluded from quarantine"))
            continue
        if len(roots) > 1:
            mixed_groups.append((lid, items))
            continue

        root_kind = next(iter(roots))
        if root_kind == "disqualified" and not args.include_disqualified:
            skipped.append((lid, "all-disqualified (flagged only; use --include-disqualified to quarantine)"))
            continue

        # Choose canonical record to keep in place; quarantine the rest.
        canonical = sorted(items, key=score, reverse=True)[0]
        kept.append(canonical)
        for rec in items:
            if rec.dir_path == canonical.dir_path:
                continue
            qdst = quarantine_path(rec)
            if qdst.exists():
                # Avoid clobbering; skip this one (manual cleanup needed).
                skipped.append((lid, f"quarantine destination exists: {qdst.as_posix()}"))
                continue
            if args.apply:
                qdst.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(rec.dir_path.as_posix(), qdst.as_posix())
            quarantined.append(rec)

    report_path = Path(args.out) if args.out else Path("reports") / f"quarantine-registered-entities-duplicates-{date.today().isoformat()}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    def fmt_item(rec: ProfileRec) -> str:
        return (
            f"- {rec.lead_id} | {rec.name} | root: {rec.root_kind} | status: {rec.status or 'unknown'} | "
            f"outreach: {rec.outreach_status or 'unknown'} | email: {rec.email or 'no'} | "
            f"updated: {rec.last_updated or 'unknown'} | path: {rec.dir_path.as_posix()}"
        )

    lines: list[str] = []
    lines.append("# Quarantine Registered Entities Duplicates")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append("")
    lines.append("## Summary")
    lines.append(f"- Mode: {'APPLY' if args.apply else 'DRY-RUN'}")
    lines.append(f"- Duplicate LeadIDs found: {len(dup_groups)}")
    lines.append(f"- Mixed-root groups (qualified + disqualified): {len(mixed_groups)} (reported only)")
    lines.append(f"- Quarantined: {len(quarantined)}")
    lines.append(f"- Kept: {len(kept)}")
    lines.append(f"- Skipped: {len(skipped)}")
    lines.append("")

    lines.append("## Quarantined (Sample)")
    if not quarantined:
        lines.append("- (none)")
    else:
        for rec in quarantined[:200]:
            lines.append(fmt_item(rec))
        if len(quarantined) > 200:
            lines.append(f"- (truncated, showing first 200 of {len(quarantined)})")
    lines.append("")

    lines.append("## Mixed Root Groups (Review Needed)")
    if not mixed_groups:
        lines.append("- (none)")
    else:
        for lid, items in mixed_groups[:100]:
            lines.append(f"### {lid} ({len(items)} records)")
            for rec in sorted(items, key=lambda r: (r.root_kind, r.dir_path.as_posix())):
                lines.append(fmt_item(rec))
            lines.append("")
        if len(mixed_groups) > 100:
            lines.append(f"- (truncated, showing first 100 of {len(mixed_groups)})")
    lines.append("")

    lines.append("## Skipped")
    if not skipped:
        lines.append("- (none)")
    else:
        for lid, reason in skipped[:200]:
            lines.append(f"- {lid} | {reason}")
        if len(skipped) > 200:
            lines.append(f"- (truncated, showing first 200 of {len(skipped)})")
    lines.append("")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {report_path}")


if __name__ == "__main__":
    main()
