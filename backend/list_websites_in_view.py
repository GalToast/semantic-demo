#!/usr/bin/env python3
"""
List (LeadID, Name, Website, ProfilePath) for profiles referenced by a leads view markdown file.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path


ROW_RE = re.compile(r"^\s*(\d+)\s*\|\s*([^|]+?)\s*\|")
PROFILE_RE = re.compile(r"\bprofile:\s*([^\s]+)", re.IGNORECASE)


def find_header_value(path: Path, key: str) -> str:
    if not path.exists():
        return ""
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines()[:120]:
        if line.lower().startswith(key.lower() + ":"):
            return line.split(":", 1)[1].strip()
    return ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--view", required=True)
    args = ap.parse_args()

    view_path = Path(args.view)
    if not view_path.exists():
        raise SystemExit(f"View not found: {view_path}")

    rows = []
    for line in view_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not line or "|" not in line:
            continue
        if line.startswith("#") or line.startswith("Generated") or line.startswith("Total"):
            continue
        m = ROW_RE.match(line)
        if not m:
            continue
        lead_id = m.group(1).strip()
        name = m.group(2).strip()
        pm = PROFILE_RE.search(line)
        profile = Path(pm.group(1)) if pm else None
        website = find_header_value(profile, "Website") if profile else ""
        rows.append((lead_id, name, website, str(profile) if profile else ""))

    print(f"count {len(rows)}")
    for lead_id, name, website, profile in rows:
        print(f"{lead_id}\t{name}\t{website}\t{profile}")


if __name__ == "__main__":
    main()
