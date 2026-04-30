#!/usr/bin/env python3
"""
QA filter for generated Lighthouse outreach draft packs.

Triage output:
- ready CSV: safe to proceed (still no send)
- manual-review CSV: likely mismatches/oddities with reasons
"""

from __future__ import annotations

import argparse
import csv
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlparse


FREE_EMAIL_DOMAINS = {
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "icloud.com",
    "aol.com",
    "proton.me",
    "protonmail.com",
    "msn.com",
}

EMAIL_RE = re.compile(r"^[\w.+-]+@([\w.-]+\.[A-Za-z]{2,})$")


def email_domain(email: str) -> str:
    m = EMAIL_RE.match((email or "").strip())
    return (m.group(1) if m else "").lower()


def website_domain(url: str) -> str:
    u = (url or "").strip()
    if not u:
        return ""
    if "://" not in u:
        u = "https://" + u
    try:
        host = urlparse(u).netloc.lower()
    except Exception:
        return ""
    if host.startswith("www."):
        host = host[4:]
    return host


def domain_matches(email_dom: str, web_dom: str) -> bool:
    if not email_dom or not web_dom:
        return False
    if email_dom == web_dom:
        return True
    if email_dom.endswith("." + web_dom):
        return True
    if web_dom.endswith("." + email_dom):
        return True
    return False


def is_test_like_domain(web_dom: str) -> bool:
    d = (web_dom or "").lower()
    if not d:
        return False
    starts = ("test.", "dev.", "staging.", "uat.", "qa.", "my-test.")
    parts = d.split(".")
    left = parts[0] if parts else ""
    return d.startswith(starts) or left in {"test", "dev", "staging", "uat", "qa"}


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="QA filter generated Lighthouse draft pack.")
    ap.add_argument(
        "--draft-index-csv",
        required=True,
        help="Path to draft-index.csv from generate_lighthouse_abysmal_drafts.py output.",
    )
    ap.add_argument("--out-ready-csv", default="")
    ap.add_argument("--out-review-csv", default="")
    ap.add_argument("--out-summary-md", default="")
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    index_csv = Path(args.draft_index_csv)
    stamp = date.today().isoformat()

    out_ready = Path(args.out_ready_csv) if args.out_ready_csv else index_csv.with_name(f"qa-ready-{stamp}.csv")
    out_review = (
        Path(args.out_review_csv) if args.out_review_csv else index_csv.with_name(f"qa-manual-review-{stamp}.csv")
    )
    out_summary = Path(args.out_summary_md) if args.out_summary_md else index_csv.with_name(f"qa-summary-{stamp}.md")

    rows = list(csv.DictReader(index_csv.open("r", encoding="utf-8-sig", newline="")))
    ready: list[dict] = []
    review: list[dict] = []

    for row in rows:
        email = (row.get("email") or "").strip()
        website = (row.get("website") or "").strip()
        e_dom = email_domain(email)
        w_dom = website_domain(website)
        reasons: list[str] = []

        if not e_dom:
            reasons.append("invalid-email")
        if not w_dom:
            reasons.append("invalid-website")
        if w_dom and is_test_like_domain(w_dom):
            reasons.append("test-or-staging-domain")

        if e_dom and w_dom and not domain_matches(e_dom, w_dom):
            if e_dom not in FREE_EMAIL_DOMAINS:
                reasons.append("email-domain-mismatch-nonfree")

        out_row = dict(row)
        out_row["email_domain"] = e_dom
        out_row["website_domain"] = w_dom
        out_row["qa_reason"] = "; ".join(reasons) if reasons else ""

        if reasons:
            review.append(out_row)
        else:
            ready.append(out_row)

    fields = list(rows[0].keys()) + ["email_domain", "website_domain", "qa_reason"] if rows else []

    out_ready.parent.mkdir(parents=True, exist_ok=True)
    with out_ready.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in ready:
            w.writerow(r)

    with out_review.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in review:
            w.writerow(r)

    lines = [
        "# Lighthouse Draft Pack QA Summary",
        f"Generated: {stamp}",
        "",
        f"- Input rows: {len(rows)}",
        f"- Ready rows: {len(ready)}",
        f"- Manual review rows: {len(review)}",
        f"- Ready CSV: `{out_ready.as_posix()}`",
        f"- Manual review CSV: `{out_review.as_posix()}`",
        "",
        "## Review Reasons",
    ]
    reason_counts: dict[str, int] = {}
    for r in review:
        for reason in [x.strip() for x in (r.get("qa_reason") or "").split(";") if x.strip()]:
            reason_counts[reason] = reason_counts.get(reason, 0) + 1
    if reason_counts:
        for k, v in sorted(reason_counts.items(), key=lambda t: (-t[1], t[0])):
            lines.append(f"- {k}: {v}")
    else:
        lines.append("- none")
    lines.append("")
    out_summary.write_text("\n".join(lines), encoding="utf-8")

    print(f"input_rows={len(rows)}")
    print(f"ready_rows={len(ready)}")
    print(f"review_rows={len(review)}")
    print(f"ready_csv={out_ready}")
    print(f"review_csv={out_review}")
    print(f"summary_md={out_summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
