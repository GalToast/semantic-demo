from __future__ import annotations

import argparse
import csv
import json
import os
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
INDEX_CSV = REPO_ROOT / "leads" / "index.csv"
TMP_DIR = REPO_ROOT / "tmp"
REPORTS_DIR = REPO_ROOT / "reports"


SECURITY_HEADERS = [
    "strict-transport-security",
    "content-security-policy",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
    "x-content-type-options",
]


def latest_tmp_json(prefix: str) -> Path:
    files = sorted(TMP_DIR.glob(f"{prefix}_*.json"))
    if not files:
        raise SystemExit(f"Missing tmp/{prefix}_*.json")
    return max(files, key=lambda p: p.stat().st_mtime)


def norm(s: str | None) -> str:
    return (s or "").strip()


def low(s: str | None) -> str:
    return norm(s).lower()


def extract_first_url(text: str) -> str:
    m = re.search(r"https?://[^\s)]+", text or "", flags=re.I)
    return m.group(0) if m else ""


def extract_domain_hint(text: str) -> str:
    """
    Pull a best-effort domain from subjects like:
    - "Quick note ... (example.com)"
    - "Quick note ... (example.square.site)"
    """
    if not text:
        return ""
    # Prefer parenthetical.
    m = re.search(r"\(([^)]+)\)", text)
    if m:
        candidate = m.group(1).strip()
        # Strip trailing punctuation/newlines.
        candidate = re.sub(r"[\s\r\n]+", "", candidate)
        candidate = candidate.strip(" .,:;")
        if "." in candidate and "@" not in candidate and len(candidate) <= 120:
            return candidate
    # Fallback: find a bare domain token.
    m2 = re.search(r"\b([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b", text)
    if m2:
        return m2.group(1)
    return ""


def extract_profile_any_url(profile_text: str) -> str:
    """
    Find any URL in the profile (not just in the header).
    """
    return extract_first_url(profile_text)


def load_index_websites() -> dict[str, str]:
    """
    LeadID -> Website from leads/index.csv (registered-entities only).
    """
    mapping: dict[str, str] = {}
    if not INDEX_CSV.exists():
        return mapping
    with INDEX_CSV.open(newline="", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            batch = norm(row.get("Batch"))
            if not batch.startswith("registered-entities-batch-"):
                continue
            lead_id = norm(row.get("LeadID"))
            website = norm(row.get("Website"))
            if lead_id and website:
                mapping[lead_id] = website
    return mapping


def get_profile_header_value(profile_text: str, key: str) -> str:
    for line in (profile_text or "").splitlines()[:120]:
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        if k.strip().lower() == key.strip().lower():
            return v.strip()
    return ""


def fetch_headers(url: str, timeout_s: int) -> tuple[str, dict[str, str], str]:
    """
    Returns (final_url, headers_lower_map, error).
    """
    if not url:
        return "", {}, "missing_url"
    u = url.strip()
    if not u.startswith("http"):
        u = "https://" + u

    req = urllib.request.Request(u, method="GET", headers={"User-Agent": "Mozilla/5.0"})
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout_s, context=ctx) as resp:
            final_url = resp.geturl()
            hdrs: dict[str, str] = {}
            for k, v in resp.headers.items():
                hdrs[k.lower()] = v
            return final_url, hdrs, ""
    except urllib.error.HTTPError as e:
        hdrs: dict[str, str] = {}
        for k, v in e.headers.items():
            hdrs[k.lower()] = v
        return e.geturl() or u, hdrs, f"http_error_{e.code}"
    except ssl.SSLError as e:
        return u, {}, f"ssl_error_{type(e).__name__}"
    except Exception as e:
        return u, {}, f"error_{type(e).__name__}"


def build_headers_summary(hdrs: dict[str, str]) -> tuple[list[str], list[str]]:
    present: list[str] = []
    missing: list[str] = []
    for h in SECURITY_HEADERS:
        if h in hdrs:
            present.append(h)
        else:
            missing.append(h)
    return present, missing


