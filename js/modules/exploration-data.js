/**
 * exploration-data.js
 * Pure computational helpers for bloom/bridge index computation.
 * These functions are stateless — they accept all inputs and return
 * derived data without mutating anything.
 */

/**
 * Compute signal scores for an array of points.
 * Returns a new Float64Array (or Array) of scores, one per point.
 */
export function computeSignalScores(points) {
    const scores = new Array(points.length).fill(0);
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        let score = 0;
        if (p.website) score += 1.35;
        if (p.email) score += 1.0;
        if (p.phone) score += 0.45;
        if (p.lat && p.lng) score += 1.25;
        if (p.status === 'active') score += 0.55;
        if (p.trivia) score += 0.35;
        scores[i] = score;
    }
    return scores;
}

/**
 * Compute bloom indices from points and signal scores.
 * Returns a new Set of indices that pass the bloom threshold.
 */
export function computeBloomIndices(points, signalScores) {
    const bloomIndices = new Set();
    if (!points || points.length === 0) return bloomIndices;

    const sorted = [...signalScores].sort((a, b) => b - a);
    const threshold = sorted[Math.min(Math.floor(sorted.length * 0.12), sorted.length - 1)] || 0;
    const bloomThreshold = Math.max(threshold, 2.95);

    for (let i = 0; i < signalScores.length; i++) {
        if (signalScores[i] >= bloomThreshold) {
            bloomIndices.add(i);
        }
    }
    return bloomIndices;
}

/**
 * Compute bridge indices from points, originalPositions, and signalScores.
 * Returns { indices: Set, scores: Array } with bridge indices and per-point bridge scores.
 *
 * @param {Array} points - state.points array
 * @param {Array} originalPositions - state.originalPositions array (each has x, y, z)
 * @param {Array} signalScores - state.signalScores array
 * @param {number} [cellSize=0.12] - grid cell size
 * @param {number} [maxDist=0.17] - max neighbor distance
 * @returns {{ indices: Set, scores: Array }}
 */
export function computeBridgeIndices(points, originalPositions, signalScores, cellSize = 0.12, maxDist = 0.17) {
    const bridgeIndices = new Set();
    const bridgeScores = new Array(points?.length || 0).fill(0);
    if (!points || points.length === 0 || !originalPositions) {
        return { indices: bridgeIndices, scores: bridgeScores };
    }

    const grid = new Map();
    for (let i = 0; i < originalPositions.length; i++) {
        const pos = originalPositions[i];
        if (!pos) continue;
        const gx = Math.floor(pos.x / cellSize);
        const gy = Math.floor(pos.y / cellSize);
        const gz = Math.floor(pos.z / cellSize);
        const key = `${gx},${gy},${gz}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
    }

    for (let i = 0; i < points.length; i++) {
        const pos = originalPositions[i];
        if (!pos) continue;
        const gx = Math.floor(pos.x / cellSize);
        const gy = Math.floor(pos.y / cellSize);
        const gz = Math.floor(pos.z / cellSize);
        const foreignClusters = new Set();
        let weight = 0;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const neighbors = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
                    if (!neighbors) continue;
                    for (const j of neighbors) {
                        if (j === i) continue;
                        const neighborPos = originalPositions[j];
                        if (!neighborPos) continue;
                        const ddx = pos.x - neighborPos.x;
                        const ddy = pos.y - neighborPos.y;
                        const ddz = pos.z - neighborPos.z;
                        const d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
                        if (d > maxDist) continue;
                        if (!points[i] || !points[j]) continue;
                        const otherCluster = points[j].cluster;
                        if (otherCluster !== points[i].cluster) {
                            foreignClusters.add(otherCluster);
                            if (Number.isFinite(signalScores[j])) {
                                weight += signalScores[j] * (1 - d / maxDist);
                            }
                        }
                    }
                }
            }
        }

        bridgeScores[i] = weight;
        if (foreignClusters.size > 1 && weight >= 0.7) {
            bridgeIndices.add(i);
        }
    }
    return { indices: bridgeIndices, scores: bridgeScores };
}
