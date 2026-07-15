/**
 * @lib/journey/neighborhood.ts — Bounded neighborhood walk candidates
 *
 * The pure manifest-building concern (types, resolvers, builder) was
 * extracted to `./neighborhood-manifest.ts` (Phase 5c, 2026-06-25). This
 * module now owns:
 *   - Bounded-neighborhood adapter state (the 3 module-level vars below)
 *   - Walk-candidate selection (`getBoundedNeighborhoodWalkCandidate`)
 *   - Bounded-neighborhood lifecycle (`init`, `reset`, `prime`,
 *     `ensureBoundedNeighborhoodFromActivePocket`)
 *   - Public API for callers: `getNeighborhoodCandidateForIndex`,
 *     `getNeighborhoodRouteIndices`, `getCurrentTrailFocusIndex`,
 *     `setTrailFromSeed`, `updateTrailIndices`, `primeBounded...`, etc.
 *
 * For backwards compatibility, `buildNeighborhoodManifest` and
 * `getSemanticThreadDisplayLimit` are RE-EXPORTED from neighborhood-manifest
 * — existing consumers (`canvas-hit-test.ts`, `journey.ts`, `triggers.ts`)
 * continue to import them from `@lib/journey/neighborhood`.
 */

import { get } from 'svelte/store'
import { semanticNeighborMap, businessRecords, pointIndexByLeadId } from '@lib/data-store'
import { navStore, writeNavStateMirror } from '@lib/stores/navigation.svelte.ts'
import { journeyStore, setTrailSeedIndex, setTrailNeighborIndices } from '@lib/stores/journey.svelte.ts'
import { appState } from '@lib/state/app.svelte.ts'
import { isPointVisible } from '@lib/utils/geo-data'
import type { SemanticNeighborDetail } from '@lib/types/business'
import type { WalkCandidate } from '@lib/journey/thread-model'
import {
    getSemanticThreadCandidates,
    getGeometricThreadCandidates,
    getThreadCandidatesForIndex,
    normalizeLeadId
} from './thread-model'
import { valueArray, candidateIndex, normalizeThreadCandidates, finiteIndexList } from './neighborhood-helpers'
import type { ThreadCandidateLike } from './neighborhood-helpers'
// Re-export manifest types and builder for backward-compatible imports.
export {
    buildNeighborhoodManifest,
    getSemanticThreadDisplayLimit,
    getSemanticPeerThreadDisplayLimit,
    MAX_MANIFEST_CANDIDATES,
    resolveSemanticNeighbors,
    resolveGeometricNeighbors,
    type NeighborhoodManifest,
    type NeighborhoodCandidate,
    type NeighborhoodPeerThread,
    type CandidateLookup
} from './neighborhood-manifest'
import {
    buildNeighborhoodManifest,
    getSemanticThreadDisplayLimit,
    resolveSemanticNeighbors,
    resolveGeometricNeighbors,
    MAX_MANIFEST_CANDIDATES
} from './neighborhood-manifest'

/** Local alias for the candidate lookup used by buildNeighborhoodManifest
 *  in this module's bounded-state-aware call sites. */
const getCandidateForIndex = getNeighborhoodCandidateForIndex

// ── Module-level adapter state ───────────────────────────────────────────────

let boundedNeighborhoodActive = false
let boundedNeighborhoodAnchorIndex: number | null = null
let boundedNeighborhoodCandidates: number[] = []

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get neighborhood route indices from the nav state.
 * Ported from journey-neighborhood.js getNeighborhoodRouteIndices().
 */
export function getNeighborhoodRouteIndices(
    anchorIndex?: number | null,
    neighborIndices?: readonly number[]
): number[] {
    if (!Number.isFinite(anchorIndex) && !neighborIndices?.length) return []
    return [
        ...(Number.isFinite(anchorIndex) ? [anchorIndex as number] : []),
        ...(neighborIndices || []).filter((idx: number) => Number.isFinite(idx))
    ]
}

