#!/usr/bin/env python3
"""
Backfill profile header contact fields by crawling the lead's Website.

Primary target: `leads/views/no-contact-website-yes.md` (small, high-leverage queue).

Safety goals:
- Only record contact info found on the lead's own website pages (or obvious platform pages like Etsy).
- Do not overwrite existing non-empty header values.
- Keep changes small and machine-parseable (header fields only).
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import ssl
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Optional


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"

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
    "â€”",
}

SOCIAL_DOMAINS = [
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "tiktok.com",
    "x.com",
    "twitter.com",
    "youtube.com",
]
SKIP_ADDRESS_HOSTS = {
    "mallsandoutlets.com",
    "storeshours.com",
}

EMAIL_RE = re.compile(r"\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b", re.IGNORECASE)
ADDRESS_RE = re.compile(
    r"\b(\d{1,6}\s+[A-Za-z0-9.#'\- ]+?\s+"
    r"(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir|Parkway|Pkwy|Highway|Hwy|Route|Rt|Suite|Ste|Unit|FM|Interstate|I-\d+)"
    r"[^,\n]{0,40},?\s+[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)",
    re.IGNORECASE,
)
PO_BOX_RE = re.compile(
    r"\b(P\.?\s*O\.?\s*Box\s+\d+[A-Za-z0-9\- ]*,?\s+[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)",
    re.IGNORECASE,
)
BANNED_EMAIL_DOMAINS = {
    "sentry.io",
    "example.com",
    # Common placeholder used in templates; not a real lead contact.
    "company.com",
}
BAD_EMAIL_TLDS = {
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "svg",
    "ico",
    "css",
    "js",
    "mp4",
    "webm",
    "mov",
    "pdf",
}


def norm(value: Optional[str]) -> str:
    return (value or "").strip()


def normalize_value(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", value.strip())
    if cleaned.lower() in MISSING_VALUES:
        return None
    return cleaned


def normalize_address_value(value: Optional[str]) -> Optional[str]:
    cleaned = normalize_value(value)
    if not cleaned:
        return None
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,;")
    if cleaned.lower() in MISSING_VALUES:
        return None
    return cleaned


def extract_first_url(text: str) -> str:
    m = re.search(r"https?://[^\s)]+", text or "", flags=re.I)
    return m.group(0) if m else ""


def extract_domain_token(text: str) -> str:
    m = re.search(r"\b([A-Za-z0-9.-]+\.[A-Za-z]{2,})(/[^\s)]*)?\b", text or "")
    return (m.group(0) or "").strip() if m else ""


def find_header_value(lines: list[str], key: str) -> Optional[str]:
    pat = re.compile(
        rf"^\s*(?:[-*]\s*)?(?:\*\*)?{re.escape(key)}(?![A-Za-z])(?:\*\*)?\s*:\s*(.+?)\s*$",
        re.IGNORECASE,
    )
    for line in lines[:120]:
        m = pat.match(line)
        if m:
            return m.group(1).strip()
    return None


def set_header_value(lines: list[str], key: str, value: str) -> bool:
    pat = re.compile(
        rf"^(?P<head>\s*(?:[-*]\s*)?(?:\*\*)?{re.escape(key)}(?![A-Za-z])(?::)?(?:\*\*)?\s*:?\s*)(?P<value>.+?)\s*$",
        re.IGNORECASE,
    )
    for i in range(min(120, len(lines))):
        m = pat.match(lines[i])
        if not m:
            continue
        current = normalize_value(m.group("value"))
        new_val = normalize_value(value) or value.strip()
        if current == new_val:
            return False
        head = m.group("head") or f"{key}: "
        lines[i] = f"{head}{new_val}".rstrip()
        return True
    return False


def digits_only(value: str) -> str:
    return re.sub(r"\D+", "", value or "")


def is_probably_phone(value: str) -> bool:
    d = digits_only(value)
    # Common fake/placeholder phone block used in examples/templates.
    # Example: 215-555-5555 -> reject so we don't pollute headers.
    if len(d) >= 10 and d[3:6] == "555":
        return False
    return len(d) >= 10


def normalize_url(raw: str) -> str:
    raw = norm(raw)
    if not raw:
        return ""
    # Strip common annotations like "(offline)".
    url = extract_first_url(raw) or extract_domain_token(raw)
    url = url.strip().strip(".,;")
    if not url:
        return ""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def same_site(base: str, target: str) -> bool:
    try:
        b = urllib.parse.urlparse(base)
        t = urllib.parse.urlparse(target)
        return (b.netloc or "").lower() == (t.netloc or "").lower()
    except Exception:
        return False


def host_of(url: str) -> str:
    try:
        return (urllib.parse.urlparse(url).netloc or "").lower()
    except Exception:
        return ""


def fetch(url: str, timeout_s: int) -> tuple[str, str, str]:
    """
    Returns (final_url, html_text, error_code).
    """
    if not url:
        return "", "", "missing_url"
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "Mozilla/5.0"})
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout_s, context=ctx) as resp:
            final_url = resp.geturl()
            data = resp.read()
            # Best-effort decode.
            text = data.decode("utf-8", errors="ignore")
            return final_url, text, ""
    except urllib.error.HTTPError as e:
        try:
            data = e.read() or b""
        except Exception:
            data = b""
        text = data.decode("utf-8", errors="ignore")
        return e.geturl() or url, text, f"http_error_{e.code}"
    except ssl.SSLError as e:
        return url, "", f"ssl_error_{type(e).__name__}"
    except Exception as e:
        return url, "", f"error_{type(e).__name__}"


def fetch_with_fallbacks(url: str, timeout_s: int) -> tuple[str, str, str]:
    """
    Best-effort fetch for small lead sites.

    We keep this conservative:
    - Only try obvious scheme/hostname variants for the same host.
    - Do not follow cross-domain "fixups" here; urllib redirects are still allowed.
    """
    if not url:
        return "", "", "missing_url"

    tried: list[str] = []

    def _try(u: str) -> tuple[str, str, str]:
        tried.append(u)
        return fetch(u, timeout_s=timeout_s)

    final_url, html, err = _try(url)
    if not err:
        return final_url, html, err

    # If HTTPS failed, try HTTP for the same host.
    if url.startswith("https://"):
        http_url = "http://" + url.removeprefix("https://")
        final_url, html, err2 = _try(http_url)
        if not err2:
            return final_url, html, err2

    # If non-www failed, try www.<host>.
    try:
        parsed = urllib.parse.urlparse(url)
        host = (parsed.netloc or "").strip()
        if host and not host.lower().startswith("www."):
            www = parsed._replace(netloc="www." + host).geturl()
            final_url, html, err3 = _try(www)
            if not err3:
                return final_url, html, err3
    except Exception:
        pass

    return final_url, html, err

def strip_scripts_and_styles(html: str) -> str:
    if not html:
        return ""
    out = re.sub(r"<script\\b[^>]*>.*?</script>", " ", html, flags=re.IGNORECASE | re.DOTALL)
    out = re.sub(r"<style\\b[^>]*>.*?</style>", " ", out, flags=re.IGNORECASE | re.DOTALL)
    return out


def strip_tags(html: str) -> str:
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text).strip()


def extract_links(html: str, base_url: str) -> list[str]:
    links: list[str] = []
    for m in re.finditer(r'href=["\']([^"\']+)["\']', html or "", flags=re.IGNORECASE):
        href = m.group(1).strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        abs_url = urllib.parse.urljoin(base_url, href)
        links.append(abs_url)
    return links


def pick_contact_pages(links: list[str], base_url: str) -> list[str]:
    # Prefer same-domain contact-ish pages.
    candidates = []
    for u in links:
        if not same_site(base_url, u):
            continue
        lu = u.lower()
        if any(k in lu for k in ("/contact", "contact-us", "get-in-touch", "support", "/about", "/help")):
            candidates.append(u)
    # De-dupe while preserving order.
    out: list[str] = []
    for u in candidates:
        if u not in out:
            out.append(u)
    return out[:3]


@dataclass
class Extracted:
    email: str = ""
    phone: str = ""
    contact_form_url: str = ""
    social_url: str = ""
    address: str = ""
    notes: list[str] = None

    def __post_init__(self) -> None:
        if self.notes is None:
            self.notes = []


def extract_from_html(html: str, page_url: str) -> Extracted:
    ex = Extracted()
    cleaned = strip_scripts_and_styles(html or "")
    page_host = host_of(page_url)

    # Emails
    mm = re.search(r'href=["\\\']mailto:([^"\\\'>?]+)', cleaned, flags=re.IGNORECASE)
    if mm:
        cand = mm.group(1).strip()
        if "@" in cand:
            ex.email = cand
    if not ex.email:
        emails = [e for e in EMAIL_RE.findall(cleaned) if e]
        filtered = []
        for e in emails:
            le = e.lower()
            dom = le.split("@", 1)[-1]
            # Reject file-like pseudo-emails like "logo@2x.png".
            tld = dom.rsplit(".", 1)[-1] if "." in dom else ""
            if tld in BAD_EMAIL_TLDS:
                continue
            if dom in BANNED_EMAIL_DOMAINS:
                continue
            if not re.search(r"[a-z]", dom):
                continue
            if re.match(r"^[0-9a-f]{16,}$", le.split("@", 1)[0]):
                continue
            filtered.append(e)
        if filtered:
            ex.email = filtered[0]

    # Phone: prefer tel: links.
    m = re.search(r'href=["\\\']tel:([^"\\\']+)["\\\']', cleaned, flags=re.IGNORECASE)
    if m:
        cand = m.group(1).strip()
        if is_probably_phone(cand):
            ex.phone = cand
    if not ex.phone:
        # Fallback: search for (###) ###-####-ish patterns.
        m2 = re.search(r"(\+?1[\s\-\.])?\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}", cleaned)
        if m2 and is_probably_phone(m2.group(0)):
            ex.phone = m2.group(0).strip()

    # Social
    for dom in SOCIAL_DOMAINS:
        sm = re.search(rf'href=["\\\'](https?://[^"\\\']*{re.escape(dom)}[^"\\\']*)["\\\']', cleaned, flags=re.IGNORECASE)
        if sm:
            url = sm.group(1).strip()
            if "linkedin.com" in url.lower() and "/in/" in url.lower():
                continue
            ex.social_url = url
            break

    # Contact form: any form tag, record the page URL as the form page.
    if re.search(r"<form\\b", cleaned, flags=re.IGNORECASE):
        has_textarea = bool(re.search(r"<textarea\\b", cleaned, flags=re.IGNORECASE))
        has_message_field = bool(re.search(r'name=["\\\'](?:message|your-message|comment)["\\\']', cleaned, flags=re.IGNORECASE))
        if has_textarea or has_message_field:
            ex.contact_form_url = page_url

    # Address: prefer schema-ish structured data, then visible text regex matches.
    if not any(host in page_host for host in SKIP_ADDRESS_HOSTS):
        for m in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html or "", flags=re.IGNORECASE | re.DOTALL):
            raw_json = (m.group(1) or "").strip()
            if not raw_json:
                continue
            try:
                payload = json.loads(raw_json)
            except Exception:
                continue
            items = payload if isinstance(payload, list) else payload.get("@graph", [payload]) if isinstance(payload, dict) else []
            if not isinstance(items, list):
                items = [items]
            for item in items:
                if not isinstance(item, dict):
                    continue
                addr = item.get("address") or item.get("location")
                if not isinstance(addr, dict):
                    continue
                candidate = ", ".join(
                    [
                        normalize_value(addr.get("streetAddress") or addr.get("street")) or "",
                        normalize_value(addr.get("addressLocality") or addr.get("city")) or "",
                        normalize_value(addr.get("addressRegion") or addr.get("state")) or "",
                        normalize_value(addr.get("postalCode") or addr.get("zip")) or "",
                    ]
                )
                candidate = re.sub(r"(,\s*){2,}", ", ", candidate).strip(" ,")
                candidate = normalize_address_value(candidate)
                if candidate and len(candidate) <= 120:
                    ex.address = candidate
                    break
            if ex.address:
                break

        if not ex.address:
            text = strip_tags(cleaned)
            for match in ADDRESS_RE.finditer(text):
                candidate = normalize_address_value(match.group(1))
                if candidate and len(candidate) <= 120:
                    ex.address = candidate
                    break
        if not ex.address:
            text = strip_tags(cleaned)
            for match in PO_BOX_RE.finditer(text):
                candidate = normalize_address_value(match.group(1))
                if candidate and len(candidate) <= 120:
                    ex.address = candidate
                    break

    return ex


def recompute_contact_path(email: str, phone: str, contact_form: str, social: str) -> str:
    if email and "@" in email:
        return "email"
    if contact_form:
        return "form"
    if phone:
        return "phone-only"
    if social:
        return "social"
    return "unknown"


def parse_view_profile_paths(view_path: Path) -> list[Path]:
    text = view_path.read_text(encoding="utf-8", errors="ignore")
    rels = re.findall(r"\bprofile:\s+([^\s]+profile\.md)\b", text)
    out: list[Path] = []
    for rel in rels:
        p = REPO_ROOT / rel
        if p.exists():
            out.append(p)
    # De-dupe while preserving order.
    seen: set[str] = set()
    deduped: list[Path] = []
    for p in out:
        key = p.as_posix()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(p)
    return deduped


def parse_json_profile_paths(queue_path: Path, db_path: Path, offset: int, limit: Optional[int]) -> list[Path]:
    payload = json.loads(queue_path.read_text(encoding="utf-8", errors="ignore"))
    rows = payload[offset:]
    if limit is not None:
        rows = rows[:limit]
    lead_ids = [int(row["lead_id"]) for row in rows if row.get("lead_id") is not None]
    if not lead_ids:
        return []

    out: list[Path] = []
    with sqlite3.connect(db_path) as conn:
        for lead_id in lead_ids:
            row = conn.execute("SELECT profile_path FROM leadops_leads WHERE lead_id = ?", (lead_id,)).fetchone()
            if not row or not row[0]:
                continue
            profile_path = Path(row[0])
            if not profile_path.is_absolute():
                profile_path = REPO_ROOT / profile_path
            if profile_path.exists():
                out.append(profile_path)

    seen: set[str] = set()
    deduped: list[Path] = []
    for p in out:
        key = p.as_posix()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(p)
    return deduped


@dataclass
class Result:
    profile: Path
    website: str
    fetched_pages: list[str]
    extracted: Extracted
    error: str
    changed: list[str]


def process_profile(profile_path: Path, timeout_s: int, address_only: bool = False) -> Result:
    text = profile_path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()

    website_raw = find_header_value(lines, "Website") or ""
    website = normalize_url(website_raw)

    # Some profiles store url in bullets or body; fallback to any url token.
    if not website:
        website = normalize_url(extract_first_url(text) or extract_domain_token(text))

    fetched_pages: list[str] = []
    extracted = Extracted()
    error = ""
    changed: list[str] = []

    if not website:
        return Result(profile=profile_path, website="", fetched_pages=[], extracted=extracted, error="missing_website", changed=[])

    # Skip obvious chains / parked domains that don't represent a local lead.
    lw = website.lower()
    if "applebees.com" in lw:
        return Result(profile=profile_path, website=website, fetched_pages=[], extracted=extracted, error="skipped_chain_applebees", changed=[])

    # Etsy shop: treat as "social" contact path (platform messaging).
    if "etsy.com/shop/" in lw:
        extracted.social_url = website
        # No fetching required.
        return Result(profile=profile_path, website=website, fetched_pages=[website], extracted=extracted, error="", changed=[])

    final_url, html, fetch_err = fetch_with_fallbacks(website, timeout_s=timeout_s)
    fetched_pages.append(final_url or website)
    if fetch_err and not html:
        return Result(profile=profile_path, website=website, fetched_pages=fetched_pages, extracted=extracted, error=fetch_err, changed=[])

    # Extract from homepage, then try up to 3 contact-like pages.
    ex_home = extract_from_html(html, final_url or website)
    extracted = ex_home

    links = extract_links(html, final_url or website)
    contact_pages = pick_contact_pages(links, final_url or website)
    for page in contact_pages:
        f_url, f_html, f_err = fetch(page, timeout_s=timeout_s)
        fetched_pages.append(f_url or page)
        if f_err and not f_html:
            continue
        page_url = f_url or page
        ex_page = extract_from_html(f_html, page_url)
        if not extracted.email and ex_page.email:
            extracted.email = ex_page.email
        if not extracted.phone and ex_page.phone:
            extracted.phone = ex_page.phone
        if not extracted.social_url and ex_page.social_url:
            extracted.social_url = ex_page.social_url
        if not extracted.contact_form_url and ex_page.contact_form_url:
            extracted.contact_form_url = ex_page.contact_form_url
        if not extracted.address and ex_page.address:
            extracted.address = ex_page.address
        # If this is a contact-ish URL and it fetched successfully, keep it as the form page
        # even if the form is rendered client-side (no <form> tag in HTML).
        if (not extracted.contact_form_url) and ("/contact" in page_url.lower()) and ("contact" in strip_scripts_and_styles(f_html or "").lower()):
            extracted.contact_form_url = page_url

    def is_bad_email(value: Optional[str]) -> bool:
        v = (value or "").strip().lower()
        if not v or v in MISSING_VALUES:
            return False
        if "@" not in v:
            return True
        dom = v.split("@", 1)[-1]
        if dom in BANNED_EMAIL_DOMAINS:
            return True
        tld = dom.rsplit(".", 1)[-1] if "." in dom else ""
        if tld in BAD_EMAIL_TLDS:
            return True
        if not re.search(r"[a-z]", dom):
            return True
        if re.match(r"^[0-9a-f]{16,}@sentry\\.io$", v):
            return True
        return False

    def is_bad_social(value: Optional[str]) -> bool:
        v = (value or "").strip().lower()
        if not v or v in MISSING_VALUES:
            return False
        if "linkedin.com" in v and "/in/" in v:
            return True
        return False

    def is_bad_contact_form(value: Optional[str]) -> bool:
        v = (value or "").strip().lower()
        if not v or v in MISSING_VALUES:
            return False
        if "/password" in v:
            return True
        return False

    # Apply to header, but only fill blanks. Treat known-bad values as blank.
    cur_email = normalize_value(find_header_value(lines, "Email"))
    cur_phone = normalize_value(find_header_value(lines, "Phone"))
    cur_form = normalize_value(find_header_value(lines, "Contact form"))
    cur_social = normalize_value(find_header_value(lines, "Social media"))
    cur_address = normalize_address_value(find_header_value(lines, "Address"))

    if is_bad_email(cur_email):
        cur_email = None
    if is_bad_social(cur_social):
        cur_social = None
    if is_bad_contact_form(cur_form):
        cur_form = None

    if not address_only:
        if not cur_email and extracted.email:
            if set_header_value(lines, "Email", extracted.email):
                changed.append(f"Email <- {extracted.email}")
                cur_email = extracted.email

        if not cur_phone and extracted.phone:
            if set_header_value(lines, "Phone", extracted.phone):
                changed.append(f"Phone <- {extracted.phone}")
                cur_phone = extracted.phone

        ex_form_url = normalize_url(extracted.contact_form_url) if extracted.contact_form_url else ""
        cur_form_url = normalize_url(cur_form) if cur_form else ""
        home_url = normalize_url(final_url or website)

        # If we discovered a better contact page, allow replacing a homepage placeholder.
        if ex_form_url and (not cur_form or cur_form_url == home_url):
            if set_header_value(lines, "Contact form", ex_form_url):
                changed.append(f"Contact form <- {ex_form_url}")
                cur_form = ex_form_url

        if not cur_social and extracted.social_url:
            if set_header_value(lines, "Social media", extracted.social_url):
                changed.append(f"Social media <- {extracted.social_url}")
                cur_social = extracted.social_url

    if not cur_address and extracted.address:
        if set_header_value(lines, "Address", extracted.address):
            changed.append(f"Address <- {extracted.address}")
            cur_address = extracted.address

    # Cleanup pass: remove known-bad extracted values if nothing better was found.
    if (not changed) and (not address_only):
        header_email = normalize_value(find_header_value(lines, "Email"))
        if is_bad_email(header_email):
            if set_header_value(lines, "Email", "not found"):
                changed.append("Email <- not found (removed telemetry email)")
                cur_email = None
        header_social = normalize_value(find_header_value(lines, "Social media"))
        if is_bad_social(header_social):
            if set_header_value(lines, "Social media", "not found"):
                changed.append("Social media <- not found (removed personal profile)")
                cur_social = None
        header_form = normalize_value(find_header_value(lines, "Contact form"))
        if is_bad_contact_form(header_form):
            if set_header_value(lines, "Contact form", "not found"):
                changed.append("Contact form <- not found (removed invalid form url)")
                cur_form = None
        # If Contact form points at the homepage but we did not detect a message-form there, clear it.
        if header_form and (normalize_url(header_form) == (final_url or website)) and (not extracted.contact_form_url):
            if set_header_value(lines, "Contact form", "not found"):
                changed.append("Contact form <- not found (homepage did not contain a message form)")
                cur_form = None

    # Contact path update if we actually filled something new.
    if changed:
        new_cp = recompute_contact_path(cur_email or "", cur_phone or "", cur_form or "", cur_social or "")
        if (not address_only) and set_header_value(lines, "Contact path", new_cp):
            changed.append(f"Contact path <- {new_cp}")

        new_text = "\n".join(lines).rstrip() + "\n"
        profile_path.write_text(new_text, encoding="utf-8")

    return Result(profile=profile_path, website=website, fetched_pages=fetched_pages, extracted=extracted, error=fetch_err, changed=changed)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-view", help="View file containing profile paths (example: leads/views/no-contact-website-yes.md)")
    ap.add_argument("--from-json", help="Queue JSON containing lead_id rows to resolve via crm.sqlite.")
    ap.add_argument("--db", default=str(DEFAULT_DB), help="Path to crm.sqlite for --from-json mode.")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--offset", type=int, default=0)
    ap.add_argument("--timeout", type=int, default=15)
    ap.add_argument("--address-only", action="store_true", help="Only fill Address; skip other contact-field edits.")
    ap.add_argument("--report", default=str(REPO_ROOT / "tmp" / f"backfill-contact-from-websites-{TODAY}.md"))
    args = ap.parse_args()
    if bool(args.from_view) == bool(args.from_json):
        raise SystemExit("Provide exactly one of --from-view or --from-json.")

    source_label = args.from_view or args.from_json
    if args.from_view:
        view_path = (REPO_ROOT / args.from_view) if not Path(args.from_view).is_absolute() else Path(args.from_view)
        if not view_path.exists():
            raise SystemExit(f"missing view: {view_path}")
        profiles = parse_view_profile_paths(view_path)
        profiles = profiles[args.offset :]
        if args.limit is not None:
            profiles = profiles[: args.limit]
    else:
        queue_path = (REPO_ROOT / args.from_json) if not Path(args.from_json).is_absolute() else Path(args.from_json)
        if not queue_path.exists():
            raise SystemExit(f"missing queue json: {queue_path}")
        profiles = parse_json_profile_paths(queue_path, Path(args.db), args.offset, args.limit)

    results: list[Result] = []
    for p in profiles:
        results.append(process_profile(p, timeout_s=int(args.timeout), address_only=bool(args.address_only)))

    rpt = Path(args.report)
    rpt.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = [
        "# Backfill Contact From Websites",
        f"Generated: {TODAY}",
        f"Source: `{source_label}`",
        f"Profiles scanned: {len(profiles)}",
        "",
    ]

    changed = [r for r in results if r.changed]
    skipped = [r for r in results if r.error.startswith("skipped_")]
    failed = [r for r in results if (r.error and not r.error.startswith("skipped_") and not r.changed)]

    lines.append(f"- Changed profiles: {len(changed)}")
    lines.append(f"- Skipped: {len(skipped)}")
    lines.append(f"- Fetch failures (no change): {len(failed)}")
    lines.append("")

    if changed:
        lines.append("## Updated")
        lines.append("")
        for r in changed:
            rel = r.profile.relative_to(REPO_ROOT).as_posix()
            lines.append(f"- `{rel}`")
            lines.append(f"  - Website: `{r.website}`")
            for c in r.changed:
                lines.append(f"  - {c}")
        lines.append("")

    if skipped:
        lines.append("## Skipped")
        lines.append("")
        for r in skipped:
            rel = r.profile.relative_to(REPO_ROOT).as_posix()
            lines.append(f"- `{rel}`: {r.error} ({r.website})")
        lines.append("")

    if failed:
        lines.append("## Needs Manual Research (Fetch Failed)")
        lines.append("")
        for r in failed:
            rel = r.profile.relative_to(REPO_ROOT).as_posix()
            lines.append(f"- `{rel}`: {r.error} ({r.website})")
        lines.append("")

    rpt.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote report: {rpt}")
    print(f"Changed: {len(changed)} / {len(profiles)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
