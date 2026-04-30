from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Optional
import urllib.parse


REPO_ROOT = Path(".")
LEADS_ROOT = REPO_ROOT / "leads"
PROFILES_ROOT = LEADS_ROOT / "profiles"

TODAY = date.today().isoformat()

MISSING = {
    "",
    "unknown",
    "not found",
    "n/a",
    "na",
    "none",
    "null",
    "not provided",
    "not available",
}

LABEL_RE = re.compile(r"^\s*([A-Za-z][A-Za-z /_-]*?):\s*(.*?)\s*$")
OAICITE_RE = re.compile(r":?contentReference\[[^\]]+\]\{[^\}]*\}", re.IGNORECASE)


def norm_missing(value: Any) -> str:
    if value is None:
        return "unknown"
    if isinstance(value, (int, float)):
        value = str(value)
    if not isinstance(value, str):
        return "unknown"
    cleaned = re.sub(r"\s+", " ", value.strip())
    if cleaned.lower() in MISSING:
        return "unknown"
    return cleaned


def norm_url(value: Any) -> str:
    v = norm_missing(value)
    if v == "unknown":
        return v
    try:
        parsed = urllib.parse.urlparse(v)
        if not parsed.scheme:
            return v
        # Drop fragment to avoid huge "#:~:text=" blobs.
        parsed = parsed._replace(fragment="")
        return urllib.parse.urlunparse(parsed)
    except Exception:
        return v


def norm_notes(value: Any) -> str:
    v = norm_missing(value)
    if v == "unknown":
        return v
    v = OAICITE_RE.sub("", v)
    v = re.sub(r"\s+", " ", v).strip()
    return v or "unknown"


