"""Prepare gold-tier drafts for Hostinger IMAP upload."""
from __future__ import annotations

import csv
import json
from pathlib import Path

# Compliance footer
HTML_FOOTER = '''
<p style="margin:18px 0 0 0;font-family:'Segoe UI',Arial,sans-serif;color:#68758a;font-size:12px;line-height:1.65;border-top:1px solid #eceff3;padding-top:18px;">
Advertisement: This is a business outreach email from McCullough Digital.<br>
Phone: (832) 422-8441<br>
Mailing address: 15342 Holly Lane, Willis, TX 77318<br>
To stop receiving these emails, reply with "opt out" in the subject line.
</p>'''

TXT_FOOTER = '''
--
Advertisement: This is a business outreach email from McCullough Digital.
Phone: (832) 422-8441
Mailing address: 15342 Holly Lane, Willis, TX 77318
To stop receiving these emails, reply with "opt out" in the subject line.
'''


def build_html(draft: dict) -> str:
    """Build HTML version with light styling."""
    body = draft['body'].replace('\n', '<br>\n')
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#ffffff;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;max-width:620px;background:#ffffff;">
          <tr>
            <td style="padding:0;font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;font-size:16px;line-height:1.72;">
              <p style="margin:0 0 16px 0;">{body}</p>
              <p style="margin:22px 0 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;color:#31425b;">
                Fred McCullough<br>
                <a href="https://mccullough.digital" style="color:#1254a1;text-decoration:underline;">mccullough.digital</a><br>
                <a href="tel:8324228441" style="color:#1254a1;text-decoration:underline;">(832) 422-8441</a>
              </p>
            </td>
          </tr>
          <tr>
            <td>{HTML_FOOTER}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>'''


def build_txt(draft: dict) -> str:
    """Build plain text version."""
    return f"{draft['body']}\n{TXT_FOOTER}"


def main() -> int:
    # Load clean drafts
    input_path = Path('outreach/drafts/gold-tier-clean-2026-03-19.json')
    data = json.load(open(input_path, encoding='utf-8'))
    drafts = data['drafts']

    # Create output directories
    output_dir = Path('outreach/drafts/gold-tier-batch-2026-03-19')
    html_dir = output_dir / 'html'
    txt_dir = output_dir / 'txt'
    html_dir.mkdir(parents=True, exist_ok=True)
    txt_dir.mkdir(parents=True, exist_ok=True)

    # Generate files and CSV rows
    csv_rows = []
    created = 0

    for i, draft in enumerate(drafts, 1):
        slug = draft['slug']
        email = draft['email']
        subject = draft['subject']

        # Sanitize slug for filename
        safe_slug = slug.replace('/', '-').replace('\\', '-')

        # Write HTML file
        html_path = html_dir / f"{safe_slug}.html"
        html_path.write_text(build_html(draft), encoding='utf-8')

        # Write TXT file
        txt_path = txt_dir / f"{safe_slug}.txt"
        txt_path.write_text(build_txt(draft), encoding='utf-8')

        # Add to CSV
        csv_rows.append({
            'idx': str(i),
            'email': email,
            'subject': subject,
            'html_file': html_path.as_posix(),
            'txt_file': txt_path.as_posix(),
        })
        created += 1

    # Write CSV
    csv_path = output_dir / 'manifest.csv'
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['idx', 'email', 'subject', 'html_file', 'txt_file'])
        writer.writeheader()
        writer.writerows(csv_rows)

    print(f"Created {created} draft files")
    print(f"CSV manifest: {csv_path}")
    print(f"\nReady for IMAP upload with:")
    print(f"  python scripts/maintenance/imap_create_multipart_drafts_from_csv.py --input-csv {csv_path}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())