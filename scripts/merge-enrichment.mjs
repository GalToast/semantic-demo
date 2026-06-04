/**
 * merge-enrichment.mjs
 *
 * Final enrichment merger. Combines all sources and emits two JSON files:
 *
 *   scripts/leadEnrichment.public.json   — fields safe to ship to the live demo
 *   scripts/leadEnrichment.internal.json — fields kept in the repo only
 *
 * Sources (in priority order — higher wins on conflict):
 *
 *   1. ../crm.sqlite (via scripts/extract-crm-sqlite.py)
 *      - leadops_leads: 8,406 records × 26 columns (status, outreach, contact)
 *      - leadops_profiles: 8,406 records × 27 public columns + 10 internal
 *        (pre-parsed structured content: business_overview, security_trust,
 *         ux_conversion, audit_highlights, online_presence, etc.)
 *      - leadops_contacts: 7,632 normalized contact entries
 *      - leadops_business_facts: 82,067 structured fact triples
 *      CANONICAL source. Profile.md was derived from this; index.csv was
 *      an export; the parent corpus JSONL was a re-derivation.
 *
 *   2. ask_moco_corpus.from-leadops.jsonl (parent pipeline's polished corpus)
 *      - 8,406 records, 19 fields
 *      - Adds search_text (the embedded text), has_* booleans, data_grade
 *      - business_overview here is more polished than crm.sqlite's
 *
 *   3. leads/deep_audit_master.json + leads/available_diamonds.json
 *      - 116 records, website audit data
 *
 *   4. leads/profiles under each range dir, profile.md inside the lead folder (fallback)
 *      - Custom sections: lead quality stars, property_llc, chain_multi_location
 *
 *   5. leads/profiles under each lead folder's evidence subdir (technical audits)
 *      - 710+ records, Lighthouse + security headers + email auth + TLS
 *
 * Per user direction (2026-06-04): Status (qualified/disqualified) is
 * internal pipeline state and MUST NOT ship to the public demo. Same for
 * outreach_status, contact_path, batch, opportunity_assessment, etc.
 * The parent's `status` field in the corpus is "active"/"inactive"
 * (operational), not "qualified"/"disqualified" (pipeline) — those are
 * different status concepts and the operational one IS public.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const PARENT_DIR = path.resolve(REPO_ROOT, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'scripts');

const CORPUS_JSONL = path.join(
    PARENT_DIR, 'tmp', 'public-semantic-search-build',
    'ask_moco_corpus.from-leadops.jsonl'
);
const INDEX_CSV = path.join(PARENT_DIR, 'leads', 'index.csv');
const DEEP_AUDIT_MASTER = path.join(PARENT_DIR, 'leads', 'deep_audit_master.json');
const AVAILABLE_DIAMONDS = path.join(PARENT_DIR, 'leads', 'available_diamonds.json');
const LEADS_PROFILES_DIR = path.join(PARENT_DIR, 'leads', 'profiles');

// crm.sqlite extracts (produced by scripts/extract-crm-sqlite.py)
const LEADOPS_LEADS_JSON = path.join(OUTPUT_DIR, 'leadopsLeads.json');
const LEADOPS_PROFILES_PUBLIC_JSON = path.join(OUTPUT_DIR, 'leadopsProfiles.public.json');
const LEADOPS_PROFILES_INTERNAL_JSON = path.join(OUTPUT_DIR, 'leadopsProfiles.internal.json');
const LEADOPS_CONTACTS_JSON = path.join(OUTPUT_DIR, 'leadopsContacts.json');
const LEADOPS_FACTS_JSON = path.join(OUTPUT_DIR, 'leadopsBusinessFacts.json');

const UNKNOWN_VALUES = new Set([
    'unknown', 'n/a', 'na', 'none', 'none detected',
    'not started', 'not found', 'not applicable', ''
]);

function cleanValue(value) {
    if (value == null) return null;
    if (typeof value === 'boolean') return value ? value : null;
    const trimmed = String(value).trim();
    if (trimmed === '') return null;
    if (UNKNOWN_VALUES.has(trimmed.toLowerCase())) return null;
    return trimmed;
}

function cleanOptional(value) {
    if (value === true || value === false) return value;
    return cleanValue(value);
}

function loadJson(path) {
    if (!fs.existsSync(path)) {
        console.error(`  MISSING: ${path}`);
        return {};
    }
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function loadCorpus() {
    if (!fs.existsSync(CORPUS_JSONL)) return {};
    const records = {};
    const text = fs.readFileSync(CORPUS_JSONL, 'utf8');
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const d = JSON.parse(line);
        records[String(d.lead_id)] = d;
    }
    return records;
}

/**
 * Minimal RFC-4180 CSV parser.
 */
