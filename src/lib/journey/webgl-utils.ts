/**
 * @lib/journey/webgl-utils.ts — Shared WebGL utilities for journey overlays.
 *
 * Ported from:
 * Pure utility functions. No side effects.
 */
import { Vec3, Color } from '@lib/utils/math-vec3'
import { appState as state } from '@lib/state/app.svelte'
import type { Object3D } from 'three'

export const ROUTE_TRACE_SEGMENT_STEPS: number = 7
export const ARRIVAL_HANDOFF_SEGMENT_STEPS: number = 9

// Three.js-typed helpers for callers whose traverse()/cast types are Object3D.
// The internal structural helpers below remain available for callers that
// model line-object shapes without holding a real Object3D. Both code paths
// converge on the same dispose + segment-count logic.

/** Anything in a Three.js scene graph that exposes geometry + material seams. */
type ThreeLineObject = Object3D & {
    geometry?: { dispose?(): void; attributes?: { position?: { count: number } } }
    material?: { dispose?(): void } | { dispose?(): void }[]
}

export function disposeThreeLineObject(obj: Object3D | undefined | null): void {
    if (!obj) return
    const line = obj as unknown as ThreeLineObject
    disposeLineObject(line)
}

export function getThreeLineSegmentCount(obj: Object3D | undefined | null): number {
    if (!obj) return 0
    const line = obj as unknown as ThreeLineObject
    return getLineSegmentCount(line)
}

export function getLineSegmentCount(lineObject: {
    geometry?: { attributes?: { position?: { count: number } } }
}): number {
    const positionAttr = lineObject?.geometry?.attributes?.position
    return positionAttr ? Math.floor(positionAttr.count / 2) : 0
}

export function disposeLineObject(lineObject: {
    geometry?: { dispose?(): void }
    material?: { dispose?(): void } | { dispose?(): void }[]
}): void {
    lineObject?.geometry?.dispose?.()
    const m = lineObject?.material
    if (Array.isArray(m)) {
        for (const mat of m) mat?.dispose?.()
    } else {
        m?.dispose?.()
    }
}

export function getNodeVector(index: number | null | undefined): Vec3 | null {
    if (!Number.isFinite(index) || index === null || index === undefined) return null
    const pos = state.nodePositions[index] || state.targetPositions[index] || state.originalPositions[index]
    if (!pos) return null
    const px = Number.isFinite(pos.x) ? pos.x : 0
    const py = Number.isFinite(pos.y) ? pos.y : 0
    const pz = Number.isFinite(pos.z) ? pos.z : 0
    return new Vec3(px, py, pz)
}

export function getArcPoint(from: Vec3, to: Vec3, t: number, lift: number = 0.08, side: number = 0): Vec3 | null {
    if (!from || !to) return null
    const distance = from.distanceTo(to)
    if (!Number.isFinite(distance)) return null
    const point = from.clone().lerp(to, t)
    const arch = Math.sin(Math.PI * t) * Math.max(0.018, distance * lift)
    point.y += arch
    if (side) {
        point.x += Math.sin(Math.PI * t) * side * distance * 0.025
        point.z -= Math.sin(Math.PI * t) * side * distance * 0.018
    }
    return point
}

export interface PushArcOptions {
    steps?: number
    lift?: number
    side?: number
}

export function pushArcSegments(
    positions: number[],
    colors: number[],
    fromIndex: number,
    toIndex: number,
    color: Color,
    options: PushArcOptions = {}
): number {
    const from = getNodeVector(fromIndex)
    const to = getNodeVector(toIndex)
    if (!from || !to) return 0
    const steps = options.steps || ROUTE_TRACE_SEGMENT_STEPS
    const lift = options.lift ?? 0.08
    const side = options.side || 0
    for (let segment = 0; segment < steps; segment += 1) {
        const t0 = segment / steps
        const t1 = (segment + 1) / steps
        const p0 = getArcPoint(from, to, t0, lift, side)
        const p1 = getArcPoint(from, to, t1, lift, side)
        if (p0 && p1) {
            positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z)
            colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
        }
    }
    return steps
}
