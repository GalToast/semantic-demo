/**
 * semantic-guide-payload.ts
 *
 * TypeScript shadow for semantic-guide-payload.js
 * Shared semantic guide request payload builders.
 * Extracted from lifecycle.js and connection-analysis.js to eliminate duplication.
 */

import type { Point } from '@lib/state/state-types';
import { appState as state } from '@lib/state/app.svelte';
import { formatBusinessName, cleanPublicNoteText, getPublicRecordStatusLabel } from '@lib/utils/dom-formatters';
import { describeCluster } from '@lib/utils/ui-presentation';

// ── Types (inlined from semantic-guide-payload-adapter.ts) ──────────────────

export interface SearchContextSnapshot {
    currentSearchSummary: SearchSummarySnapshot | null
    currentView: string
}

export interface SearchSummarySnapshot {
    query: string
    resultIndices: number[]
    anchorIndex?: number
    visibleMatches?: number
    [key: string]: unknown
}

export interface PayloadResult {
    lead_id: string | number
    name: string
    city: string
    cluster_label: string
    status: string
    public_note: string
    public_detail: string
    address: string
    naics: string
}

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

export type SearchSummary = SearchSummarySnapshot;

// ── Internal helpers (inlined from semantic-guide-payload-adapter.ts) ───────
// W10 adapter-fold: getSearchContextSnapshot was an export of the deleted
// adapter; the fold inlined it. Re-exported (additive) so the adapter's
// public contract (semantic-guide-payload-contract.mjs runtime section)
// continues to resolve it.
export function getSearchContextSnapshot(): SearchContextSnapshot {
    return {
        currentSearchSummary: state.searchState.currentSearchSummary as SearchSummarySnapshot | null,
        currentView: state.currentView
    };
}

// W10 adapter-fold: getPoints/getResultContextMap/mapResultIndicesToPayloadResults/
// getAnchorPoint were PUBLIC on the deleted adapter; the fold inlined them but
// they must keep being exported so the adapter contract (semantic-guide-
// payload-contract runtime section) still resolves them.
export function getPoints(): Point[] {
    return state.points;
}

export function getResultContextMap(): Map<string, unknown> {
    return state.semanticResultContextByLeadId as Map<string, unknown>;
}

function buildPayloadResultFromSnapshot(
    index: number,
    points: Point[],
    contextMap: Map<string, unknown>
): PayloadResult | null {
    if (!points) return null;
    if (!(Number.isFinite(index) && index >= 0 && index < points.length)) return null;
    const point = points[index];
    if (!point) return null;
    const context = (contextMap?.get?.(String(point.lead_id)) || {}) as Record<string, unknown>;

    return {
        lead_id: point.lead_id ?? '',
        name: formatBusinessName(point.name ?? ''),
        city: cleanPublicNoteText((point.city || context.city || '') as string),
        cluster_label: describeCluster(point.cluster ?? 0),
        status: getPublicRecordStatusLabel(point.status ?? ''),
        public_note: cleanPublicNoteText((context.public_note || point.what || '') as string),
        public_detail: cleanPublicNoteText((context.public_detail || '') as string),
        address: cleanPublicNoteText((context.address || '') as string),
        naics: cleanPublicNoteText((context.naics || '') as string)
    };
}

export function mapResultIndicesToPayloadResults(
    resultIndices: number[],
    points: Point[],
    contextMap: Map<string, unknown>
): PayloadResult[] {
    if (!resultIndices?.length) return [];
    return resultIndices
        .slice(0, 6)
        .map((idx) => buildPayloadResultFromSnapshot(idx, points, contextMap))
        .filter((r): r is PayloadResult => r !== null);
}

export function getAnchorPoint(currentSearchSummary: SearchSummarySnapshot | null, points: Point[]): Point | null {
    const idx = currentSearchSummary?.anchorIndex as number | undefined;
    if (!Number.isFinite(idx) || !points) return null;
    return points[idx as number] || null;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function buildSemanticGuidePayloadResult(
    index: number,
    points: Point[] = getPoints(),
    contextMap: Map<string, unknown> = getResultContextMap()
): SemanticGuidePayloadResult | null {
    return buildPayloadResultFromSnapshot(index, points, contextMap) as SemanticGuidePayloadResult | null;
}

export function getSemanticGuidePayloadResults(summary: SearchSummary): SemanticGuidePayloadResult[] {
    if (!summary?.resultIndices?.length) return [];
    return mapResultIndicesToPayloadResults(summary.resultIndices, getPoints(), getResultContextMap()) as SemanticGuidePayloadResult[];
}

export function getSemanticGuideAnchorPoint(summary: SearchSummary): Point | null {
    return getAnchorPoint(summary, getPoints());
}

export function buildSemanticGuideRequestPayload(): SemanticGuideRequestPayload | null {
    const { currentSearchSummary, currentView } = getSearchContextSnapshot();
    if (!currentSearchSummary) return null;
    const results = getSemanticGuidePayloadResults(currentSearchSummary);
    if (!results.length) return null;
    const anchorPoint = getSemanticGuideAnchorPoint(currentSearchSummary);

    return {
        query: currentSearchSummary.query,
        view: currentView,
        anchor_lead_id: anchorPoint?.lead_id ?? null,
        anchor_name: anchorPoint ? formatBusinessName(anchorPoint.name ?? '') : '',
        visible_matches: currentSearchSummary.visibleMatches || results.length,
        results
    };
}
