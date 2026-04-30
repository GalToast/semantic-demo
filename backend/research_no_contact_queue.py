from __future__ import annotations

import argparse
import re
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from html import unescape
from typing import Iterable
import base64
from urllib.parse import parse_qs, unquote, urljoin, urlparse
from urllib.request import Request, urlopen
from urllib.parse import quote_plus


REPO_ROOT = Path(".")
UA = "Mozilla/5.0 (compatible; McCulloughDigitalResearchBot/1.0; +https://mccullough.digital)"
BING_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
PHONE_RE = re.compile(
    r"(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}",
    re.IGNORECASE,
)


JUNK_DOMAINS = {
    "fastpeoplesearch.com",
    "truepeoplesearch.com",
    "spokeo.com",
    "whitepages.com",
    "beenverified.com",
    "radaris.com",
    "peekyou.com",
    "peoplefinders.com",
    "addresses.com",
}


def _decode_bing_target(raw_target: str) -> str:
    if not raw_target or not raw_target.startswith("a1"):
        return ""
    base = raw_target[2:]
    base = base.rstrip("=")
    base += "=" * ((4 - (len(base) % 4)) % 4)
    try:
        return base64.b64decode(base).decode("utf-8", errors="ignore")
    except Exception:
        return ""


TRUSTED_DIRECTORY_HINTS = (
    "bbb.org",
    "manta.com",
    "dnb.com",
    "mapquest.com",
    "chamber",
    "showcasetexas.org",
)


def fetch(url: str, timeout: int = 25) -> str:
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=timeout) as resp:
        raw = resp.read(600_000)
    return raw.decode("utf-8", errors="replace")


def fetch_with_user_agent(url: str, user_agent: str, timeout: int = 25) -> str:
    req = Request(url, headers={"User-Agent": user_agent})
    with urlopen(req, timeout=timeout) as resp:
        raw = resp.read(600_000)
    return raw.decode("utf-8", errors="replace")


def ddg_search(query: str, timeout: int = 25) -> list[str]:
    # HTML endpoint keeps things simple (no JS). We decode duckduckgo redirect URLs.
    url = f"https://r.jina.ai/http://duckduckgo.com/html/?q={quote_plus(query)}"
    html = fetch(url, timeout=timeout)
    hrefs = re.findall(r'class="result__a"[^>]+href="([^"]+)"', html)
    if not hrefs:
        # r.jina.ai wraps the DDG HTML into Markdown, with links as (http://duckduckgo.com/l/?uddg=...)
        hrefs = re.findall(r"\]\((https?://[^)]+)\)", html)
    out: list[str] = []
    for h in hrefs:
        h = h.replace("&amp;", "&")
        if h.startswith("//"):
            h = "https:" + h
        if "duckduckgo.com/l/" in h or "duckduckgo.com/l/?" in h:
            try:
                qs = parse_qs(urlparse(h).query)
                uddg = qs.get("uddg", [""])[0]
                if uddg:
                    out.append(unquote(uddg))
                    continue
            except Exception:
                pass
        out.append(h)
    # Dedup preserve order
    seen = set()
    uniq: list[str] = []
    for u in out:
        if not u or u in seen:
            continue
        seen.add(u)
        uniq.append(u)
    return uniq


def bing_search(query: str, timeout: int = 25) -> list[str]:
    # Fallback to Bing HTML (light parse) when DDG is unavailable.
    url = f"https://www.bing.com/search?q={quote_plus(query)}"
    html = fetch_with_user_agent(url, BING_UA, timeout=timeout)
    # Bing tends to include result links in <h2><a href="..."> blocks.
    # The href is often a bing redirect URL containing a base64-encoded target in u=.
    hrefs = re.findall(r"<h2[^>]*>\\s*<a[^>]*href=\"([^\"]+)\"", html, flags=re.IGNORECASE)
    out: list[str] = []
    for h in hrefs:
        if not h:
            continue
        h = unescape(h)
        if h.startswith("/"):
            h = urljoin("https://www.bing.com", h)
        if not h.startswith("http"):
            continue
        host = (urlparse(h).hostname or "").lower()
        if host.endswith("bing.com") or host.endswith("msn.com"):
            if "/ck/" in urlparse(h).path:
                try:
                    q = parse_qs(urlparse(h).query)
                    raw_target = q.get("u", [""])[0]
                    target = _decode_bing_target(raw_target)
                    if not target:
                        continue
                    h = target
                    host = (urlparse(h).hostname or "").lower()
                except Exception:
                    continue
            else:
                continue
        if "go.microsoft" in h.lower():
            continue
        if h not in out:
            out.append(h)
    return out[:20]


