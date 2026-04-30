from __future__ import annotations

import argparse
import email.utils
import imaplib
import json
import os
import re
import ssl
from dataclasses import dataclass
from datetime import date, datetime, timezone
from email.message import EmailMessage
from pathlib import Path


REPO_ROOT = Path(".")
TMP_DIR = REPO_ROOT / "tmp"
REPORTS_DIR = REPO_ROOT / "reports"
QUEUES_DIR = REPO_ROOT / "outreach" / "queues"


EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
FORM_SUBMISSION_RE = re.compile(
    r"submitted.*(contact form|site form|web form)|\|\s*\d{4}-\d{2}-\d{2}\s*\|\s*contact form\s*\|\s*sent\s*\|",
    re.IGNORECASE,
)


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


@dataclass
class BounceRow:
    lead_id: str
    lead: str
    profile: str
    bounced_email: str
    alt_emails: list[str]
    diagnostic: str


def parse_markdown_table(path: Path) -> list[dict[str, str]]:
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    header_idx = None
    for i, line in enumerate(lines):
        if line.strip().startswith("|") and i + 1 < len(lines):
            if set(lines[i + 1].replace("|", "").strip()) <= {"-", " "}:
                header_idx = i
                break
    if header_idx is None:
        return []

    cols = [c.strip() for c in lines[header_idx].strip().strip("|").split("|")]
    rows: list[dict[str, str]] = []
    for line in lines[header_idx + 2 :]:
        if not line.strip().startswith("|"):
            break
        parts = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(parts) != len(cols):
            continue
        rows.append(dict(zip(cols, parts)))
    return rows


def split_alt_emails(raw: str) -> list[str]:
    emails = [e.lower() for e in EMAIL_RE.findall(raw or "")]
    # Preserve order but dedupe.
    out: list[str] = []
    seen = set()
    for e in emails:
        if e in seen:
            continue
        out.append(e)
        seen.add(e)
    return out


def profile_already_contacted_via_form(profile_path: str) -> bool:
    """
    Return True if the profile contains evidence that a website contact form
    was already submitted/sent for this lead.

    This intentionally does NOT treat "Contact path: form" or "Contact form: yes"
    as evidence of outreach.
    """
    if not profile_path:
        return False
    p = Path(profile_path)
    if not p.exists():
        return False
    try:
        text = p.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return False

    for line in text.splitlines():
        if FORM_SUBMISSION_RE.search(line):
            if line.lower().strip().startswith("contact form:"):
                continue
            return True
    return False


def pick_alt_email(br: BounceRow, bounced_all: set[str]) -> str:
    """
    Pick the best alt email for a bounced lead.

    Rules:
    - Never pick the bounced email itself.
    - Prefer an alt email that is not known to have bounced recently (from this queue).
    """
    bounced = low(br.bounced_email)
    for e in br.alt_emails:
        el = low(e)
        if not el:
            continue
        if bounced and el == bounced:
            continue
        if el in bounced_all:
            continue
        return el
    return ""


