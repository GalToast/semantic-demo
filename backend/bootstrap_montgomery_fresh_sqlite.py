from __future__ import annotations

import argparse
import csv
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MONTGOMERY_ROOT = REPO_ROOT / "leads" / "montgomery-county-fresh"
DEFAULT_SOURCE_CSV = (
    REPO_ROOT
    / "leads"
    / "bundles"
    / "montgomery-county-fresh-businesses-2026-03-05"
    / "county-fresh-leads-net-new-strict-v2.csv"
)
DEFAULT_DB = MONTGOMERY_ROOT / "montgomery-fresh.sqlite"
DEFAULT_SUMMARY = MONTGOMERY_ROOT / "montgomery-fresh-bootstrap-summary.md"

TRIAGE_PASS_RE = re.compile(r"triage-pass-(\d+)\.csv$", re.IGNORECASE)
PROFILE_LEAD_RE = re.compile(r"^(mcf-\d{4})", re.IGNORECASE)


def norm(value: object | None) -> str:
    if value is None:
        return ""
    return str(value).strip()


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def find_latest_triage_csv(root: Path) -> Path:
    candidates: list[tuple[int, float, Path]] = []
    for path in root.glob("triage-pass-*.csv"):
        match = TRIAGE_PASS_RE.search(path.name)
        if not match:
            continue
        candidates.append((int(match.group(1)), path.stat().st_mtime, path))
    if not candidates:
        raise FileNotFoundError(f"No triage-pass-*.csv files found under {root}")
    candidates.sort(key=lambda item: (item[0], item[1], item[2].name))
    return candidates[-1][2]


@dataclass
class ProfileRecord:
    lead_id: str
    profile_path: str
    profile_bucket: str


def scan_profile_paths(root: Path) -> dict[str, ProfileRecord]:
    profile_map: dict[str, ProfileRecord] = {}
    for bucket_name, bucket_root in (
        ("qualified_profile", root / "profiles"),
        ("disqualified_profile", root / "disqualified"),
    ):
        if not bucket_root.exists():
            continue
        for path in bucket_root.rglob("profile.md"):
            parent = path.parent.name
            match = PROFILE_LEAD_RE.match(parent)
            if not match:
                continue
            lead_id = match.group(1).upper()
            profile_map[lead_id] = ProfileRecord(
                lead_id=lead_id,
                profile_path=str(path.relative_to(REPO_ROOT)).replace("\\", "/"),
                profile_bucket=bucket_name,
            )
    return profile_map


