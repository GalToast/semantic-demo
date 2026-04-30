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
class DraftRow:
    uid: str
    to: str
    subject: str
    lead: str
    profile: str


def main() -> None:
    parser = argparse.ArgumentParser(description="List Hostinger drafts missing real signature hyperlink, based on tmp/hostinger_drafts_qa_*.json.")
    parser.add_argument("--qa-json", default=None, help="Path to tmp/hostinger_drafts_qa_YYYY-MM-DD.json (default: latest).")
    parser.add_argument("--out", default=None, help="Output queue markdown path.")
    args = parser.parse_args()

    qa_path = Path(args.qa_json) if args.qa_json else latest_tmp_json("hostinger_drafts_qa")
    data = json.loads(qa_path.read_text(encoding="utf-8", errors="ignore"))
    drafts = data.get("drafts", []) or []

    rows: list[DraftRow] = []
    for d in drafts:
        if d.get("skip"):
            continue
        issues = d.get("issues") or []
        if "signature_link_missing" not in issues:
            continue
        chosen = d.get("chosen_lead") or {}
        lead = ""
        profile = ""
        if chosen and chosen.get("lead_id"):
            lead = f"{chosen.get('lead_id')} {chosen.get('name','')}".strip()
            profile = norm(chosen.get("profile"))
        rows.append(
            DraftRow(
                uid=norm(d.get("uid")),
                to=norm(d.get("to")),
                subject=norm(d.get("subject")),
                lead=lead,
                profile=profile,
            )
        )

    today = date.today().isoformat()
    out_path = Path(args.out) if args.out else (OUTREACH_QUEUES / f"drafts-missing-signature-link-{today}.md")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    lines.append("# Drafts Missing Signature Link")
    lines.append(f"Generated: {today}")
    lines.append("")
    lines.append(f"- QA source: `{qa_path.as_posix()}`")
    lines.append(f"- Drafts needing signature hyperlink fix: {len(rows)}")
    lines.append("")
    lines.append("| To | Subject | Lead | Profile |")
    lines.append("| --- | --- | --- | --- |")
    for r in rows:
        lines.append(f"| {r.to} | {r.subject} | {r.lead} | `{r.profile}` |")
    lines.append("")
    out_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote: {out_path}")


if __name__ == "__main__":
    main()

