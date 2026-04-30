from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Summarize audit enrichment import reports.")
    parser.add_argument("--report", required=True, help="Path to audit-enrichment-import-*.json report.")
    return parser.parse_args()


def count_items(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    counter = Counter()
    for row in rows:
        for item in row.get(key, []):
            counter[str(item.get("target") or item.get("reason") or "unknown")] += 1
    return dict(sorted(counter.items()))


def count_field(rows: list[dict[str, Any]], key: str, field: str) -> dict[str, int]:
    counter = Counter()
    for row in rows:
        for item in row.get(key, []):
            counter[str(item.get(field) or "unknown")] += 1
    return dict(sorted(counter.items()))


def main() -> None:
    args = parse_args()
    path = Path(args.report)
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = list(data.get("leadResults") or [])

    accepted = sum(len(row.get("accepted", [])) for row in rows)
    skipped = sum(len(row.get("skipped", [])) for row in rows)

    summary = {
        "report": str(path.resolve()),
        "mode": data.get("mode"),
        "filesProcessed": data.get("filesProcessed"),
        "leadCount": len(rows),
        "ignoredCount": sum(1 for row in rows if row.get("extractionMode") == "ignored"),
        "leadCountWithAccepted": sum(1 for row in rows if row.get("accepted")),
        "leadCountWithSkipped": sum(1 for row in rows if row.get("skipped")),
        "acceptedCount": accepted,
        "skippedCount": skipped,
        "acceptedByTarget": count_items(rows, "accepted"),
        "acceptedByTrust": count_field(rows, "accepted", "trust_level"),
        "acceptedByField": count_field(rows, "accepted", "field"),
        "skippedByReason": count_field(rows, "skipped", "reason"),
        "skippedByTarget": count_items(rows, "skipped"),
        "extractionModes": dict(sorted(Counter(str(row.get("extractionMode") or "unknown") for row in rows).items())),
        "ignoredReasons": dict(sorted(Counter(str(row.get("ignoredReason") or "") for row in rows if row.get("ignoredReason")).items())),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
