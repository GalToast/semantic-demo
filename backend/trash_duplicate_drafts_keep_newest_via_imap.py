#!/usr/bin/env python3
"""
Trash duplicate drafts (same recipient) while keeping the newest draft per recipient.

Problem
- It's common to accidentally generate two drafts for the same recipient.
- If a human hits "Send all drafts" later, duplicates become double-sends.

Approach
- Read IMAP Drafts mailbox.
- Group by canonical recipient email (case-insensitive; first email parsed from To header).
- For each recipient with >1 draft:
  - keep the highest UID (newest-ish)
  - move the others to Trash (COPY + \\Deleted) with .eml backups.

Safety
- Dry-run by default. Use --apply to actually move.
"""

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


def extract_primary_recipient(to_header: str) -> str:
    emails = EMAIL_RE.findall(to_header or "")
    return (emails[0].lower().strip() if emails else "")


@dataclass
class Row:
    recipient: str
    keep_uid: str
    trash_uid: str
    to: str
    subject: str
    action: str
    note: str


def uid_as_int(uid: str) -> int:
    try:
        return int(uid)
    except Exception:
        return -1


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Trash duplicate drafts (same recipient) while keeping the newest per recipient via IMAP (with .eml backups)."
    )
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", required=True)
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--drafts-folder", default="INBOX.Drafts")
    parser.add_argument("--trash-folder", default="INBOX.Trash")
    parser.add_argument("--apply", action="store_true", help="Actually move duplicates to Trash (default: dry-run).")
    parser.add_argument("--report", default="", help="Optional report path.")
    args = parser.parse_args()

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    today = date.today().isoformat()
    backup_dir = TMP_DIR / f"drafts-backups-duplicate-trash-{today}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = Path(args.report) if args.report else (REPORTS_DIR / f"hostinger-trash-duplicate-drafts-keep-newest-{today}.md")

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

        status, _ = client.select(drafts_box, readonly=not args.apply)
        if status != "OK":
            raise SystemExit(f"Failed to select drafts mailbox: {drafts_box}")

        status, data = client.uid("SEARCH", None, "ALL")
        if status != "OK" or not data or not data[0]:
            raise SystemExit("Failed to list drafts (SEARCH ALL).")
        uids = [u.decode() for u in data[0].split() if u]

        # First pass: build recipient -> list of uids
        recipient_to_uids: dict[str, list[str]] = {}
        uid_headers: dict[str, tuple[str, str, str]] = {}
        for uid in uids:
            status, msg_data = client.uid("FETCH", uid, "(BODY.PEEK[HEADER.FIELDS (TO SUBJECT)])")
            if status != "OK" or not msg_data:
                continue
            raw_headers = None
            for chunk in msg_data:
                if isinstance(chunk, tuple):
                    raw_headers = chunk[1]
                    break
            if not raw_headers:
                continue
            msg = email.message_from_bytes(raw_headers)
            to_header = norm(msg.get("To"))
            subject = norm(msg.get("Subject"))
            recipient = extract_primary_recipient(to_header)
            if not recipient:
                continue
            recipient_to_uids.setdefault(recipient, []).append(uid)
            uid_headers[uid] = (recipient, to_header, subject)

        # Second pass: for each duplicate group, keep newest uid and trash the rest.
        for recipient, r_uids in sorted(recipient_to_uids.items()):
            unique = sorted(set(r_uids), key=uid_as_int)
            if len(unique) <= 1:
                continue
            keep_uid = max(unique, key=uid_as_int)
            for uid in unique:
                if uid == keep_uid:
                    continue
                _recipient, to_header, subject = uid_headers.get(uid, (recipient, "", ""))
                if not args.apply:
                    rows.append(
                        Row(
                            recipient=recipient,
                            keep_uid=keep_uid,
                            trash_uid=uid,
                            to=to_header,
                            subject=subject,
                            action="dry_run",
                            note="would_move_duplicate_to_trash",
                        )
                    )
                    continue

                status, full_data = client.uid("FETCH", uid, "(RFC822)")
                if status != "OK" or not full_data:
                    rows.append(
                        Row(
                            recipient=recipient,
                            keep_uid=keep_uid,
                            trash_uid=uid,
                            to=to_header,
                            subject=subject,
                            action="skip",
                            note="fetch_rfc822_failed",
                        )
                    )
                    continue
                raw = None
                for chunk in full_data:
                    if isinstance(chunk, tuple):
                        raw = chunk[1]
                        break
                if not raw:
                    rows.append(
                        Row(
                            recipient=recipient,
                            keep_uid=keep_uid,
                            trash_uid=uid,
                            to=to_header,
                            subject=subject,
                            action="skip",
                            note="missing_rfc822_bytes",
                        )
                    )
                    continue

                (backup_dir / f"{uid}.eml").write_bytes(raw)

                copy_status, _ = client.uid("COPY", uid, trash_box)
                if copy_status != "OK":
                    rows.append(
                        Row(
                            recipient=recipient,
                            keep_uid=keep_uid,
                            trash_uid=uid,
                            to=to_header,
                            subject=subject,
                            action="partial",
                            note="copy_to_trash_failed",
                        )
                    )
                    continue

                store_status, _ = client.uid("STORE", uid, "+FLAGS.SILENT", r"(\Deleted)")
                if store_status != "OK":
                    rows.append(
                        Row(
                            recipient=recipient,
                            keep_uid=keep_uid,
                            trash_uid=uid,
                            to=to_header,
                            subject=subject,
                            action="partial",
                            note="delete_flag_failed",
                        )
                    )
                    continue

                try:
                    client.expunge()
                except Exception:
                    pass

                rows.append(
                    Row(
                        recipient=recipient,
                        keep_uid=keep_uid,
                        trash_uid=uid,
                        to=to_header,
                        subject=subject,
                        action="moved",
                        note="duplicate_trashed_keep_newest",
                    )
                )
    finally:
        try:
            client.logout()
        except Exception:
            pass

    moved = sum(1 for r in rows if r.action == "moved")
    dup_groups = len({r.recipient for r in rows})

    out: list[str] = []
    out.append("# Trash Duplicate Drafts (Keep Newest)")
    out.append(f"Date: {today}")
    out.append("")
    out.append(f"- Mode: {'APPLY' if args.apply else 'DRY-RUN'}")
    out.append(f"- Duplicate recipient groups: {dup_groups}")
    out.append(f"- Drafts moved to Trash: {moved}")
    if args.apply and moved:
        out.append(f"- Backups: `{backup_dir.as_posix()}`")
    out.append("")
    out.append("| Recipient | Keep UID | Trashed UID | Subject | Action | Note |")
    out.append("| --- | --- | --- | --- | --- | --- |")
    for r in rows:
        out.append(f"| {r.recipient} | {r.keep_uid} | {r.trash_uid} | {r.subject} | {r.action} | {r.note} |")
    out.append("")

    report_path.write_text("\n".join(out), encoding="utf-8")
    print(f"Wrote: {report_path}")
    print(f"Duplicate groups: {dup_groups}")
    print(f"Moved: {moved}")


if __name__ == "__main__":
    main()

