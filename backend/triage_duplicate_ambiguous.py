from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


SOURCE_RE = re.compile(r"^Source:\s*(.*)$", re.IGNORECASE | re.MULTILINE)
BATCH_RE = re.compile(r"^Batch:\s*(.*)$", re.IGNORECASE | re.MULTILINE)
STATUS_RE = re.compile(r"^Status:\s*(.*)$", re.IGNORECASE | re.MULTILINE)
TITLE_RE = re.compile(r"^#\s*(.+?)\s*$", re.MULTILINE)

FIELD_KEYS = [
    "Address",
    "Phone",
    "Email",
    "Website",
    "Contact form",
    "Social media",
    "NAICS",
    "Distance (zip centroid)",
    "Decision maker",
]
FIELD_PATTERNS = {
    key: re.compile(rf"^{re.escape(key)}:\s*(.*)$", re.IGNORECASE | re.MULTILINE) for key in FIELD_KEYS
}
MISSING_VALUES = {"", "unknown", "not found", "n/a", "none", "-", "not listed", "unassigned"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Triage ambiguous duplicate lead ID groups.")
    parser.add_argument("--root", default=".", help="Repo root path.")
    parser.add_argument("--input", required=True, help="Path to ambiguous duplicate groups JSON.")
    parser.add_argument("--output", required=True, help="Path to write triage JSON.")
    return parser.parse_args()


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def is_present(value: str) -> bool:
    low = normalize_text(value)
    if low in MISSING_VALUES:
        return False
    for mv in ("not found", "unknown", "n/a", "none"):
        if low.startswith(mv):
            return False
    return True


def read_profile_meta(repo_root: Path, rel_path: str) -> dict:
    abs_path = repo_root / rel_path
    text = abs_path.read_text(encoding="utf-8", errors="ignore") if abs_path.exists() else ""

    source = SOURCE_RE.search(text).group(1).strip() if SOURCE_RE.search(text) else ""
    batch = BATCH_RE.search(text).group(1).strip() if BATCH_RE.search(text) else ""
    status = STATUS_RE.search(text).group(1).strip() if STATUS_RE.search(text) else ""
    title = TITLE_RE.search(text).group(1).strip() if TITLE_RE.search(text) else ""

    present_fields = 0
    for key, pattern in FIELD_PATTERNS.items():
        match = pattern.search(text)
        value = match.group(1).strip() if match else ""
        if is_present(value):
            present_fields += 1

    bucket = Path(rel_path).parts[1] if len(Path(rel_path).parts) > 1 else "unknown"
    slug = Path(rel_path).parent.name

    score = float(present_fields)
    if batch and normalize_text(batch) not in {"unknown", "unassigned", "batch line:"}:
        score += 2.0
    if source and normalize_text(source) not in {"unknown", "unassigned"}:
        score += 1.0
    if status and normalize_text(status) != "new":
        score += 1.0
    score += len(slug) / 1000.0

    return {
        "path": rel_path,
        "bucket": bucket,
        "slug": slug,
        "title": title,
        "source": source,
        "batch": batch,
        "status": status,
        "present_fields": present_fields,
        "score": round(score, 3),
    }


def real_batch_set(values: list[str]) -> set[str]:
    out: set[str] = set()
    for value in values:
        norm = normalize_text(value)
        if norm in {"", "unknown", "unassigned", "batch line:"}:
            continue
        out.add(norm)
    return out


def triage_group(repo_root: Path, group: dict) -> dict:
    paths = []
    if "paths" in group:
        paths = list(group["paths"])
    else:
        paths = list(group.get("profiles_paths", [])) + list(group.get("disqualified_paths", []))

    metas = [read_profile_meta(repo_root, path) for path in paths]
    metas = [m for m in metas if m["path"]]
    metas.sort(key=lambda x: x["score"], reverse=True)

    statuses = {normalize_text(m["status"]) for m in metas if m["status"]}
    sources = {normalize_text(m["source"]) for m in metas if m["source"]}
    batches = real_batch_set([m["batch"] for m in metas if m["batch"]])
    buckets = {m["bucket"] for m in metas}
    names = {normalize_name(m["title"] or m["slug"]) for m in metas}

    classification = "manual_review"
    rationale = []
    confidence = "low"

    if "profiles" in buckets and "disqualified" in buckets:
        classification = "manual_cross_bucket"
        rationale.append("duplicate lead id appears in both active and disqualified buckets")
    elif len(batches) > 1:
        classification = "manual_batch_conflict"
        rationale.append("conflicting non-placeholder batch markers")
    elif len(statuses) > 1:
        classification = "manual_status_conflict"
        rationale.append("conflicting statuses across duplicate id paths")
    elif len(sources) > 1:
        classification = "manual_source_conflict"
        rationale.append("conflicting sources across duplicate id paths")
    elif len(names) > 1:
        classification = "review_name_variant"
        rationale.append("different normalized names/slugs for same lead id")
        confidence = "medium"
    else:
        classification = "candidate_safe_merge"
        rationale.append("metadata aligned enough for safe merge/quarantine")
        confidence = "high"

    keep_path = metas[0]["path"] if metas else ""
    quarantine_paths = [m["path"] for m in metas[1:]] if len(metas) > 1 else []

    return {
        "lead_id": group.get("lead_id"),
        "original_reason": group.get("reason", ""),
        "classification": classification,
        "confidence": confidence,
        "rationale": rationale,
        "keep_path": keep_path,
        "quarantine_paths": quarantine_paths,
        "meta": metas,
    }


def main() -> int:
    args = parse_args()
    repo_root = Path(args.root).resolve()
    in_path = Path(args.input)
    out_path = Path(args.output)
    if not in_path.is_absolute():
        in_path = repo_root / in_path
    if not out_path.is_absolute():
        out_path = repo_root / out_path

    groups = json.loads(in_path.read_text(encoding="utf-8"))
    triaged = [triage_group(repo_root, group) for group in groups]

    summary: dict[str, int] = {}
    for item in triaged:
        key = item["classification"]
        summary[key] = summary.get(key, 0) + 1

    payload = {
        "input": in_path.as_posix(),
        "count": len(triaged),
        "summary": summary,
        "items": triaged,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"Triaged: {len(triaged)}")
    print("Summary:", summary)
    print(f"Output: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

