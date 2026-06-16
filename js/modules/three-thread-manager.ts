import { webglContext } from '@lib/engine/webgl-context';
import * as THREE from 'three';
import { state as _state, withStateMutation } from '../state.ts';
const state = _state as any;
import {
    buildGeometricMyceliumEdges,
    buildSemanticMyceliumEdges,
    pushBezierLinePair
} from './mycelium-engine.ts';
import { disposeObject3D } from '@lib/engine/resource-tracker';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

type EdgePair = { a: number; b: number };
type MyceliumEdgeSets = {
    corePairs: EdgePair[];
    wispyPairs: EdgePair[];
    bridgePairs: EdgePair[];
};

function getNavigationMode() {
    return state.navState?.mode ?? state.navState?.currentMode;
}

function getLineSegmentCount(line: any) {
    const positionCount = line?.geometry?.attributes?.position?.count || 0;
    return Math.floor(positionCount / 2);
}

export function getGroupLineSegmentCount(group: any) {
    let total = 0;
    if (group && group.children) {
        group.children.forEach((child: THREE.Object3D & { isLineSegments?: boolean }) => {
            if (child.isLineSegments) {
                total += getLineSegmentCount(child);
            }
        });
    }
    return total;
}

function createLineSegments(positions: any, colors: any, opacity: any, linewidth = 1.0) {
    if (!positions.length) return null;
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    geometry.setColors(colors);

    // Add progress attribute for custom shader animation
    const segmentCount = Math.floor(positions.length / 6);
    const progressArr = new Float32Array(segmentCount * 2);
    for (let i = 0; i < segmentCount; i++) {
        progressArr[i * 2] = 0;
        progressArr[i * 2 + 1] = 1;
    }
    geometry.setAttribute('progress', new THREE.InstancedBufferAttribute(progressArr, 1));

    const material = new LineMaterial({
        color: 0xffffff,
        linewidth: linewidth,
        vertexColors: true,
        transparent: true,
        opacity: opacity,
        depthWrite: true,
        blending: THREE.NormalBlending
    } as any);

    const renderer = webglContext.renderer;
    if (renderer) {
        const size = new THREE.Vector2();
        renderer.getSize(size);
        const dpr = renderer.getPixelRatio();
        (material as any).resolution.set(size.x * dpr, size.y * dpr);
    }

    material.uniforms.uTime = { value: performance.now() / 1000 };
    material.onBeforeCompile = (shader: any) => {
        shader.vertexShader = shader.vertexShader.replace(
            'void main() {',
            `attribute float progress;
            varying float vProgress;
            void main() {`
        );
        shader.vertexShader = shader.vertexShader.replace(
            '#include <color_pars_vertex>',
            `#include <color_pars_vertex>
            varying float vProgress;`
        );
        shader.vertexShader = shader.vertexShader.replace(
            'gl_Position = clip;',
            `vProgress = progress;
            gl_Position = clip;`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            'uniform float opacity;',
            `uniform float opacity;
            uniform float uTime;
            varying float vProgress;`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            'vec4 diffuseColor = vec4( diffuse, alpha );',
            `vec4 diffuseColor = vec4( diffuse, alpha );
            
            // Subtle premium ambient waving bioluminescent pulse
            float wave = sin(uTime * 1.34 + vProgress * 6.28) * 0.14 + 0.86;
            alpha = alpha * wave;
            diffuseColor = vec4(diffuseColor.rgb, alpha);`
        );

        shader.uniforms.uTime = material.uniforms.uTime;
        material.userData.shader = shader;
    };

    const lineSegments = new LineSegments2(geometry as any, material as any);
    return lineSegments as any;
}

export function getThreadPulseOpacity(baseOpacity: any, pulse: any, requestedAmplitude: any, revealProgress = 1) {
    const safeBase = Math.max(0, Number.isFinite(baseOpacity) ? baseOpacity : 0);
    const safeReveal = Math.max(0, Number.isFinite(revealProgress) ? revealProgress : 1);
    // Keep pulse motion legible without letting threads disappear at the trough.
    const amplitude = Math.min(
        Math.max(0, Number.isFinite(requestedAmplitude) ? requestedAmplitude : 0),
        Math.max(0.0006, safeBase * 0.26)
    );
    return Math.max(0, safeBase + pulse * amplitude) * safeReveal;
}

