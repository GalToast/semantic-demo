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
    subject: str
    to: str
    from_: str
    action: str
    note: str


def norm(s: str | None) -> str:
    return (s or "").strip()


def main() -> None:
    parser = argparse.ArgumentParser(description="Move IMAP messages to Trash by UID (with .eml backups).")
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", default="fred@mccullough.digital")
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--mailbox", default="INBOX", help="Source mailbox (e.g., INBOX, INBOX.Junk).")
    parser.add_argument("--trash-folder", default="INBOX.Trash")
    parser.add_argument("--uids", nargs="+", required=True, help="List of IMAP UIDs to move.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    today = date.today().isoformat()
    backup_dir = TMP_DIR / f"imap-trash-backups-{today}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"imap-move-to-trash-{today}.md"

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

        src_box = pick_mailbox(mailboxes, args.mailbox, "." + args.mailbox.split(".")[-1]) or args.mailbox
        trash_box = pick_mailbox(mailboxes, args.trash_folder, ".Trash") or args.trash_folder

        status, _ = client.select(src_box, readonly=bool(args.dry_run))
        if status != "OK":
            raise SystemExit(f"Failed to select mailbox: {src_box}")

        for uid in args.uids:
            uid = str(uid).strip()
            if not uid:
                continue

            status, hdr_data = client.uid("FETCH", uid, "(BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)])")
            if status != "OK" or not hdr_data:
                rows.append(Row(uid=uid, subject="", to="", from_="", action="skip", note="fetch_headers_failed"))
                continue

            raw_headers = None
            for chunk in hdr_data:
                if isinstance(chunk, tuple):
                    raw_headers = chunk[1]
                    break
            if not raw_headers:
                rows.append(Row(uid=uid, subject="", to="", from_="", action="skip", note="missing_headers_bytes"))
                continue

            msg = email.message_from_bytes(raw_headers)
            subj = norm(msg.get("Subject"))
            to = norm(msg.get("To"))
            from_ = norm(msg.get("From"))

            if args.dry_run:
                rows.append(Row(uid=uid, subject=subj, to=to, from_=from_, action="dry_run", note="would_move"))
                continue

            status, full_data = client.uid("FETCH", uid, "(RFC822)")
            if status != "OK" or not full_data:
                rows.append(Row(uid=uid, subject=subj, to=to, from_=from_, action="skip", note="fetch_rfc822_failed"))
                continue

            raw = None
            for chunk in full_data:
                if isinstance(chunk, tuple):
                    raw = chunk[1]
                    break
            if not raw:
                rows.append(Row(uid=uid, subject=subj, to=to, from_=from_, action="skip", note="missing_rfc822_bytes"))
                continue

            (backup_dir / f"{src_box.replace('/', '_')}-{uid}.eml").write_bytes(raw)

            copy_status, _ = client.uid("COPY", uid, trash_box)
            if copy_status != "OK":
                rows.append(Row(uid=uid, subject=subj, to=to, from_=from_, action="partial", note="copy_to_trash_failed"))
                continue

            store_status, _ = client.uid("STORE", uid, "+FLAGS.SILENT", r"(\Deleted)")
            if store_status != "OK":
                rows.append(Row(uid=uid, subject=subj, to=to, from_=from_, action="partial", note="delete_flag_failed"))
                continue

            try:
                client.expunge()
            except Exception:
                pass

            rows.append(Row(uid=uid, subject=subj, to=to, from_=from_, action="moved", note="ok"))
    finally:
        try:
            client.logout()
        except Exception:
            pass

    lines: list[str] = []
    lines.append("# IMAP: Move Messages To Trash By UID")
    lines.append(f"Date: {today}")
    lines.append("")
    lines.append(f"- Mailbox: {args.mailbox}")
    lines.append(f"- Trash: {args.trash_folder}")
    lines.append(f"- Dry run: {bool(args.dry_run)}")
    lines.append(f"- Backups: `{backup_dir.as_posix()}`")
    lines.append("")
    lines.append("| UID | From | To | Subject | Action | Note |")
    lines.append("| --- | --- | --- | --- | --- | --- |")
    for r in rows:
        from_esc = r.from_.replace("|", "\\|")
        to_esc = r.to.replace("|", "\\|")
        subj_esc = r.subject.replace("|", "\\|")
        lines.append(f"| {r.uid} | {from_esc} | {to_esc} | {subj_esc} | {r.action} | {r.note} |")
    lines.append("")

    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote: {report_path}")


if __name__ == "__main__":
    main()
