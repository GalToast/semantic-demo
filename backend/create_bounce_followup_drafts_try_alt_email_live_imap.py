from __future__ import annotations

import argparse
import email.utils
import imaplib
import os
import re
import ssl
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from email.message import EmailMessage
from pathlib import Path


REPO_ROOT = Path(".")
REPORTS_DIR = REPO_ROOT / "reports"
QUEUES_DIR = REPO_ROOT / "outreach" / "queues"

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")

# Treat these as evidence that we already submitted a form (so we should not keep drafting alt-email followups).
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
    out: list[str] = []
    seen = set()
    for e in emails:
        if e in seen:
            continue
        out.append(e)
        seen.add(e)
    return out


def profile_already_contacted_via_form(profile_path: str) -> bool:
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


@dataclass(frozen=True)
class BounceRow:
    lead_id: str
    lead: str
    batch: str
    profile: str
    bounced_email: str
    alt_emails: list[str]
    diagnostic: str


def pick_alt_email(br: BounceRow, bounced_all: set[str]) -> str:
    bounced = low(br.bounced_email)
    for e in br.alt_emails:
        el = low(e)
        if not el:
            continue
        if bounced and el == bounced:
            continue
        # If the candidate alt is also known-bounced in this same queue, do not use it.
        if el in bounced_all:
            continue
        return el
    return ""


def build_message(
    from_addr: str,
    to_addr: str,
    lead_name: str,
    bounced_email: str,
    alt_email: str,
    diagnostic: str,
) -> EmailMessage:
    subject = "Quick follow-up (email bounce)"

    diag_line = ""
    if diagnostic:
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
            '<a href=\"https://mccullough.digital\">McCullough Digital</a>',
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
    match = re.match(r'^\(.*\)\s+\"[^\"]+\"\s+(.+)$', text)
    if match:
        name = match.group(1).strip()
        if name.startswith('"') and name.endswith('"'):
            name = name[1:-1]
        return name
    parts = text.split()
    return parts[-1] if parts else None


def pick_mailbox(mailboxes: list[str], preferred: str, fallback_suffix: str) -> str:
    if preferred in mailboxes:
        return preferred
    lower_map = {m.lower(): m for m in mailboxes}
    if preferred.lower() in lower_map:
        return lower_map[preferred.lower()]
    for m in mailboxes:
        if m.lower().endswith(fallback_suffix.lower()):
            return m
    return preferred


def imap_search_recipient(client: imaplib.IMAP4_SSL, mailbox: str, addr: str) -> bool:
    client.select(mailbox, readonly=True)
    for crit in [
        ("TO", addr),
        ("HEADER", "To", addr),
        ("TEXT", addr),
    ]:
        try:
            typ, data = client.search(None, *[str(x) for x in crit])
        except Exception:
            continue
        if typ == "OK" and data and data[0]:
            return True
    return False


