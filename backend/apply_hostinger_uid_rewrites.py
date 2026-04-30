from __future__ import annotations

import argparse
import email
import imaplib
import os
import re
from dataclasses import dataclass
from datetime import date
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate
from pathlib import Path


TMP_DIR = Path("tmp")
REPORTS_DIR = Path("reports")

FOOTER_PLAIN = (
    'Advertisement: This is a business outreach email from McCullough Digital.\n'
    'Phone: (832) 422-8441\n'
    'Mailing address: 15342 Holly Lane, Willis, TX 77318\n'
    'To stop receiving these emails, reply with "opt out" in the subject line.'
)

FOOTER_HTML = (
    '<p style="margin:18px 0 0 0;font-family:\'Segoe UI\',Arial,sans-serif;'
    'color:#68758a;font-size:12px;line-height:1.65;border-top:1px solid #eceff3;'
    'padding-top:18px;">'
    'Advertisement: This is a business outreach email from McCullough Digital.<br>'
    'Phone: (832) 422-8441<br>'
    'Mailing address: 15342 Holly Lane, Willis, TX 77318<br>'
    'To stop receiving these emails, reply with "opt out" in the subject line.'
    '</p>'
)

SIGNATURE_PLAIN = (
    "Best,\n"
    "Fred McCullough\n"
    "McCullough Digital\n"
    "(832) 422-8441"
)

SIGNATURE_HTML = (
    "<p style=\"margin:22px 0 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;"
    "line-height:1.6;color:#31425b;\">Fred McCullough<br>"
    "<a href=\"https://mccullough.digital\" style=\"color:#1254a1;text-decoration:underline;\">"
    "McCullough Digital</a><br>"
    "<a href=\"tel:8324228441\" style=\"color:#1254a1;text-decoration:underline;\">(832) 422-8441</a>"
    "</p>"
)


@dataclass
class Rewrite:
    uid: str
    to: str
    subject: str
    body: str


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


def parse_rewrites(path: Path) -> list[Rewrite]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    blocks = [b.strip() for b in re.split(r"(?m)^##\s+UID\s+", text) if b.strip()]
    rewrites: list[Rewrite] = []
    for block in blocks:
        lines = block.splitlines()
        uid = lines[0].strip()
        to = ""
        subject = ""
        body_lines: list[str] = []
        in_body = False
        for line in lines[1:]:
            if line.startswith("To:"):
                to = line.split(":", 1)[1].strip()
                continue
            if line.startswith("Subject:"):
                subject = line.split(":", 1)[1].strip()
                continue
            if line.strip() == "Body:":
                in_body = True
                continue
            if in_body:
                body_lines.append(line)
        body = "\n".join(body_lines).strip()
        if uid and to and subject and body:
            rewrites.append(Rewrite(uid=uid, to=to, subject=subject, body=body))
    if not rewrites:
        raise SystemExit(f"No rewrites parsed from {path}")
    return rewrites