function parseCsv(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false, i = 0;
    while (i < text.length) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
                inQuotes = false; i++; continue;
            }
            field += c; i++; continue;
        }
        if (c === '"') { inQuotes = true; i++; continue; }
        if (c === ',') { row.push(field); field = ''; i++; continue; }
        if (c === '\n' || c === '\r') {
            row.push(field); field = '';
            if (row.length > 1 || row[0] !== '') rows.push(row);
            row = [];
            if (c === '\r' && text[i + 1] === '\n') i += 2; else i++;
            continue;
        }
        field += c; i++;
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        if (row.length > 1 || row[0] !== '') rows.push(row);
    }
    return rows;
}

const SECTION_FIELDS = new Map([
    ['Snapshot', 'snapshot'],
    ['Observations', 'observations'],
    ['Outreach angle', 'outreach_angle'],
    ['Next steps', 'next_steps'],
    ['Evidence', 'evidence'],
    ['Notes', 'notes'],
    ['Business overview', 'business_overview_extended'],
    ['Business information', 'business_overview_extended'],
    ['Business details', 'business_overview_extended'],
    ['Business identity', 'business_overview_extended'],
    ['Business summary', 'business_summary'],
    ['Contact + decision makers', 'contact_extended'],
    ['Contact information', 'contact_extended'],
    ['Online presence', 'online_presence_notes'],
    ['Social presence', 'social_presence'],
    ['Website presence', 'website_presence'],
    ['Market position', 'market_position'],
    ['Key findings', 'key_findings'],
    ['Research notes', 'research_notes'],
    ['Verification notes', 'verification_notes'],
    ['Website audit (manual)', 'manual_audit'],
    ['Location', 'location_notes'],
    ['Classification', 'classification'],
    ['Audit highlights (ordered)', 'audit_highlights'],
    ['Security and trust', 'security_and_trust'],
    ['UX and conversion', 'ux_and_conversion'],
    ['Research date', 'research_date'],
    ['Sources', 'sources'],
    ['Outreach log', 'outreach_log'],
    ['Opportunity assessment (including partnerships)', 'opportunity_assessment'],
    ['Disqualification reason', 'disqualification_reason'],
    ['Disqualification note', 'disqualification_note'],
    ['Disqualification', 'disqualification_text'],
    ['Exclusion reason', 'exclusion_reason'],
    ['Evidence links', 'evidence_links'],
    ['Updates', 'updates_log'],
    ['Lead quality: ⭐', 'lead_quality'],
    ['Lead quality: ⭐⭐', 'lead_quality'],
    ['Lead quality: ⭐⭐⭐', 'lead_quality'],
    ['Lead quality: ⭐⭐⭐⭐', 'lead_quality'],
    ['Property LLC?', 'property_llc'],
    ['Chain with >3 locations?', 'chain_multi_location']
]);

