from __future__ import annotations

import argparse
import csv
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
INDEX_CSV = REPO_ROOT / "leads" / "index.csv"
REPORTS_DIR = REPO_ROOT / "reports"

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE_DIGIT_RE = re.compile(r"\d")


def norm(v: str | None) -> str:
    return (v or "").strip()


def low(v: str | None) -> str:
    return norm(v).lower()


def yes(v: str | None) -> bool:
    return low(v) in {"yes", "y", "true", "1"}


def has_email(v: str | None) -> bool:
    s = norm(v)
    return "@" in s and "." in s and " " not in s


def has_phone(v: str | None) -> bool:
    s = low(v)
    if not s or s in {"unknown", "not found", "n/a", "na"}:
        return False
    return bool(PHONE_DIGIT_RE.search(s))


def has_url(v: str | None) -> bool:
    s = low(v)
    if not s or s in {"unknown", "not found", "n/a", "na"}:
        return False
    return "http://" in s or "https://" in s or "." in s


def tag_reasons(text: str) -> set[str]:
    """
    Best-effort reasons tagging to avoid wasting time on obvious DQs.
    """
    t = (text or "").lower()
    tags: set[str] = set()
    for kw, tag in [
        ("excluded", "excluded"),
        ("per user instruction", "excluded"),
        ("user instruction", "excluded"),
        ("large chain", "chain"),
        ("chain", "chain"),
        ("franchise", "chain"),
        ("hoa", "hoa"),
        ("homeowners association", "hoa"),
        ("property/holding", "holding"),
        ("holding entity", "holding"),
        ("holding company", "holding"),
        ("limited partnership", "holding"),
        ("residential", "residential"),
        ("same as", "duplicate"),
        ("duplicate", "duplicate"),
        ("parked", "parked"),
        ("parking page", "parked"),
        ("sedo", "parked"),
        ("out of current radius", "out-of-radius"),
        ("address mismatch", "out-of-radius"),
        ("acquired by", "too-large"),
        ("d.r. horton", "too-large"),
        ("dr horton", "too-large"),
        ("large corporation", "too-large"),
        ("large multi-state", "too-large"),
        ("too large", "too-large"),
        ("national corporation", "too-large"),
        ("global manufacturer", "too-large"),
        ("industrial facility", "too-large"),
        ("nyse", "too-large"),
        ("500+ locations", "too-large"),
        ("8,000+ employees", "too-large"),
        ("not a target for local digital services", "too-large"),
        ("closed", "closed"),
        ("business closed", "closed"),
        ("domain is dead", "dead-domain"),
        ("err_name_not_resolved", "dead-domain"),
    ]:
        if kw in t:
            tags.add(tag)
    return tags


@dataclass(frozen=True)
class Candidate:
    lead_id: str
    name: str
    batch: str
    profile: str
    outreach: str
    email: str
    phone: str
    website: str
    form: str
    social: str
    contact_path: str
    contact_search: str
    updated: str
    tags: list[str]
    score: int


def compute_score(*, email: bool, phone: bool, website: bool, form: bool, social: bool) -> int:
    # "Diamond" signal: a disqualified lead that is actually contactable.
    score = 0
    if email:
        score += 7
    if form:
        score += 5
    if phone:
        score += 3
    if website:
        score += 2
    if social:
        score += 2
    return score


