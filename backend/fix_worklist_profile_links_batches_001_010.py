from __future__ import annotations

import argparse
import csv
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
LEADS_ROOT = REPO_ROOT / "leads"
BATCHES_ROOT = LEADS_ROOT / "batches"
INDEX_CSV = LEADS_ROOT / "index.csv"

# Worklists we consider in-scope for the "first 10 batches" pass.
WORKLIST_FILE_RE = re.compile(
    r"^registered-entities-batch-(001|002|003|004|005|006|007|008|009|010)(?:-[^-]+)?-worklist.*\.md$",
    re.IGNORECASE,
)

COMBINED_IN_SCOPE = {
    "registered-entities-batch-001-002-worklist.md",
}

ITEM_RE = re.compile(r"^- \[[ xX]\]\s+(\d+)\.", re.IGNORECASE)

# Match any leads path inside parentheses.
PAREN_PATH_RE = re.compile(r"\((leads/(?:profiles|disqualified)/[^)]+)\)", re.IGNORECASE)


def norm_path(p: str) -> str:
    p = (p or "").strip().replace("\\\\", "/").replace("\\", "/")
    return p.rstrip(").,;")


def ensure_profile_md(p: str) -> str:
    p = norm_path(p)
    if p.lower().endswith("/profile.md"):
        return p
    # If worklists reference the directory, normalize to profile.md.
    if p.lower().startswith("leads/") and not p.lower().endswith(".md"):
        return p.rstrip("/") + "/profile.md"
    return p


def load_registered_entities_index_map() -> dict[int, str]:
    """
    Map LeadID -> canonical profile path for registered-entities leads.
    This is grounded truth for where a lead lives after duplicate quarantine.
    """
    if not INDEX_CSV.exists():
        raise SystemExit("Missing leads/index.csv. Run: python scripts/generate-lead-views.py")
    out: dict[int, str] = {}
    with INDEX_CSV.open(newline="", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            lid_s = (row.get("LeadID") or "").strip()
            if not lid_s.isdigit():
                continue
            lid = int(lid_s)
            batch = (row.get("Batch") or "").strip()
            if not batch.lower().startswith("registered-entities-batch-"):
                continue
            profile = ensure_profile_md(row.get("ProfilePath") or "")
            if profile.startswith("leads/"):
                out[lid] = profile
    return out


@dataclass(frozen=True)
class Change:
    worklist: Path
    lead_id: int
    old: str
    new: str
    line_preview: str


def iter_in_scope_worklists() -> list[Path]:
    if not BATCHES_ROOT.exists():
        return []
    out: list[Path] = []
    for p in sorted(BATCHES_ROOT.glob("*.md")):
        name = p.name
        if name in COMBINED_IN_SCOPE or WORKLIST_FILE_RE.match(name):
            out.append(p)
    return out


def fix_text(text: str, lid_to_profile: dict[int, str], worklist_path: Path) -> tuple[str, list[Change]]:
    lines = text.splitlines()
    changes: list[Change] = []

    for i, line in enumerate(lines):
        m = ITEM_RE.match(line)
        if not m:
            continue
        lead_id = int(m.group(1))
        canonical = lid_to_profile.get(lead_id, "")
        if not canonical:
            continue

        # Replace any leads/* path in parentheses with the canonical one for this LeadID.
        def repl(match: re.Match) -> str:
            old_raw = match.group(1)
            old = ensure_profile_md(old_raw)
            new = canonical
            if norm_path(old) == norm_path(new):
                return f"({old_raw})"
            changes.append(
                Change(
                    worklist=worklist_path,
                    lead_id=lead_id,
                    old=old,
                    new=new,
                    line_preview=line[:240],
                )
            )
            return f"({new})"

        new_line = PAREN_PATH_RE.sub(repl, line)
        lines[i] = new_line

    return "\n".join(lines) + ("\n" if text.endswith("\n") else ""), changes


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fix stale worklist profile links for registered-entities batches 001-010 by rewriting links to the canonical LeadID profile path from leads/index.csv."
    )
    parser.add_argument("--apply", action="store_true", help="Write changes to worklist files.")
    parser.add_argument(
        "--out",
        default="",
        help="Report path (default: reports/fix-worklist-profile-links-batches-001-010-<date>.md)",
    )
    args = parser.parse_args()

    lid_to_profile = load_registered_entities_index_map()
    worklists = iter_in_scope_worklists()

    all_changes: list[Change] = []
    touched_files = 0

    for wl in worklists:
        text = wl.read_text(encoding="utf-8", errors="ignore")
        fixed, changes = fix_text(text, lid_to_profile, wl)
        if changes:
            all_changes.extend(changes)
            touched_files += 1
            if args.apply:
                wl.write_text(fixed, encoding="utf-8")

    report_path = Path(args.out) if args.out else Path("reports") / (
        f"fix-worklist-profile-links-batches-001-010-{date.today().isoformat()}.md"
    )
    report_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    lines.append("# Fix Worklist Profile Links (Batches 001-010)")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append("")
    lines.append("## Summary")
    lines.append(f"- Mode: {'APPLY' if args.apply else 'DRY-RUN'}")
    lines.append(f"- Worklists scanned: {len(worklists)}")
    lines.append(f"- Files with changes: {touched_files}")
    lines.append(f"- Link rewrites: {len(all_changes)}")
    lines.append("")

    lines.append("## Changes (Sample)")
    if not all_changes:
        lines.append("- (none)")
    else:
        for c in all_changes[:200]:
            lines.append(
                f"- {c.worklist.as_posix()} | LeadID {c.lead_id} | {c.old} -> {c.new}"
            )
        if len(all_changes) > 200:
            lines.append(f"- (truncated, showing first 200 of {len(all_changes)})")
    lines.append("")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {report_path}")


if __name__ == "__main__":
    main()