/**
 * Check if a bounded neighborhood is active.
 * Ported from journey-neighborhood.js isBoundedNeighborhoodActive().
 *
 * A bounded neighborhood is active when:
 * 1. primeBoundedSemanticNeighborhoodForTraversal was called (sets the flag), OR
 * 2. The journey store has trailDepth > 0 and walkHistoryIndices has entries
 */
export function isBoundedNeighborhoodActive(_source?: string, _routeIndices?: number[]): boolean {
    if (boundedNeighborhoodActive) return true

    // Derive from journey store state
    const js = journeyStore()
    if (js.trailDepth > 0 && finiteIndexList(js.walkHistoryIndices).length > 0) return true

    // Check nav state for trail activity
    const nav = get(navStore)
    if (nav.trailDepth > 0 && finiteIndexList(nav.trailNeighborIndices).length > 0) return true

    return false
}

/**
 * Get the neighborhood candidate for a given index.
 * Ported from journey-neighborhood.js getNeighborhoodCandidateForIndex().
 *
 * Returns the semantic candidate entry for a given index, or creates
 * a basic one from geometric fallback.
 */
export function getNeighborhoodCandidateForIndex(
    index: number | null
): (SemanticNeighborDetail & { source: string; index: number }) | null {
    if (!Number.isFinite(index)) return null

    const idx = index as number

    // Check bounded neighborhood candidates
    if (boundedNeighborhoodActive && boundedNeighborhoodAnchorIndex !== null) {
        const pos = boundedNeighborhoodCandidates.indexOf(idx)
        if (pos >= 0) {
            return {
                ...defaultCandidateScaffold(idx),
                reason: 'bounded neighbor',
                source: 'semantic'
            }
        }
    }

    // Check thread candidates in the journey store
    const js = journeyStore()
    if (normalizeThreadCandidates(js.threadCandidates).includes(idx)) {
        const reason = js.threadReasonByIndex.get(idx) ?? 'semantic neighbor'
        return {
            ...defaultCandidateScaffold(idx),
            reason,
            source: js.threadSource
        }
    }

    // Default: report as semantic neighbor (the index exists in the dataset)
    return {
        ...defaultCandidateScaffold(idx),
        reason: 'semantic neighbor',
        source: 'semantic'
    }
}

/** Build a fully-typed SemanticNeighborDetail scaffold with sensible defaults
 *  for callers that only have an index. The `score`/`semanticScore` fields
 *  default to 0 since the lightweight caller path doesn't compute them. */
function defaultCandidateScaffold(idx: number): SemanticNeighborDetail & { index: number } {
    return {
        index: idx,
        leadId: '',
        score: 0,
        semanticScore: 0,
        sameCity: false,
        sameStatus: false,
        bridgeScore: 0,
        signalScore: 0,
        threadType: 'semantic',
        relationshipRole: 'support',
        relationshipAxis: '',
        roleReason: '',
        reason: 'semantic neighbor'
    }
}

/**
 * Get the next walk candidate for a given index.
 * Ported from journey-neighborhood.js getNextWalkCandidateForIndex().
 *
 * Resolves candidates from the semantic neighbor map (preferred) or
 * geometric fallback, then returns the first unvisited candidate.
 */
