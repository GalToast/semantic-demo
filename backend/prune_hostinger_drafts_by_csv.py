#!/usr/bin/env python3
"""
Prune Hostinger drafts by comparing an original CSV pack against a keep CSV pack.

Safety:
- Dry-run by default.
- Only touches drafts whose exact (recipient, subject) pair appears in source CSV
  and does not appear in keep CSV.
- Writes .eml backups before moving anything to Trash.
"""

from __future__ import annotations

import argparse
import csv
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


def norm(value: str | None) -> str:
    return (value or "").strip()


def low(value: str | None) -> str:
    return norm(value).lower()


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


def parse_primary_recipient(to_header: str) -> str:
    hits = EMAIL_RE.findall(to_header or "")
    return low(hits[0]) if hits else ""


def load_pairs(path: Path) -> set[tuple[str, str]]:
    rows = list(csv.DictReader(path.open("r", encoding="utf-8-sig", newline="")))
    pairs: set[tuple[str, str]] = set()
    for row in rows:
        recipient = low(row.get("email"))
        subject = norm(row.get("subject"))
        if recipient and subject:
            pairs.add((recipient, subject))
    return pairs


@dataclass
class ActionRow:
    uid: str
    recipient: str
    subject: str
    action: str
    note: str


def main() -> int:
    ap = argparse.ArgumentParser(description="Prune Hostinger drafts by CSV source/keep set.")
    ap.add_argument("--source-csv", required=True, help="Original draft pack CSV.")
    ap.add_argument("--keep-csv", required=True, help="Subset CSV to keep.")
    ap.add_argument("--host", default="imap.hostinger.com")
    ap.add_argument("--port", type=int, default=993)
    ap.add_argument("--user", default="fred@mccullough.digital")
    ap.add_argument("--pass-env", default="IMAP_PASS")
    ap.add_argument("--drafts-folder", default="INBOX.Drafts")
    ap.add_argument("--trash-folder", default="INBOX.Trash")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--report", default="", help="Optional report path.")
    args = ap.parse_args()

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    source_csv = Path(args.source_csv)
    keep_csv = Path(args.keep_csv)
    source_pairs = load_pairs(source_csv)
    keep_pairs = load_pairs(keep_csv)
    prune_pairs = source_pairs - keep_pairs

    today = date.today().isoformat()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    backup_dir = TMP_DIR / f"drafts-backups-prune-{today}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    report_path = (
        Path(args.report)
        if args.report
        else REPORTS_DIR / f"hostinger-prune-drafts-by-csv-{today}.md"
    )

    rows: list[ActionRow] = []
    matched = 0

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
        if status != "OK" or not data:
            raise SystemExit("Failed to list draft UIDs.")

        uids = [u.decode(errors="ignore") for u in data[0].split() if u]
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
            recipient = parse_primary_recipient(norm(msg.get("To")))
            subject = norm(msg.get("Subject"))
            pair = (recipient, subject)
            if pair not in prune_pairs:
                continue

            matched += 1
            if not args.apply:
                rows.append(ActionRow(uid=uid, recipient=recipient, subject=subject, action="dry_run", note="would_move_to_trash"))
                continue

            status, full_data = client.uid("FETCH", uid, "(RFC822)")
            if status != "OK" or not full_data:
                rows.append(ActionRow(uid=uid, recipient=recipient, subject=subject, action="skip", note="fetch_rfc822_failed"))
                continue
            raw = None
            for chunk in full_data:
                if isinstance(chunk, tuple):
                    raw = chunk[1]
                    break
            if not raw:
                rows.append(ActionRow(uid=uid, recipient=recipient, subject=subject, action="skip", note="missing_rfc822_bytes"))
                continue

            (backup_dir / f"{uid}.eml").write_bytes(raw)

            copy_status, _ = client.uid("COPY", uid, trash_box)
            if copy_status != "OK":
                rows.append(ActionRow(uid=uid, recipient=recipient, subject=subject, action="partial", note="copy_to_trash_failed"))
                continue

            store_status, _ = client.uid("STORE", uid, "+FLAGS.SILENT", r"(\Deleted)")
            if store_status != "OK":
                rows.append(ActionRow(uid=uid, recipient=recipient, subject=subject, action="partial", note="delete_flag_failed"))
                continue

            try:
                client.expunge()
            except Exception:
                pass

            rows.append(ActionRow(uid=uid, recipient=recipient, subject=subject, action="moved", note="pruned_by_csv"))
    finally:
        try:
            client.logout()
        except Exception:
            pass

    moved = sum(1 for r in rows if r.action == "moved")
    dry = sum(1 for r in rows if r.action == "dry_run")
    skipped = sum(1 for r in rows if r.action == "skip")
    partial = sum(1 for r in rows if r.action == "partial")

    lines = [
        "# Hostinger Draft Prune By CSV",
        f"Date: {today}",
        "",
        f"- Mode: {'APPLY' if args.apply else 'DRY-RUN'}",
        f"- Source CSV: `{source_csv.as_posix()}`",
        f"- Keep CSV: `{keep_csv.as_posix()}`",
        f"- Source pairs: {len(source_pairs)}",
        f"- Keep pairs: {len(keep_pairs)}",
        f"- Target prune pairs: {len(prune_pairs)}",
        f"- Matched drafts in mailbox: {matched}",
        f"- Moved to Trash: {moved}",
        f"- Dry-run matches: {dry}",
        f"- Skipped: {skipped}",
        f"- Partial: {partial}",
    ]
    if args.apply:
        lines.append(f"- Backups: `{backup_dir.as_posix()}`")
    lines.extend(
        [
            "",
            "| UID | Recipient | Subject | Action | Note |",
            "| --- | --- | --- | --- | --- |",
        ]
    )
    for row in rows:
        lines.append(f"| {row.uid} | {row.recipient} | {row.subject} | {row.action} | {row.note} |")
    lines.append("")
    report_path.write_text("\n".join(lines), encoding="utf-8")

    print(f"report={report_path}")
    print(f"matched={matched}")
    print(f"moved={moved}")
    print(f"target_prune_pairs={len(prune_pairs)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