// getThreadOpacityEnvelope removed — getMyceliumPresentationProfile is the
// sole runtime driver. This dead function was removed 2026-06-12.

export function getMyceliumPresentationProfile() {
    const currentMode = getNavigationMode();
    if (currentMode === 'overview' || currentMode === undefined) {
        return { core: 0.112, wispy: 0.047, bridge: 0.068, pulse: 0.022 };
    }
    if (state.focusedNode !== null && state.focusedNode !== undefined) {
        return { core: 0.16, wispy: 0.055, bridge: 0.085, pulse: 0.008 };
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
    if (webglContext.myceliumGroup) {
        if (webglContext.pointsMesh) webglContext.pointsMesh.remove(webglContext.myceliumGroup);
        disposeObject3D(webglContext.myceliumGroup);
        webglContext.myceliumGroup = null;
    }
    webglContext.myceliumCoreLines = null;
    webglContext.myceliumWispyLines = null;
    webglContext.myceliumBridgeLines = null;
    webglContext.myceliumConnectionPairs = [];
}

export function createMycelium() {
    if (!webglContext.pointsMesh || !state.points?.length || !state.nodePositions?.length) return;

    disposeMycelium();

    state.myceliumDirty = true;

    const clusterMembers = new Map();
    const clusterCentroids = new Map();
    state.points.forEach((point: any, index: number) => {
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
    const edgeSets = (semanticEdges || buildGeometricMyceliumEdges(clusterMembers, clusterCentroids)) as MyceliumEdgeSets | undefined;
    if (!edgeSets) return;
    const coreConnections: any[] = [];
    const coreColors: any[] = [];
    const wispyConnections: any[] = [];
    const wispyColors: any[] = [];
    const bridgeConnections: any[] = [];
    const bridgeColors: any[] = [];

    edgeSets.corePairs.forEach((pair: EdgePair) => {
        pushBezierLinePair(coreConnections, coreColors, pair, semanticEdges ? 0.38 : 0.28);
        webglContext.myceliumConnectionPairs.push({ a: pair.a, b: pair.b, layer: 0 });
    });
    edgeSets.wispyPairs.forEach((pair: EdgePair) => {
        pushBezierLinePair(wispyConnections, wispyColors, pair, semanticEdges ? 0.22 : 0.16);
        webglContext.myceliumConnectionPairs.push({ a: pair.a, b: pair.b, layer: 1 });
    });
    edgeSets.bridgePairs.forEach((pair: EdgePair) => {
        pushBezierLinePair(bridgeConnections, bridgeColors, pair, semanticEdges ? 0.32 : 0.24);
        webglContext.myceliumConnectionPairs.push({ a: pair.a, b: pair.b, layer: 2 });
    });

    webglContext.myceliumGroup = new THREE.Group();
    const profile = getMyceliumPresentationProfile();
    webglContext.myceliumCoreLines = createLineSegments(coreConnections, coreColors, profile.core, 1.35);
    webglContext.myceliumWispyLines = createLineSegments(wispyConnections, wispyColors, profile.wispy, 0.8);
    webglContext.myceliumBridgeLines = createLineSegments(bridgeConnections, bridgeColors, profile.bridge, 1.15);

    if (webglContext.myceliumCoreLines) webglContext.myceliumGroup.add(webglContext.myceliumCoreLines);
    if (webglContext.myceliumWispyLines) webglContext.myceliumGroup.add(webglContext.myceliumWispyLines);
    if (webglContext.myceliumBridgeLines) webglContext.myceliumGroup.add(webglContext.myceliumBridgeLines);
    if (!webglContext.scene) return;
    webglContext.pointsMesh.add(webglContext.myceliumGroup);

    withStateMutation(() => {
        state.scenePerformanceDiagnostics.myceliumCoreSegments = coreConnections.length / 6;
        state.scenePerformanceDiagnostics.myceliumWispySegments = wispyConnections.length / 6;
        state.scenePerformanceDiagnostics.myceliumBridgeSegments = bridgeConnections.length / 6;
    });
}
