// focus-pocket-thread-curve.ts
// Thread curve math (zero-allocation Bézier evaluation between two nodePositions).
// Owns a module-scope scratch pool shared by every `getFocusThreadCurvePointInto`
// call so callers can request fresh Vec3 outputs without triggering per-frame
// allocations.
//
// Pure-move refactor of `src/lib/journey/focus-pocket-geometry.ts` lines 465-624.

import { Vec3, clamp } from '@lib/utils/math-vec3'
import { appState } from '@lib/state/app.svelte'
const state = appState
import { getFocusPanelMode, FOCUS_PANEL_MODE } from '@lib/utils/focus-panel-mode'

export interface ThreadEdge {
    a: number
    b: number
    motifBraid?: number
    role?: string
    curveLift?: number
    side?: number
    rise?: number
    depth?: number
    anchorPull?: number
    [key: string]: unknown
}

// ── Static basis vectors (immutable, shared across all getFocusThreadCurvePoint calls) ──
const _VIEW_VECTOR = new Vec3(0.28, 0.2, 1).normalize()
const _WORLD_UP = new Vec3(0, 1, 0)

// ── Scratch pool for getFocusThreadCurvePointInto ──
// Safe to share across consecutive synchronous calls (RAF is single-threaded;
// each call fully completes before the next begins).
const _s = {
    start: new Vec3(),
    end: new Vec3(),
    mid: new Vec3(),
    span: new Vec3(),
    right: new Vec3(),
    up: new Vec3(),
    control: new Vec3(),
    stem: new Vec3(),
    curveCenter: new Vec3(),
    controlA: new Vec3(),
    controlB: new Vec3(),
    anchorVec: new Vec3(),
}

/**
 * Zero-allocation curve point computation — writes the result into `target`
 * and returns it. Internal scratch Vec3 intermediates are reused across calls.
 * Callers must consume `target` before the next synchronous call.
 */
