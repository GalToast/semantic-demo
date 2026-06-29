/**
 * @vitest-environment jsdom
 *
 * Unit tests for the three mirror-write helpers in
 * src/lib/engine/three-store-sync.ts (W50 Phase 5c — C3, C11, C12 extraction).
 *
 * The helpers take an injectable `sinks` bundle so we use plain object
 * fixtures with no `vi.mock` plumbing for the singletons. This is the
 * whole point of the extraction — tests verify the mirror map logic
 * without instantiating the singleton tree.
 *
 * Coverage:
 *   - syncSceneHandles (C3) — 6 fields written to webglContext + correct
 *     subset to appState (scene/renderer/controls) and legacyState
 *     (camera/hemiLight/dirLight) and engineState.state (all 6).
 *     null legacyState + null engineState.state tolerated.
 *   - syncPointsHandles (C11) — 4 fields mirrored to appState +
 *     engineState.state. null engineState.state tolerated.
 *   - syncMyceliumHandles (C12) — 4 fields to appState, 1 (pairs) to
 *     legacyState + engineState.state, all 5 to engineState.state.
 *   - Mirror-map correctness — defensive cross-checks that we did NOT
 *     write appState-only fields to legacyState (and vice versa).
 *
 * References:
 *   - docs/three-engine-decomposition-plan.md §5 (Phase 3 — C3, C11, C12)
 */

import { describe, expect, it, beforeEach } from 'vitest'
import {
    syncSceneHandles,
    syncPointsHandles,
    syncMyceliumHandles,
    type SceneSyncSinks,
    type PointsSyncSinks,
    type MyceliumSyncSinks,
    type PointsMirrorInput,
    type MyceliumMirrorInput,
    type SceneMirrorInput
} from '@lib/engine/three-store-sync'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function fakeSetup(): SceneMirrorInput {
    // Plain-object stand-ins — the helpers only need the assigned fields
    // to exist with the same shape as the singleton targets.
    return {
        scene: { marker: 'scene' } as any,
        camera: { marker: 'camera' } as any,
        renderer: { marker: 'renderer' } as any,
        controls: { marker: 'controls' } as any,
        hemiLight: { marker: 'hemiLight' } as any,
        dirLight: { marker: 'dirLight' } as any
    }
}

function fakePoints(): PointsMirrorInput {
    return {
        pointsMesh: { marker: 'pointsMesh' } as any,
        pointsMaterial: { marker: 'pointsMaterial' } as any,
        nodeSporeMesh: { marker: 'nodeSporeMesh' } as any,
        nodeSporeMaterial: { marker: 'nodeSporeMaterial' } as any
    }
}

function fakeMycelium(): MyceliumMirrorInput {
    return {
        myceliumGroup: { marker: 'myceliumGroup' } as any,
        myceliumCoreLines: { marker: 'core' } as any,
        myceliumWispyLines: { marker: 'wispy' } as any,
        myceliumBridgeLines: { marker: 'bridge' } as any,
        myceliumConnectionPairs: [
            { a: 1, b: 2, layer: 0 },
            { a: 3, b: 4, layer: 1 }
        ]
    }
}

function freshSceneSinks(): SceneSyncSinks {
    return {
        webglContext: {
            scene: null,
            camera: null,
            renderer: null,
            controls: null,
            hemiLight: null,
            dirLight: null
        },
        appState: { scene: null, renderer: null, controls: null },
        legacyState: { camera: null, hemiLight: null, dirLight: null },
        engineState: { state: null }
    }
}

function freshPointsSinks(): PointsSyncSinks & { legacyState: null } {
    return {
        appState: {
            pointsMesh: null,
            pointsMaterial: null,
            nodeSporeMesh: null,
            nodeSporeMaterial: null
        },
        engineState: { state: null }
    } as any
}

