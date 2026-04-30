from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MONTGOMERY_ROOT = REPO_ROOT / "leads" / "montgomery-county-fresh"
DEFAULT_DB = MONTGOMERY_ROOT / "montgomery-fresh.sqlite"
DEFAULT_SEARCH_ROOT = Path.home() / "Desktop" / "mccullough-search"
BUSINESS_SUFFIXES = {
    "llc",
    "inc",
    "ltd",
    "corp",
    "co",
    "company",
    "group",
    "enterprise",
    "enterprises",
    "services",
    "solutions",
    "management",
    "holdings",
}
GENERIC_STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "into",
    "your",
    "our",
    "official",
    "website",
    "texas",
    "tx",
}
LANE_GENERIC_PARTS = {
    "apartment",
    "automotive",
    "consultant",
    "consulting",
    "construction",
    "data",
    "design",
    "designs",
    "gifts",
    "landscaping",
    "link",
    "lobby",
    "market",
    "mart",
    "navigator",
    "nails",
    "solutions",
    "store",
    "supplements",
    "tax",
    "team",
    "works",
}


def norm(value: object | None) -> str:
    if value is None:
        return ""
    return str(value).strip()


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


@dataclass
class QueueLead:
    lead_id: str
    business_name: str
    city: str
    state: str
    zip: str
    qualification_status: str
    queue_lane: str = ""


@dataclass
class ProcessedLead:
    lead: QueueLead
    result: dict
    website_status: str
    website_confidence: str
    domain: str
    url: str
    method: str
    evidence: str
    stage: str


def classify_queue_lane(lead: QueueLead) -> str:
    name_parts = significant_name_parts(lead.business_name)
    if lead.qualification_status != "qualified":
        return "slow"
    if not lead.city:
        return "slow"
    if len(name_parts) <= 1:
        return "slow"
    distinctive_parts = [part for part in name_parts if part not in LANE_GENERIC_PARTS]
    if len(distinctive_parts) == 0:
        return "slow"
    return "fast"


