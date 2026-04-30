"""
Prefill DQ/KEEP for the "review only" no-website triage list.

This is a second-pass classifier that aims to shrink the "no website" pool.
It marks KEEP only when there are reasonable signals the entity is an operating business
worth further search (even if home-based), and DQ when it looks like a shell/holding entity
or there is no public presence after a pass.

It writes:
- a prefilled triage markdown (same checkbox format)
- a suggestions report with reasons (for auditing/spot-checking)
"""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path


RE_TRIAGE_ROW = re.compile(
    r"^\s*-\s*\[\s*\]\s*DQ\s*\[\s*\]\s*KEEP\s*\|\s*(?P<id>\d+)\s*\|\s*(?P<name>[^|]+?)\s*\|\s*(?P<path>\S+)\s*$"
)


COMMERCIAL_ADDR_HINTS = [
    " ste ",
    " suite",
    " unit ",
    " bldg",
    " building",
    " plaza",
    " center",
    " ctr",
]


SHELL_TOKENS = {
    "properties",
    "property",
    "investments",
    "investment",
    "holding",
    "holdings",
    "management",
    "capital",
    "development",
    "ventures",
    "partners",
    "gp",
    "lp",
    "realty",
    "leasing",
    "reserve",
}


OPERATING_TOKENS = {
    # service / trade / obvious operator words
    "construction",
    "paving",
    "masonry",
    "cabinets",
    "doors",
    "roofing",
    "hvac",
    "heating",
    "air",
    "repair",
    "auto",
    "tax",
    "bookkeeping",
    "consulting",
    "inspections",
    "inspection",
    "mortuary",
    "precision",
    "works",
    "fabrication",
    "sanctuary",
    "rehabilitation",
    "adoption",
    "boutique",
    "design",
    "designs",
    "creations",
    "custom",
    "personal",
    "care",
    "glow",
    "beau",
    "mfg",
    "manufacturing",
    "storefront",
    "aluminum",
    "ammo",
    "tax",
}


def norm(s: str) -> str:
    s = s.lower().strip()
    s = s.replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def extract_fields(profile_path: Path) -> dict[str, str]:
    fields: dict[str, str] = {}
    if not profile_path.exists():
        return fields
    for ln in profile_path.read_text(encoding="utf-8", errors="replace").splitlines()[:90]:
        if ":" not in ln:
            continue
        k, v = ln.split(":", 1)
        k = k.strip()
        v = v.strip()
        if k in {
            "Status",
            "Outreach status",
            "Contact path",
            "Source",
            "Address",
            "Phone",
            "Email",
            "Website",
            "Contact form",
            "Social media",
            "NAICS",
            "Contact search",
            "Last updated",
        }:
            fields[k] = v
    return fields


def has_real_value(v: str | None) -> bool:
    if not v:
        return False
    low = v.strip().lower()
    return low not in {"unknown", "not found", "none found", "n/a", "na"}


@dataclass(frozen=True)
class Row:
    lead_id: int
    name: str
    profile_path: Path


def parse_review_triage(path: Path) -> list[Row]:
    rows: list[Row] = []
    for ln in path.read_text(encoding="utf-8", errors="replace").splitlines():
        m = RE_TRIAGE_ROW.match(ln)
        if not m:
            continue
        rows.append(Row(int(m.group("id")), m.group("name").strip(), Path(m.group("path"))))
    return rows


def recommend(row: Row) -> tuple[str, str]:
    """
    Returns (decision, reason) where decision is KEEP or DQ.
    Conservative rule: KEEP when there are plausible operator signals; otherwise DQ.
    """
    fields = extract_fields(row.profile_path)
    text = ""
    if row.profile_path.exists():
        text = row.profile_path.read_text(encoding="utf-8", errors="replace").lower()

    name_n = norm(row.name)
    tokens = set(name_n.split())
    address = (fields.get("Address") or "").lower()

    # If we already have any contact method recorded, keep.
    if any(has_real_value(fields.get(k)) for k in ["Phone", "Email", "Website", "Social media", "Contact form"]):
        return ("KEEP", "some contact field already present in profile (worth pursuing)")

    # Direct note signals
    if "holding company" in text or "shell" in text:
        return ("DQ", "profile notes indicate holding/shell entity")
    if "no public presence" in text and "recommendation" in text:
        return ("DQ", "prior research notes: no public presence after a search pass")
    if "residential property" in text and "no online presence" in text:
        return ("DQ", "residential property + no online presence found")

    # Address heuristics
    addr_commercial = any(h in f" {address} " for h in COMMERCIAL_ADDR_HINTS)
    if addr_commercial:
        return ("KEEP", "address looks commercial/office-like (worth directory/owner search)")

    # Owner/LinkedIn hint
    if "linkedin.com/in/" in text:
        return ("KEEP", "owner/individual LinkedIn identified (alt contact path)")

    # Name heuristics
    if tokens & OPERATING_TOKENS:
        return ("KEEP", f"business name suggests an operating service/trade ({', '.join(sorted(tokens & OPERATING_TOKENS))})")

    if tokens & SHELL_TOKENS:
        return ("DQ", f"name suggests shell/asset entity ({', '.join(sorted(tokens & SHELL_TOKENS))})")

    # Default: if we couldn't find anything last time and it's still empty, DQ to shrink the pool.
    # We can always re-add later if needed.
    return ("DQ", "no contact methods found and no strong operating signals; disqualifying to keep the queue actionable")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--review-triage", required=True)
    ap.add_argument("--out-triage", required=True)
    ap.add_argument("--out-report", required=True)
    args = ap.parse_args()

    inp = Path(args.review_triage)
    rows = parse_review_triage(inp)
    if not rows:
        print("No rows parsed from review triage file.")
        return 1

    # Prefill triage and build report
    out_lines = []
    report_lines = []
    report_lines.append("# No-Website Review Triage Suggestions (Second Pass)")
    report_lines.append(f"Generated: {date.today().isoformat()}")
    report_lines.append(f"Input: `{inp.as_posix()}`")
    report_lines.append("")
    report_lines.append("Format: Decision | LeadID | Name | Reason | ProfilePath")
    report_lines.append("")

    keep = 0
    dq = 0
    for row in rows:
        decision, reason = recommend(row)
        if decision == "KEEP":
            keep += 1
            dq_box, keep_box = " ", "x"
        else:
            dq += 1
            dq_box, keep_box = "x", " "

        out_lines.append(f"- [{dq_box}] DQ [{keep_box}] KEEP | {row.lead_id} | {row.name} | {row.profile_path.as_posix()}")
        report_lines.append(f"- {decision} | {row.lead_id} | {row.name} | {reason.replace('|','/')} | {row.profile_path.as_posix()}")

    outp = Path(args.out_triage)
    outp.parent.mkdir(parents=True, exist_ok=True)
    outp.write_text("\n".join(out_lines) + "\n", encoding="utf-8")

    rep = Path(args.out_report)
    rep.parent.mkdir(parents=True, exist_ok=True)
    rep.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    print(f"Rows: {len(rows)}")
    print(f"KEEP: {keep}")
    print(f"DQ: {dq}")
    print(f"Wrote triage: {outp}")
    print(f"Wrote report: {rep}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

