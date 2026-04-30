from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"
NOW_UTC = lambda: datetime.utcnow().isoformat(timespec="seconds") + "Z"

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

SEVERITY_MAP = {
    "critical": "critical",
    "giant": "high",
    "big": "high",
    "high": "high",
    "medium": "medium",
    "low": "low",
    "info": "info",
}

PROFILE_FINDING_SOURCES = (
    ("website_audit", "website_audit"),
    ("security_trust", "security_trust"),
    ("ux_conversion", "ux_conversion"),
    ("performance_tech", "performance_tech"),
)

REVIEW_PRIORITY = {
    "admin_surface_exposure": "high",
    "payment_security_posture": "medium",
    "csrf_posture": "medium",
    "dkim_posture": "low",
    "cookie_security_posture": "low",
    "probable_findings": "medium",
    "instrumentation_only_observations": "low",
}

PLACEHOLDER_VALUES = {
    "",
    "n/a",
    "na",
    "none",
    "none detected",
    "none found",
    "not found",
    "not provided",
    "unknown",
    "unavailable",
    "missing",
}

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
URL_RE = re.compile(r"https?://[^\s)>\]]+")
URL_TRAILING_JUNK = "\"'}]),.;:"
GENERIC_SOCIAL_PATH_TOKENS = {
    "wix",
    "wix-com",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build a non-destructive normalized audit layer inside crm.sqlite from stored "
            "profile markdown and audit/enrichment artifacts."
        )
    )
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to crm.sqlite")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable summary")
    return parser.parse_args()