def upsert_security_headers_section(
    profile_path: Path,
    checked_url: str,
    final_url: str,
    present: list[str],
    missing: list[str],
    fetch_error: str,
) -> None:
    today = date.today().isoformat()
    text = profile_path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()

    # Update "Last updated:" in header if present.
    for i in range(min(80, len(lines))):
        if lines[i].lower().startswith("last updated:"):
            lines[i] = f"Last updated: {today}"
            break

    section_title = "## Website audit (quick)"
    subsection_title = f"### Security headers (checked {today})"

    summary_lines: list[str] = []
    # Make QA happy: explicitly include the phrase "Missing security headers".
    if missing:
        summary_lines.append(f"- Missing security headers: {', '.join(missing)}")
    else:
        summary_lines.append("- Missing security headers: none observed")
    if present:
        summary_lines.append(f"- Present: {', '.join(present)}")
    summary_lines.append(f"- Checked URL: {checked_url}")
    if final_url and final_url != checked_url:
        summary_lines.append(f"- Final URL: {final_url}")
    if fetch_error:
        summary_lines.append(f"- Fetch note: {fetch_error}")

    # Try to find an existing subsection we can replace (same prefix).
    start_idx = None
    for i, line in enumerate(lines):
        if line.strip() == subsection_title:
            start_idx = i
            break

    if start_idx is not None:
        # Replace until next heading of same/higher level.
        end_idx = start_idx + 1
        while end_idx < len(lines) and not lines[end_idx].startswith("## ") and not lines[end_idx].startswith("### "):
            end_idx += 1
        new_block = [subsection_title] + summary_lines + [""]
        lines = lines[:start_idx] + new_block + lines[end_idx:]
        profile_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
        return

    # Otherwise: append section at end (or after an existing website audit section).
    insert_at = len(lines)
    for i, line in enumerate(lines):
        if line.strip() == section_title:
            insert_at = i
            break

    block: list[str] = []
    if insert_at == len(lines):
        block.append("")
        block.append(section_title)
    else:
        # Section exists, append to its end.
        pass
    block.append(subsection_title)
    block.extend(summary_lines)
    block.append("")

    lines = lines[:insert_at] + block + lines[insert_at:]
    profile_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


@dataclass
class Row:
    lead_id: str
    name: str
    profile: str
    website: str
    checked_url: str
    final_url: str
    error: str
    missing: list[str]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verify draft claim tags (currently missing_headers) by fetching site headers and backfilling profiles to ground truth."
    )
    parser.add_argument("--qa-json", default=None, help="Path to tmp/hostinger_drafts_qa_YYYY-MM-DD.json (default: latest).")
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    qa_path = Path(args.qa_json) if args.qa_json else latest_tmp_json("hostinger_drafts_qa")
    qa = json.loads(qa_path.read_text(encoding="utf-8", errors="ignore"))

    index_websites = load_index_websites()

    targets: list[dict] = []
    for d in qa.get("drafts", []) or []:
        if d.get("skip"):
            continue
        issues = d.get("issues") or []
        if "truth_check_flags" not in issues:
            continue
        chosen = d.get("chosen_lead") or {}
        if not chosen or not chosen.get("lead_id") or not chosen.get("profile"):
            continue
        targets.append(d)

    rows: list[Row] = []
    for d in targets:
        chosen = d.get("chosen_lead") or {}
        lead_id = norm(chosen.get("lead_id"))
        name = norm(chosen.get("name"))
        profile_path = Path(norm(chosen.get("profile")))
        if not profile_path.exists():
            continue
        profile_text = profile_path.read_text(encoding="utf-8", errors="ignore")
        website = get_profile_header_value(profile_text, "Website") or index_websites.get(lead_id, "")
        if low(website) in {"unknown", "not found", "n/a", "na"}:
            website = ""
        # As a fallback, scan the profile for any URL.
        if not website:
            website = extract_profile_any_url(profile_text)
        # As a last resort, try to parse a domain from the subject.
        subj = norm(d.get("subject"))
        if not website:
            domain = extract_domain_hint(subj)
            if domain:
                website = domain

        checked = website
        final_url, hdrs, err = fetch_headers(website, args.timeout)
        present, missing = build_headers_summary(hdrs)

        # Backfill when we have headers to reason about and we're missing hardening headers.
        # HTTP error pages can still return meaningful response headers.
        if hdrs and missing and not args.dry_run:
            upsert_security_headers_section(
                profile_path,
                checked_url=checked,
                final_url=final_url,
                present=present,
                missing=missing,
                fetch_error=err,
            )

        rows.append(
            Row(
                lead_id=lead_id,
                name=name,
                profile=str(profile_path.as_posix()),
                website=website,
                checked_url=checked,
                final_url=final_url,
                error=err,
                missing=missing,
            )
        )

    today = date.today().isoformat()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"hostinger-truth-backfill-headers-{today}.md"

    lines: list[str] = []
    lines.append("# Truth Backfill From Drafts (Headers)")
    lines.append(f"Date: {today}")
    lines.append("")
    lines.append(f"- QA source: `{qa_path.as_posix()}`")
    lines.append(f"- Targets: {len(rows)}")
    lines.append(f"- Dry run: `{args.dry_run}`")
    lines.append("")
    lines.append("| Lead ID | Name | Website | Error | Missing Headers Count | Profile |")
    lines.append("| --- | --- | --- | --- | --- | --- |")
    for r in rows:
        miss_n = len(r.missing) if not r.error else 0
        lines.append(f"| {r.lead_id} | {r.name} | {r.website} | {r.error} | {miss_n} | `{r.profile}` |")
    lines.append("")
    report_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote: {report_path}")


if __name__ == "__main__":
    main()
