from __future__ import annotations

import argparse
import csv
import email
import imaplib
import json
import os
import re
from dataclasses import dataclass
from datetime import date
from email.message import Message
from html import unescape
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse


REPO_ROOT = Path(".")
INDEX_CSV = REPO_ROOT / "leads" / "index.csv"
TMP_DIR = REPO_ROOT / "tmp"

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
# Permissive anchor capture: allow quoted or unquoted href values.
ANCHOR_RE = re.compile(
    r"<a\b[^>]*\bhref\s*=\s*(?:\"([^\"]+)\"|'([^']+)'|([^\s>]+))[^>]*>(.*?)</a>",
    flags=re.IGNORECASE | re.DOTALL,
)
TAG_RE = re.compile(r"<[^>]+>")

# Draft quality rules (mechanical):
FORBIDDEN_CHARS = {
    "\u2014": "em-dash (U+2014)",
    "\u2013": "en-dash (U+2013)",
}

# Heuristic "AI-speak" flags. These are intentionally conservative: they flag,
# they don't auto-rewrite.
AI_PHRASE_FLAGS = [
    "i hope this email finds you well",
    "as an ai",
    "as a language model",
    "leverage our",
    "synergy",
    "touch base",
    "circle back",
    "utilize",
    "seamlessly",
]

# Internal/self addresses that can appear in Drafts (connectivity tests, etc).
SELF_EMAILS = {
    "fred@mccullough.digital",
    "hello@mccullough.digital",
}

# "Truth" checks are best-effort keyword matches between email content and
# the lead profile. If we can't find corroboration, we flag for human review.
CLAIM_PATTERNS: list[tuple[str, re.Pattern[str], list[re.Pattern[str]]]] = [
    (
        "expired_ssl",
        re.compile(r"\b(expired ssl|certificate (is )?expired|ssl certificate)\b", re.I),
        [
            re.compile(r"\bexpired ssl\b", re.I),
            re.compile(r"\bssl\b", re.I),
            re.compile(r"\berr_cert_date_invalid\b", re.I),
            re.compile(r"\bcertificate\b", re.I),
        ],
    ),
    (
        "missing_headers",
        re.compile(r"\b(missing (security )?headers|security headers)\b", re.I),
        [
            re.compile(r"\bmissing (security )?headers\b", re.I),
            re.compile(r"\bsecurity headers\b", re.I),
            re.compile(r"\bhsts\b", re.I),
            re.compile(r"\bcsp\b", re.I),
            re.compile(r"\bx-frame-options\b", re.I),
            re.compile(r"\breferrer-policy\b", re.I),
            re.compile(r"\bcontent-security-policy\b", re.I),
        ],
    ),
    (
        "mixed_content",
        re.compile(r"\bmixed content\b", re.I),
        [re.compile(r"\bmixed content\b", re.I)],
    ),
    (
        "wp_login",
        re.compile(r"\bwp-?login(\.php)?\b", re.I),
        [re.compile(r"\bwp-?login\b", re.I)],
    ),
    (
        "slow_mobile",
        re.compile(r"\b(slow (mobile )?(load|loading)|mobile performance|lighthouse)\b", re.I),
        [re.compile(r"\bslow\b", re.I), re.compile(r"\bmobile\b", re.I)],
    ),
    (
        "broken_instagram",
        re.compile(r"\b(broken instagram|instagram (link )?(is )?broken)\b", re.I),
        [re.compile(r"\binstagram\b", re.I), re.compile(r"\bbroken\b", re.I)],
    ),
    (
        "security_challenge",
        re.compile(r"\b(security (challenge|check)|cloudflare|captcha)\b", re.I),
        [re.compile(r"\bsecurity\b", re.I)],
    ),
    (
        "gohighlevel",
        re.compile(r"\bgohighlevel\b", re.I),
        [re.compile(r"\bgohighlevel\b", re.I)],
    ),
    (
        "squarespace_errors",
        re.compile(r"\bsquarespace\b.*\b(error|console)\b|\bresource errors\b", re.I),
        [re.compile(r"\bsquarespace\b", re.I)],
    ),
]