def norm(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return " ".join(str(part).strip() for part in value if str(part).strip()).strip()
    return str(value).strip()


def low(value: Any) -> str:
    return norm(value).lower()


def looks_like_url(value: str) -> bool:
    text = norm(value)
    return text.startswith("http://") or text.startswith("https://")


def normalize_url(value: str) -> str:
    return norm(value).rstrip("/")


def normalize_phone(value: str) -> str:
    return re.sub(r"\D+", "", norm(value))


def normalize_host(value: str) -> str:
    text = norm(value)
    if not text:
        return ""
    parsed = urlparse(text if "://" in text else f"https://{text}")
    host = (parsed.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host


def infer_social_field(url: str) -> str | None:
    host = normalize_host(url)
    if not host:
        return None
    for field, candidates in SOCIAL_HOSTS.items():
        if any(host == candidate or host.endswith(f".{candidate}") for candidate in candidates):
            return field
    return None


def looks_like_placeholder(value: Any) -> bool:
    text = low(value)
    if not text:
        return True
    return text in PLACEHOLDER_VALUES


def is_relevant_social_url(field_name: str, url: str) -> bool:
    text = norm(url).strip(URL_TRAILING_JUNK)
    if not text:
        return False
    lowered = low(text)
    host = normalize_host(text)
    path = low(urlparse(text if "://" in text else f"https://{text}").path)
    query = low(urlparse(text if "://" in text else f"https://{text}").query)
    path_tokens = {token for token in path.split("/") if token}

    if path_tokens & GENERIC_SOCIAL_PATH_TOKENS:
        return False

    if field_name == "facebook_url":
        if not ("facebook.com" == host or host.endswith(".facebook.com") or host == "fb.com" or host.endswith(".fb.com")):
            return False
        if path in {"", "/"}:
            return False
        if path.startswith("/profile.php"):
            return False
        if "/tr" in path or "facebook.com/tr" in lowered:
            return False
        if "plugins/" in path:
            return False
    if field_name == "instagram_url" and not (host == "instagram.com" or host.endswith(".instagram.com")):
        return False
    if field_name == "google_business_url":
        if host == "g.page":
            return True
        if not ("google.com" in host):
            return False
        if host.startswith("developers.") or host.startswith("support."):
            return False
        if not any(token in path for token in ("/maps", "/search")):
            return False
    if field_name == "linkedin_url" and not (host == "linkedin.com" or host.endswith(".linkedin.com")):
        return False
    if field_name == "tiktok_url" and not (host == "tiktok.com" or host.endswith(".tiktok.com")):
        return False
    if field_name == "twitter_url" and not (
        host == "twitter.com" or host.endswith(".twitter.com") or host == "x.com" or host.endswith(".x.com")
    ):
        return False
    if field_name == "twitter_url" and "/intent/" in path:
        return False
    if field_name == "youtube_url":
        if not (
            host == "youtube.com"
            or host.endswith(".youtube.com")
            or host == "youtu.be"
            or host.endswith(".youtu.be")
        ):
            return False
        if path in {"", "/"}:
            return False
        if path.startswith("/s/player/") or path.endswith(".js"):
            return False
    if field_name == "yelp_url":
        if not (host == "yelp.com" or host.endswith(".yelp.com")):
            return False
        if path in {"", "/"} or path.startswith("/search"):
            return False
    if any(token in query for token in ("utm_", "fbclid=", "gclid=", "dclid=")):
        return False
    return True


def is_valid_field_value(field_name: str, value: Any) -> bool:
    text = norm(value)
    if looks_like_placeholder(text):
        return False
    if field_name == "email":
        email = low(text)
        if not EMAIL_RE.fullmatch(email):
            return False
        if any(ext in email for ext in (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".avif")):
            return False
        local_part, _, domain = email.partition("@")
        if domain in {"example.com", "example.org", "example.net", "domain.com", "mapquest.com"}:
            return False
        if local_part in {"name", "user", "example", "john.doe"}:
            return False
        return True
    if field_name == "phone":
        return len(normalize_phone(text)) >= 10
    if field_name == "contact_form":
        return looks_like_url(text)
    if field_name in SOCIAL_HOSTS:
        return looks_like_url(text) and is_relevant_social_url(field_name, text)
    if field_name == "address":
        return len(text) >= 6
    return True


def parse_json(value: str) -> Any:
    text = norm(value)
    if not text:
        return {}
    try:
        return json.loads(text)
    except Exception:
        return {}


def normalize_severity(label: str) -> str:
    clean = low(label)
    for key, mapped in SEVERITY_MAP.items():
        if key in clean:
            return mapped
    return "info"


def infer_family(source_name: str) -> str:
    if source_name == "security_trust":
        return "security"
    if source_name == "ux_conversion":
        return "ux"
    if source_name == "performance_tech":
        return "performance"
    return "website_audit"


def slugify(value: Any) -> str:
    text = re.sub(r"[^a-z0-9]+", "_", low(value))
    return text.strip("_") or "unknown"


def stable_key(*parts: Any) -> str:
    raw = "||".join(norm(part) for part in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def ensure_column(conn: sqlite3.Connection, table_name: str, column_name: str, declaration: str) -> None:
    columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table_name})")}
    if column_name not in columns:
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {declaration}")


def infer_finding_dimension_kind(source_name: str, title: str, details: str, source_ref: str = "") -> tuple[str, str]:
    haystack = " ".join(part for part in (low(source_name), low(title), low(details), low(source_ref)) if part)
    checks = [
        ("admin_surface", ("wp-json", "wordpress", "xmlrpc", "admin", "exposure", "register", "login")),
        ("email_auth", ("spf", "dmarc", "dkim")),
        ("security_headers", ("header", "csp", "hsts", "frame-options", "content-type-options", "referrer-policy")),
        ("cookies", ("cookie", "httponly", "secure", "samesite")),
        ("transport_tls", ("tls", "ssl", "certificate", "redirect", "https")),
        ("forms", ("form", "csrf", "captcha", "contact page", "contact form")),
        ("payment", ("payment", "checkout", "stripe", "paypal", "square")),
        ("mixed_content", ("mixed content",)),
        ("dns", ("dns", "mx", "txt", "cname")),
        ("platform", ("wordpress", "woocommerce", "shopify", "cms", "plugin")),
        ("performance", ("lighthouse", "performance", "render", "javascript", "css", "image", "largest contentful paint")),
        ("ux_conversion", ("ux", "cta", "conversion", "copy", "hero", "navigation", "mobile")),
        ("contact", ("email", "phone", "contact", "social")),
    ]
    for dimension, needles in checks:
        if any(needle in haystack for needle in needles):
            return dimension, slugify(title or details or dimension)
    return infer_family(source_name), slugify(title or details or source_name)


def extract_negative_signal(field_name: str, value: Any) -> tuple[bool, str]:
    text = norm(value)
    lowered = low(value)
    if not text:
        return False, ""
    negative_tokens = (
        "unknown",
        "not found",
        "none found",
        "none detected",
        "none -",
        "none (",
        "not available",
        "no ",
        "parked",
        "suspended",
        "bounced",
        "informational",
        "info only",
        "use email",
        "see website",
    )
    if any(token in lowered for token in negative_tokens):
        return True, text
    if field_name in {"email", "phone", "contact_form", "social_media"} and looks_like_placeholder(text):
        return True, text
    return False, ""


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS leadops_audit_normalization_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            source TEXT NOT NULL,
            summary_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS leadops_audit_coverage (
            lead_id INTEGER PRIMARY KEY,
            has_rich_profile INTEGER NOT NULL DEFAULT 0,
            has_audit_markdown INTEGER NOT NULL DEFAULT 0,
            has_legacy_website_audit INTEGER NOT NULL DEFAULT 0,
            has_security_section INTEGER NOT NULL DEFAULT 0,
            has_ux_section INTEGER NOT NULL DEFAULT 0,
            has_performance_section INTEGER NOT NULL DEFAULT 0,
            has_audit_artifact INTEGER NOT NULL DEFAULT 0,
            has_enrichment_artifact INTEGER NOT NULL DEFAULT 0,
            has_structured_audit_findings INTEGER NOT NULL DEFAULT 0,
            profile_audit_signal_count INTEGER NOT NULL DEFAULT 0,
            audited_status TEXT NOT NULL,
            source_summary_json TEXT NOT NULL,
            derived_at TEXT NOT NULL,
            FOREIGN KEY (lead_id) REFERENCES leadops_leads(lead_id)
        );

        CREATE TABLE IF NOT EXISTS leadops_audit_normalized_findings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER NOT NULL,
            finding_key TEXT,
            source_kind TEXT NOT NULL,
            source_ref TEXT NOT NULL,
            finding_family TEXT,
            finding_dimension TEXT,
            finding_kind TEXT,
            severity TEXT NOT NULL,
            title TEXT NOT NULL,
            details TEXT,
            source_confidence TEXT,
            verification_status TEXT NOT NULL DEFAULT 'derived',
            review_state TEXT NOT NULL DEFAULT 'normalized_only',
            raw_payload TEXT NOT NULL,
            FOREIGN KEY (lead_id) REFERENCES leadops_leads(lead_id)
        );

        CREATE TABLE IF NOT EXISTS leadops_audit_autofill_candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER NOT NULL,
            candidate_key TEXT,
            field_name TEXT NOT NULL,
            candidate_value TEXT NOT NULL,
            normalized_value TEXT,
            candidate_kind TEXT NOT NULL DEFAULT 'positive',
            confidence TEXT NOT NULL,
            source_kind TEXT NOT NULL,
            source_ref TEXT NOT NULL,
            target_table TEXT NOT NULL,
            target_column TEXT,
            target_blank INTEGER NOT NULL DEFAULT 0,
            candidate_status TEXT NOT NULL,
            raw_payload TEXT NOT NULL,
            FOREIGN KEY (lead_id) REFERENCES leadops_leads(lead_id)
        );

        CREATE TABLE IF NOT EXISTS leadops_audit_review_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER NOT NULL,
            queue_key TEXT,
            queue_type TEXT NOT NULL,
            field_name TEXT,
            proposed_value TEXT,
            priority TEXT NOT NULL,
            reason TEXT NOT NULL,
            source_kind TEXT NOT NULL,
            source_ref TEXT NOT NULL,
            candidate_key TEXT,
            status TEXT NOT NULL DEFAULT 'open',
            raw_payload TEXT NOT NULL,
            FOREIGN KEY (lead_id) REFERENCES leadops_leads(lead_id)
        );

        CREATE TABLE IF NOT EXISTS leadops_audit_review_history (
            queue_key TEXT PRIMARY KEY,
            review_status TEXT NOT NULL DEFAULT 'open',
            reviewer TEXT,
            reviewed_at TEXT,
            resolution_note TEXT,
            promoted_candidate_key TEXT
        );

        CREATE TABLE IF NOT EXISTS leadops_audit_candidate_promotions (
            candidate_key TEXT PRIMARY KEY,
            lead_id INTEGER NOT NULL,
            field_name TEXT NOT NULL,
            promoted_to_table TEXT NOT NULL,
            promoted_to_column TEXT,
            promoted_value TEXT,
            promoted_at TEXT NOT NULL,
            promoted_by TEXT,
            promotion_note TEXT,
            FOREIGN KEY (lead_id) REFERENCES leadops_leads(lead_id)
        );

        CREATE TABLE IF NOT EXISTS leadops_audit_field_observations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            observation_key TEXT,
            lead_id INTEGER NOT NULL,
            field_name TEXT NOT NULL,
            observation_status TEXT NOT NULL,
            observed_value TEXT,
            confidence TEXT,
            source_kind TEXT NOT NULL,
            source_ref TEXT NOT NULL,
            note TEXT,
            raw_payload TEXT NOT NULL,
            FOREIGN KEY (lead_id) REFERENCES leadops_leads(lead_id)
        );

        CREATE INDEX IF NOT EXISTS idx_leadops_audit_coverage_status ON leadops_audit_coverage(audited_status);
        CREATE INDEX IF NOT EXISTS idx_leadops_audit_findings_lead_severity ON leadops_audit_normalized_findings(lead_id, severity);
        CREATE INDEX IF NOT EXISTS idx_leadops_audit_candidates_lead_field ON leadops_audit_autofill_candidates(lead_id, field_name);
        CREATE INDEX IF NOT EXISTS idx_leadops_audit_review_queue_status ON leadops_audit_review_queue(status, priority);
        """
    )

    ensure_column(conn, "leadops_audit_normalized_findings", "finding_key", "TEXT")
    ensure_column(conn, "leadops_audit_normalized_findings", "finding_dimension", "TEXT")
    ensure_column(conn, "leadops_audit_normalized_findings", "finding_kind", "TEXT")
    ensure_column(conn, "leadops_audit_normalized_findings", "source_confidence", "TEXT")
    ensure_column(conn, "leadops_audit_normalized_findings", "verification_status", "TEXT NOT NULL DEFAULT 'derived'")
    ensure_column(conn, "leadops_audit_autofill_candidates", "candidate_key", "TEXT")
    ensure_column(conn, "leadops_audit_autofill_candidates", "candidate_kind", "TEXT NOT NULL DEFAULT 'positive'")
    ensure_column(conn, "leadops_audit_autofill_candidates", "target_column", "TEXT")
    ensure_column(conn, "leadops_audit_review_queue", "queue_key", "TEXT")
    ensure_column(conn, "leadops_audit_review_queue", "candidate_key", "TEXT")
    ensure_column(conn, "leadops_audit_field_observations", "observation_key", "TEXT")

    conn.executescript(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_leadops_audit_findings_key ON leadops_audit_normalized_findings(finding_key);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_leadops_audit_candidates_key ON leadops_audit_autofill_candidates(candidate_key);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_leadops_audit_review_queue_key ON leadops_audit_review_queue(queue_key);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_leadops_audit_observation_key ON leadops_audit_field_observations(observation_key);

        DROP VIEW IF EXISTS leadops_v_audit_coverage_summary;
        CREATE VIEW leadops_v_audit_coverage_summary AS
        SELECT
            l.lead_id,
            l.name,
            l.website,
            ac.has_rich_profile,
            ac.has_audit_markdown,
            ac.has_legacy_website_audit,
            ac.has_security_section,
            ac.has_ux_section,
            ac.has_performance_section,
            ac.has_audit_artifact,
            ac.has_enrichment_artifact,
            ac.has_structured_audit_findings,
            ac.profile_audit_signal_count,
            ac.audited_status,
            ac.derived_at
        FROM leadops_audit_coverage ac
        JOIN leadops_leads l ON l.lead_id = ac.lead_id
        ORDER BY l.lead_id ASC;

        DROP VIEW IF EXISTS leadops_v_audit_autofill_ready;
        CREATE VIEW leadops_v_audit_autofill_ready AS
        SELECT
            c.lead_id,
            l.name,
            l.website,
            c.candidate_key,
            c.candidate_kind,
            c.field_name,
            c.candidate_value,
            c.confidence,
            c.source_kind,
            c.source_ref,
            c.target_table,
            c.target_column,
            c.target_blank,
            c.candidate_status,
            p.promoted_at,
            p.promoted_to_table,
            p.promoted_to_column
        FROM leadops_audit_autofill_candidates c
        JOIN leadops_leads l ON l.lead_id = c.lead_id
        LEFT JOIN leadops_audit_candidate_promotions p ON p.candidate_key = c.candidate_key
        WHERE c.target_blank = 1
          AND c.candidate_status = 'ready'
          AND p.candidate_key IS NULL
        ORDER BY c.lead_id ASC, c.field_name ASC, c.id ASC;

        DROP VIEW IF EXISTS leadops_v_audit_review_queue_open;
        CREATE VIEW leadops_v_audit_review_queue_open AS
        SELECT
            q.lead_id,
            l.name,
            l.website,
            q.queue_key,
            q.queue_type,
            q.field_name,
            q.proposed_value,
            q.priority,
            q.reason,
            q.source_kind,
            q.source_ref,
            COALESCE(h.review_status, q.status) AS status,
            h.reviewer,
            h.reviewed_at,
            h.resolution_note,
            h.promoted_candidate_key
        FROM leadops_audit_review_queue q
        JOIN leadops_leads l ON l.lead_id = q.lead_id
        LEFT JOIN leadops_audit_review_history h ON h.queue_key = q.queue_key
        WHERE lower(COALESCE(h.review_status, q.status, 'open')) = 'open'
        ORDER BY
            CASE q.priority
                WHEN 'high' THEN 1
                WHEN 'medium' THEN 2
                ELSE 3
            END,
            q.lead_id ASC,
            q.id ASC;

        DROP VIEW IF EXISTS leadops_v_audit_verified_negatives;
        CREATE VIEW leadops_v_audit_verified_negatives AS
        SELECT
            o.lead_id,
            l.name,
            l.website,
            o.field_name,
            o.observation_status,
            o.observed_value,
            o.confidence,
            o.source_kind,
            o.source_ref,
            o.note
        FROM leadops_audit_field_observations o
        JOIN leadops_leads l ON l.lead_id = o.lead_id
        WHERE o.observation_status = 'verified_absent'
        ORDER BY o.lead_id ASC, o.field_name ASC, o.id ASC;

        DROP VIEW IF EXISTS leadops_v_audit_promotion_status;
        CREATE VIEW leadops_v_audit_promotion_status AS
        SELECT
            c.lead_id,
            l.name,
            l.website,
            c.candidate_key,
            c.field_name,
            c.candidate_value,
            c.target_table,
            c.target_column,
            p.promoted_value,
            p.promoted_to_table,
            p.promoted_to_column,
            p.promoted_at,
            p.promoted_by,
            p.promotion_note
        FROM leadops_audit_autofill_candidates c
        JOIN leadops_leads l ON l.lead_id = c.lead_id
        JOIN leadops_audit_candidate_promotions p ON p.candidate_key = c.candidate_key
        ORDER BY p.promoted_at DESC, c.lead_id ASC;
        """
    )


