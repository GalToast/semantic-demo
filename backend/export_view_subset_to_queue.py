#!/usr/bin/env python3
"""
Export a subset of a leads view (.md) into an outreach queue (.md).

Use case
- Create a "next N" research queue from views like:
  - leads/views/no-contact-website-no.md
  - leads/views/no-contact-website-yes.md

Notes
- This is a pure formatting/export step (no profile mutation).
"""

from __future__ import annotations

import argparse
import re
from datetime import date
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TODAY = date.today().isoformat()


def iter_view_rows(lines: list[str]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for line in lines:
        if not line.strip():
            continue
        if line.startswith("#") or line.startswith("Generated:") or line.startswith("Total:"):
            continue
        if "|" not in line:
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 2:
            continue
        lead_id = parts[0]
        name = parts[1]
        m = re.search(r"\bprofile:\s*([^\s]+)", line, flags=re.IGNORECASE)
        profile_path = m.group(1).strip() if m else ""
        out.append(
            {
                "lead_id": lead_id,
                "name": name,
                "profile_path": profile_path,
                "summary": line.strip(),
            }
        )
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--view", required=True, help="Path to a leads view markdown file.")
    ap.add_argument("--out", required=True, help="Output queue markdown path.")
    ap.add_argument("--limit", type=int, default=100, help="Max rows to export.")
    ap.add_argument("--offset", type=int, default=0, help="Skip the first N rows in the view.")
    ap.add_argument("--title", default="", help="Optional title override.")
    args = ap.parse_args()

    view_path = (REPO_ROOT / args.view).resolve() if not Path(args.view).is_absolute() else Path(args.view)
    if not view_path.exists():
        raise SystemExit(f"View not found: {view_path}")

    rows = iter_view_rows(view_path.read_text(encoding="utf-8", errors="ignore").splitlines())
    offset = max(0, int(args.offset or 0))
    subset = rows[offset : offset + max(0, args.limit)]

    out_path = (REPO_ROOT / args.out).resolve() if not Path(args.out).is_absolute() else Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    title = args.title.strip() or f"Queue Export: {Path(args.view).as_posix()}"
    md = [
        f"# {title}",
        f"Generated: {TODAY}",
        f"Source: `{Path(args.view).as_posix()}`",
        f"Total exported: {len(subset)}",
        f"Offset: {offset}",
        "",
        "Format: LeadID | Name | ProfilePath | Summary",
        "",
    ]
    for r in subset:
        md.append(f"- {r['lead_id']} | {r['name']} | {r['profile_path'] or 'MISSING'} | {r['summary']}")

    out_path.write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"Wrote: {out_path}")
    print(f"Exported: {len(subset)} / {len(rows)}")


if __name__ == "__main__":
    main()
