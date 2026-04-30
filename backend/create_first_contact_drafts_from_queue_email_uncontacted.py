from __future__ import annotations

import argparse
import email.utils
import imaplib
import json
import os
import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from email.message import EmailMessage
from pathlib import Path

from suppression import get_suppression_reason, load_suppression_map

REPO_ROOT = Path(".")
TMP_DIR = REPO_ROOT / "tmp"
REPORTS_DIR = REPO_ROOT / "reports"

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


def latest_tmp_json(prefix: str) -> Path:
    files = sorted(TMP_DIR.glob(f"{prefix}_*.json"))
    if not files:
        raise SystemExit(f"Missing tmp/{prefix}_*.json (run scripts/maintenance/imap_export_hostinger.py first)")
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


def load_index_recipients(path: Path) -> set[str]:
    """
    Return lowercase deduped recipients found in a Hostinger IMAP index export.
    Supports both legacy-ish and current shapes.
    """
    try:
        d = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return set()

    items = d.get("items") or d.get("drafts") or d.get("sent") or []
    out: set[str] = set()
    for it in items or []:
        to_field = norm(it.get("to") if isinstance(it, dict) else "")
        for e in EMAIL_RE.findall(to_field):
            out.add(e.lower())
    return out


def extract_field(text: str, key: str) -> str:
    # Frontmatter-style line: "Website: https://..."
    m = re.search(rf"(?mi)^{re.escape(key)}:\s*(.+)\s*$", text)
    return norm(m.group(1)) if m else ""


def extract_section_bullets(text: str, header: str, limit: int = 3) -> list[str]:
    """
    Extract up to `limit` bullet lines (leading "- ") immediately under a "## {header}" section.
    Stops at the next "## " header.
    """
    pattern = rf"(?ms)^##\s+{re.escape(header)}\s*\n(.*?)(?:\n##\s+|\Z)"
    m = re.search(pattern, text)
    if not m:
        return []
    block = m.group(1)
    lines = []
    for line in block.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("- "):
            lines.append(s[2:].strip())
        elif lines:
            # Once bullets started, stop when we hit non-bullet content.
            break
        if len(lines) >= limit:
            break
    return lines


