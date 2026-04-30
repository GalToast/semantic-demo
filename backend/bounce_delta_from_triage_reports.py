from __future__ import annotations

import argparse
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
REPORTS_DIR = REPO_ROOT / "reports"
QUEUES_DIR = REPO_ROOT / "outreach" / "queues"


@dataclass(frozen=True)
class BounceRow:
    lead_id: str
    name: str
    batch: str
    bounced_email: str
    msg_date: str
    dsn: str
    cls: str
    next_action: str
    profile: str


def parse_triage_report(path: Path) -> list[BounceRow]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()

    # Find the "Matched Bounces" markdown table header.
    start = None
    for i, line in enumerate(lines):
        if line.strip().startswith("| LeadID |") and "Bounced Email" in line:
            start = i
            break
    if start is None:
        return []

    # Skip separator line
    i = start + 2
    out: list[BounceRow] = []
    while i < len(lines):
        line = lines[i].strip()
        if not line.startswith("|"):
            break
        parts = [p.strip() for p in line.strip("|").split("|")]
        if len(parts) < 9:
            i += 1
            continue
        out.append(
            BounceRow(
                lead_id=parts[0],
                name=parts[1],
                batch=parts[2],
                bounced_email=parts[3],
                msg_date=parts[4],
                dsn=parts[5],
                cls=parts[6],
                next_action=parts[7],
                profile=parts[8],
            )
        )
        i += 1
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Compute delta between two Hostinger bounce triage reports.")
    parser.add_argument("--old", required=True, help="Old triage report path.")
    parser.add_argument("--new", required=True, help="New triage report path.")
    parser.add_argument("--out-report", default=None, help="Output markdown report path.")
    parser.add_argument("--out-queue", default=None, help="Output markdown queue path (delta only).")
    args = parser.parse_args()

    old_path = Path(args.old)
    new_path = Path(args.new)
    old_rows = parse_triage_report(old_path)
    new_rows = parse_triage_report(new_path)

    old_keys = {(r.lead_id, r.bounced_email.lower()) for r in old_rows}
    delta = [r for r in new_rows if (r.lead_id, r.bounced_email.lower()) not in old_keys]

    today = date.today().isoformat()
    out_report = Path(args.out_report) if args.out_report else (REPORTS_DIR / f"hostinger-bounce-delta-{today}.md")
    out_queue = Path(args.out_queue) if args.out_queue else (QUEUES_DIR / f"bounced-followup-delta-{today}.md")
    out_report.parent.mkdir(parents=True, exist_ok=True)
    out_queue.parent.mkdir(parents=True, exist_ok=True)

    grouped: dict[str, list[BounceRow]] = defaultdict(list)
    for r in delta:
        grouped[r.next_action].append(r)

    lines: list[str] = []
    lines.append("# Hostinger Bounce Delta")
    lines.append(f"Generated: {today}")
    lines.append("")
    lines.append(f"- Old: `{old_path.as_posix()}` ({len(old_rows)} matched rows)")
    lines.append(f"- New: `{new_path.as_posix()}` ({len(new_rows)} matched rows)")
    lines.append(f"- Delta (newly seen): {len(delta)}")
    lines.append("")

    if delta:
        lines.append("## Newly Seen Bounces (Grouped By Next Action)")
        for action in sorted(grouped.keys()):
            lines.append(f"### {action} ({len(grouped[action])})")
            for r in grouped[action]:
                lines.append(f"- {r.lead_id} | {r.name} | {r.bounced_email} | {r.msg_date} | {r.cls} | {r.profile}")
            lines.append("")

        lines.append("## Delta Table")
        lines.append("| LeadID | Lead | Batch | Profile | Bounced Email | Class | Next Action | Date | DSN |")
        lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
        for r in delta:
            lines.append(
                "| "
                + " | ".join(
                    [
                        r.lead_id,
                        r.name.replace("|", "\\|"),
                        r.batch,
                        r.profile.replace("|", "\\|"),
                        r.bounced_email,
                        r.cls,
                        r.next_action,
                        r.msg_date,
                        r.dsn,
                    ]
                )
                + " |"
            )
        lines.append("")
    else:
        lines.append("No newly-seen bounces in the new report compared to the old report.")
        lines.append("")

    out_report.write_text("\n".join(lines), encoding="utf-8")

    # Queue output: keep it simple and compatible with split_bounced_followup_queue.py (needs a Next Action column).
    q: list[str] = []
    q.append("# Bounced Follow-Up Queue (Delta)")
    q.append("")
    q.append(f"Generated: {today}")
    q.append(f"Source old: {old_path.as_posix()}")
    q.append(f"Source new: {new_path.as_posix()}")
    q.append(f"Total: {len(delta)}")
    q.append("")
    q.append("| LeadID | Lead | Batch | Profile | Bounced Email | Class | Next Action | Contact Form | Phone | Alt Emails | Diagnostic |")
    q.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    # We don't have Contact Form/Phone/Alt Emails/Diagnostic in the triage report; leave blank.
    for r in delta:
        q.append(
            "| "
            + " | ".join(
                [
                    r.lead_id,
                    r.name.replace("|", "\\|"),
                    r.batch,
                    r.profile.replace("|", "\\|"),
                    r.bounced_email,
                    r.cls,
                    r.next_action,
                    "",
                    "",
                    "",
                    "",
                ]
            )
            + " |"
        )
    q.append("")
    out_queue.write_text("\n".join(q), encoding="utf-8")
    print(f"Wrote: {out_report}")
    print(f"Wrote: {out_queue}")


if __name__ == "__main__":
    main()

