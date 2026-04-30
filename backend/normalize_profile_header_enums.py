#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
ROOTS = [
    REPO_ROOT / "leads" / "profiles",
    REPO_ROOT / "leads" / "disqualified",
]

CANON_STATUS = {"new", "in-progress", "ready", "complete", "disqualified", "won", "lost"}
CANON_OUTREACH = {"uncontacted", "drafted", "sent", "bounced", "replied", "opt-out"}
CANON_CONTACT_PATH = {"email", "form", "social", "phone-only", "unknown"}

MISSING_VALUES = {
    "",
    "unknown",
    "n/a",
    "na",
    "none",
    "null",
    "not set",
    "not provided",
    "(missing)",
}

SOCIAL_TOKENS = ("facebook", "instagram", "linkedin", "twitter", "x.com", "tiktok", "youtube")

LABEL_TEMPLATE = re.compile(r"^\s*([A-Za-z][A-Za-z /_-]*?)\s*:\s*(.*?)\s*$")
HEADING_TEMPLATE = re.compile(r"^\s*##\s+(.+?)\s*$")
SLUG_ID_RE = re.compile(r"^(\d+)-")


@dataclass
class Decision:
    canonical: str
    reason: str
    preserve_note: bool = False


def normalize_text(value: str | None) -> str:
    return (value or "").strip()


def normalize_key(value: str | None) -> str:
    base = normalize_text(value).lower()
    base = base.replace("_", " ").replace("/", " ").replace("-", " ")
    base = re.sub(r"\s+", " ", base).strip()
    return base


def is_missing(value: str | None) -> bool:
    return normalize_key(value) in MISSING_VALUES


