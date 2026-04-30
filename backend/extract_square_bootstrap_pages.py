#!/usr/bin/env python3
"""
Extract Square Online bootstrap state from a published site and print page routes.

Why:
- Square sites often render nav/routes client-side, so "guessing" contact URLs like
  /contact-us can be wrong. This script pulls the embedded bootstrap JSON so we can
  see the actual `pagesMeta` routes without browser automation.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request


UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"


BOOT_RE = re.compile(r"window\.__BOOTSTRAP_STATE__\s*=\s*(\{.*?\})\s*;", re.DOTALL)


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
    # Best-effort decode: Square pages are typically utf-8.
    return data.decode("utf-8", errors="replace")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("url", help="Published Square Online site URL (e.g. https://example.com/).")
    args = ap.parse_args()

    html = fetch(args.url)
    m = BOOT_RE.search(html)
    if not m:
        print("ERROR: Could not find window.__BOOTSTRAP_STATE__ JSON in page HTML.", file=sys.stderr)
        return 2

    raw_json = m.group(1)
    try:
        state = json.loads(raw_json)
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse bootstrap JSON: {e}", file=sys.stderr)
        return 3

    pages = state.get("siteData", {}).get("pagesMeta", [])
    if not isinstance(pages, list) or not pages:
        print("No pagesMeta found in bootstrap state.")
        return 0

    print(f"Pages ({len(pages)}):")
    for p in pages:
        if not isinstance(p, dict):
            continue
        name = p.get("name") or ""
        route = p.get("route") or ""
        hidden = p.get("hidden")
        # Routes are typically appended to root: https://site/<route>
        print(f"- {name} | /{route} | hidden={hidden}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

