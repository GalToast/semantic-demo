/**
 * @lib/journey/neighborhood-manifest.ts — Bounded neighborhood manifest builder
 *
 * Extracted from `neighborhood.ts` (2026-06-25, Phase 5c) to separate the
 * pure manifest-building concern from the bounded-walk adapter state. The
 * manifest builder reads from `businessRecords`, `semanticNeighborMap`, and
 * `positionBuffer` (the semantic + geometric neighbor sources) and produces
 * a `NeighborhoodManifest` describing the candidate set, edges, and display
 * limit for an anchor + route.
 *
 * Public API: `buildNeighborhoodManifest`, `getSemanticThreadDisplayLimit`,
 * `getSemanticPeerThreadDisplayLimit`. The first two are re-exported from
 * `neighborhood.ts` for backwards compatibility (existing consumers import
 * them from `@lib/journey/neighborhood`).
 *
 * Module-level adapter state for the bounded-walk selection (`bounded*` in
 * `neighborhood.ts`) is intentionally NOT here. The bounded-state lookup
 * for individual candidates is injected via the optional
 * `getCandidateForIndex` parameter on `buildNeighborhoodManifest` —
 * `neighborhood.ts` passes `getNeighborhoodCandidateForIndex` from its
 * own module (which knows about the bounded state). External callers
 * (e.g. `triggers.ts`) pass `undefined`, and the builder falls back to
 * the inline `{} as Partial<...>` shape (matching the previous behavior).
 */

import { get } from 'svelte/store'
import { semanticNeighborMap, businessRecords, pointIndexByLeadId, positionBuffer } from '@lib/data-store'
import { appState } from '@lib/state/app.svelte.ts'
import { isPointVisible } from '@lib/utils/geo-data'
import type { SemanticNeighborDetail } from '@lib/types/business'
import { normalizeLeadId } from './thread-model'

// ── Configuration ────────────────────────────────────────────────────────────

/** Max candidates returned by buildNeighborhoodManifest. */
export const MAX_MANIFEST_CANDIDATES = 18

/** Max candidates for peer thread display. */
const MAX_PEER_THREAD_DISPLAY = 14

// ── Public types ─────────────────────────────────────────────────────────────

export interface NeighborhoodPeerThread {
    peerIndex: number
    score: number
    reason: string
}

export interface NeighborhoodCandidate {
    index: number
    role: 'anchor' | 'peer'
    slotNumber: number
    leadId: string | null
    anchorThread: { path: number[]; type: string; reason: string }
    peerThreads: NeighborhoodPeerThread[]
    score: number
    semanticScore: number
    reason: string
    source: string
    sameCity?: boolean
    sameStatus?: boolean
    threadType?: string
}

export interface NeighborhoodManifest {
    anchorIndex: number
    displayLimit: number
    candidates: Map<number, NeighborhoodCandidate>
    edges: Array<{ a: number; b: number; score: number; role: string; reason: string }>
    candidateIndices: number[]
    anchorEdgeCount: number
    peerEdgeCount: number
    totalPeerEdgeCandidates: number
    peerEdgesCulled: number
    hairballRisk: boolean
}

/** Optional lookup function passed by callers that maintain their own
 *  candidate state (e.g. the bounded-neighborhood adapter in neighborhood.ts).
 *  Returns null/undefined when the index is not present in the caller's state. */
export type CandidateLookup = (index: number) => (SemanticNeighborDetail & { source: string; index: number }) | null

// ── Display limits ───────────────────────────────────────────────────────────

/** Get the semantic thread display limit based on viewport.
 *  Ported from journey-neighborhood.js getSemanticThreadDisplayLimit(). */
export function getSemanticThreadDisplayLimit(): number {
    return MAX_MANIFEST_CANDIDATES
}

/** Get the semantic peer thread display limit.
 *  Ported from journey-neighborhood.js getSemanticPeerThreadDisplayLimit(). */
