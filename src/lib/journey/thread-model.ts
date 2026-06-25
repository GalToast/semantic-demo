/**
 * @lib/journey/thread-model.ts — Thread candidate derivation
 *
 * Ported from:
 *
 * Dual API surface:
 *   - Pure derivation functions (explicit params) — used by focus personality,
 *     thread settler, and semantic dive.
 *   - Legacy-compatible wrappers (zero-param, read from state) — consumed by
 *     the engine bridge so journey.ts never imports directly from js/.
 */

import type { BusinessRecord } from '@lib/types/business'
import type { Point3D } from '@lib/types/webgl'
import { appState as state } from '@lib/state/app.svelte'
import { normalizeCityForFilter } from '@lib/utils/geo-data'
import {
    normalizeRelationshipRole,
    type RelationshipRole,
    UNCLASSIFIED_RELATIONSHIP_ROLE
} from '@lib/utils/relationship-roles'

function getNumericAt(values: readonly number[], index: number): number {
    const value = values[index]
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function normalizeLeadId(value: string | number | null | undefined): string | null {
    if (value === null || value === undefined || value === '') return null
    return String(value)
}

/**
 * Try-semantic-then-fallback wrapper over getNextWalkCandidateForIndex.
 * Exists as a pure helper so callers can share the same candidate fallback
 * without importing journey.ts and creating lifecycle cycles.
 */
export function getNextExploreCandidateForIndex(
    currentIndex: number | null,
    getNextWalkCandidateFn: (index: number, options: WalkCandidateOptions) => WalkCandidate | null,
    options: WalkCandidateOptions = {}
): WalkCandidate | null {
    if (typeof getNextWalkCandidateFn !== 'function') return null

    return (
        getNextWalkCandidateFn(currentIndex!, {
            requireSemantic: true,
            requireOnCanvas: true,
            commitNeighborhood: false,
            ...options
        }) ||
        getNextWalkCandidateFn(currentIndex!, {
            requireSemantic: false,
            requireOnCanvas: false,
            commitNeighborhood: false,
            ...options
        }) ||
        null
    )
}

export interface WalkCandidateOptions {
    requireSemantic?: boolean
    requireOnCanvas?: boolean
    commitNeighborhood?: boolean
    [key: string]: unknown
}

export interface WalkCandidate {
    index: number
    score?: number
    semanticScore?: number
    sameCity?: boolean
    sameStatus?: boolean
    bridgeScore?: number
    signalScore?: number
    threadType?: string
    relationshipRole?: string
    relationshipAxis?: string
    roleReason?: string
    reason?: string
    source?: string
}

export interface SpatialGrid {
    grid: Map<string, number[]>
    cellSize: number
}

export interface ThreadCandidate {
    index: number
    score: number
    semanticScore: number
    sameCity: boolean
    sameStatus: boolean
    bridgeScore: number
    signalScore: number
    threadType: string
    relationshipRole: RelationshipRole
    relationshipAxis: string
    roleReason: string
    reason: string
    source: string
    [key: string]: unknown
}

/* ── buildSpatialGrid ───────────────────────────────────────────────────── */

export function buildSpatialGrid(cellSize?: number): SpatialGrid
export function buildSpatialGrid(originalPositions: readonly Point3D[], cellSize?: number): SpatialGrid
export function buildSpatialGrid(arg1?: number | readonly Point3D[], arg2?: number): SpatialGrid {
    const cellSize = Array.isArray(arg1) && arg2 !== undefined ? arg2 : typeof arg1 === 'number' ? arg1 : 0.12

    const originalPositions = Array.isArray(arg1)
        ? arg1
        : ((state.originalPositions as unknown as readonly Point3D[]) ?? [])

    const grid = new Map<string, number[]>()
    for (let i = 0; i < originalPositions.length; i++) {
        const pos = originalPositions[i]
        if (!pos) continue
        const key = `${Math.floor(pos.x / cellSize)},${Math.floor(pos.y / cellSize)},${Math.floor(pos.z / cellSize)}`
        if (!grid.has(key)) grid.set(key, [])
        grid.get(key)!.push(i)
    }
    return { grid, cellSize }
}

/* ── buildProjectedNeighborGrid ─────────────────────────────────────────── */

export function buildProjectedNeighborGrid(): SpatialGrid {
    if (state.projectedNeighborGrid) {
        return state.projectedNeighborGrid
    }
    state.projectedNeighborGrid = buildSpatialGrid(0.12)
    return state.projectedNeighborGrid
}

/* ── getProjectedNeighborCandidates ─────────────────────────────────────── */

export function getProjectedNeighborCandidates(index: number): number[]
export function getProjectedNeighborCandidates(
    index: number,
    originalPositions: readonly Point3D[],
    points: readonly BusinessRecord[],
    signalScores: readonly number[],
    bridgeScores: readonly number[],
    projectedNeighborGrid: SpatialGrid,
    projectedNeighborCache: Map<number, number[]>
): number[]
export function getProjectedNeighborCandidates(index: number, ...args: unknown[]): number[] {
    if (args.length >= 6) {
        // Pure path
        const [originalPositions, points, signalScores, bridgeScores, projectedNeighborGrid, projectedNeighborCache] =
            args as [
                readonly Point3D[],
                readonly BusinessRecord[],
                readonly number[],
                readonly number[],
                SpatialGrid,
                Map<number, number[]>
            ]

        if (projectedNeighborCache.has(index)) {
            return projectedNeighborCache.get(index)!
        }

        const { grid, cellSize } = projectedNeighborGrid
        const origin = originalPositions[index]
        if (!origin) return []
        if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(origin.z)) return []

        const gx = Math.floor(origin.x / cellSize)
        const gy = Math.floor(origin.y / cellSize)
        const gz = Math.floor(origin.z / cellSize)
        const candidates: Array<{ index: number; score: number; dist: number }> = []
        const seen = new Set<number>()

        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                for (let dz = -2; dz <= 2; dz++) {
                    const bucket = grid.get(`${gx + dx},${gy + dy},${gz + dz}`)
                    if (!bucket) continue
                    for (const otherIndex of bucket) {
                        if (otherIndex === index || seen.has(otherIndex)) continue
                        if (!Number.isFinite(otherIndex) || otherIndex < 0 || otherIndex >= points.length) continue
                        const pos = originalPositions[otherIndex]
                        if (!pos) continue
                        const ox = pos.x,
                            oy = pos.y,
                            oz = pos.z
                        if (!Number.isFinite(ox) || !Number.isFinite(oy) || !Number.isFinite(oz)) continue
                        const dist = Math.hypot(ox - origin.x, oy - origin.y, oz - origin.z)
                        if (!Number.isFinite(dist)) continue
                        const selfCity = points[index]?.city ?? ''
                        const otherCity = points[otherIndex]?.city ?? ''
                        let score = 1 / Math.max(dist, 0.0001)
                        if (normalizeCityForFilter(otherCity) === normalizeCityForFilter(selfCity)) score += 0.9
                        score += getNumericAt(signalScores, otherIndex) * 0.12
                        score += getNumericAt(bridgeScores, otherIndex) * 0.08
                        const selfCluster = points[index]?.cluster
                        const otherCluster = points[otherIndex]?.cluster
                        if (otherCluster === selfCluster && Number.isFinite(selfCluster)) score += 0.45

                        candidates.push({ index: otherIndex, score, dist })
                    }
                }
            }
        }

        const ranked = candidates
            .sort((a, b) => b.score - a.score || a.dist - b.dist)
            .slice(0, 24)
            .map((entry) => entry.index)

        projectedNeighborCache.set(index, ranked)
        return ranked
    }

    // Legacy path — read from state
    const cache = (state.projectedNeighborCache as Map<number, number[]> | undefined) ?? new Map()
    if (cache.has(index)) {
        return cache.get(index)!
    }

    const { grid, cellSize } = buildProjectedNeighborGrid()
    const originalPositions = (state.originalPositions as unknown as readonly Point3D[]) ?? []
    const origin = originalPositions[index]
    if (!origin) return []
    if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(origin.z)) return []

    const gx = Math.floor(origin.x / cellSize)
    const gy = Math.floor(origin.y / cellSize)
    const gz = Math.floor(origin.z / cellSize)
    const candidates: Array<{ index: number; score: number; dist: number }> = []
    const seen = new Set<number>()
    const points = (state.points as unknown as readonly BusinessRecord[]) ?? []

    for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dz = -2; dz <= 2; dz++) {
                const bucket = grid.get(`${gx + dx},${gy + dy},${gz + dz}`)
                if (!bucket) continue
                for (const otherIndex of bucket) {
                    if (otherIndex === index || seen.has(otherIndex)) continue
                    if (!Number.isFinite(otherIndex) || otherIndex < 0 || otherIndex >= points.length) continue
                    if (!Number.isFinite(index) || index < 0 || index >= points.length) continue
                    const pos = originalPositions[otherIndex]
                    if (!pos) continue
                    const ox = pos.x,
                        oy = pos.y,
                        oz = pos.z
                    if (!Number.isFinite(ox) || !Number.isFinite(oy) || !Number.isFinite(oz)) continue
                    const dist = Math.hypot(ox - origin.x, oy - origin.y, oz - origin.z)
                    if (!Number.isFinite(dist)) continue
                    const selfCity = points[index]?.city
                    const otherCity = points[otherIndex]?.city
                    let score = 1 / Math.max(dist, 0.0001)
                    if (normalizeCityForFilter(otherCity) === normalizeCityForFilter(selfCity)) score += 0.9
                    score += getNumericAt(state.signalScores as number[], otherIndex) * 0.12
                    score += getNumericAt(state.bridgeScores as number[], otherIndex) * 0.08
                    const selfCluster = points[index]?.cluster
                    const otherCluster = points[otherIndex]?.cluster
                    if (otherCluster === selfCluster && Number.isFinite(selfCluster)) score += 0.45

                    candidates.push({ index: otherIndex, score, dist })
                }
            }
        }
    }

    const ranked = candidates
        .sort((a, b) => b.score - a.score || a.dist - b.dist)
        .slice(0, 24)
        .map((entry) => entry.index)

    cache.set(index, ranked)
    state.projectedNeighborCache = cache
    return ranked
}

