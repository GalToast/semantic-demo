#!/usr/bin/env python3
"""parity-remap-local.py — rewrite baseUrl 127.0.0.1:8788 -> 8789.

Reads a model-providers.json, rewrites ONLY router-lane baseUrl fields, and
writes to a new file. Direct external APIs are untouched.

Usage: python3 parity-remap-local.py <input.json> <output.json>
"""

import json
import sys


def main() -> int:
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as fh:
        d = json.load(fh)
    changed = 0
    mp = d.get("modelProviders", d)
    for rows in mp.values() if isinstance(mp, dict) else []:
        if not isinstance(rows, list):
            continue
        for entry in rows:
            if not isinstance(entry, dict):
                continue
            url = entry.get("baseUrl")
            if isinstance(url, str) and "127.0.0.1:8788" in url:
                entry["baseUrl"] = url.replace("127.0.0.1:8788", "127.0.0.1:8789")
                changed += 1
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(d, fh, indent=2, ensure_ascii=False)
    print(f"baseUrl rewrites: {changed}")
    return 0


if __name__ == "__main__":
    sys.exit(main() if len(sys.argv) == 3 else 2)
