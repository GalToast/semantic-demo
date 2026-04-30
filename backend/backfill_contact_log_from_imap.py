import csv
import json
import os
import re
import imaplib
import argparse
from datetime import date
from email.utils import parsedate_to_datetime
from pathlib import Path

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
SELF_EMAILS = {"fred@mccullough.digital"}

REPO_ROOT = Path(".")
CONTACT_LOG = REPO_ROOT / "outreach" / "logs" / "contact-log.md"
INDEX_PATH = REPO_ROOT / "leads" / "index.csv"
REPORT_PATH = REPO_ROOT / "reports" / f"hostinger-contact-log-backfill-{date.today().isoformat()}.md"


def load_imap_index(prefix: str) -> tuple[Path, list[dict]]:
    files = sorted((REPO_ROOT / "tmp").glob(f"{prefix}_*.json"))
    if not files:
        raise SystemExit(f"Missing IMAP index files for {prefix} in tmp/")
    latest = max(files, key=lambda p: p.stat().st_mtime)
    data = json.loads(latest.read_text(encoding="utf-8", errors="ignore"))
    items = []
    for page in data.get("pages", []):
        for item in page.get("items", []):
            items.append(item)
    return latest, items


def extract_bounced_emails(host: str, user: str, password: str) -> set[str]:
    client = imaplib.IMAP4_SSL(host, 993)
    client.login(user, password)
    bounced = set()

    def scan_mailbox(mailbox: str):
        status, _ = client.select(mailbox, readonly=True)
        if status != "OK":
            return
        ids = set()
        for term in ("Undelivered", "Delivery Status Notification", "Mail delivery failed", "Undeliverable"):
            token = f'"{term}"' if " " in term else term
            status, data = client.search(None, "TEXT", token)
            if status == "OK" and data and data[0]:
                ids.update(data[0].split())
        if not ids:
            return
        for msg_id in ids:
            status, msg_data = client.fetch(msg_id, "(BODY.PEEK[TEXT])")
            if status != "OK" or not msg_data:
                continue
            raw = None
            for chunk in msg_data:
                if isinstance(chunk, tuple):
                    raw = chunk[1]
                    break
            if not raw:
                continue
            try:
                text = raw.decode(errors="ignore")
            except Exception:
                continue
            found_structured = False
            for line in text.splitlines():
                low = line.lower()
                if "final-recipient" in low or "original-recipient" in low or "x-failed-recipients" in low:
                    for email in EMAIL_RE.findall(line):
                        bounced.add(email.lower())
                        found_structured = True
            if not found_structured:
                for email in EMAIL_RE.findall(text):
                    bounced.add(email.lower())

    scan_mailbox("INBOX")
    scan_mailbox("INBOX.Junk")
    client.logout()
    bounced -= SELF_EMAILS
    return bounced


def get_windows_user_env(name: str) -> str | None:
    """
    In some automation contexts, user-level env vars exist but are not loaded
    into the current process environment. This reads the authoritative value
    from HKCU\\Environment when available.
    """
    if os.name != "nt":
        return None
    try:
        import winreg  # type: ignore

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            value, _ = winreg.QueryValueEx(key, name)
            return str(value) if value else None
    except Exception:
        return None


def build_email_index() -> dict[str, dict]:
    mapping = {}
    if INDEX_PATH.exists():
        with INDEX_PATH.open(newline="", encoding="utf-8", errors="ignore") as f:
            reader = csv.DictReader(f)
            for row in reader:
                email = (row.get("Email") or "").strip().lower()
                if not email or email in mapping:
                    continue
                mapping[email] = {
                    "name": row.get("Name") or row.get("LeadName") or email,
                    "batch": row.get("Batch") or "",
                    "profile": row.get("ProfilePath") or "",
                }
    return mapping


