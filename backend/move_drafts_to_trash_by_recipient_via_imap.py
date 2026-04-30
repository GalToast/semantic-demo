from __future__ import annotations

import argparse
import email
import imaplib
import os
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
TMP_DIR = REPO_ROOT / "tmp"
REPORTS_DIR = REPO_ROOT / "reports"

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


@dataclass
class Row:
    uid: str
    to: str
    subject: str
    action: str
    note: str


def extract_emails(header_value: str) -> list[str]:
    out: list[str] = []
    seen = set()
    for e in EMAIL_RE.findall(header_value or ""):
        el = e.lower()
        if el in seen:
            continue
        seen.add(el)
        out.append(el)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Move drafts to Trash by recipient email via IMAP (with .eml backups).")
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", required=True)
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--drafts-folder", default="INBOX.Drafts")
    parser.add_argument("--trash-folder", default="INBOX.Trash")
    parser.add_argument("--targets", nargs="+", required=True, help="Recipient emails to match (case-insensitive).")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    targets = {t.lower().strip() for t in args.targets if t.strip()}
    if not targets:
        raise SystemExit("No targets provided.")

    today = date.today().isoformat()
    backup_dir = TMP_DIR / f"drafts-trash-backups-{today}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"hostinger-move-drafts-to-trash-by-recipient-{today}.md"

    rows: list[Row] = []

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
        trash_box = pick_mailbox(mailboxes, args.trash_folder, ".Trash") or args.trash_folder

        status, _ = client.select(drafts_box, readonly=bool(args.dry_run))
        if status != "OK":
            raise SystemExit(f"Failed to select drafts mailbox: {drafts_box}")

        # imaplib's uid() does not accept a "charset" argument; passing None becomes the literal string "None".
        status, data = client.uid("SEARCH", "ALL")
        if status != "OK" or not data or not data[0]:
            raise SystemExit("Failed to list drafts (SEARCH ALL).")

        uids = [u.decode() for u in data[0].split() if u]

        for uid in uids:
            # Fetch minimal headers first for matching.
            status, msg_data = client.uid("FETCH", uid, "(BODY.PEEK[HEADER.FIELDS (TO SUBJECT)])")
            if status != "OK" or not msg_data:
                rows.append(Row(uid=uid, to="", subject="", action="skip", note="fetch_headers_failed"))
                continue

            raw_headers = None
            for chunk in msg_data:
                if isinstance(chunk, tuple):
                    raw_headers = chunk[1]
                    break
            if not raw_headers:
                rows.append(Row(uid=uid, to="", subject="", action="skip", note="missing_headers_bytes"))
                continue

            msg = email.message_from_bytes(raw_headers)
            to_header = norm(msg.get("To"))
            subject = norm(msg.get("Subject"))
            to_emails = set(extract_emails(to_header))

            if not (to_emails & targets):
                rows.append(Row(uid=uid, to=to_header, subject=subject, action="skip", note="no_target_match"))
                continue

            if args.dry_run:
                rows.append(Row(uid=uid, to=to_header, subject=subject, action="dry_run", note="would_move_to_trash"))
                continue

            # Fetch full message for backup + move.
            status, full_data = client.uid("FETCH", uid, "(RFC822)")
            if status != "OK" or not full_data:
                rows.append(Row(uid=uid, to=to_header, subject=subject, action="skip", note="fetch_rfc822_failed"))
                continue

            raw = None
            for chunk in full_data:
                if isinstance(chunk, tuple):
                    raw = chunk[1]
                    break
            if not raw:
                rows.append(Row(uid=uid, to=to_header, subject=subject, action="skip", note="missing_rfc822_bytes"))
                continue

            (backup_dir / f"{uid}.eml").write_bytes(raw)

            copy_status, _ = client.uid("COPY", uid, trash_box)
            if copy_status != "OK":
                rows.append(Row(uid=uid, to=to_header, subject=subject, action="partial", note="copy_to_trash_failed"))
                continue

            store_status, _ = client.uid("STORE", uid, "+FLAGS.SILENT", r"(\Deleted)")
            if store_status != "OK":
                rows.append(Row(uid=uid, to=to_header, subject=subject, action="partial", note="delete_flag_failed"))
                continue

            try:
                client.expunge()
            except Exception:
                pass

            rows.append(Row(uid=uid, to=to_header, subject=subject, action="moved", note="matched_target_recipient"))
    finally:
        try:
            client.logout()
        except Exception:
            pass

    moved = sum(1 for r in rows if r.action == "moved")
    matched = sum(1 for r in rows if r.note != "no_target_match")

    lines: list[str] = []
    lines.append("# Move Drafts To Trash By Recipient")
    lines.append(f"Date: {today}")
    lines.append("")
    lines.append(f"- Targets: {', '.join(sorted(targets))}")
    lines.append(f"- Scanned: {len(rows)}")
    lines.append(f"- Matched: {matched}")
    lines.append(f"- Moved: {moved}")
    if not args.dry_run:
        lines.append(f"- Backups: `{backup_dir.as_posix()}`")
    lines.append("")
    lines.append("| UID | To | Subject | Action | Note |")
    lines.append("| --- | --- | --- | --- | --- |")
    for r in rows:
        lines.append(f"| {r.uid} | {r.to} | {r.subject} | {r.action} | {r.note} |")
    lines.append("")

    report_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote: {report_path}")


if __name__ == "__main__":
    main()