def main() -> None:
    parser = argparse.ArgumentParser(description="Scan disqualified leads in batches 001-010 for potential misclassification (contactable).")
    parser.add_argument("--batch-from", type=int, default=1)
    parser.add_argument("--batch-to", type=int, default=10)
    parser.add_argument("--limit", type=int, default=150, help="Max candidates to list.")
    parser.add_argument(
        "--include-tag",
        action="append",
        default=[],
        help="If set, only include candidates containing this reason tag (repeatable).",
    )
    parser.add_argument(
        "--exclude-tag",
        action="append",
        default=["excluded", "chain", "hoa", "holding", "residential", "duplicate", "out-of-radius", "parked", "dead-domain", "too-large", "closed"],
        help="Exclude candidates containing this reason tag (repeatable).",
    )
    args = parser.parse_args()

    if not INDEX_CSV.exists():
        raise SystemExit(f"Missing {INDEX_CSV.as_posix()} (run scripts/generate-lead-views.py)")

    batches = {f"registered-entities-batch-{i:03d}" for i in range(args.batch_from, args.batch_to + 1)}

    candidates: list[Candidate] = []
    disq_total = 0

    with INDEX_CSV.open(newline="", encoding="utf-8", errors="ignore") as f:
        for r in csv.DictReader(f):
            batch = norm(r.get("Batch"))
            if batch not in batches:
                continue
            if not yes(r.get("Disqualified")) and low(r.get("Status")) != "disqualified":
                continue
            disq_total += 1

            email_v = norm(r.get("Email"))
            phone_v = norm(r.get("Phone"))
            website_v = norm(r.get("Website"))
            form_v = norm(r.get("ContactForm"))
            social_v = norm(r.get("SocialMedia"))
            profile_v = norm(r.get("ProfilePath"))

            email_ok = has_email(email_v)
            phone_ok = has_phone(phone_v)
            website_ok = has_url(website_v)
            form_ok = has_url(form_v)
            social_ok = has_url(social_v)

            score = compute_score(email=email_ok, phone=phone_ok, website=website_ok, form=form_ok, social=social_ok)
            if score <= 0:
                continue

            profile_text = ""
            if profile_v:
                p = REPO_ROOT / profile_v
                if p.exists():
                    profile_text = p.read_text(encoding="utf-8", errors="ignore")

            tags = tag_reasons(profile_text)

            if args.include_tag:
                if not any(t in tags for t in args.include_tag):
                    continue
            if args.exclude_tag:
                if any(t in tags for t in args.exclude_tag):
                    continue

            candidates.append(
                Candidate(
                    lead_id=norm(r.get("LeadID")),
                    name=norm(r.get("Name")),
                    batch=batch,
                    profile=profile_v,
                    outreach=norm(r.get("OutreachStatus")) or "unknown",
                    email=email_v,
                    phone=phone_v,
                    website=website_v,
                    form=form_v,
                    social=social_v,
                    contact_path=norm(r.get("ContactPath")) or "unknown",
                    contact_search=norm(r.get("ContactSearch")) or "",
                    updated=norm(r.get("Updated")) or "",
                    tags=sorted(tags),
                    score=score,
                )
            )

    # Rank: highest signal first, stable tie-break by LeadID.
    def sort_key(c: Candidate) -> tuple[int, int]:
        lid = int(c.lead_id) if c.lead_id.isdigit() else 999999
        return (-c.score, lid)

    ranked = sorted(candidates, key=sort_key)
    ranked = ranked[: args.limit]

    today = date.today().isoformat()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = REPORTS_DIR / f"dq-diamonds-batches-{args.batch_from:03d}-{args.batch_to:03d}-{today}.md"

    lines: list[str] = []
    lines.append("# DQ Diamonds Scan (Batches 001-010)")
    lines.append(f"Generated: {today}")
    lines.append("")
    lines.append(f"- Source: `{INDEX_CSV.as_posix()}`")
    lines.append(f"- Batches: {args.batch_from:03d}-{args.batch_to:03d}")
    lines.append(f"- Disqualified in scope: {disq_total}")
    lines.append(f"- Candidates (score > 0): {len(candidates)}")
    lines.append(f"- Listed: {len(ranked)}")
    lines.append("")
    lines.append("Definition: disqualified leads that still show a usable contact method in the profile header or worklist-derived fields.")
    lines.append("Default filter: excludes obvious reasons (excluded, chain, hoa, holding, residential, duplicate, out-of-radius, parked, dead-domain, too-large, closed).")
    lines.append("")

    if not ranked:
        lines.append("## Candidates")
        lines.append("- (none)")
        out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"Wrote: {out_path.as_posix()}")
        return

    lines.append("## Candidates (Ranked)")
    lines.append("| Score | LeadID | Name | Batch | Outreach | Email | Phone | Website | Form | Social | Tags | Profile |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for c in ranked:
        tags = ",".join(c.tags)
        lines.append(
            "| "
            + " | ".join(
                [
                    str(c.score),
                    c.lead_id,
                    c.name or "unknown",
                    c.batch,
                    c.outreach,
                    c.email,
                    c.phone,
                    c.website,
                    c.form,
                    c.social,
                    tags,
                    c.profile,
                ]
            )
            + " |"
        )
    lines.append("")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote: {out_path.as_posix()}")


if __name__ == "__main__":
    main()