def pick_website_domain(website: str) -> str:
    if not website:
        return ""
    m = URL_RE.search(website)
    if not m:
        return ""
    url = m.group(0)
    url = re.sub(r"^https?://", "", url, flags=re.IGNORECASE)
    url = url.split("/")[0]
    return url


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

    # Subject: keep simple, avoid claims we didn't prove.
    if website_domain and any("security" in low(a) or "header" in low(a) for a in angles + observations):
        subject = f"Quick note about your website security ({website_domain})"
    elif website_domain:
        subject = f"Quick question about your website ({website_domain})"
    else:
        subject = f"Quick question for {lead_name}"

    # Opening: if we have an address, anchor it (reduces mis-targeting).
    loc_line = ""
    if address and address.lower() != "unknown":
        loc_line = f" for {lead_name} at {address}"
    else:
        loc_line = f" for {lead_name}"

    # Pick one "specific" line that is actually in the profile, otherwise be explicit that we may be off.
    specific_line = ""
    if angles:
        specific_line = angles[0]
    elif observations:
        specific_line = observations[0]

    # Avoid em dashes by construction (only commas/periods).
    body_lines: list[str] = []
    body_lines.append(f"Hi {lead_name} team,")
    body_lines.append("")
    body_lines.append(f"Not sure if this is the best email, but I was trying to reach the right contact{loc_line}.")
    body_lines.append("")

    if specific_line:
        # Keep it as a "note" instead of a hard assertion when it's vague.
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

    html_lines = [l for l in body_lines]
    html_lines = [l.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;") for l in html_lines]
    # Linkify the signature brand.
    html_lines = [
        (l.replace("McCullough Digital", '<a href="https://mccullough.digital">McCullough Digital</a>') if l == "McCullough Digital" else l)
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


@dataclass
class QueueRow:
    lead_id: str
    lead_name: str
    email: str
    batch: str
    profile_path: str


def parse_queue(path: Path) -> list[QueueRow]:
    rows: list[QueueRow] = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        s = line.strip()
        if not s.startswith("- "):
            continue
        parts = [p.strip() for p in s[2:].split("|")]
        if len(parts) < 5:
            continue
        lead_id, name, email_addr, batch, profile_path = parts[:5]
        email_addr = low(email_addr)
        if not lead_id or not email_addr or "@" not in email_addr:
            continue
        rows.append(
            QueueRow(
                lead_id=lead_id.strip(),
                lead_name=norm(name),
                email=email_addr,
                batch=norm(batch),
                profile_path=norm(profile_path),
            )
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create first-contact drafts for outreach/queues/*email-uncontacted*.md via IMAP (drafts only, no sending)."
    )
    parser.add_argument("--imap-host", default="imap.hostinger.com")
    parser.add_argument("--imap-port", type=int, default=993)
    parser.add_argument("--imap-user", default="fred@mccullough.digital")
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--drafts-folder", default="INBOX.Drafts")
    # Prefer a stable, regenerated queue (subtracts IMAP Drafts/Sent) over dated snapshots.
    parser.add_argument(
        "--queue",
        default="outreach/queues/registered-entities-batches-001-010-email-uncontacted-needs-draft.md",
    )
    parser.add_argument("--sent-index", default=None, help="Path to tmp/hostinger_sent_index_*.json (default: latest).")
    parser.add_argument("--drafts-index", default=None, help="Path to tmp/hostinger_drafts_index_*.json (default: latest).")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    queue_path = Path(args.queue)
    if not queue_path.exists():
        raise SystemExit(f"Missing queue file: {queue_path.as_posix()}")

    sent_index = Path(args.sent_index) if args.sent_index else latest_tmp_json("hostinger_sent_index")
    drafts_index = Path(args.drafts_index) if args.drafts_index else latest_tmp_json("hostinger_drafts_index")

    sent_recipients = load_index_recipients(sent_index)
    draft_recipients = load_index_recipients(drafts_index)
    suppression_map = load_suppression_map()

    rows = parse_queue(queue_path)
    if not rows:
        raise SystemExit(f"No rows found in queue: {queue_path.as_posix()}")

    today = date.today().isoformat()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"hostinger-first-contact-drafts-{today}.md"

    created: list[str] = []
    skipped: list[str] = []

    client = imaplib.IMAP4_SSL(args.imap_host, args.imap_port)
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

        for r in rows:
            suppress_reason = get_suppression_reason(r.email, suppression_map)
            if suppress_reason:
                skipped.append(f"- {r.lead_id} {r.lead_name}: skip (suppressed: {r.email} -> {suppress_reason})")
                continue
            if r.email in sent_recipients:
                skipped.append(f"- {r.lead_id} {r.lead_name}: skip (already in Sent: {r.email})")
                continue
            if r.email in draft_recipients:
                skipped.append(f"- {r.lead_id} {r.lead_name}: skip (already in Drafts: {r.email})")
                continue

            profile_path = Path(r.profile_path)
            if not profile_path.exists():
                skipped.append(f"- {r.lead_id} {r.lead_name}: skip (missing profile: {r.profile_path})")
                continue

            profile_text = profile_path.read_text(encoding="utf-8", errors="ignore")
            msg = render_first_contact_message(
                from_addr=args.imap_user,
                to_addr=r.email,
                lead_name=r.lead_name,
                profile_text=profile_text,
            )

            if args.dry_run:
                created.append(f"- {r.lead_id} {r.lead_name}: would draft -> {r.email} ({msg.get('Subject')})")
                continue

            st, _ = client.append(drafts_box, None, None, msg.as_bytes())
            if st == "OK":
                created.append(f"- {r.lead_id} {r.lead_name}: drafted -> {r.email} ({msg.get('Subject')})")
                draft_recipients.add(r.email)
            else:
                skipped.append(f"- {r.lead_id} {r.lead_name}: skip (IMAP append failed) -> {r.email}")

    finally:
        try:
            client.logout()
        except Exception:
            pass

    lines: list[str] = []
    lines.append("# Hostinger IMAP: First-Contact Draft Creation (Email Uncontacted)")
    lines.append("")
    lines.append(f"Generated: {today}")
    lines.append(f"Queue: `{queue_path.as_posix()}`")
    lines.append(f"Sent index: `{sent_index.as_posix()}`")
    lines.append(f"Drafts index: `{drafts_index.as_posix()}`")
    lines.append("")
    lines.append(f"- Created: {len(created)}")
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
