from __future__ import annotations

import argparse
import email
import imaplib
import json
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


def norm(s: str | None) -> str:
    return (s or "").strip()


def latest_tmp_json(prefix: str) -> Path:
    files = sorted(TMP_DIR.glob(f"{prefix}_*.json"))
    if not files:
        raise SystemExit(f"Missing tmp/{prefix}_*.json")
    return max(files, key=lambda p: p.stat().st_mtime)


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
    to: str
    subject: str
    action: str
    note: str


def main() -> None:
    parser = argparse.ArgumentParser(description="Move sent-overlap drafts to Trash via IMAP (with .eml backups).")
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", required=True)
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--drafts-folder", default="INBOX.Drafts")
    parser.add_argument("--trash-folder", default="INBOX.Trash")
    parser.add_argument("--qa-json", default=None, help="Path to tmp/hostinger_drafts_qa_YYYY-MM-DD.json (default: latest).")
    parser.add_argument("--dry-run", action="store_true")
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
        if "sent_overlap" in issues:
            uid = norm(d.get("uid"))
            if uid:
                targets.append(uid)
    targets = sorted(set(targets), key=lambda x: int(x) if x.isdigit() else x)

    today = date.today().isoformat()
    backup_dir = TMP_DIR / f"drafts-backups-sent-overlap-{today}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"hostinger-move-sent-overlap-drafts-{today}.md"

    rows: list[Row] = []

    if not targets:
        report_path.write_text(
            f"# Move Sent-Overlap Drafts\nDate: {today}\n\n- QA source: `{qa_path.as_posix()}`\n- Targets: 0\n\nNothing to do.\n",
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
                rows.append(Row(uid=uid, to="", subject="", action="skip", note="fetch_failed"))
                continue
            raw = None
            for chunk in msg_data:
                if isinstance(chunk, tuple):
                    raw = chunk[1]
                    break
            if not raw:
                rows.append(Row(uid=uid, to="", subject="", action="skip", note="missing_bytes"))
                continue

            msg = email.message_from_bytes(raw)
            to_header = norm(msg.get("To"))
            subject = norm(msg.get("Subject"))

            if args.dry_run:
                rows.append(Row(uid=uid, to=to_header, subject=subject, action="dry_run", note="would_move_to_trash"))
                continue

            (backup_dir / f"{uid}.eml").write_bytes(raw)

            copy_status, _ = client.uid("COPY", uid, trash_box)
            if copy_status != "OK":
                rows.append(Row(uid=uid, to=to_header, subject=subject, action="partial", note="copy_to_trash_failed"))
                continue
            store_status, _ = client.uid("STORE", uid, "+FLAGS.SILENT", r"(\Deleted)")
            if store_status != "OK":
                rows.append(Row(uid=uid, to=to_header, subject=subject, action="partial", note="delete_flag_failed"))
                continue
            try:
                client.expunge()
            except Exception:
                pass
            rows.append(Row(uid=uid, to=to_header, subject=subject, action="moved", note="sent_overlap"))
    finally:
        try:
            client.logout()
        except Exception:
            pass

    moved = sum(1 for r in rows if r.action == "moved")
    lines: list[str] = []
    lines.append("# Move Sent-Overlap Drafts")
    lines.append(f"Date: {today}")
    lines.append("")
    lines.append(f"- QA source: `{qa_path.as_posix()}`")
    lines.append(f"- Targets: {len(targets)}")
    lines.append(f"- Moved: {moved}")
    if not args.dry_run:
        lines.append(f"- Backups: `{backup_dir.as_posix()}`")
    lines.append("")
    lines.append("| UID | To | Subject | Action | Note |")
    lines.append("| --- | --- | --- | --- | --- |")
    for r in rows:
        lines.append(f"| {r.uid} | {r.to} | {r.subject} | {r.action} | {r.note} |")
    lines.append("")
    report_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote: {report_path}")


if __name__ == "__main__":
    main()

