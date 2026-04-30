import argparse
import csv
import imaplib
import os
import re
import subprocess
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from email.message import Message
from email.parser import BytesParser
from email.policy import default as default_policy
from email.utils import parsedate_to_datetime
from pathlib import Path


# Internal/self addresses that can appear in bounces/drafts and should never be treated as leads.
SELF_EMAILS = {
    "fred@mccullough.digital",
    "hello@mccullough.digital",
}
EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")

REPO_ROOT = Path(".")
INDEX_PATH = REPO_ROOT / "leads" / "index.csv"


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


def imap_date(d: date) -> str:
    # IMAP date format: 05-Feb-2026
    return d.strftime("%d-%b-%Y")


def safe_decode(b: bytes) -> str:
    try:
        return b.decode(errors="ignore")
    except Exception:
        return ""


def parse_bounce_details(text: str) -> tuple[set[str], str, str]:
    """
    Returns:
      recipients: set[email]
      status: best-effort DSN status code, like 5.1.1 (string, may be empty)
      diagnostic: best-effort diagnostic line (string, may be empty)
    """
    recipients: set[str] = set()
    status_code = ""
    diagnostic = ""

    lines = text.splitlines()

    # Collect structured DSN recipients first.
    for line in lines:
        low = line.lower().strip()
        if low.startswith("final-recipient:") or low.startswith("original-recipient:"):
            for e in EMAIL_RE.findall(line):
                recipients.add(e.lower())
        if "x-failed-recipients" in low:
            for e in EMAIL_RE.findall(line):
                recipients.add(e.lower())

    # Status/Diagnostic can be folded across lines (continuation starts with whitespace).
    def unfolded_value(prefix: str) -> str:
        prefix_low = prefix.lower()
        out = None
        for i, line in enumerate(lines):
            if line.lower().startswith(prefix_low):
                val = line.split(":", 1)[1].strip() if ":" in line else ""
                j = i + 1
                while j < len(lines) and (lines[j].startswith(" ") or lines[j].startswith("\t")):
                    val += " " + lines[j].strip()
                    j += 1
                out = val.strip()
                break
        return out or ""

    status_candidate = unfolded_value("Status")
    if status_candidate:
        m = re.search(r"(\d\.\d\.\d+)", status_candidate)
        if m:
            status_code = m.group(1)

    diagnostic_candidate = unfolded_value("Diagnostic-Code")
    if diagnostic_candidate:
        diagnostic = diagnostic_candidate
    else:
        # Fallback: search for common SMTP status patterns.
        m = re.search(r"\b(4\d\d|5\d\d)\b\s+(\d\.\d\.\d+)", text)
        if m:
            status_code = status_code or m.group(2)
            diagnostic = diagnostic or m.group(0)

    # Final fallback: any emails in the body (but this can be noisy).
    if not recipients:
        for e in EMAIL_RE.findall(text):
            e = e.lower()
            recipients.add(e)

    recipients -= SELF_EMAILS
    return recipients, status_code, diagnostic


def classify_bounce(status: str, diagnostic: str) -> str:
    diag = (diagnostic or "").lower()
    if "mailbox full" in diag or "mailbox is full" in diag or "over quota" in diag or "quota" in diag:
        return "mailbox-full"
    if "host not found" in diag or "domain" in diag and "not found" in diag:
        return "host-not-found"
    if "user does not exist" in diag or "no such user" in diag or "address not found" in diag or "recipient not found" in diag:
        return "address-not-found"
    if "user unknown" in diag:
        return "address-not-found"
    if "access denied" in diag or "blocked" in diag or "spam" in diag or "policy" in diag or "rejected" in diag:
        return "blocked/policy"
    if status.startswith("5"):
        return "hard-bounce"
    if status.startswith("4"):
        return "soft-bounce"
    if "downstream" in diag or "temporary" in diag:
        return "temporary"
    return "unknown"


