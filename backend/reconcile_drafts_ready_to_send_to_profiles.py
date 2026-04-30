from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from urllib.parse import urlparse


REPO_ROOT = Path(".")
TMP_DIR = REPO_ROOT / "tmp"
INDEX_CSV = REPO_ROOT / "leads" / "index.csv"

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
DOMAIN_RE = re.compile(r"\b([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b", re.IGNORECASE)

TODAY = date.today().isoformat()

FIELDS = [
    "Status",
    "Outreach status",
    "Contact path",
    "Contact search",
    "Email",
    "Last updated",
]


def norm(value: str | None) -> str:
    return (value or "").strip()


def low(value: str | None) -> str:
    return norm(value).lower()


def latest_tmp_json(prefix: str) -> Path:
    files = sorted(TMP_DIR.glob(f"{prefix}_*.json"))
    if not files:
        raise SystemExit(f"Missing tmp/{prefix}_*.json")
    return max(files, key=lambda p: p.stat().st_mtime)


def extract_to_emails(item: dict) -> list[str]:
    to_field = item.get("to", "") or ""
    return sorted({e.lower() for e in EMAIL_RE.findall(to_field)})


def extract_domains(text: str) -> list[str]:
    raw = [d.lower() for d in DOMAIN_RE.findall(text or "")]
    # Filter obvious noise
    out: list[str] = []
    for d in raw:
        if d.count(".") == 0:
            continue
        if d.endswith(".local"):
            continue
        # Strip trailing punctuation artifacts
        d = d.strip(").,;:>\"'")
        if d and d not in out:
            out.append(d)
    return out


def normalize_website_domain(url_or_text: str) -> str:
    v = norm(url_or_text)
    if not v:
        return ""
    if v.lower() in {"unknown", "not found", "n/a", "na"}:
        return ""
    if "://" not in v:
        # Might be a bare domain.
        v = "https://" + v
    try:
        host = urlparse(v).netloc
    except Exception:
        return ""
    host = host.lower()
    if host.startswith("www."):
        host = host[4:]
    return host


@dataclass(frozen=True)
class LeadIndexRow:
    lead_id: str
    name: str
    batch: str
    email: str
    website: str
    profile: str
    disqualified: bool


