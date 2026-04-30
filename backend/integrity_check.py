from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path


@dataclass
class ProfileRecord:
    lead_id: int
    bucket: str  # profiles | disqualified
    slug: str
    path: str
    status: str | None


@dataclass
class DuplicateLeadId:
    lead_id: int
    profiles_paths: list[str]
    disqualified_paths: list[str]


@dataclass
class StatusMismatch:
    path: str
    bucket: str
    status: str | None
    reason: str


@dataclass
class WorklistMismatch:
    worklist: str
    range_start: int
    range_end: int
    expected_ready_for_outreach: int
    expected_disqualified: int
    actual_ready_for_outreach: int
    actual_disqualified: int


LEAD_ID_RE = re.compile(r"^(\d+)-")
STATUS_RE = re.compile(r"^Status:\s*(.+)\s*$", re.IGNORECASE | re.MULTILINE)
RANGE_RE = re.compile(r"^-\s*Range:\s*(\d+)\s*-\s*(\d+)\s*$", re.IGNORECASE | re.MULTILINE)
READY_RE = re.compile(r"^-\s*Ready for outreach:\s*(\d+)\s*$", re.IGNORECASE | re.MULTILINE)
DISQUALIFIED_RE = re.compile(r"^-\s*Disqualified:\s*(\d+)\s*$", re.IGNORECASE | re.MULTILINE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run structural integrity checks for lead profile/worklist organization."
    )
    parser.add_argument("--root", default=".", help="Repo root path (default: current directory).")
    parser.add_argument(
        "--write-report",
        action="store_true",
        help="Write a markdown report to ops/reports/integrity (or --report-path).",
    )
    parser.add_argument("--report-path", default=None, help="Optional explicit markdown report output path.")
    parser.add_argument("--json-out", default=None, help="Optional path to write JSON output.")
    parser.add_argument(
        "--fail-on-findings",
        action="store_true",
        help="Exit with status 1 when findings are present.",
    )
    return parser.parse_args()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def lead_id_from_slug(slug: str) -> int | None:
    match = LEAD_ID_RE.match(slug)
    if not match:
        return None
    return int(match.group(1))


def extract_status(text: str) -> str | None:
    match = STATUS_RE.search(text)
    if not match:
        return None
    return match.group(1).strip().lower()


def load_profile_records(repo_root: Path) -> list[ProfileRecord]:
    records: list[ProfileRecord] = []
    for bucket in ("profiles", "disqualified"):
        base = repo_root / "leads" / bucket
        if not base.exists():
            continue
        for profile in base.glob("*/*/profile.md"):
            slug = profile.parent.name
            lead_id = lead_id_from_slug(slug)
            if lead_id is None:
                continue
            status = extract_status(read_text(profile))
            records.append(
                ProfileRecord(
                    lead_id=lead_id,
                    bucket=bucket,
                    slug=slug,
                    path=profile.relative_to(repo_root).as_posix(),
                    status=status,
                )
            )
    return records


def check_shadow_trees(repo_root: Path) -> list[str]:
    findings: list[str] = []
    for child in repo_root.iterdir():
        if not child.is_dir():
            continue
        if child.name.startswith("."):
            continue
        nested = child / child.name
        if nested.exists():
            findings.append(nested.relative_to(repo_root).as_posix())
    return sorted(findings)


def check_duplicate_lead_ids(records: list[ProfileRecord]) -> list[DuplicateLeadId]:
    grouped: dict[int, dict[str, list[str]]] = {}
    for rec in records:
        grouped.setdefault(rec.lead_id, {"profiles": [], "disqualified": []})
        grouped[rec.lead_id][rec.bucket].append(rec.path)

    findings: list[DuplicateLeadId] = []
    for lead_id, buckets in sorted(grouped.items()):
        profiles_paths = sorted(buckets["profiles"])
        disqualified_paths = sorted(buckets["disqualified"])
        total = len(profiles_paths) + len(disqualified_paths)
        if total <= 1:
            continue
        findings.append(
            DuplicateLeadId(
                lead_id=lead_id,
                profiles_paths=profiles_paths,
                disqualified_paths=disqualified_paths,
            )
        )
    return findings


