import { state } from '../state.js';
import { normalizeMockSearchText, MOCK_QUERY_ALIASES, MOCK_QUERY_NAICS_PREFIX, MOCK_QUERY_NAICS_DENY } from './semantic-search-mock-catalog.js';

/**
 * Field-weighted scoring. The lead's own one-liner (snapshot) is the
 * strongest category signal; the lead's analysis paragraph (observations)
 * is next; the auto-generated business_overview is on par with snapshot.
 * NAICS-prefix is a strong signal but not dominant — it can be wrong
 * upstream. Weights are tuned for "childcare" / "coffee" / etc. queries
 * where the lead's own words matter most.
 *
 * Bug Sweep 33: pulls fields from scripts/leadEnrichment.public.json
 * (state.leadEnrichment[leadId]) in addition to the data.dat point
 * fields. Records without enrichment fall through to point-only text
 * matching (backwards-compat).
 */
const FIELD_WEIGHTS = Object.freeze({
    snapshot: 9,
    business_overview: 9,
    observations: 7,
    business_overview_extended: 7,
    audit_highlights: 5,
    contact_decision_makers: 5,
    what: 6,
    name: 4,
    naics_prefix: 6,
    city: 2,
    address: 2,
    evidence: 3,
    snapshot_alt: 9
});

/**
 * Build a per-field text map. Returns {fieldName: normalized_text}.
 * Used so that a hit in `snapshot` scores higher than a hit in `what`.
 */
function getMockPointSearchFields(point) {
    const enrichment = point?.lead_id !== null && point?.lead_id !== undefined
        ? state.leadEnrichment?.[String(point.lead_id)]
        : null;
    return {
        name: normalizeMockSearchText(point?.name),
        what: normalizeMockSearchText(point?.what),
        city: normalizeMockSearchText(point?.city),
        naics_prefix: point?.naics ? String(point.naics).match(/^(\d{6})/)?.[1] : null,
        address: normalizeMockSearchText(enrichment?.address || point?.address),
        snapshot: normalizeMockSearchText(enrichment?.snapshot),
        snapshot_alt: normalizeMockSearchText(enrichment?.business_overview),
        business_overview: normalizeMockSearchText(enrichment?.business_overview_extended),
        business_overview_extended: normalizeMockSearchText(enrichment?.business_overview_extended),
        observations: normalizeMockSearchText(enrichment?.observations),
        contact_decision_makers: normalizeMockSearchText(enrichment?.contact_decision_makers),
        audit_highlights: normalizeMockSearchText(enrichment?.audit_highlights),
        evidence: normalizeMockSearchText(enrichment?.evidence)
    };
}

function getMockDatasetTerms(query, matchedTerm) {
    const queryTokens = normalizeMockSearchText(query)
        .split(/\s+/)
        .filter((token) => token.length >= 3);
    const aliases = matchedTerm ? MOCK_QUERY_ALIASES[matchedTerm] || [matchedTerm] : [];
    return [...new Set([...aliases, ...queryTokens].map(normalizeMockSearchText).filter(Boolean))];
}

export function buildDatasetBackedMockResults(query, matchedTerm, scoreBase) {
    if (!Array.isArray(state.points) || state.points.length === 0) return [];
    const terms = getMockDatasetTerms(query, matchedTerm);
    if (!terms.length) return [];

    // NAICS-based scoring for known terms. The local code owns this
    // contract, not upstream: even if a record is misclassified upstream,
    // the search refuses to surface it for the wrong category. Records
    // without a NAICS field fall through to text matching (backwards-compat
    // with the existing dataset, which has no NAICS column yet).
    const naicsPrefix = matchedTerm ? MOCK_QUERY_NAICS_PREFIX[matchedTerm] : null;
    const naicsDenyList = matchedTerm ? MOCK_QUERY_NAICS_DENY[matchedTerm] : null;
    const pointNaicsPrefix = (point) => {
        const n = point?.naics;
        if (!n) return null;
        const m = String(n).match(/^(\d{6})/);
        return m ? m[1] : null;
    };

    return state.points
        .map((point, index) => {
            if (!point || point.lead_id === null || point.lead_id === undefined || point.lead_id === '') return null;
            const fields = getMockPointSearchFields(point);
            let score = 0;
            // Defense in depth for known terms: if the record has a NAICS
            // code on the denylist for this query, exclude it entirely.
            // This handles the case where upstream has misclassified a
            // record (e.g. an aviation school tagged cluster 12 AND NAICS
            // 611512; the local code refuses to surface it for "childcare"
            // even if the name or what text would otherwise match).
            const pNaicsPrefix = pointNaicsPrefix(point);
            if (naicsDenyList && pNaicsPrefix && naicsDenyList.some((deny) => pNaicsPrefix.startsWith(deny))) {
                return null;
            }
            // NAICS-prefix match. Strong signal but not dominant — the
            // lead's own words (snapshot, observations, business_overview)
            // can override a misclassified NAICS.
            if (naicsPrefix && pNaicsPrefix && pNaicsPrefix.startsWith(naicsPrefix)) {
                score += FIELD_WEIGHTS.naics_prefix;
            }
            // Field-weighted text matching. The matchedTerm must hit at
            // least one field; the field that hits determines the weight.
            // Bug Sweep 33: scoring across multiple corpus fields instead
            // of just `what`. Records without enrichment fall through to
            // point-only fields and score lower.
            const strictMode = Boolean(matchedTerm);
            const matchedTermHit = matchedTerm && terms.some((term) =>
                term && Object.values(fields).some((val) => val && String(val).includes(term))
            );
            if (matchedTermHit) {
                // Find which fields hit and score each by weight
                for (const [fieldName, fieldText] of Object.entries(fields)) {
                    if (!fieldText) continue;
                    if (terms.some((term) => term && fieldText.includes(term))) {
                        const weight = FIELD_WEIGHTS[fieldName] || 0;
                        if (strictMode && matchedTerm && !fieldText.includes(matchedTerm)) {
                            // In strict mode, only the matchedTerm itself scores.
                            // Aliases are intentionally ignored to keep
                            // results within the requested category.
                            continue;
                        }
                        score += weight;
                    }
                }
            } else if (!strictMode) {
                // Generic (non-strict) mode: any alias can score, but only
                // in the strongest fields (snapshot, business_overview,
                // observations) so unrelated clusters don't bleed in.
                for (const [fieldName, fieldText] of Object.entries(fields)) {
                    if (!fieldText) continue;
                    const weight = FIELD_WEIGHTS[fieldName] || 0;
                    if (weight < 5) continue;
                    if (terms.some((term) => term && fieldText.includes(term))) {
                        score += weight * 0.5;
                    }
                }
            }
            if (point.website) score += 0.4;
            if (point.email) score += 0.3;
            if (point.phone) score += 0.2;
            if (score <= 0) return null;
            return { point, index, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, 5)
        .map(({ point, score }, i) => {
            const enrichment = point.lead_id !== null && point.lead_id !== undefined
                ? state.leadEnrichment?.[String(point.lead_id)]
                : null;
            return {
                lead_id: String(point.lead_id),
                name: point.name,
                score: Math.max(0.5, scoreBase - i * 0.05 + Math.min(score, 30) * 0.003),
                provenance: 'Static dev dataset fallback',
                thread_type: 'Search match',
                city: point.city,
                naics: point.naics || point.what,
                public_note: enrichment?.business_overview || point.what || '',
                website: point.website,
                email: point.email,
                phone: point.phone,
                isMock: true
            };
        });
}