def load_index_rows() -> list[dict]:
    if not INDEX_PATH.exists():
        return []
    rows: list[dict] = []
    with INDEX_PATH.open(newline="", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def build_email_to_row(index_rows: list[dict]) -> dict[str, dict]:
    mapping: dict[str, dict] = {}
    for row in index_rows:
        email = (row.get("Email") or "").strip().lower()
        if not email:
            continue
        mapping[email] = row
    return mapping


def build_profile_to_row(index_rows: list[dict]) -> dict[str, dict]:
    # Helps map bounces to leads when the bounced address is mentioned in a profile but isn't the primary Email in index.csv.
    mapping: dict[str, dict] = {}
    for row in index_rows:
        p = (row.get("ProfilePath") or "").replace("\\", "/").strip()
        if not p:
            continue
        mapping[p] = row
    return mapping


def parse_profile_contact(profile_path: Path, bounced_email: str) -> dict:
    out = {
        "contact_path": "",
        "contact_search": "",
        "phone": "",
        "website": "",
        "website_status": "",
        "contact_form": "",
        "social": "",
        "alt_emails": [],
    }
    try:
        text = profile_path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return out

    # Header-ish fields
    for line in text.splitlines()[:80]:
        if line.startswith("Contact path:"):
            out["contact_path"] = line.split(":", 1)[1].strip()
        elif line.startswith("Contact search:"):
            out["contact_search"] = line.split(":", 1)[1].strip()
        elif line.startswith("Phone:"):
            out["phone"] = line.split(":", 1)[1].strip()
        elif line.startswith("Website:"):
            out["website"] = line.split(":", 1)[1].strip()
        elif line.startswith("Website status:"):
            out["website_status"] = line.split(":", 1)[1].strip()
        elif line.startswith("Contact form:"):
            out["contact_form"] = line.split(":", 1)[1].strip()
        elif line.startswith("Social media:"):
            out["social"] = line.split(":", 1)[1].strip()

    # Any other emails in the profile body can be a viable alternate.
    all_emails = []
    for e in EMAIL_RE.findall(text):
        e = e.lower()
        if e in SELF_EMAILS:
            continue
        if e == bounced_email:
            continue
        all_emails.append(e)
    # Unique preserve order
    seen = set()
    alt = []
    for e in all_emails:
        if e not in seen:
            alt.append(e)
            seen.add(e)
    out["alt_emails"] = alt[:5]
    return out


def suggest_next_action(classification: str, contact: dict) -> str:
    def _norm(v: str) -> str:
        return (v or "").strip()

    def _low(v: str) -> str:
        return _norm(v).lower()

    def _is_missing(v: str) -> bool:
        lv = _low(v)
        if not lv:
            return True
        if lv in {"unknown", "not found", "n/a", "na", "none", "null"}:
            return True
        # Treat annotated variants like "not found (dns...)" as missing.
        if lv.startswith("not found "):
            return True
        if lv.startswith("not found("):
            return True
        return False

    def _is_url(v: str) -> bool:
        v = _norm(v)
        return v.startswith("http://") or v.startswith("https://")

    def _digits_only(v: str) -> str:
        return re.sub(r"\D+", "", v or "")

    def _is_probably_phone(v: str) -> bool:
        # Accept common US formats; treat "unknown" etc as missing.
        if _is_missing(v):
            return False
        return len(_digits_only(v)) >= 10

    if contact.get("alt_emails"):
        return "try-alt-email"
    form = contact.get("contact_form") or ""
    if _is_url(form):
        return "use-contact-form"
    # If the profile has already been normalized to phone-only, trust that (unless
    # we have a verified contact-form URL above).
    cp = _low(contact.get("contact_path") or "")
    phone = contact.get("phone") or ""
    if cp == "phone-only" and _is_probably_phone(phone):
        return "phone-only"
    website = contact.get("website") or ""
    ws = _low(contact.get("website_status") or "")
    is_parked_or_unusable_site = any(
        k in ws for k in ("parked", "sedo", "parking", "for sale", "lander", "suspended")
    )
    if (not _is_missing(website)) and (not is_parked_or_unusable_site) and (not _is_url(form)):
        return "check-site-for-form"
    social = (contact.get("social") or "").lower()
    if "facebook.com" in social or "instagram.com" in social:
        return "social-dm"
    if _is_probably_phone(phone):
        return "phone-only"
    # Even if we have nothing, classification can guide what to do next.
    if classification in {"mailbox-full", "temporary", "soft-bounce"}:
        return "retry-later-or-call"
    return "research-alt-contact"


@dataclass(frozen=True)
class BounceEvent:
    folder: str
    bounce_date: datetime | None
    subject: str
    recipients: set[str]
    status: str
    diagnostic: str


def fetch_message(client: imaplib.IMAP4_SSL, msg_id: bytes) -> tuple[Message | None, str]:
    # Headers for context + body text for DSN parsing.
    status, msg_data = client.fetch(msg_id, "(BODY.PEEK[HEADER.FIELDS (DATE SUBJECT)] BODY.PEEK[TEXT])")
    if status != "OK" or not msg_data:
        return None, ""
    header_bytes = b""
    body_bytes = b""
    for chunk in msg_data:
        if not isinstance(chunk, tuple):
            continue
        meta = safe_decode(chunk[0] or b"")
        payload = chunk[1] or b""
        if "BODY[HEADER.FIELDS" in meta.upper():
            header_bytes += payload
        elif "BODY[TEXT" in meta.upper():
            body_bytes += payload
        else:
            # Fallback: if we can't tell, treat smaller payload as headers.
            if len(payload) < 4096:
                header_bytes += payload
            else:
                body_bytes += payload
    msg = None
    if header_bytes:
        try:
            msg = BytesParser(policy=default_policy).parsebytes(header_bytes)
        except Exception:
            msg = None
    return msg, safe_decode(body_bytes)


def main() -> None:
    parser = argparse.ArgumentParser(description="IMAP bounce triage: build a follow-up queue for bounced leads.")
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", default="fred@mccullough.digital")
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--folders", nargs="*", default=["INBOX", "INBOX.Junk"], help="Folders to scan for bounces.")
    parser.add_argument("--since-days", type=int, default=30, help="Only scan bounces SINCE N days ago.")
    parser.add_argument("--max-per-folder", type=int, default=400, help="Max bounce-message ids to fetch per folder.")
    parser.add_argument(
        "--fallback-profile-scan",
        action="store_true",
        default=True,
        help="If a bounced email isn't in leads/index.csv, try rg-scan profiles/disqualified to find where it's referenced.",
    )
    parser.add_argument(
        "--no-fallback-profile-scan",
        action="store_false",
        dest="fallback_profile_scan",
        help="Disable fallback rg scan for unmatched bounces.",
    )
    parser.add_argument("--report", default=None)
    parser.add_argument("--queue", default=None)
    args = parser.parse_args()

    password = os.getenv(args.pass_env)
    if not password:
        password = get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    index_rows = load_index_rows()
    email_to_row = build_email_to_row(index_rows)
    profile_to_row = build_profile_to_row(index_rows)

    since = date.today() - timedelta(days=args.since_days)
    since_token = imap_date(since)

    # Candidate terms, same as existing scripts.
    terms = ("Undelivered", "Delivery Status Notification", "Mail delivery failed", "Undeliverable")

    events: list[BounceEvent] = []

    client = imaplib.IMAP4_SSL(args.host, args.port)
    try:
        client.login(args.user, password)

        for folder in args.folders:
            status, _ = client.select(folder, readonly=True)
            if status != "OK":
                continue

            ids: set[bytes] = set()
            for term in terms:
                token = f'"{term}"' if " " in term else term
                status, data = client.search(None, "SINCE", since_token, "TEXT", token)
                if status == "OK" and data and data[0]:
                    ids.update(data[0].split())

            if not ids:
                continue

            # Fetch newest first, capped.
            ordered = sorted(ids, key=lambda x: int(x))[-args.max_per_folder :]
            for msg_id in reversed(ordered):
                msg, body_text = fetch_message(client, msg_id)
                if not body_text:
                    continue
                recipients, dsn_status, diagnostic = parse_bounce_details(body_text)
                if not recipients:
                    continue

                subj = (msg.get("Subject", "") if msg else "") or ""
                d = (msg.get("Date", "") if msg else "") or ""
                bounce_dt = None
                if d:
                    try:
                        bounce_dt = parsedate_to_datetime(d)
                    except Exception:
                        bounce_dt = None

                events.append(
                    BounceEvent(
                        folder=folder,
                        bounce_date=bounce_dt,
                        subject=subj.strip(),
                        recipients=recipients,
                        status=dsn_status,
                        diagnostic=(diagnostic or "").strip(),
                    )
                )
    finally:
        try:
            client.logout()
        except Exception:
            pass

    # Collapse to latest event per recipient.
    latest: dict[str, BounceEvent] = {}
    for ev in events:
        for r in ev.recipients:
            prev = latest.get(r)
            if not prev:
                latest[r] = ev
                continue
            prev_dt = prev.bounce_date or datetime.min
            cur_dt = ev.bounce_date or datetime.min
            if cur_dt >= prev_dt:
                latest[r] = ev

    def rg_find_profiles(email_addr: str) -> list[str]:
        # Keep this best-effort; it's only used for unmatched bounces.
        try:
            res = subprocess.run(
                ["rg", "-l", "--fixed-strings", email_addr, "leads/profiles", "leads/disqualified"],
                capture_output=True,
                text=True,
                check=False,
            )
        except Exception:
            return []
        if res.returncode not in (0, 1):
            return []
        paths = [p.strip() for p in (res.stdout or "").splitlines() if p.strip().endswith("profile.md")]
        return paths

    def rg_in_worklists(email_addr: str) -> bool:
        """
        If an email shows up in registered-entities worklists but not in leads/index.csv,
        we treat it as in-scope (a misfile or missing canonical profile) rather than noise.
        """
        try:
            res = subprocess.run(
                ["rg", "-l", "--fixed-strings", email_addr, "leads/batches"],
                capture_output=True,
                text=True,
                check=False,
            )
        except Exception:
            return False
        if res.returncode not in (0, 1):
            return False
        return bool((res.stdout or "").strip())

    def parse_profile_identity(profile_path: Path) -> tuple[str, str]:
        # (name, batch)
        name = ""
        batch = ""
        try:
            for line in profile_path.read_text(encoding="utf-8", errors="ignore").splitlines()[:40]:
                if line.startswith("# "):
                    name = line[2:].strip()
                if line.startswith("Batch:"):
                    batch = line.split(":", 1)[1].strip()
            return name, batch
        except Exception:
            return "", ""

    known_bounced = set(latest.keys())

    rows = []
    unmatched = []
    ignored = []
    for email_addr in sorted(latest.keys()):
        ev = latest[email_addr]
        row = email_to_row.get(email_addr)
        profile_paths: list[str] = []
        if row:
            profile_paths = [row.get("ProfilePath") or ""]
        elif args.fallback_profile_scan:
            profile_paths = rg_find_profiles(email_addr)

        if not profile_paths:
            # Keep the "unmatched" list focused on actionable in-scope items.
            if rg_in_worklists(email_addr):
                unmatched.append(email_addr)
            else:
                ignored.append(email_addr)
            continue

        for profile in profile_paths:
            profile_norm = (profile or "").replace("\\", "/")
            row_for_profile = profile_to_row.get(profile_norm)
            profile_path = Path(profile_norm) if profile_norm else Path()
            contact = parse_profile_contact(profile_path, bounced_email=email_addr) if profile else {}
            # Bounce-aware fallback chain:
            # Only treat an alternate email as usable if it has NOT already bounced
            # in this same scan window.
            if contact:
                filtered_alt: list[str] = []
                for alt in (contact.get("alt_emails", []) or []):
                    e = (alt or "").strip().lower()
                    if not e or e in SELF_EMAILS or e == email_addr:
                        continue
                    if e in known_bounced:
                        continue
                    if e not in filtered_alt:
                        filtered_alt.append(e)
                contact["alt_emails"] = filtered_alt
            classification = classify_bounce(ev.status or "", ev.diagnostic or "")
            next_action = suggest_next_action(classification, contact)
            # Disqualified leads should not show up as actionable follow-ups.
            # Use index.csv when available, but also fall back to the folder path.
            is_disqualified = False
            if row_for_profile:
                dq = (row_for_profile.get("Disqualified") or "").strip().lower()
                is_disqualified = dq in {"yes", "true", "1"}
            if (not is_disqualified) and profile_norm.startswith("leads/disqualified/"):
                is_disqualified = True
            if is_disqualified:
                next_action = "skip-disqualified"

            if row_for_profile:
                lead_id = row_for_profile.get("LeadID") or ""
                name = row_for_profile.get("Name") or ""
                batch = row_for_profile.get("Batch") or ""
            elif row:
                lead_id = row.get("LeadID") or ""
                name = row.get("Name") or ""
                batch = row.get("Batch") or ""
            else:
                lead_id = ""
                name, batch = parse_profile_identity(profile_path)

            rows.append(
                {
                    "lead_id": lead_id,
                    "name": name,
                    "batch": batch,
                    "profile": profile_norm,
                    "bounced_email": email_addr,
                    "bounce_date": (ev.bounce_date.date().isoformat() if ev.bounce_date else ""),
                    "dsn_status": ev.status,
                    "classification": classification,
                    "diagnostic": ev.diagnostic,
                    "next_action": next_action,
                    "contact_form": contact.get("contact_form", ""),
                    "phone": contact.get("phone", ""),
                    "website": contact.get("website", ""),
                    "alt_emails": ", ".join(contact.get("alt_emails", []) or []),
                }
            )

    report_path = (
        Path(args.report)
        if args.report
        else Path("reports") / f"hostinger-bounce-triage-{date.today().isoformat()}.md"
    )
    queue_path = (
        Path(args.queue)
        if args.queue
        else Path("outreach")
        / "queues"
        / f"bounced-followup-{date.today().isoformat()}.md"
    )

    report_lines = []
    report_lines.append("# Hostinger Bounce Triage (IMAP)")
    report_lines.append(f"Generated: {date.today().isoformat()}")
    report_lines.append("")
    report_lines.append(f"- Folders scanned: {', '.join(args.folders)}")
    report_lines.append(f"- Since: {since.isoformat()} ({args.since_days} days)")
    report_lines.append(f"- Bounce messages parsed: {len(events)}")
    report_lines.append(f"- Unique bounced recipients: {len(latest)}")
    report_lines.append(f"- Matched to leads/index.csv: {len(rows)}")
    report_lines.append(f"- Unmatched (in-scope): {len(unmatched)}")
    report_lines.append(f"- Ignored (out-of-scope): {len(ignored)}")
    report_lines.append("")

    if rows:
        report_lines.append("## Matched Bounces")
        report_lines.append(
            "| LeadID | Name | Batch | Bounced Email | Date | DSN | Class | Next | Profile |"
        )
        report_lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
        for r in rows:
            report_lines.append(
                "| "
                + " | ".join(
                    [
                        r["lead_id"],
                        r["name"],
                        r["batch"],
                        r["bounced_email"],
                        r["bounce_date"],
                        r["dsn_status"],
                        r["classification"],
                        r["next_action"],
                        r["profile"],
                    ]
                )
                + " |"
            )
        report_lines.append("")

    if unmatched:
        report_lines.append("## Unmatched Bounced Emails (In Scope, Not Found In leads/index.csv)")
        for e in unmatched:
            report_lines.append(f"- {e}")
        report_lines.append("")

    if ignored:
        report_lines.append("## Ignored Bounced Emails (Out Of Scope)")
        report_lines.append(
            "These bounced recipients were not found in `leads/index.csv` and are not referenced in registered-entities worklists."
        )
        for e in ignored:
            report_lines.append(f"- {e}")
        report_lines.append("")

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    # Queue: more operational detail for follow-up.
    queue_lines = []
    queue_lines.append("# Bounced Follow-Up Queue")
    queue_lines.append("")
    queue_lines.append(f"Generated: {date.today().isoformat()}")
    queue_lines.append(f"Source: IMAP bounce scan since {since.isoformat()}")
    queue_lines.append("")
    queue_lines.append(
        "| LeadID | Lead | Batch | Profile | Bounced Email | Class | Next Action | Contact Form | Phone | Alt Emails | Diagnostic |"
    )
    queue_lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for r in rows:
        diag = (r["diagnostic"] or "").replace("|", "/")
        queue_lines.append(
            "| "
            + " | ".join(
                [
                    r["lead_id"],
                    r["name"],
                    r["batch"],
                    r["profile"],
                    r["bounced_email"],
                    r["classification"],
                    r["next_action"],
                    r["contact_form"],
                    r["phone"],
                    r["alt_emails"],
                    diag,
                ]
            )
            + " |"
        )
    queue_lines.append("")

    queue_path.parent.mkdir(parents=True, exist_ok=True)
    queue_path.write_text("\n".join(queue_lines) + "\n", encoding="utf-8")

    print(f"Report: {report_path.as_posix()}")
    print(f"Queue: {queue_path.as_posix()}")
    print(f"Matched bounces: {len(rows)}")
    print(f"Unmatched (in-scope): {len(unmatched)}")
    print(f"Ignored (out-of-scope): {len(ignored)}")


if __name__ == "__main__":
    main()