def get_windows_user_env(name: str) -> str | None:
    if os.name != "nt":
        return None
    try:
        import winreg  # type: ignore

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            value, _ = winreg.QueryValueEx(key, name)
            return str(value) if value else None
    except Exception:
        return None


def norm(s: str | None) -> str:
    return (s or "").strip()


def low(s: str | None) -> str:
    return norm(s).lower()


def parse_recipients(to_header: str) -> list[str]:
    return sorted({e.lower() for e in EMAIL_RE.findall(to_header or "")})


def canonical_email(addr: str, mode: str) -> str:
    """
    Canonicalize email addresses for overlap detection.

    Modes:
    - exact: lowercase only
    - gmail: gmail/googlemail: strip +tag and dots in local-part
    - plus: strip +tag for all domains (more aggressive)
    """
    a = low(addr)
    if "@" not in a:
        return a
    local, domain = a.split("@", 1)
    domain = domain.lower()

    if mode in {"plus", "gmail"}:
        if "+" in local and (mode == "plus" or domain in {"gmail.com", "googlemail.com"}):
            local = local.split("+", 1)[0]

    if mode == "gmail" and domain in {"gmail.com", "googlemail.com"}:
        domain = "gmail.com"
        local = local.replace(".", "")

    return f"{local}@{domain}"


def html_to_text(html: str) -> str:
    # Minimal HTML -> text for keyword scanning.
    stripped = TAG_RE.sub(" ", html or "")
    return re.sub(r"\s+", " ", unescape(stripped)).strip()


def extract_parts(msg: Message) -> tuple[str, str]:
    """
    Returns (text_plain, text_html). Either may be empty.
    """
    text_plain = ""
    text_html = ""

    if msg.is_multipart():
        for part in msg.walk():
            ctype = low(part.get_content_type())
            disp = low(part.get("Content-Disposition"))
            if disp.startswith("attachment"):
                continue
            try:
                payload = part.get_payload(decode=True)
            except Exception:
                payload = None
            if not payload:
                continue
            charset = part.get_content_charset() or "utf-8"
            try:
                decoded = payload.decode(charset, errors="replace")
            except Exception:
                decoded = payload.decode("utf-8", errors="replace")
            if ctype == "text/plain" and not text_plain:
                text_plain = decoded
            elif ctype == "text/html" and not text_html:
                text_html = decoded
    else:
        ctype = low(msg.get_content_type())
        try:
            payload = msg.get_payload(decode=True)
        except Exception:
            payload = None
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            try:
                decoded = payload.decode(charset, errors="replace")
            except Exception:
                decoded = payload.decode("utf-8", errors="replace")
            if ctype == "text/html":
                text_html = decoded
            else:
                text_plain = decoded

    return (text_plain or "").strip(), (text_html or "").strip()


def signature_link_findings(html: str, text_plain: str) -> tuple[bool, list[dict]]:
    """
    Detect a hyperlink to mccullough.digital in the draft body.

    Return (ok, findings). "ok" means we found an anchor tag whose href targets
    mccullough.digital. We do NOT require exact visible text because many
    valid signatures use variations like "mccullough.digital" or "McCullough".
    """
    findings: list[dict] = []
    if html:
        for g1, g2, g3, inner in ANCHOR_RE.findall(html):
            href = (g1 or g2 or g3 or "").strip()
            if not href:
                continue
            inner_text = html_to_text(inner)
            if "mccullough.digital" in low(href):
                findings.append({"href": href, "text": inner_text.strip()[:120]})

    ok = len(findings) > 0

    # If there's a plain-text mention of the domain but no anchor, keep it as evidence.
    if not ok and "mccullough.digital" in low(text_plain or ""):
        findings.append({"href": "", "text": "plain-text contains mccullough.digital"})

    return ok, findings


def greeting_slug_leak(body_text: str) -> str | None:
    """
    Detect when the greeting contains our internal slug/id instead of a real business name.
    Examples:
    - "Hi 882-ber-bookkeeping team,"
    - "Hi 999-blue-cove-pool-service-llc team,"
    """
    if not body_text:
        return None
    m = re.search(r"(?mi)^(hi|hello)\s+(.+?)\s+team,", body_text)
    if not m:
        return None
    name = (m.group(2) or "").strip()
    if not name:
        return None
    # Slugs are typically hyphenated with no spaces; often start with digits.
    if " " in name:
        return None
    lower = name.lower()
    if re.match(r"^\d{2,}-[a-z0-9-]+$", lower):
        return name
    if "-" in lower and lower == name:
        return name
    return None


