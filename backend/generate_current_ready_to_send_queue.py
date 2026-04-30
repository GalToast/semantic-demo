from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from suppression import get_suppression_reason, load_suppression_map

REPO_ROOT = Path(".")
TMP_DIR = REPO_ROOT / "tmp"
INDEX_CSV = REPO_ROOT / "leads" / "index.csv"
OUT_PATH_DEFAULT = REPO_ROOT / "outreach" / "queues" / "current-ready-to-send.md"

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")

# Internal/self addresses that can appear in Drafts and should not enter any outreach queue.
SELF_EMAILS = {
    "fred@mccullough.digital",
    "hello@mccullough.digital",
}


def norm(value: str | None) -> str:
    return (value or "").strip()


def low(value: str | None) -> str:
    return norm(value).lower()


def latest_tmp_json(prefix: str) -> Path:
    files = sorted(TMP_DIR.glob(f"{prefix}_*.json"))
    if not files:
        raise SystemExit(f"Missing tmp/{prefix}_*.json")
    return max(files, key=lambda p: p.stat().st_mtime)


def extract_recipient_emails(index_json: dict) -> set[str]:
    emails: set[str] = set()
    for page in index_json.get("pages", []) or []:
        for item in page.get("items", []) or []:
            to_field = item.get("to", "") or ""
            # Some exports also embed emails in the synthesized text field.
            text_field = item.get("text", "") or ""
            for e in EMAIL_RE.findall(to_field + " " + text_field):
                e = e.lower()
                if e in SELF_EMAILS:
                    continue
                emails.add(e)
    return emails


@dataclass
class LeadRow:
    lead_id: str
    name: str
    batch: str
    email: str
    profile: str
    outreach: str
    source: str
    disqualified: bool
    website: str


