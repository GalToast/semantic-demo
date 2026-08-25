/**
 * LineSegmentsGeometry fast-path parity: buildFastLineSegmentsGeometry
 * (precomputed bounds, zero O(n) computes) must produce a geometry
 * equivalent to three 0.184's setPositions+setColors on identical input —
 * instanceCount, interleaved instance arrays, color arrays, boundingBox,
 * boundingSphere. CI-guard for the three-internals layout assumption.
 * INP campaign 2026-08-25.
 */
import { describe, expect, it } from 'vitest'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { buildFastLineSegmentsGeometry } from '../../src/lib/engine/thread-manager'
import { computeLayerBounds } from '../../src/lib/workers/mycelium-build-worker'

/** Deterministic LCG so random-data assertions never flake. */
function lcg(seed: number): () => number {
    let state = seed
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296
        return state / 4294967296
    }
}

function makeFixture(segments: number, seed: number): { positions: Float32Array; colors: Float32Array } {
    const rand = lcg(seed)
    const positions = new Float32Array(segments * 6)
    const colors = new Float32Array(segments * 6)
    for (let i = 0; i < positions.length; i += 1) {
        positions[i] = rand() * 4 - 2
        colors[i] = rand()
    }
    return { positions, colors }
}

describe('LineSegmentsGeometry fast path — parity with setPositions/setColors', () => {
    it('fast geometry matches setPositions+setColors on 100 segments', () => {
        const { positions, colors } = makeFixture(100, 42)
        const reference = new LineSegmentsGeometry()
        reference.setPositions(positions)
        reference.setColors(colors)
        const fast = buildFastLineSegmentsGeometry(positions, colors, computeLayerBounds(positions))
        expect(fast).not.toBeNull()
        const g = fast!
        expect(g.instanceCount).toBe(reference.instanceCount)
        expect(Array.from(g.attributes.instanceStart.data.array)).toEqual(
            Array.from(reference.attributes.instanceStart.data.array)
        )
        expect(Array.from(g.attributes.instanceEnd.data.array)).toEqual(
            Array.from(reference.attributes.instanceEnd.data.array)
        )
        expect(Array.from(g.attributes.instanceColorStart.data.array)).toEqual(
            Array.from(reference.attributes.instanceColorStart.data.array)
        )
        expect(Array.from(g.attributes.instanceColorEnd.data.array)).toEqual(
            Array.from(reference.attributes.instanceColorEnd.data.array)
        )
        expect(g.boundingBox!.min.x).toBeCloseTo(reference.boundingBox!.min.x, 5)
        expect(g.boundingBox!.min.y).toBeCloseTo(reference.boundingBox!.min.y, 5)
        expect(g.boundingBox!.min.z).toBeCloseTo(reference.boundingBox!.min.z, 5)
        expect(g.boundingBox!.max.x).toBeCloseTo(reference.boundingBox!.max.x, 5)
        expect(g.boundingBox!.max.y).toBeCloseTo(reference.boundingBox!.max.y, 5)
        expect(g.boundingBox!.max.z).toBeCloseTo(reference.boundingBox!.max.z, 5)
        expect(g.boundingSphere!.radius).toBeCloseTo(reference.boundingSphere!.radius, 4)
    })

    it('computeLayerBounds matches three computeBoundingBox/computeBoundingSphere on random data', () => {
        const { positions } = makeFixture(100, 777)
        const reference = new LineSegmentsGeometry()
        reference.setPositions(positions)
        const bounds = computeLayerBounds(positions)
        expect(bounds.min.x).toBeCloseTo(reference.boundingBox!.min.x, 5)
        expect(bounds.min.y).toBeCloseTo(reference.boundingBox!.min.y, 5)
        expect(bounds.min.z).toBeCloseTo(reference.boundingBox!.min.z, 5)
        expect(bounds.max.x).toBeCloseTo(reference.boundingBox!.max.x, 5)
        expect(bounds.max.y).toBeCloseTo(reference.boundingBox!.max.y, 5)
        expect(bounds.max.z).toBeCloseTo(reference.boundingBox!.max.z, 5)
        expect(bounds.radius).toBeCloseTo(reference.boundingSphere!.radius, 4)
    })

    it('sanity rejections return null (fallback triggers)', () => {
        const ok = new Float32Array(12)
        const bounds = computeLayerBounds(ok)
        expect(buildFastLineSegmentsGeometry(ok, new Float32Array(12), bounds)).not.toBeNull()
        // NaN radius → null
        expect(buildFastLineSegmentsGeometry(ok, new Float32Array(12), { ...bounds, radius: Number.NaN })).toBeNull()
        // length % 6 !== 0 → null
        expect(buildFastLineSegmentsGeometry(new Float32Array(10), new Float32Array(10), bounds)).toBeNull()
        // empty → null
        expect(buildFastLineSegmentsGeometry(new Float32Array(0), new Float32Array(0), bounds)).toBeNull()
    })
})
