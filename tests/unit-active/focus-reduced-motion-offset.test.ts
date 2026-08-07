import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Vector3 } from 'three'

/**
 * W61 F4 + #7 regression — animateCameraToNode reduced-motion path.
 *
 * F4: the reduced-motion early return skipped the rAF completion step where
 * focusCameraOffset is normally nulled, leaving a stale non-null offset that
 * mis-triggers releaseFocusCameraAssist (camera-controls-core.svelte.ts:129).
 *
 * #7: the full-numerics NaN guard ran AFTER appState.focusCameraOffset /
 * focusCameraTargetOffset writes, setFocusTransitionMode, and
 * startFocusCameraAssist — a degenerate camera/target state could leave a NaN
 * offset and an assist with no animation. The guard now runs first.
 */

const _appState = vi.hoisted(() => ({
    camera: null as any,
    controls: null as any,
    nodePositions: [] as any[],
    originalPositions: [] as any[],
    points: [] as any[],
    activeFilters: { status: 'all', city: 'all' } as any,
    viewportState: { viewportWidth: 1280, viewportHeight: 800, viewportIsCompact: false } as any,
    focusCameraAnimationToken: 0,
    focusCameraOffset: null as any,
    focusCameraTargetOffset: null as any,
    focusState: {} as any,
    navState: {
        focusedIndex: null as number | null,
        focusPocketIndices: [] as number[],
        focusPocketMeta: null as any,
        focusPocketRoleByIndex: new Map<number, string>(),
        currentPersonality: null as any,
        focusFramingMeta: null as any
    },
    trailDepth: 0,
    currentView: 'galaxy'
}))

const _assistCalls = vi.hoisted(() => ({ start: [] as unknown[], transition: [] as unknown[] }))

vi.mock('@lib/state/app.svelte.ts', () => ({ appState: _appState }))
vi.mock('@lib/utils/environment', () => ({
    prefersReducedMotion: () => true,
    isCompactLandscape: () => false,
    isUltraCompactPortrait: () => false,
    getViewportSize: () => ({ width: 1500, height: 900 })
}))
vi.mock('@lib/engine/camera-controls-core', () => ({
    setFocusTransitionMode: (...args: unknown[]) => {
        _assistCalls.transition.push(args)
    },
    startFocusCameraAssist: (...args: unknown[]) => {
        _assistCalls.start.push(args)
    },
    setFocusCameraOffset: (offset: unknown) => {
        if (offset && typeof (offset as Record<string, unknown>).x === 'number') {
            _appState.focusCameraOffset = { ...offset as Record<string, number> }
        } else {
            _appState.focusCameraOffset = null
        }
    }
}))

import { animateCameraToNode } from '../../src/lib/engine/camera-choreography/focus'

describe('animateCameraToNode reduced-motion path (W61 F4/#7)', () => {
    beforeEach(() => {
        _appState.camera = { position: new Vector3(0, 0, 1) }
        _appState.controls = { target: new Vector3(0, 0, 0), update: vi.fn() }
        _appState.nodePositions = [{ x: 0.1, y: 0.2, z: 0.3 }]
        _appState.originalPositions = []
        _appState.points = [{}, {}, {}]
        _appState.focusCameraAnimationToken = 0
        _appState.focusCameraOffset = null
        _appState.focusCameraTargetOffset = null
        _appState.focusState = {}
        _appState.navState = {
            focusedIndex: 0,
            focusPocketIndices: [],
            focusPocketMeta: null,
            focusPocketRoleByIndex: new Map(),
            currentPersonality: null,
            focusFramingMeta: null
        }
        _assistCalls.start.length = 0
        _assistCalls.transition.length = 0
    })

    it('reduced-motion path nulls focusCameraOffset (F4)', () => {
        animateCameraToNode(0, { transitionStyle: 'focus' })

        // F4: the stale offset must not survive the instant reduced-motion path.
        expect(_appState.focusCameraOffset).toBeNull()
        // The instant path still snaps camera + target into place
        // (target = nodePos - framingDrop 0.02 on Y).
        const target = _appState.controls.target
        expect(target.x).toBeCloseTo(0.1, 6)
        expect(target.y).toBeCloseTo(0.18, 6)
        expect(target.z).toBeCloseTo(0.3, 6)
        const cam = _appState.camera.position
        expect(cam.x).toBeCloseTo(0.1, 6)
        expect(cam.y).toBeCloseTo(0.225, 6)
        expect(cam.z).toBeCloseTo(1.18, 6)
        // Transition mode is set, but no rAF assist starts in reduced motion.
        expect(_assistCalls.transition.length).toBe(1)
        expect(_assistCalls.start.length).toBe(0)
    })

    it('degenerate NaN camera state returns before mutating state or starting assist (#7)', () => {
        _appState.camera.position = new Vector3(NaN, 0, 1)

        animateCameraToNode(0)

        // #7: nothing was written — no offset, no transition mode, no assist.
        expect(_appState.focusCameraOffset).toBeNull()
        expect(_assistCalls.transition.length).toBe(0)
        expect(_assistCalls.start.length).toBe(0)
    })
})