export function getFocusThreadCurvePointInto(edge: ThreadEdge, t: number, target: Vec3): Vec3 {
    if (!state.nodePositions) {
        target.set(0, 0, 0)
        return target
    }
    const a = state.nodePositions[edge.a]
    const b = state.nodePositions[edge.b]
    if (!a || !b || edge.a === null || edge.a === undefined || edge.b === null || edge.b === undefined) {
        target.set(0, 0, 0)
        return target
    }
    if (
        !Number.isFinite(a.x) ||
        !Number.isFinite(a.y) ||
        !Number.isFinite(a.z) ||
        !Number.isFinite(b.x) ||
        !Number.isFinite(b.y) ||
        !Number.isFinite(b.z)
    ) {
        target.set(0, 0, 0)
        return target
    }

    _s.start.set(a.x, a.y, a.z)
    _s.end.set(b.x, b.y, b.z)
    _s.mid.copy(_s.start).lerp(_s.end, 0.5)
    _s.span.subVectors(_s.end, _s.start)
    const spanLength = Math.max(_s.span.length(), 0.001)

    _s.right.crossVectors(_WORLD_UP, _VIEW_VECTOR)
    if (_s.right.lengthSq() < 0.0001) _s.right.set(1, 0, 0)
    _s.right.normalize()
    _s.up.crossVectors(_VIEW_VECTOR, _s.right).normalize()

    const motifBraid = Number.isFinite(edge.motifBraid) ? edge.motifBraid! : 0.52
    const roleLift = edge.role === 'support' ? 0.78 : 1
    const isFieldNodeWalk = getFocusPanelMode() === FOCUS_PANEL_MODE.FIELD_NODE
    const longArc = isFieldNodeWalk && edge.role === 'direct' ? clamp((spanLength - 0.18) / 0.34, 0, 1) : 0
    const bendCap = isFieldNodeWalk ? 0.17 + longArc * 0.14 : 0.16
    const bendFloor = isFieldNodeWalk ? 0.032 + longArc * 0.026 : 0.028
    const bend = Math.min(
        bendCap,
        Math.max(bendFloor, spanLength * (edge.curveLift as number) * roleLift * (1 + longArc * 0.72))
    )
    const anchorPull = Number.isFinite(edge.anchorPull) ? edge.anchorPull! : 0

    _s.control
        .copy(_s.mid)
        .addScaledVector(_s.right, bend * (edge.side as number) * (0.62 + motifBraid * 0.34 + longArc * 0.58))
        .addScaledVector(_s.up, bend * (0.34 * (edge.rise as number) + longArc * 0.42))
        .addScaledVector(_VIEW_VECTOR, bend * ((edge.depth as number) + longArc * 0.72))

    let hasStem = false
    let anchorPullFactor = 0
    if (anchorPull > 0 && Number.isFinite(state.navState.focusedIndex)) {
        const focusedIndex = state.navState.focusedIndex!
        const anchor = state.nodePositions[focusedIndex]
        if (anchor) {
            _s.anchorVec.set(anchor.x, anchor.y, anchor.z).lerp(_s.mid, 0.42 + motifBraid * 0.16)
            anchorPullFactor = Math.min(0.44, anchorPull * (1 - longArc * 0.68))
            _s.control.lerp(_s.anchorVec, anchorPullFactor)
            hasStem = true
        }
    }

    if (longArc > 0.01) {
        _s.curveCenter.copy(_s.start).lerp(_s.end, 0.5)
        const arcBias = bend * (0.92 + longArc * 0.72)
        _s.controlA
            .copy(_s.start)
            .lerp(_s.curveCenter, 0.42)
            .addScaledVector(_s.right, arcBias * (edge.side as number) * (0.78 + motifBraid * 0.28))
            .addScaledVector(_s.up, arcBias * (0.3 + Math.max(0, edge.rise as number) * 0.28))
            .addScaledVector(_VIEW_VECTOR, arcBias * 0.62)
        _s.controlB
            .copy(_s.end)
            .lerp(_s.curveCenter, 0.42)
            .addScaledVector(_s.right, arcBias * (edge.side as number) * (1.04 + motifBraid * 0.34))
            .addScaledVector(_s.up, arcBias * (0.46 + longArc * 0.24))
            .addScaledVector(_VIEW_VECTOR, arcBias * (0.82 + longArc * 0.3))
        if (hasStem && anchorPullFactor > 0) {
            _s.controlA.lerp(_s.anchorVec, anchorPullFactor)
            _s.controlB.lerp(_s.anchorVec, anchorPullFactor)
        }
        // Cubic Bézier: target = start·B0 + controlA·B1 + controlB·B2 + end·B3
        const inv = 1 - t
        const inv2 = inv * inv
        const inv3 = inv2 * inv
        const t2 = t * t
        const t3 = t2 * t
        const b0 = inv3
        const b1 = 3 * inv2 * t
        const b2 = 3 * inv * t2
        const b3 = t3
        target.x = _s.start.x * b0 + _s.controlA.x * b1 + _s.controlB.x * b2 + _s.end.x * b3
        target.y = _s.start.y * b0 + _s.controlA.y * b1 + _s.controlB.y * b2 + _s.end.y * b3
        target.z = _s.start.z * b0 + _s.controlA.z * b1 + _s.controlB.z * b2 + _s.end.z * b3
        return target
    }

    // Quadratic Bézier: target = start·(1-t)² + control·2(1-t)t + end·t²
    const inv = 1 - t
    const b0 = inv * inv
    const b1 = 2 * inv * t
    const b2 = t * t
    target.x = _s.start.x * b0 + _s.control.x * b1 + _s.end.x * b2
    target.y = _s.start.y * b0 + _s.control.y * b1 + _s.end.y * b2
    target.z = _s.start.z * b0 + _s.control.z * b1 + _s.end.z * b2
    return target
}

/**
 * Public API — returns a new Vec3. For zero-allocation callers, use
 * getFocusThreadCurvePointInto with a caller-owned target instead.
 */
export function getFocusThreadCurvePoint(edge: ThreadEdge, t: number): Vec3 {
    return getFocusThreadCurvePointInto(edge, t, new Vec3())
}
