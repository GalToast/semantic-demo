/**
 * @vitest-environment jsdom
 *
 * Real (non-mock) unit coverage for `getPointBoundsCenter` exported from
 * src/lib/engine/node-manager.ts:202. The function's only existing coverage
 * was a vi.fn() mock at tests/unit-active/three-engine-core.test.ts:91,
 * which meant zero protection against the centering math drifting.
 *
 * The function signature (post PR-A bounds-center fix):
 *
 *   getPointBoundsCenter(
 *     points: Array<{ x?: number; y?: number; z?: number }>,
 *     positionBuffer: Float32Array
 *   ): { center: Vector3; min: Vector3; max: Vector3; count: number }
 *
 * Behavior contract:
 *   1. The loop iterates `i = 0 .. points.length - 1`, reading
 *      `positionBuffer[i*3 + 0/1/2]`. The `positionBuffer` must contain
 *      at least `points.length * 3` floats.
 *   2. The runtime invariant (per AGENTS.md) is that
 *      `state.rawPositionsBuffer.length === state.points.length * 3`
 *      (the canonical unit-cube invariant).
 *   3. For each index, skip the point if any of x/y/z is non-finite
 *      (NaN, Infinity, -Infinity, or undefined-from-buffer-end).
 *   4. Track per-axis min/max across the surviving points.
 *   5. Return the midpoint of (min, max) on each axis.
 *   6. Fallback: if no valid points survive, return the (0,0,0) origin with
 *      count=0.
 *
 * The legacy fallback that used `points[i].x/.y/.z` was removed by
 * `tmp/bounds-center-audit-2026-06-29.md` (PR-A): the `points` arg is no
 * longer consulted, only its `.length`. The legacy `.x/.y/.z` fields are
 * absent on the runtime Point type.
 *
 * NOTE on test design: the helper `asPoints(n)` builds an Array of n empty
 * records — the function reads only `.length`, never the records
 * themselves, so empty records work.
 */
import { describe, it, expect } from 'vitest'
import { Vector3 } from 'three'
import { getPointBoundsCenter } from '@lib/engine/node-manager'

/** Build an `n`-length stub `points` array. Only `.length` is consulted. */
const asPoints = (n: number): Array<{ x?: number; y?: number; z?: number }> =>
    new Array(n).fill(null).map(() => ({}))

