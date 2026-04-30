from __future__ import annotations

import argparse
import json
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"
DEFAULT_REPORT_DIR = REPO_ROOT / "reports"
TRUST_ORDER = {
    "unverified": 0,
    "inferred": 1,
    "observed": 2,
    "verified": 3,
}
SOCIAL_FIELDS = {
    "facebook_url",
    "instagram_url",
    "twitter_url",
    "linkedin_url",
    "youtube_url",
    "tiktok_url",
    "yelp_url",
    "google_business_url",
}
SOCIAL_HOSTS = {
    "facebook_url": ("facebook.com", "fb.com"),
    "instagram_url": ("instagram.com",),
    "twitter_url": ("twitter.com", "x.com"),
    "linkedin_url": ("linkedin.com",),
    "youtube_url": ("youtube.com", "youtu.be"),
    "tiktok_url": ("tiktok.com",),
    "yelp_url": ("yelp.com",),
    "google_business_url": ("google.com", "g.page"),
}


@dataclass
class FieldAction:
    field: str
    trust_level: str
    source: str
    value: Any
    target: str
    action: str
    reason: str


@dataclass
class LeadImportResult:
    lead_id: int
    source_file: str
    mode: str
    accepted_fields: list[FieldAction] = field(default_factory=list)
    skipped_fields: list[FieldAction] = field(default_factory=list)
    review_fields: list[FieldAction] = field(default_factory=list)
    ignored_reason: str = ""


REVIEW_QUEUE_FIELDS = {
    "business_name",
    "business_tagline",
    "business_description",
    "cms",
    "ecommerce_platform",
    "primary_industry",
    "service_area_type",
    "team_page_url",
    "estimated_years_in_business",
    "founded_year",
    "employee_count",
    "payment_methods",
    "services",
    "service_regions",
    "secondary_industries",
    "facebook_url",
    "instagram_url",
    "twitter_url",
    "linkedin_url",
    "youtube_url",
    "tiktok_url",
    "yelp_url",
    "google_business_url",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Import audit enrichment payloads into leadops SQLite conservatively. "
            "Dry-run by default; use --apply to write."
        )
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Audit JSON file or directory containing audit-*.json files.",
    )
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to crm.sqlite")
    parser.add_argument(
        "--min-trust",
        default="observed",
        choices=tuple(TRUST_ORDER.keys()),
        help="Minimum field trust level required for direct import candidates.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes to SQLite. Omit for dry-run.",
    )
    parser.add_argument(
        "--report",
        default=None,
        help="Optional JSON report path. Defaults to reports/audit-enrichment-import-<timestamp>.json",
    )
    return parser.parse_args()


def iter_audit_files(input_path: Path) -> list[Path]:
    if input_path.is_file():
        return [input_path]
    return sorted(path for path in input_path.rglob("audit-*.json") if path.is_file())


def normalize_domain(url_or_domain: str | None) -> str | None:
    if not url_or_domain:
        return None
    value = url_or_domain.strip()
    if not value:
        return None
    if "://" in value:
        parsed = urlparse(value)
        return parsed.netloc.lower() or None
    return value.lower()


