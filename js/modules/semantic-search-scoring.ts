/**
 * semantic-search-scoring.ts
 *
 * TypeScript shadow for semantic-search-scoring.js
 * Field-weighted scoring for mock/dev semantic search results.
 */

import { state } from '../state.js';
import type { Point } from '../../types/state.js';
import { normalizeMockSearchText, MOCK_QUERY_ALIASES, MOCK_QUERY_NAICS_PREFIX, MOCK_QUERY_NAICS_DENY } from './semantic-search-mock-catalog.js';

interface FieldWeights {
    snapshot: number;
    business_overview: number;
    observations: number;
    business_overview_extended: number;
    audit_highlights: number;
    contact_decision_makers: number;
    what: number;
    name: number;
    naics_prefix: number;
    city: number;
    address: number;
    evidence: number;
    snapshot_alt: number;
    [key: string]: number;
}

const FIELD_WEIGHTS: FieldWeights = Object.freeze({
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

interface MockPointSearchFields {
    name: string;
    what: string;
    city: string;
    naics_prefix: string | null;
    address: string;
    snapshot: string;
    snapshot_alt: string;
    business_overview: string;
    business_overview_extended: string;
    observations: string;
    contact_decision_makers: string;
    audit_highlights: string;
    evidence: string;
}

function getMockPointSearchFields(point: Point): MockPointSearchFields {
    const enrichment = point?.lead_id !== null && point?.lead_id !== undefined
        ? (state.leadEnrichment as Record<string, Record<string, unknown>> | null)?.[String(point.lead_id)]
        : null;
    return {
        name: normalizeMockSearchText(point?.name),
        what: normalizeMockSearchText(point?.what),
        city: normalizeMockSearchText(point?.city),
        naics_prefix: point?.naics ? String(point.naics).match(/^(\d{6})/)?.[1] ?? null : null,
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

function getMockDatasetTerms(query: string, matchedTerm: string | null): string[] {
    const queryTokens = normalizeMockSearchText(query)
        .split(/\s+/)
        .filter((token) => token.length >= 3);
    const aliases = matchedTerm ? MOCK_QUERY_ALIASES[matchedTerm] || [matchedTerm] : [];
    return [...new Set([...aliases, ...queryTokens].map(normalizeMockSearchText).filter(Boolean))];
}

interface ScoredResult {
    lead_id: string;
    name: string;
    score: number;
    provenance: string;
    thread_type: string;
    city: string;
    naics: string;
    public_note: string;
    website: boolean;
    email: boolean;
    phone: boolean;
    isMock: boolean;
}

export function buildDatasetBackedMockResults(
    query: string,
    matchedTerm: string | null,
    scoreBase: number
): ScoredResult[] {
    if (!Array.isArray(state.points) || state.points.length === 0) return [];
    const terms = getMockDatasetTerms(query, matchedTerm);
    if (!terms.length) return [];

    const naicsPrefix = matchedTerm ? MOCK_QUERY_NAICS_PREFIX[matchedTerm] : null;
    const naicsDenyList = matchedTerm ? MOCK_QUERY_NAICS_DENY[matchedTerm] : null;
    const pointNaicsPrefix = (point: Point): string | null => {
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
            const pNaicsPrefix = pointNaicsPrefix(point);
            if (naicsDenyList && pNaicsPrefix && naicsDenyList.some((deny) => pNaicsPrefix.startsWith(deny))) {
                return null;
            }
            if (naicsPrefix && pNaicsPrefix && pNaicsPrefix.startsWith(naicsPrefix)) {
                score += FIELD_WEIGHTS.naics_prefix;
            }
            const strictMode = Boolean(matchedTerm);
            const matchedTermHit = matchedTerm && terms.some((term) =>
                term && Object.values(fields).some((val) => val && String(val).includes(term))
            );
            if (matchedTermHit) {
                for (const [fieldName, fieldText] of Object.entries(fields)) {
                    if (!fieldText) continue;
                    if (terms.some((term) => term && fieldText.includes(term))) {
                        const weight = FIELD_WEIGHTS[fieldName] || 0;
                        if (strictMode && matchedTerm && !fieldText.includes(matchedTerm)) {
                            continue;
                        }
                        score += weight;
                    }
                }
            } else if (!strictMode) {
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
        .filter((r): r is { point: Point; index: number; score: number } => r !== null)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, 5)
        .map(({ point, score }, i) => {
            const enrichment = point.lead_id !== null && point.lead_id !== undefined
                ? (state.leadEnrichment as Record<string, Record<string, unknown>> | null)?.[String(point.lead_id)]
                : null;
            return {
                lead_id: String(point.lead_id),
                name: point.name ?? '',
                score: Math.max(0.5, scoreBase - i * 0.05 + Math.min(score, 30) * 0.003),
                provenance: 'Static dev dataset fallback',
                thread_type: 'Search match',
                city: point.city ?? '',
                naics: point.naics || point.what || '',
                public_note: (enrichment?.business_overview as string) || point.what || '',
                website: Boolean(point.website),
                email: Boolean(point.email),
                phone: Boolean(point.phone),
                isMock: true
            };
        });
}
