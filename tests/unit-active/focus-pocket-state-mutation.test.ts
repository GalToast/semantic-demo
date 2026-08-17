/**
 * focus-pocket-state-mutation.test.ts — Unit coverage for focus-pocket.ts
 * state-mutation exports that the review flagged as BARE (18 of 19 untested).
 *
 * Existing test (focus-pocket-engine-gating.test.ts) only covers
 * applyLocalNeighborhoodFocus gating. This file covers:
 *   - getFocusPocketIndices / setFocusPocketIndices (round-trip, empty-set)
 *   - getFocusPocketRoleByIndex / setFocusPocketRoleByIndex (default role, overwrite)
 *   - getRuntimeStateSnapshot / syncRuntimeState (snapshot shape + restore)
 *   - syncPocketNodesToStore (writes through to rune stores)
 *
 * Strategy: hoist a mutable _mockAppState via vi.hoisted() so each test can
 * manipulate navState/focusState without re-mocking. Spy on every external
 * dependency (writeNavStateMirror, writeFocusPocketMirror, setPocketNodes,
 * setAutoRotate, getBusinessRecords) to assert the bridge behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoisted mutable state ─────────────────────────────────────────────────────

const { _mockAppState, _writeNavStateMirrorCalls, _writeFocusPocketMirrorCalls, _setAutoRotateCalls } =
    vi.hoisted(() => {
        const state = {
            // navState
            navState: {
                mode: 'overview',
                surface: 'idle',
                previousSurface: 'idle',
                focusedIndex: null as number | null,
                trailSeedIndex: null as number | null,
                trailNeighborIndices: [] as number[],
                trailCursor: -1 as number,
                trailDepth: 0 as number,
                walkHistoryIndices: [] as number[],
                lastTraversalReason: null as string | null,
                threadCandidates: [] as unknown[],
                threadSource: 'geometric-fallback' as string,
                currentPersonality: null as unknown,
                focusPocketIndices: [] as number[],
                focusPocketRoleByIndex: new Map<number, string>() as Map<number, string>,
                focusPocketMeta: null as Record<string, unknown> | null,
                autoRotate: true,
                autoRotateSuspended: false,
                currentView: 'scene' as string,
                myceliumMode: 'normal' as string
            },
            // focusState
            focusState: {
                pocketMotionByIndex: new Map<number, unknown>() as Map<number, unknown>,
                pocketTransitionStartedAt: 0 as number,
                nodesAreSettling: false as boolean
            },
            // geometry
            points: [] as Array<Record<string, unknown>>,
            originalPositions: null as Array<{ x: number; y: number; z: number }> | null,
            nodePositions: null as Array<{ x: number; y: number; z: number }> | null,
            targetPositions: null as Array<{ x: number; y: number; z: number }> | null,
            // other fields read by focus-pocket.ts
            recentArrangements: [] as string[],
            trailDepth: 0,
            autoRotate: true
        }
        return {
            _mockAppState: state,
            _writeNavStateMirrorCalls: [] as Array<Record<string, unknown>>,
            _writeFocusPocketMirrorCalls: [] as Array<Record<string, unknown>>,
            _setAutoRotateCalls: [] as boolean[]
        }
    })

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('three', () => ({
    Vector3: class Vector3 {
        x = 0
        y = 0
        z = 0
        constructor(x?: number, y?: number, z?: number) {
            this.x = x ?? 0
            this.y = y ?? 0
            this.z = z ?? 0
        }
        subVectors(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): this {
            this.x = a.x - b.x
            this.y = a.y - b.y
            this.z = a.z - b.z
            return this
        }
        normalize(): this {
            const len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z) || 1
            this.x /= len
            this.y /= len
            this.z /= len
            return this
        }
        clone(): Vector3 {
            return new Vector3(this.x, this.y, this.z)
        }
        applyAxisAngle(_axis: Vector3, _angle: number): this {
            return this
        }
    }
}))

vi.mock('../../src/lib/state/app.svelte', () => ({
    appState: _mockAppState
}))

vi.mock('../../src/lib/stores/navigation.svelte', () => ({
    writeNavStateMirror: vi.fn((patch: Record<string, unknown>) => {
        _writeNavStateMirrorCalls.push({ ...patch })
        // Mirror the patch into the hoisted navState so getters see it.
        if (patch.focusPocketIndices !== undefined)
            _mockAppState.navState.focusPocketIndices = patch.focusPocketIndices as number[]
        if (patch.focusPocketRoleByIndex !== undefined)
            _mockAppState.navState.focusPocketRoleByIndex = patch.focusPocketRoleByIndex as Map<number, string>
        if (patch.focusPocketMeta !== undefined)
            _mockAppState.navState.focusPocketMeta = patch.focusPocketMeta as Record<string, unknown> | null
        if (patch.autoRotate !== undefined) {
            _mockAppState.navState.autoRotate = patch.autoRotate as boolean
            _mockAppState.autoRotate = patch.autoRotate as boolean
        }
        if (patch.trailDepth !== undefined)
            _mockAppState.navState.trailDepth = patch.trailDepth as number
    })
}))

vi.mock('../../src/lib/stores/focus.svelte', () => ({
    focusStore: {
        update: vi.fn((fn: (s: Record<string, unknown>) => Record<string, unknown>) => fn({})),
        subscribe: vi.fn(),
        set: vi.fn()
    },
    writeFocusPocketMirror: vi.fn((patch: Record<string, unknown>) => {
        _writeFocusPocketMirrorCalls.push({ ...patch })
        if (patch.pocketRoleByIndex !== undefined)
            _mockAppState.navState.focusPocketRoleByIndex = patch.pocketRoleByIndex as Map<number, string>
        if (patch.pocketMeta !== undefined)
            _mockAppState.navState.focusPocketMeta = patch.pocketMeta as Record<string, unknown> | null
    }),
    setPocketNodes: vi.fn()
}))

vi.mock('../../src/lib/stores/camera.svelte.ts', () => ({
    setAutoRotate: vi.fn((enabled: boolean) => {
        _setAutoRotateCalls.push(enabled)
    })
}))

vi.mock('../../src/lib/utils/geo-data', () => ({
    normalizeCityForFilter: vi.fn((city: unknown) => String(city ?? '').toLowerCase().trim())
}))

vi.mock('../../src/lib/utils/seeded-random', () => ({
    seededUnit: vi.fn(() => 0.5)
}))

vi.mock('../../src/lib/focus/pocket-personality', () => ({
    getNeighborhoodPersonality: vi.fn(() => ({
        type: 'STANDARD',
        motifOverride: null,
        cameraDuration: 980,
        cameraArc: 'standard',
        staggerMult: 1,
        compressionMult: 1,
        easing: 'easeInOutCubic',
        microVariation: { rotation: 0, scale: 1 }
    })),
    getSemanticCandidateSlice: vi.fn(() => [])
}))

vi.mock('../../src/lib/utils/environment', () => ({
    prefersReducedMotion: vi.fn(() => false)
}))

vi.mock('../../src/lib/data-store', () => ({
    getBusinessRecords: vi.fn(() => [])
}))

vi.mock('../../src/lib/journey/focus-pocket-geometry', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/lib/journey/focus-pocket-geometry')>()
    return {
        ...actual,
        buildFocusedPocketStagedPositions: vi.fn(() => null),
        buildFocusedSemanticPocket: vi.fn(() => null),
        getFocusConstellationViewportProfile: vi.fn(() => ({
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
            supportNeighborLimit: 4
        }))
    }
})

// ── Import under test (MUST be after all vi.mock calls) ───────────────────────

import {
    getFocusPocketIndices,
    setFocusPocketIndices,
    getFocusPocketRoleByIndex,
    setFocusPocketRoleByIndex,
    getRuntimeStateSnapshot,
    syncRuntimeState,
    syncPocketNodesToStore
} from '../../src/lib/journey/focus-pocket'
import { writeNavStateMirror } from '../../src/lib/stores/navigation.svelte'
import { writeFocusPocketMirror, setPocketNodes } from '../../src/lib/stores/focus.svelte'
import { setAutoRotate } from '../../src/lib/stores/camera.svelte.ts'
import { getBusinessRecords } from '../../src/lib/data-store'

// ── Helpers ────────────────────────────────────────────────────────────────────

function resetState(): void {
    _writeNavStateMirrorCalls.length = 0
    _writeFocusPocketMirrorCalls.length = 0
    _setAutoRotateCalls.length = 0
    vi.clearAllMocks()
    _mockAppState.navState.focusPocketIndices = []
    _mockAppState.navState.focusPocketRoleByIndex = new Map<number, string>()
    _mockAppState.navState.focusPocketMeta = null
    _mockAppState.focusState.pocketMotionByIndex = new Map()
    _mockAppState.focusState.nodesAreSettling = false
    _mockAppState.focusState.pocketTransitionStartedAt = 0
    _mockAppState.autoRotate = true
    _mockAppState.points = []
    _mockAppState.originalPositions = null
    _mockAppState.nodePositions = null
    _mockAppState.targetPositions = null
    _mockAppState.recentArrangements = []
    _mockAppState.navState.focusedIndex = null
    _mockAppState.navState.threadCandidates = []
    _mockAppState.navState.threadSource = 'geometric-fallback'
}

// ── Tests: getFocusPocketIndices / setFocusPocketIndices ───────────────────────

describe('getFocusPocketIndices / setFocusPocketIndices', () => {
    beforeEach(resetState)
    afterEach(resetState)

    it('returns an empty array when focusPocketIndices is undefined', () => {
        _mockAppState.navState.focusPocketIndices = undefined as unknown as number[]
        expect(getFocusPocketIndices()).toEqual([])
    })

    it('returns a defensive copy (caller mutation does not affect state)', () => {
        _mockAppState.navState.focusPocketIndices = [1, 2, 3]
        const copy = getFocusPocketIndices()
        copy.push(4)
        expect(getFocusPocketIndices()).toEqual([1, 2, 3])
    })

    it('round-trips indices through setFocusPocketIndices', () => {
        setFocusPocketIndices([5, 10, 15])
        expect(getFocusPocketIndices()).toEqual([5, 10, 15])
    })

    it('clears indices when setFocusPocketIndices is called with empty array', () => {
        _mockAppState.navState.focusPocketIndices = [1, 2]
        setFocusPocketIndices([])
        expect(getFocusPocketIndices()).toEqual([])
    })

    it('calls writeNavStateMirror with the indices patch', () => {
        setFocusPocketIndices([7])
        expect(writeNavStateMirror).toHaveBeenCalledWith({ focusPocketIndices: [7] })
    })

    it('calls syncPocketNodesToStore (via setPocketNodes) after setting indices', () => {
        setFocusPocketIndices([1, 2])
        expect(setPocketNodes).toHaveBeenCalled()
    })
})

// ── Tests: getFocusPocketRoleByIndex / setFocusPocketRoleByIndex ──────────────

describe('getFocusPocketRoleByIndex / setFocusPocketRoleByIndex', () => {
    beforeEach(resetState)
    afterEach(resetState)

    it('returns an empty Map when focusPocketRoleByIndex is undefined', () => {
        _mockAppState.navState.focusPocketRoleByIndex = undefined as unknown as Map<number, string>
        const result = getFocusPocketRoleByIndex()
        expect(result).toBeInstanceOf(Map)
        expect(result.size).toBe(0)
    })

    it('returns a defensive copy (caller mutation does not affect state)', () => {
        const m = new Map<number, string>([[1, 'anchor'], [2, 'primary']])
        _mockAppState.navState.focusPocketRoleByIndex = m
        const copy = getFocusPocketRoleByIndex()
        copy.set(3, 'support')
        expect(getFocusPocketRoleByIndex().get(3)).toBeUndefined()
        expect(copy.get(3)).toBe('support') // copy has it, state does not
    })

    it('round-trips a role Map through setFocusPocketRoleByIndex', () => {
        const roles = new Map<number, string>([[1, 'anchor'], [2, 'primary']])
        setFocusPocketRoleByIndex(roles)
        const result = getFocusPocketRoleByIndex()
        expect(result.get(1)).toBe('anchor')
        expect(result.get(2)).toBe('primary')
        expect(result.size).toBe(2)
    })

    it('overwrites the entire role map when setFocusPocketRoleByIndex is called', () => {
        _mockAppState.navState.focusPocketRoleByIndex = new Map([[1, 'old']])
        setFocusPocketRoleByIndex(new Map([[2, 'new']]))
        const result = getFocusPocketRoleByIndex()
        expect(result.size).toBe(1)
        expect(result.get(1)).toBeUndefined()
        expect(result.get(2)).toBe('new')
    })

    it('calls writeFocusPocketMirror with pocketRoleByIndex patch', () => {
        const roles = new Map<number, string>([[3, 'support']])
        setFocusPocketRoleByIndex(roles)
        expect(writeFocusPocketMirror).toHaveBeenCalledWith({ pocketRoleByIndex: roles })
    })
})

// ── Tests: getRuntimeStateSnapshot / syncRuntimeState ─────────────────────────

describe('getRuntimeStateSnapshot / syncRuntimeState', () => {
    beforeEach(resetState)
    afterEach(resetState)

    it('returns a plain Record with expected top-level keys', () => {
        const snapshot = getRuntimeStateSnapshot()
        expect(snapshot).toHaveProperty('navState')
        expect(snapshot).toHaveProperty('targetPositions')
        expect(snapshot).toHaveProperty('pocketMotionByIndex')
        expect(snapshot).toHaveProperty('pocketTransitionStartedAt')
        expect(snapshot).toHaveProperty('nodesAreSettling')
        expect(snapshot).toHaveProperty('autoRotate')
    })

    it('navState snapshot is a shallow clone (not the live object)', () => {
        const snapshot = getRuntimeStateSnapshot()
        expect(snapshot.navState).not.toBe(_mockAppState.navState)
    })

    it('snapshot captures current pocketMotionByIndex reference', () => {
        const motionMap = new Map<number, unknown>([[1, { role: 'anchor' }]])
        _mockAppState.focusState.pocketMotionByIndex = motionMap
        const snapshot = getRuntimeStateSnapshot()
        expect(snapshot.pocketMotionByIndex).toBe(motionMap)
    })

    it('snapshot captures nodesAreSettling and autoRotate from focusState/navState', () => {
        _mockAppState.focusState.nodesAreSettling = true
        _mockAppState.navState.autoRotate = false
        _mockAppState.autoRotate = false // mirror the navState change for the mock
        const snapshot = getRuntimeStateSnapshot()
        expect(snapshot.nodesAreSettling).toBe(true)
        expect(snapshot.autoRotate).toBe(false)
    })

    it('syncRuntimeState restores navState via writeNavStateMirror', () => {
        const snapshot = getRuntimeStateSnapshot()
        snapshot.navState = { ...snapshot.navState, focusPocketIndices: [9, 9] }
        syncRuntimeState(snapshot)
        expect(writeNavStateMirror).toHaveBeenCalledWith(expect.objectContaining({ focusPocketIndices: [9, 9] }))
        expect(getFocusPocketIndices()).toEqual([9, 9])
    })

    it('syncRuntimeState restores nodesAreSettling directly on focusState', () => {
        _mockAppState.focusState.nodesAreSettling = false
        const snapshot = getRuntimeStateSnapshot()
        snapshot.nodesAreSettling = true
        syncRuntimeState(snapshot)
        expect(_mockAppState.focusState.nodesAreSettling).toBe(true)
    })

    it('syncRuntimeState restores autoRotate via setAutoRotate', () => {
        const snapshot = getRuntimeStateSnapshot()
        snapshot.autoRotate = false
        syncRuntimeState(snapshot)
        expect(setAutoRotate).toHaveBeenCalledWith(false)
    })

    it('syncRuntimeState is a no-op when given an empty snapshot', () => {
        syncRuntimeState({})
        expect(writeNavStateMirror).not.toHaveBeenCalled()
        expect(setAutoRotate).not.toHaveBeenCalled()
    })
})

// ── Tests: syncPocketNodesToStore ─────────────────────────────────────────────

describe('syncPocketNodesToStore', () => {
    beforeEach(resetState)
    afterEach(resetState)

    it('writes empty nodes when focusPocketIndices is empty', () => {
        setPocketNodes.mockClear()
        syncPocketNodesToStore()
        expect(setPocketNodes).toHaveBeenCalledWith([])
    })

    it('writes empty nodes when focusPocketIndices is undefined', () => {
        _mockAppState.navState.focusPocketIndices = undefined as unknown as number[]
        setPocketNodes.mockClear()
        syncPocketNodesToStore()
        expect(setPocketNodes).toHaveBeenCalledWith([])
    })

    it('builds nodes from indices, roles, and positions', () => {
        vi.mocked(getBusinessRecords).mockReturnValue([
            null,
            { name: 'Business A' },
            { name: 'Business B' }
        ])
        _mockAppState.navState.focusPocketIndices = [1, 2]
        _mockAppState.navState.focusPocketRoleByIndex = new Map([[1, 'primary'], [2, 'support']])
        _mockAppState.targetPositions = [
            null,
            { x: 0.1, y: 0.2, z: 0.3 },
            { x: 0.4, y: 0.5, z: 0.6 }
        ]
        _mockAppState.navState.focusedIndex = null
        setPocketNodes.mockClear()
        syncPocketNodesToStore()
        expect(setPocketNodes).toHaveBeenCalledTimes(1)
        const calledWith = vi.mocked(setPocketNodes).mock.calls[0]![0] as Array<{ index: number; role: string; label: string }>
        expect(calledWith).toHaveLength(2)
        expect(calledWith[0]!.index).toBe(1)
        expect(calledWith[0]!.role).toBe('direct')
        expect(calledWith[0]!.label).toBe('Business A')
        expect(calledWith[1]!.index).toBe(2)
        expect(calledWith[1]!.role).toBe('support')
        expect(calledWith[1]!.label).toBe('Business B')
    })

    it('skips the anchor index (focusedIndex) when building nodes', () => {
        vi.mocked(getBusinessRecords).mockReturnValue([{ name: 'Anchor' }, { name: 'Neighbor' }])
        _mockAppState.navState.focusPocketIndices = [0, 1]
        _mockAppState.navState.focusPocketRoleByIndex = new Map([[0, 'anchor'], [1, 'support']])
        _mockAppState.targetPositions = [
            { x: 0, y: 0, z: 0 },
            { x: 0.1, y: 0.1, z: 0.1 }
        ]
        _mockAppState.navState.focusedIndex = 0
        setPocketNodes.mockClear()
        syncPocketNodesToStore()
        const calledWith = vi.mocked(setPocketNodes).mock.calls[0]![0] as Array<{ index: number }>
        expect(calledWith).toHaveLength(1)
        expect(calledWith[0]!.index).toBe(1)
    })

    it('falls back to originalPositions when targetPositions is missing', () => {
        vi.mocked(getBusinessRecords).mockReturnValue([{ name: 'Fallback' }])
        _mockAppState.navState.focusPocketIndices = [1]
        _mockAppState.navState.focusPocketRoleByIndex = new Map([[1, 'support']])
        _mockAppState.targetPositions = null
        _mockAppState.nodePositions = null
        _mockAppState.originalPositions = [null, { x: 0.5, y: 0.5, z: 0.5 }]
        _mockAppState.navState.focusedIndex = null
        setPocketNodes.mockClear()
        syncPocketNodesToStore()
        const calledWith = vi.mocked(setPocketNodes).mock.calls[0]![0] as Array<{ position: [number, number, number] }>
        expect(calledWith[0]!.position).toEqual([0.5, 0.5, 0.5])
    })

    it('uses default role "support" when role is absent from the map', () => {
        vi.mocked(getBusinessRecords).mockReturnValue([{ name: 'NoRole' }])
        _mockAppState.navState.focusPocketIndices = [1]
        _mockAppState.navState.focusPocketRoleByIndex = new Map() // no role for index 1
        _mockAppState.targetPositions = [null, { x: 0.1, y: 0.1, z: 0.1 }]
        _mockAppState.navState.focusedIndex = null
        setPocketNodes.mockClear()
        syncPocketNodesToStore()
        const calledWith = vi.mocked(setPocketNodes).mock.calls[0]![0] as Array<{ role: string }>
        expect(calledWith[0]!.role).toBe('support')
    })

    it('skips non-finite or negative indices', () => {
        vi.mocked(getBusinessRecords).mockReturnValue([{ name: 'Skip' }, { name: 'Keep' }])
        _mockAppState.navState.focusPocketIndices = [-1, NaN, 1] as unknown as number[]
        _mockAppState.navState.focusPocketRoleByIndex = new Map()
        _mockAppState.targetPositions = [null, { x: 0.1, y: 0.1, z: 0.1 }]
        _mockAppState.navState.focusedIndex = null
        setPocketNodes.mockClear()
        syncPocketNodesToStore()
        const calledWith = vi.mocked(setPocketNodes).mock.calls[0]![0] as Array<{ index: number }>
        expect(calledWith).toHaveLength(1)
        expect(calledWith[0]!.index).toBe(1)
    })
})

// ── Tests: applyLocalNeighborhoodFocus (best-effort — gated by engine complexity) ─

describe('applyLocalNeighborhoodFocus — best-effort (shape + simple-gate)', () => {
    beforeEach(resetState)
    afterEach(resetState)

    // Import via dynamic import to work around vitest module replacement issues
    // with require(). The import is hoisted by vitest's transform so it works
    // at the top level below.
    it('is exported as a function (shape check)', async () => {
        const mod = await import('../../src/lib/journey/focus-pocket')
        expect(typeof mod.applyLocalNeighborhoodFocus).toBe('function')
    })

    it('returns false when originalPositions is missing', async () => {
        const { applyLocalNeighborhoodFocus } = await import('../../src/lib/journey/focus-pocket')
        _mockAppState.points = [{ id: '1' }]
        _mockAppState.originalPositions = null
        expect(applyLocalNeighborhoodFocus(0)).toBe(false)
    })

    it('returns false when no valid neighborhood can be built (single-point dataset)', async () => {
        const { applyLocalNeighborhoodFocus } = await import('../../src/lib/journey/focus-pocket')
        _mockAppState.points = [{ id: '1', name: 'Only', city: 'Conroe' }]
        _mockAppState.originalPositions = [{ x: 0, y: 0, z: 0 }]
        _mockAppState.nodePositions = [{ x: 0, y: 0, z: 0 }]
        _mockAppState.targetPositions = [{ x: 0, y: 0, z: 0 }]
        _mockAppState.navState.threadCandidates = []
        _mockAppState.navState.threadSource = 'geometric-fallback'
        // topoKnn on a single point returns empty → localIndices.size === 1 → early return false
        expect(applyLocalNeighborhoodFocus(0)).toBe(false)
    })
})
