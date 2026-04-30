#!/usr/bin/env python3
"""
Summarize .eml backups (To/Subject + a short body snippet) into a markdown table.

Why: we often keep .eml backups when touching Hostinger drafts via IMAP, and
it's faster to review the real draft content from disk before deciding whether
to send/edit/hold.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from email import policy
from email.parser import BytesParser


def _extract_text_plain(msg) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            ctype = (part.get_content_type() or "").lower()
            disp = (part.get("Content-Disposition") or "").lower()
            if ctype == "text/plain" and "attachment" not in disp:
                try:
                    return part.get_content() or ""
                except Exception:
                    raw = part.get_payload(decode=True) or b""
                    charset = part.get_content_charset() or "utf-8"
                    return raw.decode(charset, "replace")
        return ""

    try:
        return msg.get_content() or ""
    except Exception:
        raw = msg.get_payload(decode=True) or b""
        charset = msg.get_content_charset() or "utf-8"
        return raw.decode(charset, "replace")


def _collapse_ws(s: str) -> str:
    s = s.replace("\r\n", "\n")
    return re.sub(r"\s+", " ", s).strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", help="Directory containing .eml backups or a single .eml file")
    ap.add_argument("--max-chars", type=int, default=240, help="Snippet length (default: 240)")
    args = ap.parse_args()

    p = Path(args.path)
    if not p.exists():
        raise SystemExit(f"not found: {p}")

    paths: list[Path]
    if p.is_dir():
        paths = sorted(p.glob("*.eml"), key=lambda x: x.name)
    else:
        paths = [p]

    print("| file | to | subject | body (first {} chars) |".format(args.max_chars))
    print("|---|---|---|---|")

    for eml in paths:
        msg = BytesParser(policy=policy.default).parsebytes(eml.read_bytes())
        to = (msg.get("to", "") or "").strip()
        subj = (msg.get("subject", "") or "").strip()
        body = _collapse_ws(_extract_text_plain(msg))
        snippet = body[: args.max_chars]

        def esc(x: str) -> str:
            return (x or "").replace("|", "\\|")

        print(f"| {esc(eml.name)} | {esc(to)} | {esc(subj)} | {esc(snippet)} |")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

