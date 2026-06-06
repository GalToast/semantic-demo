import { webglContext } from './webgl-context.js';
import * as THREE from 'three';
import { state, withStateMutation } from '../state.js';
import {
    buildGeometricMyceliumEdges,
    buildSemanticMyceliumEdges,
    pushBezierLinePair
} from './mycelium-engine.js';
import { disposeObject3D } from './resource-tracker.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function getNavigationMode() {
    return state.navState?.mode ?? state.navState?.currentMode;
}

function getLineSegmentCount(line) {
    const positionCount = line?.geometry?.attributes?.position?.count || 0;
    return Math.floor(positionCount / 2);
}

export function getGroupLineSegmentCount(group) {
    let total = 0;
    if (group && group.children) {
        group.children.forEach((child) => {
            if (child.isLineSegments) {
                total += getLineSegmentCount(child);
            }
        });
    }
    return total;
}

function createLineSegments(positions, colors, opacity) {
    if (!positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        linewidth: 1,
        depthWrite: true,
        blending: THREE.AdditiveBlending
    }));
}

export function getThreadPulseOpacity(baseOpacity, pulse, requestedAmplitude, revealProgress = 1) {
    const safeBase = Math.max(0, Number.isFinite(baseOpacity) ? baseOpacity : 0);
    const safeReveal = Math.max(0, Number.isFinite(revealProgress) ? revealProgress : 1);
    // Keep pulse motion legible without letting threads disappear at the trough.
    const amplitude = Math.min(
        Math.max(0, Number.isFinite(requestedAmplitude) ? requestedAmplitude : 0),
        Math.max(0.0006, safeBase * 0.26)
    );
    return Math.max(0, safeBase + pulse * amplitude) * safeReveal;
}

/**
 * Returns the four named mycelium thread opacity profiles used by the visual
 * polish contract.  Each profile is keyed by visibility stage name.
 * These are frozen design constants — not runtime-derived.
 */
export function getThreadOpacityEnvelope() {
    return {
        overview: { core: 0.13, wispy: 0.055, bridge: 0.08, pulse: 0.028 },
        focused: { core: 0.14, wispy: 0.045, bridge: 0.07, pulse: 0.006 },
        searchActive: { core: 0.32, wispy: 0.14, bridge: 0.22, pulse: 0.072 },
        trailActive: { core: 0.20, wispy: 0.08, bridge: 0.13, pulse: 0.044 }
    };
}

export function getMyceliumPresentationProfile() {
    const currentMode = getNavigationMode();
    if (currentMode === 'overview' || currentMode === undefined) {
        return { core: 0.18, wispy: 0.09, bridge: 0.12, pulse: 0.022 };
    }
    if (state.focusedNode !== null && state.focusedNode !== undefined) {
        return { core: 0.14, wispy: 0.045, bridge: 0.07, pulse: 0.006 };
    }
    if (state.currentSearchSummary || state.searchGlowActive) {
        return { core: 0.32, wispy: 0.14, bridge: 0.22, pulse: 0.072 };
    }
    if (state.trailDepth >= 1) {
        return { core: 0.20, wispy: 0.08, bridge: 0.13, pulse: 0.044 };
    }
    return { core: 0.20, wispy: 0.08, bridge: 0.13, pulse: 0.044 };
}

// ── Public API ──────────────────────────────────────────────────────────────

export function shouldRenderThreads() {
    const currentMode = getNavigationMode();
    const { trailDepth } = state.navState || {};
    const { currentSearchSummary } = state;
    const { focusedNode } = state;

    // County overview: threads ON for ambient visualization
    if (currentMode === 'overview' || currentMode === undefined) return true;

    // Map view: geographic context is primary, threads are visual noise
    if (currentMode === 'map') return false;

    // Search active: anchor thread ON (the trail IS the story)
    if (currentSearchSummary) return true;

    // Focus stage: neighborhood threads ON (meaningful relationships when anchor selected)
    if (currentMode === 'focus' && focusedNode !== null && focusedNode !== undefined) return true;

    // Step Inside (trail mode): full thread trail ON (the path IS the experience)
    if (trailDepth >= 1) return true;

    // Bridge mode EXCEPTION: selective threads visible at overview level
    // since cross-cluster connectors are defined by their connections
    if (currentMode === 'bridge') return true;

    return false;
}

export function shouldRenderBridgeThreads() {
    // Bridge mode shows cross-cluster threads as the primary visual
    const currentMode = getNavigationMode();
    return currentMode === 'bridge';
}

