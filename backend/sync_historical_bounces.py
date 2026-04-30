from __future__ import annotations

import csv
import json
import re
import subprocess
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path


EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
SELF_EMAILS = {"fred@mccullough.digital", "hello@mccullough.digital"}

REPO_ROOT = Path(".")
INDEX_PATH = REPO_ROOT / "leads" / "index.csv"
CONTACT_LOG_PATH = REPO_ROOT / "outreach" / "logs" / "contact-log.md"
SOURCE_BOUNCES_PATH = REPO_ROOT / "outreach" / "logs" / "all-bounced-comprehensive.json"
REPORT_PATH = REPO_ROOT / "reports" / f"historical-bounce-sync-{date.today().isoformat()}.md"


@dataclass
class BounceRecord:
    email: str
    source: str
    notes: str


def extract_emails(text: str) -> list[str]:
    return [m.group(0).lower() for m in EMAIL_RE.finditer(text or "")]


def bounced_emails_annotated_in_field(email_field: str) -> set[str]:
    annotated: set[str] = set()
    for match in EMAIL_RE.finditer(email_field or ""):
        email = match.group(0).lower()
        next_comma = email_field.find(",", match.end())
        segment_end = next_comma if next_comma != -1 else len(email_field)
        tail = email_field[match.end() : segment_end].lower()
        if "bounce" in tail:
            annotated.add(email)
    return annotated


def load_index_rows() -> list[dict[str, str]]:
    with INDEX_PATH.open(newline="", encoding="utf-8", errors="ignore") as handle:
        return list(csv.DictReader(handle))


def load_bounce_records(annotated_index_bounces: set[str]) -> tuple[list[BounceRecord], list[str]]:
    raw = json.loads(SOURCE_BOUNCES_PATH.read_text(encoding="utf-8"))
    filtered: list[BounceRecord] = []
    skipped: list[str] = []
    seen: set[str] = set()
    allowed_source_prefixes = ("index_outreach_status", "index_email_note", "tmp:", "imap:", "imap_outlook_logs")
    for item in raw:
        email = (item.get("email") or "").strip().lower()
        source = (item.get("source") or "").strip()
        notes = (item.get("notes") or "").strip()
        if not email or email in SELF_EMAILS:
            skipped.append(email or "<blank>")
            continue
        if not any(source.startswith(prefix) for prefix in allowed_source_prefixes):
            skipped.append(email)
            continue
        if source == "index_email_note" and email not in annotated_index_bounces:
            skipped.append(email)
            continue
        if email in seen:
            continue
        seen.add(email)
        filtered.append(BounceRecord(email=email, source=source, notes=notes))
    filtered.sort(key=lambda r: r.email)
    return filtered, skipped


def build_index_email_map(rows: list[dict[str, str]]) -> dict[str, list[int]]:
    mapping: dict[str, list[int]] = defaultdict(list)
    for idx, row in enumerate(rows):
        for email in extract_emails(row.get("Email", "")):
            mapping[email].append(idx)
    return mapping


def normalize_profile_path(path: str) -> str:
    path = (path or "").replace("\\", "/").strip()
    if path.startswith("leads/"):
        path = path[len("leads/") :]
    return path


