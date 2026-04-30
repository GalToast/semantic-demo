from __future__ import annotations

import argparse
import re
import shutil
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
LEADS_ROOT = REPO_ROOT / "leads"
PROFILES_ROOT = LEADS_ROOT / "profiles"
DISQUALIFIED_ROOT = LEADS_ROOT / "disqualified"
DUPE_ROOT = LEADS_ROOT / "duplicates"
BATCHES_ROOT = LEADS_ROOT / "batches"

PROFILE_MD_NAME = "profile.md"

REGISTERED_BATCH_RE = re.compile(r"^registered-entities-batch-\d{3}\b", re.IGNORECASE)
WORKLIST_GLOB = "registered-entities-batch-*-worklist*.md"
LEAD_DIR_RE = re.compile(r"^(\d+)")
ID_LINE_RE = re.compile(r"^\s*(?:[-*]\s*)?id\s*:\s*(\d+)\s*$", re.IGNORECASE)
META_ID_LINE_RE = re.compile(r"^\s*-\s*id\s*:\s*(\d+)\s*$", re.IGNORECASE)

LABEL_RE = re.compile(r"^\s*([A-Za-z][A-Za-z /_-]*?):\s*(.*?)\s*$")
EMAIL_RE = re.compile(r"([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})", re.IGNORECASE)
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


def parse_labels(text: str) -> dict[str, str]:
    labels: dict[str, str] = {}
    for line in text.splitlines():
        m = LABEL_RE.match(line)
        if not m:
            continue
        labels[m.group(1).strip().lower()] = m.group(2).strip()
    return labels


def extract_email(value: str | None) -> str:
    v = norm(value)
    if not v:
        return ""
    m = EMAIL_RE.search(v)
    return m.group(1).lower() if m else ""


def iter_worklist_referenced_profiles() -> set[str]:
    """
    Parse registered-entities worklists for "Note: profile (...)" / "profile created (...)".
    These paths are considered canonical and must not be moved.
    """
    referenced: set[str] = set()
    if not BATCHES_ROOT.exists():
        return referenced

    for wl in sorted(BATCHES_ROOT.glob(WORKLIST_GLOB)):
        try:
            text = wl.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for line in text.splitlines():
            # Common patterns:
            # - Note: profile (leads/profiles/.../profile.md)
            # - Note: profile created (leads/profiles/.../123-foo)
            m = re.search(r"\((leads/(?:profiles|disqualified)/[^)]+)\)", line)
            if not m:
                continue
            p = m.group(1).replace("\\", "/").strip()
            if not p.startswith("leads/"):
                continue
            if p.endswith("/"):
                p = p[:-1]
            if p.endswith("/" + PROFILE_MD_NAME):
                referenced.add(p)
            else:
                # Worklists sometimes point at the directory. Normalize to profile.md.
                referenced.add(f"{p}/{PROFILE_MD_NAME}")
    return referenced


@dataclass(frozen=True)
class Rec:
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
    last_updated: str


def iter_recs() -> list[Rec]:
    recs: list[Rec] = []
    for root_kind, root in (("profiles", PROFILES_ROOT), ("disqualified", DISQUALIFIED_ROOT)):
        if not root.exists():
            continue
        for profile_md in root.rglob(PROFILE_MD_NAME):
            if DUPE_ROOT in profile_md.parents:
                continue
            slug = profile_md.parent.name
            text = profile_md.read_text(encoding="utf-8", errors="ignore")
            m = LEAD_DIR_RE.match(slug)
            lead_id: int | None = int(m.group(1)) if m else None
            if lead_id is None:
                # Some legacy dirs embed the numeric id only inside the profile body (e.g. "- ID: 1032").
                for line in text.splitlines()[:250]:
                    m2 = ID_LINE_RE.match(line) or META_ID_LINE_RE.match(line)
                    if m2:
                        lead_id = int(m2.group(1))
                        break
            if lead_id is None:
                continue
            labels = parse_labels(text)
            recs.append(
                Rec(
                    lead_id=lead_id,
                    root_kind=root_kind,
                    dir_path=profile_md.parent,
                    profile_md=profile_md,
                    name=norm(labels.get("name")) or slug,
                    batch=norm(labels.get("batch")),
                    source=norm(labels.get("source")),
                    status=norm(labels.get("status")),
                    outreach_status=low(labels.get("outreach status")),
                    contact_path=low(labels.get("contact path")),
                    email=extract_email(labels.get("email")),
                    website=norm(labels.get("website")),
                    last_updated=norm(labels.get("last updated")),
                )
            )
    return recs


def is_religious_organization(text: str) -> bool:
    haystack = re.sub(r"[^a-z0-9]+", " ", text.lower())
    return any(re.search(rf"\b{re.escape(token)}\b", haystack) for token in RELIGIOUS_KEYWORDS)


