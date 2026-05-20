// js/modules/semantic-guide-payload.js — Shared semantic guide request payload builders
// Extracted from lifecycle.js and connection-analysis.js to eliminate duplication.
// Both modules import these helpers; the helpers depend only on state and utils.

import { state } from '../state.js';
import {
    formatBusinessName,
    cleanPublicNoteText,
    describeCluster,
    getPublicRecordStatusLabel
} from '../utils.js';

export function buildSemanticGuidePayloadResult(index) {
    if (!state.points) return null;
    if (!(Number.isFinite(index) && index >= 0 && index < state.points.length)) return null;
    const point = state.points[index];
    if (!point) return null;
    const context = state.semanticResultContextByLeadId?.get?.(String(point.lead_id)) || {};

    return {
        lead_id: point.lead_id,
        name: formatBusinessName(point.name),
        city: cleanPublicNoteText(point.city || context.city || ''),
        cluster_label: describeCluster(point.cluster),
        status: getPublicRecordStatusLabel(point.status),
        public_note: cleanPublicNoteText(context.public_note || point.what || ''),
        public_detail: cleanPublicNoteText(context.public_detail || ''),
        address: cleanPublicNoteText(context.address || ''),
        naics: cleanPublicNoteText(context.naics || '')
    };
}

export function getSemanticGuidePayloadResults(summary) {
    if (!state.points) return [];
    if (!summary?.resultIndices?.length) return [];
    return summary.resultIndices.slice(0, 6).map(buildSemanticGuidePayloadResult).filter(Boolean);
}

export function getSemanticGuideAnchorPoint(summary) {
    const idx = summary?.anchorIndex;
    if (!Number.isFinite(idx) || !state.points) return null;
    return state.points[idx] || null;
}

export function buildSemanticGuideRequestPayload() {
    if (!state.currentSearchSummary) return null;
    const results = getSemanticGuidePayloadResults(state.currentSearchSummary);
    if (!results.length) return null;
    const anchorPoint = getSemanticGuideAnchorPoint(state.currentSearchSummary);

    return {
        query: state.currentSearchSummary.query,
        view: state.currentView,
        anchor_lead_id: anchorPoint?.lead_id ?? null,
        anchor_name: anchorPoint ? formatBusinessName(anchorPoint.name) : '',
        visible_matches: state.currentSearchSummary.visibleMatches || results.length,
        results
    };
}
