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
from pathlib import Path


REPO_ROOT = Path(".")
TMP_DIR = REPO_ROOT / "tmp"
REPORTS_DIR = REPO_ROOT / "reports"


EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")

# Examples we want to catch (internal identifiers leaking into copy):
# - "882-ber-bookkeeping"
# - "999-blue-cove-pool-service-llc"
# Require at least one letter after the first hyphen so we don't flag phone numbers like 936-228-2382.
SLUG_TOKEN_RE = re.compile(r"\b\d{2,}-[a-z][a-z0-9-]*\b", re.I)
SLUG_LIKE_RE = re.compile(r"(^\d{2,}-[a-z0-9-]+$)|(^[a-z0-9]+-[a-z0-9-]+$)")

VERIFIED_CONTACT_RE = re.compile(r"Verified contact info found for\s+([^,\r\n.]+)", re.I)


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


def decode_part_payload(part: Message) -> tuple[str, str]:
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


def extract_parts(msg: Message) -> tuple[str, str, Message | None, Message | None, str, str]:
    """
    Return (text_plain, text_html, plain_part, html_part, plain_charset, html_charset).
    Either text may be empty if the part doesn't exist.
    """
    text_plain = ""
    text_html = ""
    plain_part: Message | None = None
    html_part: Message | None = None
    plain_charset = "utf-8"
    html_charset = "utf-8"

    if msg.is_multipart():
        for part in msg.walk():
            disp = low(part.get("Content-Disposition"))
            if disp.startswith("attachment"):
                continue
            ctype = low(part.get_content_type())
            if ctype == "text/plain" and not plain_part:
                text_plain, plain_charset = decode_part_payload(part)
                plain_part = part
            elif ctype == "text/html" and not html_part:
                text_html, html_charset = decode_part_payload(part)
                html_part = part
    else:
        ctype = low(msg.get_content_type())
        if ctype == "text/plain":
            text_plain, plain_charset = decode_part_payload(msg)
            plain_part = msg
        elif ctype == "text/html":
            text_html, html_charset = decode_part_payload(msg)
            html_part = msg

    return (norm(text_plain), norm(text_html), plain_part, html_part, plain_charset, html_charset)


def greeting_name_from_text(text: str) -> str | None:
    """
    If we find a greeting like "Hi <name> team," return <name>.
    """
    if not text:
        return None
    # Works for both plain text and HTML (where the greeting may be preceded by tags).
    m = re.search(r"(?mi)\b(hi|hello)\s+([^<\r\n]+?)\s+team,", text)
    if not m:
        return None
    return norm(m.group(2))


def looks_slug_like(name: str) -> bool:
    if not name:
        return False
    if " " in name:
        return False
    if SLUG_LIKE_RE.match(name.lower()):
        return True
    # Catch other hyphen-heavy internal ids (e.g. "ber-bookkeeping") without spaces.
    if "-" in name and name.lower() == name:
        return True
    return False


def extract_verified_contact_name(text: str) -> str | None:
    if not text:
        return None
    m = VERIFIED_CONTACT_RE.search(text)
    if not m:
        return None
    candidate = norm(m.group(1))
    # Basic sanity: must contain a letter and be short enough for a greeting.
    if not re.search(r"[A-Za-z]", candidate):
        return None
    if len(candidate) > 80:
        return None
    return candidate


def extract_preferred_name_from_profile(profile_path: str) -> str | None:
    """
    Best-effort extraction from our lead profile markdown.
    We prefer stable "Verified contact info found for X" lines.
    """
    if not profile_path:
        return None
    path = Path(profile_path)
    if not path.exists():
        return None
    text = path.read_text(encoding="utf-8", errors="ignore")
    return extract_verified_contact_name(text)


def slug_to_human(name: str) -> str:
    """
    Last-resort: convert "999-blue-cove-pool-service-llc" -> "Blue Cove Pool Service LLC".
    Not as good as a verified operating name, but better than leaking the slug/id.
    """
    s = (name or "").strip().replace("-", " ")
    s = re.sub(r"^\d+\s+", "", s).strip()
    if not s:
        return name
    words = []
    for w in s.split():
        upper = w.upper()
        if upper in {"LLC", "INC", "CO", "LTD", "LP", "LLP", "PLLC", "PC", "PA"}:
            words.append(upper)
        else:
            words.append(w.capitalize())
    return " ".join(words).strip()


