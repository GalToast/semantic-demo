import { state } from '../state.js';
import {
    sanitizePublicFacingNote,
    cleanPublicNoteText,
    isPointVisible
} from '../utils.js';

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

export function mapSemanticSearchServiceResult(row) {
    const pointIndex = state.pointIndexByLeadId.get(String(row.lead_id));
    if (pointIndex === undefined) return null;
    if (!(Number.isFinite(pointIndex) && pointIndex >= 0 && pointIndex < state.points.length)) return null;
    const point = state.points[pointIndex];
    if (!point || !isPointVisible(pointIndex, state.points, state.activeClusterFilter, state.activeFilters)) return null;

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
    };
}

export function mapSemanticSearchResults(serviceResults) {
    return (serviceResults || [])
        .map(mapSemanticSearchServiceResult)
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