export function getSemanticPeerThreadDisplayLimit(candidateCount: number): number {
    const peerCount = Math.max(0, (candidateCount || 1) - 1)
    return Math.min(MAX_PEER_THREAD_DISPLAY, peerCount)
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Pure candidate lookup from the semantic neighbor map.
 *  Returns the SemanticNeighborDetail between source and target, or null.
 *  Used by buildNeighborhoodManifest; also exported for use by callers that
 *  want a bounded-state-free lookup. */
export function getSemanticNeighborRecordBetween(
    sourceIndex: number,
    targetIndex: number
): SemanticNeighborDetail | null {
    const records = get(businessRecords)
    if (!Number.isFinite(sourceIndex) || sourceIndex < 0 || sourceIndex >= records.length) return null
    const sourcePoint = records[sourceIndex]
    if (!sourcePoint) return null
    const sourceLeadId = normalizeLeadId(sourcePoint.lead_id)
    if (!sourceLeadId || !Number.isFinite(targetIndex)) return null
    const nMap = get(semanticNeighborMap)
    const sourceNode = nMap.get(sourceLeadId)
    if (!sourceNode?.neighbors?.length) return null
    const idxMap = get(pointIndexByLeadId)
    return (
        sourceNode.neighbors.find((neighbor: SemanticNeighborDetail) => {
            const candidateIndex = idxMap.get(neighbor.leadId ?? '')
            return candidateIndex === targetIndex
        }) || null
    )
}

// ── Resolve neighbors ────────────────────────────────────────────────────────

/**
 * Resolve neighbor indices from the semantic neighbor map for a given anchor.
 * Returns up to `limit` candidate indices sorted by semantic score descending.
 *
 * Exported (along with `resolveGeometricNeighbors`) because
 * `getNextWalkCandidateForIndex` in `neighborhood.ts` uses them for the
 * walk-candidate selection concern (which lives separately from the bounded
 * adapter state).
 */
export function resolveSemanticNeighbors(
    anchorIndex: number,
    limit: number = MAX_MANIFEST_CANDIDATES
): Array<{ index: number; score: number; reason: string; source: string }> {
    const records = get(businessRecords)
    const nMap = get(semanticNeighborMap)
    const idxMap = get(pointIndexByLeadId)

    if (!records.length || nMap.size === 0 || idxMap.size === 0) return []

    const anchorRecord = records[anchorIndex]
    if (!anchorRecord?.lead_id) return []

    const entry = nMap.get(anchorRecord.lead_id)
    if (!entry?.neighbors?.length) return []

    const results: Array<{ index: number; score: number; reason: string; source: string }> = []
    const seen = new Set<number>([anchorIndex])

    for (const n of entry.neighbors) {
        const nIdx = idxMap.get(n.leadId ?? '')
        if (nIdx === undefined || seen.has(nIdx)) continue
        seen.add(nIdx)

        const score = Number.isFinite(n.semanticScore) ? n.semanticScore : Number.isFinite(n.score) ? n.score : 0

        results.push({
            index: nIdx,
            score,
            reason: n.reason || 'semantic neighbor',
            source: 'semantic'
        })

        if (results.length >= limit) break
    }

    results.sort((a, b) => b.score - a.score)
    return results
}

/**
 * Resolve geometric neighbors using the position buffer (spatial proximity fallback).
 * Exported for use by `getNextWalkCandidateForIndex` (see resolveSemanticNeighbors).
 */
export function resolveGeometricNeighbors(
    anchorIndex: number,
    limit: number
): Array<{ index: number; score: number; reason: string; source: string }> {
    const positions = get(positionBuffer)
    const records = get(businessRecords)
    if (!positions || !records.length) return []

    const count = Math.min(records.length, positions.length / 3)
    const anchorOffset = anchorIndex * 3
    if (anchorOffset + 2 >= positions.length) return []

    const ax = positions[anchorOffset] as number
    const ay = positions[anchorOffset + 1] as number
    const az = positions[anchorOffset + 2] as number
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az)) return []

    const candidates: Array<{ index: number; score: number; reason: string; source: string }> = []

    const cellSize = 0.12
    const grid = new Map<string, number[]>()
    for (let i = 0; i < count; i++) {
        const offset = i * 3
        const px = positions[offset] as number
        const py = positions[offset + 1] as number
        const pz = positions[offset + 2] as number
        if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) continue
        const key = `${Math.floor(px / cellSize)},${Math.floor(py / cellSize)},${Math.floor(pz / cellSize)}`
        if (!grid.has(key)) grid.set(key, [])
        grid.get(key)!.push(i)
    }

    const seenIndices = new Set<number>()
    const cx = Math.floor(ax / cellSize)
    const cy = Math.floor(ay / cellSize)
    const cz = Math.floor(az / cellSize)

    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
                const cell = grid.get(`${cx + dx},${cy + dy},${cz + dz}`)
                if (!cell) continue
                for (const i of cell) {
                    if (i === anchorIndex || seenIndices.has(i)) continue
                    seenIndices.add(i)
                    const offset = i * 3
                    const px = positions[offset] as number
                    const py = positions[offset + 1] as number
                    const pz = positions[offset + 2] as number
                    const dist = Math.hypot(px - ax, py - ay, pz - az)
                    if (!Number.isFinite(dist) || dist < 0.0001) continue
                    candidates.push({
                        index: i,
                        score: 1 / Math.max(dist, 0.0001),
                        reason: 'geometric proximity',
                        source: 'geometric-fallback'
                    })
                }
            }
        }
    }

    candidates.sort((a, b) => b.score - a.score)
    return candidates.slice(0, limit)
}