export function getNextWalkCandidateForIndex(
    currentIndex: number,
    options: {
        requireSemantic?: boolean
        requireOnCanvas?: boolean
        commitNeighborhood?: boolean
        allowNeighborhood?: boolean
    } = {}
): WalkCandidate | null {
    if (!Number.isFinite(currentIndex)) return null

    const idx = currentIndex as number
    const js = journeyStore()

    // Build exclusion set (already visited)
    const visited = new Set<number>([...finiteIndexList(js.walkHistoryIndices), idx])

    // 1. Try semantic neighbors first
    if (options.requireSemantic !== false) {
        const semanticCandidates = resolveSemanticNeighbors(idx, MAX_MANIFEST_CANDIDATES)
        for (const c of semanticCandidates) {
            if (!visited.has(c.index)) {
                if (options.commitNeighborhood) {
                    setTrailNeighborIndices([c.index])
                }
                return {
                    index: c.index,
                    reason: c.reason,
                    source: 'semantic',
                    semanticScore: c.score,
                    score: c.score
                }
            }
        }
    }

    // 2. Try bounded neighborhood candidates
    if (boundedNeighborhoodActive && boundedNeighborhoodCandidates.length > 0) {
        for (const cIdx of boundedNeighborhoodCandidates) {
            if (!visited.has(cIdx)) {
                return {
                    index: cIdx,
                    reason: 'bounded neighbor',
                    source: 'semantic',
                    score: 0.5
                }
            }
        }
    }

    // 3. Geometric fallback (if semantic not required)
    if (options.requireSemantic !== true) {
        const geoCandidates = resolveGeometricNeighbors(idx, 10)
        for (const c of geoCandidates) {
            if (!visited.has(c.index)) {
                if (options.commitNeighborhood) {
                    setTrailNeighborIndices([c.index])
                }
                return {
                    index: c.index,
                    reason: c.reason,
                    source: 'geometric-fallback',
                    score: c.score
                }
            }
        }
    }

    return null
}

/**
 * Get the bounded neighborhood walk candidate.
 * Ported from journey-neighborhood.js getBoundedNeighborhoodWalkCandidate().
 *
 * When a bounded neighborhood is active, returns the next candidate
 * at the given step, or picks the best unvisited candidate from the
 * bounded candidate list.
 */
export function getBoundedNeighborhoodWalkCandidate(
    step?: number,
    currentIndex?: number | null,
    options?: { commit?: boolean }
): { index: number; reason?: string; source?: string } | null {
    if (!boundedNeighborhoodActive) return null

    const idx = (currentIndex ?? boundedNeighborhoodAnchorIndex) as number
    if (!Number.isFinite(idx)) return null

    const js = journeyStore()
    const visited = new Set<number>([...finiteIndexList(js.walkHistoryIndices), idx])

    // Walk candidate list from the step offset or from the start
    const start = step !== undefined && Number.isFinite(step) && step > 0 ? step : 0

    for (let i = start; i < boundedNeighborhoodCandidates.length; i++) {
        const cIdx = boundedNeighborhoodCandidates[i] as number
        if (!visited.has(cIdx)) {
            if (options?.commit) {
                // Commit means advance the trail cursor and record this candidate
                setTrailNeighborIndices([cIdx])
            }
            return {
                index: cIdx,
                reason: 'bounded walk',
                source: 'semantic'
            }
        }
    }

    return null
}

/**
 * Get the current trail focus index.
 * Ported from journey-neighborhood.js getCurrentTrailFocusIndex().
 */
export function getCurrentTrailFocusIndex(focusedIndex: number | null): number | null {
    if (Number.isFinite(focusedIndex)) return focusedIndex

    // Fall back to the trail seed
    const js = journeyStore()
    return js.trailSeedIndex ?? null
}

/**
 * Prime the bounded semantic neighborhood for traversal.
 * Ported from journey-neighborhood.js primeBoundedSemanticNeighborhoodForTraversal().
 *
 * Resolves semantic neighbors for the seed index, populates the bounded
 * candidate list, and updates the journey store with trail seed + neighbors.
 * Returns true if candidates were found.
 */
export function primeBoundedSemanticNeighborhoodForTraversal(seedIndex: number): boolean {
    if (!Number.isFinite(seedIndex) || seedIndex < 0) return false

    const records = get(businessRecords)
    if (!records.length) return false

    const candidates = resolveSemanticNeighbors(seedIndex, MAX_MANIFEST_CANDIDATES)

    // Supplement with geometric fallback if semantic alone is sparse
    const allIndices = candidates.map((c) => c.index)
    if (allIndices.length < 6) {
        const geoCandidates = resolveGeometricNeighbors(seedIndex, 12)
        const existingSet = new Set(allIndices)
        existingSet.add(seedIndex)
        for (const g of geoCandidates) {
            if (!existingSet.has(g.index)) {
                allIndices.push(g.index)
                existingSet.add(g.index)
            }
        }
    }

    // Set bounded neighborhood state
    boundedNeighborhoodActive = true
    boundedNeighborhoodAnchorIndex = seedIndex
    boundedNeighborhoodCandidates = allIndices

    // Update journey store
    setTrailSeedIndex(seedIndex)
    setTrailNeighborIndices(allIndices)

    // Update nav store trail state
    const cur = get(navStore)
    writeNavStateMirror({
        trailSeedIndex: seedIndex,
        trailNeighborIndices: allIndices,
        trailDepth: Math.max(cur.trailDepth, 1),
        neighborhoodIndices: allIndices
    })

    return allIndices.length > 0
}