def slug_token_leak(body_text: str) -> str | None:
    """
    Detect internal lead slug tokens like "999-blue-cove-pool-service-llc" anywhere in the body.
    These should never reach the recipient.
    """
    if not body_text:
        return None
    # Require at least one letter after the first hyphen so we don't flag phone numbers like 936-228-2382.
    m = re.search(r"\b\d{2,}-[a-z][a-z0-9-]*\b", body_text, flags=re.I)
    if not m:
        return None
    return m.group(0)


def detect_forbidden_chars(text: str) -> list[str]:
    hits: list[str] = []
    for ch, label in FORBIDDEN_CHARS.items():
        if ch in text:
            hits.append(label)
    return hits


def detect_ai_phrases(text: str) -> list[str]:
    t = low(text)
    return [p for p in AI_PHRASE_FLAGS if p in t]


def extract_claim_tags(text: str) -> list[str]:
    tags: list[str] = []
    for tag, pat, _profile_pats in CLAIM_PATTERNS:
        if pat.search(text or ""):
            tags.append(tag)
    return tags


def profile_supports_claims(profile_text: str, claim_tags: Iterable[str]) -> tuple[bool, list[str]]:
    """
    Returns (ok, missing_tags). A claim is "supported" if at least one of its
    expected patterns appears in the profile text.
    """
    pt = profile_text or ""
    missing: list[str] = []
    for tag in claim_tags:
        expected = None
        for t, _pat, prof_pats in CLAIM_PATTERNS:
            if t == tag:
                expected = prof_pats
                break
        if not expected:
            continue
        if not any(p.search(pt) for p in expected):
            missing.append(tag)
    return (len(missing) == 0), missing


@dataclass
class LeadRow:
    lead_id: str
    name: str
    email: str
    batch: str
    profile_path: str
    website: str
    disqualified: bool


