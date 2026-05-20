import { state } from '../state.js';
import {
    normalizeCityForFilter
} from '../utils.js';

export function normalizeLeadId(value) {
    if (value === null || value === undefined || value === '') return null;
    return String(value);
}

export function buildSpatialGrid(cellSize = 0.12) {
    const grid = new Map();
    for (let i = 0; i < state.originalPositions.length; i++) {
        const pos = state.originalPositions[i];
        const key = `${Math.floor(pos.x / cellSize)},${Math.floor(pos.y / cellSize)},${Math.floor(pos.z / cellSize)}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
    }
    return { grid, cellSize };
}

export function buildProjectedNeighborGrid() {
    if (state.projectedNeighborGrid) return state.projectedNeighborGrid;
    state.projectedNeighborGrid = buildSpatialGrid(0.12);
    return state.projectedNeighborGrid;
}

export function getProjectedNeighborCandidates(index) {
    if (state.projectedNeighborCache.has(index)) {
        return state.projectedNeighborCache.get(index);
    }

    const { grid, cellSize } = buildProjectedNeighborGrid();
    const origin = state.originalPositions[index];
    if (!origin) return [];

    const gx = Math.floor(origin.x / cellSize);
    const gy = Math.floor(origin.y / cellSize);
    const gz = Math.floor(origin.z / cellSize);
    const candidates = [];
    const seen = new Set();

    for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dz = -2; dz <= 2; dz++) {
                const bucket = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
                if (!bucket) continue;
                for (const otherIndex of bucket) {
                    if (otherIndex === index || seen.has(otherIndex)) continue;
                    if (!Number.isFinite(otherIndex) || otherIndex < 0 || otherIndex >= state.points.length) continue;
                    if (!Number.isFinite(index) || index < 0 || index >= state.points.length) continue;
                    const other = state.originalPositions[otherIndex];
                    if (!other) continue;
                    const ox = other.x, oy = other.y, oz = other.z;
                    if (!Number.isFinite(ox) || !Number.isFinite(oy) || !Number.isFinite(oz)) continue;
                    const dist = Math.hypot(ox - origin.x, oy - origin.y, oz - origin.z);
                    if (!Number.isFinite(dist)) continue;
                    const selfCity = state.points[index]?.city;
                    const otherCity = state.points[otherIndex]?.city;
                    let score = 1 / Math.max(dist, 0.0001);
                    if (normalizeCityForFilter(otherCity) === normalizeCityForFilter(selfCity)) score += 0.9;
                    score += (Number.isFinite(state.signalScores[otherIndex]) ? state.signalScores[otherIndex] : 0) * 0.12;
                    score += (Number.isFinite(state.bridgeScores[otherIndex]) ? state.bridgeScores[otherIndex] : 0) * 0.08;
                    const selfCluster = state.points[index]?.cluster;
                    const otherCluster = state.points[otherIndex]?.cluster;
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

    state.projectedNeighborCache.set(index, ranked);
    return ranked;
}

export function getSemanticThreadCandidates(index) {
    if (!Number.isFinite(index) || index < 0 || index >= state.points.length) return [];
    const point = state.points[index];
    const leadId = normalizeLeadId(point?.lead_id);
    if (!leadId) return [];

    const threadNode = state.semanticNeighborMapByLeadId.get(leadId);
    if (!threadNode?.neighbors?.length) return [];

    return threadNode.neighbors
        .map((neighbor) => {
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
                reason: neighbor.reason || 'semantic neighbor',
                source: 'semantic'
            };
        })
        .filter(Boolean);
}

export function getGeometricThreadCandidates(index) {
    if (!Number.isFinite(index) || index < 0 || index >= state.points.length) return [];
    const selfCity = state.points[index]?.city;
    const selfStatus = state.points[index]?.status || 'active';
    return getProjectedNeighborCandidates(index).map((candidateIndex) => ({
        index: candidateIndex,
        score: 0,
        semanticScore: 0,
        sameCity: normalizeCityForFilter(state.points[candidateIndex]?.city) === selfCity,
        sameStatus: (state.points[candidateIndex]?.status || 'active') === selfStatus,
        bridgeScore: state.bridgeScores[candidateIndex] || 0,
        signalScore: state.signalScores[candidateIndex] || 0,
        threadType: 'approximate_projected_neighbor',
        reason: 'approximate projected neighbor from the current cloud layout',
        source: 'geometric-fallback'
    }));
}

export function getThreadCandidatesForIndex(index) {
    const semanticCandidates = getSemanticThreadCandidates(index);
    if (semanticCandidates.length) return semanticCandidates;
    return getGeometricThreadCandidates(index);
}
