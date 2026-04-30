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

LABEL_RE = re.compile(r"^\s*([A-Za-z][A-Za-z /_-]*?):\s*(.*?)\s*$")
REGISTERED_BATCH_RE = re.compile(r"^registered-entities-batch-(\d{3})\b", re.IGNORECASE)


def norm(value: str | None) -> str:
    return (value or "").strip()


def low(value: str | None) -> str:
    return norm(value).lower()


def expected_batch_for_lead_id(lead_id: int) -> str:
    # registered-entities batch N covers ((N-1)*100+1) .. (N*100)
    batch_num = ((lead_id - 1) // 100) + 1
    return f"registered-entities-batch-{batch_num:03d}"


def lead_range_dir_for_id(lead_id: int) -> str:
    start = (lead_id // 100) * 100
    end = start + 99
    return f"{start:03d}-{end:03d}"


def parse_labels(text: str) -> dict[str, str]:
    labels: dict[str, str] = {}
    for line in text.splitlines():
        m = LABEL_RE.match(line)
        if not m:
            continue
        labels[m.group(1).strip().lower()] = m.group(2).strip()
    return labels


def replace_label_line(text: str, label: str, new_value: str) -> tuple[str, bool]:
    """
    Replace the first `Label: ...` line (case-insensitive) preserving the original label's casing.
    """
    pattern = re.compile(rf"^(\s*)({re.escape(label)})(\s*:\s*).*$", re.IGNORECASE | re.MULTILINE)

    def repl(match: re.Match) -> str:
        return f"{match.group(1)}{match.group(2)}{match.group(3)}{new_value}"

    new_text, count = pattern.subn(repl, text, count=1)
    return new_text, count > 0


@dataclass
class MovePlan:
    src_dir: Path
    dst_dir: Path
    lead_id_from_slug: int
    lead_id_from_batch_line: int
    batch_before: str
    batch_after: str
    source: str
    status: str
    root_kind: str  # profiles|disqualified


def iter_profile_mds() -> list[Path]:
    paths: list[Path] = []
    if PROFILES_ROOT.exists():
        paths.extend(sorted(PROFILES_ROOT.rglob("profile.md")))
    if DISQUALIFIED_ROOT.exists():
        paths.extend(sorted(DISQUALIFIED_ROOT.rglob("profile.md")))
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Realign profile folders so the numeric folder prefix matches `Batch line:` for registered-entities leads."
    )
    parser.add_argument("--apply", action="store_true", help="Apply moves and in-file normalizations (default: dry-run)")
    parser.add_argument(
        "--fix-batch",
        action="store_true",
        help="If set, normalize `Batch:` to the expected registered-entities batch for the (Batch line) lead id.",
    )
    parser.add_argument(
        "--quarantine-collisions",
        action="store_true",
        help="If set with --apply, move collision directories under leads/duplicates/ instead of leaving them in place.",
    )
    parser.add_argument(
        "--out",
        default="",
        help="Output report path (default: reports/realign-profile-folders-<date>.md)",
    )
    args = parser.parse_args()

    plans: list[MovePlan] = []
    skipped: list[tuple[Path, str]] = []

    for profile_md in iter_profile_mds():
        parent = profile_md.parent
        slug = parent.name
        m = re.match(r"^(\d+)-", slug)
        if not m:
            continue
        lead_id_from_slug = int(m.group(1))

        text = profile_md.read_text(encoding="utf-8", errors="ignore")
        labels = parse_labels(text)

        batch = norm(labels.get("batch"))
        batch_line = norm(labels.get("batch line"))
        source = norm(labels.get("source"))
        status = norm(labels.get("status"))

        if not batch or not REGISTERED_BATCH_RE.match(batch):
            continue
        if low(source) == "import":
            continue
        if not batch_line.isdigit():
            skipped.append((profile_md, f"non-numeric Batch line: {batch_line or '(missing)'}"))
            continue

        lead_id_from_batch_line = int(batch_line)
        if lead_id_from_batch_line <= 0:
            skipped.append((profile_md, f"invalid Batch line: {batch_line}"))
            continue

        if lead_id_from_batch_line == lead_id_from_slug:
            # Still optionally normalize Batch: for consistency.
            if args.apply and args.fix_batch:
                expected = expected_batch_for_lead_id(lead_id_from_batch_line)
                if norm(batch).lower() != expected.lower():
                    new_text, changed = replace_label_line(text, "Batch", expected)
                    if changed:
                        profile_md.write_text(new_text, encoding="utf-8")
            continue

        root_kind = "disqualified" if DISQUALIFIED_ROOT in profile_md.parents else "profiles"
        base_root = DISQUALIFIED_ROOT if root_kind == "disqualified" else PROFILES_ROOT

        dst_range = lead_range_dir_for_id(lead_id_from_batch_line)
        suffix = slug.split("-", 1)[1] if "-" in slug else slug
        dst_dir = base_root / dst_range / f"{lead_id_from_batch_line}-{suffix}"

        batch_after = expected_batch_for_lead_id(lead_id_from_batch_line) if args.fix_batch else batch

        plans.append(
            MovePlan(
                src_dir=parent,
                dst_dir=dst_dir,
                lead_id_from_slug=lead_id_from_slug,
                lead_id_from_batch_line=lead_id_from_batch_line,
                batch_before=batch,
                batch_after=batch_after,
                source=source,
                status=status,
                root_kind=root_kind,
            )
        )

    # Sort for stable output.
    plans.sort(key=lambda p: (p.lead_id_from_slug, p.src_dir.as_posix()))

    report_path = Path(args.out) if args.out else Path("reports") / f"realign-profile-folders-{date.today().isoformat()}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    collisions: list[MovePlan] = []
    applied: list[MovePlan] = []

    # Always compute collisions so dry-run output is actionable.
    for plan in plans:
        if plan.dst_dir.exists():
            collisions.append(plan)

    if args.apply:
        for plan in plans:
            if plan in collisions:
                continue
            plan.dst_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(plan.src_dir.as_posix(), plan.dst_dir.as_posix())

            # Optional in-file normalization after move.
            profile_md = plan.dst_dir / "profile.md"
            if profile_md.exists() and args.fix_batch:
                try:
                    text = profile_md.read_text(encoding="utf-8", errors="ignore")
                except OSError:
                    text = ""
                if text:
                    new_text, changed = replace_label_line(text, "Batch", plan.batch_after)
                    if changed:
                        profile_md.write_text(new_text, encoding="utf-8")

            applied.append(plan)

        if args.quarantine_collisions and collisions:
            for plan in collisions:
                # Preserve original relative path under leads/duplicates/{profiles|disqualified}/...
                if plan.root_kind == "disqualified":
                    rel = plan.src_dir.relative_to(DISQUALIFIED_ROOT)
                else:
                    rel = plan.src_dir.relative_to(PROFILES_ROOT)
                quarantine_dst = DUPE_ROOT / plan.root_kind / rel
                if quarantine_dst.exists():
                    # Don't overwrite; keep the collision in place and let the report surface it.
                    continue
                quarantine_dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(plan.src_dir.as_posix(), quarantine_dst.as_posix())

    lines: list[str] = []
    lines.append("# Realign Profile Folders to Batch Line")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append("")
    lines.append("## Summary")
    lines.append(f"- Mode: {'APPLY' if args.apply else 'DRY-RUN'}")
    lines.append(f"- Fix Batch: {'yes' if args.fix_batch else 'no'}")
    lines.append(f"- Planned moves: {len(plans)}")
    lines.append(f"- Collisions (destination exists): {len(collisions)}")
    if args.apply:
        lines.append(f"- Applied moves: {len(applied)}")
        lines.append(f"- Quarantine collisions: {'yes' if args.quarantine_collisions else 'no'}")
    lines.append(f"- Skipped (missing/non-numeric batch line): {len(skipped)}")
    lines.append("")

    def plan_row(plan: MovePlan) -> str:
        return (
            f"- {plan.lead_id_from_slug} -> {plan.lead_id_from_batch_line} | "
            f"batch: {plan.batch_before} -> {plan.batch_after} | "
            f"root: {plan.root_kind} | source: {plan.source or 'unknown'} | status: {plan.status or 'unknown'}\n"
            f"  src: {plan.src_dir.as_posix()}\n"
            f"  dst: {plan.dst_dir.as_posix()}"
        )

    lines.append("## Planned Moves")
    if not plans:
        lines.append("- (none)")
    else:
        lines.extend(plan_row(plan) for plan in plans[:500])
        if len(plans) > 500:
            lines.append(f"- (truncated, showing first 500 of {len(plans)})")
    lines.append("")

    lines.append("## Collisions (Destination Exists)")
    if not collisions:
        lines.append("- (none)")
    else:
        lines.extend(plan_row(plan) for plan in collisions[:200])
        if len(collisions) > 200:
            lines.append(f"- (truncated, showing first 200 of {len(collisions)})")
    lines.append("")

    lines.append("## Skipped (No Numeric Batch Line)")
    if not skipped:
        lines.append("- (none)")
    else:
        for path, reason in skipped[:200]:
            lines.append(f"- {path.as_posix()} | {reason}")
        if len(skipped) > 200:
            lines.append(f"- (truncated, showing first 200 of {len(skipped)})")
    lines.append("")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {report_path}")


if __name__ == "__main__":
    main()
