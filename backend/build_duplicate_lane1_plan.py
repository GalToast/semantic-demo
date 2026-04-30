from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path


WORKLIST_GLOB = "registered-entities-batch-*-worklist*.md"
PROFILE_ROOTS = ("leads/profiles/", "leads/disqualified/")
PROFILE_MD = "/profile.md"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build deterministic lane-1 duplicate quarantine plan from ambiguous-triage outputs "
            "(manual_source_conflict + safe subset of manual_batch_conflict)."
        )
    )
    parser.add_argument("--root", default=".", help="Repo root path.")
    parser.add_argument(
        "--source-conflicts",
        default="ops/tmp/duplicate-id-ambiguous-triage-2026-02-28/by-category/manual_source_conflict.json",
        help="JSON file containing manual_source_conflict triage items.",
    )
    parser.add_argument(
        "--batch-conflicts",
        default="ops/tmp/duplicate-id-ambiguous-triage-2026-02-28/by-category/manual_batch_conflict.json",
        help="JSON file containing manual_batch_conflict triage items.",
    )
    parser.add_argument(
        "--out-plan",
        default="ops/tmp/duplicate-id-lane1-plan-2026-02-28.json",
        help="Output path for the generated lane-1 plan JSON.",
    )
    return parser.parse_args()


def normalize_rel(path: str) -> str:
    return path.replace("\\", "/").strip()


def is_profile_path(path: str) -> bool:
    p = normalize_rel(path)
    return p.endswith(PROFILE_MD) and p.startswith(PROFILE_ROOTS)


def to_dir_path(profile_path: str) -> str:
    p = normalize_rel(profile_path)
    return p[: -len(PROFILE_MD)]


def quarantine_dest(src_dir: str) -> str:
    # Preserve original path under canonical duplicate quarantine root.
    return f"leads/duplicates/dupe-lead-ids/{normalize_rel(src_dir)}"


def load_items(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, dict):
        return list(payload.get("items", []))
    if isinstance(payload, list):
        return payload
    return []


def iter_worklist_referenced_profiles(root: Path) -> set[str]:
    """
    Parse worklists for profile links and normalize to profile.md paths.
    """
    refs: set[str] = set()
    batches_root = root / "leads" / "batches"
    if not batches_root.exists():
        return refs

    pattern = re.compile(r"\((leads/(?:profiles|disqualified)/[^)]+)\)")
    for wl in sorted(batches_root.glob(WORKLIST_GLOB)):
        text = wl.read_text(encoding="utf-8", errors="ignore")
        for line in text.splitlines():
            m = pattern.search(line)
            if not m:
                continue
            p = normalize_rel(m.group(1)).rstrip("/")
            if p.endswith(PROFILE_MD):
                refs.add(p)
            else:
                refs.add(f"{p}{PROFILE_MD}")
    return refs


def pick_keep_path(item: dict, refs: set[str], require_unique_ref: bool) -> tuple[str, str]:
    metas = [m for m in item.get("meta", []) if is_profile_path(m.get("path", ""))]
    if len(metas) < 2:
        return "", "insufficient_meta_paths"

    paths = [normalize_rel(m["path"]) for m in metas]
    protected = [p for p in paths if p in refs]

    if require_unique_ref:
        if len(protected) != 1:
            return "", "no_unique_worklist_referenced_profile"
        return protected[0], "unique_worklist_referenced_profile"

    if len(protected) == 1:
        return protected[0], "single_worklist_referenced_profile"

    keep = normalize_rel(item.get("keep_path", ""))
    if keep and keep in paths:
        return keep, "triage_keep_path"

    # Deterministic fallback if triage keep is missing: choose max score then path sort.
    sorted_metas = sorted(
        metas,
        key=lambda m: (float(m.get("score", 0.0)), normalize_rel(m.get("path", ""))),
        reverse=True,
    )
    return normalize_rel(sorted_metas[0]["path"]), "max_score_fallback"


