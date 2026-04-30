from __future__ import annotations

import argparse
import csv
import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MONTGOMERY_ROOT = REPO_ROOT / "leads" / "montgomery-county-fresh"
DEFAULT_DB = MONTGOMERY_ROOT / "montgomery-fresh.sqlite"

CLASSIFIER_VERSION = "montgomery-qualifier-v1"

CHAIN_PHRASES = {
    "united refrigeration",
    "apricot lane boutique",
    "tide cleaners",
    "tide",
    "slick city",
}

HARD_HOLDING_TOKENS = {
    "holdings",
    "funding",
    "investments",
    "investment",
    "fund",
}

AMBIGUOUS_TOKENS = {
    "ventures",
    "realty",
    "partners",
    "properties",
    "property",
    "group",
    "team",
    "company",
}

OPERATING_PHRASES = {
    "art",
    "artwork",
    "artworks",
    "services",
    "service",
    "trucking",
    "realtor",
    "property management",
    "auto title services",
    "title services",
    "association",
    "garage",
    "construction",
    "consulting",
    "plumbing",
    "electric",
    "roofing",
    "lawn service",
    "wash pros",
}

OPERATING_TOKENS = {
    "auto",
    "artworks",
    "title",
    "service",
    "services",
    "trucking",
    "realtor",
    "association",
    "garage",
    "construction",
    "consulting",
    "plumbing",
    "electric",
    "roofing",
    "lawn",
    "wash",
    "art",
    "artwork",
    "solutions",
}

LOCAL_CITY_SET = {
    "conroe",
    "spring",
    "magnolia",
    "montgomery",
    "the woodlands",
    "porter",
    "new caney",
    "splendora",
    "willis",
    "cleveland",
    "huntsville",
}


def norm(value: object | None) -> str:
    if value is None:
        return ""
    return str(value).strip()


def normalize_name(value: str) -> str:
    lowered = norm(value).lower().replace("&", " and ")
    cleaned = []
    for ch in lowered:
        cleaned.append(ch if ch.isalnum() or ch.isspace() else " ")
    return " ".join("".join(cleaned).split())


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


@dataclass
class LeadRow:
    lead_id: str
    business_name: str
    city: str
    state: str
    doc_type: str
    website_status: str


@dataclass
class QualificationDecision:
    status: str
    confidence: str
    reason_codes: list[str]
    notes: str


def has_phrase(text: str, phrase: str) -> bool:
    return f" {phrase} " in f" {text} "


