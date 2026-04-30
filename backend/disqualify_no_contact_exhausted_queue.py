from __future__ import annotations

import argparse
import re
import shutil
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")


def update_header_field(lines: list[str], label: str, value: str) -> None:
    prefix = f"{label}:"
    for i, line in enumerate(lines[:120]):
        if line.startswith(prefix):
            lines[i] = f"{prefix} {value}".rstrip()
            return
    # Insert near the top if missing.
    insert_after = 0
    for key in (
        "Status:",
        "Outreach status:",
        "Contact path:",
        "Social check:",
        "Batch:",
        "Batch line:",
        "Source:",
        "Address:",
    ):
        for i, line in enumerate(lines[:60]):
            if line.startswith(key):
                insert_after = max(insert_after, i)
    lines.insert(insert_after + 1, f"{prefix} {value}".rstrip())


def append_note(text: str, note: str, stamp: str) -> str:
    if stamp in text:
        return text
    for header in ("## Updates", "## Notes"):
        idx = text.find(header)
        if idx != -1:
            after = idx + len(header)
            next_hdr = text.find("\n## ", after)
            if next_hdr == -1:
                return text.rstrip() + "\n\n" + note.strip() + "\n"
            return text[:next_hdr].rstrip() + "\n" + note.strip() + "\n\n" + text[next_hdr:].lstrip()
    return text.rstrip() + "\n\n## Notes\n" + note.strip() + "\n"


@dataclass(frozen=True)
class QueueRow:
    lead_id: int
    name: str
    profile_path: Path


def parse_md_table(path: Path) -> list[QueueRow]:
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    header_idx = None
    for i, line in enumerate(lines):
        if line.strip().startswith("|") and "|" in line.strip()[1:]:
            if i + 1 < len(lines) and set(lines[i + 1].replace("|", "").strip()) <= {"-", " "}:
                header_idx = i
                break
    if header_idx is None:
        raise SystemExit(f"No markdown table found in {path.as_posix()}")

    cols = [c.strip() for c in lines[header_idx].strip("|").split("|")]
    lead_idx = cols.index("LeadID") if "LeadID" in cols else 0
    name_idx = cols.index("Name") if "Name" in cols else 1
    profile_idx = cols.index("Profile") if "Profile" in cols else (len(cols) - 1)

    out: list[QueueRow] = []
    for line in lines[header_idx + 2 :]:
        if not line.strip().startswith("|"):
            break
        parts = [c.strip() for c in line.strip().strip("|").split("|")]
        if not parts or len(parts) != len(cols):
            continue
        lead_raw = parts[lead_idx]
        if not lead_raw.isdigit():
            continue
        out.append(
            QueueRow(
                lead_id=int(lead_raw),
                name=parts[name_idx],
                profile_path=Path(parts[profile_idx]),
            )
        )
    return out


def range_dir(lead_id: int) -> str:
    lo = (lead_id // 100) * 100
    hi = lo + 99
    return f"{lo:03d}-{hi:03d}"


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Move no-contact exhausted leads from leads/profiles to leads/disqualified (with stamped note)."
    )
    ap.add_argument("--queue", required=True, help="Queue md path with a Profile column.")
    ap.add_argument("--apply", action="store_true", help="Perform writes and moves.")
    ap.add_argument("--report", default="", help="Report path (md).")
    args = ap.parse_args()

    queue_path = Path(args.queue)
    rows = parse_md_table(queue_path)
    today = date.today().isoformat()
    report_path = Path(args.report) if args.report else Path("reports") / f"disqualify-no-contact-exhausted-{today}.md"

    report: list[str] = []
    report.append("# Disqualify: No-Contact Exhausted Queue")
    report.append(f"Generated: {today}")
    report.append(f"Queue: `{queue_path.as_posix()}`")
    report.append(f"Apply: `{'yes' if args.apply else 'no'}`")
    report.append("")

    moved = 0
    skipped = 0
    missing = 0
    conflicted = 0
    errors = 0

    for qr in rows:
        profile_path = qr.profile_path
        if not profile_path.exists():
            report.append(f"- {qr.lead_id} {qr.name}: MISSING profile `{profile_path.as_posix()}`")
            missing += 1
            continue

        # Only move profile directories that are currently in leads/profiles.
        try:
            rel = profile_path.resolve().relative_to((REPO_ROOT / "leads" / "profiles").resolve())
        except Exception:
            report.append(f"- {qr.lead_id} {qr.name}: SKIP (not under leads/profiles) `{profile_path.as_posix()}`")
            skipped += 1
            continue

        src_dir = profile_path.parent
        dst_dir = REPO_ROOT / "leads" / "disqualified" / range_dir(qr.lead_id) / src_dir.name
        dst_profile = dst_dir / profile_path.name

        if dst_dir.exists():
            report.append(f"- {qr.lead_id} {qr.name}: SKIP (destination exists) `{dst_dir.as_posix()}`")
            skipped += 1
            continue

        try:
            original = profile_path.read_text(encoding="utf-8", errors="ignore")
        except Exception as e:
            report.append(f"- {qr.lead_id} {qr.name}: ERROR reading: {type(e).__name__} {str(e)[:120]}")
            errors += 1
            continue

        # Ensure it's marked disqualified and add a note.
        lines = original.splitlines()
        update_header_field(lines, "Status", "disqualified")
        update_header_field(lines, "Last updated", today)

        stamp = f"No-contact exhausted disqualification: {today}"
        note = (
            f"- **{today}**: {stamp}. No public email/phone/website/form/social found after research pass. "
            f"Moved to `leads/disqualified/` to keep outreach queues clean (can be re-scanned later)."
        )
        updated = "\n".join(lines) + "\n"
        updated = append_note(updated, note, stamp)

        if args.apply:
            # Concurrency guard: re-read before write+move so we don't stomp parallel edits.
            try:
                latest = profile_path.read_text(encoding="utf-8", errors="ignore")
            except Exception as e:
                report.append(f"- {qr.lead_id} {qr.name}: ERROR re-reading: {type(e).__name__} {str(e)[:120]}")
                errors += 1
                continue
            if latest != original:
                report.append(f"- {qr.lead_id} {qr.name}: SKIP (conflict: file changed since read)")
                conflicted += 1
                continue

            try:
                profile_path.write_text(updated, encoding="utf-8")
                dst_dir.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(src_dir), str(dst_dir))
            except Exception as e:
                report.append(f"- {qr.lead_id} {qr.name}: ERROR move/write: {type(e).__name__} {str(e)[:160]}")
                errors += 1
                continue

        report.append(f"- {qr.lead_id} {qr.name}: MOVE -> `{dst_profile.as_posix()}`")
        moved += 1

    report.append("")
    report.append("## Summary")
    report.append(f"- In queue: {len(rows)}")
    report.append(f"- Moved: {moved}")
    report.append(f"- Skipped: {skipped}")
    report.append(f"- Missing: {missing}")
    report.append(f"- Conflicts: {conflicted}")
    report.append(f"- Errors: {errors}")
    report.append("")

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(report), encoding="utf-8")
    print(f"Wrote report: {report_path.as_posix()}")
    print(f"Moved: {moved} (apply={args.apply})")


if __name__ == "__main__":
    main()

