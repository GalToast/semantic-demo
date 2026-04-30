from __future__ import annotations

import argparse
import imaplib
import json
import os
import re
from datetime import datetime
from pathlib import Path


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
    return parts[-1] if parts else None


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


def count_messages(client: imaplib.IMAP4_SSL, mailbox: str) -> int:
    status, _ = client.select(mailbox, readonly=True)
    if status != "OK":
        return 0
    status, data = client.search(None, "ALL")
    if status != "OK" or not data or not data[0]:
        return 0
    return len(data[0].split())


def main() -> None:
    parser = argparse.ArgumentParser(description="Snapshot live Hostinger mailbox counts into tmp JSON.")
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", required=True)
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--out-dir", default="tmp")
    args = parser.parse_args()

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    client = imaplib.IMAP4_SSL(args.host, args.port)
    client.login(args.user, password)
    try:
        status, mailboxes_raw = client.list()
        mailboxes = [name for line in (mailboxes_raw or []) if (name := parse_mailbox_name(line))]
        picks = [
            ("drafts", pick_mailbox(mailboxes, "INBOX.Drafts", ".Drafts")),
            ("sent", pick_mailbox(mailboxes, "INBOX.Sent", ".Sent")),
            ("trash", pick_mailbox(mailboxes, "INBOX.Trash", ".Trash")),
            ("inbox", pick_mailbox(mailboxes, "INBOX", "INBOX")),
        ]
        snapshot_at = datetime.now().isoformat(timespec="seconds")
        rows = []
        for logical_name, mailbox in picks:
            if not mailbox:
                continue
            rows.append(
                {
                    "logical_name": logical_name,
                    "mailbox": mailbox,
                    "count": count_messages(client, mailbox),
                }
            )
    finally:
        try:
            client.logout()
        except Exception:
            pass

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d")
    out_path = out_dir / f"hostinger_mailbox_counts_{stamp}.json"
    payload = {
        "snapshot_at": snapshot_at,
        "host": args.host,
        "user": args.user,
        "mailboxes": rows,
    }
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps(payload, indent=2))
    print(f"Wrote: {out_path}")


if __name__ == "__main__":
    main()
