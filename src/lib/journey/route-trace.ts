/**
 * @lib/journey/route-trace.ts
 *
 * Ported from: js/modules/journey-route-trace.ts
 * Route trace overlay rendering, subscriptions, and frame updates.
 */
import { state } from '@lib/engine/state-bridge';

import { subscribeKeyed, EVENTS } from '@lib/orchestration/event-bus';
import * as THREE from 'three';
import { isPointVisible } from '@lib/utils/geo-data';
import { ROUTE_TRACE_COLORS } from '@lib/utils/design-tokens';
import {
    ROUTE_TRACE_SEGMENT_STEPS,
    getLineSegmentCount,
    disposeLineObject,
    getNodeVector,
    getArcPoint,
    pushArcSegments
} from './webgl-utils';
import { debounceRAF } from '@lib/utils/timer-utils';
import { appState } from '@lib/state/app.svelte';

// ShaderMaterial with glow effect for route trace lines (LineSegments-based overview lines)
function buildRouteTraceMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            time: { value: performance.now() / 1000 },
            opacity: { value: 0.22 },
            baseOpacity: { value: 0.22 }
        },
        vertexShader: `
            varying vec3 vColor;
            void main() {
                vColor = color;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform float opacity;
            uniform float baseOpacity;
            varying vec3 vColor;

            // Simple noise for spore effect
            float hash(float n) { return fract(sin(n) * 43758.5453123); }

            void main() {
                vec3 teal = vec3(0.43, 1.0, 0.91);
                vec3 gold = vec3(1.0, 0.85, 0.38);
                vec3 pearl = vec3(0.92, 1.0, 0.96);

                // Mycelium "spore" movement
                float pulse = sin(time * 3.5 + gl_FragCoord.x * 0.05) * 0.5 + 0.5;
                float noise = hash(floor(time * 8.0 + gl_FragCoord.y * 0.1));

                // Subtle glow breathing effect
                float breath = 0.85 + sin(time * 2.8) * 0.15;

                // Warm accent glow pulse
                float accentPulse = 0.5 + sin(time * 1.5) * 0.3;

                // Mix base color with accent colors
                vec3 warmColor = mix(teal, gold, vColor.g);
                vec3 finalColor = mix(vColor, warmColor, 0.42);

                // Add moving "spore" highlights
                float spore = step(0.97, fract(pulse + noise)) * 0.15;
                finalColor += pearl * spore;

                finalColor = mix(finalColor, pearl, accentPulse * 0.14);
                float alpha = baseOpacity * breath * (0.9 + spore * 2.0);

                gl_FragColor = vec4(finalColor, alpha);
            }
        `,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
    });
}

export function resetRouteTraceDiagnostics(reason: string = 'inactive'): void {
    (state as any).routeTraceDiagnostics = {
        active: false,
        reason,
        phase: document.body?.dataset?.journeyPhase || 'overview',
        indexCount: 0,
        edgeCount: 0,
        segmentCount: 0,
        anchorIndex: null,
        mapPointCount: (state as any).routeTraceDiagnostics?.mapPointCount || 0,
        mapPathActive: !!(state as any).routeTraceDiagnostics?.mapPathActive
    };
}

export function removeRouteTraceOverlay(): void {
    if (!(state as any).routeTraceLines) return;
    if ((state as any).myceliumGroup) (state as any).myceliumGroup.remove((state as any).routeTraceLines);
    disposeLineObject((state as any).routeTraceLines);
    (state as any).routeTraceLines = null;
    (state as any).routeTraceConnectionPairs = [];
}

function getRouteEmbodimentIndices(): number[] {
    const indices: number[] = [];
    const push = (index: number): void => {
        if (!Number.isFinite(index) || index < 0 || index >= appState.points.length) return;
        if (!indices.includes(index)) indices.push(index);
    };
    if (Number.isFinite(appState.navState.focusedIndex)) push(appState.navState.focusedIndex!);
    (appState.navState.walkHistoryIndices || []).forEach(push);
    const summary = appState.currentSearchSummary as any;
    if (summary?.anchorIndex !== undefined) push(summary.anchorIndex);
    (summary?.resultIndices || []).slice(0, 7).forEach(push);
    (appState.navState.threadCandidates || []).slice(0, 6).forEach((candidate: any) => push(candidate?.index));
    return indices;
}

export function setRouteChoreographyPhase(phase: string = 'overview', details: Record<string, unknown> = {}): void {
    (state as any).routeChoreographyState = {
        ...((state as any).routeChoreographyState || {}),
        ...details,
        phase,
        reason: details.reason || (state as any).routeChoreographyState?.reason || 'state',
        startedAt: performance.now()
    };
    if (document.body?.dataset) {
        (document.body.dataset as any).routeMotion = appState.currentView === 'galaxy' ? phase : 'inactive';
    }
    refreshRouteTraceOverlay({ reason: details.reason || phase });
}