function freshMyceliumSinks(): MyceliumSyncSinks {
    return {
        appState: {
            myceliumGroup: null,
            myceliumCoreLines: null,
            myceliumWispyLines: null,
            myceliumBridgeLines: null
        },
        legacyState: { myceliumConnectionPairs: [] },
        engineState: { state: null }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. syncSceneHandles (C3)
// ══════════════════════════════════════════════════════════════════════════════

describe('syncSceneHandles (C3)', () => {
    let sinks: SceneSyncSinks

    beforeEach(() => {
        sinks = freshSceneSinks()
    })

    it('writes all 6 handles to webglContext', () => {
        const setup = fakeSetup()
        syncSceneHandles(setup, sinks)
        expect(sinks.webglContext.scene).toBe(setup.scene)
        expect(sinks.webglContext.camera).toBe(setup.camera)
        expect(sinks.webglContext.renderer).toBe(setup.renderer)
        expect(sinks.webglContext.controls).toBe(setup.controls)
        expect(sinks.webglContext.hemiLight).toBe(setup.hemiLight)
        expect(sinks.webglContext.dirLight).toBe(setup.dirLight)
    })

    it('writes scene/renderer/controls to appState (NOT camera/lights)', () => {
        const setup = fakeSetup()
        syncSceneHandles(setup, sinks)
        expect(sinks.appState.scene).toBe(setup.scene)
        expect(sinks.appState.renderer).toBe(setup.renderer)
        expect(sinks.appState.controls).toBe(setup.controls)
    })

    it('writes camera/hemiLight/dirLight to legacyState (NOT scene/renderer/controls)', () => {
        const setup = fakeSetup()
        syncSceneHandles(setup, sinks)
        expect(sinks.legacyState!.camera).toBe(setup.camera)
        expect(sinks.legacyState!.hemiLight).toBe(setup.hemiLight)
        expect(sinks.legacyState!.dirLight).toBe(setup.dirLight)
    })

    it('writes all 6 handles to engineState.state when present', () => {
        const target: Record<string, unknown> = {}
        sinks.engineState = { state: target as any }
        const setup = fakeSetup()

        syncSceneHandles(setup, sinks)

        expect(target.scene).toBe(setup.scene)
        expect(target.camera).toBe(setup.camera)
        expect(target.renderer).toBe(setup.renderer)
        expect(target.controls).toBe(setup.controls)
        expect(target.hemiLight).toBe(setup.hemiLight)
        expect(target.dirLight).toBe(setup.dirLight)
    })

    it('tolerates null legacyState (early-init scenario)', () => {
        sinks.legacyState = null
        const setup = fakeSetup()
        // Should not throw
        expect(() => syncSceneHandles(setup, sinks)).not.toThrow()
        expect(sinks.webglContext.scene).toBe(setup.scene)
    })

    it('tolerates null engineState.state', () => {
        sinks.engineState.state = null
        const setup = fakeSetup()
        expect(() => syncSceneHandles(setup, sinks)).not.toThrow()
        expect(sinks.webglContext.scene).toBe(setup.scene)
    })

    it('overwrites previous values (does not merge)', () => {
        // Pre-populate sinks with stale values
        const stale = { marker: 'stale' }
        sinks.webglContext.scene = stale as any
        sinks.appState.scene = stale as any
        const setup = fakeSetup()
        syncSceneHandles(setup, sinks)
        expect(sinks.webglContext.scene).toBe(setup.scene)
        expect(sinks.appState.scene).toBe(setup.scene)
    })

    it('preserves mirror-map invariants: appState stays free of camera/hemiLight/dirLight', () => {
        // The structural contract is enforced by the typed `appState` slot.
        // Verify at runtime that no camera/lights leaked into appState.
        const setup = fakeSetup()
        syncSceneHandles(setup, sinks)
        const app = sinks.appState as Record<string, unknown>
        expect('camera' in app).toBe(false)
        expect('hemiLight' in app).toBe(false)
        expect('dirLight' in app).toBe(false)
    })

    it('preserves mirror-map invariants: legacyState stays free of scene/renderer/controls', () => {
        const setup = fakeSetup()
        syncSceneHandles(setup, sinks)
        const legacy = sinks.legacyState as Record<string, unknown>
        expect('scene' in legacy).toBe(false)
        expect('renderer' in legacy).toBe(false)
        expect('controls' in legacy).toBe(false)
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. syncPointsHandles (C11)
// ══════════════════════════════════════════════════════════════════════════════

describe('syncPointsHandles (C11)', () => {
    let sinks: PointsSyncSinks

    beforeEach(() => {
        sinks = freshPointsSinks()
    })

    it('writes all 4 points/spore handles to appState', () => {
        const handles = fakePoints()
        syncPointsHandles(handles, sinks)
        expect(sinks.appState.pointsMesh).toBe(handles.pointsMesh)
        expect(sinks.appState.pointsMaterial).toBe(handles.pointsMaterial)
        expect(sinks.appState.nodeSporeMesh).toBe(handles.nodeSporeMesh)
        expect(sinks.appState.nodeSporeMaterial).toBe(handles.nodeSporeMaterial)
    })

    it('writes all 4 handles to engineState.state when present', () => {
        const target: Record<string, unknown> = {}
        sinks.engineState = { state: target as any }
        const handles = fakePoints()
        syncPointsHandles(handles, sinks)
        expect(target.pointsMesh).toBe(handles.pointsMesh)
        expect(target.pointsMaterial).toBe(handles.pointsMaterial)
        expect(target.nodeSporeMesh).toBe(handles.nodeSporeMesh)
        expect(target.nodeSporeMaterial).toBe(handles.nodeSporeMaterial)
    })

    it('tolerates null engineState.state', () => {
        sinks.engineState.state = null
        const handles = fakePoints()
        expect(() => syncPointsHandles(handles, sinks)).not.toThrow()
        expect(sinks.appState.pointsMesh).toBe(handles.pointsMesh)
    })

    it('overwrites previous values', () => {
        const stale = { marker: 'stale' }
        sinks.appState.pointsMesh = stale as any
        const handles = fakePoints()
        syncPointsHandles(handles, sinks)
        expect(sinks.appState.pointsMesh).toBe(handles.pointsMesh)
    })

    it('assigns the SAME object reference (no defensive copying)', () => {
        const handles = fakePoints()
        syncPointsHandles(handles, sinks)
        // Reference identity matters: the render loop mutates properties
        // on these objects (e.g. nodeSporeMaterial.opacity). If we copied
        // we would diverge from webglContext's authoritative instance.
        expect(Object.is(sinks.appState.pointsMesh, handles.pointsMesh)).toBe(true)
        expect(Object.is(sinks.appState.nodeSporeMaterial, handles.nodeSporeMaterial)).toBe(true)
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. syncMyceliumHandles (C12)
// ══════════════════════════════════════════════════════════════════════════════

describe('syncMyceliumHandles (C12)', () => {
    let sinks: MyceliumSyncSinks

    beforeEach(() => {
        sinks = freshMyceliumSinks()
    })

    it('writes 4 mycelium handles to appState (group + 3 line segments)', () => {
        const handles = fakeMycelium()
        syncMyceliumHandles(handles, sinks)
        expect(sinks.appState.myceliumGroup).toBe(handles.myceliumGroup)
        expect(sinks.appState.myceliumCoreLines).toBe(handles.myceliumCoreLines)
        expect(sinks.appState.myceliumWispyLines).toBe(handles.myceliumWispyLines)
        expect(sinks.appState.myceliumBridgeLines).toBe(handles.myceliumBridgeLines)
    })

    it('writes myceliumConnectionPairs to legacyState (NOT the 4 group/segment handles)', () => {
        const handles = fakeMycelium()
        syncMyceliumHandles(handles, sinks)
        expect(sinks.legacyState!.myceliumConnectionPairs).toBe(handles.myceliumConnectionPairs)
        expect(sinks.legacyState!.myceliumConnectionPairs).toHaveLength(2)
    })

    it('preserves legacyState mirror map — never writes group/core/wispy/bridge there', () => {
        const handles = fakeMycelium()
        syncMyceliumHandles(handles, sinks)
        const legacy = sinks.legacyState as Record<string, unknown>
        expect('myceliumGroup' in legacy).toBe(false)
        expect('myceliumCoreLines' in legacy).toBe(false)
        expect('myceliumWispyLines' in legacy).toBe(false)
        expect('myceliumBridgeLines' in legacy).toBe(false)
    })

    it('writes all 5 mycelium handles to engineState.state when present', () => {
        const target: Record<string, unknown> = {}
        sinks.engineState = { state: target as any }
        const handles = fakeMycelium()
        syncMyceliumHandles(handles, sinks)
        expect(target.myceliumGroup).toBe(handles.myceliumGroup)
        expect(target.myceliumCoreLines).toBe(handles.myceliumCoreLines)
        expect(target.myceliumWispyLines).toBe(handles.myceliumWispyLines)
        expect(target.myceliumBridgeLines).toBe(handles.myceliumBridgeLines)
        expect(target.myceliumConnectionPairs).toBe(handles.myceliumConnectionPairs)
    })

    it('tolerates null legacyState (early-init scenario)', () => {
        sinks.legacyState = null
        const handles = fakeMycelium()
        expect(() => syncMyceliumHandles(handles, sinks)).not.toThrow()
        expect(sinks.appState.myceliumGroup).toBe(handles.myceliumGroup)
    })

    it('tolerates null engineState.state', () => {
        sinks.engineState.state = null
        const handles = fakeMycelium()
        expect(() => syncMyceliumHandles(handles, sinks)).not.toThrow()
        expect(sinks.appState.myceliumGroup).toBe(handles.myceliumGroup)
    })

    it('tolerates an empty myceliumConnectionPairs array', () => {
        const handles = { ...fakeMycelium(), myceliumConnectionPairs: [] }
        syncMyceliumHandles(handles, sinks)
        expect(sinks.appState.myceliumGroup).toBe(handles.myceliumGroup)
        // legacyState.myceliumConnectionPairs is now an empty array (same ref)
        expect(sinks.legacyState!.myceliumConnectionPairs).toBe(handles.myceliumConnectionPairs)
        expect(sinks.legacyState!.myceliumConnectionPairs).toEqual([])
    })

    it('overwrites a previous myceliumConnectionPairs reference', () => {
        // Simulate a stale array leftover from a prior init cycle.
        const stale = [{ a: 99, b: 99, layer: 2 }]
        sinks.legacyState!.myceliumConnectionPairs = stale
        const handles = fakeMycelium()
        syncMyceliumHandles(handles, sinks)
        // New reference wins.
        expect(sinks.legacyState!.myceliumConnectionPairs).toBe(handles.myceliumConnectionPairs)
        expect(sinks.legacyState!.myceliumConnectionPairs).not.toBe(stale)
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. Cross-cutting: same identity maintained across all three mirrors
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-cutting identity invariants', () => {
    it('shares the same scene/camera/renderer/controls reference across webglContext + state mirror', () => {
        const sinks = freshSceneSinks()
        const setup = fakeSetup()
        const target: Record<string, unknown> = {}
        sinks.engineState = { state: target as any }
        syncSceneHandles(setup, sinks)
        // Reference identity matters: cancelAnimate() relies on the same
        // object instance being nulled across all 4 stores.
        expect(Object.is(sinks.webglContext.scene, target.scene)).toBe(true)
        expect(Object.is(sinks.webglContext.camera, (sinks.legacyState as any).camera)).toBe(true)
        expect(Object.is(sinks.appState.renderer, target.renderer)).toBe(true)
        expect(Object.is(sinks.appState.controls, target.controls)).toBe(true)
    })

    it('shares the same mycelium group reference across appState + engineState.state', () => {
        const sinks = freshMyceliumSinks()
        const target: Record<string, unknown> = {}
        sinks.engineState = { state: target as any }
        const handles = fakeMycelium()
        syncMyceliumHandles(handles, sinks)
        expect(Object.is(sinks.appState.myceliumGroup, target.myceliumGroup)).toBe(true)
        expect(Object.is(sinks.appState.myceliumCoreLines, target.myceliumCoreLines)).toBe(true)
    })
})
