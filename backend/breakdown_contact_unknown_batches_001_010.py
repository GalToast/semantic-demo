from __future__ import annotations

import csv
from collections import Counter
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
INDEX_CSV = REPO_ROOT / "leads" / "index.csv"
REPORT_PATH = REPO_ROOT / "reports" / f"contact-unknown-batches-001-010-{date.today().isoformat()}.md"


def norm(v: str | None) -> str:
    return (v or "").strip().lower()


def yes(v: str | None) -> bool:
    return norm(v) in {"yes", "y", "true", "1"}


def is_disqualified(row: dict[str, str]) -> bool:
    return yes(row.get("Disqualified")) or norm(row.get("Status")) == "disqualified"


@dataclass(frozen=True)
class Stats:
    total: int
    unknown_total: int
    unknown_disq: int
    unknown_qual: int
    qual_uncontacted_total: int
    qual_uncontacted_unknown: int
    unknown_by_batch: Counter[str]


def compute(rows: list[dict[str, str]]) -> Stats:
    unknown = [r for r in rows if norm(r.get("ContactPath")) == "unknown"]
    unknown_disq = [r for r in unknown if is_disqualified(r)]
    unknown_qual = [r for r in unknown if not is_disqualified(r)]

    qual_uncontacted = [
        r
        for r in rows
        if (not is_disqualified(r)) and norm(r.get("OutreachStatus")) == "uncontacted"
    ]
    qual_uncontacted_unknown = [r for r in qual_uncontacted if norm(r.get("ContactPath")) == "unknown"]

    unknown_by_batch = Counter((r.get("Batch") or "").strip() for r in unknown)

    return Stats(
        total=len(rows),
        unknown_total=len(unknown),
        unknown_disq=len(unknown_disq),
        unknown_qual=len(unknown_qual),
        qual_uncontacted_total=len(qual_uncontacted),
        qual_uncontacted_unknown=len(qual_uncontacted_unknown),
        unknown_by_batch=unknown_by_batch,
    )


def main() -> None:
    if not INDEX_CSV.exists():
        raise SystemExit(f"Missing {INDEX_CSV.as_posix()} (run scripts/generate-lead-views.py)")

    batches = {f"registered-entities-batch-{i:03d}" for i in range(1, 11)}
    rows: list[dict[str, str]] = []
    with INDEX_CSV.open(newline="", encoding="utf-8", errors="ignore") as f:
        for r in csv.DictReader(f):
            if (r.get("Batch") or "").strip() not in batches:
                continue
            rows.append(r)

    s = compute(rows)

    lines: list[str] = []
    lines.append("# Contact Path Unknown Breakdown (Batches 001-010)")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append("")
    lines.append(f"- Source: `{INDEX_CSV.as_posix()}`")
    lines.append("")
    lines.append("## Summary")
    lines.append(f"- Batches 001-010 total leads: {s.total}")
    lines.append(f"- Contact path unknown (all): {s.unknown_total}")
    lines.append(f"- Contact path unknown (disqualified): {s.unknown_disq}")
    lines.append(f"- Contact path unknown (qualified): {s.unknown_qual}")
    lines.append("")
    lines.append("## Qualified + Uncontacted Slice")
    lines.append(f"- Qualified + Uncontacted total: {s.qual_uncontacted_total}")
    lines.append(f"- Qualified + Uncontacted + Contact unknown: {s.qual_uncontacted_unknown}")
    lines.append("")
    lines.append("## Unknown By Batch (Top 10)")
    for b, n in s.unknown_by_batch.most_common(10):
        lines.append(f"- {b}: {n}")
    lines.append("")

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote: {REPORT_PATH.as_posix()}")


if __name__ == "__main__":
    main()

