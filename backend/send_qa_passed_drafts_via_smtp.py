from __future__ import annotations

import argparse
import email
import imaplib
import json
import os
import re
import smtplib
import ssl
from dataclasses import dataclass
from datetime import date
from email.message import Message
from pathlib import Path
from time import sleep

from suppression import get_suppression_reason, load_suppression_map

REPO_ROOT = Path(".")
TMP_DIR = REPO_ROOT / "tmp"
REPORTS_DIR = REPO_ROOT / "reports"

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")

SELF_EMAILS = {
    "fred@mccullough.digital",
    "hello@mccullough.digital",
}


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


def latest_tmp_json(prefix: str) -> Path:
    files = sorted(TMP_DIR.glob(f"{prefix}_*.json"))
    if not files:
        raise SystemExit(f"Missing tmp/{prefix}_*.json")
    return max(files, key=lambda p: p.stat().st_mtime)


def norm(s: str | None) -> str:
    return (s or "").strip()


def low(s: str | None) -> str:
    return norm(s).lower()


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


def recipients_from_to_header(to_header: str) -> set[str]:
    return {e.lower() for e in EMAIL_RE.findall(to_header or "")}


@dataclass
class DraftTarget:
    uid: str
    to: str
    subject: str
    mapped: bool
    profile: str
    claim_tags: list[str]


@dataclass
class SendResult:
    uid: str
    to: str
    subject: str
    action: str
    note: str


def send_via_smtp(msg: Message, host: str, port: int, user: str, password: str, timeout_s: int) -> None:
    """
    Send using SMTP.
    - Port 465: implicit TLS
    - Else: STARTTLS
    """
    if port == 465:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, timeout=timeout_s, context=ctx) as client:
            client.login(user, password)
            client.send_message(msg)
        return

    with smtplib.SMTP(host, port, timeout=timeout_s) as client:
        client.ehlo()
        client.starttls(context=ssl.create_default_context())
        client.ehlo()
        client.login(user, password)
    client.send_message(msg)


