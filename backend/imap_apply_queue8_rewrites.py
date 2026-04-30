from __future__ import annotations

import argparse
import email
import imaplib
import os
import re
import time
from dataclasses import dataclass
from datetime import date
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate
from pathlib import Path


REPO_ROOT = Path(".")
TMP_DIR = REPO_ROOT / "tmp"
REPORTS_DIR = REPO_ROOT / "reports"

PLACEHOLDER_PHRASE = "small note that could help avoid issues"

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


def norm(s: str | None) -> str:
    return (s or "").strip()


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


def html_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


@dataclass
class Rewrite:
    lead_id: str
    to: str
    subject: str
    body: str


def parse_rewrites(path: Path) -> dict[str, Rewrite]:
    """
    Parses `outreach/drafts/queue-8-draft-rewrites-YYYY-MM-DD.md` into a map keyed by lead_id.
    Expected per-section format:
      ## 937 - Name
      To: ...
      Subject (suggested): ...
      <blank line>
      <body...>
    """
    text = path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()

    rewrites: dict[str, Rewrite] = {}
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.startswith("## "):
            i += 1
            continue

        # Header: "## 937 - ..."
        header = line[3:].strip()
        lead_id = header.split("-", 1)[0].strip()
        if not lead_id.isdigit():
            i += 1
            continue

        # Next lines: To / Subject
        to = ""
        subject = ""
        i += 1
        while i < len(lines) and lines[i].strip() != "":
            if lines[i].startswith("To:"):
                to = lines[i].split(":", 1)[1].strip()
            if lines[i].startswith("Subject (suggested):"):
                subject = lines[i].split(":", 1)[1].strip()
            i += 1

        # Skip blank lines before body
        while i < len(lines) and lines[i].strip() == "":
            i += 1

        body_lines: list[str] = []
        while i < len(lines) and not lines[i].startswith("## "):
            body_lines.append(lines[i])
            i += 1

        body = "\n".join(body_lines).strip()
        if not to or not subject or not body:
            continue

        rewrites[lead_id] = Rewrite(lead_id=lead_id, to=to, subject=subject, body=body)

    if not rewrites:
        raise SystemExit(f"No rewrites parsed from: {path}")
    return rewrites


def make_message(from_addr: str, to_addr: str, subject: str, body: str) -> bytes:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["To"] = to_addr
    msg["From"] = from_addr
    msg["Date"] = formatdate(localtime=True)

    plain_body = body.strip()

    # Minimal HTML draft: plain text -> <br>, plus signature link if present.
    html_body = html_escape(plain_body).replace("\n", "<br>")
    html_body = html_body.replace(
        "McCullough Digital",
        '<a href="https://mccullough.digital">McCullough Digital</a>',
    )

    msg.attach(MIMEText(plain_body, "plain", "utf-8"))
    msg.attach(MIMEText(f"<html><body>{html_body}</body></html>", "html", "utf-8"))
    return msg.as_bytes()


def extract_text_payload(msg: email.message.Message) -> str:
    """
    Returns decoded text/plain payload if available, else best-effort decoded bytes.
    """
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True)
                if payload is None:
                    continue
                charset = part.get_content_charset() or "utf-8"
                try:
                    return payload.decode(charset, errors="ignore")
                except Exception:
                    return payload.decode(errors="ignore")
    payload = msg.get_payload(decode=True)
    if payload is None:
        try:
            return str(msg.get_payload() or "")
        except Exception:
            return ""
    try:
        return payload.decode("utf-8", errors="ignore")
    except Exception:
        return payload.decode(errors="ignore")


