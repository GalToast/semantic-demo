from __future__ import annotations

import argparse
import csv
import re
from datetime import date
from pathlib import Path


EMAIL_RE = re.compile(r"^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$")


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Preflight audit for outreach draft pack CSV.")
    ap.add_argument("--input-csv", required=True)
    ap.add_argument("--out-md", default="")
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    src = Path(args.input_csv)
    stamp = date.today().isoformat()
    out_md = Path(args.out_md) if args.out_md else src.with_name(f"preflight-report-{stamp}.md")

    rows = list(csv.DictReader(src.open("r", encoding="utf-8-sig", newline="")))
    required_common = [
        'Advertisement: This is a business outreach email from McCullough Digital.',
        "Mailing address: 15342 Holly Lane",
        'reply with "opt out"',
        "(832) 422-8441",
    ]
    required_html = [
        "https://mccullough.digital",
    ]
    required_txt = [
        "https://mccullough.digital",
    ]

    issues: list[tuple[str, str, str]] = []
    ok = 0
    for r in rows:
        name = (r.get("name") or "").strip()
        email = (r.get("email") or "").strip()
        website = (r.get("website") or "").strip()
        html_file = Path((r.get("html_file") or "").replace("/", "\\"))
        txt_file = Path((r.get("txt_file") or "").replace("/", "\\"))

        row_has_issue = False
        if not EMAIL_RE.match(email):
            issues.append((name, "row", "invalid-recipient-email"))
            row_has_issue = True
        if not website:
            issues.append((name, "row", "missing-website"))
            row_has_issue = True
        if not html_file.exists():
            issues.append((name, "html", "missing-file"))
            row_has_issue = True
        if not txt_file.exists():
            issues.append((name, "txt", "missing-file"))
            row_has_issue = True

        if html_file.exists():
            h = html_file.read_text(encoding="utf-8", errors="ignore")
            if "{{" in h or "}}" in h:
                issues.append((name, "html", "unreplaced-template-token"))
                row_has_issue = True
            for token in required_common + required_html:
                if token not in h:
                    issues.append((name, "html", f"missing:{token[:40]}"))
                    row_has_issue = True

        if txt_file.exists():
            t = txt_file.read_text(encoding="utf-8", errors="ignore")
            if "{{" in t or "}}" in t:
                issues.append((name, "txt", "unreplaced-template-token"))
                row_has_issue = True
            for token in required_common + required_txt:
                if token not in t:
                    issues.append((name, "txt", f"missing:{token[:40]}"))
                    row_has_issue = True

        if not row_has_issue:
            ok += 1

    out_md.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Outreach Pack Preflight Report",
        f"Generated: {stamp}",
        "",
        f"- Input CSV: `{src.as_posix()}`",
        f"- Rows checked: {len(rows)}",
        f"- Rows passing all checks: {ok}",
        f"- Rows with issues: {len({name for name,_,_ in issues})}",
        f"- Total issues: {len(issues)}",
        "",
        "## Checks",
        "- Valid recipient email format",
        "- HTML/TXT draft file exists",
        "- No unreplaced template tokens",
        "- Compliance line present",
        "- Mailing address present",
        "- Opt-out language present",
        "- Phone present",
        "- Brand link present",
        "",
    ]
    if issues:
        lines.append("## Issues")
        lines.append("| Lead | Surface | Issue |")
        lines.append("| --- | --- | --- |")
        for name, surface, issue in issues:
            lines.append(f"| {name} | {surface} | {issue} |")
    else:
        lines.append("## Issues")
        lines.append("None.")
    lines.append("")

    out_md.write_text("\n".join(lines), encoding="utf-8")
    print(f"rows={len(rows)}")
    print(f"ok={ok}")
    print(f"issue_rows={len({name for name,_,_ in issues})}")
    print(f"issues={len(issues)}")
    print(f"report={out_md}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
