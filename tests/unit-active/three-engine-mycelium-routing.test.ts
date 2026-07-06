/**
 * W50 regression: updateMyceliumThreads routing
 *
 * Bug: The thread color-intensity fix (commit ddf5604f + layerIntensity map)
 * was applied to `thread-manager.ts::updateMyceliumThreads()`, but the active
 * render loop routed through `engineState.myceliumEngine?.updateMyceliumThreads()`
 * which resolves to the LEGACY `mycelium-engine.ts::updateMyceliumThreads()`.
 * The legacy version only writes positions, never colors — so the per-vertex
 * color update (and dirty-node amortization) lived in dead code.
 *
 * Fix: `three-engine-mycelium.ts::updateMyceliumThreads()` and the direct call
 * in `three-engine-core.ts` now route through `thread-manager.ts` directly.
 *
 * This test pins the routing so a future refactor can't silently re-wire
 * the call back to the legacy mycelium-engine path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock thread-manager so we can observe whether its updateMyceliumThreads runs.
// vi.hoisted ensures the mock functions exist before the hoisted vi.mock factories run.
const { threadManagerUpdateMock, legacyUpdateMock } = vi.hoisted(() => ({
    threadManagerUpdateMock: vi.fn(),
    legacyUpdateMock: vi.fn(),
}))

vi.mock('@lib/engine/thread-manager', () => ({
    createMycelium: vi.fn(),
    updateMyceliumThreads: threadManagerUpdateMock,
    shouldRenderThreads: vi.fn().mockReturnValue(true),
    shouldRenderBridgeThreads: vi.fn().mockReturnValue(false),
    getMyceliumPresentationProfile: vi.fn(),
    getThreadPulseOpacity: vi.fn(),
    getGroupLineSegmentCount: vi.fn().mockReturnValue(0),
    disposeMycelium: vi.fn(),
}))

// Mock the legacy mycelium-engine so we can detect if it is (incorrectly) called.
vi.mock('@lib/engine/mycelium-engine', () => ({
    updateMyceliumThreads: legacyUpdateMock,
    buildGeometricMyceliumEdges: vi.fn(),
    buildSemanticMyceliumEdges: vi.fn(),
    getBezierControlPoint: vi.fn(),
    pushBezierLinePair: vi.fn(),
}))

import { updateMyceliumThreads } from '../../src/lib/engine/three-engine-mycelium'

describe('W50: updateMyceliumThreads routes through thread-manager (not legacy mycelium-engine)', () => {
    beforeEach(() => {
        threadManagerUpdateMock.mockClear()
        legacyUpdateMock.mockClear()
    })

    it('calls thread-manager.updateMyceliumThreads', () => {
        updateMyceliumThreads()
        expect(threadManagerUpdateMock).toHaveBeenCalledTimes(1)
    })

    it('does NOT call the legacy mycelium-engine.updateMyceliumThreads', () => {
        updateMyceliumThreads()
        expect(legacyUpdateMock).not.toHaveBeenCalled()
    })
})