function parseProfile(markdown) {
    const record = {};
    const lines = markdown.split(/\r?\n/);
    const sectionByLower = new Map();
    for (const [heading, dest] of SECTION_FIELDS) {
        sectionByLower.set(heading.toLowerCase(), dest);
    }

    for (const line of lines) {
        if (line.startsWith('## ')) break;
        const m = line.match(/^([A-Z][A-Za-z0-9 ()\/]+?):\s*(.*)$/);
        if (!m) continue;
        const key = m[1].trim().toLowerCase();
        const normalized =
            key === 'address' ? 'address' :
            key === 'naics' ? 'naics' :
            key === 'phone' ? 'phone' :
            key === 'email' ? 'email' :
            key === 'alt email' ? 'alt_email' :
            key === 'website' ? 'website' :
            key === 'alt website' ? 'alt_website' :
            key === 'contact form' ? 'contact_form' :
            key === 'social media' ? 'social_media' :
            key === 'source' ? 'source' :
            key === 'decision maker' ? 'decision_maker' :
            key === 'distance (zip centroid)' ? 'distance' :
            key === 'legacy id' ? 'legacy_id' :
            key === 'operating activity' ? 'operating_activity' :
            key === 'updated' ? 'updated_alt' :
            null;
        if (!normalized) continue;
        const value = cleanValue(m[2]);
        if (value != null) record[normalized] = value;
    }

    let currentSectionKey = null;
    let currentSectionBuffer = [];
    const flush = () => {
        if (currentSectionKey == null) return;
        const text = currentSectionBuffer.join('\n').trim();
        if (text) {
            const cleaned = text.split('\n')
                .map((l) => l.replace(/^[\s>*\-]+/, '').trim())
                .filter(Boolean)
                .join('\n');
            if (cleaned && !UNKNOWN_VALUES.has(cleaned.toLowerCase())) {
                record[currentSectionKey] = cleaned;
            }
        }
        currentSectionKey = null;
        currentSectionBuffer = [];
    };
    for (const line of lines) {
        const m = line.match(/^##\s+(.+?)\s*$/);
        if (m) {
            flush();
            const heading = m[1].trim();
            const lower = heading.toLowerCase();
            if (lower.startsWith('lead quality')) {
                const stars = (heading.match(/⭐/g) || []).length;
                if (stars >= 1) record.lead_quality = stars;
                currentSectionKey = null;
                currentSectionBuffer = [];
                continue;
            }
            const dest = sectionByLower.get(lower);
            if (dest) {
                currentSectionKey = dest;
                currentSectionBuffer = [];
            }
            continue;
        }
        if (currentSectionKey != null) currentSectionBuffer.push(line);
    }
    flush();
    return record;
}

function loadIndexCsv() {
    if (!fs.existsSync(INDEX_CSV)) return { records: {}, col: {} };
    const text = fs.readFileSync(INDEX_CSV, 'utf8');
    const rows = parseCsv(text);
    const header = rows[0];
    const col = {};
    for (let i = 0; i < header.length; i++) col[header[i]] = i;
    const records = {};
    const groupsByLead = new Map();
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const id = r[col.LeadID];
        if (!id) continue;
        if (!groupsByLead.has(id)) groupsByLead.set(id, []);
        groupsByLead.get(id).push(r);
    }
    function canonicalScore(r) {
        const s = (r[col.Status] || '').trim().toLowerCase();
        if (s === 'fail' || s === 'invalid' || s === 'pending') return 0;
        let sc = 1;
        if (r[col.Email]) sc += 2;
        if (r[col.Phone]) sc += 2;
        if (r[col.Website]) sc += 1;
        if (r[col.Source]) sc += 3;
        if (r[col.Disqualified]) sc += 1;
        return sc;
    }
    for (const [id, group] of groupsByLead) {
        group.sort((a, b) => canonicalScore(b) - canonicalScore(a));
        records[id] = group[0];
    }
    return { records, col };
}

function loadDeepAudit() {
    const result = {};
    if (fs.existsSync(DEEP_AUDIT_MASTER)) {
        const arr = JSON.parse(fs.readFileSync(DEEP_AUDIT_MASTER, 'utf8'));
        for (const r of arr) {
            if (!r.LeadID) continue;
            result[String(r.LeadID)] = {
                audit_confirmed_issue: cleanValue(r.ConfirmedIssue),
                audit_notes: cleanValue(r.Notes),
                has_contact_form_audit: r.HasContactForm === true ? true :
                    (r.HasContactForm === false ? false : null),
                has_email_on_site: r.HasEmailOnSite === true ? true :
                    (r.HasEmailOnSite === false ? false : null),
                has_phone_on_site: typeof r.HasPhoneOnSite === 'string' ? cleanValue(r.HasPhoneOnSite) :
                    (r.HasPhoneOnSite === true ? true :
                    (r.HasPhoneOnSite === false ? false : null))
            };
        }
    }
    if (fs.existsSync(AVAILABLE_DIAMONDS)) {
        const arr = JSON.parse(fs.readFileSync(AVAILABLE_DIAMONDS, 'utf8'));
        for (const r of arr) {
            if (!r.LeadID) continue;
            const id = String(r.LeadID);
            const existing = result[id] || {};
            const issueVal = cleanValue(r.Issue);
            const statusVal = r.StatusCode != null ? String(r.StatusCode) : null;
            if (issueVal != null || statusVal != null) {
                result[id] = { ...existing, audit_original_issue: issueVal, audit_status_code: statusVal };
            } else if (!result[id]) {
                result[id] = existing;
            }
        }
    }
    return result;
}

