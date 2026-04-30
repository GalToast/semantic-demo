import argparse
import imaplib
import mimetypes
import os
import time
from pathlib import Path
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from email.utils import formatdate


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


def main():
    parser = argparse.ArgumentParser(description="Create a professional draft in Hostinger Mail via IMAP.")
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", default="fred@mccullough.digital")
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--drafts-folder", default="INBOX.Drafts")
    parser.add_argument("--to", required=True)
    parser.add_argument("--subject", required=True)
    parser.add_argument("--body", help="Draft body (plain text).")
    parser.add_argument("--body-file", help="Path to a UTF-8 text file to use as the draft body.")
    parser.add_argument("--attach", action="append", default=[], help="Path to a file attachment. Pass multiple times for multiple files.")
    parser.add_argument("--no-sig", action="store_true", help="Omit the signature")
    parser.add_argument("--in-reply-to", help="Message-ID of the email being replied to.")
    parser.add_argument("--references", help="References header for threading.")
    args = parser.parse_args()
    if not args.body and not args.body_file:
        parser.error("One of --body or --body-file is required.")

    password = os.getenv(args.pass_env)
    if not password:
        password = get_windows_user_env(args.pass_env)
    if not password:
        print(f"Error: Missing password in env var: {args.pass_env}.")
        return

    # Construct a mixed message so attachments can be added when present.
    msg = MIMEMultipart("mixed")
    msg['Subject'] = args.subject
    msg['To'] = args.to
    msg['From'] = args.user
    msg['Date'] = formatdate(localtime=True)
    if args.in_reply_to:
        msg['In-Reply-To'] = args.in_reply_to
    if args.references:
        msg['References'] = args.references

    # Prepare Body with Signature
    if args.body_file:
        plain_body = Path(args.body_file).read_text(encoding="utf-8", errors="ignore")
    else:
        plain_body = args.body or ""
    if not args.no_sig:
        plain_body += "\n\nBest,\n\nFred McCullough\nMcCullough Digital"

    # HTML Body (Hostinger Mail renders HTML drafts better)
    html_body = plain_body.replace("\n", "<br>")
    # Add link to signature if present
    html_body = html_body.replace(
        "McCullough Digital", 
        '<a href="https://mccullough.digital">McCullough Digital</a>'
    )

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(plain_body, "plain"))
    alt.attach(MIMEText(f"<html><body>{html_body}</body></html>", "html"))
    msg.attach(alt)

    # Optional attachments
    for attachment_path in args.attach:
        p = Path(attachment_path).expanduser()
        if not p.exists() or not p.is_file():
            print(f"Error: attachment not found: {p}")
            return
        ctype, _ = mimetypes.guess_type(str(p))
        if ctype:
            maintype, subtype = ctype.split("/", 1)
        else:
            maintype, subtype = "application", "octet-stream"

        with p.open("rb") as f:
            part = MIMEBase(maintype, subtype)
            part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{p.name}"')
        msg.attach(part)

    try:
        client = imaplib.IMAP4_SSL(args.host, args.port)
        client.login(args.user, password)
        
        status, response = client.append(
            args.drafts_folder, 
            r'(\Draft)', 
            imaplib.Time2Internaldate(time.time()), 
            msg.as_bytes()
        )
        
        if status == "OK":
            if args.attach:
                print(f"Professional draft successfully created for {args.to} with {len(args.attach)} attachment(s)")
            else:
                print(f"Professional draft successfully created for {args.to}")
        else:
            print(f"Failed to create draft: {status} {response}")
            
        client.logout()
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
