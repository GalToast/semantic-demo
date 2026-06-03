import { state } from '../state.js';
import { sanitizePublicFacingNote, cleanPublicNoteText } from './utils/dom-formatters.js';
import { isPointVisible } from './utils/geo-data.js';

/**
 * search-mapper.js
 *
 * Pure functions for transforming API search results into hydrated application models.
 */

export function getSemanticSearchServiceResults(payload) {
    return Array.isArray(payload?.results) ? payload.results : [];
}

export function getSemanticSearchTotalMatches(payload, serviceResults) {
    return Number.isFinite(Number(payload?.count)) ? Number(payload.count) : serviceResults.length;
}

export function isNumericOnlySearchQuery(query) {
    const digits = String(query || '').replace(/\D/g, '');
    return digits.length >= 3 && digits.length <= 10 && /^[\d\s\-+().#]+$/.test(String(query || '').trim());
}

export function resultMatchesNumericSearchQuery(result, query) {
    const digits = String(query || '').replace(/\D/g, '');
    if (!digits || !result?.point) return false;
    const point = result.point;
    const exactFields = [point.lead_id, point.phone, point.lat, point.lng].map((v) => String(v || '').replace(/\D/g, ''));
    if (exactFields.some((v) => v && v.includes(digits))) return true;
    const contextualDigits = [result.address, result.publicNote, result.publicDetail, result.naics]
        .map((v) => String(v || '').replace(/\D/g, '')).filter(Boolean);
    return contextualDigits.some((v) => v.includes(digits));
}

function normalizeMockSearchText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/[^a-z0-9\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getMockRowTerms(row) {
    const text = normalizeMockSearchText([
        row?.name,
        row?.naics,
        row?.public_note,
        row?.public_detail,
        row?.city
    ].filter(Boolean).join(' '));
    const weakTerms = new Set(['and', 'the', 'llc', 'inc', 'co', 'company', 'shops', 'services', 'local', 'business']);
    return [...new Set(text.split(/\s+/).filter((term) => term.length >= 3 && !weakTerms.has(term)))];
}

function scoreMockPointForRow(point, terms) {
    if (!point || !terms.length) return 0;
    const text = normalizeMockSearchText([
        point.name,
        point.what,
        point.city,
        point.naics,
        point.trivia
    ].filter(Boolean).join(' '));
    return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

function getMockFallbackPointIndex(row, order = 0) {
    if (!Array.isArray(state.points) || state.points.length === 0) return null;
    const terms = getMockRowTerms(row);
    const hintedIndex = Number(row?.index);
    if (
        Number.isFinite(hintedIndex)
        && hintedIndex >= 0
        && hintedIndex < state.points.length
        && isPointVisible(hintedIndex, state.points, state.activeClusterFilter, state.activeFilters)
        && (!terms.length || scoreMockPointForRow(state.points[hintedIndex], terms) > 0)
    ) {
        return hintedIndex;
    }

    const visibleIndices = [];
    state.points.forEach((point, index) => {
        if (point && isPointVisible(index, state.points, state.activeClusterFilter, state.activeFilters)) {
            visibleIndices.push(index);
        }
    });
    if (!visibleIndices.length) return null;
    const scoredIndices = terms.length
        ? visibleIndices
            .map((index) => ({ index, score: scoreMockPointForRow(state.points[index], terms) }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score || a.index - b.index)
            .map((entry) => entry.index)
        : [];
    if (scoredIndices.length) {
        return scoredIndices[Math.max(0, order) % scoredIndices.length];
    }
    return visibleIndices[Math.max(0, order) % visibleIndices.length];
}

export function mapSemanticSearchServiceResult(row, order = 0) {
    // For mock-fallback rows, use the supplied metadata directly so the demo reads believably
    // even when data.dat has slug-style names. For real rows, look up the hydrated point.
    const isMockRow = String(row.lead_id || '').startsWith('mock-');
    let point;
    let pointIndex;

    if (isMockRow) {
        pointIndex = getMockFallbackPointIndex(row, order);
        if (!(Number.isFinite(pointIndex) && pointIndex >= 0 && pointIndex < state.points.length)) return null;
        point = state.points[pointIndex];
    } else {
        pointIndex = state.pointIndexByLeadId.get(String(row.lead_id));
        if (pointIndex === undefined) return null;
        if (!(Number.isFinite(pointIndex) && pointIndex >= 0 && pointIndex < state.points.length)) return null;
        const sourcePoint = state.points[pointIndex];
        if (!sourcePoint || !isPointVisible(pointIndex, state.points, state.activeClusterFilter, state.activeFilters)) return null;
        point = (row.name && row.name !== sourcePoint.name)
            ? { ...sourcePoint, name: row.name }
            : sourcePoint;
    }

    return {
        point,
        index: pointIndex,
        score: Number(row.score || row.semantic_score || 0),
        semanticScore: Number(row.semantic_score || 0),
        lexicalBonus: Number(row.lexical_bonus || 0),
        publicNote: sanitizePublicFacingNote(row.public_note || ''),
        publicDetail: sanitizePublicFacingNote(row.public_detail || ''),
        address: cleanPublicNoteText(row.address || ''),
        naics: cleanPublicNoteText(row.naics || ''),
        isMock: row.isMock === true
    };
}

export function mapSemanticSearchResults(serviceResults) {
    return (serviceResults || [])
        .map((row, order) => mapSemanticSearchServiceResult(row, order))
        .filter(Boolean);
}

function hydrateSemanticResultContext(result) {
    if (!state.semanticResultContextByLeadId) state.semanticResultContextByLeadId = new Map();
    state.semanticResultContextByLeadId.set(String(result.point.lead_id), {
        lead_id: result.point.lead_id,
        name: result.point.name,
        city: result.point.city,
        status: result.point.status,
        public_note: result.publicNote,
        public_detail: result.publicDetail,
        address: result.address,
        naics: result.naics
    });
}

export function hydrateSemanticResultContexts(results) {
    results.forEach(hydrateSemanticResultContext);
}