def check_status_folder_mismatches(records: list[ProfileRecord]) -> list[StatusMismatch]:
    findings: list[StatusMismatch] = []
    for rec in records:
        if rec.status is None:
            findings.append(
                StatusMismatch(
                    path=rec.path,
                    bucket=rec.bucket,
                    status=None,
                    reason="missing_status",
                )
            )
            continue

        if rec.bucket == "profiles" and rec.status == "disqualified":
            findings.append(
                StatusMismatch(
                    path=rec.path,
                    bucket=rec.bucket,
                    status=rec.status,
                    reason="active_folder_has_disqualified_status",
                )
            )
        elif rec.bucket == "disqualified" and rec.status != "disqualified":
            findings.append(
                StatusMismatch(
                    path=rec.path,
                    bucket=rec.bucket,
                    status=rec.status,
                    reason="disqualified_folder_has_non_disqualified_status",
                )
            )
    return findings


def worklist_files(repo_root: Path) -> list[Path]:
    leads_root = repo_root / "leads"
    candidates = list(leads_root.glob("worklist-batch-*.md"))
    candidates += list((leads_root / "batches").glob("registered-entities-batch-*-worklist.md"))
    return sorted({path.resolve(): path for path in candidates}.values(), key=lambda p: p.as_posix())


def parse_worklist_summary(path: Path) -> tuple[int, int, int, int] | None:
    text = read_text(path)
    range_match = RANGE_RE.search(text)
    ready_match = READY_RE.search(text)
    disqualified_match = DISQUALIFIED_RE.search(text)
    if not range_match or not ready_match or not disqualified_match:
        return None
    start = int(range_match.group(1))
    end = int(range_match.group(2))
    expected_ready = int(ready_match.group(1))
    expected_disqualified = int(disqualified_match.group(1))
    return start, end, expected_ready, expected_disqualified


def count_by_range(records: list[ProfileRecord], start: int, end: int) -> tuple[int, int]:
    active_ids: set[int] = set()
    disqualified_ids: set[int] = set()
    for rec in records:
        if not (start <= rec.lead_id <= end):
            continue
        if rec.bucket == "profiles":
            active_ids.add(rec.lead_id)
        else:
            disqualified_ids.add(rec.lead_id)
    return len(active_ids), len(disqualified_ids)


def check_worklist_summary_mismatches(repo_root: Path, records: list[ProfileRecord]) -> list[WorklistMismatch]:
    findings: list[WorklistMismatch] = []
    for worklist in worklist_files(repo_root):
        parsed = parse_worklist_summary(worklist)
        if parsed is None:
            continue
        start, end, expected_ready, expected_disqualified = parsed
        actual_ready, actual_disqualified = count_by_range(records, start, end)
        if expected_ready == actual_ready and expected_disqualified == actual_disqualified:
            continue
        findings.append(
            WorklistMismatch(
                worklist=worklist.relative_to(repo_root).as_posix(),
                range_start=start,
                range_end=end,
                expected_ready_for_outreach=expected_ready,
                expected_disqualified=expected_disqualified,
                actual_ready_for_outreach=actual_ready,
                actual_disqualified=actual_disqualified,
            )
        )
    return findings


def build_result(repo_root: Path) -> dict:
    records = load_profile_records(repo_root)
    duplicate_ids = check_duplicate_lead_ids(records)
    status_mismatches = check_status_folder_mismatches(records)
    shadow_trees = check_shadow_trees(repo_root)
    worklist_mismatches = check_worklist_summary_mismatches(repo_root, records)

    findings_total = (
        len(duplicate_ids)
        + len(status_mismatches)
        + len(shadow_trees)
        + len(worklist_mismatches)
    )

    return {
        "generated": date.today().isoformat(),
        "root": str(repo_root.resolve()),
        "summary": {
            "profiles_scanned": len(records),
            "duplicate_lead_id_groups": len(duplicate_ids),
            "status_folder_mismatches": len(status_mismatches),
            "shadow_trees": len(shadow_trees),
            "worklist_summary_mismatches": len(worklist_mismatches),
            "findings_total": findings_total,
        },
        "findings": {
            "shadow_trees": shadow_trees,
            "duplicate_lead_ids": [asdict(item) for item in duplicate_ids],
            "status_folder_mismatches": [asdict(item) for item in status_mismatches],
            "worklist_summary_mismatches": [asdict(item) for item in worklist_mismatches],
        },
    }