def extract_emails(header_value: str) -> set[str]:
    return {e.lower() for e in EMAIL_RE.findall(header_value or "")}


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply Queue 8 rewrite copy to Hostinger Drafts via IMAP (append new drafts).")
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", default="fred@mccullough.digital")
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--drafts-folder", default="INBOX.Drafts")
    parser.add_argument("--trash-folder", default="INBOX.Trash")
    parser.add_argument("--rewrites", default="outreach/drafts/queue-8-draft-rewrites-2026-02-09.md")
    parser.add_argument("--only-leads", nargs="*", default=None, help="Optional list of lead IDs to apply (e.g., 937 169).")
    parser.add_argument("--trash-placeholders", action="store_true", help="Move placeholder drafts to Trash (phrase match) after appending.")
    parser.add_argument("--dry-run", action="store_true", help="Parse rewrites and connect to IMAP, but do not append/move.")
    args = parser.parse_args()

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    rewrites_path = Path(args.rewrites)
    rewrites = parse_rewrites(rewrites_path)
    if args.only_leads:
        wanted = {str(x).strip() for x in args.only_leads if str(x).strip()}
        rewrites = {k: v for k, v in rewrites.items() if k in wanted}
        if not rewrites:
            raise SystemExit("No rewrites remain after --only-leads filter.")

    today = date.today().isoformat()
    out_dir = TMP_DIR / f"queue8-imap-rewrites-{today}"
    out_dir.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"imap-queue8-rewrites-{today}.md"

    client = imaplib.IMAP4_SSL(args.host, args.port)
    appended: list[tuple[str, str, str]] = []  # (lead_id, to, status)
    trashed: list[tuple[str, str]] = []  # (uid, to)
    skipped_trash: list[tuple[str, str, str]] = []  # (uid, to, reason)

    try:
        client.login(args.user, password)

        # Resolve mailbox names robustly (Hostinger typically uses INBOX.Drafts / INBOX.Trash).
        status, mailboxes_raw = client.list()
        mailboxes: list[str] = []
        if status == "OK" and mailboxes_raw:
            for line in mailboxes_raw:
                name = parse_mailbox_name(line)
                if name:
                    mailboxes.append(name)

        drafts_box = pick_mailbox(mailboxes, args.drafts_folder, ".Drafts") or args.drafts_folder
        trash_box = pick_mailbox(mailboxes, args.trash_folder, ".Trash") or args.trash_folder

        # Append new drafts
        for lead_id, rw in sorted(rewrites.items(), key=lambda kv: int(kv[0])):
            raw_msg = make_message(args.user, rw.to, rw.subject, rw.body)
            (out_dir / f"{lead_id}.eml").write_bytes(raw_msg)

            if args.dry_run:
                appended.append((lead_id, rw.to, "dry_run"))
                continue

            st, resp = client.append(
                drafts_box,
                r"(\Draft)",
                imaplib.Time2Internaldate(time.time()),
                raw_msg,
            )
            appended.append((lead_id, rw.to, "OK" if st == "OK" else f"{st} {resp}"))

        if args.trash_placeholders:
            # Scan Drafts and move only placeholder drafts for our target recipients.
            targets = {rw.to.lower() for rw in rewrites.values()}

            status, _ = client.select(drafts_box, readonly=bool(args.dry_run))
            if status != "OK":
                raise SystemExit(f"Failed to select drafts mailbox: {drafts_box}")

            status, data = client.uid("SEARCH", None, "ALL")
            if status != "OK" or not data or not data[0]:
                raise SystemExit("Failed to list drafts (UID SEARCH ALL).")

            uids = [u.decode() for u in data[0].split() if u]

            for uid in uids:
                # Fetch minimal headers first
                status, msg_data = client.uid("FETCH", uid, "(BODY.PEEK[HEADER.FIELDS (TO SUBJECT)])")
                if status != "OK" or not msg_data:
                    skipped_trash.append((uid, "", "fetch_headers_failed"))
                    continue
                raw_headers = None
                for chunk in msg_data:
                    if isinstance(chunk, tuple):
                        raw_headers = chunk[1]
                        break
                if not raw_headers:
                    skipped_trash.append((uid, "", "missing_headers_bytes"))
                    continue

                msg = email.message_from_bytes(raw_headers)
                to_header = norm(msg.get("To"))
                to_emails = extract_emails(to_header)
                if not (to_emails & targets):
                    continue

                # Fetch full message to test placeholder phrase and backup/move.
                status, full_data = client.uid("FETCH", uid, "(RFC822)")
                if status != "OK" or not full_data:
                    skipped_trash.append((uid, to_header, "fetch_rfc822_failed"))
                    continue
                raw = None
                for chunk in full_data:
                    if isinstance(chunk, tuple):
                        raw = chunk[1]
                        break
                if not raw:
                    skipped_trash.append((uid, to_header, "missing_rfc822_bytes"))
                    continue

                full_msg = email.message_from_bytes(raw)
                text = extract_text_payload(full_msg).lower()
                if PLACEHOLDER_PHRASE not in text:
                    skipped_trash.append((uid, to_header, "not_placeholder"))
                    continue

                # Backup the old placeholder
                (out_dir / f"placeholder-{uid}.eml").write_bytes(raw)

                if args.dry_run:
                    trashed.append((uid, to_header))
                    continue

                copy_status, _ = client.uid("COPY", uid, trash_box)
                if copy_status != "OK":
                    skipped_trash.append((uid, to_header, "copy_to_trash_failed"))
                    continue

                store_status, _ = client.uid("STORE", uid, "+FLAGS.SILENT", r"(\Deleted)")
                if store_status != "OK":
                    skipped_trash.append((uid, to_header, "delete_flag_failed"))
                    continue

                try:
                    client.expunge()
                except Exception:
                    pass

                trashed.append((uid, to_header))
    finally:
        try:
            client.logout()
        except Exception:
            pass

    lines: list[str] = []
    lines.append("# IMAP: Apply Queue 8 Draft Rewrites")
    lines.append(f"Date: {today}")
    lines.append("")
    lines.append(f"- Rewrites file: `{rewrites_path.as_posix()}`")
    lines.append(f"- Drafts folder: `{args.drafts_folder}` (auto-picked on server when available)")
    lines.append(f"- Trash placeholders: `{bool(args.trash_placeholders)}`")
    lines.append(f"- Dry run: `{bool(args.dry_run)}`")
    lines.append(f"- Output backups: `{out_dir.as_posix()}`")
    lines.append("")

    lines.append("## Appended Drafts")
    lines.append("| LeadID | To | Status |")
    lines.append("| --- | --- | --- |")
    for lead_id, to, status in appended:
        lines.append(f"| {lead_id} | {to} | {status} |")
    lines.append("")

    if args.trash_placeholders:
        lines.append("## Placeholder Drafts Moved To Trash")
        lines.append("| UID | To |")
        lines.append("| --- | --- |")
        for uid, to in trashed:
            lines.append(f"| {uid} | {to} |")
        lines.append("")

        lines.append("## Placeholder Scan: Skips / Notes")
        lines.append("| UID | To | Note |")
        lines.append("| --- | --- | --- |")
        for uid, to, note in skipped_trash:
            lines.append(f"| {uid} | {to} | {note} |")
        lines.append("")

    report_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote: {report_path}")


if __name__ == "__main__":
    main()

