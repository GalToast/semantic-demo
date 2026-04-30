#!/usr/bin/env python3
"""
Merge Lighthouse batch artifacts across fast/retry/resume runs into one canonical CSV.

Priority order for metrics:
1) resume run
2) retry run
3) fast run
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path


def safe_slug(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return value[:80] or "lead"


def key_of(row: dict) -> tuple[str, str, str]:
    return (
        (row.get("name") or row.get("Name") or "").strip().lower(),
        (row.get("email") or row.get("Email") or "").strip().lower(),
        (row.get("website") or row.get("Website") or "").strip().lower(),
    )


def parse_lhr(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return None

    cats = data.get("categories", {})
    audits = data.get("audits", {})

    def cscore(k: str):
        v = (cats.get(k) or {}).get("score")
        return "" if v is None else round(float(v) * 100, 1)

    def aval(k: str):
        v = (audits.get(k) or {}).get("numericValue")
        return "" if v is None else round(float(v), 1)

    return {
        "performance": cscore("performance"),
        "accessibility": cscore("accessibility"),
        "best_practices": cscore("best-practices"),
        "seo": cscore("seo"),
        "fcp_ms": aval("first-contentful-paint"),
        "lcp_ms": aval("largest-contentful-paint"),
        "tbt_ms": aval("total-blocking-time"),
        "cls": (audits.get("cumulative-layout-shift") or {}).get("numericValue", ""),
        "speed_index_ms": aval("speed-index"),
        "tti_ms": aval("interactive"),
    }


def load_by_index(run_dir: Path, rows_count: int) -> dict[int, dict]:
    out: dict[int, dict] = {}
    for i in range(1, rows_count + 1):
        # Directory names are prefixed with zero-padded index, e.g. 0001-...
        prefix = f"{i:04d}-"
        matches = [p for p in run_dir.iterdir() if p.is_dir() and p.name.startswith(prefix)] if run_dir.exists() else []
        if not matches:
            continue
        j = matches[0] / "lighthouse-mid5g.json"
        m = parse_lhr(j)
        if m:
            out[i] = m
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Merge fast/retry/resume Lighthouse outputs.")
    ap.add_argument("--base-csv", required=True)
    ap.add_argument("--fast-dir", required=True)
    ap.add_argument("--fast-summary-csv", required=True)
    ap.add_argument("--retry-input-csv", required=True)
    ap.add_argument("--retry-dir", required=True)
    ap.add_argument("--resume-input-csv", required=True)
    ap.add_argument("--resume-dir", required=True)
    ap.add_argument("--out-csv", required=True)
    args = ap.parse_args()

    base_csv = Path(args.base_csv)
    fast_dir = Path(args.fast_dir)
    fast_summary_csv = Path(args.fast_summary_csv)
    retry_input_csv = Path(args.retry_input_csv)
    retry_dir = Path(args.retry_dir)
    resume_input_csv = Path(args.resume_input_csv)
    resume_dir = Path(args.resume_dir)
    out_csv = Path(args.out_csv)
    out_csv.parent.mkdir(parents=True, exist_ok=True)

    base_rows = list(csv.DictReader(base_csv.open(encoding="utf-8-sig")))
    n = len(base_rows)

    # Initialize canonical output rows
    merged = []
    for i, r in enumerate(base_rows, start=1):
        merged.append(
            {
                "idx": i,
                "name": (r.get("name") or "").strip(),
                "email": (r.get("email") or "").strip(),
                "website": (r.get("website") or "").strip(),
                "status": "missing",
                "source": "",
                "performance": "",
                "accessibility": "",
                "best_practices": "",
                "seo": "",
                "fcp_ms": "",
                "lcp_ms": "",
                "tbt_ms": "",
                "cls": "",
                "speed_index_ms": "",
                "tti_ms": "",
            }
        )

    # Map base key -> base idx
    base_key_to_idx: dict[tuple[str, str, str], int] = {}
    for i, r in enumerate(base_rows, start=1):
        base_key_to_idx[key_of(r)] = i

    # Fast run coverage by index
    fast_by_index = load_by_index(fast_dir, n)
    for i, m in fast_by_index.items():
        row = merged[i - 1]
        row.update(m)
        row["status"] = "ok"
        row["source"] = "fast"

    # Build retry index -> base idx using retry input row order
    retry_rows = list(csv.DictReader(retry_input_csv.open(encoding="utf-8-sig")))
    retry_to_base: dict[int, int] = {}
    for i, rr in enumerate(retry_rows, start=1):
        k = key_of(rr)
        if k in base_key_to_idx:
            retry_to_base[i] = base_key_to_idx[k]

    retry_by_index = load_by_index(retry_dir, len(retry_rows))
    for retry_i, m in retry_by_index.items():
        base_i = retry_to_base.get(retry_i)
        if not base_i:
            continue
        row = merged[base_i - 1]
        row.update(m)
        row["status"] = "ok"
        row["source"] = "retry"

    # Resume index -> base idx via resume input row order
    resume_rows = list(csv.DictReader(resume_input_csv.open(encoding="utf-8-sig")))
    resume_to_base: dict[int, int] = {}
    for i, rr in enumerate(resume_rows, start=1):
        k = key_of(rr)
        if k in base_key_to_idx:
            resume_to_base[i] = base_key_to_idx[k]

    resume_by_index = load_by_index(resume_dir, len(resume_rows))
    for resume_i, m in resume_by_index.items():
        base_i = resume_to_base.get(resume_i)
        if not base_i:
            continue
        row = merged[base_i - 1]
        row.update(m)
        row["status"] = "ok"
        row["source"] = "resume"

    fieldnames = list(merged[0].keys()) if merged else [
        "idx",
        "name",
        "email",
        "website",
        "status",
        "source",
        "performance",
        "accessibility",
        "best_practices",
        "seo",
        "fcp_ms",
        "lcp_ms",
        "tbt_ms",
        "cls",
        "speed_index_ms",
        "tti_ms",
    ]

    with out_csv.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in merged:
            w.writerow(r)

    ok = sum(1 for r in merged if r["status"] == "ok")
    by_source = {}
    for r in merged:
        src = r["source"] or "none"
        by_source[src] = by_source.get(src, 0) + 1

    print(f"total={len(merged)} ok={ok} missing={len(merged)-ok}")
    print("source_counts=" + json.dumps(by_source, sort_keys=True))
    print(f"out_csv={out_csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

