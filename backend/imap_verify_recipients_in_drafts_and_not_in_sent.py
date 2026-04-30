from __future__ import annotations

import argparse
import imaplib
import os
import re
import ssl
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path


REPO_ROOT = Path(".")
REPORTS_DIR = REPO_ROOT / "reports"

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


def parse_recipients_from_draft_creation_report(path: Path) -> list[str]:
    """
    Parse recipients from reports produced by:
      scripts/maintenance/create_first_contact_drafts_from_table_queue_live_imap.py
    """
    text = path.read_text(encoding="utf-8", errors="ignore")
    out: list[str] = []
    for line in text.splitlines():
        s = line.strip()
        # Example:
        # - 268 ACRIV8 ADAS CO: drafted -> info@houstonkartingcomplex.com (Subject...)
        if "drafted ->" not in s:
            continue
        m = re.search(r"drafted\s*->\s*([^\s(]+)", s, flags=re.IGNORECASE)
        if not m:
            continue
        for e in EMAIL_RE.findall(m.group(1)):
            out.append(e.lower())
    # Dedup stable order
    seen: set[str] = set()
    uniq: list[str] = []
    for e in out:
        if e in seen:
            continue
        seen.add(e)
        uniq.append(e)
    return uniq


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


def latest_internaldate(client: imaplib.IMAP4_SSL, mailbox: str, ids: set[bytes]) -> str:
    if not ids:
        return ""
    client.select(mailbox, readonly=True)
    latest: datetime | None = None
    for mid in list(ids)[:40]:
        try:
            typ, data = client.fetch(mid, "(INTERNALDATE)")
        except Exception:
            continue
        if typ != "OK" or not data:
            continue
        for item in data:
            if not isinstance(item, tuple):
                continue
            s = item[0].decode("utf-8", errors="ignore")
            m = re.search(r'INTERNALDATE\s+"([^"]+)"', s)
            if not m:
                continue
            try:
                dt = datetime.strptime(m.group(1), "%d-%b-%Y %H:%M:%S %z")
            except Exception:
                continue
            if latest is None or dt > latest:
                latest = dt
    return latest.isoformat() if latest else ""


@dataclass(frozen=True)
class Result:
    email: str
    drafts_hits: int
    drafts_latest: str
    sent_hits: int
    sent_latest: str


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify specific recipients exist in Drafts and do not exist in Sent via IMAP.")
    parser.add_argument("--report", required=True, help="Path to a draft creation report containing 'drafted -> <email>' lines.")
    parser.add_argument("--imap-host", default="imap.hostinger.com")
    parser.add_argument("--imap-port", type=int, default=993)
    parser.add_argument("--imap-user", default="fred@mccullough.digital")
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--drafts-folder", default="INBOX.Drafts")
    parser.add_argument("--sent-folder", default="INBOX.Sent")
    parser.add_argument("--out", default="", help="Output report path (default: reports/imap-verify-drafts-not-sent-<date>.md)")
    args = parser.parse_args()

    report_path = Path(args.report)
    if not report_path.exists():
        raise SystemExit(f"Missing report: {report_path.as_posix()}")

    recipients = parse_recipients_from_draft_creation_report(report_path)
    if not recipients:
        raise SystemExit("No recipients parsed from the provided report.")

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    ctx = ssl.create_default_context()
    client = imaplib.IMAP4_SSL(args.imap_host, args.imap_port, ssl_context=ctx)
    results: list[Result] = []
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

        for email_addr in recipients:
            d_ids = imap_search_recipient(client, drafts_box, email_addr)
            s_ids = imap_search_recipient(client, sent_box, email_addr)
            results.append(
                Result(
                    email=email_addr,
                    drafts_hits=len(d_ids),
                    drafts_latest=latest_internaldate(client, drafts_box, d_ids),
                    sent_hits=len(s_ids),
                    sent_latest=latest_internaldate(client, sent_box, s_ids),
                )
            )
    finally:
        try:
            client.logout()
        except Exception:
            pass

    out_path = Path(args.out) if args.out else (REPORTS_DIR / f"imap-verify-drafts-not-sent-{date.today().isoformat()}.md")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    lines.append("# IMAP Verify: Drafted Recipients Not In Sent")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append(f"Source report: `{report_path.as_posix()}`")
    lines.append("")
    lines.append("| Email | Drafts Hits | Drafts Latest | Sent Hits | Sent Latest |")
    lines.append("| --- | --- | --- | --- | --- |")
    for r in results:
        lines.append(f"| {r.email} | {r.drafts_hits} | {r.drafts_latest} | {r.sent_hits} | {r.sent_latest} |")
    lines.append("")
    ok = [r for r in results if r.drafts_hits > 0 and r.sent_hits == 0]
    bad = [r for r in results if not (r.drafts_hits > 0 and r.sent_hits == 0)]
    lines.append("## Summary")
    lines.append(f"- Recipients checked: {len(results)}")
    lines.append(f"- OK (in Drafts, not in Sent): {len(ok)}")
    lines.append(f"- Needs attention: {len(bad)}")
    lines.append("")
    if bad:
        lines.append("## Needs Attention")
        for r in bad:
            lines.append(f"- {r.email}: drafts={r.drafts_hits}, sent={r.sent_hits}")
        lines.append("")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(out_path.as_posix())


if __name__ == "__main__":
    main()

