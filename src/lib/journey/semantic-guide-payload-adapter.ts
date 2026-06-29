/**
 * semantic-guide-payload-adapter.ts
 *
 *
 * Thin adapter seam: decouples semantic-guide payload builders from raw state shape.
 */

import { appState as state } from '@lib/state/app.svelte'
import type { Point } from '@lib/state/state-types'
import { formatBusinessName, cleanPublicNoteText, getPublicRecordStatusLabel } from '@lib/utils/dom-formatters.ts'
import { describeCluster } from '@lib/utils/ui-presentation.ts'

export { formatBusinessName }

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

/**
 * Returns a snapshot of the search-context fields used by payload builders.
 */
export function getSearchContextSnapshot(): SearchContextSnapshot {
    return {
        currentSearchSummary: state.searchState.currentSearchSummary as SearchSummarySnapshot | null,
        currentView: state.currentView
    }
}

/**
 * Returns the points array reference.
 */
export function getPoints(): Point[] {
    return state.points
}

/**
 * Returns the semanticResultContextByLeadId map reference.
 */
export function getResultContextMap(): Map<string, unknown> {
    return state.semanticResultContextByLeadId as Map<string, unknown>
}

/**
 * Builds a semantic guide result object for a given index.
 */
export function buildSemanticGuidePayloadResult(
    index: number,
    points: Point[],
    contextMap: Map<string, unknown>
): PayloadResult | null {
    if (!points) return null
    if (!(Number.isFinite(index) && index >= 0 && index < points.length)) return null
    const point = points[index]
    if (!point) return null
    const context = (contextMap?.get?.(String(point.lead_id)) || {}) as Record<string, unknown>

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
    }
}

/**
 * Maps result indices to payload result objects.
 */
export function mapResultIndicesToPayloadResults(
    resultIndices: number[],
    points: Point[],
    contextMap: Map<string, unknown>
): PayloadResult[] {
    if (!resultIndices?.length) return []
    return resultIndices
        .slice(0, 6)
        .map((idx) => buildSemanticGuidePayloadResult(idx, points, contextMap))
        .filter((r): r is PayloadResult => r !== null)
}

/**
 * Returns the anchor point for the current search summary.
 */
export function getAnchorPoint(currentSearchSummary: SearchSummarySnapshot | null, points: Point[]): Point | null {
    const idx = currentSearchSummary?.anchorIndex as number | undefined
    if (!Number.isFinite(idx) || !points) return null
    return points[idx as number] || null
}