function loadEvidence() {
    const result = {};
    if (!fs.existsSync(LEADS_PROFILES_DIR)) return result;
    let parsed = 0, errors = 0;
    for (const rangeDir of fs.readdirSync(LEADS_PROFILES_DIR)) {
        const rangePath = path.join(LEADS_PROFILES_DIR, rangeDir);
        if (!fs.statSync(rangePath).isDirectory()) continue;
        for (const leadDir of fs.readdirSync(rangePath)) {
            const leadPath = path.join(rangePath, leadDir);
            if (!fs.statSync(leadPath).isDirectory()) continue;
            const m = leadDir.match(/^(\d+)-/);
            if (!m) continue;
            const leadId = String(parseInt(m[1], 10));
            const evidencePath = path.join(leadPath, 'evidence');
            if (!fs.existsSync(evidencePath)) continue;
            const evidence = {};
            const secPath = path.join(evidencePath, 'security-headers-summary.txt');
            if (fs.existsSync(secPath)) {
                try {
                    const text = fs.readFileSync(secPath, 'utf8').replace(/^﻿/, '');
                    const missing = new Set();
                    for (const line of text.split('\n')) {
                        const m = line.match(/^MISSING:\s*(.+)/i);
                        if (m) missing.add(m[1].trim().toLowerCase());
                    }
                    const allHeaders = [
                        'strict-transport-security', 'content-security-policy',
                        'x-frame-options', 'x-content-type-options',
                        'referrer-policy', 'permissions-policy'
                    ];
                    for (const h of allHeaders) {
                        if (h === 'strict-transport-security') evidence.has_hsts = !missing.has(h);
                        else if (h === 'content-security-policy') evidence.has_csp = !missing.has(h);
                        else if (h === 'x-frame-options') evidence.has_x_frame_options = !missing.has(h);
                        else if (h === 'x-content-type-options') evidence.has_x_content_type_options = !missing.has(h);
                        else if (h === 'referrer-policy') evidence.has_referrer_policy = !missing.has(h);
                        else if (h === 'permissions-policy') evidence.has_permissions_policy = !missing.has(h);
                    }
                } catch (e) { errors++; }
            }
            const emailPath = path.join(evidencePath, 'email-auth.txt');
            if (fs.existsSync(emailPath)) {
                try {
                    const text = fs.readFileSync(emailPath, 'utf8').replace(/^﻿/, '');
                    evidence.has_spf = /^SPF:\s*\S/m.test(text);
                    evidence.has_dmarc = /^DMARC:\s*\S/m.test(text);
                } catch (e) { errors++; }
            }
            const tlsPath = path.join(evidencePath, 'tls-cert.json');
            if (fs.existsSync(tlsPath)) {
                try {
                    const text = fs.readFileSync(tlsPath, 'utf8').replace(/^﻿/, '');
                    if (text.includes('TLS_CERT_ERROR') || text.includes('Exception')) {
                        evidence.tls_status = 'error';
                    } else if (text.trim().startsWith('{')) {
                        try {
                            const d = JSON.parse(text);
                            evidence.tls_status = d.status || (d.error ? 'error' : 'ok');
                        } catch { evidence.tls_status = 'present'; }
                    } else {
                        evidence.tls_status = 'present';
                    }
                } catch (e) { errors++; }
            }
            const lhPath = path.join(evidencePath, 'lighthouse-mobile.json');
            if (fs.existsSync(lhPath)) {
                try {
                    const d = JSON.parse(fs.readFileSync(lhPath, 'utf8'));
                    const cats = d.categories || {};
                    const audits = d.audits || {};
                    const scorePct = (s) => (typeof s === 'number' ? Math.round(s * 100) : null);
                    if (cats.performance) evidence.lighthouse_performance = scorePct(cats.performance.score);
                    if (cats.accessibility) evidence.lighthouse_accessibility = scorePct(cats.accessibility.score);
                    if (cats['best-practices']) evidence.lighthouse_best_practices = scorePct(cats['best-practices'].score);
                    if (cats.seo) evidence.lighthouse_seo = scorePct(cats.seo.score);
                    const fmtMs = (s) => (typeof s === 'number' ? Math.round(s) : null);
                    if (audits['largest-contentful-paint']) evidence.lighthouse_lcp = fmtMs(audits['largest-contentful-paint'].numericValue);
                    if (audits['first-contentful-paint']) evidence.lighthouse_fcp = fmtMs(audits['first-contentful-paint'].numericValue);
                    if (audits['cumulative-layout-shift']) evidence.lighthouse_cls = audits['cumulative-layout-shift'].numericValue?.toFixed?.(3) ?? null;
                } catch (e) { errors++; }
            }
            if (Object.keys(evidence).length > 0) {
                result[leadId] = evidence;
                parsed++;
            }
        }
    }
    if (errors > 0) console.log(`  evidence/ parsed: ${parsed} leads (errors: ${errors})`);
    else console.log(`  evidence/ parsed: ${parsed} leads`);
    return result;
}

