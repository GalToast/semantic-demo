#!/usr/bin/env python3
"""
Backfill `Contact path:` for qualified profiles using ONLY header fields.

Why this exists
- We want machine-smooth, no-fall-through-the-cracks parsing.
- Some profiles can have Email/Phone/Form/Social filled in the header but leave
  `Contact path: unknown`, which breaks filtering/queues.

Safety rules
- Never infer or copy Email/Phone/etc from the body (too easy to create false positives).
- Only update profiles where the current `Contact path:` is missing/unknown.
- Do not overwrite non-unknown contact paths.
"""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILES_ROOT = REPO_ROOT / "leads" / "profiles"
TODAY = date.today().isoformat()

MISSING_VALUES = {
    "",
    "unknown",
    "not found",
    "n/a",
    "na",
    "none",
    "null",
    "not provided",
    "not available",
    "no",
    "-",
}

EMAIL_RE = re.compile(r"^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$", re.IGNORECASE)
PHONE_RE = re.compile(r"\d")
URL_RE = re.compile(r"^https?://", re.IGNORECASE)


@dataclass(frozen=True)
class Change:
    path: str
    old: str
    new: str


def normalize(v: str | None) -> str:
    return (v or "").strip()


def is_missing(v: str | None) -> bool:
    return normalize(v).lower() in MISSING_VALUES


def find_header_value(lines: list[str], key: str) -> str | None:
    # Restrict to top header area.
    pat = re.compile(rf"^\s*{re.escape(key)}\s*:\s*(.*?)\s*$", re.IGNORECASE)
    for line in lines[:120]:
        m = pat.match(line)
        if m:
            return m.group(1).strip()
    return None


def set_header_value(lines: list[str], key: str, value: str) -> bool:
    pat = re.compile(rf"^(\s*{re.escape(key)}\s*:\s*)(.*?)\s*$", re.IGNORECASE)
    for i in range(min(120, len(lines))):
        m = pat.match(lines[i])
        if not m:
            continue
        lines[i] = f"{m.group(1)}{value}"
        return True
    # If missing entirely, insert after title line.
    insert_at = 1 if lines and lines[0].startswith("# ") else 0
    lines.insert(insert_at, f"{key}: {value}")
    return True


def classify_contact_path(email: str | None, phone: str | None, form: str | None, social: str | None) -> str | None:
    if email and EMAIL_RE.match(email):
        return "email"
    if form and URL_RE.match(form):
        return "form"
    if social and URL_RE.match(social):
        return "social"
    # Phone-only is a fallback; if a site exists but no other method, keep unknown.
    if phone and not is_missing(phone) and PHONE_RE.search(phone):
        return "phone-only"
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="Write changes (default dry-run).")
    ap.add_argument(
        "--report",
        default=str(REPO_ROOT / "reports" / f"backfill-contact-path-from-headers-safe-{TODAY}.md"),
        help="Report output path",
    )
    args = ap.parse_args()

    if not PROFILES_ROOT.exists():
        raise SystemExit(f"Missing: {PROFILES_ROOT}")

    changes: list[Change] = []

    for profile_md in sorted(PROFILES_ROOT.rglob("profile.md")):
        text = profile_md.read_text(encoding="utf-8", errors="ignore")
        lines = text.splitlines()

        contact_path = find_header_value(lines, "Contact path")
        if contact_path and contact_path.strip().lower() not in {"unknown", "missing"}:
            continue

        email = find_header_value(lines, "Email")
        phone = find_header_value(lines, "Phone")
        form = find_header_value(lines, "Contact form")
        social = find_header_value(lines, "Social media")

        # Ignore missing placeholders.
        email = None if is_missing(email) else email
        phone = None if is_missing(phone) else phone
        form = None if is_missing(form) else form
        social = None if is_missing(social) else social

        inferred = classify_contact_path(email, phone, form, social)
        if not inferred:
            continue

        old = (contact_path or "unknown").strip() or "unknown"
        if old.lower() == inferred.lower():
            continue

        if args.apply:
            set_header_value(lines, "Contact path", inferred)
            profile_md.write_text("\n".join(lines) + "\n", encoding="utf-8")

        changes.append(Change(path=profile_md.as_posix(), old=old, new=inferred))

    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    out = [
        "# Backfill Contact Path From Headers (Safe)",
        f"Generated: {TODAY}",
        f"- Mode: {'APPLY' if args.apply else 'DRY-RUN'}",
        f"- Profiles updated: {len(changes)}",
        "",
    ]
    if changes:
        out += [
            "## Changes",
            "| Profile | Old | New |",
            "| --- | --- | --- |",
        ]
        for c in changes[:500]:
            out.append(f"| {c.path} | {c.old} | {c.new} |")
        if len(changes) > 500:
            out.append(f"| (truncated) | | showing first 500 of {len(changes)} |")
        out.append("")

    report_path.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"Report: {report_path}")
    print(f"Profiles updated: {len(changes)}")


if __name__ == "__main__":
    main()

