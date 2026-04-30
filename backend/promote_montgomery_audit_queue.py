from __future__ import annotations

import argparse
import csv
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MONTGOMERY_ROOT = REPO_ROOT / "leads" / "montgomery-county-fresh"
DEFAULT_DB = MONTGOMERY_ROOT / "montgomery-fresh.sqlite"


def norm(value: object | None) -> str:
    if value is None:
        return ""
    return str(value).strip()


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


@dataclass
class LeadState:
    lead_id: str
    business_name: str
    website_status: str
    website_confidence: str
    qualification_status: str
    qualification_confidence: str
    manual_review_required: int


@dataclass
class GateDecision:
    audit_eligible: int
    decision: str
    reason: str
    final_pipeline_status: str


def compute_gate(state: LeadState) -> GateDecision:
    website_status = norm(state.website_status)
    qualification_status = norm(state.qualification_status)
    website_conf = norm(state.website_confidence)
    qualification_conf = norm(state.qualification_confidence)
    review_required = bool(state.manual_review_required)

    if qualification_status == "disqualified":
        return GateDecision(
            audit_eligible=0,
            decision="hold",
            reason="qualification_status=disqualified",
            final_pipeline_status="disqualified",
        )

    if qualification_status == "qualified":
        if website_status == "matched" and website_conf in {"high", "medium"} and qualification_conf in {"high", "medium"} and not review_required:
            return GateDecision(
                audit_eligible=1,
                decision="advance",
                reason="qualified_with_verified_website",
                final_pipeline_status="qualified-ready-for-audit-gate",
            )
        if website_status in {"ambiguous", "error"}:
            return GateDecision(
                audit_eligible=0,
                decision="review",
                reason=f"website_status={website_status}",
                final_pipeline_status="qualified-needs-website-review",
            )
        if website_status in {"", "no_match"}:
            return GateDecision(
                audit_eligible=0,
                decision="review",
                reason="qualified_without_verified_website",
                final_pipeline_status="qualified-needs-website-review",
            )
        return GateDecision(
            audit_eligible=0,
            decision="review",
            reason="qualified_unexpected_website_state",
            final_pipeline_status="qualified-needs-website-review",
        )

    if qualification_status == "needs-review":
        return GateDecision(
            audit_eligible=0,
            decision="review",
            reason="qualification_status=needs-review",
            final_pipeline_status="needs-review",
        )

    return GateDecision(
        audit_eligible=0,
        decision="hold",
        reason="qualification_status=unknown",
        final_pipeline_status="unclassified",
    )


def load_rows(conn: sqlite3.Connection, *, limit: int, lead_ids: list[str]) -> list[LeadState]:
    conn.row_factory = sqlite3.Row
    if lead_ids:
        placeholders = ",".join("?" for _ in lead_ids)
        sql = f"""
            SELECT lead_id, business_name, website_status, website_confidence,
                   qualification_status, qualification_confidence, manual_review_required
            FROM montgomery_fresh_leads
            WHERE lead_id IN ({placeholders})
            ORDER BY lead_id
        """
        rows = conn.execute(sql, lead_ids).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT lead_id, business_name, website_status, website_confidence,
                   qualification_status, qualification_confidence, manual_review_required
            FROM montgomery_fresh_leads
            ORDER BY lead_id
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [
        LeadState(
            lead_id=row["lead_id"],
            business_name=row["business_name"],
            website_status=row["website_status"] or "",
            website_confidence=row["website_confidence"] or "",
            qualification_status=row["qualification_status"] or "",
            qualification_confidence=row["qualification_confidence"] or "",
            manual_review_required=int(row["manual_review_required"] or 0),
        )
        for row in rows
    ]


def write_results_csv(path: Path, rows: list[dict[str, str]]) -> None:
    fieldnames = [
        "lead_id",
        "business_name",
        "website_status",
        "website_confidence",
        "qualification_status",
        "qualification_confidence",
        "audit_gate_decision",
        "audit_gate_reason",
        "audit_eligible",
        "final_pipeline_status",
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
    advanced: int,
    review: int,
    held: int,
) -> None:
    path.write_text(
        "\n".join(
            [
                "# Montgomery Audit Gate Run Summary",
                "",
                f"Generated: {timestamp}",
                f"Run ID: `{run_id}`",
                "",
                "## Inputs",
                "",
                f"- DB: `{db_path}`",
                "",
                "## Results",
                "",
                f"- Processed: **{processed}**",
                f"- Advance: **{advanced}**",
                f"- Review: **{review}**",
                f"- Hold: **{held}**",
                "",
                "## Notes",
                "",
                "- This stage does not run deep audits; it only computes the Montgomery-only audit queue gate.",
                "- The gate recomputes effective readiness from the current website and qualification fields instead of trusting older summary labels.",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Promote Montgomery-only leads into the isolated audit queue.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to Montgomery-only SQLite DB.")
    parser.add_argument("--limit", type=int, default=250, help="Number of rows to process when lead IDs are not provided.")
    parser.add_argument("--lead-id", action="append", default=[], help="Specific Montgomery lead ID(s) to gate.")
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        raise FileNotFoundError(f"Missing Montgomery DB: {db_path}")

    timestamp = now_iso()
    run_stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_id = f"montgomery-audit-gate-{run_stamp}"
    run_dir = MONTGOMERY_ROOT / "runs" / "audit-gate" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    csv_path = run_dir / "results.csv"
    summary_path = run_dir / "summary.md"

    conn = sqlite3.connect(db_path, timeout=60)
    conn.execute("PRAGMA busy_timeout=60000")
    try:
        rows = load_rows(conn, limit=args.limit, lead_ids=[lead.upper() for lead in args.lead_id])
        conn.execute(
            "INSERT INTO montgomery_audit_gate_runs (run_id, generated_at, notes) VALUES (?, ?, ?)",
            (
                run_id,
                timestamp,
                f"requested={len(rows)}",
            ),
        )

        csv_rows: list[dict[str, str]] = []
        advanced = review = held = 0

        for row in rows:
            gate = compute_gate(row)
            if gate.decision == "advance":
                advanced += 1
            elif gate.decision == "review":
                review += 1
            else:
                held += 1

            conn.execute(
                """
                UPDATE montgomery_fresh_leads
                SET audit_eligible = ?,
                    audit_gate_decision = ?,
                    audit_gate_reason = ?,
                    audit_gate_run_id = ?,
                    audit_gate_updated_at = ?,
                    final_pipeline_status = ?,
                    updated_at = ?
                WHERE lead_id = ?
                """,
                (
                    gate.audit_eligible,
                    gate.decision,
                    gate.reason,
                    run_id,
                    timestamp,
                    gate.final_pipeline_status,
                    timestamp,
                    row.lead_id,
                ),
            )

            csv_rows.append(
                {
                    "lead_id": row.lead_id,
                    "business_name": row.business_name,
                    "website_status": row.website_status,
                    "website_confidence": row.website_confidence,
                    "qualification_status": row.qualification_status,
                    "qualification_confidence": row.qualification_confidence,
                    "audit_gate_decision": gate.decision,
                    "audit_gate_reason": gate.reason,
                    "audit_eligible": str(gate.audit_eligible),
                    "final_pipeline_status": gate.final_pipeline_status,
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
            advanced=advanced,
            review=review,
            held=held,
        )

        print(f"Run directory: {run_dir}")
        print(
            "Counts: "
            f"processed={len(csv_rows)}, advance={advanced}, review={review}, hold={held}"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