def classify_lead(row: LeadRow) -> QualificationDecision:
    name_n = normalize_name(row.business_name)
    city_n = normalize_name(row.city)
    tokens = set(name_n.split())
    reason_codes: list[str] = []

    if any(has_phrase(name_n, phrase) for phrase in CHAIN_PHRASES):
        reason_codes.append("known_chain")
        return QualificationDecision(
            status="disqualified",
            confidence="high",
            reason_codes=reason_codes,
            notes="Known chain or franchise phrase in business name.",
        )

    if any(token in tokens for token in HARD_HOLDING_TOKENS):
        reason_codes.append("holding_company_signal")
        return QualificationDecision(
            status="disqualified",
            confidence="high",
            reason_codes=reason_codes,
            notes="Hard holding/funding token in business name.",
        )

    if "property owners association" in name_n or "association" in tokens:
        reason_codes.extend(["association_allowed", "operating_local_business"])
        return QualificationDecision(
            status="qualified",
            confidence="high",
            reason_codes=reason_codes,
            notes="Association/nonprofit-style entity is allowed in this lane.",
        )

    operating_phrase_hit = any(has_phrase(name_n, phrase) for phrase in OPERATING_PHRASES)
    operating_token_hit = any(token in tokens for token in OPERATING_TOKENS)
    assumed_name_hit = row.doc_type.upper() == "ASSUMED NAME"
    local_city_hit = city_n in LOCAL_CITY_SET

    if operating_phrase_hit or operating_token_hit:
        if "property" in tokens and "management" in tokens:
            reason_codes.append("property_service_operating")
        else:
            reason_codes.append("operating_local_business")
        if assumed_name_hit:
            reason_codes.append("assumed_name_operating_signal")
        if local_city_hit:
            reason_codes.append("local_city")
        return QualificationDecision(
            status="qualified",
            confidence="high",
            reason_codes=reason_codes,
            notes="Clear operating/service signal in business name.",
        )

    ambiguous_hit = any(token in tokens for token in AMBIGUOUS_TOKENS)
    real_estate_phrase = has_phrase(name_n, "real estate")
    if ambiguous_hit or real_estate_phrase:
        if row.website_status == "matched":
            reason_codes.extend(["website_matched_signal", "ambiguous_name_pattern"])
            return QualificationDecision(
                status="qualified",
                confidence="medium",
                reason_codes=reason_codes,
                notes="Website matched and no hard disqualifier found, but name pattern remains somewhat ambiguous.",
            )
        reason_codes.append("ambiguous_name_pattern")
        return QualificationDecision(
            status="needs-review",
            confidence="medium",
            reason_codes=reason_codes,
            notes="Name pattern is ambiguous and needs review rather than hard disqualification.",
        )

    if row.website_status == "matched":
        reason_codes.extend(["website_matched_signal", "operating_local_business"])
        return QualificationDecision(
            status="qualified",
            confidence="medium",
            reason_codes=reason_codes,
            notes="Website matched and no hard negative signal was found.",
        )

    reason_codes.append("insufficient_operating_signal")
    return QualificationDecision(
        status="needs-review",
        confidence="low",
        reason_codes=reason_codes,
        notes="Insufficient operating signal for auto-qualification or hard disqualification.",
    )


def compute_manual_review(status: str, website_status: str) -> tuple[int, str]:
    reasons: list[str] = []
    if status == "needs-review":
        reasons.append("qualification_status=needs-review")
    if website_status in {"ambiguous", "error"}:
        reasons.append(f"website_status={website_status}")
    if status == "qualified" and website_status == "no_match":
        reasons.append("qualified_without_verified_website")
    return (1 if reasons else 0, "; ".join(reasons))