def load_index_rows() -> list[LeadIndexRow]:
    rows: list[LeadIndexRow] = []
    with INDEX_CSV.open(newline="", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for r in reader:
            lead_id = norm(r.get("LeadID"))
            if not lead_id.isdigit():
                continue
            batch = norm(r.get("Batch"))
            if not batch.startswith("registered-entities-batch-"):
                continue
            if low(r.get("Source")) == "import":
                continue
            rows.append(
                LeadIndexRow(
                    lead_id=lead_id,
                    name=norm(r.get("Name")),
                    batch=batch,
                    email=norm(r.get("Email")).lower(),
                    website=norm(r.get("Website")),
                    profile=norm(r.get("ProfilePath")),
                    disqualified=low(r.get("Disqualified")) == "yes" or low(r.get("Status")) == "disqualified",
                )
            )
    return rows


def build_maps(rows: list[LeadIndexRow]) -> tuple[dict[str, list[LeadIndexRow]], dict[str, list[LeadIndexRow]]]:
    by_email: dict[str, list[LeadIndexRow]] = {}
    by_domain: dict[str, list[LeadIndexRow]] = {}
    for r in rows:
        if "@" in r.email:
            by_email.setdefault(r.email, []).append(r)
        dom = normalize_website_domain(r.website)
        if dom:
            by_domain.setdefault(dom, []).append(r)
    return by_email, by_domain


def apply_changes(path: Path, changes: dict[str, str], apply: bool) -> bool:
    if not changes:
        return False
    text = path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()

    # Find header region: from start until first "## " section.
    header_end = None
    for i, line in enumerate(lines):
        if line.startswith("## "):
            header_end = i
            break
    if header_end is None:
        header_end = len(lines)

    found = set()
    for i in range(0, header_end):
        for field, value in changes.items():
            prefix = f"{field}:"
            if lines[i].startswith(prefix):
                lines[i] = f"{field}: {value}"
                found.add(field)

    # Insert any missing fields right before header_end (after the existing header).
    insert_fields = [f for f in FIELDS if f in changes and f not in found]
    if insert_fields:
        insertion = [f"{field}: {changes[field]}" for field in insert_fields]
        # Prefer inserting after an empty line that terminates the header, if present.
        insert_at = header_end
        for i in range(0, header_end):
            if lines[i].strip() == "" and i > 0:
                insert_at = i
                break
        lines = lines[:insert_at] + insertion + lines[insert_at:]

    new_text = "\n".join(lines) + "\n"
    if new_text == text:
        return False
    if apply:
        path.write_text(new_text, encoding="utf-8")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reconcile draft recipients against leads/index.csv and backfill profile Email/Contact fields when a single match is possible."
    )
    parser.add_argument("--drafts-index", default="", help="Optional path to hostinger_drafts_index_*.json")
    parser.add_argument("--sent-index", default="", help="Optional path to hostinger_sent_index_*.json")
    parser.add_argument("--apply", action="store_true", help="Write profile updates")
    parser.add_argument("--out", default="", help="Report path (default: reports/drafts-reconcile-<date>.md)")
    args = parser.parse_args()

    drafts_path = Path(args.drafts_index) if args.drafts_index else latest_tmp_json("hostinger_drafts_index")
    sent_path = Path(args.sent_index) if args.sent_index else latest_tmp_json("hostinger_sent_index")

    drafts_data = json.loads(drafts_path.read_text(encoding="utf-8", errors="ignore"))
    sent_data = json.loads(sent_path.read_text(encoding="utf-8", errors="ignore"))

    sent_emails = set()
    for page in sent_data.get("pages", []) or []:
        for item in page.get("items", []) or []:
            for e in EMAIL_RE.findall((item.get("to", "") or "") + " " + (item.get("text", "") or "")):
                sent_emails.add(e.lower())

    rows = load_index_rows()
    by_email, by_domain = build_maps(rows)

    applied = 0
    mapped_by_domain = 0
    unmapped: list[str] = []
    multi: list[str] = []

    for page in drafts_data.get("pages", []) or []:
        for item in page.get("items", []) or []:
            to_emails = extract_to_emails(item)
            if not to_emails:
                continue
            to_email = to_emails[0]
            if to_email in sent_emails:
                # Not "ready-to-send" anymore.
                continue

            hits = by_email.get(to_email, [])
            chosen: LeadIndexRow | None = None
            reason = ""

            if len(hits) == 1:
                chosen = hits[0]
                reason = "email"
            elif len(hits) > 1:
                multi.append(to_email)
                continue
            else:
                # Try mapping by the recipient email domain first (often matches the website domain).
                to_domain = to_email.split("@", 1)[1] if "@" in to_email else ""
                domain_hits = list({(h.lead_id, h.profile): h for h in by_domain.get(to_domain, [])}.values())
                if len(domain_hits) == 1:
                    chosen = domain_hits[0]
                    reason = "to-domain"
                    mapped_by_domain += 1
                elif len(domain_hits) > 1:
                    multi.append(to_email)
                    continue
                else:
                    subject = item.get("subject", "") or ""
                    domains = extract_domains(subject)
                    subj_hits: list[LeadIndexRow] = []
                    for d in domains:
                        subj_hits.extend(by_domain.get(d, []))
                    subj_hits = list({(h.lead_id, h.profile): h for h in subj_hits}.values())
                    if len(subj_hits) == 1:
                        chosen = subj_hits[0]
                        reason = "subject-domain"
                        mapped_by_domain += 1
                    elif len(subj_hits) > 1:
                        multi.append(to_email)
                        continue

            if not chosen:
                unmapped.append(to_email)
                continue

            profile_path = Path(chosen.profile)
            if not profile_path.exists():
                unmapped.append(to_email)
                continue

            changes = {
                "Email": to_email,
                "Contact path": "email",
                "Outreach status": "drafted",
                "Contact search": f"checked {TODAY}",
                "Last updated": TODAY,
            }
            if not chosen.disqualified:
                changes["Status"] = "draft-prepared"

            if apply_changes(profile_path, changes, apply=args.apply):
                applied += 1

    report_path = Path(args.out) if args.out else Path("reports") / f"drafts-reconcile-{TODAY}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    lines.append("# Draft Recipient Reconcile")
    lines.append(f"Generated: {TODAY}")
    lines.append("")
    lines.append(f"- Drafts index: `{drafts_path.as_posix()}`")
    lines.append(f"- Sent index: `{sent_path.as_posix()}`")
    lines.append(f"- Mode: {'APPLY' if args.apply else 'DRY-RUN'}")
    lines.append(f"- Profiles updated: {applied}")
    lines.append(f"- Drafts mapped by domain (unique): {mapped_by_domain}")
    lines.append(f"- Multi-match recipients: {len(sorted(set(multi)))}")
    lines.append(f"- Unmapped recipients: {len(sorted(set(unmapped)))}")
    lines.append("")

    if multi:
        lines.append("## Multi-Match Recipients")
        for e in sorted(set(multi)):
            lines.append(f"- {e}")
        lines.append("")

    if unmapped:
        lines.append("## Unmapped Recipients")
        for e in sorted(set(unmapped)):
            lines.append(f"- {e}")
        lines.append("")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote: {report_path.as_posix()}")


if __name__ == "__main__":
    main()
