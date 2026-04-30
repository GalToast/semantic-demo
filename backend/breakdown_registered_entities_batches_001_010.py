from __future__ import annotations

import csv
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path

REPO_ROOT = Path(".")
INDEX_CSV = REPO_ROOT / "leads" / "index.csv"
REPORT_PATH = REPO_ROOT / "reports" / f"registered-entities-batches-001-010-breakdown-{date.today().isoformat()}.md"

BATCHES = [f"registered-entities-batch-{i:03d}" for i in range(1, 11)]


def norm(v: str | None) -> str:
    return (v or "").strip().lower()


def yes(v: str | None) -> bool:
    return norm(v) in {"yes", "y", "true", "1"}


def has_email(v: str | None) -> bool:
    s = (v or "").strip()
    return "@" in s and "." in s


@dataclass(frozen=True)
class BatchStats:
    total: int
    disqualified: int
    qualified: int
    email_yes: int
    email_no: int
    outreach: Counter[str]
    contact_path: Counter[str]
    status: Counter[str]


def compute_stats(rows: list[dict[str, str]]) -> BatchStats:
    total = len(rows)
    disq = sum(1 for r in rows if yes(r.get("Disqualified")))
    qual = total - disq

    email_yes = sum(1 for r in rows if has_email(r.get("Email")))
    email_no = total - email_yes

    outreach = Counter(norm(r.get("OutreachStatus")) or "unknown" for r in rows)
    contact_path = Counter(norm(r.get("ContactPath")) or "unknown" for r in rows)
    status = Counter(norm(r.get("Status")) or "unknown" for r in rows)

    return BatchStats(
        total=total,
        disqualified=disq,
        qualified=qual,
        email_yes=email_yes,
        email_no=email_no,
        outreach=outreach,
        contact_path=contact_path,
        status=status,
    )


def main() -> None:
    if not INDEX_CSV.exists():
        raise SystemExit(f"Missing leads/index.csv at {INDEX_CSV}")

    rows_by_batch: dict[str, list[dict[str, str]]] = defaultdict(list)
    with INDEX_CSV.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            batch = (row.get("Batch") or "").strip()
            if batch in BATCHES:
                rows_by_batch[batch].append(row)

    # Ensure stable order and include any empty batches (shouldn't happen for 001-010).
    batch_stats: dict[str, BatchStats] = {}
    for b in BATCHES:
        batch_stats[b] = compute_stats(rows_by_batch.get(b, []))

    all_rows = [r for b in BATCHES for r in rows_by_batch.get(b, [])]
    overall = compute_stats(all_rows)

    def get(bs: BatchStats, key: str) -> int:
        return int(bs.outreach.get(key, 0))

    def cp(bs: BatchStats, key: str) -> int:
        return int(bs.contact_path.get(key, 0))

    lines: list[str] = []
    lines.append("# Registered Entities: Batches 001-010 Breakdown")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append("")
    lines.append(f"- Source: `{INDEX_CSV.as_posix()}`")
    lines.append("")

    lines.append("## Overall (Batches 001-010)")
    lines.append("")
    lines.append(f"- Total leads: {overall.total}")
    lines.append(f"- Qualified: {overall.qualified}")
    lines.append(f"- Disqualified: {overall.disqualified}")
    lines.append(f"- Email present: {overall.email_yes}")
    lines.append(f"- Email missing: {overall.email_no}")
    lines.append(f"- Outreach: drafted={get(overall, 'drafted')}, sent={get(overall, 'sent')}, bounced={get(overall, 'bounced')}, uncontacted={get(overall, 'uncontacted')}, unknown={get(overall, 'unknown')}")
    lines.append(f"- Contact path unknown: {cp(overall, 'unknown')}")
    lines.append("")

    lines.append("## Per Batch")
    lines.append("")
    lines.append("| Batch | Total | Qualified | Disqualified | Email yes | Drafted | Sent | Bounced | Uncontacted | Contact unknown |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for b in BATCHES:
        bs = batch_stats[b]
        lines.append(
            f"| {b} | {bs.total} | {bs.qualified} | {bs.disqualified} | {bs.email_yes} | {get(bs,'drafted')} | {get(bs,'sent')} | {get(bs,'bounced')} | {get(bs,'uncontacted')} | {cp(bs,'unknown')} |"
        )
    lines.append("")

    lines.append("## Notes")
    lines.append("")
    lines.append("- Counts are based on `leads/index.csv` (generated from profiles).")
    lines.append("- Drafted/Sent/Bounced are grounded in Hostinger via IMAP exports + bounce scan, then reconciled into profile headers.")
    lines.append("")

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote: {REPORT_PATH.as_posix()}")


if __name__ == "__main__":
    main()
