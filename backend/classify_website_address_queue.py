#!/usr/bin/env python3
"""
Classify a website-address queue into reachable, blocked, and dead slices.

This keeps the expensive audit lane focused on sites that are most likely to
yield address data from live page content.
"""

from __future__ import annotations

import argparse
import json
import socket
import ssl
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


DEFAULT_INPUT = Path(r"C:\Users\HP\semantic-demo-export\website_address_queue.json")
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "tmp" / "website-address-queue-splits"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
)


@dataclass
class QueueItem:
    lead_id: int
    name: str
    website: str
    payload: dict[str, object]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Classify website queue by basic reachability.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="Queue JSON path.")
    parser.add_argument("--limit", type=int, default=None, help="Optional max rows to classify.")
    parser.add_argument("--offset", type=int, default=0, help="Optional rows to skip.")
    parser.add_argument("--timeout-seconds", type=int, default=8, help="Per-request timeout.")
    parser.add_argument(
        "--output-root",
        default=None,
        help="Optional output directory. Defaults to tmp/website-address-queue-splits/<timestamp>/",
    )
    return parser.parse_args()


def load_queue(path: Path) -> list[QueueItem]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    items: list[QueueItem] = []
    for row in payload:
        website = str(row.get("website") or "").strip()
        if not website:
            continue
        items.append(
            QueueItem(
                lead_id=int(row["lead_id"]),
                name=str(row.get("name") or row.get("title") or "").strip(),
                website=website,
                payload=row,
            )
        )
    return items


def normalize_url(url: str) -> str:
    value = url.strip()
    if not value:
        return value
    if "://" not in value:
        return f"https://{value}"
    return value


def dns_lookup(hostname: str, timeout_seconds: int) -> tuple[bool, list[str], str | None]:
    previous_timeout = socket.getdefaulttimeout()
    socket.setdefaulttimeout(timeout_seconds)
    try:
        infos = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
        addresses = sorted({info[4][0] for info in infos if info[4]})
        return bool(addresses), addresses, None
    except socket.gaierror as exc:
        return False, [], str(exc)
    finally:
        socket.setdefaulttimeout(previous_timeout)


def probe_url(url: str, timeout_seconds: int) -> tuple[bool, int | None, str | None]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(
            request,
            timeout=timeout_seconds,
            context=ssl.create_default_context(),
        ) as response:
            return True, int(response.status), None
    except urllib.error.HTTPError as exc:
        return True, int(exc.code), str(exc)
    except Exception as exc:  # noqa: BLE001
        return False, None, str(exc)


def classify_item(item: QueueItem, timeout_seconds: int) -> dict[str, object]:
    normalized_url = normalize_url(item.website)
    parsed = urllib.parse.urlparse(normalized_url)
    hostname = parsed.netloc or parsed.path
    hostname = hostname.split("@")[-1].split(":")[0].lower()

    dns_ok, addresses, dns_error = dns_lookup(hostname, timeout_seconds)
    record = dict(item.payload)
    record["normalized_website"] = normalized_url
    record["dns_ok"] = dns_ok
    record["dns_addresses"] = addresses
    record["dns_error"] = dns_error

    if not dns_ok:
        record["bucket"] = "dead"
        record["reason"] = "dns_failed"
        return record

    ok, status, error = probe_url(normalized_url, timeout_seconds)
    record["probe_status"] = status
    record["probe_error"] = error

    if ok and status is not None:
        if status in {403, 429}:
            record["bucket"] = "blocked"
            record["reason"] = f"http_{status}"
        elif status < 500:
            record["bucket"] = "reachable"
            record["reason"] = f"http_{status}"
        else:
            record["bucket"] = "blocked"
            record["reason"] = f"http_{status}"
        return record

    http_fallback = urllib.parse.urlunparse(("http", parsed.netloc, parsed.path, parsed.params, parsed.query, parsed.fragment))
    ok, status, error = probe_url(http_fallback, timeout_seconds)
    record["http_fallback_status"] = status
    record["http_fallback_error"] = error

    if ok and status is not None:
        if status in {403, 429}:
            record["bucket"] = "blocked"
            record["reason"] = f"http_fallback_{status}"
        elif status < 500:
            record["bucket"] = "reachable"
            record["reason"] = f"http_fallback_{status}"
        else:
            record["bucket"] = "blocked"
            record["reason"] = f"http_fallback_{status}"
    else:
        record["bucket"] = "blocked"
        record["reason"] = "dns_ok_but_unreachable"
    return record


def main() -> int:
    args = parse_args()
    input_path = Path(args.input)
    if not input_path.exists():
        raise SystemExit(f"Input queue not found: {input_path}")

    queue = load_queue(input_path)
    queue = queue[args.offset :]
    if args.limit is not None:
        queue = queue[: args.limit]
    if not queue:
        raise SystemExit("No queue rows selected.")

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_root = Path(args.output_root) if args.output_root else DEFAULT_OUTPUT_ROOT / timestamp
    output_root.mkdir(parents=True, exist_ok=True)

    rows = [classify_item(item, args.timeout_seconds) for item in queue]
    counts = Counter(row["bucket"] for row in rows)

    for bucket in ("reachable", "blocked", "dead"):
        bucket_rows = [row for row in rows if row["bucket"] == bucket]
        (output_root / f"{bucket}.json").write_text(json.dumps(bucket_rows, indent=2), encoding="utf-8")

    summary = {
        "input": str(input_path),
        "classified_at": timestamp,
        "total": len(rows),
        "counts": dict(counts),
        "output_root": str(output_root),
    }
    (output_root / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
