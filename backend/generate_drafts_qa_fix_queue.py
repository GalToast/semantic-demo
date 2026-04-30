from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
TMP_DIR = REPO_ROOT / "tmp"
OUTREACH_QUEUES = REPO_ROOT / "outreach" / "queues"


def latest_tmp_json(prefix: str) -> Path:
    files = sorted(TMP_DIR.glob(f"{prefix}_*.json"))
    if not files:
        raise SystemExit(f"Missing tmp/{prefix}_*.json")
    return max(files, key=lambda p: p.stat().st_mtime)


def norm(s: str | None) -> str:
    return (s or "").strip()


@dataclass
class Row:
    uid: str
    to: str
    subject: str
    issues: list[str]
    lead: str
    profile: str


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a Hostinger Drafts 'needs fix' queue from tmp/hostinger_drafts_qa_*.json.")
    parser.add_argument("--qa-json", default=None, help="Path to tmp/hostinger_drafts_qa_YYYY-MM-DD.json (default: latest).")
    parser.add_argument("--out", default=None, help="Output queue markdown path.")
    args = parser.parse_args()

    qa_path = Path(args.qa_json) if args.qa_json else latest_tmp_json("hostinger_drafts_qa")
    data = json.loads(qa_path.read_text(encoding="utf-8", errors="ignore"))
    drafts = data.get("drafts", []) or []

    rows: list[Row] = []
    for d in drafts:
        if d.get("skip"):
            continue
        issues = d.get("issues") or []
        if not issues:
            continue
        chosen = d.get("chosen_lead") or {}
        lead = ""
        profile = ""
        if chosen and chosen.get("lead_id"):
            lead = f"{chosen.get('lead_id')} {chosen.get('name','')}".strip()
            profile = norm(chosen.get("profile"))
        rows.append(
            Row(
                uid=norm(d.get("uid")),
                to=norm(d.get("to")),
                subject=norm(d.get("subject")),
                issues=[norm(x) for x in issues],
                lead=lead,
                profile=profile,
            )
        )

    today = date.today().isoformat()
    out_path = Path(args.out) if args.out else (OUTREACH_QUEUES / f"drafts-qa-needs-fix-{today}.md")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Basic issue counts.
    counts: dict[str, int] = {}
    for r in rows:
        for i in r.issues:
            counts[i] = counts.get(i, 0) + 1

    lines: list[str] = []
    lines.append("# Drafts QA Needs Fix")
    lines.append(f"Generated: {today}")
    lines.append("")
    lines.append(f"- QA source: `{qa_path.as_posix()}`")
    lines.append(f"- Drafts flagged: {len(rows)}")
    if counts:
        lines.append("- Issue counts:")
        for k in sorted(counts.keys()):
            lines.append(f"  - {k}: {counts[k]}")
    lines.append("")
    lines.append("## Queue (Open Each Draft In Hostinger And Fix)")
    lines.append("| To | Subject | Lead | Issues | Profile |")
    lines.append("| --- | --- | --- | --- | --- |")
    for r in rows:
        issues = ", ".join(r.issues)
        lines.append(f"| {r.to} | {r.subject} | {r.lead} | {issues} | `{r.profile}` |")
    lines.append("")
    lines.append("## Fix Rules")
    lines.append("- `signature_link_missing`: ensure signature includes a clickable `McCullough Digital` link to `https://mccullough.digital/`.")
    lines.append("- `forbidden_chars`: remove any em-dash/en-dash characters (replace with periods or commas).")
    lines.append("- `ai_phrase_flags`: rewrite flagged phrases to sound human and specific.")
    lines.append("- `truth_check_flags`: either verify the claim in the lead profile/evidence, or soften the wording so it is unquestionably true.")
    lines.append("- `sent_overlap`: do not send until we confirm whether a prior email already went out to that recipient or lead.")
    lines.append("")

    out_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote: {out_path}")


if __name__ == "__main__":
    main()