def esc(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def htmlize_body(body: str) -> str:
    return "<br>\n".join(esc(line) for line in body.splitlines())


def make_message(from_addr: str, to_addr: str, subject: str, body: str) -> bytes:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["To"] = to_addr
    msg["From"] = from_addr
    msg["Date"] = formatdate(localtime=True)

    plain_full = f"{body.strip()}\n\n{SIGNATURE_PLAIN}\n\n--\n{FOOTER_PLAIN}"
    html_full = (
        "<!doctype html><html><body style=\"margin:0;padding:0;background:#ffffff;\">"
        "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" "
        "style=\"border-collapse:collapse;background:#ffffff;\"><tr><td align=\"center\" "
        "style=\"padding:24px 12px;\"><table role=\"presentation\" width=\"620\" cellpadding=\"0\" "
        "cellspacing=\"0\" border=\"0\" style=\"border-collapse:collapse;width:100%;max-width:620px;"
        "background:#ffffff;\"><tr><td style=\"padding:0;font-family:'Segoe UI',Arial,sans-serif;"
        "color:#1f2937;font-size:16px;line-height:1.72;\">"
        f"<p style=\"margin:0 0 16px 0;\">{htmlize_body(body.strip())}</p>"
        f"{SIGNATURE_HTML}</td></tr><tr><td>"
        f"{FOOTER_HTML}</td></tr></table></td></tr></table></body></html>"
    )

    msg.attach(MIMEText(plain_full, "plain", "utf-8"))
    msg.attach(MIMEText(html_full, "html", "utf-8"))
    return msg.as_bytes()


def fetch_raw_by_uid(client: imaplib.IMAP4_SSL, uid: str) -> bytes:
    status, msg_data = client.uid("fetch", uid, "(RFC822)")
    if status != "OK" or not msg_data:
        raise RuntimeError(f"fetch_failed:{uid}")
    for chunk in msg_data:
        if isinstance(chunk, tuple) and chunk[1]:
            return chunk[1]
    raise RuntimeError(f"missing_bytes:{uid}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Rewrite existing Hostinger drafts by UID via IMAP.")
    ap.add_argument("--host", default="imap.hostinger.com")
    ap.add_argument("--port", type=int, default=993)
    ap.add_argument("--user", default="fred@mccullough.digital")
    ap.add_argument("--pass-env", default="IMAP_PASS")
    ap.add_argument("--drafts-folder", default="INBOX.Drafts")
    ap.add_argument("--trash-folder", default="INBOX.Trash")
    ap.add_argument("--rewrites", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    rewrites = parse_rewrites(Path(args.rewrites))
    today = date.today().isoformat()
    backup_dir = TMP_DIR / f"hostinger-uid-rewrite-backups-{today}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"hostinger-uid-rewrites-{today}.md"

    rows: list[tuple[str, str, str, str, str]] = []
    client = imaplib.IMAP4_SSL(args.host, args.port)
    try:
        client.login(args.user, password)
        status, _ = client.select(args.drafts_folder)
        if status != "OK":
            raise SystemExit(f"Failed to select mailbox: {args.drafts_folder}")

        for rw in rewrites:
            try:
                raw = fetch_raw_by_uid(client, rw.uid)
                old_msg = email.message_from_bytes(raw)
                old_to = old_msg.get("To", "")
                if old_to.strip().lower() != rw.to.strip().lower():
                    rows.append((rw.uid, old_to, rw.subject, "skip", "to_mismatch"))
                    continue
                (backup_dir / f"{rw.uid}-old.eml").write_bytes(raw)
                new_raw = make_message(args.user, rw.to, rw.subject, rw.body)
                (backup_dir / f"{rw.uid}-new.eml").write_bytes(new_raw)
                if args.dry_run:
                    rows.append((rw.uid, rw.to, rw.subject, "dry_run", "would_rewrite"))
                    continue
                append_status, _ = client.append(args.drafts_folder, None, None, new_raw)
                if append_status != "OK":
                    rows.append((rw.uid, rw.to, rw.subject, "error", "append_failed"))
                    continue
                copy_status, _ = client.uid("COPY", rw.uid, args.trash_folder)
                if copy_status != "OK":
                    rows.append((rw.uid, rw.to, rw.subject, "partial", "copied_failed_no_delete"))
                    continue
                store_status, _ = client.uid("STORE", rw.uid, "+FLAGS.SILENT", r"(\Deleted)")
                if store_status != "OK":
                    rows.append((rw.uid, rw.to, rw.subject, "partial", "delete_flag_failed"))
                    continue
                client.expunge()
                rows.append((rw.uid, rw.to, rw.subject, "rewritten", "ok"))
            except Exception as exc:
                rows.append((rw.uid, rw.to, rw.subject, "error", str(exc)[:180]))
    finally:
        try:
            client.logout()
        except Exception:
            pass

    lines = [
        "# Hostinger UID Rewrites",
        f"Date: {today}",
        "",
        f"- Rewrites file: `{args.rewrites}`",
        f"- Mailbox: `{args.drafts_folder}`",
        f"- Trash: `{args.trash_folder}`",
        f"- Dry run: `{args.dry_run}`",
        f"- Backups: `{backup_dir}`",
        "",
        "| UID | To | Subject | Action | Note |",
        "| --- | --- | --- | --- | --- |",
    ]
    for uid, to, subject, action, note in rows:
        lines.append(f"| {uid} | {to} | {subject} | {action} | {note} |")
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote: {report_path}")


if __name__ == "__main__":
    main()