def range_dir_for_id(lead_id: int) -> str:
    start = (lead_id // 100) * 100
    end = start + 99
    # Match existing convention: 3 digits for <1000, 4+ digits for >=1000
    width = 3 if end < 1000 else 4
    return f"{start:0{width}d}-{end:0{width}d}"


def find_profile_md(lead_id: int) -> Optional[Path]:
    rng = range_dir_for_id(lead_id)
    base = PROFILES_ROOT / rng
    if not base.exists():
        return None
    hits = list(base.glob(f"{lead_id}-*/profile.md"))
    if not hits:
        return None
    # If multiple exist, prefer the shortest slug (usually the canonical one).
    hits.sort(key=lambda p: (len(p.parent.name), p.as_posix()))
    return hits[0]


def parse_labels(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        m = LABEL_RE.match(line)
        if not m:
            continue
        out[m.group(1).strip().lower()] = m.group(2).strip()
    return out


def set_label(lines: list[str], label: str, value: str) -> None:
    """
    Replace first occurrence of `Label: ...` (case-insensitive), else insert
    it before the first section header (## ...).
    """
    pattern = re.compile(rf"^(\s*)({re.escape(label)})(\s*:\s*).*$", re.IGNORECASE)
    for i, line in enumerate(lines):
        if pattern.match(line):
            m = pattern.match(line)
            assert m is not None
            lines[i] = f"{m.group(1)}{m.group(2)}{m.group(3)}{value}"
            return
    insert_at = None
    for i, line in enumerate(lines):
        if line.startswith("## "):
            insert_at = i
            break
    new_line = f"{label}: {value}"
    if insert_at is None:
        lines.append(new_line)
    else:
        lines.insert(insert_at, new_line)


def upsert_notes_section(lines: list[str], bullets: list[str]) -> None:
    """
    Ensure a `## Notes` section exists. Replace a lone "- Pending research."
    bullet with the provided bullets, otherwise prepend.
    """
    hdr_idx = None
    for i, line in enumerate(lines):
        if line.strip().lower() == "## notes":
            hdr_idx = i
            break
    if hdr_idx is None:
        lines.extend(["", "## Notes"])
        hdr_idx = len(lines) - 1
        lines.append("- Pending research.")

    # Find section body extent.
    body_start = hdr_idx + 1
    body_end = len(lines)
    for j in range(body_start, len(lines)):
        if lines[j].startswith("## "):
            body_end = j
            break

    body = lines[body_start:body_end]
    body_nonempty = [b for b in body if b.strip()]

    def _is_pending_only() -> bool:
        if not body_nonempty:
            return True
        if len(body_nonempty) == 1 and body_nonempty[0].strip().lower() == "- pending research.":
            return True
        return False

    new_body = [f"- {b}" for b in bullets]
    if _is_pending_only():
        lines[body_start:body_end] = new_body + [""]
    else:
        # Prepend, preserving existing content.
        lines[body_start:body_end] = new_body + [""] + body


def derive_contact_path(email: str, contact_form: str, socials: list[str], phone: str) -> str:
    if email and email != "unknown" and "@" in email:
        return "email"
    if contact_form and contact_form != "unknown":
        return "form"
    if socials:
        return "social"
    if phone and phone != "unknown":
        return "phone-only"
    return "unknown"


@dataclass
class IngestStats:
    total: int = 0
    updated: int = 0
    missing_profile: int = 0
    bad_json: int = 0


def ingest_file(jsonl_path: Path, provider: str, mode: str, apply: bool) -> IngestStats:
    stats = IngestStats()
    for raw in jsonl_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not raw.strip():
            continue
        stats.total += 1
        try:
            obj = json.loads(raw)
        except Exception:
            stats.bad_json += 1
            continue

        lead_id = obj.get("lead_id")
        if not isinstance(lead_id, int):
            continue

        profile_md = find_profile_md(lead_id)
        if not profile_md:
            stats.missing_profile += 1
            continue

        text = profile_md.read_text(encoding="utf-8", errors="ignore")
        lines = text.splitlines()

        decision = norm_missing(obj.get("decision"))
        reason = norm_notes(obj.get("reason"))

        website = norm_url(obj.get("website"))
        email = norm_missing(obj.get("email"))
        phone = norm_missing(obj.get("phone"))
        contact_form = norm_url(obj.get("contact_form"))
        socials = obj.get("socials") or []
        if not isinstance(socials, list):
            socials = []
        socials_norm = []
        for s in socials:
            u = norm_url(s)
            if u != "unknown":
                socials_norm.append(u)
        sources = obj.get("sources") or []
        if not isinstance(sources, list):
            sources = []
        sources_norm = []
        for s in sources:
            u = norm_url(s)
            if u != "unknown":
                sources_norm.append(u)

        social_media = "unknown"
        if socials_norm:
            social_media = ", ".join(socials_norm[:4]) + (f" (+{len(socials_norm)-4} more)" if len(socials_norm) > 4 else "")

        contact_path = derive_contact_path(email, contact_form, socials_norm, phone)
        contact_search = "not found" if contact_path == "unknown" else f"checked {TODAY}"

        # Only populate fields when they look real; otherwise keep "unknown"
        # to avoid polluting profiles with empty strings.
        set_label(lines, "Website", website)
        set_label(lines, "Email", email)
        set_label(lines, "Phone", phone)
        set_label(lines, "Contact form", contact_form)
        set_label(lines, "Social media", social_media)
        set_label(lines, "Contact path", contact_path)
        set_label(lines, "Contact search", contact_search)
        set_label(lines, "Last updated", TODAY)

        # Notes: keep it short and factual.
        note_bits = []
        note_bits.append(f"UI research ({provider} {mode}, {TODAY}): decision={decision}; reason={reason}.")
        if sources_norm:
            shown = "; ".join(sources_norm[:3])
            more = "" if len(sources_norm) <= 3 else f" (+{len(sources_norm)-3} more)"
            note_bits.append(f"Sources: {shown}{more}.")

        upsert_notes_section(lines, note_bits)

        new_text = "\n".join(lines).rstrip("\n") + "\n"
        if new_text != text:
            stats.updated += 1
            if apply:
                profile_md.write_text(new_text, encoding="utf-8")

    return stats


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest UI research JSONL into lead profiles (update contact fields + notes).")
    ap.add_argument("--jsonl", required=True, help="Path to JSONL file")
    ap.add_argument("--provider", required=True, help="Provider label, e.g. chatgpt|gemini|kimi")
    ap.add_argument("--mode", default="deep-research", help="Mode label, e.g. deep-research")
    ap.add_argument("--apply", action="store_true", help="Write changes (default: dry-run)")
    args = ap.parse_args()

    jsonl_path = Path(args.jsonl)
    if not jsonl_path.exists():
        raise SystemExit(f"JSONL not found: {jsonl_path}")

    stats = ingest_file(jsonl_path, provider=args.provider, mode=args.mode, apply=args.apply)

    print(f"apply: {args.apply}")
    print(f"file: {jsonl_path}")
    print(f"total_lines: {stats.total}")
    print(f"updated_profiles: {stats.updated}")
    print(f"missing_profiles: {stats.missing_profile}")
    print(f"bad_json_lines: {stats.bad_json}")


if __name__ == "__main__":
    main()

