#!/usr/bin/env python3
"""
Check whether pages include a <meta name="viewport" ...> tag.

Use: quick outreach triage when deciding if "missing mobile viewport" is a
credible, high-impact first-contact note.
"""

from __future__ import annotations

import argparse
import re
import ssl
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from urllib.request import Request, urlopen


RE_VIEWPORT = re.compile(r"<meta[^>]+name=[\"']viewport[\"']", re.I)
RE_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)


def ua() -> str:
    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"


@dataclass(frozen=True)
class Result:
    url: str
    final_url: str
    code: int | None
    has_viewport: bool
    title: str
    err: str


def fetch(url: str, timeout_s: int) -> Result:
    u = url.strip()
    if u and not u.startswith("http"):
        u = "https://" + u

    ctx = ssl.create_default_context()
    req = Request(u, headers={"User-Agent": ua()})
    try:
        with urlopen(req, timeout=timeout_s, context=ctx) as resp:
            final_url = resp.geturl()
            code = getattr(resp, "status", None) or getattr(resp, "code", None)
            body = resp.read(350_000)
            text = body.decode("utf-8", "replace")
            has_vp = bool(RE_VIEWPORT.search(text))
            title = ""
            m = RE_TITLE.search(text)
            if m:
                title = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", m.group(1))).strip()[:90]
            return Result(url=u, final_url=final_url, code=int(code) if code else None, has_viewport=has_vp, title=title, err="")
    except Exception as e:
        return Result(url=u, final_url="", code=None, has_viewport=False, title="", err=f"{type(e).__name__}: {str(e)[:200]}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("url", nargs="+")
    ap.add_argument("--timeout", type=int, default=25)
    ap.add_argument("--out", default="", help="Optional markdown output path")
    args = ap.parse_args()

    rows = [fetch(u, args.timeout) for u in args.url]

    lines: list[str] = []
    lines.append("# Viewport Meta Check")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append("")
    lines.append("| url | final | code | viewport meta | title / note |")
    lines.append("|---|---|---:|---|---|")
    for r in rows:
        vp = "yes" if r.has_viewport else "no"
        note = r.title or r.err
        # Escape pipe chars
        def esc(s: str) -> str:
            return (s or "").replace("|", "\\|")

        lines.append(f"| {esc(r.url)} | {esc(r.final_url)} | {r.code or ''} | {vp} | {esc(note)} |")

    out = "\n".join(lines) + "\n"
    if args.out:
        Path(args.out).write_text(out, encoding="utf-8")
    else:
        print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

