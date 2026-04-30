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

from suppression import get_suppression_reason, load_suppression_map

REPO_ROOT = Path(".")
REPORTS_DIR = REPO_ROOT / "reports"

QUEUE_DEFAULT = REPO_ROOT / "outreach" / "queues" / "batches-001-010-uncontacted-email.md"

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
URL_RE = re.compile(r"https?://[^\s)]+", re.IGNORECASE)


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


def extract_field(text: str, key: str) -> str:
    m = re.search(rf"(?mi)^{re.escape(key)}:\s*(.+)\s*$", text)
    return norm(m.group(1)) if m else ""


def extract_section_bullets(text: str, header: str, limit: int = 3) -> list[str]:
    pattern = rf"(?ms)^##\s+{re.escape(header)}\s*\n(.*?)(?:\n##\s+|\Z)"
    m = re.search(pattern, text)
    if not m:
        return []
    block = m.group(1)
    out: list[str] = []
    for line in block.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("- "):
            out.append(s[2:].strip())
        elif out:
            break
        if len(out) >= limit:
            break
    return out


def pick_website_domain(website: str) -> str:
    if not website:
        return ""
    m = URL_RE.search(website)
    if not m:
        return ""
    url = m.group(0)
    url = re.sub(r"^https?://", "", url, flags=re.IGNORECASE)
    return url.split("/")[0]


