/**
 * @vitest-environment jsdom
 *
 * Direct unit coverage for src/lib/journey/focus-pocket-geometry.ts (848 LOC).
 *
 * This file is the largest untested math module in the codebase. It exports
 * 12+ functions spanning seeded placement, screen-bounds profiling, thread
 * curve math, and pocket staging. Many of those functions read the Svelte
 * appState singleton (camera, points, nodePositions, navState) and are
 * deferred to a follow-up that lands clean state-shims.
 *
 * This test covers every PURE exported function — the ones that do NOT touch
 * `state.*` — plus the viewport-profile and placement functions that are
 * pure when given an explicit viewportProfile argument. These are the
 * highest-value targets: clampNumber, easeOutQuint, seededUnit, and
 * safeUnitScore are used across the engine; getFocusConstellationPlacement
 * and applyRelationshipRolePlacementBias drive the focus-pocket layout.
 *
 * Strategy: mock the two module dependencies that reach outside pure math
 * (getViewportSize from @lib/utils/environment, getFocusPanelMode from
 * @lib/utils/focus-panel-mode) so the pure functions can run in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Vec3 } from '@lib/utils/math-vec3'

// ── Hoisted mutable viewport snapshot ───────────────────────────────────────

const { _viewport, _curveState, _focusPanelMode } = vi.hoisted(() => ({
    _viewport: {
        width: 1280,
        height: 800
    },
    _curveState: {
        camera: null,
        nodePositions: [] as Array<{ x: number; y: number; z: number }>,
        navState: { focusedIndex: null as number | null },
        points: [] as Array<Record<string, unknown>>
    },
    _focusPanelMode: { value: 'overview' }
}))

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@lib/utils/environment', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/utils/environment')>()
    return {
        ...actual,
        getViewportSize: () => ({ width: _viewport.width, height: _viewport.height })
    }
})

vi.mock('@lib/utils/focus-panel-mode', () => ({
    getFocusPanelMode: () => _focusPanelMode.value,
    FOCUS_PANEL_MODE: {
        OVERVIEW: 'overview',
        FIELD_NODE: 'field-node',
        MANUAL_PANEL: 'manual-panel',
        MANUAL_COLLAPSED: 'manual-panel-collapsed',
        LEGEND_OPEN: 'legend-open'
    }
}))

vi.mock('@lib/state/app.svelte', () => ({
    appState: _curveState
}))

// ── Import under test (must appear AFTER vi.mock) ───────────────────────────

import {
    clampNumber,
    easeOutQuint,
    seededUnit,
    safeUnitScore,
    getFocusConstellationViewportProfile,
    getFocusBeaconDeclutterProfile,
    getDeclutteredFocusBeaconIndices,
    getFocusConstellationPlacement,
    applyRelationshipRolePlacementBias,
    getFocusThreadCurvePoint,
    getFocusThreadCurvePointInto,
    type ConstellationMotif,
    type ViewportProfile,
    type PlacementParams
} from '@lib/journey/focus-pocket-geometry'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeMotif(overrides: Partial<ConstellationMotif> = {}): ConstellationMotif {
    return {
        key: 'market',
        label: 'semantic constellation',
        directLift: 0.6,
        supportLift: 0.3,
        directPriority: 0.7,
        supportPriority: 0.4,
        braid: 0.52,
        seed: 0.3,
        ...overrides
    }
}

function makeViewportProfile(overrides: Partial<ViewportProfile> = {}): ViewportProfile {
    return {
        key: 'roomy',
        primaryLimit: 12,
        supportLimit: 10,
        haloLimit: 8,
        primaryRadiusScale: 0.82,
        supportRadiusScale: 0.78,
        haloRadiusScale: 0.74,
        primarySpreadScale: 1.42,
        supportSpreadScale: 1.3,
        haloSpreadScale: 1.12,
        primaryRadiusFloor: 0.072,
        primaryRadiusCeiling: 0.15,
        supportRadiusFloor: 0.116,
        supportRadiusCeiling: 0.25,
        primaryStagedBlend: 0.9,
        supportStagedBlend: 0.88,
        haloStagedBlend: 0.9,
        primaryOriginBlend: 0.035,
        supportOriginBlend: 0.07,
        haloOriginBlend: 0.05,
        zScale: 0.78,
        beaconLimit: 12,
        overlayLimit: 12,
        primaryBeam: 10,
        supportBeam: 8,
        supportSeedLimit: 5,
        supportNeighborLimit: 4,
        ...overrides
    }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('focus-pocket-geometry — pure utility functions', () => {
    // ── clampNumber ───────────────────────────────────────────────────────
    describe('clampNumber', () => {
        it('returns the value when within [min, max]', () => {
            expect(clampNumber(5, 0, 10)).toBe(5)
            expect(clampNumber(0.5, 0, 1)).toBeCloseTo(0.5)
        })

        it('clamps to min when value < min', () => {
            expect(clampNumber(-5, 0, 10)).toBe(0)
            expect(clampNumber(-100, -10, 10)).toBe(-10)
        })

        it('clamps to max when value > max', () => {
            expect(clampNumber(15, 0, 10)).toBe(10)
            expect(clampNumber(100, -10, 10)).toBe(10)
        })

        it('returns 0 for non-numeric input (Number(value) || 0)', () => {
            expect(clampNumber(NaN, 0, 10)).toBe(0)
        })

        it('handles inverted-range edge (min === max)', () => {
            expect(clampNumber(5, 7, 7)).toBe(7)
        })
    })

    // ── easeOutQuint ──────────────────────────────────────────────────────
    describe('easeOutQuint', () => {
        it('returns 0 at t=0', () => {
            expect(easeOutQuint(0)).toBe(0)
        })

        it('returns 1 at t=1', () => {
            expect(easeOutQuint(1)).toBe(1)
        })

        it('is monotonically increasing on [0, 1]', () => {
            const a = easeOutQuint(0.25)
            const b = easeOutQuint(0.5)
            const c = easeOutQuint(0.75)
            expect(a).toBeLessThan(b)
            expect(b).toBeLessThan(c)
        })

        it('returns 0.5-ish midpoint (known value: 1 - 0.5^5 = 0.96875 at t=0.5)', () => {
            // easeOutQuint(0.5) = 1 - (1-0.5)^5 = 1 - 0.03125 = 0.96875
            expect(easeOutQuint(0.5)).toBeCloseTo(0.96875, 10)
        })
    })

    // ── seededUnit ────────────────────────────────────────────────────────
    describe('seededUnit', () => {
        it('returns a value in [0, 1)', () => {
            for (let i = 0; i < 50; i++) {
                const v = seededUnit(i, i * 2, i * 3)
                expect(v).toBeGreaterThanOrEqual(0)
                expect(v).toBeLessThan(1)
            }
        })

        it('is deterministic for the same inputs', () => {
            const a = seededUnit(1, 2, 3)
            const b = seededUnit(1, 2, 3)
            expect(a).toBe(b)
        })

        it('produces different values for different seeds', () => {
            const a = seededUnit(1)
            const b = seededUnit(2)
            const c = seededUnit(3)
            // Extremely unlikely three different seeds all collide
            expect(new Set([a, b, c]).size).toBeGreaterThan(1)
        })

        it('handles zero arguments', () => {
            const v = seededUnit()
            expect(v).toBeGreaterThanOrEqual(0)
            expect(v).toBeLessThan(1)
        })
    })

    // ── safeUnitScore ─────────────────────────────────────────────────────
    describe('safeUnitScore', () => {
        it('clamps a valid number to [0, 1]', () => {
            expect(safeUnitScore(0.5)).toBeCloseTo(0.5)
            expect(safeUnitScore(0)).toBe(0)
            expect(safeUnitScore(1)).toBe(1)
        })

        it('clamps values above 1 to 1 and below 0 to 0', () => {
            expect(safeUnitScore(1.5)).toBe(1)
            expect(safeUnitScore(-0.5)).toBe(0)
        })

        it('returns fallback for non-finite values', () => {
            expect(safeUnitScore(NaN, 0.5)).toBe(0.5)
            expect(safeUnitScore(Infinity, 0.25)).toBe(0.25)
            expect(safeUnitScore('not-a-number', 0.1)).toBe(0.1)
        })

        it('defaults fallback to 0', () => {
            expect(safeUnitScore(NaN)).toBe(0)
        })
    })
})

describe('focus-pocket-geometry — viewport & beacon profiling', () => {
    beforeEach(() => {
        _viewport.width = 1280
        _viewport.height = 800
    })

    // ── getFocusConstellationViewportProfile ──────────────────────────────
    describe('getFocusConstellationViewportProfile', () => {
        it('returns "roomy" profile for a large viewport', () => {
            _viewport.width = 1920
            _viewport.height = 1080
            const vp = getFocusConstellationViewportProfile()
            expect(vp.key).toBe('roomy')
            expect(vp.primaryLimit).toBe(12)
            expect(vp.supportLimit).toBe(10)
            expect(vp.haloLimit).toBe(8)
        })

        it('returns "compact" profile for a narrow but tall viewport', () => {
            _viewport.width = 500
            _viewport.height = 900
            const vp = getFocusConstellationViewportProfile()
            expect(vp.key).toBe('compact')
            expect(vp.primaryLimit).toBe(8)
        })

        it('returns "condensed" profile for a narrow AND short viewport', () => {
            _viewport.width = 400
            _viewport.height = 400
            const vp = getFocusConstellationViewportProfile()
            expect(vp.key).toBe('condensed')
            expect(vp.primaryLimit).toBe(5)
            expect(vp.supportLimit).toBe(4)
            expect(vp.haloLimit).toBe(3)
        })

        it('includes camera composition fields on condensed profile', () => {
            _viewport.width = 400
            _viewport.height = 400
            const vp = getFocusConstellationViewportProfile()
            expect(vp.cameraPadding).toBeDefined()
            expect(vp.cameraDistanceMax).toBeDefined()
            expect(vp.targetOffsetLimit).toBeDefined()
            expect(vp.compositionRightOffset).toBeDefined()
            expect(vp.compositionLift).toBeDefined()
        })
    })

    // ── getFocusBeaconDeclutterProfile ────────────────────────────────────
    describe('getFocusBeaconDeclutterProfile', () => {
        it('uses limit field when present', () => {
            const result = getFocusBeaconDeclutterProfile({ limit: 7 })
            expect(result.limit).toBe(7)
            expect(result.reason).toBe('default')
        })

        it('falls back to beaconLimit when limit is absent', () => {
            const result = getFocusBeaconDeclutterProfile({ beaconLimit: 9 })
            expect(result.limit).toBe(9)
        })

        it('defaults to 12 when neither limit nor beaconLimit is present', () => {
            const result = getFocusBeaconDeclutterProfile({})
            expect(result.limit).toBe(12)
        })

        it('preserves scaleScale / opacityScale / pulseScale when provided', () => {
            const result = getFocusBeaconDeclutterProfile({
                limit: 5,
                scaleScale: 0.8,
                opacityScale: 0.9,
                pulseScale: 1.1,
                pulseOpacityScale: 0.7,
                reason: 'test'
            })
            expect(result.scaleScale).toBeCloseTo(0.8)
            expect(result.opacityScale).toBeCloseTo(0.9)
            expect(result.pulseScale).toBeCloseTo(1.1)
            expect(result.pulseOpacityScale).toBeCloseTo(0.7)
            expect(result.reason).toBe('test')
        })

        it('uses key as reason fallback when reason is absent', () => {
            const result = getFocusBeaconDeclutterProfile({ key: 'condensed' })
            expect(result.reason).toBe('condensed')
        })
    })

    // ── getDeclutteredFocusBeaconIndices ──────────────────────────────────
    describe('getDeclutteredFocusBeaconIndices', () => {
        it('slices to the given limit', () => {
            const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
            expect(getDeclutteredFocusBeaconIndices(indices, 3)).toEqual([0, 1, 2])
        })

        it('returns all indices when limit >= length', () => {
            const indices = [10, 20, 30]
            expect(getDeclutteredFocusBeaconIndices(indices, 10)).toEqual([10, 20, 30])
        })

        it('returns empty array when limit is 0', () => {
            expect(getDeclutteredFocusBeaconIndices([1, 2, 3], 0)).toEqual([])
        })

        it('handles non-finite limit by returning all indices', () => {
            const indices = [1, 2, 3]
            expect(getDeclutteredFocusBeaconIndices(indices, NaN)).toEqual([1, 2, 3])
        })
    })
})

describe('focus-pocket-geometry — caller-owned curve output', () => {
    const edge = {
        a: 0,
        b: 1,
        motifBraid: 0.52,
        role: 'direct',
        curveLift: 0.8,
        side: 1,
        rise: 0.2,
        depth: 0.15,
        anchorPull: 0
    }

    beforeEach(() => {
        _curveState.nodePositions = [
            { x: -0.2, y: 0.1, z: 0.05 },
            { x: 0.55, y: -0.15, z: 0.35 }
        ]
        _curveState.navState.focusedIndex = null
        _focusPanelMode.value = 'overview'
    })

    it('matches the public curve result and keeps sequential targets independent', () => {
        const targetA = new Vec3()
        const targetB = new Vec3()
        const expected = getFocusThreadCurvePoint(edge, 0.37)

        expect(getFocusThreadCurvePointInto(edge, 0.37, targetA)).toBe(targetA)
        const snapshotA = targetA.clone()
        expect(getFocusThreadCurvePointInto({ ...edge, side: -1 }, 0.63, targetB)).toBe(targetB)

        expect(targetA.x).toBeCloseTo(expected.x, 12)
        expect(targetA.y).toBeCloseTo(expected.y, 12)
        expect(targetA.z).toBeCloseTo(expected.z, 12)
        expect(targetB).not.toBe(targetA)
        expect(targetA.x).toBe(snapshotA.x)
        expect(targetA.y).toBe(snapshotA.y)
        expect(targetA.z).toBe(snapshotA.z)
    })

    it('preserves the field-node long-arc branch through the output path', () => {
        _focusPanelMode.value = 'field-node'
        const target = new Vec3()
        const expected = getFocusThreadCurvePoint(edge, 0.5)

        getFocusThreadCurvePointInto(edge, 0.5, target)

        expect(target.x).toBeCloseTo(expected.x, 12)
        expect(target.y).toBeCloseTo(expected.y, 12)
        expect(target.z).toBeCloseTo(expected.z, 12)
        expect([target.x, target.y, target.z].every(Number.isFinite)).toBe(true)
    })
})

describe('focus-pocket-geometry — placement & relationship bias', () => {
    // ── getFocusConstellationPlacement ────────────────────────────────────
    describe('getFocusConstellationPlacement', () => {
        it('returns a PlacementParams with angle, radius, zOffset, breatheAmp', () => {
            const motif = makeMotif({ key: 'market', seed: 0.3 })
            const vp = makeViewportProfile()
            const result = getFocusConstellationPlacement(motif, { score: 0.5 }, 0, 'primary', 5, vp)
            expect(result).toHaveProperty('angle')
            expect(result).toHaveProperty('radius')
            expect(result).toHaveProperty('zOffset')
            expect(result).toHaveProperty('breatheAmp')
            expect(Number.isFinite(result.angle)).toBe(true)
            expect(Number.isFinite(result.radius)).toBe(true)
            expect(Number.isFinite(result.zOffset)).toBe(true)
            expect(Number.isFinite(result.breatheAmp)).toBe(true)
        })

        it('produces finite breatheAmp for every known motif key (regression: delta-branch gap)', () => {
            // Regression: the delta branch historically omitted breatheAmp
            // assignment, producing NaN after the `*= isHalo ? 0.72 : 1`
            // multiplier and forcing the downstream `|| 0.02` fallback to
            // fire with a wildly wrong amplitude (~0.02 vs intended ~0.003).
            const motifKeys: Array<'rosette' | 'lattice' | 'delta' | 'civic' | 'market'> = [
                'rosette',
                'lattice',
                'delta',
                'civic',
                'market'
            ]
            const groups: Array<'primary' | 'halo' | 'support'> = ['primary', 'halo', 'support']
            const vp = makeViewportProfile()
            for (const key of motifKeys) {
                for (const group of groups) {
                    const result = getFocusConstellationPlacement(
                        makeMotif({ key, seed: 0.3 }),
                        { score: 0.5 },
                        0,
                        group,
                        5,
                        vp
                    )
                    expect(Number.isFinite(result.breatheAmp)).toBe(true)
                    // Sanity bound: breatheAmp should be a small positive
                    // amplitude (not NaN, not 0, not the 0.02 fallback that
                    // would fire if NaN reached the downstream `||`).
                    expect(result.breatheAmp).toBeGreaterThan(0)
                    expect(result.breatheAmp).toBeLessThan(0.01)
                }
            }
        })

        it('delta motif primary breatheAmp is distinct from market/else fallback (regression: delta-branch gap)', () => {
            // Tighter regression: even with the safe-default defense in
            // `let breatheAmp = 0.003`, the delta branch must assign its
            // own per-group value (0.0026 for primary) — otherwise the
            // delta motif would silently match the market/else branch and
            // lose its tighter amplitude profile.
            const vp = makeViewportProfile()
            const deltaPrimary = getFocusConstellationPlacement(
                makeMotif({ key: 'delta', seed: 0.3 }),
                { score: 0.5 },
                0,
                'primary',
                5,
                vp
            )
            const marketPrimary = getFocusConstellationPlacement(
                makeMotif({ key: 'market', seed: 0.3 }),
                { score: 0.5 },
                0,
                'primary',
                5,
                vp
            )
            // Delta primary is 0.0026; market/else primary is 0.003.
            // They must differ — if the delta branch were missing the
            // assignment, both would collapse to 0.003 (the safe default).
            expect(deltaPrimary.breatheAmp).toBeLessThan(marketPrimary.breatheAmp)
            expect(deltaPrimary.breatheAmp).toBeCloseTo(0.0026, 5)
        })

        it('produces different angles for different motif keys', () => {
            const vp = makeViewportProfile()
            const market = getFocusConstellationPlacement(
                makeMotif({ key: 'market', seed: 0.3 }),
                { score: 0.5 },
                0,
                'primary',
                5,
                vp
            )
            const rosette = getFocusConstellationPlacement(
                makeMotif({ key: 'rosette', seed: 0.3 }),
                { score: 0.5 },
                0,
                'primary',
                5,
                vp
            )
            const lattice = getFocusConstellationPlacement(
                makeMotif({ key: 'lattice', seed: 0.3 }),
                { score: 0.5 },
                0,
                'primary',
                5,
                vp
            )
            // Different motif keys use different angle formulas
            const angles = new Set([market.angle, rosette.angle, lattice.angle])
            expect(angles.size).toBeGreaterThan(1)
        })

        it('applies primaryRadiusScale from viewportProfile to radius', () => {
            // Note: floor/ceiling clamping is the CALLER's job (buildFocusedPocketStagedPositions),
            // not getFocusConstellationPlacement's. Here we verify the radiusScale multiplication.
            const motif = makeMotif({ key: 'market', seed: 0.3 })
            const vp = makeViewportProfile({ primaryRadiusScale: 0.01 })
            const result = getFocusConstellationPlacement(motif, { score: 0.5 }, 0, 'primary', 5, vp)
            // With radiusScale=0.01 the final radius should be small
            expect(result.radius).toBeLessThan(0.01)
            expect(Number.isFinite(result.radius)).toBe(true)
        })

        it('applies personality compressionMult to radius', () => {
            const motif = makeMotif({ key: 'market', seed: 0.3 })
            const vp = makeViewportProfile()
            const baseline = getFocusConstellationPlacement(motif, { score: 0.5 }, 0, 'primary', 5, vp, null)
            const compressed = getFocusConstellationPlacement(motif, { score: 0.5 }, 0, 'primary', 5, vp, {
                type: 'STANDARD',
                motifOverride: null,
                cameraDuration: 980,
                cameraArc: 'standard',
                staggerMult: 1,
                compressionMult: 0.5,
                easing: 'easeInOutCubic',
                microVariation: { rotation: 0, scale: 1 }
            })
            // compressionMult=0.5 should roughly halve the radius
            expect(compressed.radius).toBeLessThan(baseline.radius)
        })

        it('DENSE_HUB personality amplifies zOffset and radius', () => {
            const motif = makeMotif({ key: 'market', seed: 0.3 })
            const vp = makeViewportProfile()
            const standard = getFocusConstellationPlacement(motif, { score: 0.5 }, 0, 'primary', 5, vp, {
                type: 'STANDARD',
                motifOverride: null,
                cameraDuration: 980,
                cameraArc: 'standard',
                staggerMult: 1,
                compressionMult: 1,
                easing: 'easeInOutCubic',
                microVariation: { rotation: 0, scale: 1 }
            })
            const dense = getFocusConstellationPlacement(motif, { score: 0.5 }, 0, 'primary', 5, vp, {
                type: 'DENSE_HUB',
                motifOverride: null,
                cameraDuration: 980,
                cameraArc: 'standard',
                staggerMult: 1,
                compressionMult: 1,
                easing: 'easeInOutCubic',
                microVariation: { rotation: 0, scale: 1 }
            })
            expect(Math.abs(dense.zOffset)).toBeGreaterThan(Math.abs(standard.zOffset))
            expect(dense.radius).toBeGreaterThan(standard.radius)
        })
    })

    // ── applyRelationshipRolePlacementBias ────────────────────────────────
    describe('applyRelationshipRolePlacementBias', () => {
        function basePlacement(): PlacementParams {
            return { angle: 1.0, radius: 0.3, zOffset: 0.05, breatheAmp: 0.003 }
        }

        it('returns the placement unchanged for an empty role', () => {
            const p = basePlacement()
            const result = applyRelationshipRolePlacementBias(p, '', 0, 'primary')
            expect(result).toBe(p) // same reference, no mutation
            expect(result.radius).toBeCloseTo(0.3)
        })

        it('core_peer shrinks radius and lifts zOffset', () => {
            const p = basePlacement()
            const result = applyRelationshipRolePlacementBias(p, 'core_peer', 0, 'primary')
            expect(result.radius).toBeLessThan(0.3)
            expect(result.zOffset).toBeGreaterThan(0.05)
        })

        it('same_market expands radius and drops zOffset', () => {
            const p = basePlacement()
            const result = applyRelationshipRolePlacementBias(p, 'same_market', 0, 'primary')
            expect(result.radius).toBeGreaterThan(0.3)
            expect(result.zOffset).toBeLessThan(0.05)
        })

        it('upstream drops zOffset and slightly expands radius', () => {
            const p = basePlacement()
            const result = applyRelationshipRolePlacementBias(p, 'upstream', 0, 'primary')
            expect(result.zOffset).toBeLessThan(0.05)
            expect(result.radius).toBeGreaterThan(0.3)
        })

        it('downstream lifts zOffset and shrinks radius', () => {
            const p = basePlacement()
            const result = applyRelationshipRolePlacementBias(p, 'downstream', 0, 'primary')
            expect(result.zOffset).toBeGreaterThan(0.05)
            expect(result.radius).toBeLessThan(0.3)
        })

        it('bridge expands radius the most', () => {
            const p = basePlacement()
            const result = applyRelationshipRolePlacementBias(p, 'bridge', 0, 'primary')
            // bridge multiplies radius by 1.18
            expect(result.radius).toBeCloseTo(0.3 * 1.18, 10)
        })

        it('investor lifts zOffset and shrinks radius', () => {
            const p = basePlacement()
            const result = applyRelationshipRolePlacementBias(p, 'investor', 0, 'primary')
            expect(result.zOffset).toBeGreaterThan(0.05)
            expect(result.radius).toBeLessThan(0.3)
        })

        it('subsidiary drops zOffset and shrinks radius', () => {
            const p = basePlacement()
            const result = applyRelationshipRolePlacementBias(p, 'subsidiary', 0, 'primary')
            expect(result.zOffset).toBeLessThan(0.05)
            expect(result.radius).toBeLessThan(0.3)
        })

        it('order parity affects angle for core_peer (even vs odd)', () => {
            const pEven = basePlacement()
            const pOdd = basePlacement()
            const rEven = applyRelationshipRolePlacementBias(pEven, 'core_peer', 0, 'primary')
            const rOdd = applyRelationshipRolePlacementBias(pOdd, 'core_peer', 1, 'primary')
            // Even order: angle -= 0.06; odd order: angle += 0.06
            expect(rEven.angle).toBeCloseTo(1.0 - 0.06, 10)
            expect(rOdd.angle).toBeCloseTo(1.0 + 0.06, 10)
        })
    })
})
