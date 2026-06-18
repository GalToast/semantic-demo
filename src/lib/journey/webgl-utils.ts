/**
 * @lib/journey/webgl-utils.ts — Shared WebGL utilities for journey overlays.
 *
 * Ported from: js/modules/journey-webgl-utils.ts
 * Pure utility functions. No side effects.
 */
import { Vector3, Color } from 'three';
import { state } from '@lib/engine/state-bridge';

export const ROUTE_TRACE_SEGMENT_STEPS: number = 7;
export const ARRIVAL_HANDOFF_SEGMENT_STEPS: number = 9;

export function getLineSegmentCount(lineObject: any): number {
    const positionAttr = lineObject?.geometry?.attributes?.position;
    return positionAttr ? Math.floor(positionAttr.count / 2) : 0;
}

export function disposeLineObject(lineObject: any): void {
    lineObject?.geometry?.dispose?.();
    lineObject?.material?.dispose?.();
}

export function getNodeVector(index: number | null | undefined): Vector3 | null {
    if (!Number.isFinite(index) || index === null || index === undefined) return null;
    const pos = (state.nodePositions as any[])[index] || (state.targetPositions as any[])[index] || (state.originalPositions as any[])[index];
    if (!pos) return null;
    const px = Number.isFinite(pos.x) ? pos.x : 0;
    const py = Number.isFinite(pos.y) ? pos.y : 0;
    const pz = Number.isFinite(pos.z) ? pos.z : 0;
    return new Vector3(px, py, pz);
}

export function getArcPoint(
    from: Vector3,
    to: Vector3,
    t: number,
    lift: number = 0.08,
    side: number = 0
): Vector3 | null {
    if (!from || !to) return null;
    const distance = from.distanceTo(to);
    if (!Number.isFinite(distance)) return null;
    const point = from.clone().lerp(to, t);
    const arch = Math.sin(Math.PI * t) * Math.max(0.018, distance * lift);
    point.y += arch;
    if (side) {
        point.x += Math.sin(Math.PI * t) * side * distance * 0.025;
        point.z -= Math.sin(Math.PI * t) * side * distance * 0.018;
    }
    return point;
}

export interface PushArcOptions {
    steps?: number;
    lift?: number;
    side?: number;
}

export function pushArcSegments(
    positions: number[],
    colors: number[],
    fromIndex: number,
    toIndex: number,
    color: Color,
    options: PushArcOptions = {}
): number {
    const from = getNodeVector(fromIndex);
    const to = getNodeVector(toIndex);
    if (!from || !to) return 0;
    const steps = options.steps || ROUTE_TRACE_SEGMENT_STEPS;
    const lift = options.lift ?? 0.08;
    const side = options.side || 0;
    for (let segment = 0; segment < steps; segment += 1) {
        const t0 = segment / steps;
        const t1 = (segment + 1) / steps;
        const p0 = getArcPoint(from, to, t0, lift, side);
        const p1 = getArcPoint(from, to, t1, lift, side);
        if (p0 && p1) {
            positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
            colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
        }
    }
    return steps;
}