def append_outreach_log(profile_path: str, *, today: str, bounced: str, alt: str) -> None:
    p = Path(profile_path)
    if not p.exists():
        return
    text = p.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()

    log_line = f"- {today}: Draft prepared to try alternate email `{alt}` (original bounced: `{bounced}`)."
    if log_line in text:
        return

    # Update Last updated.
    out: list[str] = []
    replaced_last = False
    for ln in lines:
        if re.match(r"^Last updated\\s*:", ln, re.IGNORECASE):
            out.append(f"Last updated: {today}")
            replaced_last = True
        else:
            out.append(ln)
    if not replaced_last:
        # Insert after title block if missing.
        insert_at = 1 if out and out[0].startswith("# ") else 0
        out[insert_at:insert_at] = [f"Last updated: {today}"]

    lines = out

    # Insert or create Outreach log section.
    lower_lines = [ln.strip().lower() for ln in lines]
    if "## outreach log" in lower_lines:
        idx = lower_lines.index("## outreach log") + 1
        while idx < len(lines) and lines[idx].strip() == "":
            idx += 1
        lines.insert(idx, log_line)
    else:
        # Insert before Evidence if present.
        insert_at = len(lines)
        for i, ln in enumerate(lines):
            if ln.strip().lower() == "## evidence":
                insert_at = i
                break
        block = ["", "## Outreach log", log_line, ""]
        lines[insert_at:insert_at] = block

    p.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create bounce follow-up drafts (try-alt-email) via IMAP with live overlap checks (draft-only).")
    parser.add_argument("--imap-host", default="imap.hostinger.com")
    parser.add_argument("--imap-port", type=int, default=993)
    parser.add_argument("--imap-user", default="fred@mccullough.digital")
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--drafts-folder", default="INBOX.Drafts")
    parser.add_argument("--sent-folder", default="INBOX.Sent")
    parser.add_argument("--queue", default=str(QUEUES_DIR / "bounced-followup-try-alt-email-2026-02-09.md"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    queue_path = Path(args.queue)
    if not queue_path.exists():
        raise SystemExit(f"Missing queue: {queue_path.as_posix()}")

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    raw_rows = parse_markdown_table(queue_path)
    rows: list[BounceRow] = []
    for r in raw_rows:
        rows.append(
            BounceRow(
                lead_id=norm(r.get("LeadID")),
                lead=norm(r.get("Lead")),
                batch=norm(r.get("Batch")),
                profile=norm(r.get("Profile")),
                bounced_email=low(r.get("Bounced Email")),
                alt_emails=split_alt_emails(norm(r.get("Alt Emails"))),
                diagnostic=norm(r.get("Diagnostic")),
            )
        )

    bounced_all = {low(br.bounced_email) for br in rows if low(br.bounced_email)}

    today = date.today().isoformat()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"hostinger-bounce-try-alt-email-drafts-live-{today}.md"

    created: list[str] = []
    skipped: list[str] = []

    ctx = ssl.create_default_context()
    client = imaplib.IMAP4_SSL(args.imap_host, args.imap_port, ssl_context=ctx)
    try:
        client.login(args.imap_user, password)
        st, raw = client.list()
        mailboxes: list[str] = []
        if st == "OK" and raw:
            for ln in raw:
                name = parse_mailbox_name(ln)
                if name:
                    mailboxes.append(name)
        drafts_box = pick_mailbox(mailboxes, args.drafts_folder, ".Drafts")
        sent_box = pick_mailbox(mailboxes, args.sent_folder, ".Sent")

        for br in rows:
            if not br.alt_emails:
                skipped.append(f"- {br.lead_id} {br.lead}: skip (no alt emails)")
                continue
            if br.profile and profile_already_contacted_via_form(br.profile):
                skipped.append(f"- {br.lead_id} {br.lead}: skip (contact form already submitted)")
                continue
            alt = pick_alt_email(br, bounced_all)
            if not alt:
                skipped.append(f"- {br.lead_id} {br.lead}: skip (no safe alt email found)")
                continue

            # Live overlap checks.
            if imap_search_recipient(client, sent_box, alt):
                skipped.append(f"- {br.lead_id} {br.lead}: skip (alt already in Sent: {alt})")
                continue
            if imap_search_recipient(client, drafts_box, alt):
                skipped.append(f"- {br.lead_id} {br.lead}: skip (alt already in Drafts: {alt})")
                continue

            msg = build_message(
                from_addr=args.imap_user,
                to_addr=alt,
                lead_name=br.lead or "there",
                bounced_email=br.bounced_email or "your email",
                alt_email=alt,
                diagnostic=br.diagnostic,
            )

            if args.dry_run:
                created.append(f"- {br.lead_id} {br.lead}: would draft -> {alt}")
                continue

            st, _ = client.append(drafts_box, None, imaplib.Time2Internaldate(time.time()), msg.as_bytes())
            if st != "OK":
                skipped.append(f"- {br.lead_id} {br.lead}: error (append failed)")
                continue

            created.append(f"- {br.lead_id} {br.lead}: drafted -> {alt}")
            if br.profile:
                append_outreach_log(br.profile, today=today, bounced=br.bounced_email, alt=alt)

    finally:
        try:
            client.logout()
        except Exception:
            pass

    lines: list[str] = []
    lines.append("# Create Bounce Follow-Up Drafts: Try Alt Email (Live IMAP Checks)")
    lines.append(f"Generated: {today}")
    lines.append("")
    lines.append(f"- Queue: `{queue_path.as_posix()}`")
    lines.append(f"- Mode: {'DRY-RUN' if args.dry_run else 'APPLY'}")
    lines.append("")
    lines.append(f"- Rows: {len(rows)}")
    lines.append(f"- Drafts created: {len(created)}")
    lines.append(f"- Skipped: {len(skipped)}")
    lines.append("")
    if created:
        lines.append("## Created")
        lines.extend(created)
        lines.append("")
    if skipped:
        lines.append("## Skipped")
        lines.extend(skipped)
        lines.append("")
    report_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(report_path.as_posix())


if __name__ == "__main__":
    main()
