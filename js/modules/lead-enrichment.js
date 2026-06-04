/**
 * lead-enrichment.js
 *
 * Accessor for state.leadEnrichment (the per-lead enrichment map
 * fetched from scripts/leadEnrichment.public.json at app init).
 *
 * Bug Sweep 33: provides a single getEnrichment() entry point that
 * UI modules (focus card, search, journey) can use without each
 * reaching into state directly. The enrichment contains the canonical
 * fields from the parent pipeline (snapshot, observations, business_overview,
 * address, contact_decision_makers, audit_highlights, security headers,
 * Lighthouse scores, lead quality stars, etc.) — see the merge
 * pipeline at scripts/merge-enrichment.mjs.
 *
 * Public fields (safe to display): snapshot, observations, evidence,
 * business_overview, business_overview_extended, contact_decision_makers,
 * online_presence, market_position, address, naics (override), contact_form,
 * social_media, decision_maker, lead_quality, source, has_hsts, has_csp,
 * has_spf, has_dmarc, lighthouse_*, etc.
 *
 * Internal fields (NEVER displayed): status, outreach_status, contact_path,
 * contact_search, social_checked, disqualified, batch, opportunity_assessment,
 * disqualification_rationale, etc. The state.leadEnrichment object may carry
 * these for the data team's internal use, but getEnrichment() callers in
 * the UI must NEVER read them.
 */

import { state } from '../state.js';

/**
 * Returns the public enrichment for a lead, or null if not loaded / not found.
 * Always safe to call from UI code; never returns internal pipeline fields.
 */
export function getEnrichment(leadId) {
    if (leadId === null || leadId === undefined) return null;
    const key = String(leadId);
    return state.leadEnrichment?.[key] || null;
}

/**
 * Returns a single enrichment field, with a fallback default. Useful for
 * display code that wants a guaranteed string: `getEnrichmentField(id, 'snapshot', '')`.
 */
export function getEnrichmentField(leadId, field, fallback = null) {
    const enr = getEnrichment(leadId);
    if (!enr) return fallback;
    const val = enr[field];
    return val !== null && val !== undefined && val !== '' ? val : fallback;
}

/**
 * Returns the lead's preferred one-liner. Priority: snapshot (hand-written
 * from profile.md or crm.sqlite) > business_overview_extended (crm pre-parsed
 * analyst note) > business_overview (parent pipeline's polished version) > point.what
 * (database fallback). Returns null if all are empty.
 */
export function getLeadOneLiner(point) {
    if (!point) return null;
    const enr = getEnrichment(point.lead_id);
    return (
        enr?.snapshot ||
        enr?.business_overview_extended ||
        enr?.business_overview ||
        enr?.observations ||
        point.what ||
        null
    );
}

/**
 * Returns the lead's full street address. Priority: crm.sqlite address
 * (street-level) > point.address (none in data.dat, but future-proof).
 * Returns null if no address is known.
 */
export function getLeadAddress(point) {
    if (!point) return null;
    const enr = getEnrichment(point.lead_id);
    return enr?.address || null;
}

/**
 * Returns the lead's lead_quality star rating (0-4), or null. Used as
 * a small badge in the focus card.
 */
export function getLeadQualityStars(point) {
    if (!point) return null;
    const enr = getEnrichment(point.lead_id);
    if (!enr?.lead_quality) return null;
    const n = Number(enr.lead_quality);
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 4) : null;
}
