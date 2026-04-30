from __future__ import annotations

import argparse
import csv
import email
import imaplib
import os
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from email.message import Message
from email.policy import default as default_policy
from email.utils import parsedate_to_datetime
from pathlib import Path


REPO_ROOT = Path(".")
REPORTS_DIR = REPO_ROOT / "reports"
INDEX_PATH = REPO_ROOT / "leads" / "index.csv"

SELF_EMAILS = {"fred@mccullough.digital", "hello@mccullough.digital"}
EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")


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


def safe_decode(b: bytes) -> str:
    try:
        return b.decode(errors="ignore")
    except Exception:
        return ""


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


def imap_date(d: date) -> str:
    return d.strftime("%d-%b-%Y")


def extract_emails(s: str) -> set[str]:
    return {e.lower() for e in EMAIL_RE.findall(s or "")}


def norm(s: str | None) -> str:
    return (s or "").strip()


def classify_message(msg: Message, text_blob: str) -> str:
    subj = norm(msg.get("Subject")).lower()
    from_ = norm(msg.get("From")).lower()
    auto = norm(msg.get("Auto-Submitted")).lower()
    prec = norm(msg.get("Precedence")).lower()
    x_autoreply = norm(msg.get("X-Autoreply")).lower()

    # Bounce-ish / system
    if "delivery status notification" in subj or "undelivered" in subj or "mail delivery failed" in subj:
        return "bounce/system"
    if "mailer-daemon" in from_ or "postmaster" in from_:
        return "bounce/system"
    if "auto-reply" in subj or "autoreply" in subj or "out of office" in subj:
        return "auto-reply"
    if auto and auto != "no":
        return "auto-reply"
    if prec in {"bulk", "junk", "list"}:
        return "bulk/list"
    if x_autoreply:
        return "auto-reply"

    # Likely human reply indicators
    if subj.startswith("re:") or subj.startswith("fw:") or subj.startswith("fwd:"):
        return "likely-reply"
    if "in-reply-to" in {k.lower() for k in msg.keys()}:
        return "likely-reply"
    if "thanks" in text_blob.lower() or "thank you" in text_blob.lower():
        return "possible-reply"

    return "unknown"


def get_body_preview(msg: Message, limit: int = 280) -> str:
    # Prefer text/plain parts.
    text = ""
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            if ctype != "text/plain":
                continue
            payload = part.get_payload(decode=True)
            if not payload:
                continue
            charset = part.get_content_charset() or "utf-8"
            try:
                text = payload.decode(charset, errors="ignore")
            except Exception:
                text = payload.decode(errors="ignore")
            if text.strip():
                break
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            try:
                text = payload.decode("utf-8", errors="ignore")
            except Exception:
                text = payload.decode(errors="ignore")

    # Clean up whitespace a bit
    cleaned = " ".join((text or "").split())
    return cleaned[:limit]


@dataclass
class LeadRow:
    lead_id: str
    name: str
    batch: str
    profile: str
    email: str


