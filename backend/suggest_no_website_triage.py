"""
Suggest DQ vs KEEP for the "no website" triage list, based on lightweight heuristics.

This does NOT modify lead profiles. It writes a suggestions markdown file to speed up
manual marking.
"""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


RE_QUEUE = re.compile(r"^\s*-\s*\[\s*\]\s*DQ\s*\[\s*\]\s*KEEP\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(\S+)\s*$")


DQ_NAME_KEYWORDS = [
    # Token/phrase-level keywords that often indicate shells/asset entities.
    # IMPORTANT: avoid short substring matching (e.g. "lp" appears in "alpaca").
    "properties",
    "property",
    "investments",
    "holding",
    "holdings",
    "management",
    "capital",
    "development",
    "ventures",
    "partners",
    "gp",
    "lp",
    "owner",
    "trail development",
    "reserve",
    "real estate",
    "leasing",
]


KEEP_HINTS = [
    "home builder",
    "construction",
    "consulting",
    "restaurant",
    "repair",
    "cleaning",
    "lawn",
    "electric",
    "plumbing",
    "roof",
    "truck",
    "transport",
    "salon",
    "bookkeeping",
]


def norm(s: str) -> str:
    s = s.lower().strip()
    s = s.replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


@dataclass(frozen=True)
class Item:
    lead_id: int
    name: str
    profile_path: Path


def parse_triage(path: Path) -> list[Item]:
    items: list[Item] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        m = RE_QUEUE.match(line)
        if not m:
            continue
        items.append(Item(int(m.group(1)), m.group(2).strip(), Path(m.group(3))))
    return items


def extract_header_fields(profile_text: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for ln in profile_text.splitlines()[:80]:
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
            "Website status",
            "Contact form",
            "Social media",
            "NAICS",
            "Batch",
            "Batch line",
            "Contact search",
            "Last updated",
        }:
            fields[k] = v
    return fields


def suggest(item: Item) -> tuple[str, str]:
    """
    Returns (recommendation, reason)
    recommendation: "DQ", "KEEP", or "REVIEW"
    """
    if not item.profile_path.exists():
        return ("REVIEW", "missing profile file")

    text = item.profile_path.read_text(encoding="utf-8", errors="replace")
    low = text.lower()
    fields = extract_header_fields(text)

    name_n = norm(item.name)
    name_tokens = set(name_n.split())
    address = (fields.get("Address") or "").lower()
    website = (fields.get("Website") or "").lower()
    phone = (fields.get("Phone") or "").lower()
    email = (fields.get("Email") or "").lower()
    social = (fields.get("Social media") or "").lower()

    has_any_contact = any(
        v and v not in {"unknown", "not found", "not found (dns:)", "not found (dns)"} for v in [website, phone, email, social]
    )

    # Strong DQ signals from notes
    if "possible holding company" in low or "holding company" in low:
        return ("DQ", "profile notes indicate holding/shell company")
    if "residential property" in low and not has_any_contact:
        return ("DQ", "residential address + no verifiable public presence found")
    if "single-family residence" in low and not has_any_contact:
        return ("DQ", "address appears residential + no public presence found")

    # Name-based DQ heuristics (only strong if no contact info found)
    if not has_any_contact:
        for kw in DQ_NAME_KEYWORDS:
            kw_n = norm(kw)
            if not kw_n:
                continue
            if " " in kw_n:
                # Phrase match with word boundaries.
                if f" {kw_n} " in f" {name_n} ":
                    return ("DQ", f"name suggests shell/asset entity ('{kw}') and no public presence found")
                continue
            # Token-only match for single-word keywords (prevents substring false positives).
            if kw_n in name_tokens:
                return ("DQ", f"name suggests shell/asset entity ('{kw}') and no public presence found")

    # KEEP signals: owned domain mentioned, office suite, or clear service identity.
    if "dns:" in website or "domain" in low:
        # Many of these have dead domains; still worth keeping if it's a real operator.
        if any(h in low for h in KEEP_HINTS):
            return ("KEEP", "looks like an operating business; has/claimed owned domain (may be down)")
        return ("KEEP", "owned domain noted; worth rechecking for a working contact path later")

    if any(tag in address for tag in [" ste ", " suite", " unit ", "#", " bldg", " building", " plaza"]):
        if not has_any_contact:
            return ("KEEP", "non-residential/pro office-style address; may have directory/LinkedIn contact path")

    if "linkedin.com/in/" in low and not has_any_contact:
        return ("KEEP", "identified likely owner on LinkedIn (alt contact path)")

    if any(h in low for h in KEEP_HINTS) and not has_any_contact:
        return ("KEEP", "looks like an operating service business; worth one more search pass")

    # Default: review/keep depending on how risky DQ is.
    if not has_any_contact and ("llc" in name_n or "inc" in name_n):
        return ("REVIEW", "no contact found yet; unclear if shell vs micro-business")
    return ("REVIEW", "insufficient signal; needs a quick manual look")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--triage", required=True, help="triage checklist markdown path")
    ap.add_argument("--out", required=True, help="output suggestions markdown path")
    args = ap.parse_args()

    triage_path = Path(args.triage)
    out_path = Path(args.out)
    items = parse_triage(triage_path)
    if not items:
        print("No triage rows parsed.")
        return 1

    counts = {"DQ": 0, "KEEP": 0, "REVIEW": 0}
    rows = []
    for it in items:
        rec, reason = suggest(it)
        counts[rec] += 1
        rows.append((rec, reason, it))

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = []
    lines.append("# No-Website Triage Suggestions")
    lines.append(f"Generated (local clock): {now}")
    lines.append(f"Input: `{triage_path.as_posix()}`")
    lines.append("")
    lines.append("Use this to speed up marking the triage file. You still choose DQ vs KEEP.")
    lines.append("")
    lines.append("Summary:")
    lines.append(f"- Suggested KEEP: {counts['KEEP']}")
    lines.append(f"- Suggested DQ: {counts['DQ']}")
    lines.append(f"- Suggested REVIEW: {counts['REVIEW']}")
    lines.append("")
    lines.append("Format: Suggested | LeadID | Name | Why | ProfilePath")
    lines.append("")
    for rec, reason, it in rows:
        # Keep output single-line; avoid pipe collisions.
        reason = reason.replace("|", "/")
        lines.append(f"- {rec} | {it.lead_id} | {it.name} | {reason} | {it.profile_path.as_posix()}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
