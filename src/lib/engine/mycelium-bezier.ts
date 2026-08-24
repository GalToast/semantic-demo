/**
 * @lib/engine/mycelium-bezier.ts — bezier mycelium geometry helpers
 *
 * EXTRACTED from thread-manager.ts (split plan: tmp/thread-manager-split-PLAN.md,
 * CORRECTION-2 scope): split-1 carries ONLY the pure trio + bezier view cache —
 * pairKey, getBezierControlPoint, pushBezierLinePair (DI), refreshCachedBezierViewVector
 * + the cached view vector/dispose refs. NO dirtyNodeIndices, NO LineGeometry buffer
 * machinery (those stay in thread-manager until split-2).
 *
 * Imports: webgl-context + CONFIG only (stable modules) — NO app.svelte import.
 * nodePositions/points/colorFn are INJECTED (DI) so the module stays fleet-safe
 * while src/lib/state/app.svelte.ts is under parallel edit.
 *
 * DRAFT — tmp/ landing-ready; do not land until the tree is green + thread-manager
 * is clean (split-plan guard). At landing, lift the REAL function bodies verbatim
 * from thread-manager.ts (this draft mirrors them; re-verify line-for-line).
 */
import { Vector3 } from 'three'
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import type { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import type { BufferAttribute } from 'three'
import { webglContext } from './webgl-context'

export const BEZIER_SEGMENTS_PER_PAIR = 10

/** Minimal view of a mycelium point — decoupled from appState. Point (core-types)
 * has OPTIONAL x/y/z + cluster: number|null, so the DI type must mirror that
 * (the callers' `if (!start || !end) return` guards handle undefined). */
export interface MyceliumPointLike {
    x?: number
    y?: number
    z?: number
    cluster?: number | null
}

export interface EdgePair {
    a: number
    b: number
}

export function pairKey(a: number, b: number): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`
}

// ── Bezier view cache (module-level state carried WITH its setter) ──
let _cachedBezierViewVector: Vector3 | null = null
let _disposeBezierViewRefresh: (() => void) | null = null

/** Refresh _cachedBezierViewVector from the current camera position. */
export function refreshCachedBezierViewVector(): void {
    _cachedBezierViewVector = webglContext.camera
        ? new Vector3().subVectors(webglContext.camera.position, new Vector3(0.5, 0.5, 0.5)).normalize()
        : new Vector3(0.28, 0.2, 1).normalize()
}

export function hasDisposeBezierViewRefresh(): boolean {
    return _disposeBezierViewRefresh !== null
}

export function setDisposeBezierViewRefresh(fn: (() => void) | null): void {
    _disposeBezierViewRefresh = fn
}

export function runDisposeBezierViewRefresh(): void {
    _disposeBezierViewRefresh?.()
    _disposeBezierViewRefresh = null
}

/** Control point for a bezier arc between two mycelium points. */
export function getBezierControlPoint(
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number },
    side = 0,
    rise = 0
): Vector3 {
    const a = new Vector3(start.x, start.y, start.z)
    const b = new Vector3(end.x, end.y, end.z)
    const mid = a.clone().lerp(b, 0.5)
    const span = new Vector3().subVectors(b, a)
    const spanLength = Math.max(span.length(), 0.001)
    const viewVector = _cachedBezierViewVector
        ? _cachedBezierViewVector.clone()
        : webglContext.camera
          ? new Vector3().subVectors(webglContext.camera.position, mid).normalize()
          : new Vector3(0.28, 0.2, 1).normalize()
    const up = new Vector3(0, 1, 0)
    const right = new Vector3().crossVectors(up, viewVector)
    if (right.lengthSq() < 0.0001) right.set(1, 0, 0)
    right.normalize()
    const lift = Math.min(0.12, Math.max(0.018, spanLength * 0.18))
    return mid
        .addScaledVector(right, side * lift * 0.52)
        .addScaledVector(new Vector3().crossVectors(viewVector, right).normalize(), -(lift * 0.78) + rise * lift * 0.32)
        .addScaledVector(viewVector, lift * 0.14)
}

/**
 * Push a bezier line pair into shared position/color arrays.
 * DI per CORRECTION-2: nodePositions/points/colorFn injected — no appState import.
 */
export function pushBezierLinePair(
    positions: number[],
    colors: number[],
    pair: EdgePair,
    nodePositions: MyceliumPointLike[],
    points: MyceliumPointLike[],
    colorFn: (cluster: number | null | undefined) => { r: number; g: number; b: number },
    intensity = 1,
    segments = BEZIER_SEGMENTS_PER_PAIR
): void {
    const start = nodePositions[pair.a]
    const end = nodePositions[pair.b]
    if (!start || !end) return
    if (start.x === undefined || start.y === undefined || start.z === undefined) return
    if (end.x === undefined || end.y === undefined || end.z === undefined) return
    // Narrow the optional-position shape to the required-position type the
    // bezier math needs (guards above prove presence).
    type P = { x: number; y: number; z: number }
    const s: P = start as unknown as P
    const e: P = end as unknown as P
    const rise = (() => {
        const v = (((pair.a + pair.b) % 5) - 2) / 2
        return Number.isFinite(v) ? v : 0.3
    })()
    const control = getBezierControlPoint(s, e, (pair.a * 31 + pair.b * 17) % 2 === 0 ? 1 : -1, rise)
    const startColor = colorFn(points[pair.a]?.cluster ?? null)
    const endColor = colorFn(points[pair.b]?.cluster ?? null)
    const samples: Array<{ x: number; y: number; z: number; r: number; g: number; b: number }> = []

    for (let i = 0; i <= segments; i += 1) {
        const t = i / segments
        const inv = 1 - t
        const x = inv * inv * s.x + 2 * inv * t * control.x + t * t * e.x
        const y = inv * inv * s.y + 2 * inv * t * control.y + t * t * e.y
        const z = inv * inv * s.z + 2 * inv * t * control.z + t * t * e.z
        samples.push({
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
            z: Number.isFinite(z) ? z : 0,
            r: (startColor.r + (endColor.r - startColor.r) * t) * intensity,
            g: (startColor.g + (endColor.g - startColor.g) * t) * intensity,
            b: (startColor.b + (endColor.b - startColor.b) * t) * intensity
        })
    }

    for (let i = 0; i < samples.length - 1; i += 1) {
        const a = samples[i]!
        const b = samples[i + 1]!
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
        colors.push(a.r, a.g, a.b, b.r, b.g, b.b)
    }
}

// ── Split-2: layer intensity + in-place dirty rebuild (2026-08-11) ──

/**
 * Per-layer intensity values matching createMycelium() vertex color baking.
 * Without these, rebuilt threads flash to full brightness (intensity=1)
 * when nodes move, breaking the visual continuity of the mycelium layers.
 * DI: `hasSemantic` replaces the state.semanticNeighborMapByLeadId?.size read.
 */
export function computeLayerIntensityMap(hasSemantic: boolean): Record<number, number> {
    return {
        0: hasSemantic ? 0.38 : 0.28, // core
        1: hasSemantic ? 0.22 : 0.16, // wispy
        2: hasSemantic ? 0.32 : 0.24 // bridge
    }
}

/**
 * Rebuild only dirty pairs for a single mycelium line layer, writing
 * bezier segments IN-PLACE at their original buffer offset. Clean pairs
 * are left untouched — no repacking, no zeroing.
 * DI: pairs (webglContext.myceliumConnectionPairs), dirtySet (dirtyNodeIndices),
 * nodePositions/points/colorFn (state + getThreadCategoryColor) are injected.
 */
export function rebuildDirtyPairsInLayer(
    line: LineSegments2 | null,
    layer: number,
    layerIntensity: Record<number, number>,
    pairs: Array<{ a: number; b: number; layer: number }>,
    dirtySet: Set<number>,
    nodePositions: MyceliumPointLike[],
    points: MyceliumPointLike[],
    colorFn: (cluster: number | null | undefined) => { r: number; g: number; b: number },
    /** Active tessellation level — MUST match what the buffer was built with:
     * pair N's in-place write offset assumes exactly this many segments/pair. */
    segmentsPerPair: number = BEZIER_SEGMENTS_PER_PAIR
): number {
    const SEGMENTS_PER_PAIR = segmentsPerPair
    const FLOATS_PER_SEGMENT = 6 // 3 start + 3 end

    const geom = line?.geometry as LineGeometry | undefined
    const startAttr = geom?.getAttribute('instanceStart') as BufferAttribute | undefined
    const endAttr = geom?.getAttribute('instanceEnd') as BufferAttribute | undefined
    const colorStartAttr = geom?.getAttribute('instanceColorStart') as BufferAttribute | undefined
    const colorEndAttr = geom?.getAttribute('instanceColorEnd') as BufferAttribute | undefined
    if (!startAttr || !endAttr) return 0

    const startArray = startAttr.array as Float32Array
    const endArray = endAttr.array as Float32Array
    const colorStartArray = colorStartAttr?.array as Float32Array | undefined
    const colorEndArray = colorEndAttr?.array as Float32Array | undefined

    let layerPairIndex = 0
    let dirtyPairCount = 0
    pairs.forEach((pair) => {
        if (pair.layer !== layer) return
        const pairIsDirty = dirtySet.has(pair.a) || dirtySet.has(pair.b)
        layerPairIndex += 1
        if (!pairIsDirty) return
        dirtyPairCount += 1

        const pairPositions: number[] = []
        const pairColors: number[] = []
        pushBezierLinePair(
            pairPositions,
            pairColors,
            { a: pair.a, b: pair.b },
            nodePositions,
            points,
            colorFn,
            layerIntensity[layer] ?? 1,
            SEGMENTS_PER_PAIR
        )

        // Write this pair's segments to its original buffer offset.
        // Pair N in the layer starts at segment (N-1)*SEGMENTS_PER_PAIR.
        const baseSeg = (layerPairIndex - 1) * SEGMENTS_PER_PAIR
        const maxSegsForPair = Math.max(
            0,
            Math.min(
                SEGMENTS_PER_PAIR,
                Math.floor(startArray.length / 3) - baseSeg,
                Math.floor(pairPositions.length / FLOATS_PER_SEGMENT)
            )
        )
        for (let s = 0; s < maxSegsForPair; s += 1) {
            const pi = s * FLOATS_PER_SEGMENT
            const si = (baseSeg + s) * 3
            startArray[si] = Number.isFinite(pairPositions[pi]) ? pairPositions[pi]! : 0
            startArray[si + 1] = Number.isFinite(pairPositions[pi + 1]) ? pairPositions[pi + 1]! : 0
            startArray[si + 2] = Number.isFinite(pairPositions[pi + 2]) ? pairPositions[pi + 2]! : 0
            endArray[si] = Number.isFinite(pairPositions[pi + 3]) ? pairPositions[pi + 3]! : 0
            endArray[si + 1] = Number.isFinite(pairPositions[pi + 4]) ? pairPositions[pi + 4]! : 0
            endArray[si + 2] = Number.isFinite(pairPositions[pi + 5]) ? pairPositions[pi + 5]! : 0
        }
        if (colorStartArray && colorEndArray && pairColors.length) {
            const maxColorSegsForPair = Math.min(
                SEGMENTS_PER_PAIR,
                Math.floor(colorStartArray.length / 3) - baseSeg,
                Math.floor(pairColors.length / FLOATS_PER_SEGMENT)
            )
            for (let s = 0; s < maxColorSegsForPair; s += 1) {
                const ci = s * FLOATS_PER_SEGMENT
                const si = (baseSeg + s) * 3
                colorStartArray[si] = pairColors[ci] ?? 0
                colorStartArray[si + 1] = pairColors[ci + 1] ?? 0
                colorStartArray[si + 2] = pairColors[ci + 2] ?? 0
                colorEndArray[si] = pairColors[ci + 3] ?? 0
                colorEndArray[si + 1] = pairColors[ci + 4] ?? 0
                colorEndArray[si + 2] = pairColors[ci + 5] ?? 0
            }
            colorStartAttr!.needsUpdate = true
            colorEndAttr!.needsUpdate = true
        }
    })
    startAttr.needsUpdate = true
    endAttr.needsUpdate = true
    return dirtyPairCount
}