def load_index_email_map() -> dict[str, list[LeadRow]]:
    mapping: dict[str, list[LeadRow]] = {}
    with INDEX_CSV.open(newline="", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            email = norm(row.get("Email"))
            if "@" not in email:
                continue
            batch = norm(row.get("Batch"))
            if not batch.startswith("registered-entities-batch-"):
                continue
            if low(row.get("Source")) == "import":
                continue
            lead = LeadRow(
                lead_id=norm(row.get("LeadID")),
                name=norm(row.get("Name")),
                batch=batch,
                email=email.lower(),
                profile=norm(row.get("ProfilePath")),
                outreach=norm(row.get("OutreachStatus")),
                source=norm(row.get("Source")),
                disqualified=(low(row.get("Disqualified")) == "yes" or low(row.get("Status")) == "disqualified"),
                website=norm(row.get("Website")),
            )
            mapping.setdefault(lead.email, []).append(lead)
    return mapping


def website_domain(value: str) -> str:
    v = norm(value)
    if not v or low(v) in {"unknown", "not found", "n/a", "na"}:
        return ""
    if "://" not in v:
        v = "https://" + v
    try:
        host = urlparse(v).netloc.lower()
    except Exception:
        return ""
    if host.startswith("www."):
        host = host[4:]
    return host


def pick_best_for_email(email: str, rows: list[LeadRow]) -> tuple[LeadRow | None, str]:
    """
    Resolve multi-match draft recipient email -> one lead row deterministically.
    Heuristics:
    - Prefer non-disqualified.
    - Prefer website domain matching the email domain.
    - Prefer lower LeadID (stable tie-break).
    """
    if not rows:
        return None, "no-candidates"

    candidates = rows[:]
    non_disq = [r for r in candidates if not r.disqualified]
    if non_disq:
        candidates = non_disq

    email_domain = email.split("@", 1)[1].lower() if "@" in email else ""
    domain_matches = [r for r in candidates if website_domain(r.website) == email_domain]
    if domain_matches:
        candidates = domain_matches
        reason = "website-domain"
    else:
        reason = "fallback"

    def sort_key(r: LeadRow) -> tuple[int, str]:
        lid = int(r.lead_id) if r.lead_id.isdigit() else 999999
        return (lid, r.profile)

    chosen = sorted(candidates, key=sort_key)[0]
    return chosen, reason


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a 'ready-to-send' queue based on drafts present in IMAP and not present in Sent."
    )
    parser.add_argument("--drafts-index", default="", help="Optional path to hostinger_drafts_index_*.json")
    parser.add_argument("--sent-index", default="", help="Optional path to hostinger_sent_index_*.json")
    parser.add_argument("--out", default=str(OUT_PATH_DEFAULT))
    args = parser.parse_args()

    drafts_path = Path(args.drafts_index) if args.drafts_index else latest_tmp_json("hostinger_drafts_index")
    sent_path = Path(args.sent_index) if args.sent_index else latest_tmp_json("hostinger_sent_index")

    drafts_data = json.loads(drafts_path.read_text(encoding="utf-8", errors="ignore"))
    sent_data = json.loads(sent_path.read_text(encoding="utf-8", errors="ignore"))

    draft_emails = extract_recipient_emails(drafts_data)
    sent_emails = extract_recipient_emails(sent_data)
    suppression_map = load_suppression_map()

    email_map = load_index_email_map()

    ready: list[LeadRow] = []
    resolved_multi: list[tuple[str, LeadRow, str]] = []
    multi: list[tuple[str, list[LeadRow]]] = []
    unmapped: list[str] = []
    suppressed: list[tuple[str, str]] = []

    for email in sorted(draft_emails):
        suppress_reason = get_suppression_reason(email, suppression_map)
        if suppress_reason:
            suppressed.append((email, suppress_reason))
            continue
        hits = email_map.get(email, [])
        if not hits:
            unmapped.append(email)
            continue
        if len(hits) == 1:
            ready.append(hits[0])
        else:
            chosen, reason = pick_best_for_email(email, hits)
            if chosen:
                resolved_multi.append((email, chosen, reason))
            else:
                multi.append((email, hits))

    # Filter out any draft emails that already show up as sent.
    ready_filtered = [r for r in ready if r.email not in sent_emails]
    resolved_filtered = [(e, r, reason) for (e, r, reason) in resolved_multi if e not in sent_emails]
    multi_filtered = [(e, rows) for (e, rows) in multi if e not in sent_emails]

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    lines.append("# Current Ready-to-Send Queue")
    lines.append("Purpose: drafts exist in Hostinger and were not found in Sent.")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append("")
    lines.append(f"- Drafts index: `{drafts_path.as_posix()}`")
    lines.append(f"- Sent index: `{sent_path.as_posix()}`")
    lines.append(f"- Draft recipient emails (unique): {len(draft_emails)}")
    lines.append(f"- Ready-to-send (single-match leads): {len(ready_filtered)}")
    lines.append(f"- Ready-to-send (resolved multi-match leads): {len(resolved_filtered)}")
    lines.append(f"- Multi-match draft emails (unresolved): {len(multi_filtered)}")
    lines.append(f"- Unmapped draft emails: {len(unmapped)}")
    lines.append(f"- Suppressed draft emails: {len(suppressed)}")
    lines.append("")

    if ready_filtered:
        lines.append("## Ready (Single Match)")
        lines.append("| Lead ID | Name | Batch | Email | Profile | Outreach (current) | Notes |")
        lines.append("| --- | --- | --- | --- | --- | --- | --- |")
        for r in sorted(ready_filtered, key=lambda x: (int(x.lead_id) if x.lead_id.isdigit() else 999999, x.email)):
            lines.append(
                f"| {r.lead_id} | {r.name} | {r.batch} | {r.email} | {r.profile} | {r.outreach or 'unknown'} |  |"
            )
        lines.append("")

    if resolved_filtered:
        lines.append("## Ready (Resolved Multi-Match)")
        lines.append("| Draft Email | Chosen Lead ID | Name | Batch | Profile | Resolution |")
        lines.append("| --- | --- | --- | --- | --- | --- |")
        for email, r, reason in sorted(
            resolved_filtered, key=lambda t: (int(t[1].lead_id) if t[1].lead_id.isdigit() else 999999, t[0])
        ):
            lines.append(f"| {email} | {r.lead_id} | {r.name} | {r.batch} | {r.profile} | {reason} |")
        lines.append("")

    if suppressed:
        lines.append("## Suppressed")
        lines.append("| Draft Email | Reason |")
        lines.append("| --- | --- |")
        for email, reason in suppressed:
            lines.append(f"| {email} | {reason} |")
        lines.append("")

    if multi_filtered:
        lines.append("## Multi-Match (Needs Review)")
        lines.append("| Draft Email | Matches | Example Leads |")
        lines.append("| --- | --- | --- |")
        for email, rows in multi_filtered:
            examples = "; ".join(f"{r.lead_id} {r.name}" for r in rows[:3])
            if len(rows) > 3:
                examples += f" (+{len(rows)-3} more)"
            lines.append(f"| {email} | {len(rows)} | {examples} |")
        lines.append("")

    if unmapped:
        lines.append("## Unmapped Draft Emails")
        lines.append("These draft recipients were not found in `leads/index.csv` (registered entities).")
        lines.append("")
        for email in unmapped:
            lines.append(f"- {email}")
        lines.append("")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote: {out_path.as_posix()}")


if __name__ == "__main__":
    main()
