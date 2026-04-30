from __future__ import annotations

import argparse
import email
import imaplib
import json
import os
import re
from datetime import date
from html import unescape
from pathlib import Path


EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
ANCHOR_RE = re.compile(
    r"<a\b[^>]*\bhref\s*=\s*(?:\"([^\"]+)\"|'([^']+)'|([^\s>]+))[^>]*>(.*?)</a>",
    flags=re.IGNORECASE | re.DOTALL,
)
TAG_RE = re.compile(r"<[^>]+>")


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


def low(s: str | None) -> str:
    return (s or "").strip().lower()


def html_to_text(html: str) -> str:
    stripped = TAG_RE.sub(" ", html or "")
    return re.sub(r"\s+", " ", unescape(stripped)).strip()


def extract_parts(msg: email.message.Message) -> tuple[str, str]:
    text_plain = ""
    text_html = ""
    if msg.is_multipart():
        for part in msg.walk():
            ctype = low(part.get_content_type())
            disp = low(part.get("Content-Disposition"))
            if disp.startswith("attachment"):
                continue
            payload = part.get_payload(decode=True)
            if not payload:
                continue
            charset = part.get_content_charset() or "utf-8"
            try:
                decoded = payload.decode(charset, errors="replace")
            except Exception:
                decoded = payload.decode("utf-8", errors="replace")
            if ctype == "text/plain" and not text_plain:
                text_plain = decoded
            elif ctype == "text/html" and not text_html:
                text_html = decoded
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            try:
                decoded = payload.decode(charset, errors="replace")
            except Exception:
                decoded = payload.decode("utf-8", errors="replace")
            if low(msg.get_content_type()) == "text/html":
                text_html = decoded
            else:
                text_plain = decoded
    return (text_plain or "").strip(), (text_html or "").strip()


def main() -> None:
    parser = argparse.ArgumentParser(description="Dump a single IMAP message (Drafts/Sent) by UID for debugging.")
    parser.add_argument("--host", default="imap.hostinger.com")
    parser.add_argument("--port", type=int, default=993)
    parser.add_argument("--user", required=True)
    parser.add_argument("--pass-env", default="IMAP_PASS")
    parser.add_argument("--mailbox", default="INBOX.Drafts")
    parser.add_argument("--uid", required=True, help="IMAP UID (as shown in our IMAP export scripts).")
    parser.add_argument("--out", default=None, help="Output JSON path (default: tmp/imap-dump-<mailbox>-<uid>-YYYY-MM-DD.json)")
    args = parser.parse_args()

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    client = imaplib.IMAP4_SSL(args.host, args.port)
    try:
        client.login(args.user, password)
        status, _ = client.select(args.mailbox, readonly=True)
        if status != "OK":
            raise SystemExit(f"Failed to select mailbox: {args.mailbox}")
        status, msg_data = client.uid("fetch", args.uid, "(RFC822)")
        if status != "OK" or not msg_data:
            raise SystemExit("Fetch failed")

        raw = None
        for chunk in msg_data:
            if isinstance(chunk, tuple):
                raw = chunk[1]
                break
        if not raw:
            raise SystemExit("Missing message bytes")

        msg = email.message_from_bytes(raw)
        text_plain, text_html = extract_parts(msg)
        text_scan = text_plain or html_to_text(text_html)

        anchors = []
        for g1, g2, g3, inner in ANCHOR_RE.findall(text_html or ""):
            href = (g1 or g2 or g3 or "").strip()
            if not href:
                continue
            anchors.append({"href": href, "text": html_to_text(inner)[:120]})

        out = {
            "date": date.today().isoformat(),
            "mailbox": args.mailbox,
            "uid": args.uid,
            "headers": dict(msg),
            "body_summary": {
                "has_text_plain": bool(text_plain),
                "has_text_html": bool(text_html),
                "text_full": text_plain,
                "html_full": text_html,
                "text_tail_600": (text_plain[-600:] if text_plain else ""),
                "html_tail_600": (text_html[-600:] if text_html else ""),
                "scan_tail_600": text_scan[-600:],
            },
            "anchors": anchors[:25],
            "contains_mccullough_digital": ("mccullough.digital" in low(text_plain + "\n" + text_html)),
            "recipient_emails": sorted({e.lower() for e in EMAIL_RE.findall(msg.get("To", "") or "")}),
        }
    finally:
        try:
            client.logout()
        except Exception:
            pass

    today = date.today().isoformat()
    safe_box = re.sub(r"[^A-Za-z0-9_.-]+", "_", args.mailbox)
    out_path = Path(args.out) if args.out else Path("tmp") / f"imap-dump-{safe_box}-{args.uid}-{today}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Wrote: {out_path}")


if __name__ == "__main__":
    main()

