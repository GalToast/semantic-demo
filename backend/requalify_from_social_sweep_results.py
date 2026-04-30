from __future__ import annotations

import argparse
import json
import re
import shutil
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")


def update_header_field(lines: list[str], label: str, value: str) -> None:
    prefix = f"{label}:"
    for i, line in enumerate(lines[:140]):
        if line.startswith(prefix):
            lines[i] = f"{prefix} {value}".rstrip()
            return
    # Insert near the top if missing.
    insert_after = 0
    for key in (
        "Status:",
        "Outreach status:",
        "Contact path:",
        "Social check:",
        "Batch:",
        "Batch line:",
        "Source:",
        "Address:",
    ):
        for i, line in enumerate(lines[:80]):
            if line.startswith(key):
                insert_after = max(insert_after, i)
    lines.insert(insert_after + 1, f"{prefix} {value}".rstrip())


def append_note(text: str, note: str, stamp: str) -> str:
    if stamp in text:
        return text
    for header in ("## Updates", "## Notes"):
        idx = text.find(header)
        if idx != -1:
            after = idx + len(header)
            next_hdr = text.find("\n## ", after)
            if next_hdr == -1:
                return text.rstrip() + "\n\n" + note.strip() + "\n"
            return text[:next_hdr].rstrip() + "\n" + note.strip() + "\n\n" + text[next_hdr:].lstrip()
    return text.rstrip() + "\n\n## Notes\n" + note.strip() + "\n"