const PUBLIC_FIELDS = new Set([
    'name', 'operational_status', 'city', 'address', 'naics',
    'website', 'email', 'phone',
    'business_overview', 'service_offerings', 'target_customers',
    'differentiators',
    'has_website', 'has_email', 'has_phone', 'data_grade', 'search_text',
    'source', 'contact_form', 'social_media', 'decision_maker',
    'snapshot', 'observations', 'evidence',
    'business_overview_extended', 'business_summary', 'contact_extended',
    'online_presence_notes', 'social_presence', 'website_presence',
    'market_position', 'key_findings',
    'research_notes', 'verification_notes', 'manual_audit',
    'location_notes', 'classification',
    'audit_highlights', 'security_and_trust', 'ux_and_conversion',
    'research_date', 'sources',
    'lead_quality', 'property_llc', 'chain_multi_location',
    'audit_confirmed_issue', 'audit_notes', 'audit_original_issue',
    'audit_status_code', 'has_contact_form_audit',
    'has_email_on_site', 'has_phone_on_site',
    'has_hsts', 'has_csp', 'has_x_frame_options', 'has_x_content_type_options',
    'has_referrer_policy', 'has_permissions_policy',
    'has_spf', 'has_dmarc',
    'tls_status', 'lighthouse_performance', 'lighthouse_accessibility',
    'lighthouse_best_practices', 'lighthouse_seo',
    'lighthouse_lcp', 'lighthouse_fcp', 'lighthouse_cls',
    // crm.sqlite leadops_profiles fields (pre-parsed)
    'contact_decision_makers', 'performance_tech',
    'google_business_profile', 'contact_information',
    'website_audit', 'distance_miles'
]);

const INTERNAL_FIELDS = new Set([
    'qualification_status', 'outreach_status', 'contact_path',
    'contact_search', 'social_checked', 'disqualified',
    'batch', 'updated',
    'outreach_angle', 'next_steps',
    'outreach_log', 'opportunity_assessment', 'disqualification_reason',
    'disqualification_note', 'disqualification_text', 'exclusion_reason',
    'evidence_links', 'updates_log',
    // crm.sqlite internal fields
    'outreach_log_md', 'disqualification_rationale', 'lead_metadata',
    'outreach_section', 'raw_markdown', 'kv_json', 'sections_json'
]);

