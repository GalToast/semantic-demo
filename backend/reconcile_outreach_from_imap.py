import json
import os
import re
import imaplib
import argparse
from datetime import date
from pathlib import Path

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
SELF_EMAILS = {"fred@mccullough.digital"}

REPO_ROOT = Path(".")
PROFILES_ROOT = REPO_ROOT / "leads" / "profiles"
DISQUALIFIED_ROOT = REPO_ROOT / "leads" / "disqualified"
REPORT_PATH = REPO_ROOT / "reports" / f"hostinger-reconcile-{date.today().isoformat()}.md"

FIELDS = [
    "Status",
    "Outreach status",
    "Contact path",
    "Last updated",
]


def parse_header(lines):
    header = {}
    for line in lines:
        if line.startswith("## "):
            break
        if line.strip() == "" and header:
            break
        if ":" in line:
            key, val = line.split(":", 1)
            key = key.strip()
            val = val.strip()
            if key in FIELDS or key in {"Email"}:
                header[key] = val
    return header


def apply_changes(path: Path, changes: dict) -> bool:
    if not changes:
        return False
    text = path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()

    first_bullet = None
    first_section = None
    header_start = None
    for i, line in enumerate(lines):
        if header_start is None:
            for field in FIELDS:
                if line.startswith(f"{field}:"):
                    header_start = i
                    break
        if first_bullet is None and line.startswith("- "):
            first_bullet = i
        if line.startswith("## "):
            first_section = i
            break
    if first_bullet is None:
        first_bullet = len(lines)
    if first_section is None:
        first_section = len(lines)
    if header_start is None:
        header_start = 0

    header_end = None
    for i in range(header_start, first_section):
        if lines[i].strip() == "" and i > header_start:
            header_end = i
            break
    if header_end is None:
        header_end = first_section

    found_fields = set()

    for i in range(header_start, header_end):
        for field, value in changes.items():
            prefix = f"{field}:"
            if lines[i].startswith(prefix):
                lines[i] = f"{field}: {value}"
                found_fields.add(field)

    for i in range(first_bullet, first_section):
        for field, value in changes.items():
            prefix = f"- {field}:"
            if lines[i].startswith(prefix):
                lines[i] = f"- {field}: {value}"
                found_fields.add(field)

    insert_fields = [f for f in FIELDS if f in changes and f not in found_fields]
    if insert_fields:
        insertion = [f"{field}: {changes[field]}" for field in insert_fields]
        lines = lines[:header_end] + insertion + lines[header_end:]

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return True


def load_imap_index(prefix: str) -> tuple[Path, set[str], int]:
    files = sorted((REPO_ROOT / "tmp").glob(f"{prefix}_*.json"))
    if not files:
        raise SystemExit(f"Missing IMAP index files for {prefix} in tmp/")
    latest = max(files, key=lambda p: p.stat().st_mtime)
    data = json.loads(latest.read_text(encoding="utf-8", errors="ignore"))
    emails = set()
    item_count = 0
    for page in data.get("pages", []):
        page_items = page.get("items", []) or []
        item_count += int(page.get("count") or len(page_items))
        for item in page.get("items", []):
            for key in ("text", "to", "from", "subject"):
                for email in EMAIL_RE.findall(item.get(key, "") or ""):
                    emails.add(email.lower())
    emails -= SELF_EMAILS
    return latest, emails, item_count


def extract_bounced_emails(host: str, user: str, password: str) -> set[str]:
    client = imaplib.IMAP4_SSL(host, 993)
    client.login(user, password)
    bounced = set()

    def scan_mailbox(mailbox: str):
        status, _ = client.select(mailbox, readonly=True)
        if status != "OK":
            return
        # Search for common bounce terms
        ids = set()
        for term in ("Undelivered", "Delivery Status Notification", "Mail delivery failed", "Undeliverable"):
            token = f'"{term}"' if " " in term else term
            status, data = client.search(None, "TEXT", token)
            if status == "OK" and data and data[0]:
                ids.update(data[0].split())
        if not ids:
            return
        for msg_id in ids:
            status, msg_data = client.fetch(msg_id, "(BODY.PEEK[TEXT])")
            if status != "OK" or not msg_data:
                continue
            raw = None
            for chunk in msg_data:
                if isinstance(chunk, tuple):
                    raw = chunk[1]
                    break
            if not raw:
                continue
            try:
                text = raw.decode(errors="ignore")
            except Exception:
                continue
            # Prefer structured DSN lines
            found_in_structured = False
            for line in text.splitlines():
                low = line.lower()
                if "final-recipient" in low or "original-recipient" in low or "x-failed-recipients" in low:
                    for email in EMAIL_RE.findall(line):
                        bounced.add(email.lower())
                        found_in_structured = True
            # Fallback to any email in the text (excluding our own)
            if not found_in_structured:
                for email in EMAIL_RE.findall(text):
                    bounced.add(email.lower())

    scan_mailbox("INBOX")
    scan_mailbox("INBOX.Junk")
    client.logout()
    bounced -= SELF_EMAILS
    return bounced


