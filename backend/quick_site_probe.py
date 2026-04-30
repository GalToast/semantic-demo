#!/usr/bin/env python3
"""
Quick, low-risk site probe to find an outreach-worthy concrete note:
- follow redirects
- check a few common contact paths
- detect forms / mailto / password walls / obvious 404 text
- optionally report common security headers presence via HEAD

This is intentionally shallow and does not attempt to bypass bot protection.
"""

from __future__ import annotations

import argparse
import re
import ssl
from dataclasses import dataclass
from typing import Iterable
from urllib.parse import urljoin
from urllib.request import Request, urlopen


SECURITY_HEADERS = [
    "strict-transport-security",
    "content-security-policy",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
    "x-content-type-options",
]


_RE_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
_RE_FORM = re.compile(r"<form\b", re.I)
_RE_MAILTO = re.compile(r"mailto:", re.I)
_RE_PW = re.compile(r"password\s*protected|enter\s*password", re.I)
_RE_404 = re.compile(r"page\s+not\s+found|\b404\b", re.I)


def _ua() -> str:
    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"


@dataclass(frozen=True)
class FetchResult:
    ok: bool
    url: str
    final_url: str
    code: int | None
    headers: dict[str, str]
    text: str
    err: str


def fetch_get(url: str, timeout_s: int) -> FetchResult:
    ctx = ssl.create_default_context()
    req = Request(url, headers={"User-Agent": _ua()})
    try:
        with urlopen(req, timeout=timeout_s, context=ctx) as resp:
            final_url = resp.geturl()
            headers = {k.lower(): v for k, v in resp.headers.items()}
            code = getattr(resp, "status", None) or getattr(resp, "code", None)
            body = resp.read(400_000)
            ct = headers.get("content-type", "")
            charset = "utf-8"
            m = re.search(r"charset=([^;]+)", ct, re.I)
            if m:
                charset = m.group(1).strip()
            try:
                text = body.decode(charset, "replace")
            except Exception:
                text = body.decode("utf-8", "replace")
            return FetchResult(True, url, final_url, int(code) if code else None, headers, text, "")
    except Exception as e:
        return FetchResult(False, url, "", None, {}, "", f"{type(e).__name__}: {str(e)[:200]}")


def fetch_head(url: str, timeout_s: int) -> tuple[bool, str, int | None, dict[str, str], str]:
    ctx = ssl.create_default_context()
    req = Request(url, method="HEAD", headers={"User-Agent": _ua()})
    try:
        with urlopen(req, timeout=timeout_s, context=ctx) as resp:
            final_url = resp.geturl()
            headers = {k.lower(): v for k, v in resp.headers.items()}
            code = getattr(resp, "status", None) or getattr(resp, "code", None)
            return True, final_url, int(code) if code else None, headers, ""
    except Exception as e:
        return False, "", None, {}, f"{type(e).__name__}: {str(e)[:200]}"


def contact_candidates(base_url: str) -> list[str]:
    base = base_url.rstrip("/")
    return [
        base + "/",
        urljoin(base + "/", "contact"),
        urljoin(base + "/", "contact/"),
        urljoin(base + "/", "contact-us"),
        urljoin(base + "/", "contact-us/"),
        urljoin(base + "/", "pages/contact"),
        urljoin(base + "/", "pages/contact-us"),
    ]


def summarize_page(text: str) -> dict[str, object]:
    title = ""
    m = _RE_TITLE.search(text or "")
    if m:
        title = re.sub(r"\\s+", " ", re.sub(r"<[^>]+>", "", m.group(1))).strip()[:90]
    return {
        "title": title,
        "has_form": bool(_RE_FORM.search(text or "")),
        "has_mailto": bool(_RE_MAILTO.search(text or "")),
        "looks_pw": bool(_RE_PW.search(text or "")),
        "looks_404": bool(_RE_404.search(text or "")),
    }


def norm_url(u: str) -> str:
    u = u.strip()
    if not u:
        return u
    if not u.startswith("http"):
        return "https://" + u
    return u


def run_for_site(site: str, timeout_s: int, include_headers: bool) -> None:
    site = norm_url(site)
    print(f"\n## {site}")

    if include_headers:
        ok, final, code, hdrs, err = fetch_head(site, timeout_s)
        if ok:
            print(f"HEAD: {code} final={final}")
            for h in SECURITY_HEADERS:
                print(f"- {h}: {'present' if h in hdrs else 'missing'}")
        else:
            print(f"HEAD: ERR {err}")

    for u in contact_candidates(site):
        r = fetch_get(u, timeout_s)
        if not r.ok:
            print(f"- GET ERR {u}")
            print(f"  {r.err}")
            continue
        meta = summarize_page(r.text)
        print(f"- GET {r.code} {u}")
        print(
            f"  final={r.final_url} form={meta['has_form']} mailto={meta['has_mailto']} "
            f"pw={meta['looks_pw']} notfound={meta['looks_404']} title={meta['title']}"
        )


def main(argv: Iterable[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("site", nargs="+", help="One or more base URLs (with or without scheme)")
    ap.add_argument("--timeout", type=int, default=20)
    ap.add_argument("--headers", action="store_true", help="Also report common security headers presence via HEAD")
    args = ap.parse_args(argv)

    for s in args.site:
        run_for_site(s, args.timeout, args.headers)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
