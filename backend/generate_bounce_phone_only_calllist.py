from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
OUTREACH_DIR = REPO_ROOT / "outreach"
QUEUES_DIR = OUTREACH_DIR / "queues"


def norm(s: str | None) -> str:
    return (s or "").strip()


def parse_markdown_table(path: Path) -> list[dict[str, str]]:
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    header_idx = None
    for i, line in enumerate(lines):
        if line.strip().startswith("|") and i + 1 < len(lines):
            if set(lines[i + 1].replace("|", "").strip()) <= {"-", " "}:
                header_idx = i
                break
    if header_idx is None:
        return []

    cols = [c.strip() for c in lines[header_idx].strip().strip("|").split("|")]
    rows: list[dict[str, str]] = []
    for line in lines[header_idx + 2 :]:
        if not line.strip().startswith("|"):
            break
        parts = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(parts) != len(cols):
            continue
        rows.append(dict(zip(cols, parts)))
    return rows


@dataclass(frozen=True)
class Row:
    lead_id: str
    lead: str
    batch: str
    profile: str
    bounced_email: str
    phone: str
    diagnostic: str


def append_profile_log(profile_path: str, *, today: str) -> None:
    p = Path(profile_path)
    if not p.exists():
        return
    text = p.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()

    log_line = f"- {today}: Queued phone follow-up due to email bounce (no additional email path)."
    if log_line in text:
        return

    # Update Last updated.
    out: list[str] = []
    replaced_last = False
    for ln in lines:
        if re.match(r"^Last updated\s*:", ln, re.IGNORECASE):
            out.append(f"Last updated: {today}")
            replaced_last = True
        else:
            out.append(ln)
    if not replaced_last:
        insert_at = 1 if out and out[0].startswith("# ") else 0
        out[insert_at:insert_at] = [f"Last updated: {today}"]
    lines = out

    lower_lines = [ln.strip().lower() for ln in lines]
    if "## outreach log" in lower_lines:
        idx = lower_lines.index("## outreach log") + 1
        while idx < len(lines) and lines[idx].strip() == "":
            idx += 1
        lines.insert(idx, log_line)
    else:
        insert_at = len(lines)
        for i, ln in enumerate(lines):
            if ln.strip().lower() == "## evidence":
                insert_at = i
                break
        block = ["", "## Outreach log", log_line, ""]
        lines[insert_at:insert_at] = block

    p.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a call list for bounced leads that require phone follow-up.")
    parser.add_argument(
        "--queue",
        default=str(QUEUES_DIR / f"bounced-followup-phone-only-{date.today().isoformat()}.md"),
        help="Path to bounced-followup-phone-only-*.md",
    )
    parser.add_argument(
        "--out",
        default=str(QUEUES_DIR / f"bounced-followup-phone-only-calllist-{date.today().isoformat()}.md"),
        help="Output call list (markdown).",
    )
    args = parser.parse_args()

    queue_path = Path(args.queue)
    if not queue_path.exists():
        raise SystemExit(f"Missing queue: {queue_path.as_posix()}")

    raw_rows = parse_markdown_table(queue_path)
    rows: list[Row] = []
    for r in raw_rows:
        rows.append(
            Row(
                lead_id=norm(r.get("LeadID")),
                lead=norm(r.get("Lead")),
                batch=norm(r.get("Batch")),
                profile=norm(r.get("Profile")),
                bounced_email=norm(r.get("Bounced Email")),
                phone=norm(r.get("Phone")),
                diagnostic=norm(r.get("Diagnostic")),
            )
        )

    today = date.today().isoformat()
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    lines.append("# Bounced Follow-Up: Phone Call List")
    lines.append(f"Generated: {today}")
    lines.append(f"Source queue: `{queue_path.as_posix()}`")
    lines.append("")
    lines.append("Rule: phone follow-up only. Do not email again unless a verified alternate email is found.")
    lines.append("")
    lines.append("Call script (short):")
    lines.append("- Hi, this is Fred with McCullough Digital in Conroe.")
    lines.append("- I tried emailing you but it bounced, so I wanted to confirm the best email for the business.")
    lines.append("- I also have a quick note about your website that could prevent avoidable issues, happy to share details.")
    lines.append("")

    lines.append("| LeadID | Lead | Batch | Phone | Profile | Bounced Email | Notes |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- |")
    for row in rows:
        lines.append(
            f"| {row.lead_id} | {row.lead} | {row.batch} | {row.phone or 'unknown'} | {row.profile} | {row.bounced_email or ''} |  |"
        )

        if row.profile:
            append_profile_log(row.profile, today=today)

    lines.append("")

    out_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(out_path.as_posix())


if __name__ == "__main__":
    main()