def is_blank(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip() or value.strip().lower() == "unknown"
    return False


def load_audit_payload(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise TypeError(f"Top-level JSON is {type(payload).__name__}, expected object")
    return payload


def first(items: Any) -> Any:
    if not isinstance(items, list):
        return None
    return next((item for item in items if not is_blank(item)), None)


def addr(value: dict[str, Any]) -> str | None:
    if not isinstance(value, dict):
        return None
    parts = [
        value.get("street"),
        value.get("city"),
        value.get("state"),
        value.get("zip"),
        value.get("country"),
    ]
    text = ", ".join(str(part).strip() for part in parts if not is_blank(part))
    return text or None


def social(value: Any) -> str | None:
    if isinstance(value, str) and not is_blank(value):
        return value.strip()
    if isinstance(value, dict):
        text = value.get("url")
        if isinstance(text, str) and not is_blank(text):
            return text.strip()
    return None


def host(value: str | None) -> str | None:
    if not value or is_blank(value):
        return None
    parsed = urlparse(value)
    return (parsed.netloc or "").lower() or None


def social_ok(field: str, value: Any) -> bool:
    if field not in SOCIAL_HOSTS:
        return False
    text = social(value)
    site = host(text)
    if not site:
        return False
    return any(part in site for part in SOCIAL_HOSTS[field])


def legacy(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    contacts = payload.get("contacts") or {}
    info = payload.get("businessInfo") or {}
    intel = payload.get("leadIntelligence") or {}
    team = intel.get("teamInfo") or {}
    ecommerce = intel.get("ecommerce") or {}
    industry = intel.get("industryClassification") or {}
    address = payload.get("address") or {}
    socials = contacts.get("socials") or {}
    profiles = intel.get("socialProfiles") or {}

    def add(field: str, value: Any, trust: str, source: str) -> None:
        if isinstance(value, list) and not value:
            return
        if isinstance(value, bool) and not value:
            return
        if is_blank(value):
            return
        out[field] = {
            "value": value,
            "trustLevel": trust,
            "source": source,
        }

    add("lead_id", str(payload.get("leadId")), "verified", "legacy-audit")
    add("domain", payload.get("domain"), "verified", "legacy-audit")
    add("website_url", payload.get("testUrl"), "verified", "legacy-audit")
    add("email_primary", first(contacts.get("emails")), "observed", "legacy-contacts")
    add("phone_primary", first(contacts.get("phones")), "observed", "legacy-contacts")
    add("business_name", info.get("name"), "observed", "legacy-business")
    add("address_raw", address.get("raw") or addr(address), "observed", "legacy-address")
    add("city", address.get("city"), "observed", "legacy-address")
    add("state", address.get("state"), "observed", "legacy-address")
    add("zip", address.get("zip"), "observed", "legacy-address")
    add("primary_industry", industry.get("primary"), "inferred", "legacy-lead-intelligence")
    add("payment_methods", ecommerce.get("paymentMethods"), "inferred", "legacy-lead-intelligence")
    add("team_page_url", team.get("teamPageUrl"), "inferred", "legacy-lead-intelligence")

    for name in ("facebook", "instagram", "twitter", "linkedin", "youtube", "tiktok", "yelp", "google_business"):
        field = f"{name}_url"
        value = social(socials.get(name))
        if social_ok(field, value):
            add(field, value, "observed", "legacy-contacts")
    for name in ("facebook", "instagram", "twitter", "linkedin", "youtube", "tiktok", "yelp", "gmb"):
        field = "google_business_url" if name == "gmb" else f"{name}_url"
        if field in out:
            continue
        value = social(profiles.get(name))
        if social_ok(field, value):
            add(field, value, "inferred", "legacy-lead-intelligence")

    return out


def should_accept(meta: dict[str, Any], min_trust: str) -> bool:
    value = meta.get("value")
    if isinstance(value, list):
        if not value:
            return False
    elif isinstance(value, bool):
        if not value:
            return False
    elif is_blank(value):
        return False
    return TRUST_ORDER.get(meta.get("trustLevel", "unverified"), 0) >= TRUST_ORDER[min_trust]


def get_lead_row(conn: sqlite3.Connection, lead_id: int) -> sqlite3.Row | None:
    conn.row_factory = sqlite3.Row
    return conn.execute(
        "SELECT * FROM leadops_leads WHERE lead_id = ?",
        (lead_id,),
    ).fetchone()


def get_profile_row(conn: sqlite3.Connection, lead_id: int) -> sqlite3.Row | None:
    conn.row_factory = sqlite3.Row
    return conn.execute(
        "SELECT * FROM leadops_profiles WHERE lead_id = ?",
        (lead_id,),
    ).fetchone()


def ensure_profile_stub(conn: sqlite3.Connection, lead_id: int) -> None:
    existing = conn.execute(
        "SELECT 1 FROM leadops_profiles WHERE lead_id = ?",
        (lead_id,),
    ).fetchone()
    if existing:
        return
    conn.execute(
        """
        INSERT INTO leadops_profiles (
            lead_id,
            raw_markdown,
            kv_json,
            sections_json
        ) VALUES (?, '', '{}', '{}')
        """,
        (lead_id,),
    )


def plan_direct_updates(
    lead_row: sqlite3.Row,
    profile_row: sqlite3.Row | None,
    field_confidence: dict[str, dict[str, Any]],
    min_trust: str,
) -> tuple[dict[str, Any], dict[str, Any], list[FieldAction], list[FieldAction]]:
    lead_updates: dict[str, Any] = {}
    profile_updates: dict[str, Any] = {}
    accepted: list[FieldAction] = []
    skipped: list[FieldAction] = []
    review: list[FieldAction] = []

    direct_lead_map = {
        "website_url": ("website", lambda value: value),
        "email_primary": ("email", lambda value: value),
        "phone_primary": ("phone", lambda value: value),
        "contact_form": ("contact_form", lambda value: value),
    }
    derived_lead_map = {
        "website_url": ("website_domain", normalize_domain),
        "email_primary": ("email_domain", lambda value: value.split("@", 1)[1].lower() if isinstance(value, str) and "@" in value else None),
    }
    direct_profile_map = {
        "address_raw": "address",
    }

    for field, meta in field_confidence.items():
        action = FieldAction(
            field=field,
            trust_level=meta.get("trustLevel", "unverified"),
            source=meta.get("source", "unknown"),
            value=meta.get("value"),
            target="none",
            action="skip",
            reason="below threshold or empty",
        )
        if not should_accept(meta, min_trust):
            skipped.append(action)
            continue

        if field in direct_lead_map:
            column, transform = direct_lead_map[field]
            if is_blank(lead_row[column]):
                lead_updates[column] = transform(meta["value"])
                action.target = f"leadops_leads.{column}"
                action.action = "fill"
                action.reason = "target blank"
                accepted.append(action)
            else:
                action.target = f"leadops_leads.{column}"
                action.reason = "target already populated"
                skipped.append(action)

            derived = derived_lead_map.get(field)
            if derived:
                derived_column, derived_transform = derived
                derived_value = derived_transform(meta["value"])
                if derived_value and is_blank(lead_row[derived_column]):
                    lead_updates[derived_column] = derived_value
            continue

        if field in direct_profile_map:
            column = direct_profile_map[field]
            current_value = profile_row[column] if profile_row is not None else None
            if is_blank(current_value):
                profile_updates[column] = meta["value"]
                action.target = f"leadops_profiles.{column}"
                action.action = "fill"
                action.reason = "target blank"
                accepted.append(action)
            else:
                action.target = f"leadops_profiles.{column}"
                action.reason = "target already populated"
                skipped.append(action)
            continue

        action.reason = "stored as fact only"
        skipped.append(action)
        if field in REVIEW_QUEUE_FIELDS:
            review.append(
                FieldAction(
                    field=field,
                    trust_level=meta.get("trustLevel", "unverified"),
                    source=meta.get("source", "unknown"),
                    value=meta.get("value"),
                    target="review_queue",
                    action="review",
                    reason="review suggested before merge",
                )
            )

    return lead_updates, profile_updates, accepted, skipped, review


def insert_contact(
    conn: sqlite3.Connection,
    lead_id: int,
    contact_type: str,
    value: str,
    source: str,
    is_primary: int = 0,
) -> bool:
    text = value.strip()
    normalized = text.lower()
    if contact_type == "phone":
        normalized = "".join(ch for ch in text if ch.isdigit())
    if contact_type in {"social", "website"}:
        normalized = text.rstrip("/").lower()
    exists = conn.execute(
        """
        SELECT 1
        FROM leadops_contacts
        WHERE lead_id = ?
          AND contact_type = ?
          AND normalized_value = ?
        """,
        (lead_id, contact_type, normalized),
    ).fetchone()
    if exists:
        return False
    conn.execute(
        """
        INSERT INTO leadops_contacts (
            lead_id,
            contact_type,
            value,
            normalized_value,
            label,
            is_primary,
            source
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (lead_id, contact_type, text, normalized, None, is_primary, source),
    )
    return True


def insert_business_fact(
    conn: sqlite3.Connection,
    lead_id: int,
    fact_type: str,
    fact_value: Any,
    confidence: str,
    source_file: str,
    raw_payload: dict[str, Any],
) -> bool:
    if isinstance(fact_value, (dict, list)):
        stored_value = json.dumps(fact_value, sort_keys=True)
    else:
        stored_value = str(fact_value)

    exists = conn.execute(
        """
        SELECT 1
        FROM leadops_business_facts
        WHERE lead_id = ?
          AND fact_type = ?
          AND fact_value = ?
          AND source_kind = 'audit_enrichment'
        """,
        (lead_id, fact_type, stored_value),
    ).fetchone()
    if exists:
        return False

    conn.execute(
        """
        INSERT INTO leadops_business_facts (
            lead_id,
            fact_type,
            fact_value,
            source_kind,
            source_file,
            confidence,
            verified_at,
            raw_payload
        ) VALUES (?, ?, ?, 'audit_enrichment', ?, ?, ?, ?)
        """,
        (
            lead_id,
            fact_type,
            stored_value,
            source_file,
            confidence,
            datetime.utcnow().isoformat(timespec="seconds") + "Z",
            json.dumps(raw_payload, sort_keys=True),
        ),
    )
    return True


def clear_audit_business_facts(
    conn: sqlite3.Connection,
    lead_id: int,
    fact_types: list[str],
) -> None:
    unique_fact_types = sorted({fact_type for fact_type in fact_types if fact_type})
    if not unique_fact_types:
        return
    placeholders = ", ".join("?" for _ in unique_fact_types)
    conn.execute(
        f"""
        DELETE FROM leadops_business_facts
        WHERE lead_id = ?
          AND source_kind = 'audit_enrichment'
          AND fact_type IN ({placeholders})
        """,
        [lead_id, *unique_fact_types],
    )


def clear_audit_contacts(
    conn: sqlite3.Connection,
    lead_id: int,
    contact_type: str,
) -> None:
    conn.execute(
        """
        DELETE FROM leadops_contacts
        WHERE lead_id = ?
          AND contact_type = ?
          AND (
                source LIKE 'audit:%'
                OR lower(coalesce(value, '')) = 'to be verified'
                OR lower(coalesce(normalized_value, '')) = 'to be verified'
              )
        """,
        (lead_id, contact_type),
    )


def apply_updates(
    conn: sqlite3.Connection,
    lead_id: int,
    lead_updates: dict[str, Any],
    profile_updates: dict[str, Any],
) -> None:
    if lead_updates:
        assignments = ", ".join(f"{column} = ?" for column in lead_updates)
        values = list(lead_updates.values()) + [lead_id]
        conn.execute(f"UPDATE leadops_leads SET {assignments} WHERE lead_id = ?", values)

    if profile_updates:
        ensure_profile_stub(conn, lead_id)
        assignments = ", ".join(f"{column} = ?" for column in profile_updates)
        values = list(profile_updates.values()) + [lead_id]
        conn.execute(f"UPDATE leadops_profiles SET {assignments} WHERE lead_id = ?", values)


def process_audit_file(
    conn: sqlite3.Connection,
    audit_file: Path,
    min_trust: str,
    apply: bool,
) -> LeadImportResult:
    try:
        payload = load_audit_payload(audit_file)
    except TypeError as exc:
        return LeadImportResult(
            lead_id=-1,
            source_file=audit_file.name,
            mode="ignored",
            ignored_reason=str(exc),
        )
    enrichment = payload.get("enrichment") or {}
    field_confidence = enrichment.get("fieldConfidence") or legacy(payload)
    mode = "native-enrichment" if enrichment.get("fieldConfidence") else "legacy-fallback"
    lead_id = int(payload["leadId"])

    lead_row = get_lead_row(conn, lead_id)
    if lead_row is None:
        raise SystemExit(f"Lead {lead_id} not found in leadops_leads")
    profile_row = get_profile_row(conn, lead_id)

    lead_updates, profile_updates, accepted, skipped, review = plan_direct_updates(
        lead_row,
        profile_row,
        field_confidence,
        min_trust,
    )

    inserted_contacts = []
    has_social_snapshot = any(field in SOCIAL_FIELDS for field in field_confidence)
    if apply and has_social_snapshot:
        clear_audit_contacts(conn, lead_id, "social")

    has_email_snapshot = "email_primary" in field_confidence
    if apply and has_email_snapshot:
        clear_audit_contacts(conn, lead_id, "email")

    has_phone_snapshot = "phone_primary" in field_confidence
    if apply and has_phone_snapshot:
        clear_audit_contacts(conn, lead_id, "phone")

    has_contact_snapshot = "contact_form" in field_confidence
    if apply and has_contact_snapshot:
        clear_audit_contacts(conn, lead_id, "contact_form")

    for field in ("email_primary", "phone_primary", "contact_form"):
        meta = field_confidence.get(field)
        if not meta or not should_accept(meta, min_trust):
            continue
        if field == "email_primary":
            contact_type = "email"
        elif field == "phone_primary":
            contact_type = "phone"
        else:
            contact_type = "contact_form"
        if apply:
            inserted = insert_contact(
                conn,
                lead_id,
                contact_type,
                str(meta["value"]),
                source=f"audit:{audit_file.name}",
                is_primary=1,
            )
            if inserted:
                inserted_contacts.append(
                    FieldAction(
                        field=field,
                        trust_level=meta["trustLevel"],
                        source=meta["source"],
                        value=meta["value"],
                        target=f"leadops_contacts.{contact_type}",
                        action="insert",
                        reason="new audit contact",
                    )
                )

    social_fields = [field for field in field_confidence if field in SOCIAL_FIELDS]
    for field in social_fields:
        meta = field_confidence[field]
        if not should_accept(meta, min_trust):
            continue
        if apply:
            inserted = insert_contact(
                conn,
                lead_id,
                "social",
                str(meta["value"]),
                source=f"audit:{audit_file.name}",
                is_primary=0,
            )
            if inserted:
                inserted_contacts.append(
                    FieldAction(
                        field=field,
                        trust_level=meta["trustLevel"],
                        source=meta["source"],
                        value=meta["value"],
                        target="leadops_contacts.social",
                        action="insert",
                        reason="new audit social",
                    )
                )

    inserted_facts = []
    business_fact_fields = [
        field
        for field in field_confidence
        if field not in {"lead_id", "domain", "website_url", "email_primary", "phone_primary"}
    ]
    if apply and business_fact_fields:
        clear_audit_business_facts(conn, lead_id, business_fact_fields)

    for field, meta in field_confidence.items():
        if not should_accept(meta, min_trust):
            continue
        if field in {"lead_id", "domain", "website_url", "email_primary", "phone_primary"}:
            continue
        if apply:
            inserted = insert_business_fact(
                conn,
                lead_id,
                field,
                meta["value"],
                meta["trustLevel"],
                audit_file.name,
                meta,
            )
            if inserted:
                inserted_facts.append(
                    FieldAction(
                        field=field,
                        trust_level=meta["trustLevel"],
                        source=meta["source"],
                        value=meta["value"],
                        target="leadops_business_facts",
                        action="insert",
                        reason="audit enrichment fact",
                    )
                )

    if apply:
        apply_updates(conn, lead_id, lead_updates, profile_updates)

    return LeadImportResult(
        lead_id=lead_id,
        source_file=audit_file.name,
        mode=mode,
        accepted_fields=accepted + inserted_contacts + inserted_facts,
        skipped_fields=skipped,
        review_fields=review,
    )


def default_report_path() -> Path:
    DEFAULT_REPORT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return DEFAULT_REPORT_DIR / f"audit-enrichment-import-{timestamp}.json"


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    if not input_path.is_absolute():
        input_path = REPO_ROOT / input_path
    audit_files = iter_audit_files(input_path)
    if not audit_files:
        raise SystemExit(f"No audit JSON files found under {input_path}")

    report_path = Path(args.report) if args.report else default_report_path()
    if not report_path.is_absolute():
        report_path = REPO_ROOT / report_path

    conn = sqlite3.connect(args.db)
    try:
        results: list[LeadImportResult] = []
        for audit_file in audit_files:
            if args.apply:
                conn.execute("BEGIN")
            try:
                result = process_audit_file(conn, audit_file, args.min_trust, args.apply)
                if args.apply:
                    conn.commit()
                results.append(result)
            except Exception:
                if args.apply:
                    conn.rollback()
                raise
    finally:
        conn.close()

    report = {
        "generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "mode": "apply" if args.apply else "dry-run",
        "db": str(args.db),
        "input": str(input_path),
        "minTrust": args.min_trust,
        "filesProcessed": len(audit_files),
        "leadResults": [
            {
                "leadId": result.lead_id,
                "sourceFile": result.source_file,
                "extractionMode": result.mode,
                "ignoredReason": result.ignored_reason,
                "accepted": [action.__dict__ for action in result.accepted_fields],
                "skipped": [action.__dict__ for action in result.skipped_fields],
                "reviewCandidates": [action.__dict__ for action in result.review_fields],
            }
            for result in results
        ],
        "reviewQueue": [
            {
                "leadId": result.lead_id,
                "sourceFile": result.source_file,
                **action.__dict__,
            }
            for result in results
            for action in result.review_fields
        ],
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({
        "mode": report["mode"],
        "filesProcessed": report["filesProcessed"],
        "report": str(report_path),
    }, indent=2))


if __name__ == "__main__":
    main()
