#!/usr/bin/env python3
"""Run bounded Playwright website search against blocked address candidates."""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "tmp" / "blocked-address-search-candidates" / "latest" / "kept.json"
DEFAULT_OUTPUT_BASE = ROOT / "tmp" / "blocked-address-search-runs"


def load_searcher():
    import sys

    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from scripts.playwright_search import CompanySearcher  # pylint: disable=import-outside-toplevel

    return CompanySearcher


def host_for(url: str | None) -> str:
    if not url:
        return ""
    raw = url.strip()
    if "://" not in raw:
        raw = f"https://{raw}"
    try:
        return urlparse(raw).netloc.lower()
    except Exception:
        return ""


def clean_name(raw: str) -> str:
    text = raw.strip()
    text = re.sub(r"^\d+-", "", text)
    text = re.sub(r"^Lead Profile:\s*", "", text, flags=re.IGNORECASE)
    text = text.replace("-", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def infer_city_hint(row: dict[str, Any]) -> str:
    haystack = " ".join(
        str(row.get(field) or "")
        for field in ("name", "website", "observations", "snapshot", "title")
    ).lower()
    if "conroe" in haystack:
        return "Conroe TX"
    if "houston" in haystack:
        return "Houston TX"
    if "missouri city" in haystack:
        return "Missouri City TX"
    return "Texas"


def classify_result(row: dict[str, Any], result: dict[str, Any]) -> str:
    found_url = result.get("website_url")
    if not found_url:
        return "no_candidate"
    original_host = host_for(row.get("website"))
    found_host = host_for(found_url)
    if not found_host:
        return "bad_candidate"
    if found_host == original_host:
        return "same_domain_recovered"
    return "new_domain_candidate"


async def run_slice(rows: list[dict[str, Any]], output_dir: Path) -> list[dict[str, Any]]:
    CompanySearcher = load_searcher()
    searcher = CompanySearcher(
        config={
            "search_engine": "bing",
            "headless": True,
            "delay_between_searches": (4, 7),
            "max_results_per_search": 8,
        }
    )
    results: list[dict[str, Any]] = []
    await searcher.launch_browser()
    try:
        for row in rows:
            query_name = clean_name(row["name"])
            city_hint = infer_city_hint(row)
            result = await searcher.process_company(query_name, city_hint)
            classified = classify_result(row, result)
            combined = {
                "lead_id": row["lead_id"],
                "lead_name": row["name"],
                "query_name": query_name,
                "city_hint": city_hint,
                "original_website": row.get("website"),
                "original_host": row.get("host") or host_for(row.get("website")),
                "search_score": row.get("search_score", 0),
                "classification": classified,
                **result,
            }
            results.append(combined)
            await asyncio.sleep(2)
    finally:
        await searcher.close_browser()

    (output_dir / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    with (output_dir / "results.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "lead_id",
                "lead_name",
                "query_name",
                "city_hint",
                "original_website",
                "original_host",
                "search_score",
                "classification",
                "website_url",
                "contact_page_url",
                "error",
            ],
        )
        writer.writeheader()
        for row in results:
            writer.writerow(
                {
                    "lead_id": row["lead_id"],
                    "lead_name": row["lead_name"],
                    "query_name": row["query_name"],
                    "city_hint": row["city_hint"],
                    "original_website": row["original_website"],
                    "original_host": row["original_host"],
                    "search_score": row["search_score"],
                    "classification": row["classification"],
                    "website_url": row.get("website_url"),
                    "contact_page_url": row.get("contact_page_url"),
                    "error": row.get("error"),
                }
            )
    return results


def write_summary(results: list[dict[str, Any]], output_dir: Path) -> None:
    from collections import Counter

    summary = {
        "results_path": str(output_dir / "results.json"),
        "count": len(results),
        "classifications": Counter(row["classification"] for row in results),
        "website_found": sum(1 for row in results if row.get("website_url")),
        "contact_found": sum(1 for row in results if row.get("contact_page_url")),
    }
    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    print(json.dumps(summary, indent=2, default=str))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_BASE)
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--lead-id", type=int, nargs="*")
    args = parser.parse_args()

    with args.input.open("r", encoding="utf-8") as handle:
        rows: list[dict[str, Any]] = json.load(handle)

    if args.lead_id:
        wanted = set(args.lead_id)
        rows = [row for row in rows if int(row["lead_id"]) in wanted]
    else:
        rows = rows[args.offset : args.offset + args.limit]

    run_dir = args.output_dir / datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir.mkdir(parents=True, exist_ok=True)
    results = asyncio.run(run_slice(rows, run_dir))
    write_summary(results, run_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
