from pathlib import Path
import re
from datetime import date

REPO_ROOT = Path(".")
CONTACT_LOG = REPO_ROOT / "outreach" / "logs" / "contact-log.md"
MAPPING_REPORT = REPO_ROOT / "reports" / f"hostinger-unmatched-email-map-{date.today().isoformat()}.md"
REPORT_PATH = REPO_ROOT / "reports" / f"hostinger-contact-log-multi-resolve-{date.today().isoformat()}.md"

DOMAIN_RE = re.compile(r"([A-Za-z0-9.-]+\\.[A-Za-z]{2,})")


def parse_multi_mappings(path: Path) -> dict[str, list[str]]:
    if not path.exists():
        raise SystemExit(f"Mapping report not found: {path}")
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    mapping = {}
    in_multi = False
    current_email = None
    for line in lines:
        if line.startswith("## "):
            in_multi = line.strip() == "## Mapped (Multiple)"
            current_email = None
            continue
        if not in_multi:
            continue
        if line.startswith("- "):
            current_email = line[2:].strip().lower()
            mapping[current_email] = []
            continue
        if current_email and line.startswith("  - "):
            mapping[current_email].append(line[4:].strip())
    return mapping


def load_profile_info(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    name = path.parent.name
    website = ""
    batch = ""
    score = 0
    lead_id = None
    is_disqualified = "disqualified" in path.parts
    m = re.match(r"^(\\d+)", path.parent.name)
    if m:
        lead_id = int(m.group(1))
    for line in text:
        if line.startswith("# "):
            name = line[2:].strip()
            break
    for line in text:
        if line.startswith("Website:"):
            website = line.split(":", 1)[1].strip()
        elif line.startswith("Email:"):
            if line.split(":", 1)[1].strip().lower() not in {"", "unknown", "n/a"}:
                score += 1
        elif line.startswith("Phone:"):
            if line.split(":", 1)[1].strip().lower() not in {"", "unknown", "n/a"}:
                score += 1
        elif line.startswith("Contact form:"):
            if line.split(":", 1)[1].strip().lower() not in {"", "unknown", "n/a"}:
                score += 1
        elif line.startswith("Social media:"):
            if line.split(":", 1)[1].strip().lower() not in {"", "unknown", "n/a"}:
                score += 1
        elif line.startswith("Address:"):
            if line.split(":", 1)[1].strip().lower() not in {"", "unknown", "n/a"}:
                score += 1
        elif line.startswith("Batch:"):
            batch = line.split(":", 1)[1].strip()
            if batch:
                score += 1
        if line.startswith("## "):
            break
    if website:
        score += 1
    if is_disqualified:
        score -= 2
    return {
        "name": name,
        "website": website,
        "batch": batch,
        "path": path.as_posix(),
        "score": score,
        "lead_id": lead_id,
        "disqualified": is_disqualified,
    }


def normalize_domain(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"^https?://", "", value)
    value = re.sub(r"^www\\.", "", value)
    value = value.split("/")[0]
    return value


def resolve_by_domain(note: str, candidates: list[dict]) -> dict | None:
    domains = [normalize_domain(d) for d in DOMAIN_RE.findall(note)]
    if not domains:
        return None
    matches = []
    for candidate in candidates:
        website = normalize_domain(candidate.get("website") or "")
        if not website:
            continue
        if website in domains:
            matches.append(candidate)
    if len(matches) == 1:
        return matches[0]
    return None


def resolve_by_name(note: str, candidates: list[dict]) -> dict | None:
    clean_note = re.sub(r"[^a-z0-9\\s]", " ", note.lower())
    matches = []
    for candidate in candidates:
        tokens = re.sub(r"[^a-z0-9\\s]", " ", candidate["name"].lower()).split()
        tokens = [t for t in tokens if len(t) >= 4]
        if not tokens:
            continue
        if any(t in clean_note for t in tokens):
            matches.append(candidate)
    if len(matches) == 1:
        return matches[0]
    return None


def main() -> None:
    mapping = parse_multi_mappings(MAPPING_REPORT)
    if not CONTACT_LOG.exists():
        raise SystemExit("contact-log.md not found.")

    # Build candidate info
    candidate_info = {}
    for email, paths in mapping.items():
        infos = []
        for path in paths:
            p = Path(path)
            if not p.exists():
                continue
            infos.append(load_profile_info(p))
        candidate_info[email] = infos

    lines = CONTACT_LOG.read_text(encoding="utf-8", errors="ignore").splitlines()
    updated = 0
    resolved = []
    unresolved = {}

    for i, line in enumerate(lines):
        if not line.startswith("|"):
            continue
        parts = [part.strip() for part in line.strip("|").split("|")]
        if len(parts) < 6 or parts[0].lower() == "date":
            continue
        date_val, lead, batch, channel, status, notes = parts[:6]
        email = lead.strip().lower()
        if email not in candidate_info:
            continue
        candidates = candidate_info[email]
        if not candidates:
            continue

        chosen = resolve_by_domain(notes, candidates) or resolve_by_name(notes, candidates)
        reason = "domain/name heuristic"
        if not chosen:
            # fallback: pick most complete profile (highest score), then lowest lead ID
            candidates_sorted = sorted(
                candidates,
                key=lambda c: (
                    -c.get("score", 0),
                    c.get("lead_id") if c.get("lead_id") is not None else 10**9,
                ),
            )
            if candidates_sorted:
                chosen = candidates_sorted[0]
                reason = "profile completeness"
        if not chosen:
            unresolved.setdefault(email, []).append(notes)
            continue
        parts[1] = chosen["name"]
        if not batch or batch.lower() in {"unknown", "n/a"}:
            parts[2] = chosen["batch"] or batch
        lines[i] = "| " + " | ".join(parts) + " |"
        updated += 1
        resolved.append((email, chosen["name"], chosen["path"], reason))

    CONTACT_LOG.write_text("\n".join(lines) + "\n", encoding="utf-8")

    report = []
    report.append("# Hostinger Contact Log Multi-Match Resolution")
    report.append(f"Generated: {date.today().isoformat()}")
    report.append(f"- Mapping source: {MAPPING_REPORT.as_posix()}")
    report.append(f"- Rows updated: {updated}")
    report.append("")
    if resolved:
        report.append("## Resolved")
        for email, name, path, reason in resolved:
            report.append(f"- {email} -> {name}")
            report.append(f"  - Profile: {path}")
            report.append(f"  - Reason: {reason}")
        report.append("")
    if unresolved:
        report.append("## Unresolved")
        for email, notes_list in unresolved.items():
            report.append(f"- {email}")
            for note in notes_list:
                report.append(f"  - Note: {note}")
        report.append("")

    REPORT_PATH.write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"Rows updated: {updated}")
    print(f"Report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
