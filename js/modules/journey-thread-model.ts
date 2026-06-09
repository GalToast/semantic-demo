// @ts-nocheck
/**
 * journey-thread-model.ts — TypeScript shadow of journey-thread-model.js
 */
import { state } from '../state.ts';
import { normalizeCityForFilter } from './utils/geo-data.ts';
import { normalizeRelationshipRole } from './relationship-roles.ts';
import type { Point } from '../../types/state.ts';

export function normalizeLeadId(value: string | number | null | undefined): string | null {
    if (value === null || value === undefined || value === '') return null;
    return String(value);
}

export interface ThreadCandidate {
    index: number;
    score: number;
    semanticScore: number;
    sameCity: boolean;
    sameStatus: boolean;
    bridgeScore: number;
    signalScore: number;
    threadType: string;
    relationshipRole: string;
    relationshipAxis: string;
    roleReason: string;
    reason: string;
    source: string;
    [key: string]: unknown;
}

export function getNextExploreCandidateForIndex(
    currentIndex: number | null,
    getNextWalkCandidateFn: (idx: number | null, opts?: Record<string, unknown>) => ThreadCandidate | null,
    options: Record<string, unknown> = {}
): ThreadCandidate | null {
    if (typeof getNextWalkCandidateFn !== 'function') return null;
    return (
        getNextWalkCandidateFn(currentIndex, {
            requireSemantic: true,
            requireOnCanvas: true,
            commitNeighborhood: false,
            ...options
        }) ||
        getNextWalkCandidateFn(currentIndex, {
            requireSemantic: false,
            requireOnCanvas: false,
            commitNeighborhood: false,
            ...options
        }) ||
        null
    );
}

export interface SpatialGrid {
    grid: Map<string, number[]>;
    cellSize: number;
}

export function buildSpatialGrid(cellSize: number = 0.12): SpatialGrid {
    const grid = new Map<string, number[]>();
    for (let i = 0; i < (state.originalPositions as any[]).length; i++) {
        const pos = (state.originalPositions as any[])[i];
        const key = `${Math.floor(pos.x / cellSize)},${Math.floor(pos.y / cellSize)},${Math.floor(pos.z / cellSize)}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(i);
    }
    return { grid, cellSize };
}

export function buildProjectedNeighborGrid(): SpatialGrid {
    if (state.projectedNeighborGrid) return state.projectedNeighborGrid as SpatialGrid;
    state.projectedNeighborGrid = buildSpatialGrid(0.12) as any;
    return state.projectedNeighborGrid as unknown as SpatialGrid;
}

export function getProjectedNeighborCandidates(index: number): number[] {
    if ((state.projectedNeighborCache as Map<number, number[]>).has(index)) {
        return (state.projectedNeighborCache as Map<number, number[]>).get(index)!;
    }

    const { grid, cellSize } = buildProjectedNeighborGrid();
    const origin = (state.originalPositions as any[])[index];
    if (!origin) return [];

    const gx = Math.floor(origin.x / cellSize);
    const gy = Math.floor(origin.y / cellSize);
    const gz = Math.floor(origin.z / cellSize);
    const candidates: Array<{ index: number; score: number; dist: number }> = [];
    const seen = new Set<number>();

    for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dz = -2; dz <= 2; dz++) {
                const bucket = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
                if (!bucket) continue;
                for (const otherIndex of bucket) {
                    if (otherIndex === index || seen.has(otherIndex)) continue;
                    if (!Number.isFinite(otherIndex) || otherIndex < 0 || otherIndex >= state.points.length) continue;
                    if (!Number.isFinite(index) || index < 0 || index >= state.points.length) continue;
                    const other = (state.originalPositions as any[])[otherIndex];
                    if (!other) continue;
                    const ox = other.x, oy = other.y, oz = other.z;
                    if (!Number.isFinite(ox) || !Number.isFinite(oy) || !Number.isFinite(oz)) continue;
                    const dist = Math.hypot(ox - origin.x, oy - origin.y, oz - origin.z);
                    if (!Number.isFinite(dist)) continue;
                    const selfCity = (state.points[index] as any)?.city;
                    const otherCity = (state.points[otherIndex] as any)?.city;
                    let score = 1 / Math.max(dist, 0.0001);
                    if (normalizeCityForFilter(otherCity) === normalizeCityForFilter(selfCity)) score += 0.9;
                    score += (Number.isFinite((state.signalScores as number[])[otherIndex]) ? (state.signalScores as number[])[otherIndex] : 0) * 0.12;
                    score += (Number.isFinite((state.bridgeScores as number[])[otherIndex]) ? (state.bridgeScores as number[])[otherIndex] : 0) * 0.08;
                    const selfCluster = (state.points[index] as any)?.cluster;
                    const otherCluster = (state.points[otherIndex] as any)?.cluster;
                    if (otherCluster === selfCluster && Number.isFinite(selfCluster)) score += 0.45;

                    candidates.push({ index: otherIndex, score, dist });
                }
            }
        }
    }

    const ranked = candidates
        .sort((a, b) => b.score - a.score || a.dist - b.dist)
        .slice(0, 24)
        .map((entry) => entry.index);

    (state.projectedNeighborCache as Map<number, number[]>).set(index, ranked);
    return ranked;
}

export function getSemanticThreadCandidates(index: number): ThreadCandidate[] {
    if (!Number.isFinite(index) || index < 0 || index >= state.points.length) return [];
    const point = state.points[index];
    const leadId = normalizeLeadId((point as any)?.lead_id);
    if (!leadId) return [];

    const threadNode = state.semanticNeighborMapByLeadId.get(leadId);
    if (!threadNode?.neighbors?.length) return [];

    return (threadNode.neighbors as any[])
        .map((neighbor: any) => {
            const candidateIndex = state.pointIndexByLeadId.get(neighbor.leadId);
            if (candidateIndex === undefined || candidateIndex === index) return null;

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
            };
        })
        .filter((c): c is ThreadCandidate => c !== null);
}

export function getGeometricThreadCandidates(index: number): ThreadCandidate[] {
    if (!Number.isFinite(index) || index < 0 || index >= state.points.length) return [];
    const selfCity = normalizeCityForFilter((state.points[index] as any)?.city);
    const selfStatus = (state.points[index] as any)?.status || 'active';
    return getProjectedNeighborCandidates(index).map((candidateIndex) => ({
        index: candidateIndex,
        score: 0,
        semanticScore: 0,
        sameCity: normalizeCityForFilter((state.points[candidateIndex] as any)?.city) === selfCity,
        sameStatus: ((state.points[candidateIndex] as any)?.status || 'active') === selfStatus,
        bridgeScore: (state.bridgeScores as number[])[candidateIndex] || 0,
        signalScore: (state.signalScores as number[])[candidateIndex] || 0,
        threadType: 'approximate_projected_neighbor',
        reason: 'approximate projected neighbor from the current cloud layout',
        source: 'geometric-fallback',
        relationshipRole: 'unclassified',
        relationshipAxis: '',
        roleReason: ''
    }));
}

export function getThreadCandidatesForIndex(index: number): ThreadCandidate[] {
    const semanticCandidates = getSemanticThreadCandidates(index);
    if (semanticCandidates.length) return semanticCandidates;
    return getGeometricThreadCandidates(index);
}