// ── Manifest builder ─────────────────────────────────────────────────────────

/**
 * Build a neighborhood manifest from anchor index and route indices.
 * Ported from journey-neighborhood.js buildNeighborhoodManifest().
 *
 * Resolves all semantic neighbors for the anchor, returning a manifest
 * with candidate indices, display limit, and edge counts.
 *
 * @param getCandidateForIndex - optional bounded-state lookup for individual
 *   candidates. Pass `getNeighborhoodCandidateForIndex` from `neighborhood.ts`
 *   when calling from bounded-state-aware sites; pass `undefined` when
 *   called from external sites that don't maintain bounded state.
 */
export function buildNeighborhoodManifest(
    anchorIndex: number,
    routeIndices: readonly number[],
    options: { displayLimit?: number; getCandidateForIndex?: CandidateLookup } = {}
): NeighborhoodManifest | null {
    const records = get(businessRecords)
    if (!Number.isFinite(anchorIndex) || anchorIndex < 0 || anchorIndex >= records.length) return null

    const displayLimit = options.displayLimit ?? getSemanticThreadDisplayLimit()
    const getCandidateForIndex = options.getCandidateForIndex

    const uniqueRoute: number[] = []
    const fallbackCandidateByIndex = new Map<number, { index: number; score: number; reason: string; source: string }>()
    const seen = new Set<number>([anchorIndex])
    const filters = appState.activeFilters

    const appendRouteCandidate = (
        candidateIndex: number,
        fallbackCandidate?: { index: number; score: number; reason: string; source: string }
    ): void => {
        if (
            !Number.isFinite(candidateIndex) ||
            seen.has(candidateIndex) ||
            candidateIndex === anchorIndex ||
            !isPointVisible(candidateIndex, records, null, filters) ||
            !appState.nodePositions[candidateIndex]
        ) {
            return
        }
        seen.add(candidateIndex)
        uniqueRoute.push(candidateIndex)
        if (fallbackCandidate) fallbackCandidateByIndex.set(candidateIndex, fallbackCandidate)
    }

    ;(routeIndices || []).forEach((candidateIndex: number) => {
        appendRouteCandidate(candidateIndex)
    })

    const candidates = new Map<number, NeighborhoodCandidate>()
    const edges: Array<{ a: number; b: number; score: number; role: string; reason: string }> = []
    const anchorLeadId = normalizeLeadId(records[anchorIndex]?.lead_id)
    candidates.set(anchorIndex, {
        index: anchorIndex,
        role: 'anchor',
        slotNumber: 0,
        leadId: anchorLeadId,
        anchorThread: { path: [anchorIndex], type: 'anchor', reason: 'neighborhood anchor' },
        peerThreads: [],
        score: 1,
        semanticScore: 1,
        reason: 'neighborhood anchor',
        source: 'semantic'
    })

    let scoredRoute = uniqueRoute
        .map((candidateIndex: number) => {
            const candidate =
                getCandidateForIndex?.(candidateIndex) || ({} as Partial<SemanticNeighborDetail & { source: string }>)
            const fallbackCandidate = fallbackCandidateByIndex.get(candidateIndex)
            const anchorRecord = getSemanticNeighborRecordBetween(anchorIndex, candidateIndex)
            const score = Number(
                candidate.semanticScore ||
                    candidate.score ||
                    fallbackCandidate?.score ||
                    anchorRecord?.semanticScore ||
                    anchorRecord?.score ||
                    0
            )
            return {
                candidateIndex,
                candidate: { ...fallbackCandidate, ...candidate },
                anchorRecord,
                score
            }
        })
        .filter((entry) => entry.anchorRecord || fallbackCandidateByIndex.has(entry.candidateIndex))
        .sort((a, b) => b.score - a.score || a.candidateIndex - b.candidateIndex)
        .slice(0, displayLimit)

    if (scoredRoute.length === 0) {
        const semanticFallbacks = resolveSemanticNeighbors(anchorIndex, displayLimit)
        const fallbackCandidates = [...semanticFallbacks]
        if (fallbackCandidates.length < Math.min(6, displayLimit)) {
            const existing = new Set(fallbackCandidates.map((candidate) => candidate.index))
            existing.add(anchorIndex)
            for (const candidate of resolveGeometricNeighbors(anchorIndex, displayLimit)) {
                if (existing.has(candidate.index)) continue
                fallbackCandidates.push(candidate)
                existing.add(candidate.index)
                if (fallbackCandidates.length >= displayLimit) break
            }
        }

        for (const candidate of fallbackCandidates) {
            appendRouteCandidate(candidate.index, candidate)
        }

        scoredRoute = uniqueRoute
            .map((candidateIndex: number) => {
                const candidate = getCandidateForIndex?.(candidateIndex) || ({} as Record<string, unknown>)
                const fallbackCandidate = fallbackCandidateByIndex.get(candidateIndex)
                const anchorRecord = getSemanticNeighborRecordBetween(anchorIndex, candidateIndex)
                const score = Number(
                    candidate.semanticScore ||
                        candidate.score ||
                        fallbackCandidate?.score ||
                        anchorRecord?.semanticScore ||
                        anchorRecord?.score ||
                        0
                )
                return {
                    candidateIndex,
                    candidate: { ...fallbackCandidate, ...candidate },
                    anchorRecord,
                    score
                }
            })
            .filter((entry) => entry.anchorRecord || fallbackCandidateByIndex.has(entry.candidateIndex))
            .sort((a, b) => b.score - a.score || a.candidateIndex - b.candidateIndex)
            .slice(0, displayLimit)
    }

    scoredRoute.forEach((entry, order) => {
        const { candidateIndex, candidate, anchorRecord, score } = entry
        if (!Number.isFinite(candidateIndex) || candidateIndex < 0 || candidateIndex >= records.length) return
        const leadId = normalizeLeadId(records[candidateIndex]?.lead_id)
        const reason =
            candidate.reason ||
            anchorRecord?.reason ||
            appState.navState.neighborhoodReasonByIndex?.get(candidateIndex) ||
            'semantic neighbor'
        candidates.set(candidateIndex, {
            index: candidateIndex,
            role: 'peer',
            slotNumber: order + 1,
            leadId,
            anchorThread: {
                path: [anchorIndex, candidateIndex],
                type: 'direct',
                reason
            },
            peerThreads: [],
            score,
            semanticScore: Number(candidate.semanticScore || anchorRecord?.semanticScore || score || 0),
            sameCity: Boolean(candidate.sameCity || anchorRecord?.sameCity),
            sameStatus: Boolean(candidate.sameStatus || anchorRecord?.sameStatus),
            threadType: candidate.threadType || anchorRecord?.threadType || 'local_semantic_neighbor',
            reason,
            source: 'semantic'
        })
        edges.push({
            a: anchorIndex,
            b: candidateIndex,
            score,
            role: 'anchor-peer',
            reason
        })
    })

    const peerEdges: Array<{ a: number; b: number; score: number; role: string; reason: string }> = []
    const nMap = get(semanticNeighborMap)
    const idxMap = get(pointIndexByLeadId)

    for (const [candidateIndex, candidate] of candidates) {
        if (candidate.role !== 'peer') continue
        const candidateNode = nMap.get(candidate.leadId!)
        if (!candidateNode?.neighbors?.length) continue
        candidateNode.neighbors.forEach((neighbor: SemanticNeighborDetail) => {
            const peerIndex = idxMap.get(neighbor.leadId ?? '')
            if (
                !Number.isFinite(peerIndex) ||
                peerIndex === anchorIndex ||
                peerIndex === candidateIndex ||
                !candidates.has(peerIndex!)
            ) {
                return
            }
            const a = Math.min(candidateIndex, peerIndex!)
            const b = Math.max(candidateIndex, peerIndex!)
            if (peerEdges.some((edge) => edge.a === a && edge.b === b)) return
            const score = Number(neighbor.semanticScore || neighbor.score || 0)
            peerEdges.push({
                a,
                b,
                score,
                role: 'peer-peer',
                reason: neighbor.reason || 'shared semantic thread'
            })
        })
    }

    const maxPeerEdges = getSemanticPeerThreadDisplayLimit(candidates.size)
    peerEdges.sort((a, b) => b.score - a.score || a.a - b.a || a.b - b.b)
    const displayedPeerEdges = peerEdges.slice(0, maxPeerEdges)
    displayedPeerEdges.forEach((edge) => {
        edges.push(edge)
        const aCandidate = candidates.get(edge.a)
        const bCandidate = candidates.get(edge.b)
        if (aCandidate) {
            aCandidate.peerThreads.push({
                peerIndex: edge.b,
                score: edge.score,
                reason: edge.reason
            })
        }
        if (bCandidate) {
            bCandidate.peerThreads.push({
                peerIndex: edge.a,
                score: edge.score,
                reason: edge.reason
            })
        }
    })

    return {
        anchorIndex,
        displayLimit,
        candidates,
        edges,
        candidateIndices: [...candidates.keys()].filter((candidateIndex) => candidateIndex !== anchorIndex),
        anchorEdgeCount: edges.filter((edge) => edge.role === 'anchor-peer').length,
        peerEdgeCount: displayedPeerEdges.length,
        totalPeerEdgeCandidates: peerEdges.length,
        peerEdgesCulled: Math.max(0, peerEdges.length - displayedPeerEdges.length),
        hairballRisk: displayedPeerEdges.length > candidates.size * 2
    }
}