def to_markdown(result: dict) -> str:
    summary = result["summary"]
    findings = result["findings"]
    lines: list[str] = []
    lines.append("# Repository Integrity Report")
    lines.append("")
    lines.append(f"Generated: {result['generated']}")
    lines.append(f"Root: `{result['root']}`")
    lines.append("")
    lines.append("## Summary")
    lines.append(f"- Profiles scanned: {summary['profiles_scanned']}")
    lines.append(f"- Duplicate lead ID groups: {summary['duplicate_lead_id_groups']}")
    lines.append(f"- Status-folder mismatches: {summary['status_folder_mismatches']}")
    lines.append(f"- Shadow trees: {summary['shadow_trees']}")
    lines.append(f"- Worklist summary mismatches: {summary['worklist_summary_mismatches']}")
    lines.append(f"- Total findings: {summary['findings_total']}")
    lines.append("")

    lines.append("## Shadow Trees")
    if findings["shadow_trees"]:
        for item in findings["shadow_trees"]:
            lines.append(f"- `{item}`")
    else:
        lines.append("- None")
    lines.append("")

    lines.append("## Duplicate Lead IDs")
    if findings["duplicate_lead_ids"]:
        for item in findings["duplicate_lead_ids"]:
            lines.append(f"- Lead ID `{item['lead_id']}`")
            for path in item["profiles_paths"]:
                lines.append(f"  - profiles: `{path}`")
            for path in item["disqualified_paths"]:
                lines.append(f"  - disqualified: `{path}`")
    else:
        lines.append("- None")
    lines.append("")

    lines.append("## Status-Folder Mismatches")
    if findings["status_folder_mismatches"]:
        for item in findings["status_folder_mismatches"]:
            lines.append(
                f"- `{item['path']}` | bucket={item['bucket']} | status={item['status']} | reason={item['reason']}"
            )
    else:
        lines.append("- None")
    lines.append("")

    lines.append("## Worklist Summary Mismatches")
    if findings["worklist_summary_mismatches"]:
        for item in findings["worklist_summary_mismatches"]:
            lines.append(
                "- `{worklist}` range `{start}-{end}` expected ready/disq `{er}/{ed}` actual `{ar}/{ad}`".format(
                    worklist=item["worklist"],
                    start=item["range_start"],
                    end=item["range_end"],
                    er=item["expected_ready_for_outreach"],
                    ed=item["expected_disqualified"],
                    ar=item["actual_ready_for_outreach"],
                    ad=item["actual_disqualified"],
                )
            )
    else:
        lines.append("- None")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    repo_root = Path(args.root).resolve()
    result = build_result(repo_root)

    print(
        "Integrity check: findings={f} duplicates={d} status_mismatches={s} shadow_trees={t} worklist_mismatches={w}".format(
            f=result["summary"]["findings_total"],
            d=result["summary"]["duplicate_lead_id_groups"],
            s=result["summary"]["status_folder_mismatches"],
            t=result["summary"]["shadow_trees"],
            w=result["summary"]["worklist_summary_mismatches"],
        )
    )

    if args.json_out:
        json_path = Path(args.json_out)
        if not json_path.is_absolute():
            json_path = repo_root / json_path
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(f"JSON report written: {json_path}")

    if args.write_report or args.report_path:
        if args.report_path:
            report_path = Path(args.report_path)
            if not report_path.is_absolute():
                report_path = repo_root / report_path
        else:
            report_path = repo_root / "ops" / "reports" / "integrity" / f"integrity-{date.today().isoformat()}.md"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(to_markdown(result), encoding="utf-8")
        print(f"Markdown report written: {report_path}")

    if args.fail_on_findings and result["summary"]["findings_total"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

