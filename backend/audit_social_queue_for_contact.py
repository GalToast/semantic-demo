from __future__ import annotations

import argparse
import re
import time
from datetime import date
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


UA = "Mozilla/5.0 (compatible; McCulloughDigitalResearchBot/1.0; +https://mccullough.digital)"
EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
# Avoid matching arbitrary 10-digit IDs in HTML. Require separators or parentheses.
PHONE_RE = re.compile(
    r"(?:\+?1[\s.-]?)?(?:\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b)"
)

JUNK_EMAIL_DOMAINS = {
    "ingest.sentry.io",
    "sentry.io",
}

PLATFORM_EMAIL_DOMAINS = {
    # Platform/support emails are not lead contact points.
    "contra.com",
    "etsy.com",
    "eventeny.com",
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "tiktok.com",
}


def fetch(url: str, timeout: int = 25) -> str:
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=timeout) as resp:
        raw = resp.read(600_000)
    return raw.decode("utf-8", errors="replace")


def extract_contacts(html: str) -> tuple[list[str], list[str]]:
    emails = sorted({e.lower() for e in EMAIL_RE.findall(html)})
    phones = sorted({p for p in PHONE_RE.findall(html)})
    return emails, phones


def extract_mailto_tel(html: str) -> tuple[list[str], list[str]]:
    # Prefer explicit mailto/tel links over regex-scanning random page text.
    mailtos = re.findall(r'href="mailto:([^"?\\s]+)', html, flags=re.IGNORECASE)
    tels = re.findall(r'href="tel:([^"?\\s]+)', html, flags=re.IGNORECASE)
    emails = sorted({m.lower().strip() for m in mailtos if "@" in m})
    phones = sorted({t.strip() for t in tels if t.strip()})
    return emails, phones


def is_junk_email(email: str) -> bool:
    email = (email or "").strip().lower()
    if not email or "@" not in email:
        return True
    local, domain = email.split("@", 1)
    # Common false positives from asset filenames like "touch-icon@2x.png"
    if domain.endswith((".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico")):
        return True
    if local.endswith((".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico")):
        return True
    if domain in PLATFORM_EMAIL_DOMAINS:
        return True
    if domain in JUNK_EMAIL_DOMAINS:
        return True
    # e.g. long hex-like tokens (tracking/instrumentation)
    if re.fullmatch(r"[a-f0-9]{20,}", local or ""):
        return True
    return False


def update_header_field(lines: list[str], label: str, value: str) -> None:
    prefix = f"{label}:"
    for i, line in enumerate(lines[:80]):
        if line.startswith(prefix):
            lines[i] = f"{prefix} {value}".rstrip()
            return
    # Insert near top, after Address if present.
    insert_after = None
    for key in ("Address:", "Source:", "Batch line:", "Batch:"):
        for i, line in enumerate(lines[:60]):
            if line.startswith(key):
                insert_after = i
    if insert_after is None:
        lines.insert(1, f"{prefix} {value}".rstrip())
    else:
        lines.insert(insert_after + 1, f"{prefix} {value}".rstrip())


def append_note(text: str, note: str, stamp: str) -> str:
    if stamp in text:
        return text
    for header in ("## Updates", "## Notes"):
        idx = text.find(header)
        if idx != -1:
            after = idx + len(header)
            next_hdr = text.find("\n## ", after)
            if next_hdr == -1:
                return text.rstrip() + "\n\n" + note.strip() + "\n"
            return text[:next_hdr].rstrip() + "\n" + note.strip() + "\n\n" + text[next_hdr:].lstrip()
    return text.rstrip() + "\n\n## Notes\n" + note.strip() + "\n"


