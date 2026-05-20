// js/modules/semantic-guide-payload.js — Shared semantic guide request payload builders
// Extracted from lifecycle.js and connection-analysis.js to eliminate duplication.
// Both modules import these helpers; state reads are isolated in the adapter.

import {
    formatBusinessName,
    getAnchorPoint,
    getPoints,
    getResultContextMap,
    getSearchContextSnapshot,
    buildSemanticGuidePayloadResult as buildPayloadResultFromSnapshot,
    mapResultIndicesToPayloadResults
} from './semantic-guide-payload-adapter.js';

export function buildSemanticGuidePayloadResult(index, points = getPoints(), contextMap = getResultContextMap()) {
    return buildPayloadResultFromSnapshot(index, points, contextMap);
}

export function getSemanticGuidePayloadResults(summary) {
    if (!summary?.resultIndices?.length) return [];
    return mapResultIndicesToPayloadResults(summary.resultIndices, getPoints(), getResultContextMap());
}

export function getSemanticGuideAnchorPoint(summary) {
    return getAnchorPoint(summary, getPoints());
}

export function buildSemanticGuideRequestPayload() {
    const { currentSearchSummary, currentView } = getSearchContextSnapshot();
    if (!currentSearchSummary) return null;
    const results = getSemanticGuidePayloadResults(currentSearchSummary);
    if (!results.length) return null;
    const anchorPoint = getSemanticGuideAnchorPoint(currentSearchSummary);

    return {
        query: currentSearchSummary.query,
        view: currentView,
        anchor_lead_id: anchorPoint?.lead_id ?? null,
        anchor_name: anchorPoint ? formatBusinessName(anchorPoint.name) : '',
        visible_matches: currentSearchSummary.visibleMatches || results.length,
        results
    };
}
