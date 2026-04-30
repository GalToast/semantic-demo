#!/usr/bin/env python3
"""
Filter reachable website-address candidates down to likely official location pages.
"""

from __future__ import annotations

import argparse
import json
import re
import urllib.parse
from collections import Counter
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = REPO_ROOT / "tmp" / "website-address-queue-splits" / "20260402-184539" / "reachable.json"
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "tmp" / "website-address-official-location"

BAD_HOST_SUBSTRINGS = {
    "bizapedia.com",
    "wikipedia.org",
    "mapquest.com",
    "bbb.org",
    "facebook.com",
    "storeshours.com",
    "mallsandoutlets.com",
    "quicktransportsolutions.com",
    "nameberry.com",
    "irishionary.com",
    "cplusplus.com",
    "businessyab.com",
}

GOOD_PATH_HINTS = (
    "/location/",
    "/locations/",
    "/contact",
    "/about",
    "/conroe",
    "/cleveland",
    "/tx/",
    "/texas/",
)

GENERIC_NAME_TOKENS = {
    "lead",
    "profile",
    "llc",
    "inc",
    "co",
    "company",
    "corp",
    "corporation",
    "ltd",
    "lp",
    "pllc",
    "the",
    "and",
    "of",
    "services",
    "service",
    "group",
    "holding",
    "holdings",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Filter likely official location pages from reachable queue.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="Reachable queue JSON path.")
    parser.add_argument("--output-root", default=None, help="Optional output directory.")
    return parser.parse_args()


def normalize_name(name: str) -> set[str]:
    cleaned = re.sub(r"(?i)^lead profile:\s*", "", name or "").lower()
    tokens = re.findall(r"[a-z0-9]+", cleaned)
    return {token for token in tokens if token not in GENERIC_NAME_TOKENS and len(token) > 2}


def host_and_path(url: str) -> tuple[str, str]:
    parsed = urllib.parse.urlparse(url or "")
    return (parsed.netloc or "").lower(), (parsed.path or "").lower()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input)
    rows = json.loads(input_path.read_text(encoding="utf-8"))

    host_counts = Counter()
    for row in rows:
        host, _ = host_and_path(row.get("normalized_website") or row.get("website") or "")
        host_counts[host] += 1

    kept: list[dict] = []
    rejected: list[dict] = []

    for row in rows:
        url = row.get("normalized_website") or row.get("website") or ""
        host, path = host_and_path(url)
        name_tokens = normalize_name(str(row.get("name") or row.get("title") or ""))
        host_text = host.replace("www.", "")
        host_token_matches = sum(1 for token in name_tokens if token in host_text)
        path_token_matches = sum(1 for token in name_tokens if token in path)
        bad_host = any(part in host for part in BAD_HOST_SUBSTRINGS)
        path_hint = any(hint in path for hint in GOOD_PATH_HINTS)
        duplicate_host = host_counts[host] > 1
        registered_entity = str(row.get("batch") or "").startswith("registered-entities-batch-")
        observations = str(row.get("observations") or "").lower()

        reason = None
        if bad_host:
            reason = "bad_host"
        elif "domain-to-lead mismatch" in observations or "wrong-domain mapping" in observations:
            reason = "known_domain_identity_mismatch"
        elif duplicate_host and not path_hint and host_token_matches == 0 and path_token_matches == 0:
            reason = "duplicate_host_without_location_hint"
        elif registered_entity and host_token_matches == 0 and path_token_matches == 0 and not path_hint:
            reason = "registered_entity_without_official_location_hint"

        enriched = dict(row)
        enriched["host"] = host
        enriched["path"] = path
        enriched["host_token_matches"] = host_token_matches
        enriched["path_token_matches"] = path_token_matches
        enriched["path_hint"] = path_hint
        enriched["duplicate_host"] = duplicate_host

        if reason:
            enriched["reject_reason"] = reason
            rejected.append(enriched)
        else:
            kept.append(enriched)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_root = Path(args.output_root) if args.output_root else DEFAULT_OUTPUT_ROOT / timestamp
    output_root.mkdir(parents=True, exist_ok=True)
    (output_root / "kept.json").write_text(json.dumps(kept, indent=2), encoding="utf-8")
    (output_root / "rejected.json").write_text(json.dumps(rejected, indent=2), encoding="utf-8")
    summary = {
        "input": str(input_path),
        "total": len(rows),
        "kept": len(kept),
        "rejected": len(rejected),
        "output_root": str(output_root),
    }
    (output_root / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
