/**
 * @lib/journey/arrival-handoff.ts
 *
 * Ported from:
 * Canonical TS module — preserves export/import parity with the prior
 * journey-arrival-handoff.js twin.
 */
import { appState } from '@lib/state/app.svelte'
const state = appState
import {
    Group,
    Color,
    BufferGeometry,
    Float32BufferAttribute,
    LineBasicMaterial,
    LineSegments,
    AdditiveBlending,
    MathUtils,
    Object3D
} from 'three'
import { ROUTE_TRACE_COLORS } from '@lib/utils/design-tokens'
import {
    ARRIVAL_HANDOFF_SEGMENT_STEPS,
    getNodeVector,
    getArcPoint,
    pushArcSegments,
    getLineSegmentCount,
    disposeThreeLineObject,
    getThreeLineSegmentCount
} from './webgl-utils'

/**
 * Writes arrival-handoff diagnostics to the $state object ONLY when a field
 * actually changed. `updateArrivalHandoffOverlay` runs every frame
 * (three-engine-core.ts:834); wholesale reassignment every frame triggers a
 * Svelte reactivity update even after the 0.65s settle, when opacity is
 * constant. Comparing against the current value keeps the write rate flat
 * once the values plateau: a single write during 'exploring', writes only
 * during the opacity fade while 'arrived', then silence.
 */
function writeArrivalHandoffDiagnostics(next: {
    active: boolean
    fromIndex: number | null
    targetIndex: number | null
    phase: string
    segmentCount: number
    endpointCount: number
    opacity: number
}): void {
    const current = state.arrivalHandoffDiagnostics
    if (
        current &&
        current.active === next.active &&
        current.fromIndex === next.fromIndex &&
        current.targetIndex === next.targetIndex &&
        current.phase === next.phase &&
        current.segmentCount === next.segmentCount &&
        current.endpointCount === next.endpointCount &&
        current.opacity === next.opacity
    ) {
        return
    }
    state.arrivalHandoffDiagnostics = next
}

export function removeArrivalHandoffOverlay(): void {
    if (!state.arrivalHandoffGroup) return
    const scene = state.scene as { remove?: (obj: Object3D) => void } | null
    scene?.remove?.(state.arrivalHandoffGroup)
    const group = state.arrivalHandoffGroup as { traverse?: (cb: (child: Object3D) => void) => void }
    group.traverse?.((child: Object3D) => disposeThreeLineObject(child))
    state.arrivalHandoffGroup = null
    {
        state.arrivalHandoffDiagnostics = {
            active: false,
            fromIndex: null,
            targetIndex: null,
            phase: 'idle',
            segmentCount: 0,
            endpointCount: 0,
            opacity: 0
        }
    }
}

export function buildArrivalHandoffOverlay(fromIndex: number, targetIndex: number): void {
    const from = getNodeVector(fromIndex)
    const to = getNodeVector(targetIndex)
    const scene = state.scene as { add?: (obj: Object3D) => void } | null
    if (!from || !to || !scene?.add) return
    removeArrivalHandoffOverlay()
    const group = new Group()
    group.name = 'arrival-memory-strand'
    group.userData = { fromIndex, targetIndex }
    const positions: number[] = []
    const colors: number[] = []
    const color = new Color(ROUTE_TRACE_COLORS.cue)
    ;[-1, 0, 1, 2].forEach((side) => {
        pushArcSegments(positions, colors, fromIndex, targetIndex, color, {
            steps: ARRIVAL_HANDOFF_SEGMENT_STEPS,
            lift: 0.16,
            side: side * 0.42
        })
    })
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    const material = new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending
    })
    group.add(new LineSegments(geometry, material))
    scene.add(group)
    state.arrivalHandoffGroup = group
    {
        state.arrivalHandoffDiagnostics = {
            active: true,
            fromIndex,
            targetIndex,
            phase: state.strandContinuityState.phase,
            segmentCount: getThreeLineSegmentCount(group.children[0]),
            endpointCount: 2,
            opacity: material.opacity
        }
    }
}

export function disposeArrivalHandoffOverlay(): void {
    removeArrivalHandoffOverlay()
}

export function syncArrivalHandoffOverlay(): void {
    const phase = state.strandContinuityState?.phase
    const fromIndex = state.strandContinuityState?.fromIndex
    const targetIndex = state.strandContinuityState?.targetIndex
    if (!['exploring', 'arrived'].includes(phase) || !Number.isFinite(fromIndex) || !Number.isFinite(targetIndex)) {
        removeArrivalHandoffOverlay()
        return
    }
    const existing = state.arrivalHandoffGroup?.userData || {}
    if (!state.arrivalHandoffGroup || existing.fromIndex !== fromIndex || existing.targetIndex !== targetIndex) {
        buildArrivalHandoffOverlay(fromIndex!, targetIndex!)
    }
    updateArrivalHandoffOverlay()
}

export function updateArrivalHandoffOverlay(): void {
    const group = state.arrivalHandoffGroup
    const phase = state.strandContinuityState?.phase
    if (!group || !['exploring', 'arrived'].includes(phase)) {
        if (group) removeArrivalHandoffOverlay()
        return
    }
    const line = group.children?.[0] as
        | (import('three').LineSegments & { material: import('three').Material | import('three').ShaderMaterial })
        | undefined
    const fromIndex = group.userData?.fromIndex
    const targetIndex = group.userData?.targetIndex
    const from = getNodeVector(fromIndex)
    const to = getNodeVector(targetIndex)
    if (!line?.geometry?.attributes?.position || !from || !to) return
    const positions = line.geometry.attributes.position.array as Float32Array
    let offset = 0
    ;[-1, 0, 1, 2].forEach((side) => {
        for (let segment = 0; segment < ARRIVAL_HANDOFF_SEGMENT_STEPS; segment += 1) {
            const p0 = getArcPoint(from, to, segment / ARRIVAL_HANDOFF_SEGMENT_STEPS, 0.16, side * 0.42)
            const p1 = getArcPoint(from, to, (segment + 1) / ARRIVAL_HANDOFF_SEGMENT_STEPS, 0.16, side * 0.42)
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
    const age = Math.max(0, performance.now() - (state.strandContinuityState.startedAt || performance.now()))
    const opacity = phase === 'exploring' ? 0.5 : MathUtils.clamp(0.5 - Math.max(0, age - 650) / 6200, 0.12, 0.5)
    line.material.opacity = opacity
    writeArrivalHandoffDiagnostics({
        active: true,
        fromIndex,
        targetIndex,
        phase,
        segmentCount: getLineSegmentCount(line),
        endpointCount: 2,
        opacity
    })
}
