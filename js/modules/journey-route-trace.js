import { state } from '../state.js';
import { subscribeKeyed, EVENTS } from './event-bus.js';
import * as THREE from 'three';
import { isPointVisible } from './utils/geo-data.js';
import { ROUTE_TRACE_COLORS } from './design-tokens.js';
import {
    ROUTE_TRACE_SEGMENT_STEPS,
    getLineSegmentCount,
    disposeLineObject,
    getNodeVector,
    getArcPoint,
    pushArcSegments
} from './journey-webgl-utils.js';

// ShaderMaterial with glow effect for route trace lines (LineSegments-based overview lines)
function buildRouteTraceMaterial() {
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

export function resetRouteTraceDiagnostics(reason = 'inactive') {
    state.routeTraceDiagnostics = {
        active: false,
        reason,
        phase: document.body?.dataset?.journeyPhase || 'overview',
        indexCount: 0,
        edgeCount: 0,
        segmentCount: 0,
        anchorIndex: null,
        mapPointCount: state.routeTraceDiagnostics?.mapPointCount || 0,
        mapPathActive: !!state.routeTraceDiagnostics?.mapPathActive
    };
}

export function removeRouteTraceOverlay() {
    if (!state.routeTraceLines) return;
    if (state.myceliumGroup) state.myceliumGroup.remove(state.routeTraceLines);
    disposeLineObject(state.routeTraceLines);
    state.routeTraceLines = null;
    state.routeTraceConnectionPairs = [];
}

function getRouteEmbodimentIndices() {
    const indices = [];
    const push = (index) => {
        if (!Number.isFinite(index) || index < 0 || index >= state.points.length) return;
        if (!indices.includes(index)) indices.push(index);
    };
    if (Number.isFinite(state.navState.focusedIndex)) push(state.navState.focusedIndex);
    (state.navState.walkHistoryIndices || []).forEach(push);
    if (state.currentSearchSummary?.anchorIndex !== undefined) push(state.currentSearchSummary.anchorIndex);
    (state.currentSearchSummary?.resultIndices || []).slice(0, 7).forEach(push);
    (state.navState.threadCandidates || []).slice(0, 6).forEach((candidate) => push(candidate?.index));
    return indices;
}

export function setRouteChoreographyPhase(phase = 'overview', details = {}) {
    state.routeChoreographyState = {
        ...(state.routeChoreographyState || {}),
        ...details,
        phase,
        reason: details.reason || state.routeChoreographyState?.reason || 'state',
        startedAt: performance.now()
    };
    if (document.body?.dataset) {
        document.body.dataset.routeMotion = state.currentView === 'galaxy' ? phase : 'inactive';
    }
    refreshRouteTraceOverlay({ reason: details.reason || phase });
}

export function initRouteTraceSubscriptions() {
    // Phase 3: Declarative synchronization
    const sync = (payload = {}) => refreshRouteTraceOverlay(payload);
    subscribeKeyed('route-trace:camera-node-focused', EVENTS.CAMERA_NODE_FOCUSED, sync);
    subscribeKeyed('route-trace:search-success', EVENTS.SEARCH_SUCCESS, sync);
    subscribeKeyed('route-trace:search-cleared', EVENTS.SEARCH_CLEARED, sync);
    subscribeKeyed('route-trace:view-changed', EVENTS.VIEW_CHANGED, sync);
    subscribeKeyed('route-trace:state-reset', EVENTS.STATE_RESET, sync);
    subscribeKeyed('route-trace:filter-changed', EVENTS.FILTER_CHANGED, sync);
    subscribeKeyed('route-trace:composition-updated', EVENTS.COMPOSITION_UPDATED, sync);
    subscribeKeyed('route-trace:exploration-depth-changed', EVENTS.EXPLORATION_DEPTH_CHANGED, sync);
}

export function refreshRouteTraceOverlay(options = {}) {
    removeRouteTraceOverlay();
    if (!state.myceliumGroup || state.currentView !== 'galaxy') {
        resetRouteTraceDiagnostics('inactive-view');
        return;
    }
    const indices = getRouteEmbodimentIndices().filter((index) => isPointVisible(index, state.points, null, state.activeFilters));
    const anchorIndex = Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : indices[0];
    if (!Number.isFinite(anchorIndex) || indices.length < 2) {
        resetRouteTraceDiagnostics(indices.length ? 'single-node' : 'not-built');
        return;
    }

    const routeColor = new THREE.Color(ROUTE_TRACE_COLORS.route);
    const cueColor = new THREE.Color(ROUTE_TRACE_COLORS.cue);
    const positions = [];
    const colors = [];
    let edgeCount = 0;
    let segmentCount = 0;
    indices.forEach((index, order) => {
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
    if (state.semanticDiveMode) {
        material.uniforms.baseOpacity.value = 0.34;
        material.uniforms.opacity.value = 0.34;
    }
    state.routeTraceLines = new THREE.LineSegments(geometry, material);
    state.routeTraceConnectionPairs = indices
        .filter((index) => index !== anchorIndex)
        .map((index, order) => ({ a: anchorIndex, b: index, side: (order % 3) - 1 }));
    state.myceliumGroup.add(state.routeTraceLines);
    state.routeTraceDiagnostics = {
        active: true,
        reason: options.reason || state.routeChoreographyState?.reason || 'route',
        phase: document.body?.dataset?.journeyPhase || state.routeChoreographyState?.phase || 'focus',
        indexCount: indices.length,
        edgeCount,
        segmentCount,
        anchorIndex,
        mapPointCount: state.routeTraceDiagnostics?.mapPointCount || 0,
        mapPathActive: !!state.routeTraceDiagnostics?.mapPathActive
    };
}

export function updateRouteTraceOverlayPositions(now = performance.now()) {
    const line = state.routeTraceLines;
    const pairs = state.routeTraceConnectionPairs || [];
    if (!line?.geometry?.attributes?.position || !pairs.length) return;
    const positions = line.geometry.attributes.position.array;
    let offset = 0;
    pairs.forEach((pair) => {
        const from = getNodeVector(pair.a);
        const to = getNodeVector(pair.b);
        if (!from || !to) return;
        for (let segment = 0; segment < ROUTE_TRACE_SEGMENT_STEPS; segment += 1) {
            const p0 = getArcPoint(from, to, segment / ROUTE_TRACE_SEGMENT_STEPS, 0.11, pair.side);
            const p1 = getArcPoint(from, to, (segment + 1) / ROUTE_TRACE_SEGMENT_STEPS, 0.11, pair.side);
            positions[offset++] = p0.x;
            positions[offset++] = p0.y;
            positions[offset++] = p0.z;
            positions[offset++] = p1.x;
            positions[offset++] = p1.y;
            positions[offset++] = p1.z;
        }
    });
    line.geometry.attributes.position.needsUpdate = true;
    // Update ShaderMaterial uniforms for glow animation
    if (line.material?.uniforms) {
        line.material.uniforms.time.value = now / 1000;
        const targetOpacity = state.semanticDiveMode ? 0.34 : 0.22;
        line.material.uniforms.baseOpacity.value = targetOpacity;
        line.material.uniforms.opacity.value = targetOpacity;
    }
    state.routeTraceDiagnostics.segmentCount = getLineSegmentCount(line);
}
