from __future__ import annotations

import argparse
import csv
import html
import re
from pathlib import Path


DEFAULT_APPROVED_IDS = [
    1045,
    1144,
    1264,
    1979,
    2019,
    2117,
    2208,
    2345,
    2828,
    3354,
    3402,
    3434,
    3711,
    6210,
    6213,
    6250,
    7216,
    8329,
]

DEFAULT_DRAFT_DIRS = [
    "outreach/drafts/safe-send-2026-03-25",
    "outreach/drafts/batch-100-worker-sprint-2026-03-09",
    "outreach/drafts/diamond-wave-38-2026-03-11",
    "outreach/drafts/gold-tier-batch-2026-03-19/txt",
]


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Prepare approved safe-send drafts for Hostinger IMAP upload.")
    ap.add_argument(
        "--worklist-tsv",
        default="tmp/safe-send-drafting-worklist-2026-03-25.tsv",
        help="TSV containing lead_id, email, and safe queue context.",
    )
    ap.add_argument(
        "--out-dir",
        default="outreach/drafts/safe-send-batch-2026-03-25",
        help="Output directory for txt/html files and manifest.csv.",
    )
    ap.add_argument(
        "--draft-dir",
        action="append",
        default=[],
        help="Draft search directory. May be passed multiple times.",
    )
    ap.add_argument(
        "--include-ids",
        default=",".join(str(v) for v in DEFAULT_APPROVED_IDS),
        help="Comma-separated lead IDs to include.",
    )
    return ap.parse_args()


def parse_subject_and_body(text: str) -> tuple[str, str]:
    lines = text.splitlines()
    subject = ""
    body_start = 0
    for idx, line in enumerate(lines):
        if line.lower().startswith("subject:"):
            subject = line.split(":", 1)[1].strip()
            body_start = idx + 1
            break
    while body_start < len(lines) and not lines[body_start].strip():
        body_start += 1
    body = "\n".join(lines[body_start:]).strip()
    if not subject or not body:
        raise ValueError("Draft missing subject or body")
    return subject, body


def body_to_html(text: str) -> str:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text.strip()) if p.strip()]
    html_parts: list[str] = []
    for p in paragraphs:
        escaped = html.escape(p, quote=False).replace("\n", "<br>\n")
        escaped = re.sub(
            r"(https?://[^\s<]+)",
            lambda m: f'<a href="{m.group(1)}" style="color:#1254a1;text-decoration:underline;">{m.group(1)}</a>',
            escaped,
        )
        escaped = re.sub(
            r"\((\d{3})\)\s*(\d{3})-(\d{4})",
            lambda m: f'<a href="tel:+1{m.group(1)}{m.group(2)}{m.group(3)}" style="color:#1254a1;text-decoration:underline;">{m.group(0)}</a>',
            escaped,
        )
        html_parts.append(f'<p style="margin:0 0 16px 0;">{escaped}</p>')
    return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:24px 12px;background:#ffffff;">
  <div style="font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;font-size:16px;line-height:1.72;max-width:620px;">
    {body}
  </div>
</body>
</html>
""".format(body="\n    ".join(html_parts))


def load_worklist(path: Path, include_ids: set[int]) -> dict[int, dict[str, str]]:
    rows: dict[int, dict[str, str]] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            lead_id = int(row["lead_id"])
            if lead_id in include_ids:
                rows[lead_id] = row
    missing = include_ids - set(rows)
    if missing:
        raise SystemExit(f"Missing lead IDs in worklist TSV: {sorted(missing)}")
    return rows


def find_draft_file(lead_id: int, draft_dirs: list[Path]) -> Path:
    patterns = [
        f"{lead_id}-*.txt",
        f"lead-{lead_id}-*.txt",
    ]
    matches: list[Path] = []
    for draft_dir in draft_dirs:
        if not draft_dir.exists():
            continue
        for pattern in patterns:
            matches.extend(sorted(draft_dir.glob(pattern)))
    if not matches:
        raise SystemExit(f"No draft file found for lead {lead_id}")
    matches.sort(key=lambda p: p.stat().st_mtime_ns, reverse=True)
    return matches[0]


def main() -> int:
    args = parse_args()
    include_ids = {int(part.strip()) for part in args.include_ids.split(",") if part.strip()}
    worklist_path = Path(args.worklist_tsv)
    out_dir = Path(args.out_dir)
    draft_dirs = [Path(p) for p in (args.draft_dir or DEFAULT_DRAFT_DIRS)]

    rows = load_worklist(worklist_path, include_ids)
    html_dir = out_dir / "html"
    txt_dir = out_dir / "txt"
    html_dir.mkdir(parents=True, exist_ok=True)
    txt_dir.mkdir(parents=True, exist_ok=True)

    manifest_rows: list[dict[str, str]] = []
    for lead_id in sorted(include_ids):
        row = rows[lead_id]
        draft_path = find_draft_file(lead_id, draft_dirs)
        draft_text = draft_path.read_text(encoding="utf-8", errors="ignore")
        subject, body = parse_subject_and_body(draft_text)

        txt_out = txt_dir / f"{lead_id}-{Path(draft_path).stem}.txt"
        html_out = html_dir / f"{lead_id}-{Path(draft_path).stem}.html"
        txt_out.write_text(body + "\n", encoding="utf-8")
        html_out.write_text(body_to_html(body), encoding="utf-8")

        manifest_rows.append(
            {
                "idx": str(lead_id),
                "email": row["email"],
                "subject": subject,
                "html_file": html_out.as_posix(),
                "txt_file": txt_out.as_posix(),
            }
        )

    manifest_path = out_dir / "manifest.csv"
    with manifest_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["idx", "email", "subject", "html_file", "txt_file"])
        writer.writeheader()
        writer.writerows(manifest_rows)

    print(f"prepared={len(manifest_rows)}")
    print(f"manifest={manifest_path.as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
