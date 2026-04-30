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
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
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


def outreach_bucket(value: str) -> str:
    v = value.strip().lower()
    if v in {"draft-prepared", "draft prepared", "draft"}:
        return "drafted"
    return v


def outreach_score(value: str) -> int:
    v = outreach_bucket(value)
    return {
        "bounced": 4,
        "sent": 3,
        "drafted": 2,
        "uncontacted": 1,
        "": 0,
        "unknown": 0,
        "n/a": 0,
        "na": 0,
    }.get(v, 0)


def truthy(value: str) -> bool:
    v = low(value)
    return bool(v) and v not in {"unknown", "not found", "not verified", "n/a", "na", "none", "null"}


def parse_date_key(value: str) -> str:
    # ISO date compares lexicographically.
    v = norm(value)
    return v if DATE_RE.match(v) else ""


@dataclass
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
    contact_form: str
    social_media: str
    phone: str
    last_updated: str


def iter_registered_entity_recs() -> list[Rec]:
    recs: list[Rec] = []
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
                Rec(
                    lead_id=lead_id,
                    root_kind=root_kind,
                    dir_path=profile_md.parent,
                    profile_md=profile_md,
                    name=norm(labels.get("name")) or slug,
                    batch=batch,
                    source=source,
                    status=norm(labels.get("status")),
                    outreach_status=outreach_bucket(norm(labels.get("outreach status"))),
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


def contact_score(rec: Rec) -> int:
    return sum(
        [
            1 if rec.email else 0,
            1 if truthy(rec.website) else 0,
            1 if truthy(rec.contact_form) else 0,
            1 if truthy(rec.phone) else 0,
            1 if truthy(rec.social_media) else 0,
        ]
    )


def rec_score(rec: Rec) -> tuple[int, int, str, int, str]:
    # Higher is better.
    updated_key = parse_date_key(rec.last_updated)
    size = rec.profile_md.stat().st_size if rec.profile_md.exists() else 0
    return (
        outreach_score(rec.outreach_status),
        contact_score(rec),
        updated_key,
        size,
        rec.dir_path.as_posix(),
    )


def quarantine_path(rec: Rec) -> Path:
    base = PROFILES_ROOT if rec.root_kind == "profiles" else DISQUALIFIED_ROOT
    rel = rec.dir_path.relative_to(base)
    return DUPE_ROOT / rec.root_kind / rel


def choose_winner_option_a(best_profile: Rec, best_disq: Rec) -> Rec:
    """
    Option A rule:
    - Keep profiles version if it has outreach activity OR stronger contact info.
    - Otherwise keep disqualified.
    We extend this with a few deterministic tie-breakers to avoid random flips.
    """
    p_out = outreach_score(best_profile.outreach_status)
    d_out = outreach_score(best_disq.outreach_status)
    p_contact = contact_score(best_profile)
    d_contact = contact_score(best_disq)

    # Explicit preference for outreach activity.
    if p_out >= 2 and d_out < 2:
        return best_profile
    if d_out >= 2 and p_out < 2:
        return best_disq

    # Next: contact richness.
    if p_contact > d_contact:
        return best_profile
    if d_contact > p_contact:
        return best_disq

    # If both are basically empty/no-activity, prefer disqualified (more conservative).
    if p_out <= 1 and d_out <= 1 and p_contact == d_contact:
        return best_disq

    # Otherwise fall back to score ordering (and prefer profiles on exact tie).
    if rec_score(best_profile) > rec_score(best_disq):
        return best_profile
    if rec_score(best_disq) > rec_score(best_profile):
        return best_disq
    return best_profile


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Resolve mixed-root duplicates (same LeadID in profiles and disqualified) using Option A."
    )
    parser.add_argument("--apply", action="store_true", help="Apply moves (default: dry-run)")
    parser.add_argument(
        "--out",
        default="",
        help="Output report path (default: reports/resolve-mixed-root-duplicates-option-a-<date>.md)",
    )
    args = parser.parse_args()

    recs = iter_registered_entity_recs()
    by_id: dict[int, list[Rec]] = {}
    for rec in recs:
        by_id.setdefault(rec.lead_id, []).append(rec)

    mixed_ids = sorted(
        lead_id
        for lead_id, items in by_id.items()
        if any(r.root_kind == "profiles" for r in items) and any(r.root_kind == "disqualified" for r in items)
    )

    actions: list[str] = []
    moved: list[tuple[Rec, Path]] = []
    kept: list[Rec] = []
    skipped: list[tuple[int, str]] = []

    for lead_id in mixed_ids:
        items = by_id[lead_id]
        if any(
            is_religious_organization(r.name) or is_religious_organization(r.dir_path.name)
            for r in items
        ):
            skipped.append((lead_id, "religious organization excluded from resolution"))
            continue
        profiles = [r for r in items if r.root_kind == "profiles"]
        disqs = [r for r in items if r.root_kind == "disqualified"]
        if not profiles or not disqs:
            continue

        best_profile = sorted(profiles, key=rec_score, reverse=True)[0]
        best_disq = sorted(disqs, key=rec_score, reverse=True)[0]
        winner = choose_winner_option_a(best_profile, best_disq)
        kept.append(winner)

        losers = [r for r in items if r.dir_path != winner.dir_path]

        for rec in losers:
            qdst = quarantine_path(rec)
            if qdst.exists():
                skipped.append((lead_id, f"quarantine destination exists: {qdst.as_posix()}"))
                continue
            if args.apply:
                qdst.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(rec.dir_path.as_posix(), qdst.as_posix())
            moved.append((rec, qdst))

        actions.append(
            f"- {lead_id} | keep: {winner.root_kind} ({winner.dir_path.as_posix()}) | "
            f"quarantine: {len(losers)}"
        )

    report_path = Path(args.out) if args.out else Path("reports") / f"resolve-mixed-root-duplicates-option-a-{date.today().isoformat()}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    def fmt_rec(rec: Rec) -> str:
        return (
            f"{rec.root_kind} | status: {rec.status or 'unknown'} | outreach: {rec.outreach_status or 'unknown'} | "
            f"contact_score: {contact_score(rec)} | outreach_score: {outreach_score(rec.outreach_status)} | "
            f"email: {rec.email or 'no'} | updated: {rec.last_updated or 'unknown'} | path: {rec.dir_path.as_posix()}"
        )

    lines: list[str] = []
    lines.append("# Resolve Mixed-Root Duplicates (Option A)")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append("")
    lines.append("## Summary")
    lines.append(f"- Mode: {'APPLY' if args.apply else 'DRY-RUN'}")
    lines.append(f"- Mixed-root LeadIDs: {len(mixed_ids)}")
    lines.append(f"- Moved to leads/duplicates: {len(moved)}")
    lines.append(f"- Skipped: {len(skipped)}")
    lines.append("")

    lines.append("## Actions (Per LeadID)")
    if actions:
        lines.extend(actions)
    else:
        lines.append("- (none)")
    lines.append("")

    lines.append("## Details (First 200)")
    shown = 0
    for lead_id in mixed_ids:
        if shown >= 200:
            break
        items = by_id[lead_id]
        profiles = [r for r in items if r.root_kind == "profiles"]
        disqs = [r for r in items if r.root_kind == "disqualified"]
        best_profile = sorted(profiles, key=rec_score, reverse=True)[0]
        best_disq = sorted(disqs, key=rec_score, reverse=True)[0]
        winner = choose_winner_option_a(best_profile, best_disq)
        lines.append(f"### {lead_id}")
        lines.append(f"- winner: {fmt_rec(winner)}")
        lines.append(f"- profiles_best: {fmt_rec(best_profile)}")
        lines.append(f"- disqualified_best: {fmt_rec(best_disq)}")
        # Include any additional records.
        extra = [r for r in items if r.dir_path not in {best_profile.dir_path, best_disq.dir_path}]
        if extra:
            lines.append("- extra_records:")
            for rec in sorted(extra, key=lambda r: r.dir_path.as_posix())[:10]:
                lines.append(f"  - {fmt_rec(rec)}")
        lines.append("")
        shown += 1
    if len(mixed_ids) > shown:
        lines.append(f"- (truncated, showing first {shown} of {len(mixed_ids)})")
        lines.append("")

    lines.append("## Moved (Sample)")
    if not moved:
        lines.append("- (none)")
    else:
        for rec, qdst in moved[:200]:
            lines.append(f"- {rec.lead_id} | from: {rec.dir_path.as_posix()} | to: {qdst.as_posix()}")
        if len(moved) > 200:
            lines.append(f"- (truncated, showing first 200 of {len(moved)})")
    lines.append("")

    lines.append("## Skipped")
    if not skipped:
        lines.append("- (none)")
    else:
        for lead_id, reason in skipped[:200]:
            lines.append(f"- {lead_id} | {reason}")
        if len(skipped) > 200:
            lines.append(f"- (truncated, showing first 200 of {len(skipped)})")
    lines.append("")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {report_path}")


if __name__ == "__main__":
    main()
