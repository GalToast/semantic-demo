#!/usr/bin/env python3
"""
extract-crm-sqlite.py

Pulls the canonical leadops tables from ../crm.sqlite and writes JSON files
that scripts/extract-lead-enrichment.mjs consumes:

    scripts/leadopsLeads.json         8,406 records
    scripts/leadopsProfiles.json      8,406 records (32 fields)
    scripts/leadopsContacts.json      7,632 records
    scripts/leadopsBusinessFacts.json 82,067 records

The leadops_profiles table is the canonical pre-parsed structured data —
no more regex on profile.md. Run this whenever crm.sqlite changes.
"""

import json
import sqlite3
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
PARENT_DIR = REPO_ROOT.parent
CRM_SQLITE = PARENT_DIR / 'crm.sqlite'
OUTPUT_DIR = REPO_ROOT / 'scripts'

LEADOPS_PUBLIC_FIELDS = {
    # From leadops_leads
    'name', 'email', 'phone', 'website', 'contact_form', 'social_media',
    'source', 'naics', 'address', 'city', 'state', 'zip',
    'email_domain', 'website_domain', 'website_status', 'updated',
    'social_checked',
    # From leadops_profiles (pre-parsed structured content)
    'snapshot', 'observations', 'evidence', 'decision_maker',
    'business_overview', 'contact_decision_makers', 'online_presence',
    'market_position', 'website_presence', 'audit_highlights',
    'security_trust', 'ux_conversion', 'performance_tech',
    'google_business_profile', 'social_presence', 'sources',
    'contact_information', 'service_offerings', 'target_customers',
    'differentiators', 'website_audit', 'distance_miles'
}

LEADOPS_INTERNAL_FIELDS = {
    'status', 'outreach_status', 'contact_path', 'contact_search',
    'disqualified', 'batch',
    'outreach_angle', 'next_steps', 'outreach_log_md', 'opportunity_assessment',
    'disqualification_rationale', 'lead_metadata', 'last_updated',
    'manual_extract_artifact', 'manual_extract_status', 'manual_extract_at'
}


