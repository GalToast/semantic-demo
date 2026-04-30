from __future__ import annotations

import argparse
import email
import imaplib
import json
import os
import re
from dataclasses import dataclass
from datetime import date
from email.message import Message
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape
from pathlib import Path


REPO_ROOT = Path(".")
TMP_DIR = REPO_ROOT / "tmp"
REPORTS_DIR = REPO_ROOT / "reports"


SELF_EMAILS = {
    "fred@mccullough.digital",
    "hello@mccullough.digital",
}


EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")

# Basic check: do we already have the correct anchor in the HTML?
SIG_HREF_RE = re.compile(r'href\s*=\s*["\']https?://mccullough\.digital/?["\']', re.I)


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


def low(s: str | None) -> str:
    return norm(s).lower()


def latest_tmp_json(prefix: str) -> Path:
    files = sorted(TMP_DIR.glob(f"{prefix}_*.json"))
    if not files:
        raise SystemExit(f"Missing tmp/{prefix}_*.json")
    return max(files, key=lambda p: p.stat().st_mtime)


def parse_recipients(to_header: str) -> set[str]:
    return {e.lower() for e in EMAIL_RE.findall(to_header or "")}


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


def is_html_part(part: Message) -> bool:
    return low(part.get_content_type()) == "text/html"


def is_plain_part(part: Message) -> bool:
    return low(part.get_content_type()) == "text/plain"


def decode_part_payload(part: Message) -> tuple[str, str]:
    """
    Returns (text, charset_used)
    """
    payload = part.get_payload(decode=True)
    if payload is None:
        return "", (part.get_content_charset() or "utf-8")
    charset = part.get_content_charset() or "utf-8"
    try:
        return payload.decode(charset, errors="replace"), charset
    except Exception:
        return payload.decode("utf-8", errors="replace"), "utf-8"


def set_part_payload(part: Message, text: str, charset: str) -> None:
    part.set_payload(text.encode(charset, errors="replace"))
    part.set_charset(charset)


def patch_signature_in_html(html: str) -> tuple[str, bool, str]:
    """
    Return (new_html, changed, note).
    Strategy:
    - If an anchor to mccullough.digital already exists, no change.
    - Else, replace the last occurrence of 'McCullough Digital' with an anchor.
    - Else, append an anchor just before closing </body> or at end.
    """
    if not html:
        return html, False, "no_html"
    if SIG_HREF_RE.search(html):
        return html, False, "already_linked"

    anchor = '<a href="https://mccullough.digital">McCullough Digital</a>'

    if "McCullough Digital" in html:
        idx = html.rfind("McCullough Digital")
        new_html = html[:idx] + anchor + html[idx + len("McCullough Digital") :]
        return new_html, True, "replaced_last_occurrence"

    # Fallback: if only the domain appears as text, wrap that.
    if "mccullough.digital" in html.lower():
        # Replace last occurrence of the domain string.
        m = re.finditer(r"mccullough\.digital", html, flags=re.I)
        hits = list(m)
        if hits:
            h = hits[-1]
            idx = h.start()
            new_html = html[:idx] + '<a href="https://mccullough.digital">mccullough.digital</a>' + html[h.end() :]
            return new_html, True, "wrapped_domain_text"

    # Last fallback: append before </body> if present.
    lower_html = html.lower()
    body_close = lower_html.rfind("</body>")
    if body_close != -1:
        new_html = html[:body_close] + "<br>" + anchor + html[body_close:]
        return new_html, True, "appended_before_body_close"

    return html + "\n<br>" + anchor, True, "appended_at_end"


def plain_text_to_basic_html(text: str) -> str:
    escaped = escape(text or "")
    escaped = escaped.replace("\r\n", "\n").replace("\r", "\n")
    escaped = escaped.replace("\n", "<br>\n")
    return f"<html><body>{escaped}</body></html>"


def build_multipart_from_plain(msg: Message, plain_text: str) -> tuple[Message, bool, str]:
    html = plain_text_to_basic_html(plain_text)
    html, changed, note = patch_signature_in_html(html)
    if not changed:
        return msg, False, "plain_to_html_" + note

    new_msg = MIMEMultipart("alternative")
    for key, value in msg.items():
        if low(key) in {
            "content-type",
            "mime-version",
            "content-transfer-encoding",
            "content-disposition",
        }:
            continue
        new_msg[key] = value

    new_msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    new_msg.attach(MIMEText(html, "html", "utf-8"))
    return new_msg, True, "plain_to_html_" + note


