from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
OUTREACH_DIR = REPO_ROOT / "outreach"
QUEUES_DIR = OUTREACH_DIR / "queues"
DRAFTS_DIR = OUTREACH_DIR / "drafts"


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
    contact_form: str
    phone: str
    diagnostic: str


def build_message(*, lead: str, bounced_email: str, diagnostic: str) -> str:
    diag_line = ""
    if diagnostic:
        diag_short = " ".join(diagnostic.split())
        if len(diag_short) > 140:
            diag_short = diag_short[:137] + "..."
        diag_line = f" (it came back as: {diag_short})"

    lines: list[str] = []
    lines.append(f"Hi {lead} team,")
    lines.append("")
    lines.append(f"Quick follow-up: I tried reaching you at {bounced_email} but it bounced back{diag_line}.")
    lines.append("If there is a better email address for you, could you share it?")
    lines.append("")
    lines.append(
        "I am local to the area and I had a quick note about your website that could help prevent avoidable issues for you and for customers. Happy to share details."
    )
    lines.append("")
    lines.append("Best,")
    lines.append("Fred McCullough")
    lines.append("McCullough Digital")
    return "\n".join(lines)


def append_profile_log(profile_path: str, *, today: str, form_url: str) -> None:
    p = Path(profile_path)
    if not p.exists():
        return

    text = p.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()

    log_line = f"- {today}: Prepared contact-form follow-up message (not submitted yet). Form: {form_url}"
    if log_line in text:
        return

    # Update Last updated in-place (do not reformat the whole header).
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
    parser = argparse.ArgumentParser(
        description="Draft website contact-form follow-up messages for bounced leads (no submission)."
    )
    parser.add_argument(
        "--queue",
        default=str(QUEUES_DIR / f"bounced-followup-use-contact-form-{date.today().isoformat()}.md"),
        help="Path to bounced-followup-use-contact-form-*.md",
    )
    parser.add_argument(
        "--out",
        default=str(DRAFTS_DIR / f"bounced-followup-use-contact-form-drafts-{date.today().isoformat()}.md"),
        help="Output drafts file (markdown).",
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
                contact_form=norm(r.get("Contact Form")),
                phone=norm(r.get("Phone")),
                diagnostic=norm(r.get("Diagnostic")),
            )
        )

    today = date.today().isoformat()
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    lines.append("# Bounced Follow-Up: Contact-Form Messages (Draft-Only)")
    lines.append(f"Generated: {today}")
    lines.append(f"Source queue: `{queue_path.as_posix()}`")
    lines.append("")
    lines.append("Rule: do not submit forms yet. These are copy/paste drafts for tomorrow.")
    lines.append("")

    for row in rows:
        lines.append(f"## {row.lead_id} {row.lead}")
        lines.append("")
        lines.append(f"- Batch: `{row.batch}`")
        lines.append(f"- Profile: `{row.profile}`")
        lines.append(f"- Contact form: {row.contact_form or 'unknown'}")
        if row.phone:
            lines.append(f"- Phone: {row.phone}")
        if row.bounced_email:
            lines.append(f"- Bounced email: {row.bounced_email}")
        lines.append("")
        lines.append("Suggested form fields:")
        lines.append("- Name: Fred McCullough")
        lines.append("- Email: fred@mccullough.digital")
        lines.append("")
        lines.append("Message:")
        lines.append("```text")
        lines.append(
            build_message(
                lead=row.lead or "there",
                bounced_email=row.bounced_email or "your email",
                diagnostic=row.diagnostic,
            )
        )
        lines.append("```")
        lines.append("")

        if row.profile and row.contact_form:
            append_profile_log(row.profile, today=today, form_url=row.contact_form)

    out_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(out_path.as_posix())


if __name__ == "__main__":
    main()