def clean(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    s = str(value).strip()
    return s if s else None


def query_table(cur, table, columns, where_lead_id=True):
    """Fetch rows from a table, return list of dicts keyed by lead_id when applicable."""
    col_list = ', '.join(f'"{c}"' for c in columns)
    cur.execute(f'SELECT {col_list} FROM {table}')
    rows = cur.fetchall()
    result = []
    for row in rows:
        record = {}
        for col, val in zip(columns, row):
            record[col] = clean(val)
        result.append(record)
    return result


def main():
    if not CRM_SQLITE.exists():
        raise SystemExit(f'Missing {CRM_SQLITE}')

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(f'file:{CRM_SQLITE}?mode=ro', uri=True)
    cur = conn.cursor()

    # leadops_leads (one row per lead, primary structured fields)
    cur.execute('SELECT name FROM pragma_table_info("leadops_leads")')
    lead_columns = [row[0] for row in cur.fetchall()]
    lead_col_list = ', '.join(f'"{c}"' for c in lead_columns)
    cur.execute(f'SELECT {lead_col_list} FROM leadops_leads')
    leads_by_id = {}
    for row in cur.fetchall():
        rec = {col: clean(val) for col, val in zip(lead_columns, row)}
        lead_id = rec.get('lead_id')
        if lead_id is not None:
            leads_by_id[str(lead_id)] = rec
    print(f'  leadops_leads: {len(leads_by_id)} records ({len(lead_columns)} columns)')

    # leadops_profiles (one row per lead, 25+ pre-parsed structured fields).
    # Drop the heavy internal/redundant fields: raw_markdown, kv_json,
    # sections_json (already parsed into the other columns),
    # outreach_log_md, outreach_section, opportunity_assessment,
    # disqualification_rationale, lead_metadata — all internal.
    cur.execute('SELECT name FROM pragma_table_info("leadops_profiles")')
    profile_columns = [row[0] for row in cur.fetchall()]
    PROFILE_PUBLIC_COLS = [c for c in profile_columns if c in {
        'lead_id', 'title', 'address', 'naics', 'distance_miles',
        'decision_maker', 'last_updated',
        'snapshot', 'observations', 'evidence',
        'business_overview', 'contact_decision_makers', 'online_presence',
        'market_position', 'website_presence', 'audit_highlights',
        'security_trust', 'ux_conversion', 'performance_tech',
        'google_business_profile', 'social_presence', 'sources',
        'contact_information', 'service_offerings', 'target_customers',
        'differentiators', 'website_audit'
    }]
    PROFILE_INTERNAL_COLS = [c for c in profile_columns if c in {
        'outreach_angle', 'next_steps', 'outreach_log_md',
        'opportunity_assessment', 'disqualification_rationale',
        'lead_metadata', 'outreach_section',
        'raw_markdown', 'kv_json', 'sections_json',
        'manual_extract_artifact', 'manual_extract_status', 'manual_extract_at'
    }]
    public_profiles = {}
    internal_profiles = {}
    public_col_list = ', '.join(f'"{c}"' for c in PROFILE_PUBLIC_COLS)
    cur.execute(f'SELECT {public_col_list} FROM leadops_profiles')
    for row in cur.fetchall():
        rec = {col: clean(val) for col, val in zip(PROFILE_PUBLIC_COLS, row)}
        lead_id = rec.get('lead_id')
        if lead_id is not None:
            public_profiles[str(lead_id)] = rec
    internal_col_list = ', '.join(f'"{c}"' for c in PROFILE_INTERNAL_COLS)
    cur.execute(f'SELECT lead_id, {internal_col_list} FROM leadops_profiles')
    for row in cur.fetchall():
        lead_id = row[0]
        if lead_id is None:
            continue
        rec = {col: clean(val) for col, val in zip(PROFILE_INTERNAL_COLS, row[1:])}
        internal_profiles.setdefault(str(lead_id), {}).update(rec)
    print(f'  leadops_profiles: {len(public_profiles)} records (public cols: {len(PROFILE_PUBLIC_COLS)}, internal cols: {len(PROFILE_INTERNAL_COLS)})')

    # leadops_contacts (multiple per lead)
    cur.execute('SELECT lead_id, contact_type, value, normalized_value, label, is_primary, source FROM leadops_contacts')
    contacts_by_id = {}
    for row in cur.fetchall():
        lead_id, ctype, val, norm, label, is_primary, src = row
        if lead_id is None or val is None:
            continue
        key = str(lead_id)
        contacts_by_id.setdefault(key, []).append({
            'contact_type': ctype,
            'value': clean(val),
            'normalized_value': clean(norm),
            'label': clean(label),
            'is_primary': bool(is_primary),
            'source': clean(src)
        })
    print(f'  leadops_contacts: {sum(len(v) for v in contacts_by_id.values())} entries for {len(contacts_by_id)} leads')

    # leadops_business_facts (many per lead)
    cur.execute('SELECT lead_id, fact_type, fact_value, source_kind, source_file, confidence, verified_at FROM leadops_business_facts')
    facts_by_id = {}
    for row in cur.fetchall():
        lead_id, ftype, fval, src_kind, src_file, conf, verified = row
        if lead_id is None or ftype is None:
            continue
        key = str(lead_id)
        facts_by_id.setdefault(key, []).append({
            'fact_type': ftype,
            'fact_value': clean(fval),
            'source_kind': clean(src_kind),
            'source_file': clean(src_file),
            'confidence': clean(conf),
            'verified_at': clean(verified)
        })
    print(f'  leadops_business_facts: {sum(len(v) for v in facts_by_id.values())} facts for {len(facts_by_id)} leads')

    # Write JSON files
    (OUTPUT_DIR / 'leadopsLeads.json').write_text(
        json.dumps(leads_by_id, ensure_ascii=False), encoding='utf-8')
    (OUTPUT_DIR / 'leadopsProfiles.public.json').write_text(
        json.dumps(public_profiles, ensure_ascii=False), encoding='utf-8')
    (OUTPUT_DIR / 'leadopsProfiles.internal.json').write_text(
        json.dumps(internal_profiles, ensure_ascii=False), encoding='utf-8')
    (OUTPUT_DIR / 'leadopsContacts.json').write_text(
        json.dumps(contacts_by_id, ensure_ascii=False), encoding='utf-8')
    (OUTPUT_DIR / 'leadopsBusinessFacts.json').write_text(
        json.dumps(facts_by_id, ensure_ascii=False), encoding='utf-8')

    print(f'\nWrote:')
    for fname in ['leadopsLeads.json', 'leadopsProfiles.public.json', 'leadopsProfiles.internal.json',
                  'leadopsContacts.json', 'leadopsBusinessFacts.json']:
        path = OUTPUT_DIR / fname
        if path.exists():
            size = path.stat().st_size
            print(f'  scripts/{fname:36s} {size/1024:8.1f} KB')

    conn.close()


if __name__ == '__main__':
    main()
