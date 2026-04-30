import argparse
import email
import imaplib
import os
import re
from dataclasses import dataclass
from datetime import date
from email.utils import getaddresses
from pathlib import Path


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


def norm_subject(s: str) -> str:
    return " ".join((s or "").strip().split()).lower()


def norm_msgid(s: str) -> str:
    s = (s or "").strip().lower()
    if s.startswith("<") and s.endswith(">"):
        s = s[1:-1]
    return s


def parse_recipients(to_header: str, cc_header: str) -> list[str]:
    addrs = []
    for _, addr in getaddresses([to_header or "", cc_header or ""]):
        addr = (addr or "").strip().lower()
        if addr and EMAIL_RE.fullmatch(addr):
            addrs.append(addr)
    # Preserve order but unique.
    seen = set()
    out = []
    for a in addrs:
        if a not in seen:
            out.append(a)
            seen.add(a)
    return out


@dataclass(frozen=True)
class MailItem:
    imap_id: bytes
    to: str
    cc: str
    from_: str
    subject: str
    date: str
    msgid: str

    @property
    def recipients(self) -> list[str]:
        return parse_recipients(self.to, self.cc)

    @property
    def subject_norm(self) -> str:
        return norm_subject(self.subject)

    @property
    def msgid_norm(self) -> str:
        return norm_msgid(self.msgid)


