from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SUPPRESSION_JSON = REPO_ROOT / "outreach" / "exports" / "bounce-suppression.json"


@dataclass(frozen=True)
class SuppressionEntry:
    email: str
    action: str
    kind: str
    reason: str
    first_seen: str
    last_seen: str
    count: int


def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def load_suppression_map(path: Path | None = None) -> dict[str, SuppressionEntry]:
    suppression_path = path or SUPPRESSION_JSON
    if not suppression_path.exists():
        return {}
    try:
        data = json.loads(suppression_path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return {}

    mapping: dict[str, SuppressionEntry] = {}
    for item in data.get("hard_suppress_recipients", []) or []:
        email_addr = normalize_email(item.get("email"))
        if not email_addr or "@" not in email_addr:
            continue
        mapping[email_addr] = SuppressionEntry(
            email=email_addr,
            action=str(item.get("action") or "suppress"),
            kind=str(item.get("kind") or "unknown"),
            reason=str(item.get("reason") or ""),
            first_seen=str(item.get("first_seen") or ""),
            last_seen=str(item.get("last_seen") or ""),
            count=int(item.get("count") or 0),
        )
    return mapping


def get_suppression_reason(email_addr: str, suppression_map: dict[str, SuppressionEntry]) -> str | None:
    key = normalize_email(email_addr)
    if not key:
        return None
    entry = suppression_map.get(key)
    if not entry:
        return None
    return f"{entry.kind}:{entry.reason}"
