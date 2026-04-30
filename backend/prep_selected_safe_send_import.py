from __future__ import annotations

import argparse
import csv
import html
import re
import sqlite3
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"
DEFAULT_DRAFT_DIR = REPO_ROOT / "outreach" / "drafts" / "safe-send-2026-03-25"


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Prepare a selected safe-send draft batch for Hostinger IMAP import.")
    ap.add_argument("--ids", required=True, help="Comma-separated lead IDs to include.")
    ap.add_argument("--db", default=str(DEFAULT_DB))
    ap.add_argument("--draft-dir", default=str(DEFAULT_DRAFT_DIR))
    ap.add_argument("--out-dir", default=str(REPO_ROOT / "outreach" / "drafts" / "safe-send-import-next"))
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
        raise SystemExit("Draft missing subject or body")
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


def main() -> int:
    args = parse_args()
    ids = [int(part.strip()) for part in args.ids.split(",") if part.strip()]
    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row

    email_rows = {
        int(row["lead_id"]): dict(row)
        for row in conn.execute(
            f"SELECT lead_id, email FROM leadops_leads WHERE lead_id IN ({','.join('?' for _ in ids)})",
            ids,
        ).fetchall()
    }
    missing = [lead_id for lead_id in ids if lead_id not in email_rows or not (email_rows[lead_id].get("email") or "").strip()]
    if missing:
        raise SystemExit(f"Missing email rows for lead IDs: {missing}")

    draft_dir = Path(args.draft_dir)
    out_dir = Path(args.out_dir)
    html_dir = out_dir / "html"
    txt_dir = out_dir / "txt"
    html_dir.mkdir(parents=True, exist_ok=True)
    txt_dir.mkdir(parents=True, exist_ok=True)

    manifest_rows: list[dict[str, str]] = []
    for lead_id in ids:
        matches = sorted(draft_dir.glob(f"{lead_id}-*.txt"))
        if not matches:
            raise SystemExit(f"No safe-send draft file found for lead {lead_id}")
        draft_path = matches[0]
        draft_text = draft_path.read_text(encoding="utf-8", errors="ignore")
        subject, body = parse_subject_and_body(draft_text)

        txt_out = txt_dir / draft_path.name
        html_out = html_dir / draft_path.with_suffix(".html").name
        txt_out.write_text(body + "\n", encoding="utf-8")
        html_out.write_text(body_to_html(body), encoding="utf-8")

        manifest_rows.append(
            {
                "idx": str(lead_id),
                "email": email_rows[lead_id]["email"],
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
