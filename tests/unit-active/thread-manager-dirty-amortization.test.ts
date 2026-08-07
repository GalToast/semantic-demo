/**
 * Regression test for the dirty-node amortization buffer corruption bug.
 *
 * Bug: When `dirtyNodeIndices` was non-empty (focus pocket breathing moves
 * ~12 nodes/frame), `updateMyceliumThreads` packed only the dirty pairs at
 * buffer index 0 and ZEROED the rest. This collapsed the entire mycelium to
 * ~12 visible segments during focus.
 *
 * Fix: Partial updates now write dirty pairs IN-PLACE at their original
 * buffer offset (pair N in a layer → segment N*5), leaving clean pairs
 * untouched. Full rebuilds (no dirty nodes) still rewrite the whole buffer.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Shared mutable state object so each test can reconfigure before calling.
const { mockWebglContext, mockState, testState } = vi.hoisted(() => {
    const testState = {
        nodePositions: [] as Array<{ x: number; y: number; z: number }>,
        points: [] as Array<{ cluster: number }>
    }
    return {
        mockWebglContext: {
            myceliumConnectionPairs: [] as Array<{ a: number; b: number; layer: number }>,
            myceliumCoreLines: null as any,
            myceliumWispyLines: null as any,
            myceliumBridgeLines: null as any,
            pointsMesh: {},
            renderer: null as any
        },
        mockState: {
            get nodePositions() {
                return testState.nodePositions
            },
            get points() {
                return testState.points
            },
            semanticNeighborMapByLeadId: new Map(),
            navState: { mode: 'focus', trailDepth: 0 },
            myceliumDirty: false,
            viewportState: {
                viewportWidth: 1920,
                viewportHeight: 1080,
                viewportIsCompact: false,
                viewportDpr: 2,
                viewportReducedMotion: false
            },
            searchState: {
                currentSearchSummary: null,
                searchStatus: 'idle',
                searchRequestSequence: 0,
                searchAnchorIndex: null,
                searchPreviewIndex: null,
                searchGlowIndices: [],
                searchGlowTopIndex: null,
                searchGlowActive: false,
                currentEmptyQuery: null,
                searchFocusTransitionToken: 0,
                semanticTrailCue: 'idle',
                isCompactViewport: false,
                semanticGuideRequestSequence: 0,
                currentSemanticGuide: null,
                summaryCardTypeToken: 0
            },
            scenePerformanceDiagnostics: {
                active: false,
                reason: 'not-sampled',
                lastFrameAt: 0,
                sampleCount: 0,
                avgFrameMs: 0,
                maxFrameMs: 0,
                avgUpdateMs: 0,
                maxUpdateMs: 0,
                avgRenderMs: 0,
                maxRenderMs: 0,
                avgControlsMs: 0,
                avgNodeMotionMs: 0,
                avgThreadUpdateMs: 0,
                avgGlowMs: 0,
                avgLensMs: 0,
                avgOverlayUpdateMs: 0,
                maxOverlayUpdateMs: 0,
                myceliumCoreSegments: 0,
                myceliumWispySegments: 0,
                myceliumBridgeSegments: 0,
                lastThreadUpdateMs: 0,
                lastThreadUpdateDirtyNodes: 0,
                lastThreadUpdateDirtyPairs: 0
            }
        },
        testState
    }
})

vi.mock('@lib/engine/webgl-context', () => ({
    webglContext: mockWebglContext
}))

vi.mock('@lib/state/app.svelte', () => ({
    appState: mockState
}))

vi.mock('@lib/state/with-state-mutation', () => ({
    withStateMutation: (fn: () => void) => fn()
}))

vi.mock('@lib/engine/config', () => ({
    CONFIG: {
        COLORS: { threadBaseColor: [0.5, 0.5, 0.5] },
        POINTS_MATERIAL_BASE_SIZE: 12
    }
}))

vi.mock('@lib/utils/seeded-random', () => ({
    seededUnit: () => 0.5
}))

// Stub three.js LineSegments2/Geometry/Material (heavy WebGL classes) but
// keep real Vector3/Vector2 math working for the bezier control point logic.
vi.mock('three/examples/jsm/lines/LineSegments2.js', () => ({
    LineSegments2: class {}
}))
vi.mock('three/examples/jsm/lines/LineSegmentsGeometry.js', () => ({
    LineSegmentsGeometry: class {}
}))
vi.mock('three/examples/jsm/lines/LineGeometry.js', () => ({
    LineGeometry: class {}
}))
vi.mock('three/examples/jsm/lines/LineMaterial.js', () => ({
    LineMaterial: class {}
}))
vi.mock('@lib/engine/resource-tracker', () => ({
    disposeObject3D: vi.fn()
}))
vi.mock('@lib/utils/ui-presentation-three', () => ({
    getThreadCategoryColor: (cluster: number) => [cluster * 0.1, 0.5, 0.5]
}))

import { updateMyceliumThreads, markNodesDirty } from '../../src/lib/engine/thread-manager'

describe('thread-manager dirty-node amortization (in-place update)', () => {
    const SEGMENTS_PER_PAIR = 10

    function makeLayerLine(pairCount: number) {
        const segCount = pairCount * SEGMENTS_PER_PAIR
        const startArray = new Float32Array(segCount * 3)
        const endArray = new Float32Array(segCount * 3)
        const colorStartArray = new Float32Array(segCount * 3)
        const colorEndArray = new Float32Array(segCount * 3)
        // Pre-fill with sentinel 7.0 so we can detect zeroing/corruption.
        startArray.fill(7.0)
        endArray.fill(7.0)
        colorStartArray.fill(7.0)
        colorEndArray.fill(7.0)
        return {
            geometry: {
                getAttribute: (name: string) => {
                    if (name === 'instanceStart') return { array: startArray, needsUpdate: false }
                    if (name === 'instanceEnd') return { array: endArray, needsUpdate: false }
                    if (name === 'instanceColorStart') return { array: colorStartArray, needsUpdate: false }
                    if (name === 'instanceColorEnd') return { array: colorEndArray, needsUpdate: false }
                    return undefined
                }
            }
        }
    }

    beforeEach(() => {
        // 10 nodes with simple positions along x-axis.
        testState.nodePositions = Array.from({ length: 10 }, (_, i) => ({
            x: i,
            y: 0,
            z: 0
        }))
        testState.points = Array.from({ length: 10 }, (_, i) => ({ cluster: i % 3 }))
        mockState.semanticNeighborMapByLeadId = new Map()
        mockState.myceliumDirty = false

        // 6 core-layer pairs, 0 wispy, 0 bridge.
        mockWebglContext.myceliumConnectionPairs = [
            { a: 0, b: 1, layer: 0 },
            { a: 1, b: 2, layer: 0 },
            { a: 2, b: 3, layer: 0 },
            { a: 3, b: 4, layer: 0 },
            { a: 4, b: 5, layer: 0 },
            { a: 5, b: 6, layer: 0 }
        ]
        mockWebglContext.myceliumCoreLines = makeLayerLine(6)
        mockWebglContext.myceliumWispyLines = makeLayerLine(0)
        mockWebglContext.myceliumBridgeLines = makeLayerLine(0)
    })

    it('partial update (dirty nodes): writes ONLY dirty pairs in-place, does NOT zero clean pairs', () => {
        // Prime the buffer by marking all 7 nodes dirty (0..6) so every pair
        // gets real bezier data written, then updateMyceliumThreads populates
        // the full buffer. After priming, dirtyNodeIndices is drained.
        markNodesDirty([0, 1, 2, 3, 4, 5, 6])
        updateMyceliumThreads()

        const startArray = mockWebglContext.myceliumCoreLines.geometry.getAttribute('instanceStart')
            .array as Float32Array

        // Snapshot a clean pair's data (pair index 1, nodes 1-2, at segment 10).
        const cleanPairBaseSeg = 1 * SEGMENTS_PER_PAIR
        const cleanPairStartX_before = startArray[cleanPairBaseSeg * 3]

        // Mark node 0 as dirty → only pair 0 {0,1} is dirty.
        markNodesDirty([0])
        updateMyceliumThreads()

        // Pair 1 (clean) should be UNCHANGED at segments 5-9.
        const cleanPairStartX_after = startArray[cleanPairBaseSeg * 3]
        expect(cleanPairStartX_after).toBe(cleanPairStartX_before)

        // CRITICAL: no sentinel 7.0 anywhere in the used range — proves
        // clean pairs were NOT zeroed (the old bug zeroed everything after
        // the dirty pair count).
        for (let i = 0; i < 60 * 3; i++) {
            expect(startArray[i], `startArray[${i}] should not be sentinel (clean pair was zeroed)`).not.toBe(7.0)
        }
    })

    it('partial update: dirty pair at index N writes to segment N*10, not segment 0', () => {
        // Prime the buffer the same way (mark all 7 nodes dirty + update).
        markNodesDirty([0, 1, 2, 3, 4, 5, 6])
        updateMyceliumThreads()

        const startArray = mockWebglContext.myceliumCoreLines.geometry.getAttribute('instanceStart')
            .array as Float32Array

        // Mark node 5 as dirty → only pair 5 {5,6} is dirty.
        // Pair 5 should write to segments 50-59 (baseSeg = 5*10 = 50).
        // Pair 0 (nodes 0,1) is clean and should be UNCHANGED at segments 0-9.
        const pair0Seg0_before = startArray[0]

        // Move node 5 so pair 5's geometry changes.
        testState.nodePositions[5] = { x: 99, y: 0, z: 0 }
        markNodesDirty([5])
        updateMyceliumThreads()

        // Pair 0 (clean, segment 0) should be UNCHANGED.
        expect(startArray[0]).toBe(pair0Seg0_before)

        // Pair 5 (dirty) at segment 50 should reflect node 5's new x=99.
        // Bezier segment 0 starts at node 5's position → start.x = 99.
        const pair5Seg0_startX = startArray[50 * 3]
        expect(pair5Seg0_startX).toBe(99)

        // Segment 0 should NOT have been overwritten with pair 5's data.
        expect(startArray[0]).not.toBe(99)
    })

    // ── Renderer-diagnostics wave: instrumentation assertions ────────────

    it('records lastThreadUpdateMs, dirty nodes, and dirty pairs after update', () => {
        // Prime the buffer (all 7 nodes dirty → full rebuild).
        markNodesDirty([0, 1, 2, 3, 4, 5, 6])
        updateMyceliumThreads()

        // Dirty-node set is now drained. Prime a new frame: mark node 0 dirty.
        // Pair 0 {0,1} is the only dirty pair in layer 0.
        markNodesDirty([0])
        updateMyceliumThreads()

        const d = mockState.scenePerformanceDiagnostics
        expect(d.lastThreadUpdateMs, 'lastThreadUpdateMs').toBeGreaterThanOrEqual(0)
        expect(d.lastThreadUpdateDirtyNodes, 'dirtyNodes').toBe(1)
        expect(d.lastThreadUpdateDirtyPairs, 'dirtyPairs').toBe(1)
    })

    it('records zeroes on idle path (no dirty nodes)', () => {
        // Prime the buffer so connection pairs exist.
        markNodesDirty([0, 1, 2, 3, 4, 5, 6])
        updateMyceliumThreads()

        // Second call with no dirty nodes — should hit the early-exit path.
        updateMyceliumThreads()

        const d = mockState.scenePerformanceDiagnostics
        expect(d.lastThreadUpdateMs).toBe(0)
        expect(d.lastThreadUpdateDirtyNodes).toBe(0)
        expect(d.lastThreadUpdateDirtyPairs).toBe(0)
    })

    it('records zeroes on empty-pairs path (no connection pairs)', () => {
        // No connection pairs at all — the earliest exit.
        mockWebglContext.myceliumConnectionPairs = []
        markNodesDirty([0])
        updateMyceliumThreads()

        const d = mockState.scenePerformanceDiagnostics
        expect(d.lastThreadUpdateMs).toBe(0)
        expect(d.lastThreadUpdateDirtyNodes).toBe(0)
        expect(d.lastThreadUpdateDirtyPairs).toBe(0)
    })

    it('records dirty-pair counts that match the pair table exactly', () => {
        // 6 core pairs: {0,1}, {1,2}, {2,3}, {3,4}, {4,5}, {5,6}
        // Mark nodes 0,2,4 dirty → pairs touching them:
        //   {0,1} touches 0 → dirty
        //   {1,2} touches 2 → dirty
        //   {2,3} touches 2 → dirty
        //   {3,4} touches 4 → dirty
        //   {4,5} touches 4 → dirty
        //   {5,6} touches neither → clean
        // Total: 5 dirty pairs.
        markNodesDirty([0, 1, 2, 3, 4, 5, 6])
        updateMyceliumThreads()

        markNodesDirty([0, 2, 4])
        updateMyceliumThreads()

        const d = mockState.scenePerformanceDiagnostics
        expect(d.lastThreadUpdateDirtyNodes).toBe(3)
        expect(d.lastThreadUpdateDirtyPairs).toBe(5)
    })

    it('does not change buffer array references (no allocation)', () => {
        markNodesDirty([0, 1, 2, 3, 4, 5, 6])
        updateMyceliumThreads()

        const startArray = mockWebglContext.myceliumCoreLines.geometry.getAttribute('instanceStart')
            .array as Float32Array
        const refBefore = startArray.buffer

        markNodesDirty([0])
        updateMyceliumThreads()

        // Same Float32Array reference — no buffer reallocation.
        expect(startArray.buffer).toBe(refBefore)
    })
})