export function disposeMycelium() {
    if (state.myceliumGroup) {
        state.pointsMesh?.remove(state.myceliumGroup);
        disposeObject3D(state.myceliumGroup);
        state.myceliumGroup = null;
    }
    state.myceliumCoreLines = null;
    state.myceliumWispyLines = null;
    state.myceliumBridgeLines = null;
    state.myceliumConnectionPairs = [];
    // Also clean webglContext intermediary used by the TS module
    webglContext.myceliumGroup = null;
    webglContext.myceliumCoreLines = null;
    webglContext.myceliumWispyLines = null;
    webglContext.myceliumBridgeLines = null;
    webglContext.myceliumConnectionPairs = [];
}

export function createMycelium() {
    if (!state.pointsMesh || !state.points?.length || !state.nodePositions?.length) return;

    disposeMycelium();

    state.myceliumDirty = true;

    const clusterMembers = new Map();
    const clusterCentroids = new Map();
    state.points.forEach((point, index) => {
        const pos = state.nodePositions[index];
        if (!pos) return;
        if (!clusterMembers.has(point.cluster)) {
            clusterMembers.set(point.cluster, []);
            clusterCentroids.set(point.cluster, { x: 0, y: 0, z: 0, count: 0 });
        }
        clusterMembers.get(point.cluster).push(index);
        const centroid = clusterCentroids.get(point.cluster);
        centroid.x += pos.x;
        centroid.y += pos.y;
        centroid.z += pos.z;
        centroid.count += 1;
    });

    clusterCentroids.forEach((centroid) => {
        centroid.x /= centroid.count || 1;
        centroid.y /= centroid.count || 1;
        centroid.z /= centroid.count || 1;
    });

    const semanticEdges = buildSemanticMyceliumEdges();
    const edgeSets = semanticEdges || buildGeometricMyceliumEdges(clusterMembers, clusterCentroids);
    const coreConnections = [];
    const coreColors = [];
    const wispyConnections = [];
    const wispyColors = [];
    const bridgeConnections = [];
    const bridgeColors = [];

    edgeSets.corePairs.forEach((pair) => {
        pushBezierLinePair(coreConnections, coreColors, pair, semanticEdges ? 0.38 : 0.28);
        state.myceliumConnectionPairs.push({ a: pair.a, b: pair.b, layer: 0 });
    });
    edgeSets.wispyPairs.forEach((pair) => {
        pushBezierLinePair(wispyConnections, wispyColors, pair, semanticEdges ? 0.22 : 0.16);
        state.myceliumConnectionPairs.push({ a: pair.a, b: pair.b, layer: 1 });
    });
    edgeSets.bridgePairs.forEach((pair) => {
        pushBezierLinePair(bridgeConnections, bridgeColors, pair, semanticEdges ? 0.32 : 0.24);
        state.myceliumConnectionPairs.push({ a: pair.a, b: pair.b, layer: 2 });
    });

    state.myceliumGroup = new THREE.Group();
    const profile = getMyceliumPresentationProfile();
    state.myceliumCoreLines = createLineSegments(coreConnections, coreColors, profile.core);
    state.myceliumWispyLines = createLineSegments(wispyConnections, wispyColors, profile.wispy);
    state.myceliumBridgeLines = createLineSegments(bridgeConnections, bridgeColors, profile.bridge);

    // Also write to webglContext intermediary used by the TS module
    webglContext.myceliumGroup = state.myceliumGroup;
    webglContext.myceliumCoreLines = state.myceliumCoreLines;
    webglContext.myceliumWispyLines = state.myceliumWispyLines;
    webglContext.myceliumBridgeLines = state.myceliumBridgeLines;
    webglContext.myceliumConnectionPairs = state.myceliumConnectionPairs;

    if (state.myceliumCoreLines) state.myceliumGroup.add(state.myceliumCoreLines);
    if (state.myceliumWispyLines) state.myceliumGroup.add(state.myceliumWispyLines);
    if (state.myceliumBridgeLines) state.myceliumGroup.add(state.myceliumBridgeLines);
    if (!state.scene) return;
    state.pointsMesh.add(state.myceliumGroup);

    withStateMutation(() => {
        state.scenePerformanceDiagnostics.myceliumCoreSegments = coreConnections.length / 6;
        state.scenePerformanceDiagnostics.myceliumWispySegments = wispyConnections.length / 6;
        state.scenePerformanceDiagnostics.myceliumBridgeSegments = bridgeConnections.length / 6;
    });
}
