from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CASES = Path(__file__).with_name("security_confidence_eval_cases.json")


@dataclass
class AssertionResult:
    path: str
    op: str
    passed: bool
    expected: Any
    actual: Any
    note: str = ""


REQUIRED_ADJUDICATION_FIELDS = (
    "reviewer_type",
    "reviewer",
    "reviewed_at",
    "agent_review_confidence",
    "summary",
    "direct_evidence",
    "high_confidence_inference",
    "review_only_boundaries",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate security-confidence review fixtures against expected audit behavior. "
            "This is a thin truth harness over existing audit-review corpus files."
        )
    )
    parser.add_argument("--cases", default=str(DEFAULT_CASES), help="Path to eval cases JSON.")
    parser.add_argument(
        "--case",
        action="append",
        default=[],
        help="Optional case id filter. Can be passed multiple times.",
    )
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")
    return parser.parse_args()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def build_enrichment_from_audit(audit_path: Path) -> Any:
    script = (
        "const fs=require('fs');"
        "const mod=require('./audit-lead.js');"
        f"const payload=JSON.parse(fs.readFileSync({json.dumps(str(audit_path))},'utf8'));"
        "const enrichment=mod.buildLeadEnrichment(payload);"
        "process.stdout.write(JSON.stringify(enrichment));"
    )
    completed = subprocess.run(
        ["node", "-e", script],
        cwd=str(REPO_ROOT),
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        stderr = completed.stderr.strip() or "unknown node error"
        raise RuntimeError(f"buildLeadEnrichment failed: {stderr}")
    return json.loads(completed.stdout)


def resolve_path(raw_path: str, base_file: Path) -> Path:
    candidate = Path(raw_path)
    if candidate.is_absolute():
        return candidate

    repo_relative = REPO_ROOT / candidate
    if repo_relative.exists():
        return repo_relative

    sibling_relative = base_file.parent / candidate
    return sibling_relative


def parse_segments(path: str) -> list[Any]:
    segments: list[Any] = []
    for piece in path.split("."):
        if not piece:
            continue
        match = re.fullmatch(r"([^\[{]+)(?:\{([^=]+)=([^}]+)\})?(\[\d+\])*", piece)
        if not match:
            raise ValueError(f"Unsupported path segment: {piece}")
        key = match.group(1)
        filter_field = match.group(2)
        filter_value = match.group(3)
        if key:
            segments.append(key)
        if filter_field:
            segments.append(("filter", filter_field, filter_value))
        for idx_match in re.finditer(r"\[(\d+)\]", piece):
            segments.append(int(idx_match.group(1)))
    return segments


def get_path_value(payload: Any, path: str) -> Any:
    current = payload
    for segment in parse_segments(path):
        if isinstance(segment, tuple) and segment and segment[0] == "filter":
            _, filter_field, filter_value = segment
            if not isinstance(current, list):
                raise KeyError(f"Expected list before filter {{{filter_field}={filter_value}}} in {path}")
            match = next(
                (
                    item
                    for item in current
                    if isinstance(item, dict) and str(item.get(filter_field)) == filter_value
                ),
                None,
            )
            if match is None:
                raise KeyError(f"No list item matched {{{filter_field}={filter_value}}} in {path}")
            current = match
            continue
        if isinstance(segment, int):
            if not isinstance(current, list):
                raise KeyError(f"Expected list before index [{segment}] in {path}")
            current = current[segment]
            continue
        if not isinstance(current, dict):
            raise KeyError(f"Expected object before key '{segment}' in {path}")
        current = current[segment]
    return current


def normalize_message_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    messages: list[str] = []
    for item in value:
        if isinstance(item, str):
            messages.append(item)
        elif isinstance(item, dict) and isinstance(item.get("message"), str):
            messages.append(item["message"])
    return messages


def object_contains_subset(actual: Any, expected: Any) -> bool:
    if not isinstance(expected, dict):
        return actual == expected
    if not isinstance(actual, dict):
        return False
    for key, expected_value in expected.items():
        if key not in actual:
            return False
        if not object_contains_subset(actual[key], expected_value):
            return False
    return True


def split_assertion_source(path: str) -> tuple[str, str]:
    if path.startswith("audit."):
        return "audit", path[len("audit.") :]
    if path.startswith("enrichment."):
        return "enrichment", path[len("enrichment.") :]
    return "audit", path


def evaluate_assertion(payloads: dict[str, Any], assertion: dict[str, Any]) -> AssertionResult:
    raw_path = str(assertion["path"])
    op = str(assertion["op"])
    expected = assertion.get("value")
    source_name, path = split_assertion_source(raw_path)
    payload = payloads.get(source_name)

    if op == "absent":
        try:
            actual = get_path_value(payload, path)
        except Exception:
            return AssertionResult(path=raw_path, op=op, passed=True, expected=None, actual=None)
        return AssertionResult(
            path=raw_path,
            op=op,
            passed=False,
            expected=None,
            actual=actual,
            note="Path resolved but was expected to be absent",
        )

    if op == "exists":
        try:
            actual = get_path_value(payload, path)
        except Exception as exc:
            return AssertionResult(path=raw_path, op=op, passed=False, expected=True, actual=None, note=str(exc))
        return AssertionResult(path=raw_path, op=op, passed=True, expected=True, actual=actual)

    try:
        actual = get_path_value(payload, path)
    except Exception as exc:
        return AssertionResult(path=raw_path, op=op, passed=False, expected=expected, actual=None, note=str(exc))

    if op == "equals":
        passed = actual == expected
    elif op == "contains":
        if isinstance(actual, list):
            passed = expected in actual
        elif isinstance(actual, str):
            passed = str(expected) in actual
        else:
            passed = False
    elif op == "contains_all":
        if isinstance(actual, list) and isinstance(expected, list):
            passed = all(item in actual for item in expected)
        elif isinstance(actual, str) and isinstance(expected, list):
            passed = all(str(item) in actual for item in expected)
        else:
            passed = False
    elif op == "contains_object":
        if isinstance(actual, list):
            passed = any(object_contains_subset(item, expected) for item in actual)
        else:
            passed = False
    elif op == "not_contains_object":
        if isinstance(actual, list):
            passed = all(not object_contains_subset(item, expected) for item in actual)
        else:
            passed = True
    elif op == "not_contains":
        if isinstance(actual, list):
            passed = expected not in actual
        elif isinstance(actual, str):
            passed = str(expected) not in actual
        else:
            passed = True
    elif op == "length_equals":
        passed = hasattr(actual, "__len__") and len(actual) == expected
    elif op == "length_gte":
        passed = hasattr(actual, "__len__") and len(actual) >= expected
    elif op == "length_lte":
        passed = hasattr(actual, "__len__") and len(actual) <= expected
    elif op == "matches":
        if isinstance(actual, str):
            passed = re.search(str(expected), actual) is not None
        else:
            passed = False
    elif op == "any_message_contains":
        messages = normalize_message_list(actual)
        actual = messages
        passed = any(str(expected) in message for message in messages)
    elif op == "all_messages_not_contains":
        messages = normalize_message_list(actual)
        actual = messages
        passed = all(str(expected) not in message for message in messages)
    else:
        return AssertionResult(
            path=raw_path,
            op=op,
            passed=False,
            expected=expected,
            actual=actual,
            note=f"Unsupported op: {op}",
        )

    return AssertionResult(path=raw_path, op=op, passed=passed, expected=expected, actual=actual)


def validate_adjudication(case: dict[str, Any]) -> list[str]:
    adjudication = case.get("adjudication")
    if not isinstance(adjudication, dict):
        return ["missing adjudication block"]

    issues: list[str] = []
    for field in REQUIRED_ADJUDICATION_FIELDS:
        value = adjudication.get(field)
        if value in (None, "", []):
            issues.append(f"missing adjudication.{field}")

    reviewer_type = str(adjudication.get("reviewer_type") or "")
    if reviewer_type not in {"agent-reviewed"}:
        issues.append("adjudication.reviewer_type must be 'agent-reviewed'")

    confidence = str(adjudication.get("agent_review_confidence") or "")
    if confidence not in {"high", "medium", "low"}:
        issues.append("adjudication.agent_review_confidence must be one of: high, medium, low")

    for field in ("direct_evidence", "high_confidence_inference", "review_only_boundaries"):
        value = adjudication.get(field)
        if not isinstance(value, list) or not all(isinstance(item, str) and item.strip() for item in value):
            issues.append(f"adjudication.{field} must be a non-empty list of strings")

    return issues


def render_text(report: dict[str, Any]) -> str:
    lines = [
        "Security Confidence Harness",
        f"Cases: {report['summary']['casesPassed']} passed, {report['summary']['casesFailed']} failed",
        f"Assertions: {report['summary']['assertionsPassed']} passed, {report['summary']['assertionsFailed']} failed",
        "",
    ]

    for case in report["cases"]:
        status = "PASS" if case["passed"] else "FAIL"
        lines.append(f"[{status}] {case['id']}")
        if case.get("notes"):
            lines.append(f"  {case['notes']}")
        adjudication = case.get("adjudication") or {}
        if adjudication:
            reviewer = adjudication.get("reviewer")
            confidence = adjudication.get("agent_review_confidence")
            lines.append(f"  adjudication: {reviewer} ({confidence})")
        if case.get("auditJson"):
            lines.append(f"  audit: {case['auditJson']}")
        for issue in case.get("adjudicationIssues", []):
            lines.append(f"  - adjudication issue: {issue}")
        for assertion in case["assertions"]:
            if assertion["passed"]:
                continue
            lines.append(f"  - {assertion['path']} {assertion['op']} expected={assertion['expected']!r}")
            lines.append(f"    actual={assertion['actual']!r}")
            if assertion.get("note"):
                lines.append(f"    note={assertion['note']}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    args = parse_args()
    cases_path = Path(args.cases)
    if not cases_path.is_absolute():
        cases_path = REPO_ROOT / cases_path
    if not cases_path.exists():
        raise SystemExit(f"Cases file not found: {cases_path}")

    raw_cases = load_json(cases_path)
    selected_ids = set(args.case or [])
    cases = [
        case
        for case in raw_cases
        if not selected_ids or str(case.get("id")) in selected_ids
    ]
    if not cases:
        raise SystemExit("No matching cases found.")

    case_reports: list[dict[str, Any]] = []
    assertions_passed = 0
    assertions_failed = 0

    for case in cases:
        adjudication_issues = validate_adjudication(case)
        audit_path = resolve_path(str(case["audit_json"]), cases_path)
        audit_payload = load_json(audit_path)
        enrichment_payload = None
        enrichment_ref = case.get("enrichment_json")
        enrichment_path = None
        if case.get("generated_enrichment"):
            enrichment_payload = build_enrichment_from_audit(audit_path)
        elif enrichment_ref:
            enrichment_path = resolve_path(str(enrichment_ref), cases_path)
            enrichment_payload = load_json(enrichment_path)
        payloads = {
            "audit": audit_payload,
            "enrichment": enrichment_payload,
        }

        assertion_reports = []
        case_failed = bool(adjudication_issues)
        for assertion in case.get("assertions", []):
            result = evaluate_assertion(payloads, assertion)
            assertion_reports.append(
                {
                    "path": result.path,
                    "op": result.op,
                    "passed": result.passed,
                    "expected": result.expected,
                    "actual": result.actual,
                    "note": result.note,
                }
            )
            if result.passed:
                assertions_passed += 1
            else:
                assertions_failed += 1
                case_failed = True

        case_reports.append(
            {
                "id": case.get("id"),
                "notes": case.get("notes"),
                "adjudication": case.get("adjudication"),
                "adjudicationIssues": adjudication_issues,
                "auditJson": str(audit_path.relative_to(REPO_ROOT)),
                "enrichmentJson": str(enrichment_path.relative_to(REPO_ROOT)) if enrichment_path else None,
                "passed": not case_failed,
                "assertions": assertion_reports,
            }
        )

    summary = {
        "casesPassed": sum(1 for case in case_reports if case["passed"]),
        "casesFailed": sum(1 for case in case_reports if not case["passed"]),
        "assertionsPassed": assertions_passed,
        "assertionsFailed": assertions_failed,
    }
    report = {
        "casesFile": str(cases_path.relative_to(REPO_ROOT)),
        "summary": summary,
        "cases": case_reports,
    }

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(render_text(report), end="")

    return 0 if summary["casesFailed"] == 0 and summary["assertionsFailed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