def load_index_rows() -> list[dict]:
    if not INDEX_PATH.exists():
        return []
    rows: list[dict] = []
    with INDEX_PATH.open(newline="", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def build_email_to_lead(index_rows: list[dict]) -> dict[str, LeadRow]:
    mapping: dict[str, LeadRow] = {}
    for row in index_rows:
        email_val = (row.get("Email") or "").strip().lower()
        if not email_val:
            continue
        if email_val in mapping:
            continue
        mapping[email_val] = LeadRow(
            lead_id=(row.get("LeadID") or row.get("Id") or row.get("ID") or "").strip(),
            name=(row.get("Name") or row.get("Lead") or row.get("LeadName") or "").strip(),
            batch=(row.get("Batch") or "").strip(),
            profile=(row.get("ProfilePath") or "").replace("\\", "/").strip(),
            email=email_val,
        )
    return mapping


def main() -> None:
    parser = argparse.ArgumentParser(description="Triage Hostinger INBOX for replies we should address (passive, headers + small previews).")
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", default="fred@mccullough.digital")
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--folders", nargs="*", default=["INBOX", "INBOX.Junk", "INBOX.Spam"], help="Folders to scan.")
    parser.add_argument("--since-days", type=int, default=7, help="Only fetch messages SINCE N days ago.")
    parser.add_argument("--max-per-folder", type=int, default=80, help="Max messages to fetch per folder.")
    parser.add_argument("--report", default=None)
    args = parser.parse_args()

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    index_rows = load_index_rows()
    email_to_lead = build_email_to_lead(index_rows)

    today = date.today().isoformat()
    report_path = Path(args.report) if args.report else (REPORTS_DIR / f"hostinger-inbox-triage-{today}.md")
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    since_date = (date.today() - timedelta(days=args.since_days))
    since_token = imap_date(since_date)

    client = imaplib.IMAP4_SSL(args.host, args.port)
    rows: list[dict] = []

    try:
        client.login(args.user, password)

        status, mailboxes_raw = client.list()
        mailboxes: list[str] = []
        if status == "OK" and mailboxes_raw:
            for line in mailboxes_raw:
                name = parse_mailbox_name(line)
                if name:
                    mailboxes.append(name)

        for preferred in args.folders:
            mailbox = pick_mailbox(mailboxes, preferred, "." + preferred.split(".")[-1]) or preferred
            status, _ = client.select(mailbox, readonly=True)
            if status != "OK":
                continue

            status, data = client.uid("SEARCH", None, "SINCE", since_token)
            if status != "OK" or not data or not data[0]:
                continue

            uids = [u.decode() for u in data[0].split() if u]
            # Newest first
            uids = uids[-args.max_per_folder :]

            for uid in reversed(uids):
                status, msg_data = client.uid("FETCH", uid, "(BODY.PEEK[HEADER] RFC822.SIZE)")
                if status != "OK" or not msg_data:
                    continue

                raw_header = b""
                for chunk in msg_data:
                    if not isinstance(chunk, tuple):
                        continue
                    raw_header += chunk[1] or b""

                # Parse header from the bytes we have
                try:
                    msg = email.message_from_bytes(raw_header, policy=default_policy)
                except Exception:
                    continue

                from_header = norm(msg.get("From"))
                subj = norm(msg.get("Subject"))
                date_header = norm(msg.get("Date"))
                try:
                    dt = parsedate_to_datetime(date_header)
                    day = dt.date().isoformat()
                    ts = dt.isoformat()
                except Exception:
                    day = today
                    ts = ""

                from_emails = extract_emails(from_header)
                from_emails -= SELF_EMAILS

                # Skip our own outbound copies if any appear
                if not from_emails:
                    continue

                # Preview (small) - fetch full RFC822 for the handful of recent messages only.
                preview = ""
                try:
                    # Re-fetch full message for a better preview.
                    status2, full_data = client.uid("FETCH", uid, "(RFC822)")
                    raw = None
                    if status2 == "OK" and full_data:
                        for c in full_data:
                            if isinstance(c, tuple):
                                raw = c[1]
                                break
                    if raw:
                        full_msg = email.message_from_bytes(raw, policy=default_policy)
                        preview = get_body_preview(full_msg)
                        cls = classify_message(full_msg, preview)
                    else:
                        cls = classify_message(msg, "")
                except Exception:
                    cls = classify_message(msg, "")

                # Map to lead if possible
                lead = None
                for em in sorted(from_emails):
                    if em in email_to_lead:
                        lead = email_to_lead[em]
                        break

                rows.append(
                    {
                        "folder": mailbox,
                        "uid": uid,
                        "date": day,
                        "from": from_header,
                        "from_email": ", ".join(sorted(from_emails)),
                        "subject": subj,
                        "class": cls,
                        "preview": preview,
                        "lead_id": (lead.lead_id if lead else ""),
                        "lead_name": (lead.name if lead else ""),
                        "batch": (lead.batch if lead else ""),
                        "profile": (lead.profile if lead else ""),
                    }
                )
    finally:
        try:
            client.logout()
        except Exception:
            pass

    # Sort: likely-reply first, newest first
    rank = {"likely-reply": 0, "possible-reply": 1, "unknown": 2, "auto-reply": 3, "bulk/list": 4, "bounce/system": 5}
    rows.sort(key=lambda r: (rank.get(r["class"], 9), r["date"]), reverse=False)

    lines: list[str] = []
    lines.append("# Hostinger INBOX Triage (Replies / Items To Address)")
    lines.append(f"Generated: {today}")
    lines.append("")
    lines.append(f"- Folders scanned: {', '.join(args.folders)}")
    lines.append(f"- Since: {since_date.isoformat()} ({args.since_days} days)")
    lines.append(f"- Rows: {len(rows)}")
    lines.append("")
    lines.append("| Folder | UID | Date | Class | From | Subject | LeadID | Lead | Profile | Preview |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for r in rows:
        lines.append(
            "| "
            + " | ".join(
                [
                    r["folder"],
                    r["uid"],
                    r["date"],
                    r["class"],
                    r["from"].replace("|", "\\|"),
                    r["subject"].replace("|", "\\|"),
                    r["lead_id"],
                    r["lead_name"].replace("|", "\\|"),
                    r["profile"].replace("|", "\\|"),
                    (r["preview"] or "").replace("|", "\\|"),
                ]
            )
            + " |"
        )
    lines.append("")

    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote: {report_path}")


if __name__ == "__main__":
    main()