/* ── getSemanticThreadCandidates ────────────────────────────────────────── */

export function getSemanticThreadCandidates(index: number): ThreadCandidate[]
export function getSemanticThreadCandidates(
    index: number,
    points: readonly BusinessRecord[],
    semanticNeighborMapByLeadId: Map<
        string,
        {
            neighbors: Array<{
                leadId: string
                score?: number
                semanticScore?: number
                sameCity?: boolean
                sameStatus?: boolean
                bridgeScore?: number
                signalScore?: number
                threadType?: string
                relationshipRole?: string
                relationshipAxis?: string
                roleReason?: string
                reason?: string
            }>
        }
    >,
    pointIndexByLeadId: Map<string, number>
): ThreadCandidate[]
export function getSemanticThreadCandidates(index: number, ...args: unknown[]): ThreadCandidate[] {
    if (args.length >= 3) {
        // Pure path
        const [points, semanticNeighborMapByLeadId, pointIndexByLeadId] = args as [
            readonly BusinessRecord[],
            Map<string, { neighbors: Array<SemanticNeighborDetail> }>,
            Map<string, number>
        ]
        if (!Number.isFinite(index) || index < 0 || index >= points.length) return []
        const point = points[index]
        const leadId = normalizeLeadId(point?.lead_id)
        if (!leadId) return []

        const threadNode = semanticNeighborMapByLeadId.get(leadId)
        if (!threadNode?.neighbors?.length) return []

        const results: ThreadCandidate[] = []
        for (const neighbor of threadNode.neighbors) {
            const candidateIndex = pointIndexByLeadId.get(neighbor.leadId)
            if (candidateIndex === undefined || candidateIndex === index) continue

            const n = neighbor
            const score = Number.isFinite(n.score) ? n.score! : 0
            const semanticScore = Number.isFinite(n.semanticScore) ? n.semanticScore! : 0
            const bridgeScore = Number.isFinite(n.bridgeScore) ? n.bridgeScore! : 0
            const signalScore = Number.isFinite(n.signalScore) ? n.signalScore! : 0

            results.push({
                index: candidateIndex,
                score,
                semanticScore,
                sameCity: Boolean(n.sameCity),
                sameStatus: Boolean(n.sameStatus),
                bridgeScore,
                signalScore,
                threadType: n.threadType ?? 'local_semantic_neighbor',
                relationshipRole: normalizeRelationshipRole(n.relationshipRole),
                relationshipAxis: n.relationshipAxis ?? '',
                roleReason: n.roleReason ?? '',
                reason: n.reason ?? 'semantic neighbor',
                source: 'semantic'
            })
        }
        return results
    }

    // Legacy path — read from state
    if (!Number.isFinite(index) || index < 0 || index >= state.points.length) return []
    const point = state.points[index]
    const leadId = normalizeLeadId(point?.lead_id)
    if (!leadId) return []

    const threadNode = (state.semanticNeighborMapByLeadId as Map<string, any>).get(leadId)
    if (!threadNode?.neighbors?.length) return []

    return threadNode.neighbors
        .map(
            (neighbor: {
                leadId: string
                score?: number
                semanticScore?: number
                sameCity?: boolean
                sameStatus?: boolean
                bridgeScore?: number
                signalScore?: number
                threadType?: string
                relationshipRole?: string
                relationshipAxis?: string
                roleReason?: string
                reason?: string
            }) => {
                const candidateIndex = (state.pointIndexByLeadId as Map<string, number>).get(neighbor.leadId)
                if (candidateIndex === undefined || candidateIndex === index) return null

                return {
                    index: candidateIndex,
                    score: Number.isFinite(neighbor.score) ? neighbor.score : 0,
                    semanticScore: Number.isFinite(neighbor.semanticScore) ? neighbor.semanticScore : 0,
                    sameCity: Boolean(neighbor.sameCity),
                    sameStatus: Boolean(neighbor.sameStatus),
                    bridgeScore: Number.isFinite(neighbor.bridgeScore) ? neighbor.bridgeScore : 0,
                    signalScore: Number.isFinite(neighbor.signalScore) ? neighbor.signalScore : 0,
                    threadType: neighbor.threadType || 'local_semantic_neighbor',
                    relationshipRole: normalizeRelationshipRole(neighbor.relationshipRole),
                    relationshipAxis: neighbor.relationshipAxis || '',
                    roleReason: neighbor.roleReason || '',
                    reason: neighbor.reason || 'semantic neighbor',
                    source: 'semantic'
                }
            }
        )
        .filter((c: ThreadCandidate | null): c is ThreadCandidate => c !== null)
}