function main() {
    console.log('=== Loading sources ===');

    // crm.sqlite extracts (canonical source)
    console.log('crm.sqlite extracts:');
    const crmLeads = loadJson(LEADOPS_LEADS_JSON);
    console.log(`  leadopsLeads: ${Object.keys(crmLeads).length} records`);
    const crmProfilesPublic = loadJson(LEADOPS_PROFILES_PUBLIC_JSON);
    console.log(`  leadopsProfiles.public: ${Object.keys(crmProfilesPublic).length} records`);
    const crmProfilesInternal = loadJson(LEADOPS_PROFILES_INTERNAL_JSON);
    console.log(`  leadopsProfiles.internal: ${Object.keys(crmProfilesInternal).length} records (never shipped)`);
    const crmContacts = loadJson(LEADOPS_CONTACTS_JSON);
    console.log(`  leadopsContacts: ${Object.keys(crmContacts).length} leads`);
    const crmFacts = loadJson(LEADOPS_FACTS_JSON);
    console.log(`  leadopsBusinessFacts: ${Object.keys(crmFacts).length} leads`);

    console.log('\nOther sources (fallbacks + supplementaries):');
    const corpus = loadCorpus();
    console.log(`  parent corpus JSONL: ${Object.keys(corpus).length} records`);
    const { records: indexRows, col } = loadIndexCsv();
    console.log(`  index.csv: ${Object.keys(indexRows).length} records`);
    const deepAudit = loadDeepAudit();
    console.log(`  deep_audit + available_diamonds: ${Object.keys(deepAudit).length} records`);
    const evidence = loadEvidence();
    console.log(`  evidence/: parsed`);

    const publicRecords = {};
    const internalRecords = {};
    const stats = { total: 0, profileMatched: 0, profileMissing: 0, perField: {} };
    for (const f of [...PUBLIC_FIELDS, ...INTERNAL_FIELDS]) stats.perField[f] = 0;

    const allIds = new Set([
        ...Object.keys(crmLeads),
        ...Object.keys(crmProfilesPublic),
        ...Object.keys(corpus),
        ...Object.keys(indexRows)
    ]);

    for (const leadId of allIds) {
        stats.total++;
        const c = corpus[leadId];
        const idx = indexRows[leadId];
        const audit = deepAudit[leadId];
        const ev = evidence[leadId];
        const crm = crmLeads[leadId];
        const crmProfPub = crmProfilesPublic[leadId] || {};
        const crmProfInt = crmProfilesInternal[leadId] || {};
        const crmContact = crmContacts[leadId] || [];
        const crmFact = crmFacts[leadId] || [];

        const pub = {};
        const intern = {};

        // 1. crm.sqlite leadops_profiles (CANONICAL pre-parsed structured)
        // This is the primary source. crm.sqlite parsed profile.md into
        // 25+ structured columns; we just inherit them.
        for (const [k, v] of Object.entries(crmProfPub)) {
            if (k === 'lead_id') continue;
            const cleaned = cleanValue(v);
            if (cleaned == null) continue;
            if (PUBLIC_FIELDS.has(k)) pub[k] = cleaned;
            else if (INTERNAL_FIELDS.has(k)) intern[k] = cleaned;
        }
        for (const [k, v] of Object.entries(crmProfInt)) {
            if (k === 'lead_id') continue;
            const cleaned = cleanValue(v);
            if (cleaned == null) continue;
            if (PUBLIC_FIELDS.has(k) && !(k in pub)) pub[k] = cleaned;
            else if (INTERNAL_FIELDS.has(k)) intern[k] = cleaned;
        }

        // 2. crm.sqlite leadops_leads (status, outreach_status, etc.)
        // Internal pipeline state. Don't ship; do keep in internal.
        if (crm) {
            for (const [k, v] of Object.entries(crm)) {
                if (k === 'lead_id') continue;
                if (INTERNAL_FIELDS.has(k)) {
                    const cleaned = cleanValue(v);
                    if (cleaned != null) intern[k] = cleaned;
                }
            }
            // Pull selected public fields (name, address, naics, etc.)
            for (const k of ['name', 'address', 'naics', 'email', 'phone', 'website', 'contact_form', 'social_media', 'source']) {
                if (!(k in pub) && crm[k] != null) {
                    const cleaned = cleanValue(crm[k]);
                    if (cleaned != null) pub[k] = cleaned;
                }
            }
        }

        // 3. Parent corpus JSONL (polished search_text, has_* booleans, data_grade)
        if (c) {
            const corpusMap = {
                operational_status: c.status,
                business_overview: c.business_overview,
                service_offerings: c.service_offerings,
                target_customers: c.target_customers,
                differentiators: c.differentiators,
                has_website: c.has_website,
                has_email: c.has_email,
                has_phone: c.has_phone,
                data_grade: c.data_grade,
                search_text: c.search_text
            };
            for (const [k, v] of Object.entries(corpusMap)) {
                const cleaned = cleanOptional(v);
                if (cleaned == null || cleaned === '') continue;
                if (!(k in pub)) pub[k] = cleaned;
            }
        }

        // 4. index.csv (legacy fallback for fields crm.sqlite doesn't have)
        if (idx) {
            const csvMap = {
                source: idx[col.Source],
                contact_form: idx[col.ContactForm],
                social_media: idx[col.SocialMedia],
                qualification_status: idx[col.Status],
                outreach_status: idx[col.OutreachStatus],
                contact_path: idx[col.ContactPath],
                contact_search: idx[col.ContactSearch],
                social_checked: idx[col.SocialChecked],
                disqualified: idx[col.Disqualified],
                batch: idx[col.Batch],
                updated: idx[col.Updated]
            };
            for (const [k, v] of Object.entries(csvMap)) {
                const cleaned = cleanValue(v);
                if (cleaned == null) continue;
                if (PUBLIC_FIELDS.has(k) && !(k in pub)) pub[k] = cleaned;
                else if (INTERNAL_FIELDS.has(k)) intern[k] = cleaned;
            }
            // Pull profile.md via ProfilePath
            const profilePath = cleanValue(idx[col.ProfilePath]);
            if (profilePath) {
                const fullProfilePath = path.join(PARENT_DIR, profilePath);
                if (fs.existsSync(fullProfilePath)) {
                    stats.profileMatched++;
                    const markdown = fs.readFileSync(fullProfilePath, 'utf8');
                    const profRec = parseProfile(markdown);
                    for (const [k, v] of Object.entries(profRec)) {
                        if (!PUBLIC_FIELDS.has(k) && !INTERNAL_FIELDS.has(k)) continue;
                        if (PUBLIC_FIELDS.has(k) && !(k in pub)) pub[k] = v;
                        else if (INTERNAL_FIELDS.has(k)) intern[k] = v;
                    }
                } else {
                    stats.profileMissing++;
                }
            } else {
                stats.profileMissing++;
            }
        }

        // 5. deep_audit + available_diamonds
        if (audit) {
            for (const [k, v] of Object.entries(audit)) {
                if (v == null || v === '') continue;
                if (!(k in pub)) pub[k] = v;
            }
        }

        // 6. evidence/ directory
        if (ev) {
            for (const [k, v] of Object.entries(ev)) {
                if (v == null) continue;
                if (!(k in pub)) pub[k] = v;
            }
        }

        publicRecords[leadId] = pub;
        internalRecords[leadId] = intern;
    }

    // Compute coverage from final records
    for (const rec of Object.values(publicRecords)) {
        for (const f of PUBLIC_FIELDS) {
            if (rec[f] != null && rec[f] !== '') stats.perField[f]++;
        }
    }
    for (const rec of Object.values(internalRecords)) {
        for (const f of INTERNAL_FIELDS) {
            if (rec[f] != null && rec[f] !== '') stats.perField[f]++;
        }
    }

    console.log('\n=== Coverage ===');
    console.log(`Total records: ${stats.total}`);
    console.log(`Profile matched (profile.md fallback): ${stats.profileMatched}`);
    console.log(`Profile missing: ${stats.profileMissing}`);

    console.log('\nPublic field coverage:');
    for (const f of PUBLIC_FIELDS) {
        const count = stats.perField[f];
        const pct = (count / stats.total * 100).toFixed(1);
        console.log(`  ${f.padEnd(28)}: ${String(count).padStart(5)} / ${stats.total} (${pct}%)`);
    }
    console.log('\nInternal field coverage:');
    for (const f of INTERNAL_FIELDS) {
        const count = stats.perField[f];
        const pct = (count / stats.total * 100).toFixed(1);
        console.log(`  ${f.padEnd(28)}: ${String(count).padStart(5)} / ${stats.total} (${pct}%)`);
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'leadEnrichment.public.json'),
        JSON.stringify(publicRecords, null, 0));
    fs.writeFileSync(path.join(OUTPUT_DIR, 'leadEnrichment.internal.json'),
        JSON.stringify(internalRecords, null, 0));

    const pubSize = fs.statSync(path.join(OUTPUT_DIR, 'leadEnrichment.public.json')).size;
    const intSize = fs.statSync(path.join(OUTPUT_DIR, 'leadEnrichment.internal.json')).size;
    console.log(`\nWrote leadEnrichment.public.json  (${(pubSize / 1024 / 1024).toFixed(1)} MB)`);
    console.log(`Wrote leadEnrichment.internal.json (${(intSize / 1024 / 1024).toFixed(1)} MB)`);
}

main();
