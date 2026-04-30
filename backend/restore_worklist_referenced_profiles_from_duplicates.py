from __future__ import annotations

import argparse
import re
import shutil
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
LEADS_ROOT = REPO_ROOT / "leads"
BATCHES_ROOT = LEADS_ROOT / "batches"
DUPE_ROOT = LEADS_ROOT / "duplicates"

PROFILE_MD = "profile.md"

WORKLIST_GLOBS = [
    "registered-entities-batch-*-worklist*.md",
    "registered-entities-batch-*-worklist-legacy.md",
    "registered-entities-batch-001-002-worklist.md",
]

# Capture a leads path that may end at the directory or at profile.md.
# Example matches:
# - leads/profiles/100-199/184-a-and-n-logistics-llc
# - leads/profiles/100-199/184-a-and-n-logistics-llc/profile.md
LEADS_PATH_RE = re.compile(
    r"(leads/(?:profiles|disqualified)/[A-Za-z0-9_.\-\/]+)",
    re.IGNORECASE,
)

EMAIL_RE = re.compile(r"([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})", re.IGNORECASE)
REGISTERED_BATCH_RE = re.compile(r"^registered-entities-batch-\d{3}\b", re.IGNORECASE)
ALLOWED_REGISTERED_BATCHES = {f"registered-entities-batch-{i:03d}" for i in range(1, 11)}


def norm_path(p: str) -> str:
    p = p.strip().replace("\\", "/")
    # Strip trailing punctuation we commonly see in worklist notes.
    p = p.rstrip(").,;")
    return p


def to_profile_md_path(p: str) -> str:
    p = norm_path(p)
    if p.lower().endswith("/" + PROFILE_MD):
        return p
    if p.lower().endswith(".md"):
        # Some worklists might reference a .md directly; we only restore profile.md directories.
        return p
    return f"{p}/{PROFILE_MD}"


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def parse_batch_source_status(text: str) -> tuple[str, str, str, str]:
    batch = ""
    source = ""
    status = ""
    outreach = ""
    for line in text.splitlines()[:80]:
        if line.startswith("Batch:"):
            batch = line.split(":", 1)[1].strip()
        elif line.startswith("Source:"):
            source = line.split(":", 1)[1].strip()
        elif line.startswith("Status:"):
            status = line.split(":", 1)[1].strip()
        elif line.startswith("Outreach status:"):
            outreach = line.split(":", 1)[1].strip()
    return batch, source, status, outreach


@dataclass(frozen=True)
class Candidate:
    profile_md: Path
    dir_path: Path
    batch: str
    source: str
    status: str
    outreach: str
    size: int


def score_candidate(c: Candidate) -> tuple[int, int, int, int]:
    # Higher is better.
    batch_ok = 1 if (c.batch and REGISTERED_BATCH_RE.match(c.batch)) else 0
    source_ok = 1 if c.source.strip().lower() != "import" else 0
    has_email = 1 if EMAIL_RE.search(read_text(c.profile_md)) else 0
    return (batch_ok, source_ok, has_email, c.size)


def find_candidates(slug: str, root_kind: str, range_dir: str) -> list[Candidate]:
    """
    root_kind: profiles|disqualified (from canonical path)
    range_dir: e.g. 100-199
    """
    candidates: list[Path] = []

    # Most common locations we expect the missing profile to be found.
    common = [
        DUPE_ROOT / root_kind / range_dir / slug / PROFILE_MD,
        DUPE_ROOT / "dupe-lead-ids" / "leads" / root_kind / range_dir / slug / PROFILE_MD,
    ]
    for p in common:
        if p.exists():
            candidates.append(p)

    # Fallback: any matching slug directory under duplicates.
    for p in DUPE_ROOT.rglob(PROFILE_MD):
        if p.parent.name.lower() == slug.lower():
            candidates.append(p)

    uniq: dict[str, Path] = {}
    for p in candidates:
        uniq[p.resolve().as_posix().lower()] = p

    out: list[Candidate] = []
    for p in uniq.values():
        text = read_text(p)
        batch, source, status, outreach = parse_batch_source_status(text)
        try:
            size = p.stat().st_size
        except Exception:
            size = 0
        out.append(
            Candidate(
                profile_md=p,
                dir_path=p.parent,
                batch=batch,
                source=source,
                status=status,
                outreach=outreach,
                size=size,
            )
        )
    out.sort(key=score_candidate, reverse=True)
    return out


def parse_slug_and_range(profile_md_rel: str) -> tuple[str, str, str] | None:
    """
    Input: leads/profiles/100-199/184-a-and-n-logistics-llc/profile.md
    Returns: (root_kind, range_dir, slug)
    """
    parts = profile_md_rel.split("/")
    if len(parts) < 5:
        return None
    if parts[0].lower() != "leads":
        return None
    root_kind = parts[1].lower()
    if root_kind not in {"profiles", "disqualified"}:
        return None
    range_dir = parts[2]
    slug = parts[3]
    return root_kind, range_dir, slug


def active_lead_ids() -> set[int]:
    """
    LeadIDs that currently exist in canonical roots (leads/profiles + leads/disqualified),
    excluding anything already under leads/duplicates.
    """
    ids: set[int] = set()
    for root in (LEADS_ROOT / "profiles", LEADS_ROOT / "disqualified"):
        if not root.exists():
            continue
        for p in root.rglob(PROFILE_MD):
            if DUPE_ROOT in p.parents:
                continue
            slug = p.parent.name
            m = re.match(r"^(\d+)", slug)
            if m:
                ids.add(int(m.group(1)))
                continue
            # Fallback: parse ID: <n> in the file body
            for line in read_text(p).splitlines()[:120]:
                m2 = re.match(r"^\s*(?:[-*]\s*)?ID\s*:\s*(\d+)\s*$", line, re.IGNORECASE)
                if m2:
                    ids.add(int(m2.group(1)))
                    break
    return ids


