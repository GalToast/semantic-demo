#!/usr/bin/env python3
"""
Generate draft-only call/text scripts for bounce follow-ups where the next action is phone-only.

Input: a bounced-followup-phone-only-* queue markdown table.
Output: a markdown file under outreach/drafts/ with per-lead call notes.

This does not place calls/texts and does not send email.
"""

from __future__ import annotations

import argparse
import re
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
QUEUES_DIR = REPO_ROOT / "outreach" / "queues"
OUT_DIR = REPO_ROOT / "outreach" / "drafts"


def norm(s: str | None) -> str:
    return (s or "").strip()


def latest_queue(glob_pat: str) -> Path:
    def sort_key(p: Path) -> tuple:
        m = re.search(r"(20\d{2}-\d{2}-\d{2})", p.name)
        ds = m.group(1) if m else ""
        is_post_send = 1 if "post-send" in p.name else 0
        try:
            mtime = p.stat().st_mtime
        except Exception:
            mtime = 0
        return (ds, -is_post_send, mtime)

    candidates = sorted(QUEUES_DIR.glob(glob_pat), key=sort_key, reverse=True)
    if not candidates:
        raise SystemExit(f"No queue found matching: {glob_pat}")
    return candidates[0]


def parse_markdown_table(path: Path) -> list[dict[str, str]]:
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    header_idx = None
    for i, line in enumerate(lines):
        if line.strip().startswith("|") and i + 1 < len(lines):
            if set(lines[i + 1].replace("|", "").strip()) <= {"-", " "}:
                header_idx = i
                break
    if header_idx is None:
        return []

    cols = [c.strip() for c in lines[header_idx].strip().strip("|").split("|")]
    rows: list[dict[str, str]] = []
    for line in lines[header_idx + 2 :]:
        if not line.strip().startswith("|"):
            break
        parts = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(parts) != len(cols):
            continue
        rows.append(dict(zip(cols, parts)))
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate bounce follow-up phone-only call/text scripts (draft-only).")
    ap.add_argument(
        "--queue",
        default="",
        help="Path to bounced-followup-phone-only-*.md (default: newest matching).",
    )
    ap.add_argument(
        "--out",
        default="",
        help="Output markdown path (default: outreach/drafts/bounced-followup-phone-only-scripts-YYYY-MM-DD.md).",
    )
    args = ap.parse_args()

    queue_path = Path(args.queue) if args.queue else latest_queue("bounced-followup-phone-only-*.md")
    rows = parse_markdown_table(queue_path)

    today = date.today().isoformat()
    out_path = Path(args.out) if args.out else (OUT_DIR / f"bounced-followup-phone-only-scripts-{today}.md")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    md: list[str] = []
    md.append("# Bounce Follow-Up: Phone-Only Call/Text Scripts")
    md.append(f"Generated: {today}")
    md.append(f"Queue: `{queue_path.as_posix()}`")
    md.append(f"Leads: {len(rows)}")
    md.append("")
    md.append("Draft-only. Do not send email from here.")
    md.append("")
    md.append("## Script")
    md.append("")
    md.append("```text")
    md.append("Hi, is this <Business Name>?")
    md.append("")
    md.append("My name is Fred McCullough. I tried reaching you by email, but it bounced back.")
    md.append("What is the best email address for you?")
    md.append("")
    md.append("I am local to the area and I had a quick note about your website that could help prevent avoidable issues for you and for customers. Happy to share details.")
    md.append("")
    md.append("Thanks.")
    md.append("```")
    md.append("")

    for r in rows:
        lead_id = norm(r.get("LeadID"))
        lead = norm(r.get("Lead"))
        profile = norm(r.get("Profile"))
        bounced_email = norm(r.get("Bounced Email"))
        phone = norm(r.get("Phone"))
        diagnostic = norm(r.get("Diagnostic"))

        md.append(f"## {lead_id} {lead}".strip())
        if profile:
            md.append(f"Profile: `{profile}`")
        if phone:
            md.append(f"Phone: {phone}")
        if bounced_email:
            md.append(f"Bounced email: `{bounced_email}`")
        if diagnostic:
            md.append(f"Bounce diagnostic (internal): {diagnostic}")
        md.append("")

    out_path.write_text("\n".join(md).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote: {out_path}")


if __name__ == "__main__":
    main()