def parse_queue(path: Path) -> list[dict]:
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    header_idx = None
    for i, line in enumerate(lines):
        if line.strip().startswith("|") and "|" in line.strip()[1:]:
            if i + 1 < len(lines) and set(lines[i + 1].replace("|", "").strip()) <= {"-", " "}:
                header_idx = i
                break
    if header_idx is None:
        raise SystemExit(f"No markdown table found in {path.as_posix()}")

    cols = [c.strip() for c in lines[header_idx].strip("|").split("|")]
    col_idx = {c: i for i, c in enumerate(cols)}

    out: list[dict] = []
    for line in lines[header_idx + 2 :]:
        if not line.strip().startswith("|"):
            break
        parts = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(parts) != len(cols):
            continue
        out.append(
            {
                "lead_id": parts[col_idx.get("LeadID", 0)],
                "name": parts[col_idx.get("Name", 1)],
                "batch": parts[col_idx.get("Batch", 2)],
                "social": parts[col_idx.get("Social", col_idx.get("Social media", 10))],
                "profile": parts[col_idx.get("Profile", len(cols) - 1)],
            }
        )
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Audit social queue leads for surfaced email/phone on public pages.")
    ap.add_argument("--queue", required=True)
    ap.add_argument("--timeout", type=int, default=25)
    ap.add_argument("--sleep", type=float, default=0.8)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--report", default="")
    args = ap.parse_args()

    q = Path(args.queue)
    rows = parse_queue(q)
    today = date.today().isoformat()
    report_path = Path(args.report) if args.report else Path("reports") / f"social-queue-audit-{today}.md"

    report: list[str] = []
    report.append("# Social Queue Audit")
    report.append(f"Generated: {today}")
    report.append(f"Queue: `{q.as_posix()}`")
    report.append(f"Apply: `{'yes' if args.apply else 'no'}`")
    report.append("")

    changed = 0
    found = 0
    skipped_conflict = 0

    for r in rows:
        lead_id = r["lead_id"].strip()
        name = r["name"].strip()
        social = r["social"].strip()
        profile_path = Path(r["profile"].strip())

        if not profile_path.exists():
            report.append(f"- {lead_id} {name}: ERROR missing profile `{profile_path.as_posix()}`")
            continue

        try:
            original = profile_path.read_text(encoding="utf-8", errors="ignore")
        except Exception as e:
            report.append(f"- {lead_id} {name}: ERROR reading profile ({type(e).__name__})")
            continue

        urls = [u.strip() for u in re.split(r",\s*", social) if u.strip()]
        emails: list[str] = []
        phones: list[str] = []
        checked: list[str] = []
        for u in urls[:2]:
            if not (u.startswith("http://") or u.startswith("https://")):
                # e.g. "Etsy (ShopName)" or other annotation; can't fetch reliably.
                continue
            time.sleep(args.sleep)
            try:
                html = fetch(u, timeout=args.timeout)
            except Exception:
                checked.append(u + " (fetch failed)")
                continue
            checked.append(u)
            e1, p1 = extract_mailto_tel(html)
            e2, p2 = extract_contacts(html)
            emails.extend([e for e in (e1 + e2) if not is_junk_email(e)])
            phones.extend(p1 + p2)
            # Stop early if we found an email.
            if emails:
                break

        emails = sorted({e.lower() for e in emails})
        phones = sorted({p for p in phones})
        found_email = emails[0] if emails else ""
        found_phone = phones[0] if phones else ""

        if found_email or found_phone:
            found += 1
            lines = original.splitlines()
            if found_email:
                update_header_field(lines, "Email", found_email)
                update_header_field(lines, "Contact path", "email")
            elif found_phone:
                update_header_field(lines, "Phone", found_phone)
                update_header_field(lines, "Contact path", "phone-only")
            update_header_field(lines, "Contact search", f"checked {today}")
            update_header_field(lines, "Last updated", today)
            new_text = "\n".join(lines) + "\n"
            stamp = f"Social audit: {today}"
            note = f"- **{today}**: {stamp}. Checked: {', '.join(checked) or 'public social pages (no fetchable URLs)'}."
            new_text = append_note(new_text, note, stamp)
            report.append(f"- {lead_id} {name}: FOUND email={found_email or 'no'} phone={found_phone or 'no'}")

            if args.apply and new_text != original:
                latest = profile_path.read_text(encoding="utf-8", errors="ignore")
                if latest != original:
                    skipped_conflict += 1
                    report.append(f"  - SKIP write (profile changed by another agent)")
                    continue
                profile_path.write_text(new_text, encoding="utf-8")
                changed += 1
        else:
            report.append(f"- {lead_id} {name}: no email/phone surfaced (checked: {', '.join(checked) or 'n/a'})")

    report.append("")
    report.append("## Summary")
    report.append(f"- Rows: {len(rows)}")
    report.append(f"- Found email/phone: {found}")
    report.append(f"- Changed profiles: {changed}")
    report.append(f"- Skipped due to conflict: {skipped_conflict}")
    report.append("")

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(report), encoding="utf-8")
    print(f"Wrote report: {report_path.as_posix()}")


if __name__ == "__main__":
    main()