export function initRouteTraceSubscriptions(): void {
    // Phase 3: Declarative synchronization
    const sync = (payload: Record<string, unknown> = {}): void => refreshRouteTraceOverlay(payload);
    subscribeKeyed('route-trace:camera-node-focused', EVENTS.CAMERA_NODE_FOCUSED, sync);
    subscribeKeyed('route-trace:search-success', EVENTS.SEARCH_SUCCESS, sync);
    subscribeKeyed('route-trace:search-cleared', EVENTS.SEARCH_CLEARED, sync);
    subscribeKeyed('route-trace:view-changed', EVENTS.VIEW_CHANGED, sync);
    subscribeKeyed('route-trace:state-reset', EVENTS.STATE_RESET, sync);
    subscribeKeyed('route-trace:filter-changed', EVENTS.FILTER_CHANGED, sync);
    subscribeKeyed('route-trace:composition-updated', EVENTS.COMPOSITION_UPDATED, sync);
    subscribeKeyed('route-trace:transition-phase-changed', EVENTS.TRANSITION_PHASE_CHANGED, (payload: Record<string, unknown>) => {
        setRouteChoreographyPhase(payload.phase as string, (payload.details as Record<string, unknown>) || {});
    });
    subscribeKeyed('route-trace:exploration-depth-changed', EVENTS.EXPLORATION_DEPTH_CHANGED, sync);
}

function _refreshRouteTraceOverlayRaw(options: Record<string, unknown> = {}): void {
    removeRouteTraceOverlay();
    if (!appState.myceliumGroup || appState.currentView !== 'galaxy') {
        resetRouteTraceDiagnostics('inactive-view');
        return;
    }
    const indices = getRouteEmbodimentIndices().filter((index: number) => isPointVisible(index, appState.points, null, appState.activeFilters));
    const rawAnchor = Number.isFinite(appState.navState.focusedIndex) ? appState.navState.focusedIndex : indices[0];
    if (!Number.isFinite(rawAnchor) || indices.length < 2) {
        resetRouteTraceDiagnostics(indices.length ? 'single-node' : 'not-built');
        return;
    }
    const anchorIndex = rawAnchor as number;

    const routeColor = new THREE.Color(ROUTE_TRACE_COLORS.route);
    const cueColor = new THREE.Color(ROUTE_TRACE_COLORS.cue);
    const positions: number[] = [];
    const colors: number[] = [];
    let edgeCount = 0;
    let segmentCount = 0;
    indices.forEach((index: number, order: number) => {
        if (index === anchorIndex) return;
        const color = order <= 2 ? cueColor : routeColor;
        const side = (order % 3) - 1;
        const added = pushArcSegments(positions, colors, anchorIndex, index, color, { lift: 0.11, side });
        if (added) {
            edgeCount += 1;
            segmentCount += added;
        }
    });
    if (!segmentCount) {
        resetRouteTraceDiagnostics('empty');
        return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = buildRouteTraceMaterial();
    if (appState.semanticDiveMode) {
        (material.uniforms as any).baseOpacity.value = 0.34;
        (material.uniforms as any).opacity.value = 0.34;
    }
    (state as any).routeTraceLines = new THREE.LineSegments(geometry, material);
    (state as any).routeTraceConnectionPairs = indices
        .filter((index: number) => index !== anchorIndex)
        .map((index: number, order: number) => ({ a: anchorIndex, b: index, side: (order % 3) - 1 }));
    (state as any).myceliumGroup.add((state as any).routeTraceLines);
    (state as any).routeTraceDiagnostics = {
        active: true,
        reason: options.reason || (state as any).routeChoreographyState?.reason || 'route',
        phase: document.body?.dataset?.journeyPhase || (state as any).routeChoreographyState?.phase || 'focus',
        indexCount: indices.length,
        edgeCount,
        segmentCount,
        anchorIndex,
        mapPointCount: (state as any).routeTraceDiagnostics?.mapPointCount || 0,
        mapPathActive: !!(state as any).routeTraceDiagnostics?.mapPathActive
    };
    if (document.body?.dataset) {
        (document.body.dataset as any).routeMotion = appState.currentView === 'galaxy' ? 'focus' : 'inactive';
    }
}

export function updateRouteTraceOverlayPositions(now: number = performance.now()): void {
    const line = (state as any).routeTraceLines;
    const pairs = (state as any).routeTraceConnectionPairs || [];
    if (!line?.geometry?.attributes?.position || !pairs.length) return;
    const positions = line.geometry.attributes.position.array;
    let offset = 0;
    pairs.forEach((pair: { a: number; b: number; side: number }) => {
        const from = getNodeVector(pair.a);
        const to = getNodeVector(pair.b);
        if (!from || !to) return;
        for (let segment = 0; segment < ROUTE_TRACE_SEGMENT_STEPS; segment += 1) {
            const p0 = getArcPoint(from, to, segment / ROUTE_TRACE_SEGMENT_STEPS, 0.11, pair.side);
            const p1 = getArcPoint(from, to, (segment + 1) / ROUTE_TRACE_SEGMENT_STEPS, 0.11, pair.side);
            if (p0 && p1) {
                positions[offset++] = p0.x;
                positions[offset++] = p0.y;
                positions[offset++] = p0.z;
                positions[offset++] = p1.x;
                positions[offset++] = p1.y;
                positions[offset++] = p1.z;
            }
        }
    });
    line.geometry.attributes.position.needsUpdate = true;
    // Update ShaderMaterial uniforms for glow animation
    if (line.material?.uniforms) {
        line.material.uniforms.time.value = now / 1000;
        const targetOpacity = (state as any).semanticDiveMode ? 0.34 : 0.22;
        line.material.uniforms.baseOpacity.value = targetOpacity;
        line.material.uniforms.opacity.value = targetOpacity;
    }
    (state as any).routeTraceDiagnostics.segmentCount = getLineSegmentCount(line);
}

export const refreshRouteTraceOverlay = debounceRAF(_refreshRouteTraceOverlayRaw as any);
