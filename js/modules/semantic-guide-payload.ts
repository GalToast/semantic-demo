/**
 * semantic-guide-payload.ts
 *
 * TypeScript shadow for semantic-guide-payload.js
 * Shared semantic guide request payload builders.
 * Extracted from lifecycle.js and connection-analysis.js to eliminate duplication.
 */

import type { Point } from '../../types/state.js';
import {
    formatBusinessName,
    getAnchorPoint,
    getPoints,
    getResultContextMap,
    getSearchContextSnapshot,
    buildSemanticGuidePayloadResult as buildPayloadResultFromSnapshot,
    mapResultIndicesToPayloadResults
} from './semantic-guide-payload-adapter.js';

export interface SemanticGuidePayloadResult {
    lead_id: string | number;
    name: string;
    city: string;
    cluster_label: string;
    status: string;
    public_note: string;
    public_detail: string;
    address: string;
    naics: string;
}

export interface SemanticGuideRequestPayload {
    query: string;
    view: string;
    anchor_lead_id: string | number | null;
    anchor_name: string;
    visible_matches: number;
    results: SemanticGuidePayloadResult[];
}

export interface SearchSummary {
    query: string;
    resultIndices: number[];
    anchorIndex?: number;
    visibleMatches?: number;
}

export function buildSemanticGuidePayloadResult(
    index: number,
    points: Point[] = getPoints(),
    contextMap: Map<string, unknown> = getResultContextMap()
): SemanticGuidePayloadResult | null {
    return buildPayloadResultFromSnapshot(index, points, contextMap);
}

export function getSemanticGuidePayloadResults(summary: SearchSummary): SemanticGuidePayloadResult[] {
    if (!summary?.resultIndices?.length) return [];
    return mapResultIndicesToPayloadResults(summary.resultIndices, getPoints(), getResultContextMap());
}

export function getSemanticGuideAnchorPoint(summary: SearchSummary): Point | null {
    return getAnchorPoint(summary, getPoints());
}

export function buildSemanticGuideRequestPayload(): SemanticGuideRequestPayload | null {
    const { currentSearchSummary, currentView } = getSearchContextSnapshot();
    if (!currentSearchSummary) return null;
    const results = getSemanticGuidePayloadResults(currentSearchSummary as SearchSummary);
    if (!results.length) return null;
    const anchorPoint = getSemanticGuideAnchorPoint(currentSearchSummary as SearchSummary);

    return {
        query: (currentSearchSummary as SearchSummary).query,
        view: currentView,
        anchor_lead_id: anchorPoint?.lead_id ?? null,
        anchor_name: anchorPoint ? formatBusinessName(anchorPoint.name ?? '') : '',
        visible_matches: (currentSearchSummary as SearchSummary).visibleMatches || results.length,
        results
    };
}