def load_existing_rows() -> set[tuple[str, str, str]]:
    if not CONTACT_LOG.exists():
        return set()
    rows = set()
    for line in CONTACT_LOG.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not line.startswith("|"):
            continue
        parts = [part.strip() for part in line.strip("|").split("|")]
        if len(parts) < 6 or parts[0].lower() == "date":
            continue
        date_val, lead, batch, channel, status, notes = parts[:6]
        rows.add((date_val.lower(), lead.lower(), status.lower()))
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill outreach/logs/contact-log.md from Hostinger IMAP sent exports.")
    parser.add_argument("--imap-user", default="fred@mccullough.digital", help="IMAP mailbox user.")
    parser.add_argument("--pass-env", default="IMAP_PASS", help="Env var name holding IMAP password.")
    parser.add_argument("--skip-bounces", action="store_true", help="Skip bounce scan (sent-only backfill).")
    parser.add_argument("--dry-run", action="store_true", help="Do not append to contact-log.md (report only).")
    args = parser.parse_args()

    sent_path, sent_items = load_imap_index("hostinger_sent_index")
    email_index = build_email_index()
    existing = load_existing_rows()

    bounced_emails = set()
    if not args.skip_bounces:
        imap_pass = os.getenv(args.pass_env) or os.getenv("IMAP_PASSWORD")
        if not imap_pass:
            imap_pass = get_windows_user_env(args.pass_env) or get_windows_user_env("IMAP_PASSWORD")
        if not imap_pass:
            raise SystemExit(f"Missing {args.pass_env} env var for bounce scan (or pass --skip-bounces).")
        bounced_emails = extract_bounced_emails("imap.hostinger.com", args.imap_user, imap_pass)

    new_rows = []
    unmatched = []
    used = 0

    for item in sent_items:
        to_field = item.get("to", "") or item.get("text", "")
        emails = [e.lower() for e in EMAIL_RE.findall(to_field)]
        emails = [e for e in emails if e not in SELF_EMAILS]
        if not emails:
            continue
        msg_date = item.get("date", "")
        subject = item.get("subject", "").strip()
        try:
            parsed = parsedate_to_datetime(msg_date)
            day = parsed.date().isoformat()
        except Exception:
            day = date.today().isoformat()

        for email in emails:
            info = email_index.get(email)
            lead_name = info["name"] if info else email
            batch = info["batch"] if info else ""
            status = "bounced" if email in bounced_emails else "sent"

            key = (day.lower(), lead_name.lower(), status.lower())
            if key in existing:
                continue
            existing.add(key)
            used += 1
            note = subject or "Sent via IMAP"
            new_rows.append(f"| {day} | {lead_name} | {batch} | email | {status} | {note} |")
            if not info:
                unmatched.append(email)

    if not CONTACT_LOG.exists():
        CONTACT_LOG.parent.mkdir(parents=True, exist_ok=True)
        CONTACT_LOG.write_text("# Contact Log\n\n| Date | Lead | Batch | Channel | Status | Notes |\n", encoding="utf-8")

    if new_rows and not args.dry_run:
        with CONTACT_LOG.open("a", encoding="utf-8") as f:
            for row in new_rows:
                f.write(row + "\n")

    lines = []
    lines.append("# Hostinger Contact Log Backfill")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append("")
    lines.append(f"- Sent index: {sent_path.as_posix()}")
    lines.append(f"- Sent items: {len(sent_items)}")
    lines.append(f"- Bounced emails: {len(bounced_emails)}")
    lines.append(f"- Rows appended: {0 if args.dry_run else len(new_rows)}")
    lines.append(f"- Rows would append: {len(new_rows)}")
    lines.append("")
    if unmatched:
        lines.append("## Unmatched Emails")
        for email in sorted(set(unmatched)):
            lines.append(f"- {email}")
        lines.append("")

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    if args.dry_run:
        print(f"Rows would append: {len(new_rows)}")
    else:
        print(f"Rows appended: {len(new_rows)}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
