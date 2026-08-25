/**
 * Parity test: the mycelium build worker's buildMyceliumBuffers must produce
 * buffers IDENTICAL to the main-thread pushBezierLinePair reference path
 * (same math, same order) — INP campaign 2026-08-25.
 *
 * The worker is the off-main-thread extraction of the tessellation loop from
 * createMycelium; any drift between the two paths would ship visual
 * differences (arc shapes / colors) only when the worker path is active.
 */
import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import { buildMyceliumBuffers } from '../../src/lib/workers/mycelium-build-worker'
import { pushBezierLinePair, seedBezierViewVector } from '../../src/lib/engine/mycelium-bezier'

const VIEW = { x: 0.28, y: 0.2, z: 1 }
const COLORS = ['#4fd1c5', '#f6ad55', '#fc8181', '#68d391']

const fixture = {
    corePairs: [
        { a: 0, b: 1 },
        { a: 1, b: 2 },
        { a: 2, b: 0 }
    ],
    wispyPairs: [
        { a: 0, b: 3 },
        { a: 3, b: 1 }
    ],
    bridgePairs: [{ a: 2, b: 3 }],
    nodePositions: [
        { x: 0.1, y: 0.2, z: 0.3 },
        { x: 0.5, y: 0.4, z: 0.6 },
        { x: 0.8, y: 0.7, z: 0.9 },
        { x: 0.3, y: 0.6, z: 0.2 }
    ],
    points: [{ cluster: 0 }, { cluster: 1 }, { cluster: 2 }, { cluster: 0 }],
    colors: COLORS,
    intensities: { core: 0.38, wispy: 0.22, bridge: 0.32 },
    viewVector: VIEW,
    segmentsPerPair: 10
}

describe('mycelium build worker — parity with main-thread reference', () => {
    it('produces buffers identical to pushBezierLinePair on main', () => {
        seedBezierViewVector(VIEW)

        // Reference: the exact main-thread loop from createMycelium.
        const ref: Record<string, number[]> = {
            core: [], coreColors: [], wispy: [], wispyColors: [], bridge: [], bridgeColors: []
        }
        const colorFn = (cluster: number | null | undefined) => {
            const c = new Color(COLORS[(cluster ?? 0) % COLORS.length])
            return { r: c.r, g: c.g, b: c.b }
        }
        for (const pair of fixture.corePairs)
            pushBezierLinePair(ref.core, ref.coreColors, pair, fixture.nodePositions, fixture.points, colorFn, fixture.intensities.core, fixture.segmentsPerPair)
        for (const pair of fixture.wispyPairs)
            pushBezierLinePair(ref.wispy, ref.wispyColors, pair, fixture.nodePositions, fixture.points, colorFn, fixture.intensities.wispy, fixture.segmentsPerPair)
        for (const pair of fixture.bridgePairs)
            pushBezierLinePair(ref.bridge, ref.bridgeColors, pair, fixture.nodePositions, fixture.points, colorFn, fixture.intensities.bridge, fixture.segmentsPerPair)

        // Worker path (same pure function, direct call — no worker spawn needed).
        const built = buildMyceliumBuffers(fixture)

        expect(built.core).toEqual(new Float32Array(ref.core))
        expect(built.wispy).toEqual(new Float32Array(ref.wispy))
        expect(built.bridge).toEqual(new Float32Array(ref.bridge))
        expect(built.coreColors).toEqual(new Float32Array(ref.coreColors))
        expect(built.wispyColors).toEqual(new Float32Array(ref.wispyColors))
        expect(built.bridgeColors).toEqual(new Float32Array(ref.bridgeColors))
    })

    it('buffers are non-empty and segment counts match segmentsPerPair', () => {
        const built = buildMyceliumBuffers(fixture)
        // Each pair emits `segments` 6-float segment entries (positions).
        const expectedPerPair = 6 * fixture.segmentsPerPair
        expect(built.core.length).toBe(fixture.corePairs.length * expectedPerPair)
        expect(built.wispy.length).toBe(fixture.wispyPairs.length * expectedPerPair)
        expect(built.bridge.length).toBe(fixture.bridgePairs.length * expectedPerPair)
    })

    it('view-vector seeding changes arc geometry (guard against silent default)', () => {
        const a = buildMyceliumBuffers({ ...fixture, viewVector: { x: 0.28, y: 0.2, z: 1 } })
        const b = buildMyceliumBuffers({ ...fixture, viewVector: { x: -0.5, y: 0.6, z: 0.4 } })
        expect(Buffer.from(a.core.buffer).equals(Buffer.from(b.core.buffer))).toBe(false)
    })
})