def build_plan(
    root: Path, source_items: list[dict], batch_items: list[dict], refs: set[str]
) -> dict:
    moves: list[dict] = []
    groups: list[dict] = []
    skipped: list[dict] = []
    seen_src_dirs: set[str] = set()

    def add_group(item: dict, classification: str, require_unique_ref: bool) -> None:
        lead_id = item.get("lead_id")
        keep_path, keep_rule = pick_keep_path(item, refs, require_unique_ref=require_unique_ref)
        metas = [m for m in item.get("meta", []) if is_profile_path(m.get("path", ""))]
        all_paths = [normalize_rel(m["path"]) for m in metas]

        if not keep_path:
            skipped.append(
                {
                    "lead_id": lead_id,
                    "classification": classification,
                    "reason": keep_rule,
                    "paths": all_paths,
                }
            )
            return

        quarantine_paths = [p for p in all_paths if p != keep_path]
        if not quarantine_paths:
            skipped.append(
                {
                    "lead_id": lead_id,
                    "classification": classification,
                    "reason": "no_quarantine_paths",
                    "paths": all_paths,
                }
            )
            return

        groups.append(
            {
                "lead_id": lead_id,
                "classification": classification,
                "rule": keep_rule,
                "keep_path": keep_path,
                "quarantine_paths": quarantine_paths,
            }
        )

        for qpath in quarantine_paths:
            src_dir = to_dir_path(qpath)
            dst_dir = quarantine_dest(src_dir)
            src_abs = root / src_dir
            dst_abs = root / dst_dir

            if src_dir in seen_src_dirs:
                skipped.append(
                    {
                        "lead_id": lead_id,
                        "classification": classification,
                        "reason": "duplicate_src_dir_in_plan",
                        "src_dir": src_dir,
                    }
                )
                continue
            seen_src_dirs.add(src_dir)

            if not src_abs.exists():
                skipped.append(
                    {
                        "lead_id": lead_id,
                        "classification": classification,
                        "reason": "source_missing",
                        "src_dir": src_dir,
                    }
                )
                continue

            if dst_abs.exists():
                skipped.append(
                    {
                        "lead_id": lead_id,
                        "classification": classification,
                        "reason": "destination_exists",
                        "src_dir": src_dir,
                        "dst_dir": dst_dir,
                    }
                )
                continue

            moves.append(
                {
                    "lead_id": lead_id,
                    "classification": classification,
                    "rule": keep_rule,
                    "reason": f"lane1:{classification}:{keep_rule}",
                    "keep_path": keep_path,
                    "src_dir": src_dir,
                    "dst_dir": dst_dir,
                }
            )

    for item in source_items:
        add_group(item, "manual_source_conflict", require_unique_ref=False)

    for item in batch_items:
        add_group(item, "manual_batch_conflict", require_unique_ref=True)

    skipped_by_reason: dict[str, int] = {}
    for row in skipped:
        key = row.get("reason", "unknown")
        skipped_by_reason[key] = skipped_by_reason.get(key, 0) + 1

    counts_by_classification: dict[str, int] = {}
    for row in moves:
        key = row.get("classification", "unknown")
        counts_by_classification[key] = counts_by_classification.get(key, 0) + 1

    return {
        "summary": {
            "source_items": len(source_items),
            "batch_items": len(batch_items),
            "safe_groups": len(groups),
            "planned_moves": len(moves),
            "skipped": len(skipped),
            "moves_by_classification": counts_by_classification,
            "skipped_by_reason": skipped_by_reason,
        },
        "groups": groups,
        "moves": moves,
        "skipped": skipped,
    }


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    source_path = Path(args.source_conflicts)
    batch_path = Path(args.batch_conflicts)
    out_path = Path(args.out_plan)

    if not source_path.is_absolute():
        source_path = root / source_path
    if not batch_path.is_absolute():
        batch_path = root / batch_path
    if not out_path.is_absolute():
        out_path = root / out_path

    source_items = load_items(source_path)
    batch_items = load_items(batch_path)
    refs = iter_worklist_referenced_profiles(root)
    plan = build_plan(root, source_items, batch_items, refs)

    payload = {
        "generated_on": date.today().isoformat(),
        "root": root.as_posix(),
        "inputs": {
            "source_conflicts": source_path.as_posix(),
            "batch_conflicts": batch_path.as_posix(),
            "worklist_referenced_profiles": len(refs),
        },
        "rules": {
            "manual_source_conflict": "safe if profile metadata aligns except source; keep unique worklist ref when available, else triage keep path/score fallback",
            "manual_batch_conflict": "safe only when exactly one worklist-referenced profile path exists in group",
            "quarantine_destination": "leads/duplicates/dupe-lead-ids/<source_dir>",
        },
        **plan,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"Plan: {out_path}")
    print(f"Moves: {payload['summary']['planned_moves']}")
    print(f"Skipped: {payload['summary']['skipped']}")
    print(f"MovesByClass: {payload['summary']['moves_by_classification']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