def load_queue(conn: sqlite3.Connection, *, limit: int, lead_ids: list[str], queue_lane: str) -> list[QueueLead]:
    conn.row_factory = sqlite3.Row
    if lead_ids:
        placeholders = ",".join("?" for _ in lead_ids)
        rows = conn.execute(
            f"""
            SELECT lead_id, business_name, city, state, zip, qualification_status
            FROM montgomery_v_website_queue
            WHERE lead_id IN ({placeholders})
            ORDER BY lead_id
            """,
            lead_ids,
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT lead_id, business_name, city, state, zip, qualification_status
            FROM montgomery_v_website_queue
            ORDER BY lead_id
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    leads = [
        QueueLead(
            lead_id=row["lead_id"],
            business_name=row["business_name"],
            city=row["city"] or "",
            state=row["state"] or "TX",
            zip=row["zip"] or "",
            qualification_status=row["qualification_status"] or "",
        )
        for row in rows
    ]
    for lead in leads:
        lead.queue_lane = classify_queue_lane(lead)

    if lead_ids or queue_lane == "all":
        return leads[:limit]
    if queue_lane == "fast":
        return [lead for lead in leads if lead.queue_lane == "fast"][:limit]
    if queue_lane == "slow":
        return [lead for lead in leads if lead.queue_lane == "slow"][:limit]
    fast = [lead for lead in leads if lead.queue_lane == "fast"]
    slow = [lead for lead in leads if lead.queue_lane == "slow"]
    return (fast + slow)[:limit]


def parse_json_output(stdout: str) -> dict:
    marker = "=== JSON OUTPUT ==="
    if marker not in stdout:
        raise ValueError("search-lead.js output did not include JSON marker")
    payload = stdout.split(marker, 1)[1].strip()
    return json.loads(payload)


def significant_name_parts(name: str) -> list[str]:
    cleaned = "".join(ch if ch.isalnum() else " " for ch in norm(name).lower())
    tokens = [token for token in cleaned.split() if token]
    return [
        token
        for token in tokens
        if len(token) > 2 and token not in BUSINESS_SUFFIXES and token not in GENERIC_STOPWORDS
    ]


def deeper_search_timeout_seconds(lead: QueueLead) -> int:
    return 75 if lead.qualification_status == "needs-review" else 150


def should_skip_deeper_search(*, lead: QueueLead, probe_result: dict) -> bool:
    if lead.qualification_status != "needs-review":
        return False
    if probe_result.get("bestMatch"):
        return False
    return len(significant_name_parts(lead.business_name)) <= 1


def is_risky_probe_match(*, lead: QueueLead, result: dict) -> bool:
    best = result.get("bestMatch") or {}
    verification = best.get("verification") or {}
    if norm(best.get("source")) != "domain_probe":
        return False
    reason = norm(verification.get("reason")).lower()
    if "compact" not in reason:
        return False
    parts = significant_name_parts(lead.business_name)
    return len(parts) <= 1


def map_result_to_status(*, lead: QueueLead, result: dict) -> tuple[str, str]:
    best = result.get("bestMatch") or {}
    verification = best.get("verification") or {}
    verified = bool(verification.get("verified"))
    if verified and result.get("status") == "verified_match":
        if is_risky_probe_match(lead=lead, result=result):
            return "ambiguous", "low"
        score = int(best.get("score") or 0)
        return "matched", "high" if score >= 40 else "medium"
    if best:
        return "ambiguous", "low"
    return "no_match", "low"


def build_evidence(result: dict) -> str:
    best = result.get("bestMatch") or {}
    verification = best.get("verification") or {}
    compact = {
        "status": result.get("status"),
        "queriesAttempted": result.get("queriesAttempted"),
        "fetchFallbackUsed": bool(result.get("fetchFallbackUsed")),
        "fetchFallbackSources": result.get("fetchFallbackSources") or [],
        "searxngDegraded": bool((result.get("searxngHealth") or {}).get("isDegraded")),
        "unhealthyEngineCount": (result.get("searxngHealth") or {}).get("unhealthyCount", 0),
        "bestMatch": {
            "domain": best.get("domain"),
            "url": best.get("url"),
            "score": best.get("score"),
            "source": best.get("source"),
            "verified": bool(verification.get("verified")),
            "reason": verification.get("reason", ""),
            "evidence": verification.get("evidence") or [],
        },
    }
    return json.dumps(compact, ensure_ascii=True)


def normalize_best_match(result: dict) -> tuple[str, str, str]:
    best = result.get("bestMatch") or {}
    domain = norm(best.get("domain"))
    if domain.startswith("www."):
        domain = domain[4:]
    return domain, norm(best.get("url")), norm(best.get("source"))


def run_search(
    *,
    search_root: Path,
    lead: QueueLead,
    engine_profile: str,
    premium_provider: str,
    min_score: int,
    domain_probe_only: bool,
    timeout_seconds: int,
) -> dict:
    command = [
        "node",
        str(search_root / "search-lead.js"),
        "--lead",
        lead.business_name,
        "--city",
        lead.city,
        "--state",
        lead.state or "TX",
        "--engine-profile",
        engine_profile,
        "--min-score",
        str(min_score),
        "--json",
    ]
    if lead.zip:
        command.extend(["--zip", lead.zip])
    if premium_provider:
        command.extend(["--premium-provider", premium_provider])
    if domain_probe_only:
        command.append("--domain-probe-only")

    completed = subprocess.run(
        command,
        cwd=search_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=timeout_seconds,
        check=False,
    )
    stdout = completed.stdout or ""
    stderr = completed.stderr or ""
    if completed.returncode != 0:
        raise RuntimeError(f"search command failed ({completed.returncode}): {(stderr or stdout)[:500]}")
    return {
        "raw_stdout": stdout,
        "raw_stderr": stderr,
        "parsed": parse_json_output(stdout),
    }


def process_search_result(*, lead: QueueLead, result: dict, stage: str) -> ProcessedLead:
    website_status, website_confidence = map_result_to_status(lead=lead, result=result)
    domain, url, method = normalize_best_match(result)
    return ProcessedLead(
        lead=lead,
        result=result,
        website_status=website_status,
        website_confidence=website_confidence,
        domain=domain,
        url=url,
        method=method,
        evidence=build_evidence(result),
        stage=stage,
    )


def csv_row_from_processed(processed: ProcessedLead) -> dict[str, str]:
    result = processed.result
    return {
        "lead_id": processed.lead.lead_id,
        "business_name": processed.lead.business_name,
        "city": processed.lead.city,
        "state": processed.lead.state,
        "qualification_status": processed.lead.qualification_status,
        "website_status": processed.website_status,
        "website_confidence": processed.website_confidence,
        "website_domain": processed.domain,
        "website_url": processed.url,
        "website_match_method": processed.method,
        "searxng_degraded": str(bool((result.get("searxngHealth") or {}).get("isDegraded"))),
        "unhealthy_engine_count": str((result.get("searxngHealth") or {}).get("unhealthyCount", 0)),
        "fetch_fallback_used": str(bool(result.get("fetchFallbackUsed"))),
    }


def append_review_reason(existing: str, reason: str) -> str:
    existing_parts = [part.strip() for part in existing.split(";") if part.strip()]
    if reason and reason not in existing_parts:
        existing_parts.append(reason)
    return "; ".join(existing_parts)


def write_results_csv(path: Path, rows: list[dict[str, str]]) -> None:
    fieldnames = [
        "lead_id",
        "business_name",
        "city",
        "state",
        "qualification_status",
        "website_status",
        "website_confidence",
        "website_domain",
        "website_url",
        "website_match_method",
        "searxng_degraded",
        "unhealthy_engine_count",
        "fetch_fallback_used",
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
    engine_profile: str,
    premium_provider: str,
    domain_probe_only: bool,
    probe_first: bool,
    queue_lane: str,
    dry_run: bool,
    processed: int,
    matched: int,
    ambiguous: int,
    no_match: int,
    errored: int,
    probe_matched: int,
    probe_leftovers: int,
    deeper_processed: int,
    deeper_skipped: int,
    ) -> None:
    provider_text = premium_provider or "none"
    path.write_text(
        "\n".join(
            [
                "# Montgomery Website Finder Run Summary",
                "",
                f"Generated: {timestamp}",
                f"Run ID: `{run_id}`",
                "",
                "## Inputs",
                "",
                f"- DB: `{db_path}`",
                f"- Engine profile: `{engine_profile}`",
                f"- Premium provider: `{provider_text}`",
                f"- Domain probe only: `{str(domain_probe_only).lower()}`",
                f"- Probe first: `{str(probe_first).lower()}`",
                f"- Queue lane: `{queue_lane}`",
                f"- Dry run: `{str(dry_run).lower()}`",
                "",
                "## Results",
                "",
                f"- Processed: **{processed}**",
                f"- Matched: **{matched}**",
                f"- Ambiguous: **{ambiguous}**",
                f"- No match: **{no_match}**",
                f"- Errors: **{errored}**",
                "",
                "## Stage Flow",
                "",
                f"- Probe-stage direct matches: **{probe_matched}**",
                f"- Probe-stage leftovers routed to deeper search: **{probe_leftovers}**",
                f"- Deeper-search executions: **{deeper_processed}**",
                f"- Deeper-search skips (low-signal Montgomery rule): **{deeper_skipped}**",
                "",
                "## Notes",
                "",
                "- Only `verified_match` results are promoted to `website_status=matched`.",
                "- Unverified candidates are stored as `website_status=ambiguous` so they do not silently advance into audit.",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def checkpoint_run(
    *,
    conn: sqlite3.Connection,
    dry_run: bool,
    csv_path: Path,
    summary_path: Path,
    csv_rows: list[dict[str, str]],
    timestamp: str,
    run_id: str,
    db_path: Path,
    engine_profile: str,
    premium_provider: str,
    domain_probe_only: bool,
    probe_first: bool,
    queue_lane: str,
    matched: int,
    ambiguous: int,
    no_match: int,
    errored: int,
    probe_matched: int,
    probe_leftovers: int,
    deeper_processed: int,
    deeper_skipped: int,
) -> None:
    if not dry_run:
        conn.commit()
    write_results_csv(csv_path, csv_rows)
    write_summary(
        summary_path,
        timestamp=timestamp,
        run_id=run_id,
        db_path=db_path,
        engine_profile=engine_profile,
        premium_provider=premium_provider,
        domain_probe_only=domain_probe_only,
        probe_first=probe_first,
        queue_lane=queue_lane,
        dry_run=dry_run,
        processed=len(csv_rows),
        matched=matched,
        ambiguous=ambiguous,
        no_match=no_match,
        errored=errored,
        probe_matched=probe_matched,
        probe_leftovers=probe_leftovers,
        deeper_processed=deeper_processed,
        deeper_skipped=deeper_skipped,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Montgomery-only website finder and write results into the isolated DB.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to Montgomery-only SQLite DB.")
    parser.add_argument("--search-root", default=str(DEFAULT_SEARCH_ROOT), help="Path to mccullough-search repo.")
    parser.add_argument("--limit", type=int, default=25, help="Number of queued Montgomery leads to process.")
    parser.add_argument("--lead-id", action="append", default=[], help="Specific Montgomery lead ID(s) to process.")
    parser.add_argument("--engine-profile", default="text-primary", help="search-lead.js engine profile.")
    parser.add_argument("--premium-provider", default="", help="Optional premium provider fallback, e.g. exa.")
    parser.add_argument("--min-score", type=int, default=15, help="Minimum score passed to search-lead.js.")
    parser.add_argument("--domain-probe-only", action="store_true", help="Run only the cheap domain-guess/probe front end; skip deeper search.")
    parser.add_argument("--skip-probe-first", action="store_true", help="Disable the normal probe-first orchestration and go straight to the full website search.")
    parser.add_argument(
        "--queue-lane",
        choices=["priority", "fast", "slow", "all"],
        default="priority",
        help="Montgomery-only website queue lane selection. 'priority' processes fast-lane leads first, then slow-lane leads.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Write artifacts only and do not update the Montgomery DB.")
    args = parser.parse_args()

    db_path = Path(args.db)
    search_root = Path(args.search_root)
    if not db_path.exists():
        raise FileNotFoundError(f"Missing Montgomery DB: {db_path}")
    if not (search_root / "search-lead.js").exists():
        raise FileNotFoundError(f"Missing search-lead.js under {search_root}")

    timestamp = now_iso()
    run_stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    run_id = f"montgomery-website-finder-{run_stamp}"
    run_dir = MONTGOMERY_ROOT / "runs" / "website-finder" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    jsonl_path = run_dir / "raw-results.jsonl"
    probe_jsonl_path = run_dir / "probe-results.jsonl"
    search_jsonl_path = run_dir / "deeper-search-results.jsonl"
    csv_path = run_dir / "results.csv"
    summary_path = run_dir / "summary.md"
    probe_first = not args.domain_probe_only and not args.skip_probe_first

    conn = sqlite3.connect(db_path, timeout=60)
    conn.execute("PRAGMA busy_timeout=60000")
    try:
        leads = load_queue(
            conn,
            limit=args.limit,
            lead_ids=[lead.upper() for lead in args.lead_id],
            queue_lane=args.queue_lane,
        )
        if not args.dry_run:
            conn.execute(
                "INSERT INTO montgomery_website_finder_runs (run_id, generated_at, notes) VALUES (?, ?, ?)",
                (
                    run_id,
                    timestamp,
                    (
                        f"engine_profile={args.engine_profile}; "
                        f"premium_provider={args.premium_provider or 'none'}; "
                        f"requested={len(leads)}; "
                        f"queue_lane={args.queue_lane}; "
                        f"domain_probe_only={str(args.domain_probe_only).lower()}; "
                        f"probe_first={str(probe_first).lower()}"
                    ),
                ),
            )
            conn.commit()

        csv_rows: list[dict[str, str]] = []
        matched = ambiguous = no_match = errored = 0
        probe_matched = probe_leftovers = deeper_processed = deeper_skipped = 0

        with (
            jsonl_path.open("w", encoding="utf-8") as jsonl,
            probe_jsonl_path.open("w", encoding="utf-8") as probe_jsonl,
            search_jsonl_path.open("w", encoding="utf-8") as search_jsonl,
        ):
            for lead in leads:
                try:
                    processed: ProcessedLead
                    if probe_first:
                        probe_payload = run_search(
                            search_root=search_root,
                            lead=lead,
                            engine_profile=args.engine_profile,
                            premium_provider=args.premium_provider,
                            min_score=args.min_score,
                            domain_probe_only=True,
                            timeout_seconds=45,
                        )
                        probe_result = probe_payload["parsed"]
                        probe_processed = process_search_result(
                            lead=lead,
                            result=probe_result,
                            stage="domain_probe",
                        )
                        probe_jsonl.write(
                            json.dumps(
                                {
                                    "lead_id": lead.lead_id,
                                    "business_name": lead.business_name,
                                    "stage": "domain_probe",
                                    "result": probe_result,
                                },
                                ensure_ascii=True,
                            )
                            + "\n"
                        )
                        probe_jsonl.flush()
                        if probe_processed.website_status == "matched":
                            probe_matched += 1
                            processed = probe_processed
                        else:
                            probe_leftovers += 1
                            if should_skip_deeper_search(lead=lead, probe_result=probe_result):
                                deeper_skipped += 1
                                processed = probe_processed
                            else:
                                deeper_processed += 1
                                search_payload = run_search(
                                    search_root=search_root,
                                    lead=lead,
                                    engine_profile=args.engine_profile,
                                    premium_provider=args.premium_provider,
                                    min_score=max(args.min_score, 20 if lead.qualification_status == "needs-review" else args.min_score),
                                    domain_probe_only=False,
                                    timeout_seconds=deeper_search_timeout_seconds(lead),
                                )
                                result = search_payload["parsed"]
                                processed = process_search_result(
                                    lead=lead,
                                    result=result,
                                    stage="deeper_search",
                                )
                                search_jsonl.write(
                                    json.dumps(
                                        {
                                            "lead_id": lead.lead_id,
                                            "business_name": lead.business_name,
                                            "stage": "deeper_search",
                                            "probe_status": probe_processed.website_status,
                                            "result": result,
                                        },
                                        ensure_ascii=True,
                                    )
                                    + "\n"
                                )
                                search_jsonl.flush()
                    else:
                        payload = run_search(
                            search_root=search_root,
                            lead=lead,
                            engine_profile=args.engine_profile,
                            premium_provider=args.premium_provider,
                            min_score=args.min_score,
                            domain_probe_only=args.domain_probe_only,
                            timeout_seconds=45 if args.domain_probe_only else deeper_search_timeout_seconds(lead),
                        )
                        result = payload["parsed"]
                        stage_name = "domain_probe" if args.domain_probe_only else "single_pass"
                        processed = process_search_result(
                            lead=lead,
                            result=result,
                            stage=stage_name,
                        )
                        target_jsonl = probe_jsonl if args.domain_probe_only else search_jsonl
                        target_jsonl.write(
                            json.dumps(
                                {
                                    "lead_id": lead.lead_id,
                                    "business_name": lead.business_name,
                                    "stage": stage_name,
                                    "result": result,
                                },
                                ensure_ascii=True,
                            )
                            + "\n"
                        )
                        target_jsonl.flush()
                        if args.domain_probe_only:
                            probe_matched += 1 if processed.website_status == "matched" else 0
                            probe_leftovers += 1 if processed.website_status != "matched" else 0
                        else:
                            deeper_processed += 1

                    if processed.website_status == "matched":
                        matched += 1
                    elif processed.website_status == "ambiguous":
                        ambiguous += 1
                    else:
                        no_match += 1

                    review_reason_sql = """
                        CASE
                            WHEN ? = 'ambiguous' THEN
                                CASE
                                    WHEN COALESCE(manual_review_reason, '') = '' THEN 'website_status=ambiguous'
                                    WHEN instr(manual_review_reason, 'website_status=ambiguous') > 0 THEN manual_review_reason
                                    ELSE manual_review_reason || '; website_status=ambiguous'
                                END
                            ELSE manual_review_reason
                        END
                    """
                    if not args.dry_run:
                        conn.execute(
                            f"""
                            UPDATE montgomery_fresh_leads
                            SET website_status = ?,
                                website_domain = ?,
                                website_url = ?,
                                website_confidence = ?,
                                website_match_method = ?,
                                website_evidence = ?,
                                website_run_id = ?,
                                website_updated_at = ?,
                                manual_review_required = CASE
                                    WHEN ? = 'ambiguous' THEN 1
                                    ELSE manual_review_required
                                END,
                                manual_review_reason = {review_reason_sql},
                                updated_at = ?
                            WHERE lead_id = ?
                            """,
                            (
                                processed.website_status,
                                processed.domain,
                                processed.url,
                                processed.website_confidence,
                                processed.method,
                                processed.evidence,
                                run_id,
                                timestamp,
                                processed.website_status,
                                processed.website_status,
                                timestamp,
                                lead.lead_id,
                            ),
                        )
                    jsonl.write(
                        json.dumps(
                            {
                                "lead_id": lead.lead_id,
                                "business_name": lead.business_name,
                                "stage": processed.stage,
                                "result": processed.result,
                            },
                            ensure_ascii=True,
                        )
                        + "\n"
                    )
                    jsonl.flush()
                    csv_rows.append(csv_row_from_processed(processed))
                    checkpoint_run(
                        conn=conn,
                        dry_run=args.dry_run,
                        csv_path=csv_path,
                        summary_path=summary_path,
                        csv_rows=csv_rows,
                        timestamp=timestamp,
                        run_id=run_id,
                        db_path=db_path,
                        engine_profile=args.engine_profile,
                        premium_provider=args.premium_provider,
                        domain_probe_only=args.domain_probe_only,
                        probe_first=probe_first,
                        queue_lane=args.queue_lane,
                        matched=matched,
                        ambiguous=ambiguous,
                        no_match=no_match,
                        errored=errored,
                        probe_matched=probe_matched,
                        probe_leftovers=probe_leftovers,
                        deeper_processed=deeper_processed,
                        deeper_skipped=deeper_skipped,
                    )
                except Exception as exc:
                    errored += 1
                    error_payload = {
                        "error": str(exc),
                        "error_type": type(exc).__name__,
                        "lead_id": lead.lead_id,
                        "business_name": lead.business_name,
                    }
                    if not args.dry_run:
                        conn.execute(
                            """
                            UPDATE montgomery_fresh_leads
                            SET website_status = 'error',
                                website_confidence = 'low',
                                website_match_method = 'runner_error',
                                website_evidence = ?,
                                website_run_id = ?,
                                website_updated_at = ?,
                                manual_review_required = 1,
                                manual_review_reason = CASE
                                    WHEN COALESCE(manual_review_reason, '') = '' THEN 'website_status=error'
                                    WHEN instr(manual_review_reason, 'website_status=error') > 0 THEN manual_review_reason
                                    ELSE manual_review_reason || '; website_status=error'
                                END,
                                updated_at = ?
                            WHERE lead_id = ?
                            """,
                            (
                                json.dumps(error_payload, ensure_ascii=True),
                                run_id,
                                timestamp,
                                timestamp,
                                lead.lead_id,
                            ),
                        )
                    csv_rows.append(
                        {
                            "lead_id": lead.lead_id,
                            "business_name": lead.business_name,
                            "city": lead.city,
                            "state": lead.state,
                            "qualification_status": lead.qualification_status,
                            "website_status": "error",
                            "website_confidence": "low",
                            "website_domain": "",
                            "website_url": "",
                            "website_match_method": "runner_error",
                            "searxng_degraded": "",
                            "unhealthy_engine_count": "",
                            "fetch_fallback_used": "",
                        }
                    )
                    checkpoint_run(
                        conn=conn,
                        dry_run=args.dry_run,
                        csv_path=csv_path,
                        summary_path=summary_path,
                        csv_rows=csv_rows,
                        timestamp=timestamp,
                        run_id=run_id,
                        db_path=db_path,
                        engine_profile=args.engine_profile,
                        premium_provider=args.premium_provider,
                        domain_probe_only=args.domain_probe_only,
                        probe_first=probe_first,
                        queue_lane=args.queue_lane,
                        matched=matched,
                        ambiguous=ambiguous,
                        no_match=no_match,
                        errored=errored,
                        probe_matched=probe_matched,
                        probe_leftovers=probe_leftovers,
                        deeper_processed=deeper_processed,
                        deeper_skipped=deeper_skipped,
                    )

        print(f"Run directory: {run_dir}")
        print(
            "Counts: "
            f"processed={len(csv_rows)}, matched={matched}, ambiguous={ambiguous}, "
            f"no_match={no_match}, errored={errored}"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