def load_sent_recipients(sent_index_path: Path) -> set[str]:
    try:
        d = json.loads(sent_index_path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return set()
    out: set[str] = set()
    for page in d.get("pages", []) or []:
        for item in page.get("items", []) or []:
            for e in EMAIL_RE.findall(item.get("to", "") or ""):
                out.add(e.lower())
    return out


def load_draft_recipients(drafts_index_path: Path) -> set[str]:
    try:
        d = json.loads(drafts_index_path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return set()
    out: set[str] = set()
    for page in d.get("pages", []) or []:
        for item in page.get("items", []) or []:
            for e in EMAIL_RE.findall(item.get("to", "") or ""):
                out.add(e.lower())
    return out


def build_message(
    from_addr: str,
    to_addr: str,
    lead_name: str,
    bounced_email: str,
    alt_email: str,
    diagnostic: str,
) -> EmailMessage:
    subject = "Quick follow-up (email bounce)"

    # Keep the message safe: do not restate technical claims; just ask for the best contact.
    diag_line = ""
    if diagnostic:
        # Trim noisy diagnostics.
        diag_short = " ".join(diagnostic.split())
        if len(diag_short) > 140:
            diag_short = diag_short[:137] + "..."
        diag_line = f" (it came back as: {diag_short})"

    plain = "\n".join(
        [
            f"Hi {lead_name} team,",
            "",
            f"Quick follow-up: I tried reaching you at {bounced_email} but it bounced back{diag_line}.",
            f"If {alt_email} is the best email for you, could you confirm?",
            "",
            "I am local to the area and I had a quick note about your website that could help prevent avoidable issues for you and for customers. Happy to share details.",
            "",
            "Best,",
            "",
            "Fred McCullough",
            "McCullough Digital",
        ]
    )

    html = "<br>".join(
        [
            f"Hi {lead_name} team,",
            "",
            f"Quick follow-up: I tried reaching you at {bounced_email} but it bounced back{diag_line}.",
            f"If {alt_email} is the best email for you, could you confirm?",
            "",
            "I am local to the area and I had a quick note about your website that could help prevent avoidable issues for you and for customers. Happy to share details.",
            "",
            "Best,",
            "",
            "Fred McCullough",
            '<a href="https://mccullough.digital">McCullough Digital</a>',
        ]
    )

    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg["Date"] = email.utils.format_datetime(datetime.now(timezone.utc))
    msg.set_content(plain)
    msg.add_alternative(f"<html><body>{html}</body></html>", subtype="html")
    return msg


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


def main() -> None:
    parser = argparse.ArgumentParser(description="Create bounce follow-up drafts for try-alt-email queue via IMAP (no sending).")
    parser.add_argument("--imap-host", default="imap.hostinger.com")
    parser.add_argument("--imap-port", type=int, default=993)
    parser.add_argument("--imap-user", required=True)
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--drafts-folder", default="INBOX.Drafts")

    parser.add_argument("--queue", default=None, help="Path to bounced-followup-try-alt-email-*.md (default: newest matching).")
    parser.add_argument("--sent-index", default=None, help="Path to tmp/hostinger_sent_index_*.json (default: latest).")
    parser.add_argument("--drafts-index", default=None, help="Path to tmp/hostinger_drafts_index_*.json (default: latest).")

    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    if args.queue:
        queue_path = Path(args.queue)
    else:
        candidates = sorted(QUEUES_DIR.glob("bounced-followup-try-alt-email-*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not candidates:
            raise SystemExit("No bounced-followup-try-alt-email queue found.")
        queue_path = candidates[0]

    sent_index = Path(args.sent_index) if args.sent_index else latest_tmp_json("hostinger_sent_index")
    drafts_index = Path(args.drafts_index) if args.drafts_index else latest_tmp_json("hostinger_drafts_index")

    sent_recipients = load_sent_recipients(sent_index)
    draft_recipients = load_draft_recipients(drafts_index)

    raw_rows = parse_markdown_table(queue_path)
    rows: list[BounceRow] = []
    for r in raw_rows:
        rows.append(
            BounceRow(
                lead_id=norm(r.get("LeadID")),
                lead=norm(r.get("Lead")),
                profile=norm(r.get("Profile")),
                bounced_email=low(r.get("Bounced Email")),
                alt_emails=split_alt_emails(norm(r.get("Alt Emails"))),
                diagnostic=norm(r.get("Diagnostic")),
            )
        )

    bounced_all = {low(br.bounced_email) for br in rows if low(br.bounced_email)}

    today = date.today().isoformat()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"hostinger-bounce-try-alt-email-drafts-{today}.md"

    created = 0
    skipped = 0
    notes: list[str] = []

    if not args.dry_run:
        client = imaplib.IMAP4_SSL(args.imap_host, args.imap_port, ssl_context=ssl.create_default_context())
        try:
            client.login(args.imap_user, password)
            status, mailboxes_raw = client.list()
            mailboxes: list[str] = []
            if status == "OK" and mailboxes_raw:
                for line in mailboxes_raw:
                    name = parse_mailbox_name(line)
                    if name:
                        mailboxes.append(name)
            drafts_box = pick_mailbox(mailboxes, args.drafts_folder, ".Drafts") or args.drafts_folder

            for br in rows:
                if not br.alt_emails:
                    skipped += 1
                    notes.append(f"- {br.lead_id} {br.lead}: skip (no alt emails)")
                    continue
                if br.profile and profile_already_contacted_via_form(br.profile):
                    skipped += 1
                    notes.append(f"- {br.lead_id} {br.lead}: skip (contact form already submitted)")
                    continue
                alt = pick_alt_email(br, bounced_all)
                if not alt:
                    skipped += 1
                    notes.append(f"- {br.lead_id} {br.lead}: skip (no safe alt email found)")
                    continue

                if alt in sent_recipients:
                    skipped += 1
                    notes.append(f"- {br.lead_id} {br.lead}: skip (alt already in Sent: {alt})")
                    continue
                if alt in draft_recipients:
                    skipped += 1
                    notes.append(f"- {br.lead_id} {br.lead}: skip (alt already in Drafts: {alt})")
                    continue

                msg = build_message(
                    from_addr=args.imap_user,
                    to_addr=alt,
                    lead_name=br.lead or "there",
                    bounced_email=br.bounced_email or "your email",
                    alt_email=alt,
                    diagnostic=br.diagnostic,
                )
                st, _ = client.append(drafts_box, None, None, msg.as_bytes())
                if st != "OK":
                    skipped += 1
                    notes.append(f"- {br.lead_id} {br.lead}: error (append failed)")
                    continue

                created += 1
                # Update local sets to avoid duplicates within the run.
                draft_recipients.add(alt)
        finally:
            try:
                client.logout()
            except Exception:
                pass
    else:
        for br in rows:
            if not br.alt_emails:
                skipped += 1
                notes.append(f"- {br.lead_id} {br.lead}: skip (no alt emails)")
                continue
            if br.profile and profile_already_contacted_via_form(br.profile):
                skipped += 1
                notes.append(f"- {br.lead_id} {br.lead}: skip (contact form already submitted)")
                continue
            alt = pick_alt_email(br, bounced_all)
            if not alt:
                skipped += 1
                notes.append(f"- {br.lead_id} {br.lead}: skip (no safe alt email found)")
                continue
            if alt in sent_recipients:
                skipped += 1
                notes.append(f"- {br.lead_id} {br.lead}: skip (alt already in Sent: {alt})")
                continue
            if alt in draft_recipients:
                skipped += 1
                notes.append(f"- {br.lead_id} {br.lead}: skip (alt already in Drafts: {alt})")
                continue
            created += 1
            notes.append(f"- {br.lead_id} {br.lead}: would draft -> {alt}")

    lines: list[str] = []
    lines.append("# Create Bounce Follow-Up Drafts: Try Alt Email")
    lines.append(f"Generated: {today}")
    lines.append("")
    lines.append(f"- Queue: `{queue_path.as_posix()}`")
    lines.append(f"- Sent index: `{sent_index.as_posix()}`")
    lines.append(f"- Drafts index: `{drafts_index.as_posix()}`")
    lines.append(f"- Dry run: `{args.dry_run}`")
    lines.append("")
    lines.append(f"- Rows: {len(rows)}")
    lines.append(f"- Drafts created: {created}")
    lines.append(f"- Skipped: {skipped}")
    lines.append("")
    if notes:
        lines.append("## Notes")
        lines.extend(notes)
        lines.append("")
    report_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote: {report_path}")


if __name__ == "__main__":
    main()