/* ── getGeometricThreadCandidates ───────────────────────────────────────── */

export function getGeometricThreadCandidates(index: number): ThreadCandidate[]
export function getGeometricThreadCandidates(
    index: number,
    points: readonly BusinessRecord[],
    getProjectedNeighborCandidatesFn: (index: number) => number[],
    signalScores: readonly number[],
    bridgeScores: readonly number[]
): ThreadCandidate[]
export function getGeometricThreadCandidates(index: number, ...args: unknown[]): ThreadCandidate[] {
    if (args.length >= 4) {
        // Pure path
        const [points, getProjectedNeighborCandidatesFn, signalScores, bridgeScores] = args as [
            readonly BusinessRecord[],
            (index: number) => number[],
            readonly number[],
            readonly number[]
        ]
        if (!Number.isFinite(index) || index < 0 || index >= points.length) return []
        const selfCity = normalizeCityForFilter(points[index]?.city)
        const selfStatus = points[index]?.status ?? 'active'
        return getProjectedNeighborCandidatesFn(index).map(
            (candidateIndex): ThreadCandidate => ({
                index: candidateIndex,
                score: 0,
                semanticScore: 0,
                sameCity: normalizeCityForFilter(points[candidateIndex]?.city) === selfCity,
                sameStatus: (points[candidateIndex]?.status ?? 'active') === selfStatus,
                bridgeScore: getNumericAt(bridgeScores, candidateIndex),
                signalScore: getNumericAt(signalScores, candidateIndex),
                threadType: 'approximate_projected_neighbor',
                relationshipRole: UNCLASSIFIED_RELATIONSHIP_ROLE,
                relationshipAxis: '',
                roleReason: '',
                reason: 'approximate projected neighbor from the current cloud layout',
                source: 'geometric-fallback'
            })
        )
    }

    // Legacy path — read from state
    if (!Number.isFinite(index) || index < 0 || index >= state.points.length) return []
    const selfCity = normalizeCityForFilter(state.points[index]?.city)
    const selfStatus = state.points[index]?.status || 'active'
    return getProjectedNeighborCandidates(index).map((candidateIndex) => ({
        index: candidateIndex,
        score: 0,
        semanticScore: 0,
        sameCity: normalizeCityForFilter(state.points[candidateIndex]?.city) === selfCity,
        sameStatus: (state.points[candidateIndex]?.status || 'active') === selfStatus,
        bridgeScore: getNumericAt(state.bridgeScores as number[], candidateIndex),
        signalScore: getNumericAt(state.signalScores as number[], candidateIndex),
        threadType: 'approximate_projected_neighbor',
        relationshipRole: 'unclassified' as RelationshipRole,
        relationshipAxis: '',
        roleReason: '',
        reason: 'approximate projected neighbor from the current cloud layout',
        source: 'geometric-fallback'
    }))
}

/* ── getThreadCandidatesForIndex ────────────────────────────────────────── */

export function getThreadCandidatesForIndex(index: number): ThreadCandidate[]
export function getThreadCandidatesForIndex(
    index: number,
    getSemanticThreadCandidatesFn: (index: number) => ThreadCandidate[],
    getGeometricThreadCandidatesFn: (index: number) => ThreadCandidate[]
): ThreadCandidate[]
export function getThreadCandidatesForIndex(index: number, ...args: unknown[]): ThreadCandidate[] {
    if (args.length >= 2) {
        // Pure path
        const [getSemanticThreadCandidatesFn, getGeometricThreadCandidatesFn] = args as [
            (index: number) => ThreadCandidate[],
            (index: number) => ThreadCandidate[]
        ]
        const semanticCandidates = getSemanticThreadCandidatesFn(index)
        if (semanticCandidates.length) return semanticCandidates
        return getGeometricThreadCandidatesFn(index)
    }

    // Legacy path
    const semanticCandidates = getSemanticThreadCandidates(index)
    if (semanticCandidates.length) return semanticCandidates
    return getGeometricThreadCandidates(index)
}