def build_profile_map(rows: list[dict[str, str]]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for idx, row in enumerate(rows):
        norm = normalize_profile_path(row.get("ProfilePath", ""))
        if norm:
            mapping[norm] = idx
    return mapping


def profile_paths_for_email(email: str) -> list[Path]:
    candidates: list[Path] = []
    search_roots = [REPO_ROOT / "leads" / "profiles", REPO_ROOT / "leads" / "disqualified"]
    root_args = [str(root) for root in search_roots if root.exists()]
    if not root_args:
        return candidates
    result = subprocess.run(
        ["rg", "-l", "--fixed-strings", email, *root_args],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )
    for raw_path in (result.stdout or "").splitlines():
        path = Path(raw_path.strip())
        if not path.exists():
            continue
        profile = path
        if path.name != "profile.md":
            for parent in path.parents:
                profile_candidate = parent / "profile.md"
                if profile_candidate.exists():
                    profile = profile_candidate
                    break
        if profile not in candidates:
            candidates.append(profile)
    return candidates


def replace_field_line(lines: list[str], field: str, value: str) -> bool:
    plain_prefix = f"{field}:"
    bold_prefix = f"**{field}:**"
    for idx, line in enumerate(lines):
        if line.startswith(plain_prefix):
            lines[idx] = f"{field}: {value}"
            return True
        if line.startswith(bold_prefix):
            lines[idx] = f"**{field}:** {value}"
            return True
    return False


def append_profile_bounce_note(path: Path, emails: list[str]) -> bool:
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    existing = "\n".join(lines).lower()
    if "historical bounce sync confirmed" in existing:
        return False
    note = f"- {date.today().isoformat()}: Historical bounce sync confirmed bounced email(s): {', '.join(emails)}."
    insert_at = len(lines)
    for idx, line in enumerate(lines):
        if line.strip() == "## Notes":
            insert_at = idx + 1
            while insert_at < len(lines) and lines[insert_at].strip() == "":
                insert_at += 1
            break
    if insert_at == len(lines):
        if lines and lines[-1].strip():
            lines.append("")
        lines.append("## Notes")
        lines.append("")
        insert_at = len(lines)
    lines.insert(insert_at, note)
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return True


def update_profile(path: Path, current_outreach: str, current_status: str, should_set_bounced: bool, emails: list[str]) -> dict[str, str]:
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    changes: dict[str, str] = {}
    if should_set_bounced and current_outreach not in {"bounced", "replied"}:
        if replace_field_line(lines, "Outreach status", "bounced"):
            changes["Outreach status"] = "bounced"
        if current_status not in {"complete", "disqualified"} and replace_field_line(lines, "Status", "complete"):
            changes["Status"] = "complete"
    if replace_field_line(lines, "Last updated", date.today().isoformat()):
        changes["Last updated"] = date.today().isoformat()
    elif replace_field_line(lines, "Updated", date.today().isoformat()):
        changes["Updated"] = date.today().isoformat()
    if changes:
        path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    note_added = append_profile_bounce_note(path, emails)
    if note_added:
        changes["Notes"] = "Historical bounce sync note added"
    return changes


def load_contact_log_lines() -> list[str]:
    return CONTACT_LOG_PATH.read_text(encoding="utf-8", errors="ignore").splitlines()


def has_existing_bounce_entry(contact_log_text: str, lead_name: str, emails: list[str]) -> bool:
    haystack = contact_log_text.lower()
    if lead_name.lower() in haystack and "| email | bounced |" in haystack:
        return True
    return any(email.lower() in haystack and "| email | bounced |" in haystack for email in emails)


def append_contact_log_rows(lines: list[str], rows: list[str]) -> None:
    if lines and lines[-1].strip():
        lines.append("")
    lines.extend(rows)
    CONTACT_LOG_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> None:
    today = date.today().isoformat()
    index_rows = load_index_rows()
    annotated_index_bounces: set[str] = set()
    for row in index_rows:
        annotated_index_bounces.update(bounced_emails_annotated_in_field(row.get("Email", "")))

    bounce_records, skipped = load_bounce_records(annotated_index_bounces)
    email_to_row_indexes = build_index_email_map(index_rows)
    profile_to_row = build_profile_map(index_rows)

    safe_row_bounces: dict[int, list[BounceRecord]] = defaultdict(list)
    profile_only_bounces: dict[Path, list[BounceRecord]] = defaultdict(list)
    unmapped: list[BounceRecord] = []

    for record in bounce_records:
        row_indexes = email_to_row_indexes.get(record.email, [])
        if row_indexes:
            for idx in row_indexes:
                safe_row_bounces[idx].append(record)
            continue

        profile_paths = profile_paths_for_email(record.email)
        matched_any = False
        for profile_path in profile_paths:
            profile_key = normalize_profile_path(str(profile_path.relative_to(REPO_ROOT / "leads")))
            row_idx = profile_to_row.get(profile_key)
            if row_idx is not None:
                safe_row_bounces[row_idx].append(record)
                matched_any = True
            else:
                profile_only_bounces[profile_path].append(record)
                matched_any = True
        if not matched_any:
            unmapped.append(record)

    contact_log_lines = load_contact_log_lines()
    contact_log_text = "\n".join(contact_log_lines)
    new_contact_rows: list[str] = []

    index_updated = 0
    profile_updated = 0
    contact_log_added = 0
    detailed_changes: list[str] = []

    for row_idx, records in sorted(safe_row_bounces.items(), key=lambda item: index_rows[item[0]].get("LeadID", "")):
        row = index_rows[row_idx]
        emails = sorted({record.email for record in records})
        current_outreach = (row.get("OutreachStatus") or "").strip().lower()
        current_status = (row.get("Status") or "").strip().lower()
        should_set_bounced = current_outreach not in {"bounced", "replied"}

        row_changed = False
        if should_set_bounced:
            row["OutreachStatus"] = "bounced"
            if current_status not in {"complete", "disqualified"}:
                row["Status"] = "complete"
            row_changed = True
        if row.get("Updated", "") != today:
            row["Updated"] = today
            row_changed = True
        if row_changed:
            index_updated += 1

        profile_path = REPO_ROOT / "leads" / normalize_profile_path(row.get("ProfilePath", ""))
        profile_changes: dict[str, str] = {}
        if profile_path.exists():
            profile_changes = update_profile(profile_path, current_outreach, current_status, should_set_bounced, emails)
            if profile_changes:
                profile_updated += 1

        lead_name = row.get("Name", "") or row.get("LeadID", "")
        batch = row.get("Batch", "")
        if not has_existing_bounce_entry(contact_log_text, lead_name, emails):
            note = f"Historical bounce sync confirmed bounced email(s): {', '.join(emails)}."
            new_contact_rows.append(f"| {today} | {lead_name} | {batch} | email | bounced | {note} |")
            contact_log_added += 1
            contact_log_text += "\n" + note.lower()

        detailed_changes.append(
            f"- Lead {row.get('LeadID', '')} `{lead_name}`: emails={', '.join(emails)}; "
            f"index_changed={'yes' if row_changed else 'no'}; "
            f"profile_changed={'yes' if bool(profile_changes) else 'no'}"
        )

    if index_updated:
        with INDEX_PATH.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(index_rows[0].keys()))
            writer.writeheader()
            writer.writerows(index_rows)

    if new_contact_rows:
        append_contact_log_rows(contact_log_lines, new_contact_rows)

    profile_only_lines: list[str] = []
    for path, records in sorted(profile_only_bounces.items()):
        emails = sorted({record.email for record in records})
        profile_changes = update_profile(path, "", "", False, emails)
        if profile_changes:
            profile_updated += 1
        profile_only_lines.append(f"- `{path.as_posix()}` <- {', '.join(emails)}")

    report_lines = [
        "# Historical Bounce Sync",
        f"Generated: {today}",
        "",
        f"- Source records loaded: {len(bounce_records)}",
        f"- Skipped source rows: {len(skipped)}",
        f"- Safe row-backed mappings: {sum(len(v) for v in safe_row_bounces.values())}",
        f"- Index rows updated: {index_updated}",
        f"- Profiles updated: {profile_updated}",
        f"- Contact log rows added: {contact_log_added}",
        f"- Profile-only mappings without safe index row: {len(profile_only_bounces)}",
        f"- Still unmapped: {len(unmapped)}",
        "",
        "## Safe Updates",
        *detailed_changes,
        "",
    ]

    if profile_only_lines:
        report_lines.extend(["## Profile-Only Mappings", *profile_only_lines, ""])

    if unmapped:
        report_lines.append("## Unmapped Bounce Records")
        for record in unmapped:
            report_lines.append(f"- {record.email} ({record.source})")
        report_lines.append("")

    if skipped:
        report_lines.append("## Skipped Source Rows")
        for email in skipped:
            report_lines.append(f"- {email}")
        report_lines.append("")

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(report_lines).rstrip() + "\n", encoding="utf-8")

    print(f"Bounce records loaded: {len(bounce_records)}")
    print(f"Index rows updated: {index_updated}")
    print(f"Profiles updated: {profile_updated}")
    print(f"Contact log rows added: {contact_log_added}")
    print(f"Profile-only mappings: {len(profile_only_bounces)}")
    print(f"Unmapped: {len(unmapped)}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
