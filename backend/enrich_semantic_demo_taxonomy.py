#!/usr/bin/env python3
"""
Enrich semantic-demo compact payload taxonomy from LeadOps evidence.

This is intentionally conservative:
- only reclassifies records currently in cluster 0 (General Business)
- prefers NAICS when useful
- falls back to profile/search-document text when the match is explicit
- leaves registry-only/thin records in General Business

The compact row schema is:
[x, y, z, cluster, name, what, city, lead_id, lat, lng, website, email, phone, trivia, status]
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "ops/remote-staging/mccullough.cloud/public_html/semantic-demo/data.dat"
DEFAULT_CRM = ROOT / "crm.sqlite"
DEFAULT_REPORT = ROOT / "reports/semantic-demo/taxonomy-enrichment-report.json"


CLUSTER_NAMES = {
    0: "General Business",
    1: "Professional Services",
    2: "Food & Hospitality",
    3: "Construction & Trades",
    4: "Retail & Shops",
    5: "Beauty & Wellness",
    6: "Real Estate & Property",
    7: "Industrial & Logistics",
    8: "Agriculture & Ranching",
    9: "Automotive",
    10: "Healthcare & Medical",
    11: "Therapy & Counseling",
    12: "Education & Childcare",
    13: "Churches",
    14: "Faith Ministries",
    15: "Community Nonprofits",
    16: "Foundations",
    17: "Arts & Culture",
    18: "Economic Development",
    19: "Public Agencies",
    20: "Enterprise Brands",
}


GENERIC_WHAT = {
    "",
    "local business",
    "montgomery county business",
    "montgomery county business record",
}


INVALID_NAICS = {"", "unknown", "not listed", "not found", "none", "n/a", "null"}


NAICS_EXACT_LABELS = {
    "238220": (3, "Plumbing, HVAC, or electrical trade"),
    "238210": (3, "Electrical trade contractor"),
    "238160": (3, "Roofing contractor"),
    "238310": (3, "Drywall and insulation contractor"),
    "238910": (3, "Site preparation and excavation"),
    "238990": (3, "Specialty trade contractor"),
    "236115": (3, "Residential builder"),
    "236117": (3, "Residential builder"),
    "236118": (3, "Residential remodeler"),
    "237310": (3, "Road and civil construction"),
    "237110": (3, "Utility construction"),
    "321918": (7, "Wood products manufacturing"),
    "323111": (17, "Printing and signs"),
    "332710": (7, "Machine shop"),
    "333132": (7, "Oilfield machinery manufacturing"),
    "339940": (4, "Artisan or office goods retail"),
    "441110": (9, "Auto dealer"),
    "441120": (9, "Car and truck dealer"),
    "441210": (4, "Recreational vehicle dealer"),
    "443142": (4, "Electronics or wireless retail"),
    "444110": (4, "Hardware and building supply store"),
    "444190": (4, "Building materials supplier"),
    "444210": (4, "Outdoor power equipment store"),
    "445310": (4, "Liquor store"),
    "448120": (4, "Clothing store"),
    "448150": (4, "Clothing boutique"),
    "448190": (4, "Apparel and accessories retail"),
    "451110": (4, "Sporting goods or outdoor retail"),
    "453220": (4, "Gift shop"),
    "453310": (4, "Used merchandise or specialty shop"),
    "453991": (4, "Tobacco or vape shop"),
    "453998": (4, "Specialty retail shop"),
    "454110": (4, "Online retail"),
    "484110": (7, "Local trucking"),
    "484121": (7, "Freight trucking"),
    "488410": (7, "Motor vehicle support services"),
    "488510": (7, "Freight logistics"),
    "493110": (7, "Warehousing and storage"),
    "512110": (17, "Film and video production"),
    "517312": (1, "Technology or telecommunications services"),
    "522130": (1, "Financial services"),
    "523930": (1, "Investment or financial services"),
    "531110": (6, "Real estate leasing"),
    "531120": (6, "Property management"),
    "531130": (6, "Self-storage or miniwarehouse"),
    "531210": (6, "Real estate brokerage"),
    "531390": (6, "Real estate services"),
    "541110": (1, "Legal services"),
    "541211": (1, "Accounting services"),
    "541330": (1, "Engineering or surveying"),
    "541430": (1, "Design services"),
    "541511": (1, "Software or technology services"),
    "541519": (1, "IT and computer services"),
    "541611": (1, "Management consulting"),
    "541810": (1, "Advertising or marketing"),
    "541921": (17, "Photography services"),
    "541990": (1, "Professional services"),
    "551112": (1, "Corporate or holding office"),
    "561311": (1, "Employment services"),
    "561499": (1, "Business support services"),
    "561720": (3, "Janitorial and cleaning"),
    "561730": (3, "Landscaping and lawn care"),
    "561790": (3, "Property maintenance services"),
    "562111": (7, "Waste collection services"),
    "611110": (12, "Education and training"),
    "611620": (12, "Sports or recreation instruction"),
    "621111": (10, "Doctor's office"),
    "621210": (10, "Dental practice"),
    "621310": (11, "Chiropractic practice"),
    "621330": (11, "Counseling or behavioral health"),
    "621399": (10, "Healthcare specialists"),
    "624110": (12, "Child care or youth services"),
    "711510": (17, "Independent artist or creative service"),
    "711212": (17, "Racing or spectator sports venue"),
    "713940": (17, "Fitness and recreation"),
    "721110": (2, "Hotel or lodging"),
    "722330": (2, "Mobile food service"),
    "722410": (2, "Bar or drinking establishment"),
    "722511": (2, "Full-service restaurant"),
    "722513": (2, "Limited-service restaurant"),
    "722515": (2, "Snack or beverage shop"),
    "811111": (9, "Automotive repair shop"),
    "811113": (9, "Automotive transmission repair"),
    "811118": (9, "Automotive service"),
    "811192": (9, "Car wash"),
    "811310": (7, "Commercial equipment repair"),
    "312120": (2, "Craft brewery"),
    "811490": (7, "Repair and maintenance service"),
    "812112": (5, "Beauty salon"),
    "812113": (5, "Nail salon"),
    "812910": (10, "Pet care services"),
    "813110": (13, "Church or faith community"),
    "813211": (15, "Grantmaking or nonprofit organization"),
    "813410": (15, "Civic or social organization"),
    "921190": (19, "Public agency"),
}


NAICS_SECTOR_CLUSTERS = {
    "11": (8, "Agriculture and ranching"),
    "21": (7, "Energy or industrial services"),
    "22": (19, "Utility or public infrastructure"),
    "23": (3, "Construction and trades"),
    "31": (7, "Manufacturing or industrial"),
    "32": (7, "Manufacturing or industrial"),
    "33": (7, "Manufacturing or industrial"),
    "42": (4, "Wholesale or supply business"),
    "44": (4, "Retail shop"),
    "45": (4, "Retail shop"),
    "48": (7, "Transportation or logistics"),
    "49": (7, "Transportation or logistics"),
    "51": (1, "Technology or media services"),
    "52": (1, "Financial services"),
    "53": (6, "Real estate or property services"),
    "54": (1, "Professional services"),
    "55": (1, "Corporate or management office"),
    "56": (1, "Business support services"),
    "61": (12, "Education or childcare"),
    "62": (10, "Healthcare services"),
    "71": (17, "Arts, culture, or recreation"),
    "72": (2, "Food or hospitality"),
    "92": (19, "Public agency"),
}


PRIORITY_TEXT_PATTERNS: list[tuple[int, str, str]] = [
    (3, "Construction and trades", r"\b(roof|roofing|plumb|plumbing|hvac|air conditioning|heating and air|electric|electrical|custom home|home builder|builder services|drywall|dirt work)\b"),
    (7, "Industrial or technical support", r"\b(cnc|machine shop|machin|fabricat|precision|oilfield|calibration|adas|avionics|aerospace|aircraft|industrial service)\b"),
    (2, "Food or hospitality", r"\b(restaurant|cafe|coffee|grill|kitchen|bbq|pizza|food truck|catering|brewery|brewing|winery|meadery|distillery|bar|hotel|motel|rv park)\b"),
    (17, "Arts, culture, or recreation", r"\b(watersport|boat rental|lake conroe|racing venue|speedway|dance studio|photograph|video production|artist|event venue|fitness|gym|crossfit|martial arts)\b"),
    (10, "Healthcare and medical", r"\b(medical|clinic|doctor|physician|dental|dentist|internal medicine|healthcare|urgent care)\b"),
    (1, "Professional practice", r"\b(law firm|attorney|lawyer|legal|accounting|cpa|tax preparation|tax service|bookkeeping|business broker|brokerage)\b"),
]


TEXT_PATTERNS: list[tuple[int, str, str]] = [
    (3, "Construction and trades", r"\b(roof|roofing|plumb|plumbing|hvac|air conditioning|electric|electrical|construction|builder|custom home|contractor|drywall|concrete|paving|excavat|dirt work|cabinet|woodwork|fenc|remodel|foundation)\b"),
    (7, "Industrial or technical support", r"\b(cnc|machine shop|machin|fabricat|precision|industrial|oilfield|calibration|adas|avionics|aerospace|metal|welding|manufactur|equipment repair|scrap|recycling|utility company)\b"),
    (4, "Retail or specialty shop", r"\b(retail|store|shop|boutique|apparel|jewelry|gift|liquor|tobacco|vape|market|grocery|hardware|building materials|outdoor power|pen maker|custom orders|etsy)\b"),
    (2, "Food or hospitality", r"\b(restaurant|cafe|coffee|grill|kitchen|bbq|pizza|burger|taco|seafood|oyster|food truck|catering|brewery|brewing|winery|meadery|distillery|bar|hotel|motel|rv park|lodging)\b"),
    (17, "Arts, culture, or recreation", r"\b(watersport|boat rental|lake conroe|racing venue|speedway|dance studio|photograph|video production|artist|artisan|tattoo|piercing|event venue|fitness|gym|crossfit|martial arts|recreation|entertainment)\b"),
    (1, "Professional practice", r"\b(law firm|attorney|lawyer|legal|accounting|cpa|tax preparation|tax service|bookkeeping|consulting|consultant|business broker|brokerage|marketing|advertising|design agency|engineering|surveying)\b"),
    (6, "Real estate or property", r"\b(real estate|realtor|property management|leasing|apartment|condo|storage|self-storage|miniwarehouse|office suites|development llc|capital partners|holdings|investment property)\b"),
    (9, "Automotive services", r"\b(auto|automotive|car wash|mechanic|vehicle|tire|brake|collision|paint body|motors|truck service|car dealer|used cars)\b"),
    (3, "Home or property services", r"\b(cleaning|janitorial|maid|pool service|landscap|lawn|tree service|pest|home service|handyman|repair service|maintenance)\b"),
    (10, "Healthcare and medical", r"\b(medical|clinic|doctor|physician|dental|dentist|medicine|internal medicine|billing|healthcare|home health|urgent care)\b"),
    (11, "Therapy and counseling", r"\b(therapy|therapist|counseling|counselor|chiropractic|massage|behavioral health|mental health)\b"),
    (12, "Education or childcare", r"\b(daycare|child care|preschool|school|academy|learning center|tutoring|education|training)\b"),
    (13, "Churches", r"\b(church|baptist|methodist|catholic|fellowship|chapel)\b"),
    (14, "Faith ministries", r"\b(ministry|ministries|faith community|worship)\b"),
    (15, "Community nonprofit", r"\b(nonprofit|non-profit|charity|foundation|association|booster club|civic|community service|animal cancer fund)\b"),
    (1, "Technology services", r"\b(software|technology|it services|computer|network|cyber|digital services|telecom|wireless|cabling|satellite|internet services)\b"),
    (1, "Financial services", r"\b(financial|finance|insurance|bank|credit union|wealth|investment advisor|loans|mortgage)\b"),
    (19, "Public agency", r"\b(city department|government|public agency|municipal|economic development corporation)\b"),
]


THIN_RECORD_PATTERNS = re.compile(
    r"\b(registry-only|holding-style|pending research|no high-confidence match|"
    r"business type unclear|no verified public|no operating business presence|"
    r"no active business presence|no reliable public business contact)\b",
    re.I,
)


def clean_optional(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def clean_naics(value: object) -> str:
    text = clean_optional(value).lower()
    return "" if text in INVALID_NAICS else re.sub(r"\D", "", text)


def first_sentence(text: str, fallback: str) -> str:
    text = re.sub(r"\s+", " ", text).strip(" -")
    if not text:
        return fallback
    sentence = re.split(r"(?<=[.!?])\s+", text, maxsplit=1)[0].strip(" -")
    if len(sentence) > 72:
        sentence = sentence[:69].rstrip() + "..."
    return sentence or fallback


def extract_snapshot_sections(text: str) -> str:
    if not text:
        return ""
    sections: list[str] = []
    for match in re.finditer(r"## Snapshot\s+(.*?)(?=\n##|\Z)", text, flags=re.S | re.I):
        snapshot = match.group(1)
        snapshot = re.sub(r"^\s*-\s*", "", snapshot, flags=re.M)
        lines = [line.strip(" -*\t") for line in snapshot.splitlines() if line.strip(" -*\t")]
        useful = [
            line for line in lines[:4]
            if not re.search(r"\b(pending research|no high-confidence match)\b", line, flags=re.I)
        ]
        if useful:
            sections.append(" ".join(useful))
    return " ".join(sections)


def fetch_evidence(conn: sqlite3.Connection, lead_ids: Iterable[int]) -> dict[int, dict[str, str]]:
    ids = list({int(lead_id) for lead_id in lead_ids})
    if not ids:
        return {}
    placeholders = ",".join("?" for _ in ids)
    query = f"""
        WITH facts AS (
            SELECT
                lead_id,
                MAX(CASE WHEN fact_type = 'naics' THEN fact_value END) AS naics_fact
            FROM leadops_business_facts
            GROUP BY lead_id
        ),
        docs AS (
            SELECT
                lead_id,
                group_concat(body_text, ' ') AS profile_text
            FROM leadops_search_documents
            WHERE doc_type = 'profile_markdown'
            GROUP BY lead_id
        )
        SELECT
            l.lead_id,
            l.name,
            COALESCE(f.naics_fact, p.naics) AS naics,
            p.business_overview,
            p.service_offerings,
            p.target_customers,
            p.differentiators,
            p.snapshot,
            p.observations,
            docs.profile_text
        FROM leadops_leads l
        LEFT JOIN leadops_profiles p ON p.lead_id = l.lead_id
        LEFT JOIN facts f ON f.lead_id = l.lead_id
        LEFT JOIN docs ON docs.lead_id = l.lead_id
        WHERE l.lead_id IN ({placeholders})
    """
    rows = conn.execute(query, ids).fetchall()
    evidence: dict[int, dict[str, str]] = {}
    for row in rows:
        item = {key: clean_optional(row[key]) for key in row.keys()}
        item["profile_text"] = extract_snapshot_sections(item.get("profile_text", ""))
        evidence[int(row["lead_id"])] = item
    return evidence


def classify_from_naics(naics: str) -> tuple[int, str, str] | None:
    code = clean_naics(naics)
    if not code:
        return None
    if code in NAICS_EXACT_LABELS:
        cluster, label = NAICS_EXACT_LABELS[code]
        return cluster, label, f"naics:{code}"
    if len(code) >= 2 and code[:2] in NAICS_SECTOR_CLUSTERS:
        cluster, label = NAICS_SECTOR_CLUSTERS[code[:2]]
        return cluster, label, f"naics-sector:{code[:2]}"
    return None


def classify_from_text(text: str) -> tuple[int, str, str] | None:
    if not text.strip():
        return None
    for cluster, label, pattern in TEXT_PATTERNS:
        if re.search(pattern, text, flags=re.I):
            return cluster, label, f"text:{label}"
    return None


def classify_from_priority_text(text: str) -> tuple[int, str, str] | None:
    if not text.strip():
        return None
    for cluster, label, pattern in PRIORITY_TEXT_PATTERNS:
        if re.search(pattern, text, flags=re.I):
            return cluster, label, f"text-priority:{label}"
    return None


def classify_record(row: list[object], evidence: dict[str, str]) -> tuple[int, str, str] | None:
    original_cluster = int(row[3])
    if original_cluster != 0:
        return None

    name = clean_optional(row[4]) or evidence.get("name", "")
    what = clean_optional(row[5])
    fields = [
        name,
        what if what.lower() not in GENERIC_WHAT else "",
        evidence.get("business_overview", ""),
        evidence.get("service_offerings", ""),
        evidence.get("target_customers", ""),
        evidence.get("differentiators", ""),
        evidence.get("snapshot", ""),
        evidence.get("profile_text", ""),
    ]
    text = " ".join(field for field in fields if field).lower()

    thin_record = THIN_RECORD_PATTERNS.search(text)
    if thin_record and not clean_naics(evidence.get("naics", "")):
        return 0, "Registry or thin business record", "thin-record"

    priority_text_result = classify_from_priority_text(text)
    if priority_text_result:
        return priority_text_result

    naics_result = classify_from_naics(evidence.get("naics", ""))
    if naics_result:
        return naics_result

    text_result = classify_from_text(text)
    if text_result:
        return text_result

    if thin_record:
        return 0, "Registry or thin business record", "thin-record"

    return None


def enrich_rows(rows: list[list[object]], evidence: dict[int, dict[str, str]]) -> tuple[list[list[object]], dict]:
    before_counts = Counter(int(row[3]) for row in rows)
    before_what_cluster0 = Counter(clean_optional(row[5]) for row in rows if int(row[3]) == 0)
    after_rows: list[list[object]] = []
    moves: list[dict[str, object]] = []
    reasons = Counter()
    changed_what = 0

    for row in rows:
        next_row = list(row)
        lead_id = int(next_row[7])
        result = classify_record(next_row, evidence.get(lead_id, {}))
        if result:
            new_cluster, label, reason = result
            old_cluster = int(next_row[3])
            old_what = clean_optional(next_row[5])
            if new_cluster != old_cluster:
                next_row[3] = new_cluster
                moves.append({
                    "lead_id": lead_id,
                    "name": clean_optional(next_row[4]),
                    "from": CLUSTER_NAMES.get(old_cluster, str(old_cluster)),
                    "to": CLUSTER_NAMES.get(new_cluster, str(new_cluster)),
                    "what_before": old_what,
                    "what_after": label,
                    "reason": reason,
                })
            if old_what.lower() in GENERIC_WHAT or old_what != label and old_cluster == 0:
                next_row[5] = label
                changed_what += 1
            reasons[reason] += 1
        after_rows.append(next_row)

    after_counts = Counter(int(row[3]) for row in after_rows)
    after_what_cluster0 = Counter(clean_optional(row[5]) for row in after_rows if int(row[3]) == 0)

    report = {
        "total_rows": len(rows),
        "moves": len(moves),
        "changed_what": changed_what,
        "before_counts": {CLUSTER_NAMES.get(k, str(k)): v for k, v in sorted(before_counts.items())},
        "after_counts": {CLUSTER_NAMES.get(k, str(k)): v for k, v in sorted(after_counts.items())},
        "before_general_business": before_counts.get(0, 0),
        "after_general_business": after_counts.get(0, 0),
        "general_business_reduction": before_counts.get(0, 0) - after_counts.get(0, 0),
        "reason_counts": dict(reasons.most_common()),
        "cluster0_what_before_top": dict(before_what_cluster0.most_common(25)),
        "cluster0_what_after_top": dict(after_what_cluster0.most_common(25)),
        "move_examples": moves[:80],
    }
    return after_rows, report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--crm", type=Path, default=DEFAULT_CRM)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--write", action="store_true", help="Overwrite --input unless --output is provided.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    rows = json.loads(args.input.read_text(encoding="utf-8-sig"))
    lead_ids = [int(row[7]) for row in rows if len(row) > 7 and row[7] is not None]

    conn = sqlite3.connect(args.crm)
    conn.row_factory = sqlite3.Row
    try:
        evidence = fetch_evidence(conn, lead_ids)
    finally:
        conn.close()

    enriched_rows, report = enrich_rows(rows, evidence)

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")

    output_path = args.output
    if args.write and output_path is None:
        output_path = args.input
    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(enriched_rows, separators=(",", ":")), encoding="utf-8")

    print(json.dumps({
        "input": str(args.input),
        "output": str(output_path) if output_path else None,
        "report": str(args.report),
        "total_rows": report["total_rows"],
        "moves": report["moves"],
        "changed_what": report["changed_what"],
        "before_general_business": report["before_general_business"],
        "after_general_business": report["after_general_business"],
        "general_business_reduction": report["general_business_reduction"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