def get_windows_user_env(name: str) -> str | None:
    """
    In some automation contexts, user-level env vars exist but are not loaded
    into the current process environment. This reads the authoritative value
    from HKCU\\Environment when available.
    """
    if os.name != "nt":
        return None
    try:
        import winreg  # type: ignore

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            value, _ = winreg.QueryValueEx(key, name)
            return str(value) if value else None
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser(description="Reconcile lead outreach status against Hostinger IMAP exports.")
    parser.add_argument(
        "--skip-bounces",
        action="store_true",
        help="Skip bounce scan (reconcile drafts/sent only).",
    )
    args = parser.parse_args()

    sent_path, sent_emails, sent_items = load_imap_index("hostinger_sent_index")
    draft_path, draft_emails, draft_items = load_imap_index("hostinger_drafts_index")

    bounced_emails = set()
    if not args.skip_bounces:
        imap_pass = os.getenv("IMAP_PASS") or os.getenv("IMAP_PASSWORD")
        if not imap_pass:
            imap_pass = get_windows_user_env("IMAP_PASS") or get_windows_user_env("IMAP_PASSWORD")
        if not imap_pass:
            raise SystemExit("Missing IMAP_PASS env var for bounce scan (or pass --skip-bounces).")
        bounced_emails = extract_bounced_emails("imap.hostinger.com", "fred@mccullough.digital", imap_pass)

    updated = 0
    mismatches = []
    changes_log = []

    for root in (PROFILES_ROOT, DISQUALIFIED_ROOT):
        if not root.exists():
            continue
        for path in root.rglob("profile.md"):
            text = path.read_text(encoding="utf-8", errors="ignore")
            lines = text.splitlines()
            header = parse_header(lines)
            email_field = header.get("Email", "")
            emails = [e.lower() for e in EMAIL_RE.findall(email_field)]
            if not emails:
                continue
            outreach = (header.get("Outreach status") or "").strip().lower()
            status = (header.get("Status") or "").strip().lower()
            is_disqualified = "disqualified" in path.parts

            in_drafts = any(email in draft_emails for email in emails)
            in_sent = any(email in sent_emails for email in emails)
            is_bounced = any(email in bounced_emails for email in emails)

            changes = {}
            # Bounce should win even if Sent is missing (Sent messages can be deleted/moved).
            # A bounce implies we attempted delivery to that recipient.
            if is_bounced:
                changes["Outreach status"] = "bounced"
                if not is_disqualified:
                    changes["Status"] = "complete"
            elif in_sent:
                changes["Outreach status"] = "sent"
                if not is_disqualified:
                    changes["Status"] = "complete"
            elif in_drafts:
                changes["Outreach status"] = "drafted"
                if not is_disqualified and status != "draft-prepared":
                    changes["Status"] = "draft-prepared"
            else:
                if outreach in {"drafted", "sent", "bounced", "replied"}:
                    mismatches.append((path.as_posix(), outreach))

            if changes:
                changes["Last updated"] = date.today().isoformat()
                if apply_changes(path, changes):
                    updated += 1
                    changes_log.append((path.as_posix(), changes))

    lines = []
    lines.append("# Hostinger Reconciliation")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append("")
    lines.append(f"- Drafts index: {draft_path.as_posix()}")
    lines.append(f"- Sent index: {sent_path.as_posix()}")
    lines.append(f"- Draft items: {draft_items}")
    lines.append(f"- Draft recipient emails (unique): {len(draft_emails)}")
    lines.append(f"- Sent items: {sent_items}")
    lines.append(f"- Sent recipient emails (unique): {len(sent_emails)}")
    lines.append(f"- Bounced emails: {len(bounced_emails)}")
    lines.append(f"- Profiles updated: {updated}")
    lines.append("")

    if changes_log:
        lines.append("## Updates Applied")
        for path, changes in changes_log:
            change_text = "; ".join(f"{k}: {v}" for k, v in changes.items())
            lines.append(f"- {path}")
            lines.append(f"  - {change_text}")
        lines.append("")

    if mismatches:
        lines.append("## Still Mismatched (Not in Drafts/Sent)")
        for path, outreach in mismatches:
            lines.append(f"- {path} ({outreach})")
        lines.append("")

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Updated profiles: {updated}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
