/**
 * @lib/journey/route-trace.ts
 *
 * Ported from:
 * Route trace overlay rendering, subscriptions, and frame updates.
 */
import { appState as state } from '@lib/state/app.svelte'
import { withStateMutation } from '@lib/state/with-state-mutation'

import { subscribeKeyed, EVENTS } from '@lib/orchestration/event-bus'
import { ShaderMaterial, AdditiveBlending, Color, BufferGeometry, Float32BufferAttribute, LineSegments } from 'three'
import { isPointVisible } from '@lib/utils/geo-data'
import { ROUTE_TRACE_COLORS } from '@lib/utils/design-tokens'
import {
    ROUTE_TRACE_SEGMENT_STEPS,
    getLineSegmentCount,
    disposeLineObject,
    getNodeVector,
    getArcPoint,
    pushArcSegments
} from './webgl-utils'
import { debounceRAF } from '@lib/utils/timer-utils'

// ShaderMaterial with glow effect for route trace lines (LineSegments-based overview lines)
function buildRouteTraceMaterial(): ShaderMaterial {
    return new ShaderMaterial({
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
        blending: AdditiveBlending
    })
}

export function resetRouteTraceDiagnostics(reason: string = 'inactive'): void {
    withStateMutation(() => {
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
        }
    })
}

export function removeRouteTraceOverlay(): void {
    if (!state.routeTraceLines) return
    if (state.myceliumGroup) state.myceliumGroup.remove(state.routeTraceLines)
    disposeLineObject(state.routeTraceLines)
    state.routeTraceLines = null
    state.routeTraceConnectionPairs = []
}

function getRouteEmbodimentIndices(): number[] {
    const indices: number[] = []
    const push = (index: number): void => {
        if (!Number.isFinite(index) || index < 0 || index >= state.points.length) return
        if (!indices.includes(index)) indices.push(index)
    }
    if (Number.isFinite(state.navState.focusedIndex)) push(state.navState.focusedIndex!)
    ;(state.navState.walkHistoryIndices || []).forEach(push)
    const summary = state.currentSearchSummary
    if (summary?.anchorIndex != null) push(summary.anchorIndex!)
    ;(summary?.resultIndices || []).slice(0, 7).forEach(push)
    ;(state.navState.threadCandidates || [])
        .slice(0, 6)
        .forEach((candidate: { index: number }) => push(candidate.index))
    return indices
}

export interface RouteChoreographyDetails {
    reason?: string
}

export interface RouteChoreographyPayload {
    phase?: string
    details?: RouteChoreographyDetails
}

export function setRouteChoreographyPhase(phase: string = 'overview', details: RouteChoreographyDetails = {}): void {
    withStateMutation(() => {
        state.routeChoreographyState = {
            ...(state.routeChoreographyState || {}),
            ...details,
            phase,
            reason: details.reason || state.routeChoreographyState?.reason || 'state',
            startedAt: performance.now()
        }
    })
    const canvasContainer = document.getElementById('canvas-container')
    if (canvasContainer) {
        canvasContainer.dataset.routeMotion = state.currentView === 'galaxy' ? phase : 'inactive'
    }
    refreshRouteTraceOverlay({ reason: details.reason || phase })
}

export function initRouteTraceSubscriptions(): void {
    // Phase 3: Declarative synchronization — `sync` is a pass-through; each
    // subscribed event carries its own payload shape (e.g. CAMERA_NODE_FOCUSED
    // passes `{ point, index, options }`, EXPLORATION_DEPTH_CHANGED passes
    // `{ depth }`). We forward to `refreshRouteTraceOverlay` (which reads
    // only `payload.reason`), so preserving `Record<string, unknown>` here
    // keeps the subscribers structurally compatible.
    const sync = (payload: Record<string, unknown> = {}): void => refreshRouteTraceOverlay(payload)
    subscribeKeyed('route-trace:camera-node-focused', EVENTS.CAMERA_NODE_FOCUSED, sync)
    subscribeKeyed('route-trace:search-success', EVENTS.SEARCH_SUCCESS, sync)
    subscribeKeyed('route-trace:search-cleared', EVENTS.SEARCH_CLEARED, sync)
    subscribeKeyed('route-trace:view-changed', EVENTS.VIEW_CHANGED, sync)
    subscribeKeyed('route-trace:state-reset', EVENTS.STATE_RESET, sync)
    subscribeKeyed('route-trace:filter-changed', EVENTS.FILTER_CHANGED, sync)
    subscribeKeyed('route-trace:composition-updated', EVENTS.COMPOSITION_UPDATED, sync)
    subscribeKeyed(
        'route-trace:transition-phase-changed',
        EVENTS.TRANSITION_PHASE_CHANGED,
        (payload: RouteChoreographyPayload) => {
            setRouteChoreographyPhase(payload.phase ?? 'overview', payload.details ?? {})
        }
    )
    subscribeKeyed('route-trace:exploration-depth-changed', EVENTS.EXPLORATION_DEPTH_CHANGED, sync)
}