def range_dir(lead_id: int) -> str:
    lo = (lead_id // 100) * 100
    hi = lo + 99
    return f"{lo:03d}-{hi:03d}"


def is_real_email(v: str) -> bool:
    v = (v or "").strip()
    if not v or "@" not in v:
        return False
    dom = v.split("@", 1)[-1].lower()
    # Ignore platform/support emails.
    if dom in {"contra.com", "eventeny.com", "etsy.com", "linkedin.com", "facebookmail.com"}:
        return False
    return "." in dom


@dataclass(frozen=True)
class Result:
    lead_id: int
    name: str
    profile_path: str
    best_url: str
    email: str
    phone: str
    has_message: bool
    evidence_urls: list[str]


def main() -> None:
    ap = argparse.ArgumentParser(description="Apply social-sweep scrape results to profiles and re-qualify when actionable.")
    ap.add_argument("--results", required=True, help="tmp/social-sweep-results-*.json")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--report", default="")
    args = ap.parse_args()

    results_path = Path(args.results)
    if not results_path.exists():
        raise SystemExit(f"Missing: {results_path.as_posix()}")

    today = date.today().isoformat()
    report_path = Path(args.report) if args.report else Path("reports") / f"social-sweep-apply-{today}.md"

    raw_text = results_path.read_text(encoding="utf-8", errors="ignore")
    # Windows tooling sometimes writes UTF-8 with BOM.
    if raw_text.startswith("\ufeff"):
        raw_text = raw_text.lstrip("\ufeff")
    raw = json.loads(raw_text)
    rows: list[Result] = []
    for r in raw:
        rows.append(
            Result(
                lead_id=int(r.get("lead_id") or 0),
                name=(r.get("name") or "").strip(),
                profile_path=(r.get("profile_path") or "").strip(),
                best_url=(r.get("best_url") or "").strip(),
                email=(r.get("email") or "").strip(),
                phone=(r.get("phone") or "").strip(),
                has_message=bool(r.get("has_message") or False),
                evidence_urls=list(r.get("evidence_urls") or []),
            )
        )

    report: list[str] = []
    report.append("# Social Sweep Apply")
    report.append(f"Generated: {today}")
    report.append(f"Results: `{results_path.as_posix()}`")
    report.append(f"Apply: `{'yes' if args.apply else 'no'}`")
    report.append("")

    requalified = 0
    stayed_disqualified = 0
    conflicts = 0
    missing = 0
    errors = 0

    def resolve_profile_md_path(row: Row) -> Path | None:
        """
        Results can occasionally carry a stale/incorrect `profile_path` (e.g. directory renamed).
        When that happens, try to locate `{lead_id}-*/profile.md` inside the expected 100-range.
        """
        prof = Path(row.profile_path)
        if prof.exists():
            return prof

        try:
            lead_id = int(row.lead_id)
        except Exception:
            return None

        rdir = range_dir(lead_id)
        candidates: list[Path] = []
        for root in (Path("leads/disqualified") / rdir, Path("leads/profiles") / rdir):
            if not root.exists():
                continue
            candidates.extend(root.glob(f"{lead_id}-*/profile.md"))

        # Prefer disqualified if both exist.
        disq = [p for p in candidates if "leads/disqualified/" in p.as_posix().replace("\\", "/")]
        if len(disq) == 1:
            return disq[0]
        if len(candidates) == 1:
            return candidates[0]
        return None

    for r in rows:
        prof = resolve_profile_md_path(r)
        if not prof or not prof.exists():
            report.append(f"- {r.lead_id} {r.name}: MISSING `{r.profile_path}`")
            missing += 1
            continue

        # Only handle currently-disqualified profile dirs.
        if "leads/disqualified/" not in prof.as_posix().replace("\\", "/"):
            report.append(f"- {r.lead_id} {r.name}: SKIP (not under leads/disqualified) `{r.profile_path}`")
            stayed_disqualified += 1
            continue

        original = prof.read_text(encoding="utf-8", errors="ignore")
        lines = original.splitlines()

        actionable = False
        if is_real_email(r.email):
            update_header_field(lines, "Email", r.email)
            update_header_field(lines, "Contact path", "email")
            actionable = True
        if r.phone and len(re.sub(r"\D+", "", r.phone)) >= 10:
            update_header_field(lines, "Phone", r.phone)
            if not actionable:
                update_header_field(lines, "Contact path", "phone-only")
                actionable = True
        if r.best_url:
            update_header_field(lines, "Social media", r.best_url)
            if r.has_message and not actionable:
                update_header_field(lines, "Contact path", "social")
                actionable = True

        update_header_field(lines, "Contact search", f"checked {today} (social sweep)")
        update_header_field(lines, "Last updated", today)

        if actionable:
            # Bring back to qualified pool.
            update_header_field(lines, "Status", "ready")
            update_header_field(lines, "Outreach status", "uncontacted")
        else:
            # Keep disqualified (no new contact path).
            update_header_field(lines, "Status", "disqualified")

        stamp = f"Social sweep pass: {today}"
        ev = ", ".join((r.evidence_urls or [])[:4]) if r.evidence_urls else "(none)"
        note = (
            f"- **{today}**: {stamp}. Best URL: {r.best_url or 'n/a'}. "
            f"Found email: {r.email or 'no'}. Found phone: {r.phone or 'no'}. "
            f"Message/DM visible: {'yes' if r.has_message else 'no/unknown'}. Evidence: {ev}."
        )
        updated = "\n".join(lines) + "\n"
        updated = append_note(updated, note, stamp)

        if args.apply:
            latest = prof.read_text(encoding="utf-8", errors="ignore")
            if latest != original:
                report.append(f"- {r.lead_id} {r.name}: SKIP (conflict: file changed since read)")
                conflicts += 1
                continue

            try:
                prof.write_text(updated, encoding="utf-8")
            except Exception as e:
                report.append(f"- {r.lead_id} {r.name}: ERROR writing: {type(e).__name__} {str(e)[:160]}")
                errors += 1
                continue

            if actionable:
                src_dir = prof.parent
                dst_dir = REPO_ROOT / "leads" / "profiles" / range_dir(r.lead_id) / src_dir.name
                if dst_dir.exists():
                    report.append(f"- {r.lead_id} {r.name}: ERROR dst exists `{dst_dir.as_posix()}`")
                    errors += 1
                    continue
                dst_dir.parent.mkdir(parents=True, exist_ok=True)
                try:
                    shutil.move(str(src_dir), str(dst_dir))
                except Exception as e:
                    report.append(f"- {r.lead_id} {r.name}: ERROR move back: {type(e).__name__} {str(e)[:160]}")
                    errors += 1
                    continue

        if actionable:
            report.append(f"- {r.lead_id} {r.name}: REQUALIFIED (moved back to leads/profiles)")
            requalified += 1
        else:
            report.append(f"- {r.lead_id} {r.name}: still disqualified (no new contact path)")
            stayed_disqualified += 1

    report.append("")
    report.append("## Summary")
    report.append(f"- Total results: {len(rows)}")
    report.append(f"- Requalified: {requalified}")
    report.append(f"- Stayed disqualified: {stayed_disqualified}")
    report.append(f"- Conflicts: {conflicts}")
    report.append(f"- Missing: {missing}")
    report.append(f"- Errors: {errors}")
    report.append("")

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(report), encoding="utf-8")
    print(f"Wrote report: {report_path.as_posix()}")
    print(f"Requalified: {requalified} (apply={args.apply})")


if __name__ == "__main__":
    main()