describe('getPointBoundsCenter — real coverage for the Float32Array centering math', () => {
    it('returns (0,0,0) center with count=0 when the buffer is empty', () => {
        const buffer = new Float32Array(0)
        const result = getPointBoundsCenter(asPoints(0), buffer)
        expect(result.count).toBe(0)
        expect(result.center.x).toBe(0)
        expect(result.center.y).toBe(0)
        expect(result.center.z).toBe(0)
        expect(result.min.equals(new Vector3(0, 0, 0))).toBe(true)
        expect(result.max.equals(new Vector3(0, 0, 0))).toBe(true)
    })

    it('returns (0,0,0) center with count=0 when the buffer has all non-finite entries', () => {
        // 3 points (9 floats), each triple is NaN, Infinity, or -Infinity.
        const buffer = new Float32Array([
            NaN,
            Infinity,
            -Infinity,
            NaN,
            NaN,
            NaN,
            Infinity,
            NaN,
            NaN
        ])
        const result = getPointBoundsCenter(asPoints(3), buffer)
        expect(result.count).toBe(0)
        expect(result.center.x).toBe(0)
        expect(result.center.y).toBe(0)
        expect(result.center.z).toBe(0)
    })

    it('centers on the midpoint of a single point (min == max == center)', () => {
        const buffer = new Float32Array([0.25, 0.5, 0.75])
        const result = getPointBoundsCenter(asPoints(1), buffer)
        expect(result.count).toBe(1)
        expect(result.center.x).toBeCloseTo(0.25, 6)
        expect(result.center.y).toBeCloseTo(0.5, 6)
        expect(result.center.z).toBeCloseTo(0.75, 6)
        expect(result.min.x).toBeCloseTo(0.25, 6)
        expect(result.max.x).toBeCloseTo(0.25, 6)
    })

    it('centers on the unit-cube midpoint for 4 corner points at (0,0,0) and (1,1,1)', () => {
        // 4 unique corner combinations spanning the [0,1]^3 unit cube.
        const buffer = new Float32Array([
            0,
            0,
            0, // corner A (origin)
            1,
            0,
            0, // corner B (+x)
            0,
            1,
            1, // corner C (+y, +z)
            1,
            1,
            1 // corner D (+x, +y, +z)
        ])
        const result = getPointBoundsCenter(asPoints(4), buffer)
        expect(result.count).toBe(4)
        expect(result.center.x).toBeCloseTo(0.5, 6)
        expect(result.center.y).toBeCloseTo(0.5, 6)
        expect(result.center.z).toBeCloseTo(0.5, 6)
        expect(result.min.equals(new Vector3(0, 0, 0))).toBe(true)
        expect(result.max.equals(new Vector3(1, 1, 1))).toBe(true)
    })

    it('skips non-finite entries within an otherwise-valid buffer', () => {
        // 5 points, point 2 has NaN triple — must be skipped.
        const buffer = new Float32Array([
            0,
            0,
            0, // valid
            1,
            1,
            1, // valid
            NaN,
            NaN,
            NaN, // SKIPPED
            0.4,
            0.6,
            0.2, // valid
            0.8,
            0.3,
            0.9 // valid
        ])
        const result = getPointBoundsCenter(asPoints(5), buffer)
        expect(result.count).toBe(4)
        expect(result.min.x).toBeCloseTo(0, 6)
        expect(result.min.y).toBeCloseTo(0, 6)
        expect(result.min.z).toBeCloseTo(0, 6)
        expect(result.max.x).toBeCloseTo(1, 6)
        expect(result.max.y).toBeCloseTo(1, 6)
        expect(result.max.z).toBeCloseTo(1, 6)
        // center = ((0+1)/2, (0+1)/2, (0+1)/2) = (0.5, 0.5, 0.5)
        expect(result.center.x).toBeCloseTo(0.5, 6)
        expect(result.center.y).toBeCloseTo(0.5, 6)
        expect(result.center.z).toBeCloseTo(0.5, 6)
    })

    it('centers on negative-axis coordinates correctly', () => {
        // Cube from (-1,-1,-1) to (1,1,1) — center should be origin.
        const buffer = new Float32Array([
            -1,
            -1,
            -1,
            1,
            -1,
            -1,
            -1,
            1,
            -1,
            1,
            1,
            1,
            -1,
            -1,
            1,
            1,
            -1,
            1,
            -1,
            1,
            1,
            1,
            1,
            1
        ])
        const result = getPointBoundsCenter(asPoints(8), buffer)
        expect(result.count).toBe(8)
        expect(result.center.x).toBeCloseTo(0, 6)
        expect(result.center.y).toBeCloseTo(0, 6)
        expect(result.center.z).toBeCloseTo(0, 6)
        expect(result.min.x).toBeCloseTo(-1, 6)
        expect(result.max.x).toBeCloseTo(1, 6)
    })

    it('handles the unit-cube invariant — 1,000 random points center near (0.5, 0.5, 0.5)', () => {
        // Smoke test for the AGENTS.md invariant that the live 8,406-point
        // mycelium data lives in the [0,1]^3 unit cube. We don't load the
        // full dataset here; we verify the function's math doesn't regress
        // for a representative random fill that lives inside [0,1]^3.

        const N = 1000
        const buffer = new Float32Array(N * 3)
        // Deterministic pseudo-random fill that covers the full cube.
        let seed = 0x9e3779b9
        const nextRand = () => {
            // Linear congruential, deterministic.
            seed = (seed * 1103515245 + 12345) & 0x7fffffff
            return seed / 0x7fffffff
        }
        for (let i = 0; i < N; i += 1) {
            buffer[i * 3] = nextRand()
            buffer[i * 3 + 1] = nextRand()
            buffer[i * 3 + 2] = nextRand()
        }

        const result = getPointBoundsCenter(asPoints(N), buffer)
        expect(result.count).toBe(N)
        // Center must lie inside the [0,1]^3 range and approach 0.5.
        expect(result.center.x).toBeGreaterThan(0.4)
        expect(result.center.x).toBeLessThan(0.6)
        expect(result.center.y).toBeGreaterThan(0.4)
        expect(result.center.y).toBeLessThan(0.6)
        expect(result.center.z).toBeGreaterThan(0.4)
        expect(result.center.z).toBeLessThan(0.6)
        // Min/max cover the [0,1] range under this deterministic LCG.
        expect(result.min.x).toBeGreaterThanOrEqual(0)
        expect(result.min.x).toBeLessThan(0.05)
        expect(result.max.x).toBeGreaterThan(0.95)
        expect(result.max.x).toBeLessThanOrEqual(1)
    })

    it('skips trailing partial points when buffer.length < points.length * 3', () => {
        // 4 'points' requested but the buffer only has 3 floats (1 valid point).
        // The remaining accesses return undefined and the inner check skips them.
        const buffer = new Float32Array([0.1, 0.2, 0.3])
        const result = getPointBoundsCenter(asPoints(4), buffer)
        expect(result.count).toBe(1)
        expect(result.center.x).toBeCloseTo(0.1, 6)
        expect(result.center.y).toBeCloseTo(0.2, 6)
        expect(result.center.z).toBeCloseTo(0.3, 6)
    })
})