@dataclass
class FixResult:
    uid: str
    to: str
    subject: str
    action: str
    note: str


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fix Hostinger Drafts missing signature hyperlink by recreating drafts via IMAP (APPEND + move original to Trash)."
    )
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", required=True)
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--drafts-folder", default="INBOX.Drafts")
    parser.add_argument("--trash-folder", default="INBOX.Trash")
    parser.add_argument(
        "--qa-json",
        default=None,
        help="Path to tmp/hostinger_drafts_qa_YYYY-MM-DD.json (default: latest). Uses signature_link_missing to pick targets.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Compute what would change, but do not write anything.")
    parser.add_argument("--backup-dir", default=None, help="Directory to write original .eml backups (default: tmp/drafts-backups-YYYY-MM-DD).")
    args = parser.parse_args()

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    qa_path = Path(args.qa_json) if args.qa_json else latest_tmp_json("hostinger_drafts_qa")
    qa = json.loads(qa_path.read_text(encoding="utf-8", errors="ignore"))

    targets: list[str] = []
    for d in qa.get("drafts", []) or []:
        if d.get("skip"):
            continue
        issues = d.get("issues") or []
        if "signature_link_missing" in issues:
            uid = norm(d.get("uid"))
            if uid:
                targets.append(uid)
    targets = sorted(set(targets), key=lambda x: int(x) if x.isdigit() else x)

    today = date.today().isoformat()
    backup_dir = Path(args.backup_dir) if args.backup_dir else (TMP_DIR / f"drafts-backups-{today}")
    backup_dir.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"hostinger-fix-draft-signatures-{today}.md"

    results: list[FixResult] = []

    if not targets:
        report_path.write_text(
            f"# Fix Draft Signature Links\nDate: {today}\n\n- QA source: `{qa_path.as_posix()}`\n- Targets: 0\n\nNothing to do.\n",
            encoding="utf-8",
        )
        print(f"Wrote: {report_path}")
        return

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

        for uid in targets:
            status, msg_data = client.uid("fetch", uid, "(RFC822)")
            if status != "OK" or not msg_data:
                results.append(FixResult(uid=uid, to="", subject="", action="skip", note="fetch_failed"))
                continue

            raw = None
            for chunk in msg_data:
                if isinstance(chunk, tuple):
                    raw = chunk[1]
                    break
            if not raw:
                results.append(FixResult(uid=uid, to="", subject="", action="skip", note="missing_bytes"))
                continue

            msg = email.message_from_bytes(raw)
            to_header = norm(msg.get("To"))
            subject = norm(msg.get("Subject"))
            recipients = parse_recipients(to_header)
            if recipients and recipients.issubset(SELF_EMAILS):
                results.append(FixResult(uid=uid, to=to_header, subject=subject, action="skip", note="self_recipients_only"))
                continue

            # Locate an HTML part to patch.
            html_part: Message | None = None
            plain_part: Message | None = None
            if msg.is_multipart():
                for part in msg.walk():
                    disp = low(part.get("Content-Disposition"))
                    if disp.startswith("attachment"):
                        continue
                    if html_part is None and is_html_part(part):
                        html_part = part
                    if plain_part is None and is_plain_part(part):
                        plain_part = part
            else:
                # Single-part: we can only patch if it's HTML.
                if is_html_part(msg):
                    html_part = msg
                elif is_plain_part(msg):
                    plain_part = msg

            if html_part is None:
                if plain_part is None:
                    results.append(FixResult(uid=uid, to=to_header, subject=subject, action="skip", note="no_html_part"))
                    continue

                plain_text, _plain_charset = decode_part_payload(plain_part)
                if "mccullough.digital" not in low(plain_text):
                    plain_text = (plain_text.rstrip() + "\n" + "mccullough.digital").lstrip()

                replacement_msg, changed, note = build_multipart_from_plain(msg, plain_text)
                if not changed:
                    results.append(FixResult(uid=uid, to=to_header, subject=subject, action="skip", note=note))
                    continue

                if args.dry_run:
                    results.append(FixResult(uid=uid, to=to_header, subject=subject, action="dry_run", note=note))
                    continue

                (backup_dir / f"{uid}.eml").write_bytes(raw)

                append_status, _append_data = client.append(drafts_box, None, None, replacement_msg.as_bytes())
                if append_status != "OK":
                    results.append(FixResult(uid=uid, to=to_header, subject=subject, action="error", note="append_failed"))
                    continue

                copy_status, _copy_data = client.uid("COPY", uid, trash_box)
                if copy_status != "OK":
                    results.append(FixResult(uid=uid, to=to_header, subject=subject, action="partial", note="copied_failed_no_delete"))
                    continue
                store_status, _store_data = client.uid("STORE", uid, "+FLAGS.SILENT", r"(\Deleted)")
                if store_status != "OK":
                    results.append(FixResult(uid=uid, to=to_header, subject=subject, action="partial", note="delete_flag_failed"))
                    continue
                try:
                    client.expunge()
                except Exception:
                    pass

                results.append(FixResult(uid=uid, to=to_header, subject=subject, action="fixed", note=note))
                continue

            html_text, html_charset = decode_part_payload(html_part)
            new_html, changed, note = patch_signature_in_html(html_text)
            if not changed:
                results.append(FixResult(uid=uid, to=to_header, subject=subject, action="skip", note=note))
                continue

            # Optional: ensure plain-text includes the domain even if it's not clickable.
            if plain_part is not None:
                plain_text, plain_charset = decode_part_payload(plain_part)
                if "mccullough.digital" not in low(plain_text):
                    plain_text = (plain_text.rstrip() + "\n" + "mccullough.digital").lstrip()
                    set_part_payload(plain_part, plain_text, plain_charset)

            set_part_payload(html_part, new_html, html_charset)

            if args.dry_run:
                results.append(FixResult(uid=uid, to=to_header, subject=subject, action="dry_run", note=note))
                continue

            # Backup original for rollback.
            (backup_dir / f"{uid}.eml").write_bytes(raw)

            # Append patched copy as a new draft.
            append_status, _append_data = client.append(drafts_box, None, None, msg.as_bytes())
            if append_status != "OK":
                results.append(FixResult(uid=uid, to=to_header, subject=subject, action="error", note="append_failed"))
                continue

            # Move original to Trash, then delete from Drafts (avoid double-send).
            copy_status, _copy_data = client.uid("COPY", uid, trash_box)
            if copy_status != "OK":
                results.append(FixResult(uid=uid, to=to_header, subject=subject, action="partial", note="copied_failed_no_delete"))
                continue
            store_status, _store_data = client.uid("STORE", uid, "+FLAGS.SILENT", r"(\Deleted)")
            if store_status != "OK":
                results.append(FixResult(uid=uid, to=to_header, subject=subject, action="partial", note="delete_flag_failed"))
                continue
            try:
                client.expunge()
            except Exception:
                # Expunge failures are usually non-fatal; the message is still flagged \Deleted.
                pass

            results.append(FixResult(uid=uid, to=to_header, subject=subject, action="fixed", note=note))
    finally:
        try:
            client.logout()
        except Exception:
            pass

    fixed = sum(1 for r in results if r.action == "fixed")
    skipped = sum(1 for r in results if r.action in {"skip", "dry_run"})
    errors = sum(1 for r in results if r.action in {"error", "partial"})

    lines: list[str] = []
    lines.append("# Fix Draft Signature Links")
    lines.append(f"Date: {today}")
    lines.append("")
    lines.append(f"- QA source: `{qa_path.as_posix()}`")
    lines.append(f"- Drafts mailbox: `{args.drafts_folder}`")
    lines.append(f"- Trash mailbox: `{args.trash_folder}`")
    lines.append(f"- Dry run: `{args.dry_run}`")
    if not args.dry_run:
        lines.append(f"- Backups: `{backup_dir.as_posix()}`")
    lines.append("")
    lines.append(f"- Targets: {len(targets)}")
    lines.append(f"- Fixed: {fixed}")
    lines.append(f"- Skipped: {skipped}")
    lines.append(f"- Errors/Partial: {errors}")
    lines.append("")
    lines.append("| UID | To | Subject | Action | Note |")
    lines.append("| --- | --- | --- | --- | --- |")
    for r in results:
        lines.append(f"| {r.uid} | {r.to} | {r.subject} | {r.action} | {r.note} |")
    lines.append("")
    report_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote: {report_path}")


if __name__ == "__main__":
    main()
