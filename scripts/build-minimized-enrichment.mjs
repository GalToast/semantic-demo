#!/usr/bin/env node
/**
 * build-minimized-enrichment.mjs — produce the PUBLIC enrichment payload.
 *
 * Privacy policy (2026-08-23, user-approved direction):
 *   Rich by default — everything describing the BUSINESS as an entity ships.
 *   Only three classes are stripped:
 *     1. PERSONS & DIRECT CONTACTS: emails, phones, decision-maker names
 *     2. ATTACK SURFACE: version/EOL/header specifics of named businesses,
 *        raw audit prose, internal evidence-artifact references
 *     3. DERIVABLE BULK: search_text (rebuilt client-side from kept fields)
 *
 * Source handling: the first run snapshots the fetched original to
 * tmp/enrichment-pristine.json; later runs re-minimize FROM THE SNAPSHOT so
 * repeated builds never compound losses.
 *
 * Unknown-key policy (shape drift): keys not in KEEP nor STRIP are SHIPPED
 * (rich-by-default) but logged loudly so drift gets reviewed instead of
 * silently passing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = resolve(ROOT, 'public', 'data', 'leadEnrichment.public.json')
const PRISTINE = resolve(ROOT, 'tmp', 'enrichment-pristine.json')

// --- STRIP LIST: the three privacy classes ---------------------------------
const STRIP = new Set([
    // persons & direct contacts
    'email', 'phone', 'decision_maker', 'decision_maker_s', 'contact_decision_makers',
    'contact_information', 'contact_extended', 'contact_form',
    // attack surface / internal audit artifacts
    'website_audit', 'manual_audit', 'audit_notes', 'audit_highlights',
    'audit_confirmed_issue', 'audit_original_issue', 'audit_status_code',
    'performance_tech', 'evidence',
    'has_hsts', 'has_csp', 'has_x_frame_options', 'has_x_content_type_options',
    'has_referrer_policy', 'has_permissions_policy', 'has_spf', 'has_dmarc',
    'tls_status', 'has_contact_form_audit',
    // derivable bulk
    'search_text'
])

// --- KNOWN-GOOD: reviewed as safe to ship (silence the drift log for these)
const KNOWN_SAFE = new Set([
    'lead_id', 'name', 'address', 'naics', 'distance_miles', 'category',
    'operational_status', 'has_website', 'has_email', 'has_phone',
    'website', 'website_presence', 'social_media', 'social_presence',
    'online_presence_notes', 'google_business_profile', 'chain_multi_location',
    'property_llc', 'data_grade', 'source', 'sources', 'research_date',
    'snapshot', 'snapshot_alt', 'business_overview', 'business_overview_extended',
    'observations', 'market_position', 'differentiators', 'target_customers',
    'service_offerings', 'key_findings', 'ux_and_conversion',
    'security_and_trust', 'location_notes', 'verification_notes', 'research_notes',
    'classification', 'lead_quality', 'business_summary', 'has_email_on_site', 'has_phone_on_site',
    'lighthouse_performance', 'lighthouse_accessibility', 'lighthouse_best_practices',
    'lighthouse_seo', 'lighthouse_lcp', 'lighthouse_fcp', 'lighthouse_cls'
])

// --- pristine snapshot ------------------------------------------------------
if (!existsSync(PRISTINE)) {
    if (!existsSync(TARGET)) {
        console.error('[minimize] no source:', TARGET, '— run npm run fetch:data first')
        process.exit(1)
    }
    mkdirSync(dirname(PRISTINE), { recursive: true })
    writeFileSync(PRISTINE, readFileSync(TARGET))
    console.log('[minimize] pristine snapshot saved →', PRISTINE)
}

const src = JSON.parse(readFileSync(PRISTINE, 'utf8'))
const ids = Object.keys(src)

// --- transform ---------------------------------------------------------------
const out = {}
const drift = new Set()
let bytesIn = 0
let bytesOut = 0
for (const id of ids) {
    const rec = src[id]
    const clean = {}
    for (const [k, v] of Object.entries(rec)) {
        bytesIn += String(v ?? '').length
        if (STRIP.has(k)) continue
        if (!KNOWN_SAFE.has(k)) drift.add(k)
        clean[k] = v
        bytesOut += String(v ?? '').length
    }
    out[id] = clean
}

mkdirSync(dirname(TARGET), { recursive: true })
writeFileSync(TARGET, JSON.stringify(out))

console.log(`[minimize] records: ${ids.length}`)
console.log(`[minimize] size: ${(bytesIn / 1048576).toFixed(1)}MB -> ${(bytesOut / 1048576).toFixed(1)}MB`)
if (drift.size > 0) {
    console.warn('[minimize] UNKNOWN KEYS SHIPPED (review for the policy lists):', [...drift].join(', '))
}
console.log('[minimize] OK')

