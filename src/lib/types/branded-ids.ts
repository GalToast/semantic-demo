/**
 * branded-ids.ts — distinct ID spaces for the two ways businesses are referenced.
 *
 * This app has TWO id spaces that are easy to mix up:
 *
 * - `LeadId` (string): the business record key from the corpus (`lead_id`),
 *   used in URLs (?record=, ?anchor=), search results, and the focus card.
 * - `PointIndex` (number): a position into the 8,406-point buffer
 *   (`state.rawPositionsBuffer`), used by the engine (camera focus, cursor,
 *   WebGL picking, route traces).
 *
 * History: commit 69bb5f85 (W54) fixed a real lead_id↔index mix-up in the
 * search-click flow. Branded types make the compiler catch future swaps at
 * the boundary functions instead of at runtime.
 *
 * NOTE (2026-08-05): this module is the additive foundation. The boundary
 * wiring (converting focusOnNode/mapServiceRow/etc. to accept/return these
 * types) is a follow-up that must wait for the parallel engine refactor to
 * settle — the engine files are being actively moved (cursor.ts relocated to
 * camera-choreography/). Do the wiring AFTER that lands.
 */
export type LeadId = string & { readonly __brand: 'LeadId' }

export type PointIndex = number & { readonly __brand: 'PointIndex' }

/** Coerce a raw record key into a LeadId at a trust boundary. */
export function asLeadId(value: string | number): LeadId {
    return String(value) as LeadId
}

/** Coerce a raw numeric position into a PointIndex at a trust boundary. */
export function asPointIndex(value: number): PointIndex {
    return value as PointIndex
}

/** Runtime check: branded types are the base type at runtime. */
export function isLeadId(value: unknown): value is LeadId {
    return typeof value === 'string' || typeof value === 'number'
}

export function isPointIndex(value: unknown): value is PointIndex {
    return typeof value === 'number' && Number.isFinite(value)
}