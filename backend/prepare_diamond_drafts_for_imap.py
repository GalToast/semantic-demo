#!/usr/bin/env python3
"""Prepare diamond drafts for IMAP import with compliance footer."""

import csv
import re
from pathlib import Path

REPO_ROOT = Path(".")
DRAFTS_DIR = REPO_ROOT / "outreach" / "drafts"
OUTPUT_DIR = REPO_ROOT / "outreach" / "diamond-import"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Compliance footer for TXT
TXT_FOOTER = """

---

Advertisement: This is a business outreach email from McCullough Digital.
Phone: (832) 422-8441
Mailing address: 15342 Holly Lane, Willis, TX 77378
To opt out of future emails, reply with "opt out".
"""

# Compliance footer for HTML
HTML_FOOTER = """
<div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid #eceff3; font-family: 'Segoe UI', Arial, sans-serif; color: #68758a; font-size: 12px; line-height: 1.65;">
  <p style="margin: 0 0 4px 0;">Advertisement: This is a business outreach email from McCullough Digital.</p>
  <p style="margin: 0 0 4px 0;">Phone: (832) 422-8441</p>
  <p style="margin: 0 0 4px 0;">Mailing address: 15342 Holly Lane, Willis, TX 77378</p>
  <p style="margin: 0;">To opt out of future emails, reply with "opt out".</p>
</div>
"""

HTML_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 24px 12px; background: #ffffff;">
  <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; font-size: 16px; line-height: 1.72; max-width: 620px;">
    {body}
    {footer}
  </div>
</body>
</html>
"""


def parse_draft(txt_path: Path) -> tuple[str, str, str]:
    """Parse a draft txt file and return (to, subject, body)."""
    content = txt_path.read_text(encoding="utf-8")
    lines = content.strip().split("\n")
    
    to_addr = ""
    subject = ""
    body_lines = []
    in_body = False
    
    for line in lines:
        if line.lower().startswith("to:"):
            to_addr = line.split(":", 1)[1].strip()
        elif line.lower().startswith("subject:"):
            subject = line.split(":", 1)[1].strip()
        elif in_body or (to_addr and subject and line.strip() == ""):
            in_body = True
            body_lines.append(line)
    
    body = "\n".join(body_lines).strip()
    return to_addr, subject, body


def html_escape(s: str) -> str:
    """Escape HTML special characters."""
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def body_to_html(body: str) -> str:
    """Convert plain text body to HTML paragraphs."""
    paragraphs = body.split("\n\n")
    html_parts = []
    for p in paragraphs:
        p = p.strip()
        if not p:
            continue
        # Escape HTML
        p = html_escape(p)
        # Convert single newlines to <br>
        p = p.replace("\n", "<br>\n")
        # Linkify URLs
        p = re.sub(r'(https?://[^\s<]+)', r'<a href="\1" style="color: #1254a1; text-decoration: underline;">\1</a>', p)
        # Linkify email
        p = re.sub(r'([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})', r'<a href="mailto:\1" style="color: #1254a1; text-decoration: underline;">\1</a>', p)
        html_parts.append(f'<p style="margin: 0 0 16px 0;">{p}</p>')
    return "\n".join(html_parts)


def process_draft(txt_path: Path) -> dict | None:
    """Process a draft file and return CSV row data."""
    to_addr, subject, body = parse_draft(txt_path)
    
    if not to_addr or not subject:
        print(f"SKIP {txt_path.name}: missing to or subject")
        return None
    
    # Create TXT with footer
    txt_with_footer = body + TXT_FOOTER
    txt_out = OUTPUT_DIR / f"{txt_path.stem}.txt"
    txt_out.write_text(txt_with_footer, encoding="utf-8")
    
    # Create HTML with footer
    body_html = body_to_html(body)
    html_content = HTML_TEMPLATE.format(body=body_html, footer=HTML_FOOTER)
    html_out = OUTPUT_DIR / f"{txt_path.stem}.html"
    html_out.write_text(html_content, encoding="utf-8")
    
    return {
        "idx": txt_path.stem,
        "email": to_addr,
        "subject": subject,
        "html_file": str(html_out),
        "txt_file": str(txt_out),
    }


def main():
    # Get all diamond draft txt files
    txt_files = sorted(DRAFTS_DIR.glob("*.txt"))
    rows = []
    
    for txt_path in txt_files:
        row = process_draft(txt_path)
        if row:
            rows.append(row)
            print(f"OK {txt_path.name} -> {row['email']}")
    
    # Write CSV
    csv_path = OUTPUT_DIR / "diamond-import.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["idx", "email", "subject", "html_file", "txt_file"])
        writer.writeheader()
        writer.writerows(rows)
    
    print(f"\nProcessed {len(rows)} drafts")
    print(f"CSV: {csv_path}")
    print(f"TXT/HTML files: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()