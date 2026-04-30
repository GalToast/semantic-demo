from __future__ import annotations

import argparse
import os
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path
from typing import Iterable


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
    ap = argparse.ArgumentParser(description="Send guarded multipart test email (text/plain + text/html).")
    ap.add_argument("--from-email", default="fred@mccullough.digital")
    ap.add_argument("--to", nargs="+", required=True, help="One or more recipient addresses.")
    ap.add_argument("--subject", required=True)
    ap.add_argument("--html-file", required=True)
    ap.add_argument("--txt-file", required=True)
    ap.add_argument("--smtp-host", default="smtp.hostinger.com")
    ap.add_argument("--smtp-port", type=int, default=465)
    ap.add_argument("--pass-env", default="IMAP_PASS")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--yes-send", action="store_true")
    return ap.parse_args()


def preflight(html: str, txt: str) -> list[str]:
    issues: list[str] = []
    for token in ("{{", "}}"):
        if token in html or token in txt:
            issues.append("unreplaced-template-token")
            break

    required = [
        'Advertisement: This is a business outreach email from McCullough Digital.',
        "Mailing address: 15342 Holly Lane",
        'reply with "opt out"',
        "(832) 422-8441",
    ]
    for req in required:
        if req not in html:
            issues.append(f"html-missing:{req[:32]}")
        if req not in txt:
            issues.append(f"txt-missing:{req[:32]}")
    if "<html" not in html.lower():
        issues.append("html-file-does-not-look-like-html")
    if len(txt.strip()) < 80:
        issues.append("plain-text-too-short")
    return issues


def build_message(from_email: str, to_email: str, subject: str, txt: str, html: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = from_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(txt)
    msg.add_alternative(html, subtype="html")
    return msg


def send_messages(
    from_email: str,
    to_list: Iterable[str],
    subject: str,
    txt: str,
    html: str,
    smtp_host: str,
    smtp_port: int,
    password: str,
) -> list[tuple[str, str]]:
    results: list[tuple[str, str]] = []
    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30, context=ctx) as client:
        client.login(from_email, password)
        for to_email in to_list:
            try:
                msg = build_message(from_email, to_email, subject, txt, html)
                client.send_message(msg)
                results.append((to_email, "sent"))
            except Exception as e:  # pragma: no cover
                results.append((to_email, f"error:{type(e).__name__}"))
    return results


def main() -> int:
    args = parse_args()
    if not args.dry_run and not args.yes_send:
        raise SystemExit("Refusing to send without --yes-send (or use --dry-run).")

    html_path = Path(args.html_file)
    txt_path = Path(args.txt_file)
    if not html_path.exists() or not txt_path.exists():
        raise SystemExit("Missing html/txt input file.")

    html = html_path.read_text(encoding="utf-8", errors="ignore")
    txt = txt_path.read_text(encoding="utf-8", errors="ignore")

    issues = preflight(html, txt)
    print(f"preflight_issues={len(issues)}")
    for issue in issues:
        print(f"- {issue}")
    if issues:
        raise SystemExit("Preflight failed; refusing to send.")

    to_list = [x.strip() for x in args.to if x.strip()]
    print(f"from={args.from_email}")
    print(f"to_count={len(to_list)}")
    print(f"subject={args.subject}")
    print(f"html_file={html_path.as_posix()}")
    print(f"txt_file={txt_path.as_posix()}")
    if args.dry_run:
        print("dry_run=yes (no messages sent)")
        return 0

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    results = send_messages(
        from_email=args.from_email,
        to_list=to_list,
        subject=args.subject,
        txt=txt,
        html=html,
        smtp_host=args.smtp_host,
        smtp_port=args.smtp_port,
        password=password,
    )
    for to_email, status in results:
        print(f"{to_email}: {status}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