def load_registered_entities_email_map() -> dict[str, list[LeadRow]]:
    mapping: dict[str, list[LeadRow]] = {}
    if not INDEX_CSV.exists():
        return mapping
    with INDEX_CSV.open(newline="", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            batch = norm(row.get("Batch"))
            if not batch.startswith("registered-entities-batch-"):
                continue
            email_addr = low(row.get("Email"))
            if "@" not in email_addr:
                continue
            lead = LeadRow(
                lead_id=norm(row.get("LeadID")),
                name=norm(row.get("Name")),
                email=email_addr,
                batch=batch,
                profile_path=norm(row.get("ProfilePath")),
                website=norm(row.get("Website")),
                disqualified=(low(row.get("Disqualified")) == "yes" or low(row.get("Status")) == "disqualified"),
            )
            mapping.setdefault(email_addr, []).append(lead)
    return mapping


def website_domain(value: str) -> str:
    v = norm(value)
    if not v or low(v) in {"unknown", "not found", "n/a", "na"}:
        return ""
    if "://" not in v:
        v = "https://" + v
    try:
        host = urlparse(v).netloc.lower()
    except Exception:
        return ""
    if host.startswith("www."):
        host = host[4:]
    return host


def pick_best_for_email(recipient_email: str, rows: list[LeadRow]) -> tuple[LeadRow | None, str]:
    """
    Deterministic multi-match resolver for recipient email -> one lead.
    Heuristics:
    - Prefer non-disqualified.
    - Prefer website domain matching the email domain.
    - Prefer lower LeadID (stable tie-break).
    """
    if not rows:
        return None, "no_rows"
    if len(rows) == 1:
        return rows[0], "single"

    email_domain = recipient_email.split("@", 1)[-1].lower() if "@" in recipient_email else ""

    candidates = list(rows)
    non_dq = [r for r in candidates if not r.disqualified]
    if non_dq:
        candidates = non_dq

    domain_matches = [r for r in candidates if website_domain(r.website) and website_domain(r.website) == email_domain]
    if domain_matches:
        candidates = domain_matches

    def lead_id_int(r: LeadRow) -> int:
        try:
            return int(r.lead_id)
        except Exception:
            return 10**9

    candidates = sorted(candidates, key=lead_id_int)
    chosen = candidates[0]
    resolution = "non_dq" if non_dq else "dq_only"
    if domain_matches:
        resolution = "website_domain"
    return chosen, resolution


def latest_tmp_json(prefix: str) -> Path | None:
    files = sorted(TMP_DIR.glob(f"{prefix}_*.json"))
    if not files:
        return None
    return max(files, key=lambda p: p.stat().st_mtime)


def load_sent_recipients(sent_index_path: Path) -> dict[str, list[dict]]:
    """
    Build a recipient -> list(sent_item) mapping from our IMAP sent index export.

    Each sent_item is expected to contain at least: id, to, subject, date.
    """
    try:
        sent_index = json.loads(sent_index_path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return {}

    mapping: dict[str, list[dict]] = {}
    for page in sent_index.get("pages", []) or []:
        for item in page.get("items", []) or []:
            to_field = item.get("to", "") or ""
            for e in EMAIL_RE.findall(to_field):
                e = e.lower()
                mapping.setdefault(e, []).append(
                    {
                        "id": item.get("id", ""),
                        "to": to_field,
                        "subject": item.get("subject", "") or "",
                        "date": item.get("date", "") or "",
                    }
                )
    return mapping


def extract_profile_header_emails(profile_path: str) -> set[str]:
    """
    Extract likely lead-owned emails from profile header fields.

    We intentionally avoid scanning the entire file to reduce false matches.
    """
    p = Path(profile_path)
    if not profile_path or not p.exists():
        return set()
    try:
        lines = p.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception:
        return set()

    emails: set[str] = set()
    for line in lines[:140]:
        head = line.strip()
        if not head:
            continue
        key = head.split(":", 1)[0].strip().lower()
        if key not in {"email", "alt email", "alt-email", "email 2", "email2", "contact email"}:
            continue
        for e in EMAIL_RE.findall(head):
            emails.add(e.lower())
    return emails


def fetch_drafts_full(
    client: imaplib.IMAP4_SSL, mailbox: str
) -> list[tuple[str, bytes]]:
    """
    Returns [(uid, rfc822_bytes), ...] newest-first.
    """
    status, _ = client.select(mailbox, readonly=True)
    if status != "OK":
        return []
    status, data = client.uid("search", None, "ALL")
    if status != "OK" or not data or not data[0]:
        return []
    uids = data[0].split()
    out: list[tuple[str, bytes]] = []
    for uid in reversed(uids):
        status, msg_data = client.uid("fetch", uid, "(RFC822)")
        if status != "OK" or not msg_data:
            continue
        raw = None
        for chunk in msg_data:
            if isinstance(chunk, tuple):
                raw = chunk[1]
                break
        if not raw:
            continue
        out.append((uid.decode(errors="ignore"), raw))
    return out


def parse_mailbox_name(raw_line: bytes) -> str | None:
    try:
        text = raw_line.decode(errors="ignore")
    except Exception:
        return None
    match = re.match(r'^\(.*\)\s+"[^"]+"\s+(.+)$', text)
    if match:
        name = match.group(1).strip()
        if name.startswith('"') and name.endswith('"'):
            name = name[1:-1]
        return name
    parts = text.split()
    if parts:
        return parts[-1]
    return None


def pick_mailbox(mailboxes: list[str], preferred: str, fallback_suffix: str) -> str | None:
    if preferred in mailboxes:
        return preferred
    lower_map = {m.lower(): m for m in mailboxes}
    if preferred.lower() in lower_map:
        return lower_map[preferred.lower()]
    for name in mailboxes:
        if name.lower().endswith(fallback_suffix.lower()):
            return name
    return None


def main() -> None:
    parser = argparse.ArgumentParser(
        description="QA all Hostinger IMAP Drafts: signature link, forbidden chars, AI-isms, and best-effort truth checks vs lead profiles."
    )
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", required=True)
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--drafts-folder", default="INBOX.Drafts")
    parser.add_argument(
        "--sent-index",
        default=None,
        help="Path to a hostinger_sent_index_YYYY-MM-DD.json; if omitted, uses latest tmp/hostinger_sent_index_*.json when present.",
    )
    parser.add_argument(
        "--alias-mode",
        choices=["exact", "gmail", "plus"],
        default="gmail",
        help="How to canonicalize recipient emails for Sent-overlap detection (default: gmail).",
    )
    parser.add_argument("--out-report", default=None, help="Markdown report path (default: reports/hostinger-drafts-qa-YYYY-MM-DD.md)")
    parser.add_argument("--out-json", default=None, help="Optional JSON results path (default: tmp/hostinger_drafts_qa_YYYY-MM-DD.json)")
    args = parser.parse_args()

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    today = date.today().isoformat()
    out_report = Path(args.out_report) if args.out_report else (REPO_ROOT / "reports" / f"hostinger-drafts-qa-{today}.md")
    out_json = Path(args.out_json) if args.out_json else (REPO_ROOT / "tmp" / f"hostinger_drafts_qa_{today}.json")
    out_report.parent.mkdir(parents=True, exist_ok=True)
    out_json.parent.mkdir(parents=True, exist_ok=True)

    email_map = load_registered_entities_email_map()

    sent_index_path = Path(args.sent_index) if args.sent_index else latest_tmp_json("hostinger_sent_index")
    sent_raw: dict[str, list[dict]] = load_sent_recipients(sent_index_path) if sent_index_path and sent_index_path.exists() else {}
    sent_recipients: dict[str, list[dict]] = {}
    for raw_email, items in sent_raw.items():
        sent_recipients.setdefault(canonical_email(raw_email, args.alias_mode), []).extend(items)

    client = imaplib.IMAP4_SSL(args.host, args.port)
    try:
        client.login(args.user, password)

        status, mailboxes_raw = client.list()
        mailboxes: list[str] = []
        if status == "OK" and mailboxes_raw:
            for line in mailboxes_raw:
                name = parse_mailbox_name(line)
                if name:
                    mailboxes.append(name)

        drafts_box = pick_mailbox(mailboxes, args.drafts_folder, ".Drafts") or args.drafts_folder
        drafts = fetch_drafts_full(client, drafts_box)
    finally:
        try:
            client.logout()
        except Exception:
            pass

    results: list[dict] = []
    flagged = 0
    sent_overlap_flagged = 0

    # Drafts duplicate check (recipient appears in more than one draft).
    # This is a safety flag: if someone bulk-sends drafts later, duplicates become double-sends.
    recipient_counts: dict[str, int] = {}
    for uid, raw in drafts:
        msg = email.message_from_bytes(raw)
        to_header = norm(msg.get("To"))
        recipients = parse_recipients(to_header)
        for r in recipients:
            if r in SELF_EMAILS:
                continue
            k = canonical_email(r, args.alias_mode)
            if not k:
                continue
            recipient_counts[k] = recipient_counts.get(k, 0) + 1
    duplicate_recipients = {k for k, c in recipient_counts.items() if c > 1}

    for uid, raw in drafts:
        msg = email.message_from_bytes(raw)
        to_header = norm(msg.get("To"))
        subject = norm(msg.get("Subject"))
        recipients = parse_recipients(to_header)
        non_self_recipients = [r for r in recipients if r not in SELF_EMAILS]
        text_plain, text_html = extract_parts(msg)
        body_text = text_plain or html_to_text(text_html)
        combined_text = "\n".join([x for x in [text_plain, html_to_text(text_html)] if x])

        # Skip internal tests so they don't pollute queues.
        skip = bool(recipients) and not non_self_recipients

        # Mechanical checks.
        sig_ok, sig_findings = signature_link_findings(text_html, text_plain)
        forbidden_hits = detect_forbidden_chars(text_plain + "\n" + text_html)
        ai_hits = detect_ai_phrases(body_text)
        slug_greeting = greeting_slug_leak(combined_text)
        slug_token = slug_token_leak(combined_text)

        # Mapping (recipient email -> lead) is best-effort. We avoid guessing.
        mapped: list[LeadRow] = []
        for r in recipients:
            mapped.extend(email_map.get(r, []))
        mapped = mapped[:8]  # cap noise (still enough for multi-match)

        # Sent overlap check: if any recipient email appears in IMAP Sent, assume
        # we've already emailed that recipient at least once. This is a safety
        # check to prevent accidental double-sends.
        sent_matches: list[dict] = []
        overlap_keys: set[str] = set()
        for r in recipients:
            key = canonical_email(r, args.alias_mode)
            if key in sent_recipients:
                overlap_keys.add(key)
                sent_matches.extend(sent_recipients[key])
        # Keep the most recent-ish entries at the top (Sent index export is newest-first already).
        sent_matches = sent_matches[:5]

        claim_tags = extract_claim_tags(body_text)
        truth_missing: list[str] = []
        profile_path = ""
        lead_id = ""
        lead_name = ""
        batch = ""
        mapping_resolution = ""
        chosen_lead: LeadRow | None = None
        if len(mapped) == 1:
            chosen_lead = mapped[0]
            mapping_resolution = "single"
        elif len(mapped) > 1 and non_self_recipients:
            # For multi-match cases, pick a deterministic "best" lead so truth checks
            # can be grounded in one profile. This mirrors ready-to-send resolution.
            chosen_lead, mapping_resolution = pick_best_for_email(non_self_recipients[0], mapped)

        if chosen_lead is not None:
            lead = chosen_lead
            lead_id = lead.lead_id
            lead_name = lead.name
            batch = lead.batch
            profile_path = lead.profile_path
            if profile_path and Path(profile_path).exists() and claim_tags:
                profile_text = Path(profile_path).read_text(encoding="utf-8", errors="ignore")
                _ok, truth_missing = profile_supports_claims(profile_text, claim_tags)
            if profile_path and sent_recipients:
                for e in extract_profile_header_emails(profile_path):
                    k = canonical_email(e, args.alias_mode)
                    if k in sent_recipients:
                        overlap_keys.add(k)
                        sent_matches.extend(sent_recipients[k])
                sent_matches = sent_matches[:5]
        elif len(mapped) > 1:
            truth_missing = ["multi_match_profile"]

        issues: list[str] = []
        if not skip and any(canonical_email(r, args.alias_mode) in duplicate_recipients for r in non_self_recipients):
            issues.append("duplicate_draft_recipient")
        if not skip and sent_matches:
            issues.append("sent_overlap")
        if not skip and not sig_ok:
            issues.append("signature_link_missing")
        if not skip and slug_greeting:
            issues.append("greeting_slug_leak")
        if not skip and slug_token:
            issues.append("slug_token_leak")
        if not skip and forbidden_hits:
            issues.append("forbidden_chars")
        if not skip and ai_hits:
            issues.append("ai_phrase_flags")
        if not skip and truth_missing:
            issues.append("truth_check_flags")

        if issues:
            flagged += 1
        if sent_matches:
            sent_overlap_flagged += 1

        results.append(
            {
                "uid": uid,
                "to": to_header,
                "recipients": recipients,
                "canonical_recipients": sorted({canonical_email(r, args.alias_mode) for r in recipients}),
                "subject": subject,
                "skip": skip,
                "skip_reason": ("self_recipients_only" if skip else ""),
                "mapped_leads": [
                    {"lead_id": m.lead_id, "name": m.name, "batch": m.batch, "profile": m.profile_path, "website": m.website, "disqualified": m.disqualified}
                    for m in mapped
                ],
                "mapping_resolution": mapping_resolution,
                "chosen_lead": {
                    "lead_id": lead_id,
                    "name": lead_name,
                    "batch": batch,
                    "profile": profile_path,
                }
                if lead_id
                else None,
                "sent_overlap": sent_matches,
                "sent_overlap_keys": sorted(overlap_keys),
                "sent_overlap_alias_mode": args.alias_mode,
                "signature_link_ok": sig_ok,
                "signature_link_findings": sig_findings,
                "greeting_slug_leak": slug_greeting or "",
                "slug_token_leak": slug_token or "",
                "forbidden_char_hits": forbidden_hits,
                "ai_phrase_hits": ai_hits,
                "claim_tags": claim_tags,
                "truth_missing": truth_missing,
                "issues": issues,
            }
        )

    out_json.write_text(json.dumps({"date": today, "drafts": results}, indent=2), encoding="utf-8")

    total = len(results)
    report_lines: list[str] = []
    report_lines.append(f"# Hostinger Drafts QA")
    report_lines.append(f"Date: {today}")
    report_lines.append("")
    report_lines.append(f"- Drafts checked: {total}")
    report_lines.append(f"- Drafts flagged: {flagged}")
    if sent_index_path and sent_index_path.exists():
        report_lines.append(f"- Sent overlap flagged: {sent_overlap_flagged} (checked against `{sent_index_path.as_posix()}`)")
        report_lines.append(f"- Alias mode: `{args.alias_mode}`")
    else:
        report_lines.append(f"- Sent overlap flagged: {sent_overlap_flagged} (no sent index found; skipped overlap check)")
    report_lines.append("")
    report_lines.append("## Findings")
    report_lines.append("| UID | To | Subject | Lead | Issues |")
    report_lines.append("| --- | --- | --- | --- | --- |")
    for r in results:
        issues = ", ".join(r["issues"]) if r["issues"] else ""
        to_short = (r["recipients"][0] if r["recipients"] else norm(r["to"])) or ""
        subj = r["subject"] or ""
        lead = ""
        if r["chosen_lead"]:
            lead = f'{r["chosen_lead"]["lead_id"]} {r["chosen_lead"]["name"]}'
        elif r["mapped_leads"]:
            lead = f'multi({len(r["mapped_leads"])})'
        report_lines.append(f"| {r['uid']} | {to_short} | {subj} | {lead} | {issues} |")

    report_lines.append("")
    report_lines.append("## Details (Flagged Only)")
    for r in results:
        if not r["issues"]:
            continue
        report_lines.append(f"### UID {r['uid']}")
        report_lines.append(f"- To: {r['to']}")
        report_lines.append(f"- Subject: {r['subject']}")
        if r["chosen_lead"]:
            report_lines.append(
                f"- Lead: {r['chosen_lead']['lead_id']} {r['chosen_lead']['name']} ({r['chosen_lead']['batch']})"
            )
            report_lines.append(f"- Profile: `{r['chosen_lead']['profile']}`")
        elif r["mapped_leads"]:
            report_lines.append(f"- Lead mapping: multi-match ({len(r['mapped_leads'])})")
            for m in r["mapped_leads"]:
                report_lines.append(f"  - {m['lead_id']} {m['name']} (`{m['profile']}`)")
        else:
            report_lines.append("- Lead mapping: unmapped (recipient not in registered-entities index)")
        report_lines.append(f"- Issues: {', '.join(r['issues'])}")
        if r.get("sent_overlap"):
            report_lines.append(
                f"- Sent overlap: recipient found in Sent (alias mode: {r.get('sent_overlap_alias_mode','unknown')}; keys: {', '.join(r.get('sent_overlap_keys') or [])})"
            )
            for s in (r.get("sent_overlap") or [])[:3]:
                report_lines.append(f"  - Sent: {s.get('date','')} | {s.get('subject','')} | {', '.join(EMAIL_RE.findall(s.get('to','') or ''))}")
        if not r["signature_link_ok"]:
            report_lines.append("- Signature: missing hyperlinked `McCullough Digital` -> `mccullough.digital`")
        else:
            findings = r.get("signature_link_findings") or []
            if findings:
                report_lines.append(f"- Signature link evidence: {findings[0].get('href','')} ({findings[0].get('text','')})")
        if r.get("greeting_slug_leak"):
            report_lines.append(f"- Greeting slug leak: `{r.get('greeting_slug_leak')}`")
        if r.get("slug_token_leak"):
            report_lines.append(f"- Slug token leak: `{r.get('slug_token_leak')}`")
        if r["forbidden_char_hits"]:
            report_lines.append(f"- Forbidden chars: {', '.join(r['forbidden_char_hits'])}")
        if r["ai_phrase_hits"]:
            report_lines.append(f"- AI phrase flags: {', '.join(r['ai_phrase_hits'])}")
        if r["claim_tags"]:
            report_lines.append(f"- Claims detected: {', '.join(r['claim_tags'])}")
        if r["truth_missing"]:
            report_lines.append(f"- Truth check missing: {', '.join(r['truth_missing'])}")
        report_lines.append("")

    out_report.write_text("\n".join(report_lines).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote: {out_report}")
    print(f"Wrote: {out_json}")


if __name__ == "__main__":
    main()
