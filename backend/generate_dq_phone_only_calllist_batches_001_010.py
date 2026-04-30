from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(".")
INDEX_CSV = REPO_ROOT / "leads" / "index.csv"
OUT_DIR = REPO_ROOT / "outreach" / "queues"

PHONE_DIGIT_RE = re.compile(r"\d")


def norm(v: str | None) -> str:
    return (v or "").strip()


def low(v: str | None) -> str:
    return norm(v).lower()


def yes(v: str | None) -> bool:
    return low(v) in {"yes", "y", "true", "1"}


def has_phone(v: str | None) -> bool:
    s = low(v)
    if not s or s in {"unknown", "not found", "n/a", "na"}:
        return False
    return bool(PHONE_DIGIT_RE.search(s))


def has_email(v: str | None) -> bool:
    s = norm(v)
    return "@" in s and "." in s and " " not in s


def has_url(v: str | None) -> bool:
    s = low(v)
    if not s or s in {"unknown", "not found", "n/a", "na"}:
        return False
    return "http://" in s or "https://" in s or "." in s


def tag_reasons(text: str) -> set[str]:
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
    ]:
        if kw in t:
            tags.add(tag)
    return tags


@dataclass(frozen=True)
class Row:
    lead_id: str
    name: str
    batch: str
    status: str
    outreach: str
    contact_path: str
    contact_search: str
    phone: str
    email: str
    website: str
    form: str
    social: str
    updated: str
    profile: str
    tags: list[str]
    score: int


def compute_score(*, phone: bool, email: bool, website: bool, form: bool, social: bool) -> int:
    # User asked for phone-only diamonds, so phone is mandatory but we still rank.
    score = 0
    if phone:
        score += 6
    # If there is already an email, it's less of a "phone-only diamond".
    if not email:
        score += 3
    if form:
        score += 2
    if website:
        score += 1
    if social:
        score += 1
    return score


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a call list from disqualified leads in batches 001-010 that still have a phone number.")
    parser.add_argument("--batch-from", type=int, default=1)
    parser.add_argument("--batch-to", type=int, default=10)
    parser.add_argument("--limit", type=int, default=300)
    parser.add_argument(
        "--exclude-tag",
        action="append",
        default=["hoa", "holding", "residential", "duplicate", "out-of-radius", "parked", "dead-domain", "too-large"],
        help="Exclude candidates containing this reason tag (repeatable).",
    )
    parser.add_argument(
        "--include-chains",
        action="store_true",
        help="Include items tagged as chains/excluded (default: filtered out).",
    )
    args = parser.parse_args()

    if not INDEX_CSV.exists():
        raise SystemExit(f"Missing {INDEX_CSV.as_posix()} (run scripts/generate-lead-views.py)")

    batches = {f"registered-entities-batch-{i:03d}" for i in range(args.batch_from, args.batch_to + 1)}

    disq_total = 0
    phone_disq_total = 0
    excluded_counts: Counter[str] = Counter()
    included: list[Row] = []

    with INDEX_CSV.open(newline="", encoding="utf-8", errors="ignore") as f:
        for r in csv.DictReader(f):
            batch = norm(r.get("Batch"))
            if batch not in batches:
                continue

            if not yes(r.get("Disqualified")) and low(r.get("Status")) != "disqualified":
                continue
            disq_total += 1

            phone_v = norm(r.get("Phone"))
            if not has_phone(phone_v):
                continue
            phone_disq_total += 1

            profile_v = norm(r.get("ProfilePath"))
            profile_text = ""
            if profile_v:
                p = REPO_ROOT / profile_v
                if p.exists():
                    profile_text = p.read_text(encoding="utf-8", errors="ignore")

            tags = tag_reasons(profile_text)
            if not args.include_chains and ("chain" in tags or "excluded" in tags):
                excluded_counts["chain/excluded"] += 1
                continue
            if args.exclude_tag:
                hit = [t for t in args.exclude_tag if t in tags]
                if hit:
                    for t in hit:
                        excluded_counts[t] += 1
                    continue

            email_v = norm(r.get("Email"))
            website_v = norm(r.get("Website"))
            form_v = norm(r.get("ContactForm"))
            social_v = norm(r.get("SocialMedia"))

            score = compute_score(
                phone=True,
                email=has_email(email_v),
                website=has_url(website_v),
                form=has_url(form_v),
                social=has_url(social_v),
            )

            included.append(
                Row(
                    lead_id=norm(r.get("LeadID")),
                    name=norm(r.get("Name")),
                    batch=batch,
                    status=norm(r.get("Status")),
                    outreach=norm(r.get("OutreachStatus")) or "unknown",
                    contact_path=norm(r.get("ContactPath")) or "unknown",
                    contact_search=norm(r.get("ContactSearch")) or "",
                    phone=phone_v,
                    email=email_v,
                    website=website_v,
                    form=form_v,
                    social=social_v,
                    updated=norm(r.get("Updated")) or "",
                    profile=profile_v,
                    tags=sorted(tags),
                    score=score,
                )
            )

    def sort_key(x: Row) -> tuple[int, int]:
        lid = int(x.lead_id) if x.lead_id.isdigit() else 999999
        return (-x.score, lid)

    ranked = sorted(included, key=sort_key)[: args.limit]

    today = date.today().isoformat()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"dq-phone-only-calllist-batches-{args.batch_from:03d}-{args.batch_to:03d}-{today}.md"

    lines: list[str] = []
    lines.append("# DQ Phone-Only Diamonds: Call List (Batches 001-010)")
    lines.append(f"Generated: {today}")
    lines.append("")
    lines.append(f"- Source: `{INDEX_CSV.as_posix()}`")
    lines.append(f"- Batches: {args.batch_from:03d}-{args.batch_to:03d}")
    lines.append(f"- Disqualified in scope: {disq_total}")
    lines.append(f"- Disqualified with phone present: {phone_disq_total}")
    lines.append(f"- Listed (after filters): {len(ranked)}")
    if excluded_counts:
        lines.append("- Excluded by tag:")
        for k, v in excluded_counts.most_common():
            lines.append(f"  - {k}: {v}")
    lines.append("")
    lines.append("Rule: These are disqualified leads, so treat as a fast re-check. Goal is only to confirm best email/website, or confirm they are truly out of scope.")
    lines.append("")
    lines.append("Call script (short):")
    lines.append("- Hi, this is Fred with McCullough Digital in Conroe.")
    lines.append("- We found your business in public records, but the online contact path was unclear.")
    lines.append("- What is the best email for the business? I have a quick note about your website and can send details.")
    lines.append("")
    lines.append("| Score | LeadID | Name | Batch | Phone | Email | Website | Outreach | Tags | Profile |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for r in ranked:
        tags = ",".join(r.tags)
        lines.append(
            "| "
            + " | ".join(
                [
                    str(r.score),
                    r.lead_id,
                    r.name or "unknown",
                    r.batch,
                    r.phone or "",
                    r.email or "",
                    r.website or "",
                    r.outreach,
                    tags,
                    r.profile,
                ]
            )
            + " |"
        )
    lines.append("")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote: {out_path.as_posix()}")


if __name__ == "__main__":
    main()