/**
 * Initialize the journey neighborhood adapter.
 * Ported from journey-neighborhood.js initJourneyNeighborhoodAdapter().
 *
 * Stores the adapter dependencies (bridge callbacks) for use by
 * bounded neighborhood walk and thread candidate resolution.
 */
export function initJourneyNeighborhoodAdapter(
    _deps: {
        isThreadCandidateVisibleOnCanvas?: (index: number) => boolean
        setTrailFromSeed?: (seedIndex: number) => void
        applyLocalNeighborhoodFocus?: (seedIndex: number) => void
    } = {}
): void {
    // Adapter deps were migrated to direct module-level function imports during
    // W48 any-tightening. This no-op preserves the public API for callers
    // that still invoke the bridge function.
}

/**
 * Reset bounded neighborhood state. Called when returning to overview.
 */
export function resetBoundedNeighborhood(): void {
    boundedNeighborhoodActive = false
    boundedNeighborhoodAnchorIndex = null
    boundedNeighborhoodCandidates = []
}

/**
 * Get the semantic neighbor record between a source and a target.
 * Ported from journey-neighborhood.js getSemanticNeighborRecordBetween().
 */
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

/**
 * Ensure the bounded neighborhood is configured from the active focus pocket.
 * Ported from journey-neighborhood.js ensureBoundedNeighborhoodFromActivePocket().
 */
export function ensureBoundedNeighborhoodFromActivePocket(seedIndex: number): void {
    if (!Number.isFinite(seedIndex)) return
    const nav = appState.navState
    if (isBoundedNeighborhoodActive()) {
        if (nav.focusPocketMeta && !nav.focusPocketMeta.boundedLoop) {
            nav.focusPocketMeta = {
                ...nav.focusPocketMeta,
                boundedLoop: true,
                motifLabel: String(nav.focusPocketMeta?.motifLabel ?? '') || 'selected neighborhood loop'
            } as NonNullable<typeof nav.focusPocketMeta>
        }
        if (!nav.neighborhoodManifest) {
            nav.neighborhoodManifest = buildNeighborhoodManifest(seedIndex, finiteIndexList(nav.neighborhoodIndices), {
                displayLimit: getSemanticThreadDisplayLimit(),
                getCandidateForIndex
            })
        }
        return
    }
    if (!nav.focusPocketMeta?.active) return
    const hasSemanticSource =
        nav.threadSource === 'semantic' ||
        valueArray(nav.threadCandidates).some(
            (candidate: unknown) => (candidate as ThreadCandidateLike & { source?: string })?.source === 'semantic'
        ) ||
        String(nav.focusPocketMeta?.motifLabel ?? '')
            .toLowerCase()
            .includes('semantic')
    if (!hasSemanticSource) return
    const limit = getSemanticThreadDisplayLimit()
    const threadRoute = valueArray(nav.threadCandidates)
        .filter((candidate: unknown) => (candidate as { source?: string } | null)?.source === 'semantic')
        .map((candidate: unknown) => candidateIndex(candidate))
        .filter((index): index is number => index !== null)
    const pocketRoute = [...threadRoute, ...finiteIndexList(nav.focusPocketIndices)]
        .filter((candidateIndex: number) => Number.isFinite(candidateIndex) && candidateIndex !== seedIndex)
        .filter((candidateIndex: number) => {
            const role = nav.focusPocketRoleByIndex?.get(candidateIndex)
            return !role || role === 'primary' || role === 'support'
        })
        .filter((candidateIndex: number, order: number, list: number[]) => list.indexOf(candidateIndex) === order)
        .slice(0, limit)
    if (!pocketRoute.length) return
    const manifest = buildNeighborhoodManifest(seedIndex, pocketRoute, { displayLimit: limit, getCandidateForIndex })
    if (!manifest?.candidateIndices?.length) return
    nav.neighborhoodAnchorIndex = seedIndex
    nav.neighborhoodIndices = manifest.candidateIndices
    nav.neighborhoodReasonByIndex = new Map(
        manifest.candidateIndices.map((candidateIndex) => [
            candidateIndex,
            manifest.candidates?.get(candidateIndex)?.reason ||
                nav.threadReasonByIndex?.get(candidateIndex) ||
                getNeighborhoodCandidateForIndex(candidateIndex)?.reason ||
                'tied stop in this selected neighborhood'
        ])
    )
    nav.neighborhoodSource = 'semantic'
    nav.neighborhoodManifest = manifest
    nav.focusPocketMeta = {
        ...(nav.focusPocketMeta || ({} as NonNullable<typeof nav.focusPocketMeta>)),
        boundedLoop: true,
        motifLabel: 'selected neighborhood loop'
    } as NonNullable<typeof nav.focusPocketMeta>
}