def norm_name(name: str) -> str:
    name = re.sub(r"[^a-z0-9\s]+", " ", (name or "").lower())
    name = re.sub(r"\s+", " ", name).strip()
    for suffix in (" llc", " inc", " ltd", " co", " company", " pllc", " l.l.c", " l l c"):
        name = name.replace(suffix, "")
    return name.strip()


def name_tokens(name: str) -> list[str]:
    tokens = [t for t in norm_name(name).split() if len(t) >= 4]
    return tokens[:8]


def seems_junk(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    if not host:
        return True
    if host in JUNK_DOMAINS:
        return True
    if host.endswith(".pdf"):
        return False
    return False


def extract_contact_links(html: str, base_url: str) -> list[str]:
    links = re.findall(r'href="([^"]+)"', html, flags=re.IGNORECASE)
    out: list[str] = []
    for href in links:
        href = href.strip()
        if not href or href.startswith("#"):
            continue
        if href.startswith("mailto:") or href.startswith("tel:"):
            continue
        low = href.lower()
        if "contact" not in low:
            continue
        abs_url = urljoin(base_url, href)
        if abs_url not in out:
            out.append(abs_url)
    return out[:3]


def extract_contacts(html: str) -> tuple[list[str], list[str]]:
    emails = sorted({e.lower() for e in EMAIL_RE.findall(html)})
    phones = sorted({p for p in PHONE_RE.findall(html)})
    return emails, phones


def digits_only(v: str) -> str:
    return re.sub(r"\D+", "", v or "")


def pick_phone(phones: Iterable[str]) -> str:
    best = ""
    for p in phones:
        d = digits_only(p)
        if len(d) >= 10:
            best = p
            break
    return best


def is_real_email(v: str) -> bool:
    v = (v or "").strip()
    return "@" in v and "." in v.split("@", 1)[-1]


def update_header_field(lines: list[str], label: str, value: str) -> None:
    prefix = f"{label}:"
    for i, line in enumerate(lines[:80]):
        if line.startswith(prefix):
            lines[i] = f"{prefix} {value}".rstrip()
            return
    # If missing, insert near the top (after Address if present, otherwise after Source).
    insert_after = None
    for key in ("Address:", "Source:", "Batch line:", "Batch:", "Social check:", "Contact path:"):
        for i, line in enumerate(lines[:60]):
            if line.startswith(key):
                insert_after = i
    if insert_after is None:
        lines.insert(1, f"{prefix} {value}".rstrip())
    else:
        lines.insert(insert_after + 1, f"{prefix} {value}".rstrip())


def append_research_note(text: str, note: str, stamp: str) -> str:
    if stamp in text:
        return text
    # Prefer "## Updates" if present; else "## Notes"; else append a new Notes section.
    for header in ("## Updates", "## Notes"):
        idx = text.find(header)
        if idx != -1:
            # Insert before the next "## " after this section, or append to end.
            after = idx + len(header)
            next_hdr = text.find("\n## ", after)
            if next_hdr == -1:
                return text.rstrip() + "\n\n" + note.strip() + "\n"
            return text[:next_hdr].rstrip() + "\n" + note.strip() + "\n\n" + text[next_hdr:].lstrip()
    return text.rstrip() + "\n\n## Notes\n" + note.strip() + "\n"


@dataclass
class QueueRow:
    lead_id: int
    name: str
    batch: str
    profile: str


def parse_queue(path: Path) -> list[QueueRow]:
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    header_idx = None
    for i, line in enumerate(lines):
        if line.strip().startswith("|") and "|" in line.strip()[1:]:
            if i + 1 < len(lines) and set(lines[i + 1].replace("|", "").strip()) <= {"-", " "}:
                header_idx = i
                break
    if header_idx is None:
        raise SystemExit(f"No markdown table found in {path.as_posix()}")

    col_names = [c.strip() for c in lines[header_idx].strip("|").split("|")]
    try:
        lead_idx = col_names.index("LeadID")
    except ValueError:
        lead_idx = col_names.index("Lead ID") if "Lead ID" in col_names else 0
    name_idx = col_names.index("Name") if "Name" in col_names else 1
    batch_idx = col_names.index("Batch") if "Batch" in col_names else 2
    profile_idx = col_names.index("Profile") if "Profile" in col_names else (len(col_names) - 1)

    out: list[QueueRow] = []
    for line in lines[header_idx + 2 :]:
        if not line.strip().startswith("|"):
            break
        parts = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(parts) != len(col_names):
            continue
        lead_raw = parts[lead_idx].strip()
        if not lead_raw.isdigit():
            continue
        out.append(
            QueueRow(
                lead_id=int(lead_raw),
                name=parts[name_idx].strip(),
                batch=parts[batch_idx].strip(),
                profile=parts[profile_idx].strip(),
            )
        )
    return out


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Research a no-contact queue (DDG + light fetch) and update profiles so the queue does not repeat."
    )
    ap.add_argument("--queue", required=True, help="Queue md path (table with Profile column).")
    ap.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional limit (0 = all).",
    )
    ap.add_argument("--sleep", type=float, default=1.0, help="Sleep seconds between DDG queries.")
    ap.add_argument("--timeout", type=int, default=25)
    ap.add_argument(
        "--start",
        type=int,
        default=0,
        help="Start index into the queue rows (0-based). Useful for parallel agents.",
    )
    ap.add_argument(
        "--stride",
        type=int,
        default=1,
        help="Process every Nth row starting at --start. Useful for parallel agents.",
    )
    ap.add_argument("--apply", action="store_true", help="Write profile changes to disk.")
    ap.add_argument(
        "--force",
        action="store_true",
        help="Re-run research even if Contact search already shows a prior checked/not-found pass.",
    )
    ap.add_argument("--report", default="", help="Output report path (md).")
    args = ap.parse_args()

    queue_path = Path(args.queue)
    rows = parse_queue(queue_path)
    if args.stride and args.stride > 1:
        rows = rows[args.start :: args.stride]
    elif args.start:
        rows = rows[args.start :]
    if args.limit and args.limit > 0:
        rows = rows[: args.limit]

    today = date.today().isoformat()
    report_path = Path(args.report) if args.report else Path("reports") / f"no-contact-research-{today}.md"
    report_lines: list[str] = []
    report_lines.append("# No-Contact Research Pass")
    report_lines.append(f"Generated: {today}")
    report_lines.append(f"Queue: `{queue_path.as_posix()}`")
    report_lines.append(f"Apply: `{'yes' if args.apply else 'no'}`")
    report_lines.append("")

    changed = 0
    found_any = 0
    not_found = 0
    errors = 0
    skipped_due_to_concurrent_edit = 0

    for idx, qr in enumerate(rows, start=1):
        profile_path = Path(qr.profile)
        if not profile_path.exists():
            report_lines.append(f"- {qr.lead_id} {qr.name}: ERROR missing profile: `{qr.profile}`")
            errors += 1
            continue

        try:
            text = profile_path.read_text(encoding="utf-8", errors="ignore")
        except Exception as e:
            report_lines.append(f"- {qr.lead_id} {qr.name}: ERROR reading profile: {e}")
            errors += 1
            continue

        # If already marked not found with a checked date, we still do a quick DDG pass,
        # but we avoid rewriting fields unless we discover something new.
        existing_email = re.search(r"^Email:\s*(.+)$", text, flags=re.MULTILINE)
        existing_phone = re.search(r"^Phone:\s*(.+)$", text, flags=re.MULTILINE)
        existing_form = re.search(r"^Contact form:\s*(.+)$", text, flags=re.MULTILINE)
        existing_social = re.search(r"^Social media:\s*(.+)$", text, flags=re.MULTILINE)
        existing_search = re.search(r"^Contact search:\s*(.+)$", text, flags=re.MULTILINE)

        email_val = (existing_email.group(1).strip() if existing_email else "")
        phone_val = (existing_phone.group(1).strip() if existing_phone else "")
        form_val = (existing_form.group(1).strip() if existing_form else "")
        social_val = (existing_social.group(1).strip() if existing_social else "")
        search_val = (existing_search.group(1).strip() if existing_search else "")

        if (not args.force) and search_val and ("checked" in search_val.lower() or "not found" in search_val.lower()):
            report_lines.append(f"- {qr.lead_id} {qr.name}: skip (already researched: Contact search: {search_val})")
            continue

        already_has_contact = any(
            [
                is_real_email(email_val),
                len(digits_only(phone_val)) >= 10,
                form_val.startswith("http://") or form_val.startswith("https://"),
                "facebook.com" in social_val.lower() or "instagram.com" in social_val.lower(),
            ]
        )
        if already_has_contact:
            report_lines.append(f"- {qr.lead_id} {qr.name}: skip (already has a contact method in header)")
            continue

        tokens = name_tokens(qr.name)
        # Fallback query uses name + TX
        query = f"\"{qr.name}\" TX"
        # Use an unquoted version too, some names are too short
        if not tokens:
            query = f"{qr.name} TX"

        time.sleep(args.sleep)
        urls: list[str] = []
        urls: list[str] = []
        search_errors: list[str] = []
        for searcher in (ddg_search, bing_search):
            try:
                urls = searcher(query, timeout=args.timeout)
                if urls:
                    break
                search_errors.append(f"{searcher.__name__}: no usable results")
            except Exception as e:
                search_errors.append(f"{searcher.__name__}: {type(e).__name__} {str(e)[:120]}")
        if not urls:
            report_lines.append(
                f"- {qr.lead_id} {qr.name}: ERROR search both engines: {'; '.join(search_errors)}"
            )
            errors += 1
            continue

        urls = urls[:8]

        urls = [u for u in urls if u and (not seems_junk(u))]

        found_email = ""
        found_phone = ""
        found_social = ""
        found_site = ""
        found_form = ""
        sources: list[str] = []

        def accept_from_page(url: str, html: str) -> None:
            nonlocal found_email, found_phone, found_social, found_site, found_form
            emails, phones = extract_contacts(html)
            if not found_email:
                for e in emails:
                    if e.endswith(".png") or e.endswith(".jpg"):
                        continue
                    found_email = e
                    break
            if not found_phone:
                found_phone = pick_phone(phones)
            if not found_form:
                links = extract_contact_links(html, url)
                if links:
                    found_form = links[0]

        for u in urls:
            host = (urlparse(u).hostname or "").lower()
            if not host:
                continue
            if any(hint in host for hint in TRUSTED_DIRECTORY_HINTS) or "facebook.com" in host or "instagram.com" in host:
                # Directories/socials can still be useful, but we only accept data if the page mentions the business name tokens.
                try:
                    html = fetch(u, timeout=args.timeout)
                except Exception:
                    continue
                low = html.lower()
                if tokens and not any(t in low for t in tokens):
                    continue
                sources.append(u)
                if "facebook.com" in host and not found_social:
                    found_social = u
                if "instagram.com" in host and not found_social:
                    found_social = u
                accept_from_page(u, html)
                continue

            # Candidate website: confirm it looks like the business name.
            try:
                html = fetch(u, timeout=args.timeout)
            except Exception:
                continue
            low = html.lower()
            if tokens and not any(t in low for t in tokens):
                continue

            sources.append(u)
            if not found_site:
                found_site = u
            accept_from_page(u, html)
            # Try a contact page if one is linked.
            for contact_url in extract_contact_links(html, u):
                try:
                    html2 = fetch(contact_url, timeout=args.timeout)
                except Exception:
                    continue
                sources.append(contact_url)
                accept_from_page(contact_url, html2)
                break

            # If we found something solid, stop early.
            if found_email or found_phone or found_form or found_social:
                break

        # Prepare updates
        new_text = text
        header_lines = new_text.splitlines()

        stamp = f"Contact research pass: {today}"
        if found_email or found_phone or found_form or found_social:
            found_any += 1
            if found_email:
                update_header_field(header_lines, "Email", found_email)
            if found_phone:
                update_header_field(header_lines, "Phone", found_phone)
            if found_site:
                update_header_field(header_lines, "Website", found_site)
            if found_form:
                update_header_field(header_lines, "Contact form", found_form)
            if found_social:
                update_header_field(header_lines, "Social media", found_social)

            # Choose contact path
            if found_email:
                update_header_field(header_lines, "Contact path", "email")
            elif found_form:
                update_header_field(header_lines, "Contact path", "form")
            elif found_phone:
                update_header_field(header_lines, "Contact path", "phone-only")
            elif found_social:
                update_header_field(header_lines, "Contact path", "social")

            update_header_field(header_lines, "Contact search", f"checked {today}")
            update_header_field(header_lines, "Last updated", today)

            new_text = "\n".join(header_lines) + "\n"
            note = (
                f"- **{today}**: {stamp}. Sources checked: "
                f"{', '.join(sources[:4])}{'...' if len(sources) > 4 else ''}"
            )
            new_text = append_research_note(new_text, note, stamp)
            report_lines.append(
                f"- {qr.lead_id} {qr.name}: FOUND "
                f"email={found_email or 'no'} phone={found_phone or 'no'} "
                f"form={found_form or 'no'} social={('yes' if found_social else 'no')}"
            )
        else:
            not_found += 1
            # Mark as not found (checked) and document the sources attempted.
            update_header_field(header_lines, "Contact path", "unknown")
            update_header_field(header_lines, "Contact search", f"not found (checked {today})")
            update_header_field(header_lines, "Last updated", today)
            new_text = "\n".join(header_lines) + "\n"
            # Even if urls is empty or filtered, we note that a DDG pass was attempted.
            src_note = ", ".join(urls[:3]) if urls else "DDG search returned no usable results"
            note = (
                f"- **{today}**: {stamp}. Searched: {query}. Top results checked: "
                f"{src_note}{'...' if urls and len(urls) > 3 else ''}."
            )
            new_text = append_research_note(new_text, note, stamp)
            report_lines.append(f"- {qr.lead_id} {qr.name}: NOT FOUND (no safe contact path)")

        if new_text != text:
            changed += 1
            if args.apply:
                # Concurrency guard: if another agent edited the file after we read it,
                # skip our write and log it so we don't stomp their changes.
                try:
                    latest = profile_path.read_text(encoding="utf-8", errors="ignore")
                except Exception as e:
                    report_lines.append(
                        f"- {qr.lead_id} {qr.name}: ERROR re-reading before write: {type(e).__name__} {str(e)[:120]}"
                    )
                    errors += 1
                    continue
                if latest != text:
                    skipped_due_to_concurrent_edit += 1
                    report_lines.append(
                        f"- {qr.lead_id} {qr.name}: SKIP write (file changed by another agent after read)"
                    )
                    continue
                profile_path.write_text(new_text, encoding="utf-8")

        # Light progress marker every ~10
        if idx % 10 == 0:
            report_lines.append("")
            report_lines.append(f"> Progress: {idx}/{len(rows)} processed")
            report_lines.append("")

    report_lines.append("")
    report_lines.append("## Summary")
    report_lines.append(f"- Total in queue: {len(rows)}")
    report_lines.append(f"- Changed profiles: {changed}")
    report_lines.append(f"- Found a contact path: {found_any}")
    report_lines.append(f"- Marked not found: {not_found}")
    report_lines.append(f"- Skipped due to concurrent edits: {skipped_due_to_concurrent_edit}")
    report_lines.append(f"- Errors: {errors}")
    report_lines.append("")

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(report_lines), encoding="utf-8")
    print(f"Wrote report: {report_path.as_posix()}")
    print(f"Changed profiles: {changed} (apply={args.apply})")


if __name__ == "__main__":
    main()
