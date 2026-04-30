"""
Prefill a triage checklist's DQ/KEEP checkboxes from a suggestions file.

Suggestions format (one per line):
  - KEEP | <LeadID> | <Name> | <Why> | <ProfilePath>
  - DQ   | <LeadID> | <Name> | <Why> | <ProfilePath>
  - REVIEW | ...

Triage format:
  - [ ] DQ [ ] KEEP | <LeadID> | <Name> | <ProfilePath>

Behavior:
- KEEP/DQ: checks the corresponding box
- REVIEW: leaves both unchecked
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path


RE_SUGG = re.compile(r"^\s*-\s*(KEEP|DQ|REVIEW)\s*\|\s*(\d+)\s*\|")
RE_TRIAGE = re.compile(
    r"^(\s*-\s*)\[(?P<dq>[ xX])\](\s*DQ\s*)\[(?P<keep>[ xX])\](\s*KEEP\s*\|\s*)(?P<id>\d+)(\s*\|.*)$"
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--triage", required=True)
    ap.add_argument("--suggestions", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    triage_path = Path(args.triage)
    sugg_path = Path(args.suggestions)
    out_path = Path(args.out)

    sugg: dict[int, str] = {}
    for line in sugg_path.read_text(encoding="utf-8", errors="replace").splitlines():
        m = RE_SUGG.match(line)
        if not m:
            continue
        dec = m.group(1)
        lead_id = int(m.group(2))
        sugg[lead_id] = dec

    lines_out = []
    changed = 0
    for line in triage_path.read_text(encoding="utf-8", errors="replace").splitlines():
        m = RE_TRIAGE.match(line)
        if not m:
            lines_out.append(line)
            continue
        lead_id = int(m.group("id"))
        dec = sugg.get(lead_id, "REVIEW")
        dq = "x" if dec == "DQ" else " "
        keep = "x" if dec == "KEEP" else " "
        if dq != m.group("dq") or keep != m.group("keep"):
            changed += 1
        lines_out.append(f"{m.group(1)}[{dq}]{m.group(3)}[{keep}]{m.group(5)}{lead_id}{m.group(7)}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines_out) + "\n", encoding="utf-8")
    print(f"Wrote: {out_path}")
    print(f"Prefilled rows: {changed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