def fetch_items(client: imaplib.IMAP4_SSL, mailbox: str, limit: int | None, readonly: bool) -> list[MailItem]:
    status, _ = client.select(mailbox, readonly=readonly)
    if status != "OK":
        return []
    status, data = client.search(None, "ALL")
    if status != "OK" or not data or not data[0]:
        return []
    ids = data[0].split()
    if limit:
        ids = ids[-limit:]

    items: list[MailItem] = []
    fields = "TO CC FROM SUBJECT DATE MESSAGE-ID"
    for msg_id in reversed(ids):
        status, msg_data = client.fetch(msg_id, f"(BODY.PEEK[HEADER.FIELDS ({fields})])")
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
        items.append(
            MailItem(
                imap_id=msg_id,
                to=(message.get("To", "") or "").strip(),
                cc=(message.get("Cc", "") or "").strip(),
                from_=(message.get("From", "") or "").strip(),
                subject=(message.get("Subject", "") or "").strip(),
                date=(message.get("Date", "") or "").strip(),
                msgid=(message.get("Message-ID", "") or "").strip(),
            )
        )
    return items


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Deduplicate Hostinger Trash against Sent via IMAP (dry-run by default)."
    )
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", default="fred@mccullough.digital")
    parser.add_argument("--pass-env", default="IMAP_PASS")

    parser.add_argument("--sent-folder", default="INBOX.Sent")
    parser.add_argument("--trash-folder", default="INBOX.Trash")
    parser.add_argument("--limit-sent", type=int, default=None, help="Optional limit for newest sent items only.")
    parser.add_argument("--limit-trash", type=int, default=500, help="Optional limit for newest trash items only.")
    parser.add_argument(
        "--match-mode",
        choices=["strict", "recipient"],
        default="strict",
        help="Match strategy. strict: message-id OR (to+subject). recipient: also match any recipient seen in Sent.",
    )
    parser.add_argument(
        "--targets",
        nargs="*",
        default=None,
        help="Optional recipient emails; if provided, only consider Trash messages addressed to these recipients.",
    )

    parser.add_argument("--apply", action="store_true", help="Actually delete from Trash (requires --confirm DELETE).")
    parser.add_argument(
        "--confirm",
        default="",
        help='Safety valve: must be exactly "DELETE" when using --apply.',
    )
    parser.add_argument("--report", default=None, help="Optional report path; default is reports/hostinger-trash-dedupe-YYYY-MM-DD.md")
    args = parser.parse_args()

    password = os.getenv(args.pass_env)
    if not password:
        password = get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    targets = None
    if args.targets is not None:
        targets = {t.strip().lower() for t in args.targets if (t or "").strip()}

    report_path = Path(args.report) if args.report else Path("reports") / f"hostinger-trash-dedupe-{date.today().isoformat()}.md"

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

        sent_box = pick_mailbox(mailboxes, args.sent_folder, ".Sent")
        trash_box = pick_mailbox(mailboxes, args.trash_folder, ".Trash")
        if not sent_box:
            raise SystemExit(f"Could not find Sent mailbox (preferred {args.sent_folder}).")
        if not trash_box:
            raise SystemExit(f"Could not find Trash mailbox (preferred {args.trash_folder}).")

        sent_items = fetch_items(client, sent_box, args.limit_sent, readonly=True)
        sent_msgids = {it.msgid_norm for it in sent_items if it.msgid_norm}
        sent_sigs: set[tuple[str, str]] = set()
        sent_rcpts: set[str] = set()
        for it in sent_items:
            subj = it.subject_norm
            if not subj:
                continue
            for rcpt in it.recipients:
                sent_sigs.add((rcpt, subj))
                sent_rcpts.add(rcpt)

        trash_items = fetch_items(client, trash_box, args.limit_trash, readonly=True)

        matches = []
        trash_target_counts: dict[str, int] = {}
        match_target_counts: dict[str, int] = {}
        for it in trash_items:
            rcpts = it.recipients
            if targets is not None:
                if not rcpts:
                    continue
                if not any(r in targets for r in rcpts):
                    continue
                for r in rcpts:
                    if r in targets:
                        trash_target_counts[r] = trash_target_counts.get(r, 0) + 1

            reason = None
            if it.msgid_norm and it.msgid_norm in sent_msgids:
                reason = "message-id"
            else:
                subj = it.subject_norm
                if subj and any((r, subj) in sent_sigs for r in rcpts):
                    reason = "to+subject"
                elif args.match_mode == "recipient" and any(r in sent_rcpts for r in rcpts):
                    reason = "recipient-only"

            if reason:
                matches.append((it, reason))
                if targets is not None:
                    for r in rcpts:
                        if r in targets:
                            match_target_counts[r] = match_target_counts.get(r, 0) + 1

        lines = []
        lines.append("# Hostinger Trash Dedupe vs Sent (IMAP)")
        lines.append(f"Generated: {date.today().isoformat()}")
        lines.append("")
        lines.append(f"- Sent mailbox: {sent_box}")
        lines.append(f"- Trash mailbox: {trash_box}")
        lines.append(f"- Sent scanned: {len(sent_items)} (limit={args.limit_sent})")
        lines.append(f"- Trash scanned: {len(trash_items)} (limit={args.limit_trash})")
        lines.append(f"- Matches: {len(matches)}")
        if targets is not None:
            lines.append(f"- Targets: {', '.join(sorted(targets))}")
            lines.append("")
            lines.append("## Target Summary")
            for t in sorted(targets):
                lines.append(f"- {t}: trash={trash_target_counts.get(t, 0)} matched={match_target_counts.get(t, 0)}")
        lines.append("")
        if matches:
            lines.append("## Matches (Safe To Delete From Trash If Sent Copy Exists)")
            for it, reason in matches:
                rid = it.imap_id.decode(errors="ignore")
                rcpts = ", ".join(it.recipients) if it.recipients else "(no recipients parsed)"
                lines.append(f"- IMAP id: {rid} ({reason})")
                lines.append(f"  - To: {rcpts}")
                lines.append(f"  - Subject: {it.subject}")
                lines.append(f"  - Date: {it.date}")
                if it.msgid:
                    lines.append(f"  - Message-ID: {it.msgid}")
            lines.append("")

        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

        print(f"Report: {report_path.as_posix()}")
        print(f"Matches: {len(matches)}")

        if not args.apply:
            print("Dry run only. Re-run with --apply --confirm DELETE to delete from Trash.")
            return

        if args.confirm != "DELETE":
            raise SystemExit('Refusing to delete: --apply requires --confirm DELETE')

        # Delete from Trash (only the matched IDs we already computed).
        status, _ = client.select(trash_box, readonly=False)
        if status != "OK":
            raise SystemExit(f"Failed to select Trash mailbox for deletion: {trash_box}")

        deleted = 0
        for it, _reason in matches:
            client.store(it.imap_id, "+FLAGS", r"(\Deleted)")
            deleted += 1
        if deleted:
            client.expunge()
        print(f"Deleted from Trash: {deleted}")
    finally:
        try:
            client.logout()
        except Exception:
            pass


if __name__ == "__main__":
    main()
