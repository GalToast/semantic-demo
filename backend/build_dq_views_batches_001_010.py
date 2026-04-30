#!/usr/bin/env python3
"""
Build small view files (with `profile:` tokens) for disqualified leads in batches 001-010.

These are used as inputs to other maintenance scripts that accept `--from-view`,
because our standard `leads/views/*.md` files are global (not batch-scoped).
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
INDEX_CSV = REPO_ROOT / "leads" / "index.csv"
OUT_DIR = REPO_ROOT / "tmp"

BATCH_RE = re.compile(r"batch-(\d{3})")

MISSING = {"", "unknown", "not found", "n/a", "na", "none", "-", "null"}


def norm(v: str | None) -> str:
    return (v or "").strip()


def low(v: str | None) -> str:
    return norm(v).lower()


def yes(v: str | None) -> bool:
    return low(v) in {"yes", "y", "true", "1"}


def batch_num(batch: str) -> int | None:
    m = BATCH_RE.search(batch or "")
    return int(m.group(1)) if m else None


def has_website(v: str | None) -> bool:
    s = low(v)
    if not s or s in MISSING:
        return False
    if s.startswith(("http://", "https://")):
        return True
    return "." in s and " " not in s


@dataclass(frozen=True)
class Entry:
    lead_id: str
    name: str
    batch: str
    status: str
    outreach: str
    website: str
    profile: str


def main() -> None:
    today = date.today().isoformat()
    if not INDEX_CSV.exists():
        raise SystemExit(f"Missing {INDEX_CSV.as_posix()} (run scripts/generate-lead-views.py)")

    entries: list[Entry] = []
    entries_web: list[Entry] = []

    with INDEX_CSV.open(newline="", encoding="utf-8", errors="ignore") as f:
        for r in csv.DictReader(f):
            b = batch_num(norm(r.get("Batch")))
            if b is None or b < 1 or b > 10:
                continue
            if not (yes(r.get("Disqualified")) or low(r.get("Status")) == "disqualified"):
                continue
            prof = norm(r.get("ProfilePath"))
            if not prof:
                continue
            e = Entry(
                lead_id=norm(r.get("LeadID")),
                name=norm(r.get("Name")),
                batch=norm(r.get("Batch")),
                status=norm(r.get("Status")) or "unknown",
                outreach=norm(r.get("OutreachStatus")) or "unknown",
                website=norm(r.get("Website")),
                profile=prof,
            )
            entries.append(e)
            if has_website(e.website):
                entries_web.append(e)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_all = OUT_DIR / f"view-dq-batches-001-010-{today}.md"
    out_web = OUT_DIR / f"view-dq-batches-001-010-website-yes-{today}.md"

    def render(title: str, rows: list[Entry]) -> str:
        lines: list[str] = []
        lines.append(f"# {title}")
        lines.append(f"Generated: {today}")
        lines.append(f"Total: {len(rows)}")
        lines.append("")
        for e in rows:
            # Keep it simple; consumers only require the `profile:` token.
            lines.append(
                f"- {e.lead_id} | {e.name} | {e.batch} | status:{e.status} | outreach:{e.outreach} | profile: {e.profile}"
            )
        lines.append("")
        return "\n".join(lines)

    out_all.write_text(render("DQ View (Batches 001-010)", entries), encoding="utf-8")
    out_web.write_text(render("DQ View (Batches 001-010, Website Present)", entries_web), encoding="utf-8")

    print(f"Wrote: {out_all.as_posix()} ({len(entries)})")
    print(f"Wrote: {out_web.as_posix()} ({len(entries_web)})")


if __name__ == "__main__":
    main()