/**
 * Configure and set trail state from a given seed index.
 * Ported from journey-neighborhood.js setTrailFromSeed().
 */
export function setTrailFromSeed(seedIndex: number): void {
    const semanticCandidates = getSemanticThreadCandidates(seedIndex)
    const limit = getSemanticThreadDisplayLimit()
    const allCandidates = (
        semanticCandidates.length ? semanticCandidates : getGeometricThreadCandidates(seedIndex)
    ).sort((a, b) => {
        const as = a.semanticScore || 0
        const bs = b.semanticScore || 0
        if (bs !== as) return bs - as
        const sa = a.score || 0
        const sb = b.score || 0
        if (sb !== sa) return sb - sa
        return a.index - b.index
    })
    const records = get(businessRecords)
    const filters = appState.activeFilters
    const candidates = allCandidates
        .filter((candidate) => isPointVisible(candidate.index, records, null, filters))
        .slice(0, limit)
    const source = semanticCandidates.length ? 'semantic' : candidates[0]?.source || 'geometric-fallback'
    const reasonByIndex = new Map<number, string>(
        candidates.map((candidate) => [candidate.index, candidate.reason || ''])
    )
    const neighborIndices = candidates.map((candidate) => candidate.index)
    const nav = appState.navState
    const cursor = (() => {
        const tc = candidates.findIndex((candidate) => candidate.index === nav.focusedIndex)
        return tc >= 0 ? tc : 0
    })()

    writeNavStateMirror({
        trailSeedIndex: seedIndex,
        threadCandidates: candidates,
        threadSource: source,
        threadReasonByIndex: reasonByIndex,
        trailNeighborIndices: neighborIndices,
        trailCursor: cursor
    })
}

/**
 * Update the trail indices set.
 * Ported from journey-neighborhood.js updateTrailIndices().
 */
export function updateTrailIndices(
    seedIndex: number | null = getCurrentTrailFocusIndex(appState.navState.focusedIndex)
): void {
    appState.trailIndices.clear()
    const records = get(businessRecords)
    if (seedIndex === null || seedIndex === undefined || seedIndex < 0 || seedIndex >= records.length) return
    const nav = appState.navState
    const filters = appState.activeFilters
    if (!isPointVisible(seedIndex, records, null, filters)) return
    appState.trailIndices.add(seedIndex)
    const limit = getSemanticThreadDisplayLimit()
    const candidates = valueArray(nav.threadCandidates).length
        ? valueArray(nav.threadCandidates)
        : getThreadCandidatesForIndex(seedIndex).slice(0, limit)
    candidates
        .map((candidate: unknown) => candidateIndex(candidate))
        .filter((index): index is number => index !== null && isPointVisible(index, records, null, filters))
        .forEach((index: number) => appState.trailIndices.add(index))
}
