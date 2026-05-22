'use strict';

import * as THREE from 'three';
import { state } from '../state.js';
import { getThreadCategoryColor } from '../utils.js';

function pairKey(a, b) {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Mycelium Engine — Mathematical line generation and thread updates
 * Extracted from three-setup.js (Seam #4)
 */

// ── buildGeometricMyceliumEdges ───────────────────────────────────────────

export function buildGeometricMyceliumEdges(clusterMembers, clusterCentroids) {
    if (!state.points || !Array.isArray(state.points) || state.points.length === 0) return;
    const corePairs = [];
    const wispyPairs = [];
    const bridgePairs = [];
    const seenPairs = new Set();
    const cellSize = 0.1;
    const grid = new Map();

    for (let i = 0; i < state.points.length; i += 1) {
        const pos = state.nodePositions[i];
        if (!pos) continue;
        const key = `${Math.floor(pos.x / cellSize)},${Math.floor(pos.y / cellSize)},${Math.floor(pos.z / cellSize)}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
    }

    const coreDist = 0.048;
    const wispyDist = 0.078;

    for (let i = 0; i < state.points.length; i += 1) {
        const source = state.nodePositions[i];
        if (!source) continue;
        const cx = Math.floor(source.x / cellSize);
        const cy = Math.floor(source.y / cellSize);
        const cz = Math.floor(source.z / cellSize);

        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                for (let dz = -1; dz <= 1; dz += 1) {
                    const cell = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
                    if (!cell) continue;
                    for (const j of cell) {
                        if (j <= i || !state.points[i] || !state.points[j] || state.points[i].cluster !== state.points[j].cluster) continue;
                        const target = state.nodePositions[j];
                        if (!target) continue;
                        const dist = Math.hypot(source.x - target.x, source.y - target.y, source.z - target.z);
                        const key = pairKey(i, j);
                        if (seenPairs.has(key)) continue;
                        if (dist < coreDist) {
                            corePairs.push({ a: i, b: j });
                            seenPairs.add(key);
                        } else if (dist < wispyDist) {
                            wispyPairs.push({ a: i, b: j });
                            seenPairs.add(key);
                        }
                    }
                }
            }
        }
    }

    const seenBridgePairs = new Set();
    const clusterKeys = [...clusterMembers.keys()];
    clusterKeys.forEach((clusterA) => {
        const centroidA = clusterCentroids.get(clusterA);
        if (!centroidA) return;
        const nearest = clusterKeys
            .filter((clusterB) => clusterB !== clusterA)
            .map((clusterB) => {
                const centroidB = clusterCentroids.get(clusterB);
                return {
                    clusterB,
                    dist: Math.hypot(centroidA.x - centroidB.x, centroidA.y - centroidB.y, centroidA.z - centroidB.z)
                };
            })
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 2);

        nearest.forEach(({ clusterB, dist }) => {
            if (dist > 0.42) return;
            const bridgeKey = [clusterA, clusterB].sort((a, b) => a - b).join(':');
            if (seenBridgePairs.has(bridgeKey)) return;
            seenBridgePairs.add(bridgeKey);

            const centroidB = clusterCentroids.get(clusterB);
            const source = (clusterMembers.get(clusterA) || [])
                .slice()
                .sort((a, b) => {
                    const aPos = state.nodePositions[a];
                    const bPos = state.nodePositions[b];
                    if (!aPos || !bPos) return 0;
                    return Math.hypot(aPos.x - centroidB.x, aPos.y - centroidB.y, aPos.z - centroidB.z)
                        - Math.hypot(bPos.x - centroidB.x, bPos.y - centroidB.y, bPos.z - centroidB.z);
                })[0];
            const target = (clusterMembers.get(clusterB) || [])
                .slice()
                .sort((a, b) => {
                    const aPos = state.nodePositions[a];
                    const bPos = state.nodePositions[b];
                    if (!aPos || !bPos) return 0;
                    return Math.hypot(aPos.x - centroidA.x, aPos.y - centroidA.y, aPos.z - centroidA.z)
                        - Math.hypot(bPos.x - centroidA.x, bPos.y - centroidA.y, bPos.z - centroidA.z);
                })[0];

            if (source === undefined || target === undefined) return;
            bridgePairs.push({ a: source, b: target });
        });
    });

    return { corePairs, wispyPairs, bridgePairs };
}

// ── buildSemanticMyceliumEdges ─────────────────────────────────────────────

export function buildSemanticMyceliumEdges() {
    if (!state.semanticNeighborMapByLeadId?.size || !state.pointIndexByLeadId?.size) return null;

    const seenPairs = new Set();
    const corePairs = [];
    const wispyPairs = [];
    const bridgePairs = [];
    const bridgeCountByNode = new Map();

    state.points.forEach((point, index) => {
        const leadId = point?.lead_id === null || point?.lead_id === undefined ? '' : String(point.lead_id);
        if (!leadId) return;
        const threadNode = state.semanticNeighborMapByLeadId.get(leadId);
        if (!threadNode?.neighbors?.length) return;

        threadNode.neighbors.forEach((neighbor) => {
            const candidateIndex = state.pointIndexByLeadId.get(String(neighbor.leadId));
            if (candidateIndex === undefined || candidateIndex === index) return;
            const key = pairKey(index, candidateIndex);
            if (seenPairs.has(key)) return;
            seenPairs.add(key);

            const semanticScore = Number.isFinite(neighbor.semanticScore) ? neighbor.semanticScore : 0;
            const bridgeScore = Number.isFinite(neighbor.bridgeScore) ? neighbor.bridgeScore : 0;
            const sameCluster = state.points[index]?.cluster === state.points[candidateIndex]?.cluster;
            const sameCity = Boolean(neighbor.sameCity);
            const isBridgeLike = String(neighbor.threadType || '').toLowerCase().includes('bridge') || bridgeScore >= 0.62;

            if (!sameCluster) {
                if (!isBridgeLike) return;
                const aCount = bridgeCountByNode.get(index) || 0;
                const bCount = bridgeCountByNode.get(candidateIndex) || 0;
                if (aCount >= 2 || bCount >= 2) return;
                bridgeCountByNode.set(index, aCount + 1);
                bridgeCountByNode.set(candidateIndex, bCount + 1);
                bridgePairs.push({ a: index, b: candidateIndex });
                return;
            }

            if (semanticScore >= 0.62 || (semanticScore >= 0.56 && sameCity)) {
                corePairs.push({ a: index, b: candidateIndex });
            } else if (semanticScore >= 0.42 || sameCity) {
                wispyPairs.push({ a: index, b: candidateIndex });
            }
        });
    });

    return corePairs.length || wispyPairs.length || bridgePairs.length ? { corePairs, wispyPairs, bridgePairs } : null;
}

// ── Bezier sag control for organic mycelium curves ────────────────────────

export function getBezierControlPoint(a, b, edgeSide = 0, edgeRise = 0) {
    const start = new THREE.Vector3(a.x, a.y, a.z);
    const end = new THREE.Vector3(b.x, b.y, b.z);
    const mid = start.clone().lerp(end, 0.5);
    const span = new THREE.Vector3().subVectors(end, start);
    const spanLength = Math.max(span.length(), 0.001);

    const viewVector = state.camera
        ? new THREE.Vector3().subVectors(state.camera.position, mid).normalize()
        : new THREE.Vector3(0.28, 0.2, 1).normalize();

    const worldUp = new THREE.Vector3(0, 1, 0);
    const rightVector = new THREE.Vector3().crossVectors(worldUp, viewVector);
    if (rightVector.lengthSq() < 0.0001) rightVector.set(1, 0, 0);
    rightVector.normalize();
    const upVector = new THREE.Vector3().crossVectors(viewVector, rightVector).normalize();

    const baseSag = Math.min(0.12, Math.max(0.018, spanLength * 0.18));
    const sideOffset = edgeSide * baseSag * 0.52;
    const riseOffset = edgeRise * baseSag * 0.32;

    return mid
        .clone()
        .addScaledVector(rightVector, sideOffset)
        .addScaledVector(upVector, -(baseSag * 0.78) + riseOffset)
        .addScaledVector(viewVector, baseSag * 0.14);
}

export function pushBezierLinePair(target, colorTarget, pair, fade = 1, segments = 5) {
    const a = state.nodePositions[pair.a];
    const b = state.nodePositions[pair.b];
    if (!a || !b) return;

    const edgeSide = ((pair.a * 31 + pair.b * 17) % 2 === 0) ? 1 : -1;
    const edgeRise = (((pair.a + pair.b) % 5) - 2) / 2 || 0.3;

    const control = getBezierControlPoint(a, b, edgeSide, edgeRise);

    const colorA = getThreadCategoryColor(state.points[pair.a]?.cluster || 0, state.COLORS);
    const colorB = getThreadCategoryColor(state.points[pair.b]?.cluster || 0, state.COLORS);

    const samples = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const invT = 1 - t;

        const x = invT * invT * a.x + 2 * invT * t * control.x + t * t * b.x;
        const y = invT * invT * a.y + 2 * invT * t * control.y + t * t * b.y;
        const z = invT * invT * a.z + 2 * invT * t * control.z + t * t * b.z;

        const r = colorA.r + (colorB.r - colorA.r) * t;
        const g = colorA.g + (colorB.g - colorA.g) * t;
        const bCol = colorA.b + (colorB.b - colorA.b) * t;

        samples.push({
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
            z: Number.isFinite(z) ? z : 0,
            r: r * fade,
            g: g * fade,
            b: bCol * fade
        });
    }

    for (let i = 0; i < samples.length - 1; i++) {
        const start = samples[i];
        const end = samples[i + 1];
        target.push(start.x, start.y, start.z, end.x, end.y, end.z);
        colorTarget.push(start.r, start.g, start.b, end.r, end.g, end.b);
    }
}

// ── updateMyceliumThreads ──────────────────────────────────────────────────

export function updateMyceliumThreads() {
    if (!state.myceliumConnectionPairs?.length) return;

    // five explicit segment pairs: 10 vertices / 30 floats
    const FLOATS_PER_BEZIER_EDGE = 30;

    const getSaggedPoint = (a, b) => {
        if (!a || !b) return null;
        const ax = Number.isFinite(a.x) ? a.x : 0;
        const ay = Number.isFinite(a.y) ? a.y : 0;
        const az = Number.isFinite(a.z) ? a.z : 0;
        const bx = Number.isFinite(b.x) ? b.x : 0;
        const by = Number.isFinite(b.y) ? b.y : 0;
        const bz = Number.isFinite(b.z) ? b.z : 0;

        const midX = (ax + bx) * 0.5;
        const midY = (ay + by) * 0.5;
        const midZ = (az + bz) * 0.5;
        const spanLength = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2);

        const viewVec = state.camera
            ? new THREE.Vector3().subVectors(state.camera.position, new THREE.Vector3(midX, midY, midZ)).normalize()
            : new THREE.Vector3(0.28, 0.2, 1).normalize();
        const worldUp = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(worldUp, viewVec);
        if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
        right.normalize();

        const verts = [];
        const edgeSide = ((a.index * 31 + b.index * 17) % 2 === 0) ? 1 : -1;
        const edgeRise = (((a.index + b.index) % 5) - 2) / 2 || 0.3;
        const control = (() => {
            const start = new THREE.Vector3(ax, ay, az);
            const end = new THREE.Vector3(bx, by, bz);
            const mid = start.clone().lerp(end, 0.5);
            const baseSag = Math.min(0.06, Math.max(0.012, spanLength * 0.14));
            const sideOffset = edgeSide * baseSag * 0.45;
            const riseOffset = edgeRise * baseSag * 0.28;
            return mid
                .clone()
                .addScaledVector(right, sideOffset)
                .addScaledVector(new THREE.Vector3(0, 1, 0), -(baseSag * 0.7) + riseOffset);
        })();

        const samples = [];
        const segments = 5;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const invT = 1 - t;
            samples.push({
                x: invT * invT * ax + 2 * invT * t * control.x + t * t * bx,
                y: invT * invT * ay + 2 * invT * t * control.y + t * t * by,
                z: invT * invT * az + 2 * invT * t * control.z + t * t * bz
            });
        }

        for (let i = 0; i < samples.length - 1; i++) {
            verts.push(samples[i], samples[i + 1]);
        }
        return verts;
    };

    const updateLayer = (lines, layer) => {
        if (!lines?.geometry?.attributes?.position) return;
        const positions = lines.geometry.attributes.position.array;
        let offset = 0;
        state.myceliumConnectionPairs.forEach((pair) => {
            if (pair.layer !== layer) return;
            if (pair.a >= state.nodePositions.length || pair.b >= state.nodePositions.length) return;
            const a = state.nodePositions[pair.a];
            const b = state.nodePositions[pair.b];
            if (!a || !b) return;

            const verts = getSaggedPoint({ x: a.x, y: a.y, z: a.z, index: pair.a }, { x: b.x, y: b.y, z: b.z, index: pair.b });
            if (verts) {
                for (let i = 0; i < verts.length; i++) {
                    positions[offset++] = Number.isFinite(verts[i].x) ? verts[i].x : 0;
                    positions[offset++] = Number.isFinite(verts[i].y) ? verts[i].y : 0;
                    positions[offset++] = Number.isFinite(verts[i].z) ? verts[i].z : 0;
                }
            } else {
                positions[offset++] = Number.isFinite(a.x) ? a.x : 0;
                positions[offset++] = Number.isFinite(a.y) ? a.y : 0;
                positions[offset++] = Number.isFinite(a.z) ? a.z : 0;
                positions[offset++] = Number.isFinite(b.x) ? b.x : 0;
                positions[offset++] = Number.isFinite(b.y) ? b.y : 0;
                positions[offset++] = Number.isFinite(b.z) ? b.z : 0;
                const remaining = FLOATS_PER_BEZIER_EDGE - 6;
                for (let z = 0; z < remaining; z++) positions[offset++] = 0;
            }
        });
        lines.geometry.attributes.position.needsUpdate = true;
    };

    updateLayer(state.myceliumCoreLines, 0);
    updateLayer(state.myceliumWispyLines, 1);
    updateLayer(state.myceliumBridgeLines, 2);

    state.myceliumDirty = false;
}
