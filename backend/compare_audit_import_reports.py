from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REPORTS_DIR = REPO_ROOT / "reports"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compare two audit enrichment import reports and summarize regression/progression "
            "in accepted fills and review queue quality."
        )
    )
    parser.add_argument(
        "--previous",
        help="Older audit-enrichment-import-batch-*.json report. Defaults to the second newest batch report.",
    )
    parser.add_argument(
        "--current",
        help="Newer audit-enrichment-import-batch-*.json report. Defaults to the newest batch report.",
    )
    parser.add_argument(
        "--write-markdown",
        help="Optional markdown output path for a human-readable comparison report.",
    )
    return parser.parse_args()


def latest_batch_reports() -> list[Path]:
    return sorted(
        DEFAULT_REPORTS_DIR.glob("audit-enrichment-import-batch-*.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )


def pick_reports(args: argparse.Namespace) -> tuple[Path, Path]:
    if args.previous and args.current:
        return Path(args.previous), Path(args.current)

    reports = latest_batch_reports()
    if len(reports) < 2:
        raise SystemExit("Need at least two batch import reports to compare.")

    if args.current and not args.previous:
        current = Path(args.current)
        previous = next((path for path in reports if path.resolve() != current.resolve()), None)
        if previous is None:
            raise SystemExit("Could not find a distinct previous batch report.")
        return previous, current

    if args.previous and not args.current:
        previous = Path(args.previous)
        current = next((path for path in reports if path.resolve() != previous.resolve()), None)
        if current is None:
            raise SystemExit("Could not find a distinct current batch report.")
        return previous, current

    return reports[1], reports[0]


def load_report(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def count_field(items: list[dict[str, Any]], field: str) -> dict[str, int]:
    counter = Counter(str(item.get(field) or "unknown") for item in items)
    return dict(sorted(counter.items()))


def flatten(rows: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    flat: list[dict[str, Any]] = []
    for row in rows:
        for item in row.get(key, []) or []:
            flat.append(item)
    return flat


def summarize_report(report: dict[str, Any]) -> dict[str, Any]:
    rows = list(report.get("leadResults") or [])
    accepted = flatten(rows, "accepted")
    skipped = flatten(rows, "skipped")
    review = list(report.get("reviewQueue") or [])
    return {
        "filesProcessed": report.get("filesProcessed"),
        "leadCount": len(rows),
        "acceptedCount": len(accepted),
        "leadCountWithAccepted": sum(1 for row in rows if row.get("accepted")),
        "reviewQueueCount": len(review),
        "reviewLeadCount": len({row.get("leadId") for row in review}),
        "acceptedByField": count_field(accepted, "field"),
        "acceptedByTarget": count_field(accepted, "target"),
        "reviewByField": count_field(review, "field"),
        "reviewByTrust": count_field(review, "trust_level"),
        "skippedByReason": count_field(skipped, "reason"),
    }


def diff_counts(previous: dict[str, int], current: dict[str, int]) -> dict[str, int]:
    keys = sorted(set(previous) | set(current))
    return {key: current.get(key, 0) - previous.get(key, 0) for key in keys if current.get(key, 0) - previous.get(key, 0) != 0}


def accepted_signature(lead_id: Any, item: dict[str, Any]) -> tuple[str, str, str, str]:
    return (
        str(lead_id),
        str(item.get("field") or ""),
        str(item.get("target") or ""),
        json.dumps(item.get("value"), sort_keys=True),
    )


def diff_accepted(previous_report: dict[str, Any], current_report: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    previous_rows = list(previous_report.get("leadResults") or [])
    current_rows = list(current_report.get("leadResults") or [])

    previous_items = {
        accepted_signature(row.get("leadId"), item): {
            "leadId": row.get("leadId"),
            "field": item.get("field"),
            "target": item.get("target"),
            "value": item.get("value"),
        }
        for row in previous_rows
        for item in (row.get("accepted") or [])
    }
    current_items = {
        accepted_signature(row.get("leadId"), item): {
            "leadId": row.get("leadId"),
            "field": item.get("field"),
            "target": item.get("target"),
            "value": item.get("value"),
        }
        for row in current_rows
        for item in (row.get("accepted") or [])
    }

    lost = [previous_items[key] for key in sorted(previous_items.keys() - current_items.keys())]
    gained = [current_items[key] for key in sorted(current_items.keys() - previous_items.keys())]
    return lost, gained


def batch_id_from_path(path: Path) -> str:
    name = path.stem
    prefix = "audit-enrichment-import-batch-"
    if name.startswith(prefix):
        return name[len(prefix):]
    return name


def render_markdown(previous_path: Path, current_path: Path, previous: dict[str, Any], current: dict[str, Any], comparison: dict[str, Any]) -> str:
    prev_id = batch_id_from_path(previous_path)
    curr_id = batch_id_from_path(current_path)

    def line(label: str, previous_value: Any, current_value: Any) -> str:
        delta = current_value - previous_value if isinstance(previous_value, int) and isinstance(current_value, int) else None
        suffix = f" ({delta:+d})" if delta is not None else ""
        return f"- {label}: `{previous_value}` -> `{current_value}`{suffix}"

    lines = [
        "# Audit Import Regression Report",
        "",
        f"Previous report: `{previous_path.name}`",
        f"Current report: `{current_path.name}`",
        "",
        "## Batch Health",
        "",
        line("Files processed", previous["filesProcessed"], current["filesProcessed"]),
        line("Lead count", previous["leadCount"], current["leadCount"]),
        "",
        "## Accepted Fills",
        "",
        line("Accepted fill count", previous["acceptedCount"], current["acceptedCount"]),
        line("Leads with accepted fills", previous["leadCountWithAccepted"], current["leadCountWithAccepted"]),
        "",
        "## Review Queue",
        "",
        line("Review queue items", previous["reviewQueueCount"], current["reviewQueueCount"]),
        line("Review queue leads", previous["reviewLeadCount"], current["reviewLeadCount"]),
        "",
        "## Field Deltas",
        "",
        "Accepted-by-field deltas:",
    ]

    accepted_field_delta = comparison["delta"]["acceptedByField"]
    if accepted_field_delta:
        lines.extend([f"- `{key}`: `{value:+d}`" for key, value in accepted_field_delta.items()])
    else:
        lines.append("- No accepted-field changes.")

    lines.extend(["", "Review-by-field deltas:"])
    review_field_delta = comparison["delta"]["reviewByField"]
    if review_field_delta:
        lines.extend([f"- `{key}`: `{value:+d}`" for key, value in review_field_delta.items()])
    else:
        lines.append("- No review-field changes.")

    lines.extend(["", "## Accepted Fill Changes", ""])
    if comparison["lostAccepted"]:
        lines.append("Lost accepted fills:")
        lines.extend(
            [
                f"- lead `{item['leadId']}` `{item['field']}` -> `{item['value']}`"
                for item in comparison["lostAccepted"]
            ]
        )
    else:
        lines.append("- No lost accepted fills.")

    if comparison["gainedAccepted"]:
        lines.append("")
        lines.append("Gained accepted fills:")
        lines.extend(
            [
                f"- lead `{item['leadId']}` `{item['field']}` -> `{item['value']}`"
                for item in comparison["gainedAccepted"]
            ]
        )
    else:
        lines.append("")
        lines.append("- No gained accepted fills.")

    lines.extend(["", f"Comparison IDs: `{prev_id}` -> `{curr_id}`"])
    return "\n".join(lines) + "\n"


def main() -> None:
    args = parse_args()
    previous_path, current_path = pick_reports(args)
    previous_report = load_report(previous_path)
    current_report = load_report(current_path)
    previous_summary = summarize_report(previous_report)
    current_summary = summarize_report(current_report)
    lost_accepted, gained_accepted = diff_accepted(previous_report, current_report)

    comparison = {
        "previousReport": str(previous_path.resolve()),
        "currentReport": str(current_path.resolve()),
        "previousBatchId": batch_id_from_path(previous_path),
        "currentBatchId": batch_id_from_path(current_path),
        "previous": previous_summary,
        "current": current_summary,
        "delta": {
            "acceptedCount": current_summary["acceptedCount"] - previous_summary["acceptedCount"],
            "leadCountWithAccepted": current_summary["leadCountWithAccepted"] - previous_summary["leadCountWithAccepted"],
            "reviewQueueCount": current_summary["reviewQueueCount"] - previous_summary["reviewQueueCount"],
            "reviewLeadCount": current_summary["reviewLeadCount"] - previous_summary["reviewLeadCount"],
            "acceptedByField": diff_counts(previous_summary["acceptedByField"], current_summary["acceptedByField"]),
            "reviewByField": diff_counts(previous_summary["reviewByField"], current_summary["reviewByField"]),
            "reviewByTrust": diff_counts(previous_summary["reviewByTrust"], current_summary["reviewByTrust"]),
        },
        "lostAccepted": lost_accepted,
        "gainedAccepted": gained_accepted,
    }

    if args.write_markdown:
        markdown = render_markdown(previous_path, current_path, previous_summary, current_summary, comparison)
        output_path = Path(args.write_markdown)
        output_path.write_text(markdown, encoding="utf-8")

    print(json.dumps(comparison, indent=2))


if __name__ == "__main__":
    main()