def read_csv_by_lead(path: Path) -> dict[str, dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        rows: dict[str, dict[str, str]] = {}
        for row in reader:
            lead_id = norm(row.get("lead_id")).upper()
            if not lead_id:
                continue
            rows[lead_id] = {key: norm(value) for key, value in row.items()}
    return rows


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;

        DROP VIEW IF EXISTS montgomery_v_pipeline_summary;
        DROP VIEW IF EXISTS montgomery_v_audit_queue;
        DROP VIEW IF EXISTS montgomery_v_review_queue;
        DROP VIEW IF EXISTS montgomery_v_qualification_queue;
        DROP VIEW IF EXISTS montgomery_v_website_queue;

        DROP TABLE IF EXISTS montgomery_stage_feedback;
        DROP TABLE IF EXISTS montgomery_audit_gate_runs;
        DROP TABLE IF EXISTS montgomery_qualification_runs;
        DROP TABLE IF EXISTS montgomery_website_finder_runs;
        DROP TABLE IF EXISTS montgomery_bootstrap_runs;
        DROP TABLE IF EXISTS montgomery_fresh_leads;

        CREATE TABLE montgomery_bootstrap_runs (
            run_id TEXT PRIMARY KEY,
            generated_at TEXT NOT NULL,
            source_csv TEXT NOT NULL,
            triage_csv TEXT NOT NULL,
            total_leads INTEGER NOT NULL,
            qualified_count INTEGER NOT NULL,
            needs_review_count INTEGER NOT NULL,
            disqualified_count INTEGER NOT NULL,
            profile_count INTEGER NOT NULL
        );

        CREATE TABLE montgomery_website_finder_runs (
            run_id TEXT PRIMARY KEY,
            generated_at TEXT NOT NULL,
            notes TEXT DEFAULT ''
        );

        CREATE TABLE montgomery_qualification_runs (
            run_id TEXT PRIMARY KEY,
            generated_at TEXT NOT NULL,
            notes TEXT DEFAULT ''
        );

        CREATE TABLE montgomery_audit_gate_runs (
            run_id TEXT PRIMARY KEY,
            generated_at TEXT NOT NULL,
            notes TEXT DEFAULT ''
        );

        CREATE TABLE montgomery_stage_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id TEXT NOT NULL,
            source_stage TEXT NOT NULL,
            target_stage TEXT NOT NULL,
            feedback_code TEXT NOT NULL,
            feedback_note TEXT DEFAULT '',
            created_at TEXT NOT NULL
        );

        CREATE TABLE montgomery_fresh_leads (
            lead_id TEXT PRIMARY KEY,
            source TEXT,
            business_name TEXT NOT NULL,
            address TEXT,
            city TEXT,
            state TEXT,
            zip TEXT,
            naics TEXT,
            fresh_date TEXT,
            date_basis TEXT,
            doc_type TEXT,
            reference_url TEXT,

            profile_path TEXT DEFAULT '',
            profile_bucket TEXT DEFAULT '',
            profile_exists INTEGER NOT NULL DEFAULT 0,

            website_status TEXT DEFAULT '',
            website_domain TEXT DEFAULT '',
            website_url TEXT DEFAULT '',
            website_confidence TEXT DEFAULT '',
            website_match_method TEXT DEFAULT '',
            website_evidence TEXT DEFAULT '',
            website_run_id TEXT DEFAULT '',
            website_updated_at TEXT DEFAULT '',

            qualification_status TEXT DEFAULT '',
            qualification_confidence TEXT DEFAULT '',
            qualification_reason_codes TEXT DEFAULT '',
            qualification_notes TEXT DEFAULT '',
            qualification_run_id TEXT DEFAULT '',
            qualification_updated_at TEXT DEFAULT '',
            holding_company_signals TEXT DEFAULT '',

            audit_eligible INTEGER NOT NULL DEFAULT 0,
            audit_gate_decision TEXT DEFAULT '',
            audit_gate_reason TEXT DEFAULT '',
            audit_gate_run_id TEXT DEFAULT '',
            audit_gate_updated_at TEXT DEFAULT '',

            manual_review_required INTEGER NOT NULL DEFAULT 0,
            manual_review_reason TEXT DEFAULT '',
            final_pipeline_status TEXT DEFAULT '',
            bootstrap_run_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX idx_montgomery_qualification_status
            ON montgomery_fresh_leads(qualification_status);
        CREATE INDEX idx_montgomery_website_status
            ON montgomery_fresh_leads(website_status);
        CREATE INDEX idx_montgomery_manual_review
            ON montgomery_fresh_leads(manual_review_required);

        CREATE VIEW montgomery_v_website_queue AS
        SELECT *
        FROM montgomery_fresh_leads
        WHERE qualification_status IN ('qualified', 'needs-review')
          AND COALESCE(website_status, '') = '';

        CREATE VIEW montgomery_v_qualification_queue AS
        SELECT *
        FROM montgomery_fresh_leads
        WHERE COALESCE(qualification_status, '') = '';

        CREATE VIEW montgomery_v_review_queue AS
        SELECT *
        FROM montgomery_fresh_leads
        WHERE qualification_status = 'needs-review'
           OR website_status = 'ambiguous'
           OR manual_review_required = 1;

        CREATE VIEW montgomery_v_audit_queue AS
        SELECT *
        FROM montgomery_fresh_leads
        WHERE qualification_status = 'qualified'
          AND website_status = 'matched'
          AND audit_eligible = 1;

        CREATE VIEW montgomery_v_pipeline_summary AS
        SELECT 'total_leads' AS metric, COUNT(*) AS value FROM montgomery_fresh_leads
        UNION ALL
        SELECT 'qualified', COUNT(*) FROM montgomery_fresh_leads WHERE qualification_status = 'qualified'
        UNION ALL
        SELECT 'needs_review', COUNT(*) FROM montgomery_fresh_leads WHERE qualification_status = 'needs-review'
        UNION ALL
        SELECT 'disqualified', COUNT(*) FROM montgomery_fresh_leads WHERE qualification_status = 'disqualified'
        UNION ALL
        SELECT 'website_queue', COUNT(*) FROM montgomery_v_website_queue
        UNION ALL
        SELECT 'qualification_queue', COUNT(*) FROM montgomery_v_qualification_queue
        UNION ALL
        SELECT 'review_queue', COUNT(*) FROM montgomery_v_review_queue
        UNION ALL
        SELECT 'audit_queue', COUNT(*) FROM montgomery_v_audit_queue
        UNION ALL
        SELECT 'profile_exists', COUNT(*) FROM montgomery_fresh_leads WHERE profile_exists = 1;
        """
    )


def build_rows(
    raw_rows: dict[str, dict[str, str]],
    triage_rows: dict[str, dict[str, str]],
    profile_map: dict[str, ProfileRecord],
    bootstrap_run_id: str,
    qualification_run_id: str,
    timestamp: str,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for lead_id in sorted(raw_rows.keys()):
        raw = raw_rows[lead_id]
        triage = triage_rows.get(lead_id, {})
        profile = profile_map.get(lead_id)
        qualification_status = norm(triage.get("decision"))
        manual_review_required = 1 if qualification_status == "needs-review" else 0
        manual_review_reason = ""
        if manual_review_required:
            manual_review_reason = "qualification_status=needs-review"
        rows.append(
            {
                "lead_id": lead_id,
                "source": raw.get("source", ""),
                "business_name": raw.get("business_name", ""),
                "address": raw.get("address", ""),
                "city": raw.get("city", ""),
                "state": raw.get("state", ""),
                "zip": raw.get("zip", ""),
                "naics": raw.get("naics", ""),
                "fresh_date": raw.get("fresh_date", ""),
                "date_basis": raw.get("date_basis", ""),
                "doc_type": raw.get("doc_type", ""),
                "reference_url": raw.get("reference_url", ""),
                "profile_path": profile.profile_path if profile else "",
                "profile_bucket": profile.profile_bucket if profile else "",
                "profile_exists": 1 if profile else 0,
                "qualification_status": qualification_status,
                "qualification_confidence": norm(triage.get("confidence")),
                "qualification_reason_codes": norm(triage.get("reasons")),
                "qualification_notes": "",
                "qualification_run_id": qualification_run_id if qualification_status else "",
                "qualification_updated_at": timestamp if qualification_status else "",
                "holding_company_signals": norm(triage.get("holding_company_signals")),
                "manual_review_required": manual_review_required,
                "manual_review_reason": manual_review_reason,
                "final_pipeline_status": qualification_status or "unclassified",
                "bootstrap_run_id": bootstrap_run_id,
                "created_at": timestamp,
                "updated_at": timestamp,
            }
        )
    return rows


def insert_rows(conn: sqlite3.Connection, rows: list[dict[str, object]]) -> None:
    conn.executemany(
        """
        INSERT INTO montgomery_fresh_leads (
            lead_id, source, business_name, address, city, state, zip, naics,
            fresh_date, date_basis, doc_type, reference_url,
            profile_path, profile_bucket, profile_exists,
            qualification_status, qualification_confidence, qualification_reason_codes,
            qualification_notes, qualification_run_id, qualification_updated_at,
            holding_company_signals, manual_review_required, manual_review_reason,
            final_pipeline_status, bootstrap_run_id, created_at, updated_at
        )
        VALUES (
            :lead_id, :source, :business_name, :address, :city, :state, :zip, :naics,
            :fresh_date, :date_basis, :doc_type, :reference_url,
            :profile_path, :profile_bucket, :profile_exists,
            :qualification_status, :qualification_confidence, :qualification_reason_codes,
            :qualification_notes, :qualification_run_id, :qualification_updated_at,
            :holding_company_signals, :manual_review_required, :manual_review_reason,
            :final_pipeline_status, :bootstrap_run_id, :created_at, :updated_at
        )
        """,
        rows,
    )


def summarize_counts(rows: list[dict[str, object]]) -> dict[str, int]:
    qualified = sum(1 for row in rows if row["qualification_status"] == "qualified")
    needs_review = sum(1 for row in rows if row["qualification_status"] == "needs-review")
    disqualified = sum(1 for row in rows if row["qualification_status"] == "disqualified")
    profile_count = sum(1 for row in rows if row["profile_exists"] == 1)
    return {
        "total_leads": len(rows),
        "qualified": qualified,
        "needs_review": needs_review,
        "disqualified": disqualified,
        "profile_count": profile_count,
        "website_queue": qualified + needs_review,
        "review_queue": needs_review,
        "qualification_queue": sum(1 for row in rows if not row["qualification_status"]),
        "audit_queue": 0,
    }


def write_summary(
    summary_path: Path,
    *,
    timestamp: str,
    db_path: Path,
    source_csv: Path,
    triage_csv: Path,
    counts: dict[str, int],
) -> None:
    summary_path.write_text(
        "\n".join(
            [
                "# Montgomery Fresh SQLite Bootstrap Summary",
                "",
                f"Generated: {timestamp}",
                "",
                "## Inputs",
                "",
                f"- DB: `{db_path}`",
                f"- Source CSV: `{source_csv}`",
                f"- Triage CSV: `{triage_csv}`",
                "",
                "## Loaded Counts",
                "",
                f"- Total leads: **{counts['total_leads']}**",
                f"- Qualified: **{counts['qualified']}**",
                f"- Needs review: **{counts['needs_review']}**",
                f"- Disqualified: **{counts['disqualified']}**",
                f"- Actual `profile.md` paths found: **{counts['profile_count']}**",
                "",
                "## Queue View Counts",
                "",
                f"- Website queue: **{counts['website_queue']}**",
                f"- Qualification queue: **{counts['qualification_queue']}**",
                f"- Review queue: **{counts['review_queue']}**",
                f"- Audit queue: **{counts['audit_queue']}**",
                "",
                "## Notes",
                "",
                "- This is a Montgomery-only truth layer.",
                "- It seeds qualification from the latest Montgomery triage CSV.",
                "- It does not touch `crm.sqlite` or the general leadops tables.",
                "- `website_status` is intentionally blank for all rows until the Montgomery website-finder runner writes into this DB.",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap isolated Montgomery fresh SQLite truth layer.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to Montgomery-only SQLite database.")
    parser.add_argument("--source-csv", default=str(DEFAULT_SOURCE_CSV), help="Raw Montgomery source CSV.")
    parser.add_argument("--triage-csv", default="", help="Qualification seed CSV. Defaults to latest triage-pass-*.csv.")
    parser.add_argument("--summary-out", default=str(DEFAULT_SUMMARY), help="Markdown summary output path.")
    args = parser.parse_args()

    db_path = Path(args.db)
    source_csv = Path(args.source_csv)
    triage_csv = Path(args.triage_csv) if args.triage_csv else find_latest_triage_csv(MONTGOMERY_ROOT)
    summary_path = Path(args.summary_out)

    if not source_csv.exists():
        raise FileNotFoundError(f"Missing source CSV: {source_csv}")
    if not triage_csv.exists():
        raise FileNotFoundError(f"Missing triage CSV: {triage_csv}")

    db_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.parent.mkdir(parents=True, exist_ok=True)

    raw_rows = read_csv_by_lead(source_csv)
    triage_rows = read_csv_by_lead(triage_csv)
    profile_map = scan_profile_paths(MONTGOMERY_ROOT)

    timestamp = now_iso()
    run_stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    bootstrap_run_id = f"montgomery-bootstrap-{run_stamp}"
    qualification_run_id = f"montgomery-triage-seed-{run_stamp}"

    rows = build_rows(
        raw_rows=raw_rows,
        triage_rows=triage_rows,
        profile_map=profile_map,
        bootstrap_run_id=bootstrap_run_id,
        qualification_run_id=qualification_run_id,
        timestamp=timestamp,
    )
    counts = summarize_counts(rows)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        init_db(conn)
        conn.execute(
            """
            INSERT INTO montgomery_bootstrap_runs (
                run_id, generated_at, source_csv, triage_csv,
                total_leads, qualified_count, needs_review_count, disqualified_count, profile_count
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                bootstrap_run_id,
                timestamp,
                str(source_csv),
                str(triage_csv),
                counts["total_leads"],
                counts["qualified"],
                counts["needs_review"],
                counts["disqualified"],
                counts["profile_count"],
            ),
        )
        conn.execute(
            "INSERT INTO montgomery_qualification_runs (run_id, generated_at, notes) VALUES (?, ?, ?)",
            (
                qualification_run_id,
                timestamp,
                f"Seeded from triage CSV {triage_csv.name}",
            ),
        )
        insert_rows(conn, rows)
        conn.commit()
    finally:
        conn.close()

    write_summary(
        summary_path,
        timestamp=timestamp,
        db_path=db_path,
        source_csv=source_csv,
        triage_csv=triage_csv,
        counts=counts,
    )

    print(f"Montgomery DB written to: {db_path}")
    print(f"Summary written to: {summary_path}")
    print(
        "Counts: "
        f"total={counts['total_leads']}, "
        f"qualified={counts['qualified']}, "
        f"needs_review={counts['needs_review']}, "
        f"disqualified={counts['disqualified']}, "
        f"profiles={counts['profile_count']}"
    )


if __name__ == "__main__":
    main()