function _refreshRouteTraceOverlayRaw(options: RouteChoreographyDetails = {}): void {
    removeRouteTraceOverlay()
    if (!state.myceliumGroup || state.currentView !== 'galaxy') {
        resetRouteTraceDiagnostics('inactive-view')
        return
    }
    const indices = getRouteEmbodimentIndices().filter((index: number) =>
        isPointVisible(index, state.points, null, state.activeFilters)
    )
    const rawAnchor = Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : indices[0]
    if (!Number.isFinite(rawAnchor) || indices.length < 2) {
        resetRouteTraceDiagnostics(indices.length ? 'single-node' : 'not-built')
        return
    }
    const anchorIndex = rawAnchor as number

    const routeColor = new Color(ROUTE_TRACE_COLORS.route)
    const cueColor = new Color(ROUTE_TRACE_COLORS.cue)
    const positions: number[] = []
    const colors: number[] = []
    let edgeCount = 0
    let segmentCount = 0
    indices.forEach((index: number, order: number) => {
        if (index === anchorIndex) return
        const color = order <= 2 ? cueColor : routeColor
        const side = (order % 3) - 1
        const added = pushArcSegments(positions, colors, anchorIndex, index, color, { lift: 0.11, side })
        if (added) {
            edgeCount += 1
            segmentCount += added
        }
    })
    if (!segmentCount) {
        resetRouteTraceDiagnostics('empty')
        return
    }

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    const material = buildRouteTraceMaterial()
    if (state.semanticDiveMode) {
        material.uniforms.baseOpacity!.value = 0.34
        material.uniforms.opacity!.value = 0.34
    }
    state.routeTraceLines = new LineSegments(geometry, material)
    state.routeTraceConnectionPairs = indices
        .filter((index: number) => index !== anchorIndex)
        .map((index: number, order: number) => ({ a: anchorIndex, b: index, side: (order % 3) - 1 }))
    state.myceliumGroup!.add(state.routeTraceLines)
    withStateMutation(() => {
        state.routeTraceDiagnostics = {
            active: true,
            reason: String(options.reason || state.routeChoreographyState?.reason || 'route'),
            phase: document.body?.dataset?.journeyPhase || state.routeChoreographyState?.phase || 'focus',
            indexCount: indices.length,
            edgeCount,
            segmentCount,
            anchorIndex,
            mapPointCount: state.routeTraceDiagnostics?.mapPointCount || 0,
            mapPathActive: !!state.routeTraceDiagnostics?.mapPathActive
        }
    })
    const canvasContainer = document.getElementById('canvas-container')
    if (canvasContainer) {
        canvasContainer.dataset.routeMotion = state.currentView === 'galaxy' ? 'focus' : 'inactive'
    }
}

export function updateRouteTraceOverlayPositions(now: number = performance.now()): void {
    const line = state.routeTraceLines
    const pairs = state.routeTraceConnectionPairs || []
    if (!line?.geometry?.attributes?.position || !pairs.length) return
    const positions = line.geometry.attributes.position.array
    let offset = 0
    pairs.forEach((pair: { a: number; b: number; side: number }) => {
        const from = getNodeVector(pair.a)
        const to = getNodeVector(pair.b)
        if (!from || !to) return
        for (let segment = 0; segment < ROUTE_TRACE_SEGMENT_STEPS; segment += 1) {
            const p0 = getArcPoint(from, to, segment / ROUTE_TRACE_SEGMENT_STEPS, 0.11, pair.side)
            const p1 = getArcPoint(from, to, (segment + 1) / ROUTE_TRACE_SEGMENT_STEPS, 0.11, pair.side)
            if (p0 && p1) {
                positions[offset++] = p0.x
                positions[offset++] = p0.y
                positions[offset++] = p0.z
                positions[offset++] = p1.x
                positions[offset++] = p1.y
                positions[offset++] = p1.z
            }
        }
    })
    line.geometry.attributes.position.needsUpdate = true
    // Update ShaderMaterial uniforms for glow animation
    const material = line.material as ShaderMaterial
    if (material.uniforms) {
        material.uniforms.time!.value = now / 1000
        const targetOpacity = state.semanticDiveMode ? 0.34 : 0.22
        material.uniforms.baseOpacity!.value = targetOpacity
        material.uniforms.opacity!.value = targetOpacity
    }
    withStateMutation(() => {
        state.routeTraceDiagnostics.segmentCount = getLineSegmentCount(line)
    })
}

export const refreshRouteTraceOverlay = debounceRAF(_refreshRouteTraceOverlayRaw as (...args: unknown[]) => void)