def score(rec: Rec) -> tuple[int, int, int, int, int, int, str]:
    """
    Higher is better. The bias is:
    - Prefer registered-entities batch entries
    - Prefer non-import sources
    - Prefer qualified root over disqualified
    - Prefer more usable contact info
    - Prefer more "advanced" outreach status (sent/bounced/drafted) so we keep the one with history
    - Prefer newer last_updated when present
    """
    batch_is_registered = 1 if (rec.batch and REGISTERED_BATCH_RE.match(rec.batch)) else 0
    source_is_not_import = 1 if low(rec.source) != "import" else 0
    root_is_profiles = 1 if rec.root_kind == "profiles" else 0
    has_email = 1 if rec.email else 0
    has_website = 1 if rec.website and low(rec.website) not in {"unknown", "not found"} else 0
    outreach_rank = {
        "sent": 4,
        "bounced": 3,
        "drafted": 2,
        "uncontacted": 1,
        "": 0,
        "unknown": 0,
    }.get(rec.outreach_status, 0)
    updated = rec.last_updated if re.match(r"^\d{4}-\d{2}-\d{2}$", rec.last_updated or "") else ""
    return (batch_is_registered, source_is_not_import, root_is_profiles, has_email, has_website, outreach_rank, updated)


def quarantine_dest(rec: Rec) -> Path:
    rel = rec.dir_path.relative_to(REPO_ROOT).as_posix()
    # leads/profiles/000-099/123-foo  -> leads/duplicates/dupe-lead-ids/leads/profiles/000-099/123-foo
    return DUPE_ROOT / "dupe-lead-ids" / rel


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Quarantine duplicate LeadID directories across leads/profiles and leads/disqualified (global), protecting worklist-referenced registered-entities profiles."
    )
    parser.add_argument("--apply", action="store_true", help="Write changes (move directories).")
    parser.add_argument(
        "--out",
        default="",
        help="Report path (default: reports/quarantine-duplicate-lead-ids-global-<date>.md)",
    )
    args = parser.parse_args()

    canonical_profiles = iter_worklist_referenced_profiles()
    recs = iter_recs()

    by_id: dict[int, list[Rec]] = {}
    for rec in recs:
        by_id.setdefault(rec.lead_id, []).append(rec)

    dup_groups = [(lid, items) for lid, items in by_id.items() if len(items) > 1]
    dup_groups.sort(key=lambda t: t[0])

    kept: list[Rec] = []
    quarantined: list[tuple[Rec, Path]] = []
    skipped: list[tuple[int, str]] = []

    for lid, items in dup_groups:
        if any(
            is_religious_organization(rec.name) or is_religious_organization(rec.dir_path.name)
            for rec in items
        ):
            skipped.append((lid, "religious organization excluded from quarantine"))
            continue
        # Prefer the worklist-referenced profile if present.
        protected = []
        for rec in items:
            rel_profile = rec.profile_md.relative_to(REPO_ROOT).as_posix()
            if rel_profile in canonical_profiles:
                protected.append(rec)

        if len(protected) > 1:
            # Ambiguous: multiple protected directories share the same numeric LeadID.
            skipped.append((lid, "multiple worklist-referenced profiles; manual review needed"))
            continue

        canonical = protected[0] if protected else sorted(items, key=score, reverse=True)[0]
        kept.append(canonical)

        for rec in items:
            if rec.dir_path == canonical.dir_path:
                continue
            dst = quarantine_dest(rec)
            if dst.exists():
                skipped.append((lid, f"destination exists: {dst.as_posix()}"))
                continue
            if args.apply:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(rec.dir_path.as_posix(), dst.as_posix())
            quarantined.append((rec, dst))

    report_path = Path(args.out) if args.out else Path("reports") / f"quarantine-duplicate-lead-ids-global-{date.today().isoformat()}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    def fmt(rec: Rec) -> str:
        return (
            f"- {rec.lead_id} | {rec.name} | root: {rec.root_kind} | "
            f"batch: {rec.batch or 'unknown'} | source: {rec.source or 'unknown'} | "
            f"status: {rec.status or 'unknown'} | outreach: {rec.outreach_status or 'unknown'} | "
            f"updated: {rec.last_updated or 'unknown'} | path: {rec.dir_path.relative_to(REPO_ROOT).as_posix()}"
        )

    lines: list[str] = []
    lines.append("# Quarantine Duplicate Lead IDs (Global)")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append("")
    lines.append("## Summary")
    lines.append(f"- Mode: {'APPLY' if args.apply else 'DRY-RUN'}")
    lines.append(f"- Canonical worklist-referenced profiles parsed: {len(canonical_profiles)}")
    lines.append(f"- Duplicate LeadIDs found: {len(dup_groups)}")
    lines.append(f"- Quarantined: {len(quarantined)}")
    lines.append(f"- Skipped: {len(skipped)}")
    lines.append("")

    lines.append("## Quarantined (Sample)")
    if not quarantined:
        lines.append("- (none)")
    else:
        for rec, dst in quarantined[:200]:
            lines.append(f"{fmt(rec)} -> {dst.as_posix()}")
        if len(quarantined) > 200:
            lines.append(f"- (truncated, showing first 200 of {len(quarantined)})")
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

    lines.append("## Kept (Sample)")
    if not kept:
        lines.append("- (none)")
    else:
        for rec in kept[:200]:
            lines.append(fmt(rec))
        if len(kept) > 200:
            lines.append(f"- (truncated, showing first 200 of {len(kept)})")
    lines.append("")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {report_path}")


if __name__ == "__main__":
    main()
