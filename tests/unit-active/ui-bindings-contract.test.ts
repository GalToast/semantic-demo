import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Module mocks (inline-literal pattern; no hoisted factories) ──────────────

vi.mock('@lib/orchestration/lifecycle', () => ({
    probeSemanticLane: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('@lib/utils/error-handler', () => ({
    silenceError: vi.fn((_ctx: string) => () => {})
}))

vi.mock('@lib/state/app.svelte', () => {
    const state = {
        currentView: '3d' as '3d' | 'map',
        camera: null as { position: ReturnType<typeof makeVec3> } | null,
        controls: null as { target: ReturnType<typeof makeVec3>; minDistance?: number; maxDistance?: number } | null,
        ORBIT_MIN_DISTANCE_DEFAULT: 0.5,
        ORBIT_MAX_DISTANCE_DEFAULT: 1000
    }
    // Expose a reset helper for beforeEach
    ;(state as Record<string, unknown>).__reset = () => {
        state.currentView = '3d'
        state.camera = null
        state.controls = null
    }
    return { appState: state }
})

vi.mock('@lib/engine/map-state', () => ({
    zoomMap: vi.fn()
}))

vi.mock('@lib/utils/debug', () => ({
    debugWarn: vi.fn()
}))

// ── Imports under test (after vi.mock so they receive mocked versions) ───────

import { handleSemanticLaneWindowFocus, handleSemanticLaneVisibilityChange } from '@lib/ui/semantic-lane-bindings'
import { bindClick, zoomCamera } from '@lib/ui/view-bindings'

// Mock references (synchronous imports; vi.mock is hoisted so these resolve)
import { probeSemanticLane as _probeSemanticLane } from '@lib/orchestration/lifecycle'
import { silenceError as _silenceError } from '@lib/utils/error-handler'
import { appState as _appState } from '@lib/state/app.svelte'
import { debugWarn as _debugWarn } from '@lib/utils/debug'
import { zoomMap as _zoomMap } from '@lib/engine/map-state'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeVec3() {
    return {
        clone: () => makeVec3(),
        sub: () => makeVec3(),
        normalize: () => makeVec3(),
        multiplyScalar: () => ({}),
        add: () => ({}),
        distanceTo: () => 10,
        copy: vi.fn()
    }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('semantic-lane-bindings', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        ;(_probeSemanticLane as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
        ;(_silenceError as ReturnType<typeof vi.fn>).mockReturnValue(() => {})
    })

    it('handleSemanticLaneWindowFocus is a no-throw in jsdom', () => {
        expect(() => handleSemanticLaneWindowFocus()).not.toThrow()
    })

    it('handleSemanticLaneWindowFocus calls probeSemanticLane with warm:true, reason:focus', async () => {
        handleSemanticLaneWindowFocus()
        await Promise.resolve()
        expect(_probeSemanticLane).toHaveBeenCalledTimes(1)
        expect(_probeSemanticLane).toHaveBeenCalledWith({ warm: true, reason: 'focus' })
    })

    it('handleSemanticLaneVisibilityChange is a no-throw in jsdom', () => {
        expect(() => handleSemanticLaneVisibilityChange()).not.toThrow()
    })

    it('handleSemanticLaneVisibilityChange calls probeSemanticLane when document is visible', async () => {
        handleSemanticLaneVisibilityChange()
        await Promise.resolve()
        expect(_probeSemanticLane).toHaveBeenCalledTimes(1)
        expect(_probeSemanticLane).toHaveBeenCalledWith({ warm: true, reason: 'visibility' })
    })

    it('handleSemanticLaneVisibilityChange early-returns when document is hidden', async () => {
        Object.defineProperty(document, 'visibilityState', {
            value: 'hidden',
            configurable: true
        })
        handleSemanticLaneVisibilityChange()
        await Promise.resolve()
        expect(_probeSemanticLane).not.toHaveBeenCalled()
        // Restore
        Object.defineProperty(document, 'visibilityState', {
            value: 'visible',
            configurable: true
        })
    })
})

describe('view-bindings', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        ;(_appState as Record<string, unknown>).__reset?.()
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    describe('bindClick', () => {
        it('wires onclick handler on an existing element and fires on click', () => {
            const el = document.createElement('button')
            el.id = 'contract-test-bind-click'
            document.body.appendChild(el)

            const handler = vi.fn()
            bindClick('contract-test-bind-click', handler)

            el.click()
            expect(handler).toHaveBeenCalledTimes(1)
        })

        it('returns silently when element is missing and optional is true', () => {
            const handler = vi.fn()
            expect(() =>
                bindClick('contract-test-missing-optional', handler, { optional: true })
            ).not.toThrow()
            expect(_debugWarn).not.toHaveBeenCalled()
        })

        it('warns when a required element is missing', () => {
            const handler = vi.fn()
            expect(() =>
                bindClick('contract-test-missing-required', handler)
            ).not.toThrow()
            expect(_debugWarn).toHaveBeenCalledTimes(1)
            expect(_debugWarn).toHaveBeenCalledWith(
                expect.stringContaining('contract-test-missing-required')
            )
        })
    })

    describe('zoomCamera', () => {
        it('delegates to zoomMap when currentView is map', () => {
            _appState.currentView = 'map'

            zoomCamera(1.5)

            expect(_zoomMap).toHaveBeenCalledTimes(1)
            expect(_zoomMap).toHaveBeenCalledWith(1.5)
        })

        it('does not throw when camera and controls are present (3d path)', () => {
            _appState.currentView = '3d'
            _appState.camera = { position: makeVec3() }
            _appState.controls = { target: makeVec3(), minDistance: 1, maxDistance: 100 }

            expect(() => zoomCamera(2.0)).not.toThrow()
        })

        it('returns silently when camera or controls are missing', () => {
            _appState.currentView = '3d'
            _appState.camera = null
            _appState.controls = null

            expect(() => zoomCamera(2.0)).not.toThrow()
        })
    })
})