def smtp_login_test(host: str, port: int, user: str, password: str, timeout_s: int) -> None:
    """
    Connect and authenticate only. No sending.
    """
    if port == 465:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, timeout=timeout_s, context=ctx) as client:
            client.login(user, password)
        return

    with smtplib.SMTP(host, port, timeout=timeout_s) as client:
        client.ehlo()
        client.starttls(context=ssl.create_default_context())
        client.ehlo()
        client.login(user, password)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Send QA-passed Hostinger Drafts via SMTP, then append to Sent and move originals to Trash via IMAP."
    )
    parser.add_argument("--imap-host", default="imap.hostinger.com")
    parser.add_argument("--imap-port", type=int, default=993)
    parser.add_argument("--imap-user", required=True)
    parser.add_argument("--pass-env", default="IMAP_PASS", help="Env var name for IMAP password (HKCU fallback on Windows).")
    parser.add_argument(
        "--smtp-pass-env",
        default=None,
        help="Optional env var name for SMTP password (defaults to --pass-env). Useful if you keep SMTP creds separate.",
    )
    parser.add_argument("--drafts-folder", default="INBOX.Drafts")
    parser.add_argument("--sent-folder", default="INBOX.Sent")
    parser.add_argument("--trash-folder", default="INBOX.Trash")
    parser.add_argument("--qa-json", default=None, help="Path to tmp/hostinger_drafts_qa_YYYY-MM-DD.json (default: latest).")

    parser.add_argument("--smtp-host", default="smtp.hostinger.com")
    parser.add_argument("--smtp-port", type=int, default=465)
    parser.add_argument("--smtp-user", default=None, help="Defaults to --imap-user")
    parser.add_argument("--smtp-timeout", type=int, default=30)
    parser.add_argument("--smtp-test", action="store_true", help="Only test SMTP login (no send).")

    parser.add_argument("--include-unmapped", action="store_true", help="Send drafts even when not mapped to leads/index.csv.")
    parser.add_argument(
        "--include-unmapped-claims",
        action="store_true",
        help="Allow sending unmapped drafts even if QA detected claim tags (more risk).",
    )
    parser.add_argument("--limit", type=int, default=None, help="Optional max number of drafts to send (newest-first order from QA JSON).")
    parser.add_argument("--sleep-seconds", type=float, default=2.0)

    parser.add_argument("--dry-run", action="store_true", help="Print what would be sent; do not send.")
    parser.add_argument("--yes-send", action="store_true", help="Actually send emails (required unless --dry-run).")
    args = parser.parse_args()

    if args.smtp_test:
        # Explicitly allow SMTP login checks without --yes-send.
        args.dry_run = True

    if not args.dry_run and not args.yes_send:
        raise SystemExit("Refusing to send without --yes-send (or use --dry-run).")

    imap_password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not imap_password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    smtp_pass_env = args.smtp_pass_env or args.pass_env
    smtp_password = os.getenv(smtp_pass_env) or get_windows_user_env(smtp_pass_env)
    if not smtp_password:
        raise SystemExit(f"Missing password in env var: {smtp_pass_env}")

    smtp_user = args.smtp_user or args.imap_user

    qa_path = Path(args.qa_json) if args.qa_json else latest_tmp_json("hostinger_drafts_qa")
    qa = json.loads(qa_path.read_text(encoding="utf-8", errors="ignore"))
    suppression_map = load_suppression_map()

    # Target selection: send drafts that passed QA (issues empty), skip internal/self drafts.
    targets: list[DraftTarget] = []
    suppressed_targets: list[tuple[str, str, str, str]] = []
    for d in qa.get("drafts", []) or []:
        if d.get("skip"):
            continue
        issues = d.get("issues") or []
        if issues:
            continue
        uid = norm(d.get("uid"))
        to_header = norm(d.get("to"))
        subject = norm(d.get("subject"))
        recipients = recipients_from_to_header(to_header)
        if recipients and recipients.issubset(SELF_EMAILS):
            continue
        suppressed_matches = []
        for recipient in sorted(recipients):
            suppress_reason = get_suppression_reason(recipient, suppression_map)
            if suppress_reason:
                suppressed_matches.append(f"{recipient} ({suppress_reason})")
        if suppressed_matches:
            suppressed_targets.append((uid, to_header, subject, "; ".join(suppressed_matches)))
            continue

        mapped = bool((d.get("mapped_leads") or []) or (d.get("chosen_lead") or None))
        chosen = d.get("chosen_lead") or {}
        profile = norm(chosen.get("profile"))
        claim_tags = [norm(x) for x in (d.get("claim_tags") or []) if norm(x)]

        if (not mapped) and (not args.include_unmapped):
            continue
        if (not mapped) and claim_tags and (not args.include_unmapped_claims):
            # For unmapped drafts, QA cannot ground claims against a lead profile.
            # Skip unless the user explicitly allows it.
            continue
        if uid:
            targets.append(
                DraftTarget(uid=uid, to=to_header, subject=subject, mapped=mapped, profile=profile, claim_tags=claim_tags)
            )

    # QA JSON is newest-first already; preserve that order for sending.
    if args.limit:
        targets = targets[: args.limit]

    today = date.today().isoformat()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    backups_dir = TMP_DIR / f"drafts-sent-backups-{today}"
    backups_dir.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"hostinger-smtp-send-{today}.md"

    results: list[SendResult] = []

    if args.smtp_test:
        try:
            smtp_login_test(
                host=args.smtp_host,
                port=args.smtp_port,
                user=smtp_user,
                password=smtp_password,
                timeout_s=args.smtp_timeout,
            )
            status = "ok"
            note = ""
        except Exception as e:
            status = "error"
            note = f"{type(e).__name__}"

        lines: list[str] = []
        lines.append("# SMTP Login Test")
        lines.append(f"Date: {today}")
        lines.append("")
        lines.append(f"- SMTP: `{args.smtp_host}:{args.smtp_port}` user `{smtp_user}`")
        lines.append(f"- Result: `{status}`")
        if note:
            lines.append(f"- Error: `{note}`")
        lines.append("")
        report_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
        print(f"Wrote: {report_path}")
        return

    if args.dry_run:
        lines: list[str] = []
        lines.append("# SMTP Send (Dry Run)")
        lines.append(f"Date: {today}")
        lines.append("")
        lines.append(f"- QA source: `{qa_path.as_posix()}`")
        lines.append(f"- Include unmapped: `{args.include_unmapped}`")
        lines.append(f"- Include unmapped with claims: `{args.include_unmapped_claims}`")
        lines.append(f"- Would send: {len(targets)}")
        lines.append(f"- Suppressed by bounce/opt-out guardrail: {len(suppressed_targets)}")
        unmapped = [t for t in targets if not t.mapped]
        unmapped_with_claims = [t for t in unmapped if t.claim_tags]
        lines.append(f"- Unmapped included: {len(unmapped)}")
        lines.append(f"- Unmapped with claims included: {len(unmapped_with_claims)}")
        lines.append("")
        lines.append("| UID | To | Subject | Mapped | Claim Tags | Profile |")
        lines.append("| --- | --- | --- | --- | --- | --- |")
        for t in targets:
            tags = ", ".join(t.claim_tags) if t.claim_tags else ""
            lines.append(f"| {t.uid} | {t.to} | {t.subject} | {t.mapped} | {tags} | `{t.profile}` |")
        lines.append("")
        if suppressed_targets:
            lines.append("## Suppressed")
            lines.append("| UID | To | Subject | Reason |")
            lines.append("| --- | --- | --- | --- |")
            for uid, to_header, subject, reason in suppressed_targets:
                lines.append(f"| {uid} | {to_header} | {subject} | {reason} |")
            lines.append("")
        report_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
        print(f"Wrote: {report_path}")
        return

    client = imaplib.IMAP4_SSL(args.imap_host, args.imap_port)
    try:
        client.login(args.imap_user, imap_password)
        status, mailboxes_raw = client.list()
        mailboxes: list[str] = []
        if status == "OK" and mailboxes_raw:
            for line in mailboxes_raw:
                name = parse_mailbox_name(line)
                if name:
                    mailboxes.append(name)

        drafts_box = pick_mailbox(mailboxes, args.drafts_folder, ".Drafts") or args.drafts_folder
        sent_box = pick_mailbox(mailboxes, args.sent_folder, ".Sent") or args.sent_folder
        trash_box = pick_mailbox(mailboxes, args.trash_folder, ".Trash") or args.trash_folder

        status, _ = client.select(drafts_box, readonly=False)
        if status != "OK":
            raise SystemExit(f"Failed to select drafts mailbox: {drafts_box}")

        for t in targets:
            status, msg_data = client.uid("fetch", t.uid, "(RFC822)")
            if status != "OK" or not msg_data:
                results.append(SendResult(uid=t.uid, to=t.to, subject=t.subject, action="skip", note="fetch_failed"))
                continue
            raw = None
            for chunk in msg_data:
                if isinstance(chunk, tuple):
                    raw = chunk[1]
                    break
            if not raw:
                results.append(SendResult(uid=t.uid, to=t.to, subject=t.subject, action="skip", note="missing_bytes"))
                continue

            # Backup exact original draft bytes before sending.
            (backups_dir / f"{t.uid}.eml").write_bytes(raw)

            msg = email.message_from_bytes(raw)
            try:
                send_via_smtp(
                    msg=msg,
                    host=args.smtp_host,
                    port=args.smtp_port,
                    user=smtp_user,
                    password=smtp_password,
                    timeout_s=args.smtp_timeout,
                )
            except Exception as e:
                results.append(SendResult(uid=t.uid, to=t.to, subject=t.subject, action="error", note=f"smtp_{type(e).__name__}"))
                continue

            # Append a copy to Sent so our IMAP truth stays complete.
            append_status, _ = client.append(sent_box, None, None, msg.as_bytes())
            if append_status != "OK":
                results.append(SendResult(uid=t.uid, to=t.to, subject=t.subject, action="partial", note="sent_append_failed"))
                continue

            # Move original draft to Trash to avoid double-send risk.
            copy_status, _ = client.uid("COPY", t.uid, trash_box)
            if copy_status != "OK":
                results.append(SendResult(uid=t.uid, to=t.to, subject=t.subject, action="partial", note="trash_copy_failed"))
                continue
            store_status, _ = client.uid("STORE", t.uid, "+FLAGS.SILENT", r"(\Deleted)")
            if store_status != "OK":
                results.append(SendResult(uid=t.uid, to=t.to, subject=t.subject, action="partial", note="delete_flag_failed"))
                continue
            try:
                client.expunge()
            except Exception:
                pass

            results.append(SendResult(uid=t.uid, to=t.to, subject=t.subject, action="sent", note="ok"))
            if args.sleep_seconds:
                sleep(args.sleep_seconds)
    finally:
        try:
            client.logout()
        except Exception:
            pass

    sent_n = sum(1 for r in results if r.action == "sent")
    err_n = sum(1 for r in results if r.action == "error")
    partial_n = sum(1 for r in results if r.action == "partial")
    skip_n = sum(1 for r in results if r.action == "skip")

    lines = []
    lines.append("# SMTP Send Report")
    lines.append(f"Date: {today}")
    lines.append("")
    lines.append(f"- QA source: `{qa_path.as_posix()}`")
    lines.append(f"- SMTP: `{args.smtp_host}:{args.smtp_port}` user `{smtp_user}`")
    lines.append(f"- Include unmapped: `{args.include_unmapped}`")
    lines.append(f"- Backups: `{backups_dir.as_posix()}`")
    lines.append("")
    lines.append(f"- Attempted: {len(targets)}")
    lines.append(f"- Suppressed by bounce/opt-out guardrail: {len(suppressed_targets)}")
    lines.append(f"- Sent: {sent_n}")
    lines.append(f"- Partial: {partial_n}")
    lines.append(f"- Errors: {err_n}")
    lines.append(f"- Skipped: {skip_n}")
    lines.append("")
    lines.append("| UID | To | Subject | Action | Note |")
    lines.append("| --- | --- | --- | --- | --- |")
    for r in results:
        lines.append(f"| {r.uid} | {r.to} | {r.subject} | {r.action} | {r.note} |")
    lines.append("")
    if suppressed_targets:
        lines.append("## Suppressed")
        lines.append("| UID | To | Subject | Reason |")
        lines.append("| --- | --- | --- | --- |")
        for uid, to_header, subject, reason in suppressed_targets:
            lines.append(f"| {uid} | {to_header} | {subject} | {reason} |")
        lines.append("")
    report_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote: {report_path}")


if __name__ == "__main__":
    main()
