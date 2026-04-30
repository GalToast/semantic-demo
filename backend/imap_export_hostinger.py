import argparse
import email
import imaplib
import json
import os
import re
from datetime import date
from pathlib import Path

EMAIL_RE = re.compile(r'([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})')


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
    # Expected format: (FLAGS) "DELIM" MAILBOX
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


def fetch_items(client: imaplib.IMAP4_SSL, mailbox: str, limit: int | None) -> list[dict]:
    status, _ = client.select(mailbox, readonly=True)
    if status != "OK":
        return []
    status, data = client.search(None, "ALL")
    if status != "OK" or not data or not data[0]:
        return []
    ids = data[0].split()
    if limit:
        ids = ids[-limit:]
    items = []
    for msg_id in reversed(ids):
        status, msg_data = client.fetch(msg_id, "(BODY.PEEK[HEADER.FIELDS (TO FROM SUBJECT DATE)])")
        if status != "OK" or not msg_data:
            continue
        raw = None
        for chunk in msg_data:
            if isinstance(chunk, tuple):
                raw = chunk[1]
                break
        if not raw:
            continue
        message = email.message_from_bytes(raw)
        to = message.get("To", "").strip()
        from_ = message.get("From", "").strip()
        subject = message.get("Subject", "").strip()
        msg_date = message.get("Date", "").strip()
        text = " ".join(part for part in [to, subject, msg_date] if part).strip()
        items.append(
            {
                "id": msg_id.decode(errors="ignore"),
                "to": to,
                "from": from_,
                "subject": subject,
                "date": msg_date,
                "text": text,
            }
        )
    return items


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Hostinger IMAP Drafts/Sent indexes.")
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", required=True)
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--drafts-folder", default="INBOX.Drafts")
    parser.add_argument("--sent-folder", default="INBOX.Sent")
    parser.add_argument("--out-dir", default="tmp")
    parser.add_argument("--limit", type=int, default=None, help="Optional limit per folder (newest only).")
    args = parser.parse_args()

    password = os.getenv(args.pass_env)
    if not password:
        password = get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    client = imaplib.IMAP4_SSL(args.host, args.port)
    try:
        client.login(args.user, password)
        status, mailboxes_raw = client.list()
        mailboxes = []
        if status == "OK" and mailboxes_raw:
            for line in mailboxes_raw:
                name = parse_mailbox_name(line)
                if name:
                    mailboxes.append(name)

        drafts_box = pick_mailbox(mailboxes, args.drafts_folder, ".Drafts")
        sent_box = pick_mailbox(mailboxes, args.sent_folder, ".Sent")

        drafts_items = fetch_items(client, drafts_box, args.limit) if drafts_box else []
        sent_items = fetch_items(client, sent_box, args.limit) if sent_box else []

        today = date.today().isoformat()
        out_dir = Path(args.out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        drafts_index = {
            "date": today,
            "source": "imap",
            "host": args.host,
            "user": args.user,
            "pages": [
                {
                    "url": f"imap://{args.host}/{drafts_box or args.drafts_folder}",
                    "count": len(drafts_items),
                    "items": drafts_items,
                }
            ],
        }
        sent_index = {
            "date": today,
            "source": "imap",
            "host": args.host,
            "user": args.user,
            "pages": [
                {
                    "url": f"imap://{args.host}/{sent_box or args.sent_folder}",
                    "count": len(sent_items),
                    "items": sent_items,
                }
            ],
        }

        drafts_path = out_dir / f"hostinger_drafts_index_{today}.json"
        sent_path = out_dir / f"hostinger_sent_index_{today}.json"
        drafts_path.write_text(json.dumps(drafts_index, indent=2), encoding="utf-8")
        sent_path.write_text(json.dumps(sent_index, indent=2), encoding="utf-8")

        print(f"Drafts mailbox: {drafts_box or args.drafts_folder}")
        print(f"Sent mailbox: {sent_box or args.sent_folder}")
        print(f"Drafts items: {len(drafts_items)}")
        print(f"Sent items: {len(sent_items)}")
        print(f"Wrote: {drafts_path}")
        print(f"Wrote: {sent_path}")
    finally:
        try:
            client.logout()
        except Exception:
            pass


if __name__ == "__main__":
    main()
