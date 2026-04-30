from __future__ import annotations

import argparse
import imaplib
import os
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
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


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="Create a Hostinger draft with explicit multipart/alternative content."
    )
    ap.add_argument("--host", default="imap.hostinger.com")
    ap.add_argument("--port", type=int, default=993)
    ap.add_argument("--user", default="fred@mccullough.digital")
    ap.add_argument("--pass-env", default="IMAP_PASS")
    ap.add_argument("--drafts-folder", default="INBOX.Drafts")
    ap.add_argument("--to", required=True)
    ap.add_argument("--subject", required=True)
    ap.add_argument("--html-file", required=True, help="Path to full styled HTML body.")
    ap.add_argument("--txt-file", required=True, help="Path to plain-text fallback body.")
    ap.add_argument("--in-reply-to", default="")
    ap.add_argument("--references", default="")
    return ap.parse_args()


def main() -> int:
    args = parse_args()

    html_path = Path(args.html_file)
    txt_path = Path(args.txt_file)
    if not html_path.exists() or not txt_path.exists():
        raise SystemExit("Missing --html-file or --txt-file.")

    html_body = html_path.read_text(encoding="utf-8", errors="ignore")
    txt_body = txt_path.read_text(encoding="utf-8", errors="ignore")

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    # Root mixed for compatibility with clients that expect a full MIME message.
    msg = MIMEMultipart("mixed")
    msg["Subject"] = args.subject
    msg["To"] = args.to
    msg["From"] = args.user
    if args.in_reply_to:
        msg["In-Reply-To"] = args.in_reply_to
    if args.references:
        msg["References"] = args.references

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(txt_body, "plain", "utf-8"))
    alt.attach(MIMEText(html_body, "html", "utf-8"))
    msg.attach(alt)

    client = imaplib.IMAP4_SSL(args.host, args.port)
    try:
        client.login(args.user, password)
        status, response = client.append(
            args.drafts_folder,
            r"(\Draft)",
            imaplib.Time2Internaldate(time.time()),
            msg.as_bytes(),
        )
        if status != "OK":
            raise SystemExit(f"Failed to create draft: {status} {response}")
    finally:
        try:
            client.logout()
        except Exception:
            pass

    print("draft_created=1")
    print(f"to={args.to}")
    print(f"subject={args.subject}")
    print(f"html_file={html_path.as_posix()}")
    print(f"txt_file={txt_path.as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
