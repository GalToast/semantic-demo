#!/usr/bin/env python3
"""
Conservative large-chain filter for outreach-ready lead CSVs.

Reads a QA-ready CSV and splits rows into:
- independent-ready CSV
- chain-review CSV

Heuristics are intentionally conservative: anything uncertain goes to review.
"""

from __future__ import annotations

import argparse
import csv
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen


CHAIN_BRAND_KEYWORDS = [
    "mcdonald", "starbucks", "subway", "chipotle", "domino", "pizza hut", "taco bell",
    "burger king", "wendy", "sonic", "dunkin", "kfc", "popeyes", "chick-fil-a",
    "walmart", "target", "costco", "sam's club", "sams club", "kroger", "heb",
    "whole foods", "trader joe", "cvs", "walgreens", "rite aid", "home depot",
    "lowe", "best buy", "7-eleven", "circle k", "racetrac", "shell", "chevron",
    "exxon", "bp ", "valero", "marriott", "hilton", "hyatt", "holiday inn",
    "ihg", "hampton inn", "la quinta", "motel 6", "days inn", "super 8",
    "planet fitness", "anytime fitness", "orangetheory",
]

CHAIN_SITE_PHRASES_STRONG = [
    "franchise opportunities",
    "franchise opportunity",
    "become a franchisee",
    "store locator",
    "find a store",
    "find a location",
]

CHAIN_SITE_PHRASES_SOFT = [
    "our locations",
    "all locations",
    "locations near you",
    "nationwide",
    "across the country",
    "in all 50 states",
]


def norm(s: str) -> str:
    return (s or "").strip()


def web_domain(url: str) -> str:
    u = norm(url)
    if not u:
        return ""
    if "://" not in u:
        u = "https://" + u
    try:
        host = urlparse(u).netloc.lower()
    except Exception:
        return ""
    return host[4:] if host.startswith("www.") else host


def fetch_home_text(url: str, timeout_sec: int) -> str:
    u = norm(url)
    if not u:
        return ""
    if "://" not in u:
        u = "https://" + u
    req = Request(
        u,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; lead-qa/1.0; +https://mccullough.digital)"
        },
    )
    try:
        with urlopen(req, timeout=timeout_sec) as resp:
            data = resp.read(250000)  # enough for phrase checks
        text = data.decode("utf-8", errors="ignore")
        text = re.sub(r"\s+", " ", text).lower()
        return text
    except Exception:
        return ""


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Conservative filter to avoid large chain outreach targets.")
    ap.add_argument("--input-csv", required=True, help="qa-ready CSV path")
    ap.add_argument("--timeout-sec", type=int, default=8)
    ap.add_argument("--out-independent-csv", default="")
    ap.add_argument("--out-review-csv", default="")
    ap.add_argument("--out-summary-md", default="")
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    src = Path(args.input_csv)
    stamp = date.today().isoformat()

    out_independent = (
        Path(args.out_independent_csv)
        if args.out_independent_csv
        else src.with_name(f"qa-independent-ready-{stamp}.csv")
    )
    out_review = (
        Path(args.out_review_csv)
        if args.out_review_csv
        else src.with_name(f"qa-chain-review-{stamp}.csv")
    )
    out_summary = (
        Path(args.out_summary_md)
        if args.out_summary_md
        else src.with_name(f"qa-chain-summary-{stamp}.md")
    )

    rows = list(csv.DictReader(src.open("r", encoding="utf-8-sig", newline="")))
    independent: list[dict] = []
    review: list[dict] = []

    for row in rows:
        name = norm(row.get("name"))
        website = norm(row.get("website"))
        domain = web_domain(website)
        combined = f"{name} {domain}".lower()
        reasons: list[str] = []

        # Name/domain brand keyword guard.
        for kw in CHAIN_BRAND_KEYWORDS:
            # Phrase-safe match: use token boundaries so short brands do not false-hit inside other words.
            pat = r"\b" + re.escape(kw).replace(r"\ ", r"\s+") + r"\b"
            if re.search(pat, combined):
                reasons.append(f"brand-keyword:{kw}")
                break

        # Homepage phrase guard.
        text = fetch_home_text(website, args.timeout_sec)
        if text:
            strong_hit = any(p in text for p in CHAIN_SITE_PHRASES_STRONG)
            soft_hits = sum(1 for p in CHAIN_SITE_PHRASES_SOFT if p in text)
            if strong_hit:
                reasons.append("homepage-chain-phrase-strong")
            elif soft_hits >= 2:
                reasons.append("homepage-chain-phrases-soft>=2")
        else:
            # Do not fail ready set on fetch issues; leave as-is.
            pass

        out_row = dict(row)
        out_row["chain_guard_reason"] = "; ".join(reasons) if reasons else ""
        if reasons:
            review.append(out_row)
        else:
            independent.append(out_row)

    fieldnames = list(rows[0].keys()) + ["chain_guard_reason"] if rows else []
    out_independent.parent.mkdir(parents=True, exist_ok=True)

    with out_independent.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in independent:
            w.writerow(r)

    with out_review.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in review:
            w.writerow(r)

    reason_counts: dict[str, int] = {}
    for r in review:
        for reason in [x.strip() for x in (r.get("chain_guard_reason") or "").split(";") if x.strip()]:
            reason_counts[reason] = reason_counts.get(reason, 0) + 1

    lines = [
        "# Chain Guard Summary",
        f"Generated: {stamp}",
        "",
        f"- Input rows: {len(rows)}",
        f"- Independent-ready rows: {len(independent)}",
        f"- Chain-review rows: {len(review)}",
        f"- Independent CSV: `{out_independent.as_posix()}`",
        f"- Chain-review CSV: `{out_review.as_posix()}`",
        "",
        "## Flag Reasons",
    ]
    if reason_counts:
        for k, v in sorted(reason_counts.items(), key=lambda t: (-t[1], t[0])):
            lines.append(f"- {k}: {v}")
    else:
        lines.append("- none")
    lines.append("")
    out_summary.write_text("\n".join(lines), encoding="utf-8")

    print(f"input_rows={len(rows)}")
    print(f"independent_ready_rows={len(independent)}")
    print(f"chain_review_rows={len(review)}")
    print(f"independent_csv={out_independent}")
    print(f"chain_review_csv={out_review}")
    print(f"summary_md={out_summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