def expected_registered_batch(lead_id: int) -> str:
    batch_num = ((lead_id - 1) // 100) + 1
    return f"registered-entities-batch-{batch_num:03d}"


def find_label(lines: list[str], label: str) -> tuple[int | None, str | None]:
    pat = re.compile(rf"^\s*{re.escape(label)}\s*:\s*(.*?)\s*$", re.IGNORECASE)
    for idx, line in enumerate(lines[:160]):
        match = pat.match(line)
        if match:
            return idx, match.group(1).strip()
    return None, None


def set_label(lines: list[str], label: str, value: str) -> bool:
    idx, current = find_label(lines, label)
    if idx is not None:
        if normalize_text(current) == value:
            return False
        key_match = re.match(r"^(\s*[A-Za-z][A-Za-z /_-]*?\s*:\s*).*$", lines[idx])
        if key_match:
            lines[idx] = f"{key_match.group(1)}{value}"
        else:
            lines[idx] = f"{label}: {value}"
        return True

    insert_at = 1 if lines and lines[0].startswith("# ") else 0
    while insert_at < len(lines):
        text = lines[insert_at].strip()
        if not text:
            insert_at += 1
            continue
        if LABEL_TEMPLATE.match(lines[insert_at]):
            insert_at += 1
            continue
        break
    lines.insert(insert_at, f"{label}: {value}")
    return True


def find_notes_insert(lines: list[str]) -> int | None:
    section_start = None
    section_end = None
    for idx, line in enumerate(lines):
        heading = HEADING_TEMPLATE.match(line)
        if not heading:
            continue
        h = heading.group(1).strip().lower()
        if h in {"notes", "note", "observations", "observation"}:
            section_start = idx
            continue
        if section_start is not None and idx > section_start:
            section_end = idx
            break
    if section_start is None:
        return None
    return section_end if section_end is not None else len(lines)


def add_note(lines: list[str], note: str) -> bool:
    note_line = f"- {note}"
    if any(normalize_text(ln) == note_line for ln in lines):
        return False

    insert_at = find_notes_insert(lines)
    if insert_at is None:
        if lines and normalize_text(lines[-1]):
            lines.append("")
        lines.append("## Notes")
        lines.append(note_line)
        return True

    lines.insert(insert_at, note_line)
    return True


def map_status(raw: str | None, bucket: str) -> Decision:
    raw_text = normalize_text(raw)
    key = normalize_key(raw_text)
    if raw_text in CANON_STATUS:
        return Decision(raw_text, "already-canonical")

    alias = {
        "new": "new",
        "in progress": "in-progress",
        "ready": "ready",
        "complete": "complete",
        "completed": "complete",
        "done": "complete",
        "disqualified": "disqualified",
        "won": "won",
        "lost": "lost",
        "contact ready": "ready",
        "draft prepared": "in-progress",
        "research": "in-progress",
        "needs review": "in-progress",
        "needs browser": "in-progress",
        "phone only": "ready",
    }
    if key in alias:
        return Decision(alias[key], "alias")

    if "excluded" in key:
        return Decision("disqualified", "excluded->disqualified", preserve_note=True)

    if is_missing(raw_text):
        fallback = "disqualified" if bucket == "disqualified" else "new"
        return Decision(fallback, "missing-fallback")

    fallback = "disqualified" if bucket == "disqualified" else "new"
    return Decision(fallback, "unknown-fallback", preserve_note=True)


def map_outreach(raw: str | None) -> Decision:
    raw_text = normalize_text(raw)
    key = normalize_key(raw_text)
    if raw_text in CANON_OUTREACH:
        return Decision(raw_text, "already-canonical")

    alias = {
        "uncontacted": "uncontacted",
        "not started": "uncontacted",
        "not started yet": "uncontacted",
        "notstarted": "uncontacted",
        "pending": "uncontacted",
        "drafted": "drafted",
        "draft": "drafted",
        "draft prepared": "drafted",
        "sent": "sent",
        "bounced": "bounced",
        "replied": "replied",
        "reply": "replied",
        "opt out": "opt-out",
        "opt-out": "opt-out",
        "unsubscribe": "opt-out",
        "do not contact": "opt-out",
        "disqualified": "uncontacted",
    }
    if key in alias:
        return Decision(alias[key], "alias")

    if is_missing(raw_text):
        return Decision("uncontacted", "missing-fallback")
    return Decision("uncontacted", "unknown-fallback", preserve_note=True)


def map_contact_path(raw: str | None) -> Decision:
    raw_text = normalize_text(raw)
    key = normalize_key(raw_text)
    if raw_text in CANON_CONTACT_PATH:
        return Decision(raw_text, "already-canonical")

    alias = {
        "email": "email",
        "form": "form",
        "contact form": "form",
        "contactform": "form",
        "web form": "form",
        "webform": "form",
        "social": "social",
        "phone": "phone-only",
        "phone only": "phone-only",
        "phone-only": "phone-only",
        "website": "unknown",
        "web": "unknown",
        "unknown": "unknown",
        "none found": "unknown",
        "not direct": "unknown",
        "inferred": "unknown",
        "unresolved": "unknown",
        "address only": "unknown",
    }
    if key in alias:
        preserve = alias[key] == "unknown" and key not in {"unknown"}
        return Decision(alias[key], "alias", preserve_note=preserve)

    if "@" in raw_text or "email" in key:
        return Decision("email", "heuristic-email")
    if "form" in key:
        return Decision("form", "heuristic-form")
    if any(token in key for token in SOCIAL_TOKENS):
        return Decision("social", "heuristic-social")
    if "phone" in key or "call" in key:
        return Decision("phone-only", "heuristic-phone")

    # Non-canonical path detail is preserved in notes when downgraded to unknown.
    if is_missing(raw_text):
        return Decision("unknown", "missing-fallback")
    return Decision("unknown", "unknown-fallback", preserve_note=True)


def parse_slug_lead_id(profile_md: Path) -> int | None:
    slug = profile_md.parent.name
    match = SLUG_ID_RE.match(slug)
    if not match:
        return None
    return int(match.group(1))


def iter_profiles() -> list[Path]:
    paths: list[Path] = []
    for root in ROOTS:
        if root.exists():
            paths.extend(sorted(root.rglob("profile.md")))
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Normalize Status/Outreach status/Contact path enums and fill missing Batch/Batch line."
    )
    parser.add_argument("--apply", action="store_true", help="Write changes to disk (default: dry-run).")
    parser.add_argument(
        "--report",
        default=str(REPO_ROOT / "reports" / f"normalize-profile-header-enums-{date.today().isoformat()}.md"),
        help="Markdown report output path.",
    )
    parser.add_argument(
        "--json-report",
        default=str(REPO_ROOT / "reports" / f"normalize-profile-header-enums-{date.today().isoformat()}.json"),
        help="JSON report output path.",
    )
    args = parser.parse_args()

    profiles = iter_profiles()
    counts = {
        "status": 0,
        "outreach_status": 0,
        "contact_path": 0,
        "batch": 0,
        "batch_line": 0,
        "notes_added": 0,
        "files_changed": 0,
        "write_skipped_missing": 0,
    }

    reason_counts: dict[str, int] = {}
    unknown_logs: list[dict[str, str]] = []
    writes: list[tuple[Path, str]] = []

    for profile_md in profiles:
        rel_path = profile_md.relative_to(REPO_ROOT).as_posix()
        bucket = "disqualified" if "/disqualified/" in f"/{rel_path}/" else "profiles"

        text = profile_md.read_text(encoding="utf-8", errors="ignore")
        lines = text.splitlines()
        file_changed = False

        # Status
        _, current_status = find_label(lines, "Status")
        status_decision = map_status(current_status, bucket)
        reason_counts[f"status:{status_decision.reason}"] = reason_counts.get(f"status:{status_decision.reason}", 0) + 1
        if current_status != status_decision.canonical:
            if set_label(lines, "Status", status_decision.canonical):
                counts["status"] += 1
                file_changed = True
                if status_decision.preserve_note and normalize_text(current_status):
                    note = f"Header normalization: Status \"{normalize_text(current_status)}\" -> \"{status_decision.canonical}\"."
                    if add_note(lines, note):
                        counts["notes_added"] += 1
                if status_decision.reason.endswith("fallback"):
                    unknown_logs.append(
                        {
                            "path": rel_path,
                            "field": "Status",
                            "original": normalize_text(current_status) or "(missing)",
                            "normalized": status_decision.canonical,
                            "reason": status_decision.reason,
                        }
                    )

        # Outreach status
        _, current_outreach = find_label(lines, "Outreach status")
        outreach_decision = map_outreach(current_outreach)
        reason_counts[f"outreach:{outreach_decision.reason}"] = reason_counts.get(f"outreach:{outreach_decision.reason}", 0) + 1
        if current_outreach != outreach_decision.canonical:
            if set_label(lines, "Outreach status", outreach_decision.canonical):
                counts["outreach_status"] += 1
                file_changed = True
                if outreach_decision.preserve_note and normalize_text(current_outreach):
                    note = (
                        f"Header normalization: Outreach status \"{normalize_text(current_outreach)}\""
                        f" -> \"{outreach_decision.canonical}\"."
                    )
                    if add_note(lines, note):
                        counts["notes_added"] += 1
                if outreach_decision.reason.endswith("fallback"):
                    unknown_logs.append(
                        {
                            "path": rel_path,
                            "field": "Outreach status",
                            "original": normalize_text(current_outreach) or "(missing)",
                            "normalized": outreach_decision.canonical,
                            "reason": outreach_decision.reason,
                        }
                    )

        # Contact path
        _, current_path = find_label(lines, "Contact path")
        path_decision = map_contact_path(current_path)
        reason_counts[f"contact_path:{path_decision.reason}"] = reason_counts.get(
            f"contact_path:{path_decision.reason}",
            0,
        ) + 1
        if current_path != path_decision.canonical:
            if set_label(lines, "Contact path", path_decision.canonical):
                counts["contact_path"] += 1
                file_changed = True
                if path_decision.preserve_note and normalize_text(current_path):
                    note = f"Header normalization: Contact path \"{normalize_text(current_path)}\" -> \"{path_decision.canonical}\"."
                    if add_note(lines, note):
                        counts["notes_added"] += 1
                if path_decision.reason.endswith("fallback"):
                    unknown_logs.append(
                        {
                            "path": rel_path,
                            "field": "Contact path",
                            "original": normalize_text(current_path) or "(missing)",
                            "normalized": path_decision.canonical,
                            "reason": path_decision.reason,
                        }
                    )

        # Fill missing Batch / Batch line conservatively.
        lead_id = parse_slug_lead_id(profile_md)
        _, current_batch = find_label(lines, "Batch")
        _, current_batch_line = find_label(lines, "Batch line")

        if is_missing(current_batch_line):
            batch_line_value = str(lead_id) if lead_id is not None else "unassigned"
            if set_label(lines, "Batch line", batch_line_value):
                counts["batch_line"] += 1
                file_changed = True
                if lead_id is None:
                    unknown_logs.append(
                        {
                            "path": rel_path,
                            "field": "Batch line",
                            "original": normalize_text(current_batch_line) or "(missing)",
                            "normalized": batch_line_value,
                            "reason": "missing-fallback-no-slug-id",
                        }
                    )

        if is_missing(current_batch):
            if lead_id is not None and lead_id <= 9999:
                batch_value = expected_registered_batch(lead_id)
                reason = "derived-from-slug-id"
            else:
                batch_value = "unassigned"
                reason = "missing-fallback-unassigned"
            if set_label(lines, "Batch", batch_value):
                counts["batch"] += 1
                file_changed = True
                if reason != "derived-from-slug-id":
                    unknown_logs.append(
                        {
                            "path": rel_path,
                            "field": "Batch",
                            "original": normalize_text(current_batch) or "(missing)",
                            "normalized": batch_value,
                            "reason": reason,
                        }
                    )

        if file_changed:
            counts["files_changed"] += 1
            output_text = "\n".join(lines)
            if text.endswith("\n"):
                output_text += "\n"
            writes.append((profile_md, output_text))

    if args.apply:
        for path, new_text in writes:
            try:
                path.write_text(new_text, encoding="utf-8")
            except FileNotFoundError:
                counts["write_skipped_missing"] += 1
                unknown_logs.append(
                    {
                        "path": path.relative_to(REPO_ROOT).as_posix(),
                        "field": "(write)",
                        "original": "(file disappeared after scan)",
                        "normalized": "(skipped)",
                        "reason": "write-skip-missing-file",
                    }
                )

    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_lines = [
        "# Normalize Profile Header Enums",
        f"Generated: {date.today().isoformat()}",
        f"- Mode: {'APPLY' if args.apply else 'DRY-RUN'}",
        f"- Profiles scanned: {len(profiles)}",
        f"- Files changed: {counts['files_changed']}",
        "",
        "## Field Change Counts",
        f"- Status: {counts['status']}",
        f"- Outreach status: {counts['outreach_status']}",
        f"- Contact path: {counts['contact_path']}",
        f"- Batch: {counts['batch']}",
        f"- Batch line: {counts['batch_line']}",
        f"- Notes added: {counts['notes_added']}",
        f"- Write skipped (missing file): {counts['write_skipped_missing']}",
        "",
        "## Decision Reasons",
    ]
    for key in sorted(reason_counts):
        report_lines.append(f"- {key}: {reason_counts[key]}")

    report_lines.append("")
    report_lines.append("## Conservative Fallback Log")
    if unknown_logs:
        report_lines.append("| Path | Field | Original | Normalized | Reason |")
        report_lines.append("| --- | --- | --- | --- | --- |")
        for item in unknown_logs[:2000]:
            report_lines.append(
                f"| {item['path']} | {item['field']} | {item['original']} | {item['normalized']} | {item['reason']} |"
            )
        if len(unknown_logs) > 2000:
            report_lines.append(f"| (truncated) | | | | first 2000 of {len(unknown_logs)} |")
    else:
        report_lines.append("- None")
    report_lines.append("")

    report_path.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    json_report_path = Path(args.json_report)
    json_report_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated": date.today().isoformat(),
        "mode": "apply" if args.apply else "dry-run",
        "profiles_scanned": len(profiles),
        "counts": counts,
        "reason_counts": reason_counts,
        "conservative_fallbacks": unknown_logs,
    }
    json_report_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"Report: {report_path}")
    print(f"JSON report: {json_report_path}")
    print(f"Profiles scanned: {len(profiles)}")
    print(f"Files changed: {counts['files_changed']}")
    print(f"Status changed: {counts['status']}")
    print(f"Outreach status changed: {counts['outreach_status']}")
    print(f"Contact path changed: {counts['contact_path']}")
    print(f"Batch changed: {counts['batch']}")
    print(f"Batch line changed: {counts['batch_line']}")
    print(f"Notes added: {counts['notes_added']}")
    print(f"Write skipped (missing file): {counts['write_skipped_missing']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
