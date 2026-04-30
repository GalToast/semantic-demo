from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CONTACT_LOG = REPO_ROOT / "outreach" / "logs" / "contact-log.md"
OPT_OUT_LOG = REPO_ROOT / "outreach" / "logs" / "opt-out-log.md"
OUT_PATH = REPO_ROOT / "outreach" / "exports" / "bounce-suppression.json"

EMAIL_RE = re.compile(r"([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})", flags=re.I)


def parse_markdown_rows(path: Path) -> list[list[str]]:
    if not path.exists():
        return []
    rows: list[list[str]] = []
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line.startswith("|"):
            continue
        if set(line.replace("|", "").replace("-", "").replace(" ", "")) == set():
            continue
        parts = [part.strip() for part in line.strip("|").split("|")]
        if parts and parts[0].lower() == "date":
            continue
        rows.append(parts)
    return rows


def classify_bounce_reason(text: str) -> str:
    t = text.lower()
    if "user unknown" in t or "no such user" in t or "account does not exist" in t or "address not found" in t or "recipient not found" in t:
        return "user_unknown"
    if "access denied" in t or "address rejected" in t or "recipient rejected" in t:
        return "access_denied_or_rejected"
    if "mailbox full" in t or "blocks limit exceeded" in t or "retry timeout exceeded" in t:
        return "mailbox_full_or_capacity"
    if "host not found" in t or "server not found" in t or "refused connection" in t:
        return "host_or_domain_failure"
    if "downstream server error" in t:
        return "downstream_server_error"
    return "other"


def extract_emails(text: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for match in EMAIL_RE.findall(text or ""):
        email_addr = match.lower()
        if email_addr in seen:
            continue
        seen.add(email_addr)
        out.append(email_addr)
    return out


def update_rollup(rollup: dict[str, dict], *, email_addr: str, kind: str, reason: str, date_text: str, source: str) -> None:
    entry = rollup.setdefault(
        email_addr,
        {
            "email": email_addr,
            "kind": kind,
            "reason": reason,
            "first_seen": date_text,
            "last_seen": date_text,
            "count": 0,
            "sources": Counter(),
        },
    )
    entry["count"] += 1
    if date_text and (not entry["first_seen"] or date_text < entry["first_seen"]):
        entry["first_seen"] = date_text
    if date_text and (not entry["last_seen"] or date_text > entry["last_seen"]):
        entry["last_seen"] = date_text
    if kind == "opt_out":
        entry["kind"] = "opt_out"
        entry["reason"] = "recipient_opt_out"
    entry["sources"][source or "unknown"] += 1


def main() -> None:
    contact_rows = parse_markdown_rows(CONTACT_LOG)
    opt_out_rows = parse_markdown_rows(OPT_OUT_LOG)

    recipient_rollup: dict[str, dict] = {}
    domain_reason_counts: Counter[tuple[str, str]] = Counter()

    for row in contact_rows:
        if len(row) < 6:
            continue
        date_text = row[0].strip()
        source = row[2].strip()
        channel = row[3].strip().lower()
        outcome = row[4].strip().lower()
        notes = row[5].strip()
        if channel != "email" or outcome not in {"bounced", "bounce"}:
            continue
        reason = classify_bounce_reason(notes)
        emails = extract_emails(notes)
        for email_addr in emails:
            update_rollup(
                recipient_rollup,
                email_addr=email_addr,
                kind="bounce",
                reason=reason,
                date_text=date_text,
                source=source,
            )
            if "@" in email_addr:
                domain = email_addr.split("@", 1)[1]
                domain_reason_counts[(domain, reason)] += 1

    for row in opt_out_rows:
        if len(row) < 6:
            continue
        date_text = row[0].strip()
        lead = row[1].strip()
        recipient = row[2].strip().lower()
        reply_from = row[3].strip().lower()
        subject = row[4].strip()
        if "@" in recipient:
            update_rollup(
                recipient_rollup,
                email_addr=recipient,
                kind="opt_out",
                reason="recipient_opt_out",
                date_text=date_text,
                source=f"opt-out:{lead}:{subject}",
            )
        if "@" in reply_from:
            update_rollup(
                recipient_rollup,
                email_addr=reply_from,
                kind="opt_out",
                reason="reply_sender_opt_out",
                date_text=date_text,
                source=f"opt-out:{lead}:{subject}",
            )

    hard_suppress_recipients = []
    for email_addr, entry in sorted(recipient_rollup.items()):
        sources = sorted(entry["sources"].items(), key=lambda x: (-x[1], x[0]))
        hard_suppress_recipients.append(
            {
                "email": email_addr,
                "action": "suppress",
                "kind": entry["kind"],
                "reason": entry["reason"],
                "first_seen": entry["first_seen"],
                "last_seen": entry["last_seen"],
                "count": entry["count"],
                "top_sources": [name for name, _ in sources[:5]],
            }
        )

    domain_caution = []
    domain_rollup: dict[str, Counter[str]] = {}
    for (domain, reason), count in domain_reason_counts.items():
        domain_rollup.setdefault(domain, Counter())[reason] += count
    for domain, reasons in sorted(domain_rollup.items()):
        total = sum(reasons.values())
        if total < 2:
            continue
        domain_caution.append(
            {
                "domain": domain,
                "action": "reverify",
                "total_bounces": total,
                "reason_counts": dict(sorted(reasons.items())),
            }
        )

    payload = {
        "generated": OUT_PATH.stat().st_mtime if OUT_PATH.exists() else None,
        "hard_suppress_recipients": hard_suppress_recipients,
        "domain_caution": domain_caution,
        "summary": {
            "hard_suppress_recipients": len(hard_suppress_recipients),
            "domain_caution": len(domain_caution),
        },
    }
    # Overwrite generated with an ISO-ish string after payload construction.
    from datetime import datetime, timezone

    payload["generated"] = datetime.now(timezone.utc).isoformat()

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    print(OUT_PATH.as_posix())
    print(f"hard_suppress_recipients={len(hard_suppress_recipients)}")
    print(f"domain_caution={len(domain_caution)}")


if __name__ == "__main__":
    main()