def iter_worklist_paths() -> set[str]:
    hits: set[str] = set()
    if not BATCHES_ROOT.exists():
        return hits
    for glob in WORKLIST_GLOBS:
        for wl in sorted(BATCHES_ROOT.glob(glob)):
            text = read_text(wl)
            for m in LEADS_PATH_RE.finditer(text):
                p = to_profile_md_path(m.group(1))
                # Only handle profile.md (directory-based profiles). Ignore legacy single-file leads.
                if not p.lower().endswith("/" + PROFILE_MD):
                    continue
                hits.add(norm_path(p))
    return hits


@dataclass
class RestoreAction:
    target_profile_md: Path
    candidate_dir: Path
    chosen_profile_md: Path
    reason: str


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Restore missing worklist-referenced profile directories from leads/duplicates back into canonical leads/profiles or leads/disqualified paths."
    )
    parser.add_argument("--apply", action="store_true", help="Move directories into place.")
    parser.add_argument(
        "--out",
        default="",
        help="Report path (default: reports/restore-worklist-referenced-profiles-<date>.md)",
    )
    args = parser.parse_args()

    referenced = sorted(iter_worklist_paths())
    existing_ids = active_lead_ids()
    actions: list[RestoreAction] = []
    missing: list[str] = []
    skipped: list[tuple[str, str]] = []

    for rel in referenced:
        target = REPO_ROOT / rel
        if target.exists():
            continue

        parsed = parse_slug_and_range(rel)
        if not parsed:
            skipped.append((rel, "unparseable canonical path"))
            continue
        root_kind, range_dir, slug = parsed
        missing.append(rel)

        # If the referenced LeadID already exists somewhere canonical, restoring this
        # path would reintroduce duplicate LeadIDs. That usually means the worklist
        # reference is stale or was created during a misfile; treat as review-only.
        m_id = re.match(r"^(\d+)", slug)
        if m_id and int(m_id.group(1)) in existing_ids:
            skipped.append((rel, f"lead-id-already-present: {m_id.group(1)}"))
            continue

        cands = find_candidates(slug=slug, root_kind=root_kind, range_dir=range_dir)
        if not cands:
            skipped.append((rel, "not found in leads/duplicates"))
            continue

        # Only restore when we can ground the candidate in batches 001-010.
        filtered = [c for c in cands if (c.batch or "").strip().lower() in ALLOWED_REGISTERED_BATCHES]
        if not filtered:
            skipped.append((rel, "no candidate grounded in registered-entities-batch-001..010"))
            continue
        chosen = filtered[0]

        # Move the entire directory containing profile.md.
        target_dir = target.parent
        if target_dir.exists():
            # If the directory exists without profile.md, don't clobber (manual merge is safer).
            skipped.append((rel, f"target directory exists: {target_dir.as_posix()}"))
            continue

        reason = f"best-candidate score={score_candidate(chosen)} batch={chosen.batch or 'unknown'} source={chosen.source or 'unknown'}"
        actions.append(
            RestoreAction(
                target_profile_md=target,
                candidate_dir=chosen.dir_path,
                chosen_profile_md=chosen.profile_md,
                reason=reason,
            )
        )

    restored: list[RestoreAction] = []
    if args.apply:
        for act in actions:
            act.target_profile_md.parent.parent.mkdir(parents=True, exist_ok=True)
            act.target_profile_md.parent.mkdir(parents=True, exist_ok=True)
            # Ensure the parent range dir exists (leads/profiles/100-199 etc).
            act.target_profile_md.parent.parent.mkdir(parents=True, exist_ok=True)
            act.target_profile_md.parent.parent.parent.mkdir(parents=True, exist_ok=True)

            # Move the whole directory into canonical location.
            act.target_profile_md.parent.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(act.candidate_dir.as_posix(), act.target_profile_md.parent.as_posix())
            restored.append(act)

    report_path = Path(args.out) if args.out else Path("reports") / f"restore-worklist-referenced-profiles-{date.today().isoformat()}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    lines.append("# Restore Worklist-Referenced Profiles From Duplicates")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append("")
    lines.append("## Summary")
    lines.append(f"- Mode: {'APPLY' if args.apply else 'DRY-RUN'}")
    lines.append(f"- Worklist-referenced canonical profile paths: {len(referenced)}")
    lines.append(f"- Missing canonical profile.md paths: {len(missing)}")
    lines.append(f"- Planned restores (found candidates): {len(actions)}")
    lines.append(f"- Restored: {len(restored)}")
    lines.append(f"- Skipped: {len(skipped)}")
    lines.append("")

    lines.append("## Restored")
    if not (restored if args.apply else actions):
        lines.append("- (none)")
    else:
        for act in (restored if args.apply else actions)[:200]:
            lines.append(
                f"- {act.target_profile_md.as_posix()} <= {act.candidate_dir.as_posix()} ({act.reason})"
            )
        total = len(restored if args.apply else actions)
        if total > 200:
            lines.append(f"- (truncated, showing first 200 of {total})")
    lines.append("")

    lines.append("## Skipped")
    if not skipped:
        lines.append("- (none)")
    else:
        for rel, reason in skipped[:200]:
            lines.append(f"- {rel} | {reason}")
        if len(skipped) > 200:
            lines.append(f"- (truncated, showing first 200 of {len(skipped)})")
    lines.append("")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {report_path}")


if __name__ == "__main__":
    main()