def patch_greeting(text: str, old_name: str, new_name: str) -> tuple[str, bool]:
    if not text or not old_name or not new_name:
        return text, False
    # Patch the first occurrence of "Hi <old> team," (plain or HTML).
    pat = re.compile(rf"(?i)((hi|hello)\s+){re.escape(old_name)}(\s+team,)")
    new_text, n = pat.subn(rf"\1{new_name}\3", text, count=1)
    return new_text, n > 0


def replace_slug_tokens(text: str, slug: str, replacement: str) -> tuple[str, bool]:
    if not text or not slug or not replacement:
        return text, False
    new_text = text.replace(slug, replacement)
    return new_text, new_text != text


@dataclass
class FixResult:
    uid: str
    to: str
    subject: str
    action: str
    note: str
    old: str
    new: str


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fix Hostinger Drafts where the greeting leaked an internal slug/id (APPEND + move original to Trash)."
    )
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", required=True)
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--drafts-folder", default="INBOX.Drafts")
    parser.add_argument("--trash-folder", default="INBOX.Trash")
    parser.add_argument("--qa-json", default=None, help="Path to tmp/hostinger_drafts_qa_YYYY-MM-DD.json (default: latest).")
    parser.add_argument("--dry-run", action="store_true", help="Compute what would change, but do not write anything.")
    parser.add_argument("--limit", type=int, default=None, help="Optional max number of drafts to patch (newest-first order from QA JSON).")
    parser.add_argument("--backup-dir", default=None, help="Directory to write original .eml backups (default: tmp/drafts-backups-YYYY-MM-DD).")
    args = parser.parse_args()

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    qa_path = Path(args.qa_json) if args.qa_json else latest_tmp_json("hostinger_drafts_qa")
    qa = json.loads(qa_path.read_text(encoding="utf-8", errors="ignore"))

    # Preserve QA ordering (newest-first) for any limit.
    qa_drafts = [d for d in (qa.get("drafts", []) or []) if not d.get("skip")]
    if args.limit:
        qa_drafts = qa_drafts[: args.limit]

    today = date.today().isoformat()
    backup_dir = Path(args.backup_dir) if args.backup_dir else (TMP_DIR / f"drafts-backups-{today}")
    backup_dir.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"hostinger-fix-draft-greetings-{today}.md"

    results: list[FixResult] = []

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

        for d in qa_drafts:
            uid = norm(d.get("uid"))
            if not uid:
                continue

            status, msg_data = client.uid("fetch", uid, "(RFC822)")
            if status != "OK" or not msg_data:
                results.append(FixResult(uid=uid, to="", subject="", action="skip", note="fetch_failed", old="", new=""))
                continue

            raw = None
            for chunk in msg_data:
                if isinstance(chunk, tuple):
                    raw = chunk[1]
                    break
            if not raw:
                results.append(FixResult(uid=uid, to="", subject="", action="skip", note="missing_bytes", old="", new=""))
                continue

            msg = email.message_from_bytes(raw)
            to_header = norm(msg.get("To"))
            subject = norm(msg.get("Subject"))

            text_plain, text_html, plain_part, html_part, plain_cs, html_cs = extract_parts(msg)
            # Find any internal slug token(s) in either part.
            combined_for_scan = "\n".join([x for x in [text_plain, text_html] if x])
            slug_tokens = [m.group(0) for m in SLUG_TOKEN_RE.finditer(combined_for_scan or "")]
            # Prefer the greeting slug when present, otherwise use the first token leak.
            greeting_plain = greeting_name_from_text(text_plain)
            greeting_html = greeting_name_from_text(text_html)
            old_name = ""
            if greeting_plain and looks_slug_like(greeting_plain):
                old_name = greeting_plain
            elif greeting_html and looks_slug_like(greeting_html):
                old_name = greeting_html
            elif slug_tokens:
                old_name = slug_tokens[0]
            if not old_name or (not looks_slug_like(old_name) and not SLUG_TOKEN_RE.search(old_name)):
                results.append(FixResult(uid=uid, to=to_header, subject=subject, action="skip", note="no_slug_token", old=old_name or "", new=""))
                continue

            # Prefer extracting an operating/business name from the body itself.
            new_name = extract_verified_contact_name(combined_for_scan)

            # Fallback: extract from the chosen lead profile.
            if not new_name:
                chosen = d.get("chosen_lead") or {}
                profile_path = norm(chosen.get("profile"))
                new_name = extract_preferred_name_from_profile(profile_path)

            # Last-resort: de-slug the slug.
            if not new_name:
                new_name = slug_to_human(old_name)

            if not new_name or new_name == old_name:
                results.append(FixResult(uid=uid, to=to_header, subject=subject, action="skip", note="no_replacement_name", old=old_name, new=new_name or ""))
                continue

            changed_any = False
            changed_plain = False
            changed_html = False
            if plain_part is not None and text_plain:
                new_plain = text_plain
                # Replace all slug token occurrences (including body references), then fix greeting if needed.
                new_plain, changed = replace_slug_tokens(new_plain, old_name, new_name)
                if changed:
                    changed_plain = True
                new_plain, changed2 = patch_greeting(new_plain, old_name, new_name)
                if changed2:
                    changed_plain = True
                if changed_plain:
                    set_part_payload(plain_part, new_plain, plain_cs)

            if html_part is not None and text_html:
                # HTML needs escaping for &, <, > in text nodes.
                from html import escape

                new_html = text_html
                new_name_html = escape(new_name, quote=False)
                new_html, changed = replace_slug_tokens(new_html, old_name, new_name_html)
                if changed:
                    changed_html = True
                new_html, changed2 = patch_greeting(new_html, old_name, new_name_html)
                if changed2:
                    changed_html = True
                if changed_html:
                    set_part_payload(html_part, new_html, html_cs)

            changed_any = changed_plain or changed_html
            if not changed_any:
                results.append(FixResult(uid=uid, to=to_header, subject=subject, action="skip", note="patch_not_applied", old=old_name, new=new_name))
                continue

            if args.dry_run:
                results.append(FixResult(uid=uid, to=to_header, subject=subject, action="dry_run", note="would_patch", old=old_name, new=new_name))
                continue

            # Backup original for rollback.
            (backup_dir / f"{uid}.eml").write_bytes(raw)

            append_status, _append_data = client.append(drafts_box, None, None, msg.as_bytes())
            if append_status != "OK":
                results.append(FixResult(uid=uid, to=to_header, subject=subject, action="error", note="append_failed", old=old_name, new=new_name))
                continue

            copy_status, _copy_data = client.uid("COPY", uid, trash_box)
            if copy_status != "OK":
                results.append(FixResult(uid=uid, to=to_header, subject=subject, action="partial", note="copied_failed_no_delete", old=old_name, new=new_name))
                continue
            store_status, _store_data = client.uid("STORE", uid, "+FLAGS.SILENT", r"(\Deleted)")
            if store_status != "OK":
                results.append(FixResult(uid=uid, to=to_header, subject=subject, action="partial", note="delete_flag_failed", old=old_name, new=new_name))
                continue
            try:
                client.expunge()
            except Exception:
                pass

            results.append(FixResult(uid=uid, to=to_header, subject=subject, action="fixed", note="patched_greeting", old=old_name, new=new_name))
    finally:
        try:
            client.logout()
        except Exception:
            pass

    fixed = sum(1 for r in results if r.action == "fixed")
    skipped = sum(1 for r in results if r.action in {"skip", "dry_run"})
    errors = sum(1 for r in results if r.action in {"error", "partial"})

    lines: list[str] = []
    lines.append("# Fix Draft Greeting Names (Slug/ID Leak)")
    lines.append(f"Date: {today}")
    lines.append("")
    lines.append(f"- QA source: `{qa_path.as_posix()}`")
    lines.append(f"- Drafts mailbox: `{args.drafts_folder}`")
    lines.append(f"- Trash mailbox: `{args.trash_folder}`")
    lines.append(f"- Dry run: `{args.dry_run}`")
    if not args.dry_run:
        lines.append(f"- Backups: `{backup_dir.as_posix()}`")
    if args.limit:
        lines.append(f"- Limit: {args.limit}")
    lines.append("")
    lines.append(f"- Checked: {len(qa_drafts)}")
    lines.append(f"- Fixed: {fixed}")
    lines.append(f"- Skipped: {skipped}")
    lines.append(f"- Errors/Partial: {errors}")
    lines.append("")
    lines.append("| UID | To | Subject | Action | Old Greeting | New Greeting | Note |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- |")
    for r in results:
        lines.append(f"| {r.uid} | {r.to} | {r.subject} | {r.action} | {r.old} | {r.new} | {r.note} |")
    lines.append("")
    report_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote: {report_path}")


if __name__ == "__main__":
    main()