def load_rows(conn: sqlite3.Connection, *, limit: int, lead_ids: list[str]) -> list[LeadRow]:
    conn.row_factory = sqlite3.Row
    if lead_ids:
        placeholders = ",".join("?" for _ in lead_ids)
        rows = conn.execute(
            f"""
            SELECT lead_id, business_name, city, state, doc_type, website_status
            FROM montgomery_fresh_leads
            WHERE lead_id IN ({placeholders})
            ORDER BY lead_id
            """,
            lead_ids,
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT lead_id, business_name, city, state, doc_type, website_status
            FROM montgomery_fresh_leads
            ORDER BY lead_id
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [
        LeadRow(
            lead_id=row["lead_id"],
            business_name=row["business_name"],
            city=row["city"] or "",
            state=row["state"] or "TX",
            doc_type=row["doc_type"] or "",
            website_status=row["website_status"] or "",
        )
        for row in rows
    ]


def write_results_csv(path: Path, rows: list[dict[str, str]]) -> None:
    fieldnames = [
        "lead_id",
        "business_name",
        "city",
        "state",
        "website_status",
        "qualification_status",
        "qualification_confidence",
        "qualification_reason_codes",
        "manual_review_required",
        "manual_review_reason",
    ]
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_summary(
    path: Path,
    *,
    timestamp: str,
    run_id: str,
    db_path: Path,
    processed: int,
    qualified: int,
    needs_review: int,
    disqualified: int,
) -> None:
    path.write_text(
        "\n".join(
            [
                "# Montgomery Qualification Run Summary",
                "",
                f"Generated: {timestamp}",
                f"Run ID: `{run_id}`",
                "",
                "## Inputs",
                "",
                f"- DB: `{db_path}`",
                f"- Classifier version: `{CLASSIFIER_VERSION}`",
                "",
                "## Results",
                "",
                f"- Processed: **{processed}**",
                f"- Qualified: **{qualified}**",
                f"- Needs review: **{needs_review}**",
                f"- Disqualified: **{disqualified}**",
                "",
                "## Notes",
                "",
                "- This stage is Montgomery-only and does not touch the general lead corpus.",
                "- Qualification recomputes the manual-review flag from both the qualification result and the current website status.",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the isolated Montgomery qualifier and write results into the Montgomery DB.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to Montgomery-only SQLite DB.")
    parser.add_argument("--limit", type=int, default=100, help="Number of Montgomery leads to classify when lead IDs are not provided.")
    parser.add_argument("--lead-id", action="append", default=[], help="Specific Montgomery lead ID(s) to classify.")
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        raise FileNotFoundError(f"Missing Montgomery DB: {db_path}")

    timestamp = now_iso()
    run_stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_id = f"montgomery-qualification-{run_stamp}"
    run_dir = MONTGOMERY_ROOT / "runs" / "qualification" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    csv_path = run_dir / "results.csv"
    summary_path = run_dir / "summary.md"

    conn = sqlite3.connect(db_path, timeout=60)
    conn.execute("PRAGMA busy_timeout=60000")
    try:
        rows = load_rows(conn, limit=args.limit, lead_ids=[lead.upper() for lead in args.lead_id])
        conn.execute(
            "INSERT INTO montgomery_qualification_runs (run_id, generated_at, notes) VALUES (?, ?, ?)",
            (
                run_id,
                timestamp,
                f"classifier_version={CLASSIFIER_VERSION}; requested={len(rows)}",
            ),
        )

        csv_rows: list[dict[str, str]] = []
        qualified = needs_review = disqualified = 0

        for row in rows:
            decision = classify_lead(row)
            manual_review_required, manual_review_reason = compute_manual_review(decision.status, row.website_status)
            if decision.status == "qualified":
                qualified += 1
            elif decision.status == "needs-review":
                needs_review += 1
            else:
                disqualified += 1

            final_pipeline_status = decision.status
            if decision.status == "qualified":
                if row.website_status == "matched":
                    final_pipeline_status = "qualified-ready-for-audit-gate"
                elif row.website_status in {"no_match", "ambiguous", "error"}:
                    final_pipeline_status = "qualified-needs-website-review"

            conn.execute(
                """
                UPDATE montgomery_fresh_leads
                SET qualification_status = ?,
                    qualification_confidence = ?,
                    qualification_reason_codes = ?,
                    qualification_notes = ?,
                    qualification_run_id = ?,
                    qualification_updated_at = ?,
                    manual_review_required = ?,
                    manual_review_reason = ?,
                    final_pipeline_status = ?,
                    updated_at = ?
                WHERE lead_id = ?
                """,
                (
                    decision.status,
                    decision.confidence,
                    "; ".join(decision.reason_codes),
                    decision.notes,
                    run_id,
                    timestamp,
                    manual_review_required,
                    manual_review_reason,
                    final_pipeline_status,
                    timestamp,
                    row.lead_id,
                ),
            )

            csv_rows.append(
                {
                    "lead_id": row.lead_id,
                    "business_name": row.business_name,
                    "city": row.city,
                    "state": row.state,
                    "website_status": row.website_status,
                    "qualification_status": decision.status,
                    "qualification_confidence": decision.confidence,
                    "qualification_reason_codes": "; ".join(decision.reason_codes),
                    "manual_review_required": str(manual_review_required),
                    "manual_review_reason": manual_review_reason,
                }
            )

        conn.commit()

        write_results_csv(csv_path, csv_rows)
        write_summary(
            summary_path,
            timestamp=timestamp,
            run_id=run_id,
            db_path=db_path,
            processed=len(csv_rows),
            qualified=qualified,
            needs_review=needs_review,
            disqualified=disqualified,
        )

        print(f"Run directory: {run_dir}")
        print(
            "Counts: "
            f"processed={len(csv_rows)}, qualified={qualified}, needs_review={needs_review}, disqualified={disqualified}"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
