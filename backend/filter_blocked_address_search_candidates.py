#!/usr/bin/env python3
"""Filter blocked website-address rows down to search-worthy official candidates."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "tmp" / "website-address-queue-splits" / "20260402-184539" / "blocked.json"
DEFAULT_OUTPUT_BASE = ROOT / "tmp" / "blocked-address-search-candidates"

REJECT_HOSTS = {
    "",
    "www.superpages.com",
    "www.angi.com",
    "www.etsy.com",
    "www.zhihu.com",
    "bicycles.stackexchange.com",
    "wikizilla.org",
    "npiprofile.com",
    "healthprovidersdata.com",
    "quickbooks.intuit.com",
    "www.jlaforums.com",
    "start.cortera.com",
    "www.corporationwiki.com",
    "www.yelp.com",
    "www.foodnetwork.com",
    "www.jcmasonry.trustab.org",
}

REJECT_HOST_SUBSTRINGS = {
    "bizapedia",
    "corporationwiki",
    "superpages",
    "yellowpages",
    "mapquest",
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "twitter.com",
    "reddit.com",
    "quora.com",
    "zhihu.com",
    "etsy.com",
    "wikipedia.org",
    "wikizilla.org",
    "stackexchange.com",
    "trustab.org",
    "npiprofile.com",
    "healthprovidersdata.com",
    "quickbooks.intuit.com",
    "jlaforums.com",
    "cortera.com",
    "yelp.com",
    "foodnetwork.com",
    "angi.com",
}

REJECT_OBSERVATION_SUBSTRINGS = {
    "identity unresolved",
    "conflicting businesses",
    "wrong-domain mapping",
    "domain-to-lead mismatch",
    "no safe official business match",
}

KEEP_OBSERVATION_SUBSTRINGS = {
    "website verified",
    "official website",
    "official domain is active",
    "retain mapping",
    "verified official company website",
}


def load_rows(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def host_for(url: str | None) -> str:
    if not url:
        return ""
    raw = url.strip()
    if not raw:
        return ""
    if "://" not in raw:
        raw = f"https://{raw}"
    try:
        return urlparse(raw).netloc.lower()
    except Exception:
        return ""


def observation_text(row: dict[str, Any]) -> str:
    return (row.get("observations") or "").lower()


def reject_reason(row: dict[str, Any], host: str) -> str | None:
    if host in REJECT_HOSTS:
        return "reject_known_junk_host"
    if any(snippet in host for snippet in REJECT_HOST_SUBSTRINGS):
        return "reject_host_pattern"
    obs = observation_text(row)
    if any(snippet in obs for snippet in REJECT_OBSERVATION_SUBSTRINGS):
        return "reject_observation_conflict"
    if not host:
        return "reject_missing_host"
    return None


def score_row(row: dict[str, Any], host: str) -> int:
    score = 0
    obs = observation_text(row)
    website = (row.get("website") or "").lower()
    reason = row.get("reason") or ""
    if any(snippet in obs for snippet in KEEP_OBSERVATION_SUBSTRINGS):
        score += 3
    if any(token in website for token in ("/conroe/", "tx474", "txho6", "/store242", "/locations/", "/details/")):
        score += 2
    if host.count(".") <= 2:
        score += 1
    if reason in {"http_403", "http_fallback_403"}:
        score += 1
    if reason == "dns_ok_but_unreachable":
        score += 1
    return score


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_BASE)
    args = parser.parse_args()

    rows = load_rows(args.input)
    run_dir = args.output_dir / datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir.mkdir(parents=True, exist_ok=True)

    kept: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []

    for row in rows:
        host = host_for(row.get("website"))
        decision = reject_reason(row, host)
        enriched = {
            **row,
            "host": host,
        }
        if decision:
            rejected.append({**enriched, "filter_decision": decision, "search_score": 0})
            continue
        score = score_row(row, host)
        kept.append({**enriched, "filter_decision": "keep_search_candidate", "search_score": score})

    kept.sort(key=lambda row: (-int(row["search_score"]), int(row["lead_id"])))
    rejected.sort(key=lambda row: (row["filter_decision"], int(row["lead_id"])))

    summary = {
        "input_path": str(args.input),
        "run_dir": str(run_dir),
        "total_rows": len(rows),
        "kept_rows": len(kept),
        "rejected_rows": len(rejected),
        "kept_hosts_top20": Counter(row["host"] for row in kept).most_common(20),
        "rejected_reasons": Counter(row["filter_decision"] for row in rejected),
        "kept_reason_counts": Counter(row.get("reason") for row in kept),
    }

    (run_dir / "kept.json").write_text(json.dumps(kept, indent=2), encoding="utf-8")
    (run_dir / "rejected.json").write_text(json.dumps(rejected, indent=2), encoding="utf-8")
    (run_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")

    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
