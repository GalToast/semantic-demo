from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path


@dataclass(frozen=True)
class Lead:
    lead_id: int
    name: str
    profile_path: str


def main() -> None:
    ap = argparse.ArgumentParser(description="Extract lead ids/names/profile paths from a disqualify move report.")
    ap.add_argument("--report", required=True)
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    report_path = Path(args.report)
    if not report_path.exists():
        raise SystemExit(f"Missing: {report_path.as_posix()}")

    today = date.today().isoformat()
    out_path = Path(args.out) if args.out else Path("tmp") / f"no-contact-social-sweep-leads-{today}.json"

    leads: list[Lead] = []
    for line in report_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        m = re.match(r"^- (\d+)\s+(.+?):\s+MOVE ->\s+`([^`]+)`\s*$", line.strip())
        if not m:
            continue
        leads.append(Lead(lead_id=int(m.group(1)), name=m.group(2).strip(), profile_path=m.group(3).strip()))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps([asdict(l) for l in leads], indent=2), encoding="utf-8")
    print(f"Wrote: {out_path.as_posix()}")
    print(f"Leads: {len(leads)}")


if __name__ == "__main__":
    main()