def render_first_contact_message(
    *,
    from_addr: str,
    to_addr: str,
    lead_name: str,
    profile_text: str,
) -> EmailMessage:
    address = extract_field(profile_text, "Address")
    website = extract_field(profile_text, "Website")
    website_domain = pick_website_domain(website)

    angles = extract_section_bullets(profile_text, "Outreach angle", limit=2)
    observations = extract_section_bullets(profile_text, "Observations", limit=2)

    if website_domain and any("security" in low(a) or "header" in low(a) for a in angles + observations):
        subject = f"Quick note about your website security ({website_domain})"
    elif website_domain:
        subject = f"Quick question about your website ({website_domain})"
    else:
        subject = f"Quick question for {lead_name}"

    if address and address.lower() != "unknown":
        loc_line = f" for {lead_name} at {address}"
    else:
        loc_line = f" for {lead_name}"

    specific_line = ""
    if angles:
        specific_line = angles[0]
    elif observations:
        specific_line = observations[0]

    body_lines: list[str] = []
    body_lines.append(f"Hi {lead_name} team,")
    body_lines.append("")
    body_lines.append(f"Not sure if this is the best email, but I was trying to reach the right contact{loc_line}.")
    body_lines.append("")

    if specific_line:
        body_lines.append(f"Quick note: {specific_line}")
        body_lines.append("")
    else:
        if website_domain:
            body_lines.append(f"I was looking at {website_domain} and had a small note that could help avoid issues for visitors.")
            body_lines.append("")
        else:
            body_lines.append("I had a quick question and wanted to make sure I am not reaching the wrong place.")
            body_lines.append("")

    if website_domain:
        body_lines.append("If helpful, I can point to the exact page I saw, or send a quick screenshot.")
    else:
        body_lines.append("If you can point me to the best website or contact for this business, I can send the note there.")
    body_lines.append("")
    body_lines.append("Best,")
    body_lines.append("")
    body_lines.append("Fred McCullough")
    body_lines.append("McCullough Digital")

    plain = "\n".join(body_lines)

    html_lines = [l.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;") for l in body_lines]
    html_lines = [
        (l.replace("McCullough Digital", '<a href=\"https://mccullough.digital\">McCullough Digital</a>') if l == "McCullough Digital" else l)
        for l in html_lines
    ]
    html = "<br>".join(html_lines)

    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg["Date"] = email.utils.format_datetime(datetime.now(timezone.utc))
    msg.set_content(plain)
    msg.add_alternative(f"<html><body>{html}</body></html>", subtype="html")
    return msg


@dataclass(frozen=True)
class QueueRow:
    lead_id: int
    lead_name: str
    batch: str
    status: str
    outreach: str
    contact_path: str
    email: str
    profile_path: Path


def parse_table_queue(path: Path) -> list[QueueRow]:
    rows: list[QueueRow] = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        s = line.strip()
        if not s.startswith("|"):
            continue
        if s.startswith("| ---"):
            continue
        parts = [p.strip() for p in s.strip("|").split("|")]
        if len(parts) < 12 or parts[0] == "LeadID":
            continue
        if not parts[0].isdigit():
            continue
        lead_id = int(parts[0])
        lead_name = parts[1]
        batch = parts[2]
        status = parts[3]
        outreach = parts[4]
        contact_path = parts[5]
        email_addr = low(parts[6])
        profile = REPO_ROOT / parts[-1]
        if "@" not in email_addr:
            continue
        rows.append(
            QueueRow(
                lead_id=lead_id,
                lead_name=lead_name,
                batch=batch,
                status=status,
                outreach=outreach,
                contact_path=contact_path,
                email=email_addr,
                profile_path=profile,
            )
        )
    # Dedup by recipient email, keep first (avoid generating 2 drafts to same mailbox address).
    seen_email: set[str] = set()
    out: list[QueueRow] = []
    for r in rows:
        if r.email in seen_email:
            continue
        seen_email.add(r.email)
        out.append(r)
    return out


def parse_mailbox_name(raw_line: bytes) -> str | None:
    try:
        text = raw_line.decode(errors="ignore")
    except Exception:
        return None
    m = re.match(r'^\(.*\)\s+\"[^\"]+\"\s+(.+)$', text)
    if m:
        name = m.group(1).strip()
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


def imap_search_recipient(client: imaplib.IMAP4_SSL, mailbox: str, addr: str) -> set[bytes]:
    client.select(mailbox, readonly=True)
    ids: set[bytes] = set()
    # SEARCH is finicky across providers; try a few variants and union.
    for crit in [
        ("TO", addr),
        ("HEADER", "To", addr),
        ("TEXT", addr),
    ]:
        try:
            typ, data = client.search(None, *[str(x) for x in crit])
        except Exception:
            continue
        if typ != "OK" or not data or not data[0]:
            continue
        for b in data[0].split():
            ids.add(b)
    return ids


def update_profile_after_draft(profile_path: Path, *, today: str, recipient: str) -> bool:
    if not profile_path.exists():
        return False
    text = profile_path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()

    def replace_label(label: str, value: str) -> bool:
        nonlocal lines
        rx = re.compile(rf"^({re.escape(label)}\s*:)\s*(.*)$", re.IGNORECASE)
        changed = False
        out: list[str] = []
        for ln in lines:
            m = rx.match(ln)
            if m:
                out.append(f"{m.group(1)} {value}")
                changed = True
            else:
                out.append(ln)
        lines = out
        return changed

    # Outreach status is the key grounding for downstream queues.
    changed = False
    changed = replace_label("Outreach status", "drafted") or changed

    # Promote to draft-prepared if it was in a pre-outreach state.
    m_status = re.search(r"(?mi)^Status:\s*(.+?)\s*$", text)
    cur_status = low(m_status.group(1)) if m_status else ""
    if cur_status in {"ready", "new"}:
        changed = replace_label("Status", "draft-prepared") or changed

    changed = replace_label("Last updated", today) or changed

    # Append an outreach log entry, create section if needed.
    log_line = f"- {today}: Draft created in Hostinger IMAP Drafts (recipient `{recipient}`)."
    if log_line not in text:
        if any(ln.strip().lower() == "## outreach log" for ln in lines):
            idx = next(i for i, ln in enumerate(lines) if ln.strip().lower() == "## outreach log") + 1
            # Insert after header and any blank line.
            while idx < len(lines) and lines[idx].strip() == "":
                idx += 1
            lines.insert(idx, log_line)
            changed = True
        else:
            # Insert near the bottom, before Evidence if present.
            insert_at = len(lines)
            for i, ln in enumerate(lines):
                if ln.strip().lower() == "## evidence":
                    insert_at = i
                    break
            block = ["", "## Outreach log", log_line, ""]
            lines[insert_at:insert_at] = block
            changed = True

    if changed:
        profile_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create first-contact drafts from a markdown table queue via IMAP (drafts only, no sending). Also updates profile headers to Outreach status: drafted."
    )
    parser.add_argument("--queue", default=str(QUEUE_DEFAULT))
    parser.add_argument("--imap-host", default="imap.hostinger.com")
    parser.add_argument("--imap-port", type=int, default=993)
    parser.add_argument("--imap-user", default="fred@mccullough.digital")
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--drafts-folder", default="INBOX.Drafts")
    parser.add_argument("--sent-folder", default="INBOX.Sent")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    queue_path = Path(args.queue)
    if not queue_path.exists():
        raise SystemExit(f"Missing queue: {queue_path.as_posix()}")

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    rows = parse_table_queue(queue_path)
    if not rows:
        raise SystemExit(f"No rows parsed from queue: {queue_path.as_posix()}")
    suppression_map = load_suppression_map()

    today = date.today().isoformat()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"hostinger-first-contact-drafts-table-queue-{today}.md"

    created: list[str] = []
    skipped: list[str] = []
    updated_profiles: list[str] = []

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

        for r in rows:
            suppress_reason = get_suppression_reason(r.email, suppression_map)
            if suppress_reason:
                skipped.append(f"- {r.lead_id} {r.lead_name}: skip (suppressed: {r.email} -> {suppress_reason})")
                continue
            # Live overlap check, this is the source of truth.
            sent_hits = imap_search_recipient(client, sent_box, r.email)
            if sent_hits:
                skipped.append(f"- {r.lead_id} {r.lead_name}: skip (already in Sent: {r.email})")
                continue
            draft_hits = imap_search_recipient(client, drafts_box, r.email)
            if draft_hits:
                skipped.append(f"- {r.lead_id} {r.lead_name}: skip (already in Drafts: {r.email})")
                continue
            if not r.profile_path.exists():
                skipped.append(f"- {r.lead_id} {r.lead_name}: skip (missing profile: {r.profile_path.as_posix()})")
                continue

            profile_text = r.profile_path.read_text(encoding="utf-8", errors="ignore")
            msg = render_first_contact_message(
                from_addr=args.imap_user,
                to_addr=r.email,
                lead_name=r.lead_name,
                profile_text=profile_text,
            )

            if args.dry_run:
                created.append(f"- {r.lead_id} {r.lead_name}: would draft -> {r.email} ({msg.get('Subject')})")
                continue

            st, _ = client.append(drafts_box, None, imaplib.Time2Internaldate(time.time()), msg.as_bytes())
            if st != "OK":
                skipped.append(f"- {r.lead_id} {r.lead_name}: skip (IMAP append failed) -> {r.email}")
                continue

            created.append(f"- {r.lead_id} {r.lead_name}: drafted -> {r.email} ({msg.get('Subject')})")

            if update_profile_after_draft(r.profile_path, today=today, recipient=r.email):
                updated_profiles.append(f"- {r.lead_id} {r.profile_path.as_posix()}")

    finally:
        try:
            client.logout()
        except Exception:
            pass

    lines: list[str] = []
    lines.append("# Hostinger IMAP: First-Contact Draft Creation (Table Queue)")
    lines.append("")
    lines.append(f"Generated: {today}")
    lines.append(f"Queue: `{queue_path.as_posix()}`")
    lines.append(f"Mode: {'DRY-RUN' if args.dry_run else 'APPLY'}")
    lines.append("")
    lines.append(f"- Created: {len(created)}")
    lines.append(f"- Skipped: {len(skipped)}")
    lines.append(f"- Profiles updated: {len(updated_profiles)}")
    lines.append("")
    if created:
        lines.append("## Created")
        lines.extend(created)
        lines.append("")
    if skipped:
        lines.append("## Skipped")
        lines.extend(skipped)
        lines.append("")
    if updated_profiles:
        lines.append("## Profiles Updated")
        lines.extend(updated_profiles)
        lines.append("")

    report_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(report_path.as_posix())


if __name__ == "__main__":
    main()
