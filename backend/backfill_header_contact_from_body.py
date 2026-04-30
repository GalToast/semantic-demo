#!/usr/bin/env python3
"""
Backfill header contact fields (Phone/Email/Website/Social media/Contact form)
from clearly labeled content inside profile.md bodies.

Goal: reduce "no-contact" false positives caused by stale headers, without
introducing false positives.

Safety rules:
- Only extract from strong signals (markdown tables / labeled lines).
- Only set header fields when header is missing/unknown/not found and the
  extracted value validates (email contains @, phone has >=10 digits, urls look like urls).
- Recompute Contact path from populated fields (email > form > phone-only > social > unknown).
- Preserve existing non-empty header values.
"""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Optional


REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILES_ROOT = REPO_ROOT / "leads" / "profiles"
VIEWS_ROOT = REPO_ROOT / "leads" / "views"

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
    "—",
    "-",
    "â€”",  # common mojibake for an em dash
}


CONTACT_PATH_FIELDS = {
    "email": "Email",
    "phone-only": "Phone",
    "form": "Contact form",
    "social": "Social media",
}


def normalize_value(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", value.strip())
    if cleaned.lower() in MISSING_VALUES:
        return None
    return cleaned


def find_first_label(lines: list[str], label: str) -> Optional[tuple[int, str]]:
    pat = re.compile(rf"^\s*{re.escape(label)}\s*:\s*(.+?)\s*$", re.IGNORECASE)
    for idx, line in enumerate(lines):
        m = pat.match(line)
        if m:
            return idx, m.group(1).strip()
    return None


def set_label(lines: list[str], label: str, value: str) -> bool:
    """
    Replace an existing header label value. Returns True if changed.
    Does not insert missing labels; profiles in this repo should already have them.
    """
    found = find_first_label(lines, label)
    if not found:
        return False
    idx, current = found
    current_n = normalize_value(current)
    value_n = normalize_value(value) or value.strip()
    if current_n == value_n:
        return False
    lines[idx] = f"{label}: {value_n}"
    return True


def digits_only(value: str) -> str:
    return re.sub(r"\D+", "", value or "")


def is_probably_phone(value: str) -> bool:
    d = digits_only(value)
    return len(d) >= 10


def extract_phone_from_body(text: str) -> Optional[str]:
    # Markdown table: | **Phone** | (936) 760-3004 | ✅ |
    m = re.search(r"\|\s*\*\*Phone\*\*\s*\|\s*([^|]+?)\s*\|", text, re.IGNORECASE)
    if m:
        cand = m.group(1).strip()
        if is_probably_phone(cand):
            return cand
    # Labeled line: Phone number confirmed: (936) 760-3004
    m = re.search(r"Phone(?:\s+number)?\s+confirmed\s*:\s*([^\n\r]+)", text, re.IGNORECASE)
    if m:
        cand = m.group(1).strip()
        if is_probably_phone(cand):
            return cand
    return None


def extract_email_from_body(text: str) -> Optional[str]:
    # Markdown table: | **Email** | name@example.com | ✅ |
    m = re.search(r"\|\s*\*\*Email\*\*\s*\|\s*([^|]+?)\s*\|", text, re.IGNORECASE)
    if m:
        cand = m.group(1).strip()
        if "@" in cand and " " not in cand:
            return cand
    # Generic fallback: any email, but only if preceded by "Email" label nearby.
    m = re.search(r"Email\s*[:|]\s*([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})", text, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return None


def extract_url_cell(label: str, text: str) -> Optional[str]:
    # Markdown table: | **Website** | https://example.com | ❌ |
    m = re.search(rf"\|\s*\*\*{re.escape(label)}\*\*\s*\|\s*([^|]+?)\s*\|", text, re.IGNORECASE)
    if not m:
        return None
    cand = m.group(1).strip()
    if not cand:
        return None
    # tolerate bare domains; prefer explicit scheme if present
    if cand.startswith(("http://", "https://")):
        return cand
    if re.match(r"^[a-z0-9][a-z0-9\-\.]+\.[a-z]{2,}(/.*)?$", cand, re.IGNORECASE):
        return "https://" + cand
    return None


def extract_social_from_body(text: str) -> Optional[str]:
    # Prefer explicit Social Media tables: | **Facebook** | https://... |
    social_domains = [
        "facebook.com",
        "instagram.com",
        "linkedin.com",
        "tiktok.com",
        "x.com",
        "twitter.com",
        "youtube.com",
    ]
    table_urls = re.findall(r"\|\s*\*\*(?:Facebook|Instagram|LinkedIn|TikTok|X|Twitter|YouTube)\*\*\s*\|\s*(https?://[^|\s]+)", text, re.IGNORECASE)
    for url in table_urls:
        if any(d in url.lower() for d in social_domains):
            return url.strip()
    # Fallback: within a section that mentions "Social Media"
    m = re.search(r"##\s+Social Media(.+?)(?:\n##\s+|\Z)", text, re.IGNORECASE | re.DOTALL)
    if m:
        block = m.group(1)
        u = re.search(r"(https?://[^\s)]+)", block)
        if u:
            url = u.group(1).strip().rstrip(".,;")
            if any(d in url.lower() for d in social_domains):
                return url
    return None


def recompute_contact_path(email: Optional[str], phone: Optional[str], contact_form: Optional[str], social: Optional[str]) -> str:
    if email and "@" in email:
        return "email"
    if contact_form:
        return "form"
    if phone:
        return "phone-only"
    if social:
        return "social"
    return "unknown"


@dataclass
class Change:
    path: Path
    changes: list[str]


def process_profile(path: Path) -> Optional[Change]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()

    # Read current header values.
    phone = normalize_value(find_first_label(lines, "Phone")[1]) if find_first_label(lines, "Phone") else None
    email = normalize_value(find_first_label(lines, "Email")[1]) if find_first_label(lines, "Email") else None
    website = normalize_value(find_first_label(lines, "Website")[1]) if find_first_label(lines, "Website") else None
    contact_form = normalize_value(find_first_label(lines, "Contact form")[1]) if find_first_label(lines, "Contact form") else None
    social = normalize_value(find_first_label(lines, "Social media")[1]) if find_first_label(lines, "Social media") else None
    contact_path = normalize_value(find_first_label(lines, "Contact path")[1]) if find_first_label(lines, "Contact path") else None
    contact_search = normalize_value(find_first_label(lines, "Contact search")[1]) if find_first_label(lines, "Contact search") else None

    extracted_changes: list[str] = []

    if not phone:
        p = extract_phone_from_body(text)
        if p:
            if set_label(lines, "Phone", p):
                phone = p
                extracted_changes.append(f"Phone <- {p}")

    if not email:
        e = extract_email_from_body(text)
        if e:
            if set_label(lines, "Email", e):
                email = e
                extracted_changes.append(f"Email <- {e}")

    if not website:
        w = extract_url_cell("Website", text)
        if w:
            if set_label(lines, "Website", w):
                website = w
                extracted_changes.append(f"Website <- {w}")

    if not contact_form:
        cf = extract_url_cell("Contact form", text)
        if cf:
            if set_label(lines, "Contact form", cf):
                contact_form = cf
                extracted_changes.append(f"Contact form <- {cf}")

    if not social:
        s = extract_social_from_body(text)
        if s:
            if set_label(lines, "Social media", s):
                social = s
                extracted_changes.append(f"Social media <- {s}")

    computed_cp = recompute_contact_path(email, phone, contact_form, social)

    # Only adjust Contact path when we have evidence:
    # - We discovered a real contact method in the body and can set an accurate path.
    # - Or Contact path claims a method but the corresponding field is still empty.
    existing_cp = (contact_path or "").strip().lower()
    if existing_cp in CONTACT_PATH_FIELDS:
        # If the matching field is empty, downgrade to unknown unless we found a better method.
        needs_field = CONTACT_PATH_FIELDS[existing_cp]
        field_value = {
            "Email": email,
            "Phone": phone,
            "Contact form": contact_form,
            "Social media": social,
        }.get(needs_field)
        if not field_value:
            target = computed_cp if computed_cp != "unknown" else "unknown"
            if target != existing_cp:
                if set_label(lines, "Contact path", target):
                    extracted_changes.append(f"Contact path <- {target}")
    else:
        # If Contact path is missing/unknown and we now have a usable method, set it.
        if computed_cp != "unknown" and existing_cp != computed_cp:
            if set_label(lines, "Contact path", computed_cp):
                extracted_changes.append(f"Contact path <- {computed_cp}")

    # If we now have a contact method and contact search is empty, promote to checked.
    if extracted_changes and computed_cp != "unknown" and not contact_search:
        if set_label(lines, "Contact search", f"checked {TODAY}"):
            extracted_changes.append(f"Contact search <- checked {TODAY}")

    # If we changed anything, stamp Last updated.
    if extracted_changes:
        if set_label(lines, "Last updated", TODAY):
            extracted_changes.append(f"Last updated <- {TODAY}")

        new_text = "\n".join(lines) + ("\n" if text.endswith("\n") else "")
        return Change(path=path, changes=extracted_changes), new_text

    return None


def parse_view_profile_paths(view_path: Path) -> set[Path]:
    """
    Views are lines like: "... | profile: leads/profiles/.../profile.md"
    """
    if not view_path.exists():
        return set()
    text = view_path.read_text(encoding="utf-8", errors="ignore")
    rel_paths = set(re.findall(r"\bprofile:\s+([^\s]+profile\.md)\b", text))
    out: set[Path] = set()
    for rel in rel_paths:
        out.add(REPO_ROOT / rel)
    return out


def iter_profiles(only_paths: Optional[set[Path]] = None) -> list[Path]:
    if only_paths is not None:
        return sorted([p for p in only_paths if p.exists()])
    if not PROFILES_ROOT.exists():
        return []
    return sorted(PROFILES_ROOT.rglob("profile.md"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="Write changes to disk.")
    ap.add_argument("--report", default=str(REPO_ROOT / "tmp" / "backfill-header-contact-report.txt"))
    ap.add_argument(
        "--from-view",
        action="append",
        default=[],
        help="Limit processing to profile paths listed in a generated view file (repeatable). Example: leads/views/no-contact.md",
    )
    args = ap.parse_args()

    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    changes: list[Change] = []
    writes: list[tuple[Path, str]] = []

    only_paths: Optional[set[Path]] = None
    if args.from_view:
        only_paths = set()
        for raw in args.from_view:
            vp = (REPO_ROOT / raw) if not raw.lower().endswith(".md") or not Path(raw).is_absolute() else Path(raw)
            # Prefer repo-relative paths.
            if not vp.exists():
                vp = REPO_ROOT / raw
            only_paths |= parse_view_profile_paths(vp)

    scanned = iter_profiles(only_paths)

    for path in scanned:
        res = process_profile(path)
        if not res:
            continue
        change, new_text = res
        changes.append(change)
        writes.append((path, new_text))

    lines: list[str] = [
        "# Backfill Header Contact From Body",
        f"Generated: {TODAY}",
        f"Profiles scanned: {len(scanned)}",
        f"Profiles with changes: {len(changes)}",
        f"Apply: {'yes' if args.apply else 'no'}",
        "",
    ]
    for ch in changes:
        rel = ch.path.relative_to(REPO_ROOT).as_posix()
        lines.append(f"- {rel}")
        for item in ch.changes:
            lines.append(f"  - {item}")
        lines.append("")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    if args.apply:
        for path, new_text in writes:
            path.write_text(new_text, encoding="utf-8")

    print(f"Wrote report: {report_path}")
    print(f"Changes: {len(changes)} (apply={args.apply})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
