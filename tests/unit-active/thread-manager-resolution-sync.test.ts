/**
 * W50 regression: LineMaterial.resolution sync
 *
 * Bug: The legacy js/modules/three-engine.ts synced LineMaterial.resolution
 * to the renderer drawing-buffer size every frame. The TS port to
 * src/lib/engine/ dropped this sync entirely — LineMaterial kept its default
 * resolution (1,1), so the mycelium linewidth shader (offset /= resolution.y)
 * rendered threads ~1000× too thick (fat bands instead of thin filaments).
 *
 * Fix: createMycelium() calls syncMyceliumLineResolution() at the end, and
 * onWindowResize() calls it after renderer.setSize(). This test pins the
 * resolution math.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted runs before the hoisted vi.mock factories, so the mock fns exist
// when the factory closures execute.
const { resolutionSet, getSize, getPixelRatio } = vi.hoisted(() => ({
    resolutionSet: vi.fn((x: number, y: number) => {}),
    // Three.js WebGLRenderer.getSize(target) MUTATES target (returns void).
    getSize: vi.fn((target: { x: number; y: number }) => {
        target.x = 1920
        target.y = 1080
    }),
    getPixelRatio: vi.fn(() => 2)
}))

vi.mock('@lib/engine/webgl-context', () => ({
    webglContext: {
        renderer: { getSize, getPixelRatio },
        myceliumCoreLines: { material: { resolution: { set: resolutionSet } } },
        myceliumWispyLines: { material: { resolution: { set: resolutionSet } } },
        myceliumBridgeLines: { material: { resolution: { set: resolutionSet } } }
    }
}))

vi.mock('@lib/state/with-state-mutation', () => ({
    withStateMutation: (fn: () => void) => fn()
}))

vi.mock('@lib/state/app.svelte', () => ({
    appState: {
        points: [],
        nodePositions: [],
        targetPositions: [],
        originalPositions: [],
        semanticNeighborMapByLeadId: new Map(),
        myceliumDirty: false,
        scenePerformanceDiagnostics: {},
        viewportState: {
            viewportWidth: 1920,
            viewportHeight: 1080,
            viewportIsCompact: false,
            viewportDpr: 2,
            viewportReducedMotion: false
        },
        focusState: {},
        navState: {},
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
        }
    }
}))

import { syncMyceliumLineResolution } from '../../src/lib/engine/thread-manager'

describe('W50: LineMaterial.resolution sync (TS-port regression)', () => {
    beforeEach(() => {
        resolutionSet.mockClear()
        getSize.mockClear()
        getPixelRatio.mockClear()
    })

    it('sets resolution on all three mycelium line materials', () => {
        syncMyceliumLineResolution()
        // core + wispy + bridge = 3 calls
        expect(resolutionSet).toHaveBeenCalledTimes(3)
    })

    it('uses renderer drawing-buffer size × pixel ratio', () => {
        syncMyceliumLineResolution()
        expect(getSize).toHaveBeenCalledTimes(1)
        expect(getPixelRatio).toHaveBeenCalledTimes(1)
        // 1920 × 2 = 3840, 1080 × 2 = 2160
        expect(resolutionSet).toHaveBeenLastCalledWith(3840, 2160)
    })
})