def clear_tables(conn: sqlite3.Connection) -> None:
    for table in (
        "leadops_audit_coverage",
        "leadops_audit_normalized_findings",
        "leadops_audit_autofill_candidates",
        "leadops_audit_review_queue",
        "leadops_audit_field_observations",
    ):
        conn.execute(f"DELETE FROM {table}")


def parse_profile_findings(source_name: str, text: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    if not norm(text):
        return findings
    current_severity = "info"
    current_heading = ""
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.lower().startswith("audit date:"):
            continue
        if stripped.startswith("### "):
            current_heading = stripped[4:].strip()
            current_severity = normalize_severity(current_heading)
            continue
        if not stripped.startswith("- "):
            continue
        bullet = stripped[2:].strip()
        if low(bullet).startswith("evidence:"):
            continue
        bullet = re.sub(r"^\*\*([^*]+)\*\*\.?\s*", r"\1: ", bullet)
        findings.append(
            {
                "finding_family": infer_family(source_name),
                "severity": current_severity,
                "title": bullet[:500],
                "details": current_heading or source_name,
                "raw": {"section": source_name, "heading": current_heading, "bullet": bullet},
            }
        )
    if not findings:
        findings.append(
            {
                "finding_family": infer_family(source_name),
                "severity": "info",
                "title": norm(text).splitlines()[0][:500],
                "details": source_name,
                "raw": {"section": source_name, "text": text[:2000]},
            }
        )
    return findings


def iter_urls(text: str) -> list[str]:
    urls = [match.group(0).rstrip(URL_TRAILING_JUNK) for match in URL_RE.finditer(text or "")]
    return list(dict.fromkeys(urls))


def choose_candidate_status(field_name: str, confidence: str, target_blank: bool) -> str:
    conf = low(confidence)
    if not target_blank:
        return "already_populated"
    if field_name in {"email", "phone", "contact_form"} and conf in {"high", "verified", "observed", "medium"}:
        return "ready"
    if field_name in SOCIAL_HOSTS or field_name == "social_media":
        return "needs_review"
    if field_name == "address" and conf in {"high", "verified"}:
        return "ready"
    return "needs_review"


def normalized_candidate_value(field_name: str, value: str) -> str:
    if field_name == "email":
        return low(value)
    if field_name == "phone":
        return normalize_phone(value)
    if field_name in {"contact_form", *SOCIAL_HOSTS.keys()}:
        return normalize_url(value)
    return norm(value)


def load_json_file(relative_path: str) -> Any:
    path = REPO_ROOT / relative_path
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def coerce_enrichment_payload(payload: Any) -> tuple[dict[str, Any], str]:
    if not isinstance(payload, dict):
        return {}, ""
    if isinstance(payload.get("enrichment"), dict):
        return payload["enrichment"], "audit_json"
    return payload, "enrichment_json"


def append_candidate(
    candidate_rows: list[tuple[Any, ...]],
    review_rows: list[tuple[Any, ...]],
    *,
    lead_id: int,
    field_name: str,
    value: str,
    confidence: str,
    source_kind: str,
    source_ref: str,
    target_table: str,
    target_column: str,
    target_blank: bool,
    payload: dict[str, Any],
) -> None:
    text = norm(value)
    if not text or not is_valid_field_value(field_name, text):
        return
    normalized = normalized_candidate_value(field_name, text)
    status = choose_candidate_status(field_name, confidence, target_blank)
    candidate_key = stable_key(lead_id, field_name, normalized, source_kind, source_ref, target_table, target_column)
    candidate_rows.append(
        (
            lead_id,
            candidate_key,
            field_name,
            text,
            normalized,
            "positive",
            confidence,
            source_kind,
            source_ref,
            target_table,
            target_column,
            1 if target_blank else 0,
            status,
            json.dumps(payload, ensure_ascii=True, sort_keys=True),
        )
    )
    if target_blank and status == "needs_review":
        review_rows.append(
            (
                lead_id,
                stable_key(lead_id, "review", field_name, text, source_kind, source_ref),
                "autofill_verification",
                field_name,
                text,
                "medium" if field_name in SOCIAL_HOSTS else "low",
                f"Review before promoting {field_name} into {target_table}",
                source_kind,
                source_ref,
                candidate_key,
                "open",
                json.dumps(payload, ensure_ascii=True, sort_keys=True),
            )
        )


def sync_normalized_layer(conn: sqlite3.Connection) -> dict[str, Any]:
    clear_tables(conn)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    website_rows = cur.execute(
        """
        SELECT
            l.lead_id,
            l.name,
            l.website,
            l.email,
            l.phone,
            l.contact_form,
            l.social_media,
            p.raw_markdown,
            p.website_audit,
            p.security_trust,
            p.ux_conversion,
            p.performance_tech,
            p.address
        FROM leadops_leads l
        LEFT JOIN leadops_profiles p ON p.lead_id = l.lead_id
        WHERE trim(COALESCE(l.website, '')) <> ''
        ORDER BY l.lead_id ASC
        """
    ).fetchall()

    fact_rows = cur.execute(
        """
        SELECT lead_id, fact_type, fact_value, source_kind, source_file, confidence, raw_payload
        FROM leadops_business_facts
        WHERE trim(COALESCE(fact_value, '')) <> ''
        ORDER BY lead_id ASC, id ASC
        """
    ).fetchall()
    facts_by_lead: dict[int, list[sqlite3.Row]] = defaultdict(list)
    for row in fact_rows:
        facts_by_lead[row["lead_id"]].append(row)

    contact_rows = cur.execute(
        """
        SELECT lead_id, contact_type, value, normalized_value
        FROM leadops_contacts
        WHERE trim(COALESCE(value, '')) <> ''
        ORDER BY lead_id ASC, id ASC
        """
    ).fetchall()
    contacts_by_lead: dict[int, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for row in contact_rows:
        contacts_by_lead[row["lead_id"]][row["contact_type"]].add(low(row["normalized_value"] or row["value"]))

    audit_findings_rows = cur.execute(
        """
        SELECT lead_id, issue_type_norm, issue_description, severity, source_file, raw_payload
        FROM leadops_audit_findings
        ORDER BY lead_id ASC, id ASC
        """
    ).fetchall()
    structured_findings_by_lead: dict[int, list[sqlite3.Row]] = defaultdict(list)
    for row in audit_findings_rows:
        structured_findings_by_lead[row["lead_id"]].append(row)

    artifact_rows = cur.execute(
        """
        SELECT lead_id, relative_path, artifact_group, artifact_kind, text_extract, raw_payload
        FROM leadops_evidence_artifacts
        ORDER BY lead_id ASC, id ASC
        """
    ).fetchall()
    artifacts_by_lead: dict[int, list[sqlite3.Row]] = defaultdict(list)
    for row in artifact_rows:
        artifacts_by_lead[row["lead_id"]].append(row)

    coverage_rows: list[tuple[Any, ...]] = []
    normalized_findings: list[tuple[Any, ...]] = []
    candidate_rows: list[tuple[Any, ...]] = []
    review_rows: list[tuple[Any, ...]] = []
    observation_rows: list[tuple[Any, ...]] = []
    seen_finding_keys: set[str] = set()
    seen_observation_keys: set[str] = set()
    seen_review_keys: set[str] = set()

    counts = {
        "website_leads": len(website_rows),
        "coverage_rows": 0,
        "normalized_findings": 0,
        "autofill_candidates": 0,
        "review_queue_rows": 0,
        "autofill_ready": 0,
        "verified_negatives": 0,
    }

    for row in website_rows:
        lead_id = row["lead_id"]
        raw_markdown = norm(row["raw_markdown"])
        section_map = {name: norm(row[name]) for name, _ in PROFILE_FINDING_SOURCES}
        lead_artifacts = artifacts_by_lead.get(lead_id, [])
        lead_structured_findings = structured_findings_by_lead.get(lead_id, [])

        has_rich_profile = bool(raw_markdown)
        profile_signal_count = sum(1 for value in section_map.values() if value)
        has_audit_markdown = (
            "## website audit" in low(raw_markdown)
            or "## deep security audit" in low(raw_markdown)
            or profile_signal_count > 0
        )
        has_legacy_website_audit = bool(section_map["website_audit"])
        has_security_section = bool(section_map["security_trust"])
        has_ux_section = bool(section_map["ux_conversion"])
        has_performance_section = bool(section_map["performance_tech"])
        has_audit_artifact = any(
            low(item["artifact_group"]) == "audit" or low(item["artifact_kind"]) in {"markdown_note", "deep_audit_note"}
            for item in lead_artifacts
        )
        has_enrichment_artifact = any(
            low(item["relative_path"]).endswith("enrichment.json")
            or low(item["relative_path"]).endswith("mobile-audit.json")
            for item in lead_artifacts
        )
        has_structured_audit_findings = bool(lead_structured_findings)

        if has_structured_audit_findings:
            audited_status = "structured_findings"
        elif has_audit_artifact or has_enrichment_artifact:
            audited_status = "artifact_only"
        elif has_audit_markdown:
            audited_status = "narrative_only"
        elif has_rich_profile:
            audited_status = "profile_only"
        else:
            audited_status = "missing"

        source_summary = {
            "profile_sections": [name for name, _ in PROFILE_FINDING_SOURCES if section_map[name]],
            "artifact_count": len(lead_artifacts),
            "structured_finding_count": len(lead_structured_findings),
        }
        coverage_rows.append(
            (
                lead_id,
                1 if has_rich_profile else 0,
                1 if has_audit_markdown else 0,
                1 if has_legacy_website_audit else 0,
                1 if has_security_section else 0,
                1 if has_ux_section else 0,
                1 if has_performance_section else 0,
                1 if has_audit_artifact else 0,
                1 if has_enrichment_artifact else 0,
                1 if has_structured_audit_findings else 0,
                profile_signal_count,
                audited_status,
                json.dumps(source_summary, ensure_ascii=True, sort_keys=True),
                NOW_UTC(),
            )
        )

        for source_name, source_kind in PROFILE_FINDING_SOURCES:
            for finding in parse_profile_findings(source_name, section_map[source_name]):
                dimension, finding_kind = infer_finding_dimension_kind(
                    source_name,
                    norm(finding.get("title")),
                    norm(finding.get("details")),
                    source_kind,
                )
                finding_key = stable_key(
                    lead_id,
                    source_kind,
                    dimension,
                    finding_kind,
                    norm(finding.get("title")),
                    norm(finding.get("details")),
                )
                if finding_key in seen_finding_keys:
                    continue
                seen_finding_keys.add(finding_key)
                normalized_findings.append(
                    (
                        lead_id,
                        finding_key,
                        "profile_section",
                        source_kind,
                        finding.get("finding_family") or infer_family(source_name),
                        dimension,
                        finding_kind,
                        finding.get("severity") or "info",
                        norm(finding.get("title"))[:500],
                        norm(finding.get("details"))[:2000],
                        "medium",
                        "derived",
                        "normalized_only",
                        json.dumps(finding.get("raw") or {}, ensure_ascii=True, sort_keys=True),
                    )
                )

        for finding in lead_structured_findings:
            title = norm(finding["issue_description"])[:500] or norm(finding["issue_type_norm"]) or "Structured audit finding"
            details = norm(finding["issue_type_norm"])[:2000]
            dimension, finding_kind = infer_finding_dimension_kind(
                "leadops_audit_findings",
                title,
                details,
                norm(finding["source_file"]),
            )
            finding_key = stable_key(lead_id, norm(finding["source_file"]), dimension, finding_kind, title)
            if finding_key in seen_finding_keys:
                continue
            seen_finding_keys.add(finding_key)
            normalized_findings.append(
                (
                    lead_id,
                    finding_key,
                    "audit_finding",
                    norm(finding["source_file"]) or "leadops_audit_findings",
                    norm(finding["issue_type_norm"]) or "structured_audit",
                    dimension,
                    finding_kind,
                    normalize_severity(finding["severity"]),
                    title,
                    details,
                    "high",
                    "stored",
                    "normalized_only",
                    norm(finding["raw_payload"]) or "{}",
                )
            )

        existing_socials = contacts_by_lead.get(lead_id, {}).get("social", set())
        target_blanks = {
            "email": not bool(norm(row["email"])),
            "phone": not bool(norm(row["phone"])),
            "contact_form": not bool(norm(row["contact_form"])),
            "address": not bool(norm(row["address"])),
            "social_media": not bool(norm(row["social_media"])) and not bool(existing_socials),
        }

        seen_candidates: set[tuple[int, str, str]] = set()
        for fact in facts_by_lead.get(lead_id, []):
            fact_type = norm(fact["fact_type"])
            fact_value = norm(fact["fact_value"])
            if not fact_type or not fact_value:
                continue
            source_kind = norm(fact["source_kind"]) or "business_fact"
            source_ref = norm(fact["source_file"]) or source_kind
            confidence = low(fact["confidence"]) or "medium"
            raw_payload = parse_json(fact["raw_payload"])

            if fact_type in {"email", "phone", "contact_form", "address"}:
                if not is_valid_field_value(fact_type, fact_value):
                    is_negative, note = extract_negative_signal(fact_type, fact_value)
                    if is_negative:
                        observation_key = stable_key(lead_id, fact_type, source_kind, source_ref, note)
                        if observation_key in seen_observation_keys:
                            continue
                        seen_observation_keys.add(observation_key)
                        observation_rows.append(
                            (
                                observation_key,
                                lead_id,
                                fact_type,
                                "verified_absent",
                                None,
                                confidence,
                                source_kind,
                                source_ref,
                                note[:500],
                                json.dumps({"fact_type": fact_type, "raw_payload": raw_payload}, ensure_ascii=True, sort_keys=True),
                            )
                        )
                    continue
                normalized = normalized_candidate_value(fact_type, fact_value)
                dedupe_key = (lead_id, fact_type, normalized)
                if dedupe_key in seen_candidates:
                    continue
                seen_candidates.add(dedupe_key)
                append_candidate(
                    candidate_rows,
                    review_rows,
                    lead_id=lead_id,
                    field_name=fact_type,
                    value=fact_value,
                    confidence=confidence,
                    source_kind=source_kind,
                    source_ref=source_ref,
                    target_table="leadops_leads" if fact_type != "address" else "leadops_profiles",
                    target_column=fact_type if fact_type != "address" else "address",
                    target_blank=target_blanks[fact_type],
                    payload={"fact_type": fact_type, "raw_payload": raw_payload},
                )
                continue

            if fact_type == "social_media" and not looks_like_url(fact_value):
                is_negative, note = extract_negative_signal("social_media", fact_value)
                if is_negative:
                    observation_key = stable_key(lead_id, "social_media", source_kind, source_ref, note)
                    if observation_key in seen_observation_keys:
                        continue
                    seen_observation_keys.add(observation_key)
                    observation_rows.append(
                        (
                            observation_key,
                            lead_id,
                            "social_media",
                            "verified_absent",
                            None,
                            confidence,
                            source_kind,
                            source_ref,
                            note[:500],
                            json.dumps({"fact_type": fact_type, "raw_payload": raw_payload}, ensure_ascii=True, sort_keys=True),
                        )
                    )
                continue

            if looks_like_url(fact_value):
                social_field = infer_social_field(fact_value)
                if social_field:
                    if not is_relevant_social_url(social_field, fact_value):
                        continue
                    normalized = normalized_candidate_value(social_field, fact_value)
                    dedupe_key = (lead_id, social_field, normalized)
                    if dedupe_key in seen_candidates or normalized in existing_socials:
                        continue
                    seen_candidates.add(dedupe_key)
                    append_candidate(
                        candidate_rows,
                        review_rows,
                        lead_id=lead_id,
                        field_name=social_field,
                        value=fact_value,
                        confidence=confidence,
                        source_kind=source_kind,
                        source_ref=source_ref,
                        target_table="leadops_contacts",
                        target_column="value",
                        target_blank=target_blanks["social_media"],
                        payload={"fact_type": fact_type, "raw_payload": raw_payload},
                    )

        for artifact in lead_artifacts:
            relative_path = norm(artifact["relative_path"])
            artifact_text = norm(artifact["text_extract"])
            payload = load_json_file(relative_path) if relative_path.lower().endswith(".json") else {}
            enrichment, payload_kind = coerce_enrichment_payload(payload)
            if not enrichment:
                continue

            security_autofill = enrichment.get("securityAutofill") or {}
            verified_autofill = security_autofill.get("verifiedAutofill") or {}
            for field_name, value in verified_autofill.items():
                clean_field = norm(field_name)
                clean_value = norm(value)
                if not clean_field or not clean_value:
                    continue
                if not is_valid_field_value(clean_field, clean_value):
                    continue
                target_blank = target_blanks.get(clean_field, target_blanks["social_media"] if clean_field in SOCIAL_HOSTS else False)
                target_table = "leadops_contacts" if clean_field in SOCIAL_HOSTS else ("leadops_profiles" if clean_field == "address" else "leadops_leads")
                normalized = normalized_candidate_value(clean_field, clean_value)
                dedupe_key = (lead_id, clean_field, normalized)
                if dedupe_key in seen_candidates:
                    continue
                seen_candidates.add(dedupe_key)
                append_candidate(
                    candidate_rows,
                    review_rows,
                    lead_id=lead_id,
                    field_name=clean_field,
                    value=clean_value,
                    confidence="verified",
                    source_kind=payload_kind,
                    source_ref=relative_path,
                    target_table=target_table,
                    target_column="value" if clean_field in SOCIAL_HOSTS else clean_field,
                    target_blank=target_blank,
                    payload={"verifiedAutofill": True},
                )

            for entry in security_autofill.get("reviewQueue") or []:
                if not isinstance(entry, dict):
                    continue
                field_name = norm(entry.get("field") or entry.get("fieldName"))
                proposed_value = norm(entry.get("value") or entry.get("candidateValue"))
                reason = norm(entry.get("reason") or entry.get("note") or field_name or "review_queue_item")
                priority = REVIEW_PRIORITY.get(field_name, "medium")
                queue_key = stable_key(lead_id, "security_review", field_name, proposed_value, relative_path)
                if queue_key in seen_review_keys:
                    continue
                seen_review_keys.add(queue_key)
                review_rows.append(
                    (
                        lead_id,
                        queue_key,
                        "security_review",
                        field_name or None,
                        proposed_value or None,
                        priority,
                        reason,
                        payload_kind,
                        relative_path,
                        None,
                        "open",
                        json.dumps(entry, ensure_ascii=True, sort_keys=True),
                    )
                )

            if artifact_text:
                for url in iter_urls(artifact_text):
                    social_field = infer_social_field(url)
                    if not social_field:
                        continue
                    if not is_relevant_social_url(social_field, url):
                        continue
                    normalized = normalized_candidate_value(social_field, url)
                    dedupe_key = (lead_id, social_field, normalized)
                    if dedupe_key in seen_candidates or normalized in existing_socials:
                        continue
                    seen_candidates.add(dedupe_key)
                    append_candidate(
                        candidate_rows,
                        review_rows,
                        lead_id=lead_id,
                        field_name=social_field,
                        value=url,
                        confidence="observed",
                        source_kind="artifact_text",
                        source_ref=relative_path,
                        target_table="leadops_contacts",
                        target_column="value",
                        target_blank=target_blanks["social_media"],
                        payload={"artifact_kind": artifact["artifact_kind"]},
                    )

    conn.executemany(
        """
        INSERT INTO leadops_audit_coverage (
            lead_id,
            has_rich_profile,
            has_audit_markdown,
            has_legacy_website_audit,
            has_security_section,
            has_ux_section,
            has_performance_section,
            has_audit_artifact,
            has_enrichment_artifact,
            has_structured_audit_findings,
            profile_audit_signal_count,
            audited_status,
            source_summary_json,
            derived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        coverage_rows,
    )
    conn.executemany(
        """
        INSERT INTO leadops_audit_normalized_findings (
            lead_id,
            finding_key,
            source_kind,
            source_ref,
            finding_family,
            finding_dimension,
            finding_kind,
            severity,
            title,
            details,
            source_confidence,
            verification_status,
            review_state,
            raw_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        normalized_findings,
    )
    conn.executemany(
        """
        INSERT INTO leadops_audit_autofill_candidates (
            lead_id,
            candidate_key,
            field_name,
            candidate_value,
            normalized_value,
            candidate_kind,
            confidence,
            source_kind,
            source_ref,
            target_table,
            target_column,
            target_blank,
            candidate_status,
            raw_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        candidate_rows,
    )
    conn.executemany(
        """
        INSERT INTO leadops_audit_review_queue (
            lead_id,
            queue_key,
            queue_type,
            field_name,
            proposed_value,
            priority,
            reason,
            source_kind,
            source_ref,
            candidate_key,
            status,
            raw_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        review_rows,
    )
    conn.executemany(
        """
        INSERT INTO leadops_audit_field_observations (
            observation_key,
            lead_id,
            field_name,
            observation_status,
            observed_value,
            confidence,
            source_kind,
            source_ref,
            note,
            raw_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        observation_rows,
    )

    counts["coverage_rows"] = len(coverage_rows)
    counts["normalized_findings"] = len(normalized_findings)
    counts["autofill_candidates"] = len(candidate_rows)
    counts["review_queue_rows"] = len(review_rows)
    counts["verified_negatives"] = len(observation_rows)
    counts["autofill_ready"] = sum(1 for row in candidate_rows if row[12] == "ready")
    counts["audited_status"] = {
        status: total
        for status, total in cur.execute(
            """
            SELECT audited_status, COUNT(*)
            FROM leadops_audit_coverage
            GROUP BY audited_status
            ORDER BY audited_status ASC
            """
        ).fetchall()
    }
    return counts


def main() -> int:
    args = parse_args()
    db_path = Path(args.db)
    started_at = NOW_UTC()
    conn = sqlite3.connect(db_path)
    try:
        ensure_schema(conn)
        summary = sync_normalized_layer(conn)
        completed_at = NOW_UTC()
        conn.execute(
            """
            INSERT INTO leadops_audit_normalization_runs (started_at, completed_at, source, summary_json)
            VALUES (?, ?, ?, ?)
            """,
            (
                started_at,
                completed_at,
                "sync_normalized_audit_layer.py",
                json.dumps(summary, ensure_ascii=True, sort_keys=True),
            ),
        )
        conn.commit()
    finally:
        conn.close()

    if args.json:
        print(json.dumps(summary, ensure_ascii=True, indent=2, sort_keys=True))
    else:
        print(
            "Normalized audit layer synced: "
            f"{summary['coverage_rows']} coverage rows, "
            f"{summary['normalized_findings']} findings, "
            f"{summary['autofill_candidates']} candidates, "
            f"{summary['review_queue_rows']} review items."
        )
        print(f"Audited status breakdown: {json.dumps(summary['audited_status'], ensure_ascii=True, sort_keys=True)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
