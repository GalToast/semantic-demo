from __future__ import annotations

import argparse
import csv
import imaplib
import os
import time
from dataclasses import dataclass
from datetime import date
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path


def get_windows_user_env(name: str) -> str | None:
    if os.name != "nt":
        return None
    try:
        import winreg  # type: ignore

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            value, _ = winreg.QueryValueEx(key, name)
            return str(value) if value else None
    except Exception:
        return None


@dataclass
class RowResult:
    idx: str
    to: str
    subject: str
    status: str
    note: str


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="Create Hostinger multipart drafts (HTML + plain text) from a CSV."
    )
    ap.add_argument("--input-csv", required=True, help="CSV with columns: email,subject,html_file,txt_file")
    ap.add_argument("--host", default="imap.hostinger.com")
    ap.add_argument("--port", type=int, default=993)
    ap.add_argument("--user", default="fred@mccullough.digital")
    ap.add_argument("--pass-env", default="IMAP_PASS")
    ap.add_argument("--drafts-folder", default="INBOX.Drafts")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--sleep-ms", type=int, default=100)
    ap.add_argument("--dry-run", action="store_true")
    return ap.parse_args()


def build_message(from_email: str, to_email: str, subject: str, txt: str, html: str) -> bytes:
    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["To"] = to_email
    msg["From"] = from_email
    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(txt, "plain", "utf-8"))
    alt.attach(MIMEText(html, "html", "utf-8"))
    msg.attach(alt)
    return msg.as_bytes()


def preflight_content(html: str, txt: str) -> list[str]:
    issues: list[str] = []
    for token in ("{{", "}}"):
        if token in html or token in txt:
            issues.append("template-token")
            break
    required = [
        'Advertisement: This is a business outreach email from McCullough Digital.',
        "Mailing address: 15342 Holly Lane",
        'reply with "opt out"',
        "(832) 422-8441",
    ]
    for r in required:
        if r not in html:
            issues.append(f"html-missing:{r[:24]}")
        if r not in txt:
            issues.append(f"txt-missing:{r[:24]}")
    return issues


def write_report(path: Path, input_csv: Path, results: list[RowResult]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ok = sum(1 for r in results if r.status == "created")
    skip = sum(1 for r in results if r.status == "skipped")
    err = sum(1 for r in results if r.status == "error")
    lines = [
        "# Hostinger Multipart Draft Create Report",
        f"Generated: {date.today().isoformat()}",
        "",
        f"- Input CSV: `{input_csv.as_posix()}`",
        f"- Attempted rows: {len(results)}",
        f"- Created: {ok}",
        f"- Skipped: {skip}",
        f"- Errors: {err}",
        "",
        "| idx | to | subject | status | note |",
        "| --- | --- | --- | --- | --- |",
    ]
    for r in results:
        lines.append(f"| {r.idx} | {r.to} | {r.subject} | {r.status} | {r.note} |")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    args = parse_args()
    input_csv = Path(args.input_csv)
    rows = list(csv.DictReader(input_csv.open("r", encoding="utf-8-sig", newline="")))
    if args.limit and args.limit > 0:
        rows = rows[: args.limit]

    password = os.getenv(args.pass_env) or get_windows_user_env(args.pass_env)
    if not password:
        raise SystemExit(f"Missing password in env var: {args.pass_env}")

    results: list[RowResult] = []

    if args.dry_run:
        for r in rows:
            idx = (r.get("idx") or "").strip()
            to = (r.get("email") or "").strip()
            subject = (r.get("subject") or "").strip()
            html_path = Path((r.get("html_file") or "").replace("/", "\\"))
            txt_path = Path((r.get("txt_file") or "").replace("/", "\\"))
            if not to or not subject or not html_path.exists() or not txt_path.exists():
                results.append(RowResult(idx=idx, to=to, subject=subject, status="skipped", note="missing-fields-or-files"))
                continue
            html = html_path.read_text(encoding="utf-8", errors="ignore")
            txt = txt_path.read_text(encoding="utf-8", errors="ignore")
            issues = preflight_content(html, txt)
            if issues:
                results.append(RowResult(idx=idx, to=to, subject=subject, status="skipped", note=";".join(issues)))
            else:
                results.append(RowResult(idx=idx, to=to, subject=subject, status="created", note="dry-run-ok"))
        report = Path("reports") / f"hostinger-multipart-draft-create-{date.today().isoformat()}.md"
        write_report(report, input_csv, results)
        print(f"rows={len(rows)}")
        print(f"report={report}")
        return 0

    client = imaplib.IMAP4_SSL(args.host, args.port)
    try:
        client.login(args.user, password)
        for r in rows:
            idx = (r.get("idx") or "").strip()
            to = (r.get("email") or "").strip()
            subject = (r.get("subject") or "").strip()
            html_path = Path((r.get("html_file") or "").replace("/", "\\"))
            txt_path = Path((r.get("txt_file") or "").replace("/", "\\"))

            if not to or not subject or not html_path.exists() or not txt_path.exists():
                results.append(RowResult(idx=idx, to=to, subject=subject, status="skipped", note="missing-fields-or-files"))
                continue

            html = html_path.read_text(encoding="utf-8", errors="ignore")
            txt = txt_path.read_text(encoding="utf-8", errors="ignore")
            issues = preflight_content(html, txt)
            if issues:
                results.append(RowResult(idx=idx, to=to, subject=subject, status="skipped", note=";".join(issues)))
                continue

            raw = build_message(args.user, to, subject, txt, html)
            status, resp = client.append(
                args.drafts_folder,
                r"(\Draft)",
                imaplib.Time2Internaldate(time.time()),
                raw,
            )
            if status == "OK":
                results.append(RowResult(idx=idx, to=to, subject=subject, status="created", note="ok"))
            else:
                results.append(
                    RowResult(
                        idx=idx,
                        to=to,
                        subject=subject,
                        status="error",
                        note=f"append_failed:{status}:{resp}",
                    )
                )
            if args.sleep_ms > 0:
                time.sleep(args.sleep_ms / 1000.0)
    finally:
        try:
            client.logout()
        except Exception:
            pass

    report = Path("reports") / f"hostinger-multipart-draft-create-{date.today().isoformat()}.md"
    write_report(report, input_csv, results)

    print(f"rows={len(rows)}")
    print(f"created={sum(1 for r in results if r.status == 'created')}")
    print(f"skipped={sum(1 for r in results if r.status == 'skipped')}")
    print(f"errors={sum(1 for r in results if r.status == 'error')}")
    print(f"report={report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
