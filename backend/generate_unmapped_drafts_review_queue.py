from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
TMP_DIR = REPO_ROOT / "tmp"
OUT_DIR = REPO_ROOT / "outreach" / "queues"


def latest_tmp_json(prefix: str) -> Path:
    files = sorted(TMP_DIR.glob(f"{prefix}_*.json"))
    if not files:
        raise SystemExit(f"Missing tmp/{prefix}_*.json")
    return max(files, key=lambda p: p.stat().st_mtime)


def norm(s: str | None) -> str:
    return (s or "").strip()


@dataclass
class Row:
    to: str
    subject: str
    claim_tags: list[str]
    recommended: str


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a review queue for drafts whose recipients are not mapped to leads/index.csv.")
    parser.add_argument("--qa-json", default=None, help="Path to tmp/hostinger_drafts_qa_YYYY-MM-DD.json (default: latest).")
    parser.add_argument("--out", default=None, help="Output markdown path (default: outreach/queues/unmapped-drafts-review-YYYY-MM-DD.md).")
    args = parser.parse_args()

    qa_path = Path(args.qa_json) if args.qa_json else latest_tmp_json("hostinger_drafts_qa")
    data = json.loads(qa_path.read_text(encoding="utf-8", errors="ignore"))
    drafts = data.get("drafts", []) or []

    rows: list[Row] = []
    for d in drafts:
        if d.get("skip"):
            continue
        mapped = d.get("mapped_leads") or []
        chosen = d.get("chosen_lead")
        if mapped or chosen:
            continue
        claim_tags = [norm(x) for x in (d.get("claim_tags") or []) if norm(x)]
        # If we are unmapped and making concrete claims, we should hold until verified/mapped.
        recommended = "send_ok" if not claim_tags else "hold_needs_verification"
        rows.append(
            Row(
                to=norm(d.get("to")),
                subject=norm(d.get("subject")),
                claim_tags=claim_tags,
                recommended=recommended,
            )
        )

    today = date.today().isoformat()
    out_path = Path(args.out) if args.out else (OUT_DIR / f"unmapped-drafts-review-{today}.md")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    counts = {"send_ok": 0, "hold_needs_verification": 0}
    for r in rows:
        counts[r.recommended] = counts.get(r.recommended, 0) + 1

    lines: list[str] = []
    lines.append("# Unmapped Drafts Review")
    lines.append(f"Generated: {today}")
    lines.append("")
    lines.append(f"- QA source: `{qa_path.as_posix()}`")
    lines.append(f"- Unmapped drafts: {len(rows)}")
    lines.append(f"- Recommended send: {counts.get('send_ok', 0)}")
    lines.append(f"- Hold for verification: {counts.get('hold_needs_verification', 0)}")
    lines.append("")
    lines.append("| To | Subject | Claim Tags | Recommended |")
    lines.append("| --- | --- | --- | --- |")
    for r in rows:
        tags = ", ".join(r.claim_tags) if r.claim_tags else ""
        lines.append(f"| {r.to} | {r.subject} | {tags} | {r.recommended} |")
    lines.append("")
    out_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote: {out_path}")


if __name__ == "__main__":
    main()

