import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * @vitest-environment jsdom
 *
 * camera.svelte.ts Svelte 5 rune mocking harness — Phase 6d (2026-06-26)
 *
 * Pattern for testing `.svelte.ts` files that depend on
 * `@lib/state/app.svelte.ts` (which uses Svelte 5 `$state` runes):
 *
 *   1. `vi.hoisted()` creates a plain JS mock of the appState surface
 *      BEFORE vi.mock is hoisted. Tests mutate this directly.
 *   2. `vi.mock('@lib/state/app.svelte.ts')` returns the hoisted object
 *      using getters/setters so production writes propagate back to
 *      the mock state (and tests can assert via the mock).
 *   3. Imports the `.svelte.ts` file UNDER TEST AFTER mocks so it sees
 *      the stubbed appState.
 *   4. Tests exercise the exported functions and assert via the mock.
 *
 * This harness proves the pattern works for camera.svelte.ts (which only
 * depends on appState). It can be generalized to url-state.ts and
 * parity-attrs.svelte.ts by adding their additional store mocks.
 */

// ── Mutable mock appState ────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
    // AppState-mirrored fields that camera-store reads/writes
    autoRotate: false,
    autoRotateSuspended: false,
    // Other fields referenced indirectly (read-only in camera-store)
    currentView: 'galaxy',
    focusedNode: null as number | null,
    semanticDiveMode: false,
    trailDepth: 0
}))

vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: {
        // Use getters/setters so production code reads/writes the mock state
        get autoRotate() {
            return mockState.autoRotate
        },
        set autoRotate(v) {
            mockState.autoRotate = v
        },
        get autoRotateSuspended() {
            return mockState.autoRotateSuspended
        },
        set autoRotateSuspended(v) {
            mockState.autoRotateSuspended = v
        },
        currentView: mockState.currentView,
        focusedNode: mockState.focusedNode,
        semanticDiveMode: mockState.semanticDiveMode,
        trailDepth: mockState.trailDepth,
        // W11-T4 partition sub-records — insurance against future partition drift.
        searchState: {
            currentSearchSummary: null,
            searchStatus: 'idle',
            searchError: null,
            searchRequestSequence: 0,
            searchAnchorIndex: null,
            searchPreviewIndex: null,
            searchGlowIndices: new Set(),
            searchGlowTopIndex: null,
            searchGlowActive: false,
            searchFocusTransitionToken: 0,
            isSearching: false,
            currentEmptyQuery: null,
            semanticTrailCue: 'idle',
            isCompactViewport: false,
            semanticGuideRequestSequence: 0,
            currentSemanticGuide: null,
            summaryCardTypeToken: 0,
            semanticSearchCacheDiagnostics: {
                hits: 0,
                misses: 0,
                stores: 0,
                evictions: 0,
                lastKey: null,
                lastSource: null,
                lastAgeMs: null
            },
            semanticSearchResultCache: new Map(),
            searchVisibleCount: 5
        },
        viewportState: {
            viewportWidth: 1280,
            viewportHeight: 800,
            isCompactViewport: false,
            isMobileViewport: false,
            isTabletViewport: false,
            devicePixelRatio: 1
        },
        focusState: {
            selectedPoint: null,
            inspectedThreadIndex: null,
            pinnedThreadIndex: null,
            threadInspectorPointerInside: false,
            pocketMotionByIndex: new Map(),
            pocketTransitionStartedAt: 0,
            infoPanelOpen: true,
            pocketListVisible: false,
            pocketRoleFilter: 'all',
            focusTransitionMode: 'idle',
            focusTransitionStartedAt: 0,
            nodesAreSettling: false,
            inspectedStrandDiagnostics: {
                active: false,
                source: '',
                index: null,
                focusedIndex: null,
                segmentCount: 0,
                braidCount: 0,
                endpointCount: 0
            }
        },
        withMutation: (fn: () => unknown) => fn()
    }
}))

// Import AFTER mock so the camera store sees the stubbed appState.
import {
    cameraStore,
    cameraPosition,
    cameraTarget,
    autoRotate as autoRotateGetter,
    autoRotateSuspended,
    isAutoRotating,
    cameraTransitionPhase,
    isTransitioning,
    cameraAssistActive,
    setCameraPosition,
    setCameraTarget,
    setAutoRotate,
    suspendAutoRotate,
    resumeAutoRotate,
    toggleAutoRotate,
    startCameraTransition,
    completeCameraTransition,
    resetCamera,
    startFocusCameraAssist,
    releaseFocusCameraAssist,
    isFocusCameraAssistActive,
    CAMERA_CONFIG,
    OVERVIEW_CAMERA_POSE
} from '@lib/stores/camera.svelte'

describe('camera.svelte.ts — Svelte 5 rune mock harness (Phase 6d)', () => {
    beforeEach(() => {
        // Reset mock state between tests
        mockState.autoRotate = false
        mockState.autoRotateSuspended = false
        // Reset camera store to defaults
        resetCamera()
    })

    // ── Initial state ───────────────────────────────────────────────────────

    describe('initial state', () => {
        it('cameraPosition starts at default [0, 0, 3]', () => {
            expect(cameraPosition()).toEqual([0, 0, 3])
        })

        it('cameraTarget starts at default [0, 0, 0]', () => {
            expect(cameraTarget()).toEqual([0, 0, 0])
        })

        it('autoRotate starts false', () => {
            expect(autoRotateGetter()).toBe(false)
        })

        it('autoRotateSuspended starts false', () => {
            expect(autoRotateSuspended()).toBe(false)
        })

        it('cameraTransitionPhase starts "idle"', () => {
            expect(cameraTransitionPhase()).toBe('idle')
        })

        it('cameraAssistActive starts false', () => {
            expect(cameraAssistActive()).toBe(false)
        })
    })

    // ── Position / Target setters ───────────────────────────────────────────

    describe('setCameraPosition / setCameraTarget', () => {
        it('setCameraPosition updates position', () => {
            setCameraPosition([1, 2, 3])
            expect(cameraPosition()).toEqual([1, 2, 3])
        })

        it('setCameraTarget updates target', () => {
            setCameraTarget([0.5, 1.5, -2])
            expect(cameraTarget()).toEqual([0.5, 1.5, -2])
        })

        it('position and target are independent', () => {
            setCameraPosition([1, 2, 3])
            setCameraTarget([4, 5, 6])
            expect(cameraPosition()).toEqual([1, 2, 3])
            expect(cameraTarget()).toEqual([4, 5, 6])
        })

        it('cameraStore.position accessor matches cameraPosition() function', () => {
            setCameraPosition([7, 8, 9])
            expect(cameraStore.position).toEqual([7, 8, 9])
        })
    })

    // ── Auto-rotate ────────────────────────────────────────────────────────

    describe('autoRotate', () => {
        it('setAutoRotate(true) enables auto-rotate (and writes to appState mirror)', () => {
            setAutoRotate(true)
            expect(autoRotateGetter()).toBe(true)
            expect(mockState.autoRotate).toBe(true)
        })

        it('suspendAutoRotate sets autoRotateSuspended via appState', () => {
            setAutoRotate(true)
            suspendAutoRotate()
            // mockState should reflect the suspension
            expect(mockState.autoRotateSuspended).toBe(true)
        })

        it('resumeAutoRotate clears suspended state', () => {
            setAutoRotate(true)
            suspendAutoRotate()
            resumeAutoRotate()
            expect(mockState.autoRotateSuspended).toBe(false)
        })

        it('toggleAutoRotate flips autoRotate state', () => {
            expect(autoRotateGetter()).toBe(false)
            toggleAutoRotate()
            expect(autoRotateGetter()).toBe(true)
            toggleAutoRotate()
            expect(autoRotateGetter()).toBe(false)
        })

        it('isAutoRotating returns false when not enabled', () => {
            expect(isAutoRotating()).toBe(false)
        })

        it('isAutoRotating returns true when enabled and not suspended', () => {
            setAutoRotate(true)
            expect(isAutoRotating()).toBe(true)
        })

        it('isAutoRotating returns false when enabled but suspended', () => {
            setAutoRotate(true)
            suspendAutoRotate()
            expect(isAutoRotating()).toBe(false)
        })
    })

    // ── Camera transition ───────────────────────────────────────────────────

    describe('camera transition', () => {
        it('isTransitioning returns false when phase is idle', () => {
            expect(isTransitioning()).toBe(false)
        })

        it('startCameraTransition sets phase to "transitioning"', () => {
            startCameraTransition({ position: [1, 2, 3], target: [0, 0, 0] }, 1000)
            expect(isTransitioning()).toBe(true)
            expect(cameraTransitionPhase()).toBe('transitioning')
        })

        it('completeCameraTransition sets phase to "arrived" (not idle)', () => {
            startCameraTransition({ position: [1, 2, 3], target: [0, 0, 0] }, 1000)
            completeCameraTransition()
            expect(isTransitioning()).toBe(false)
            // completeCameraTransition marks the transition as arrived, NOT idle.
            // The transition lifecycle: idle → transitioning → arrived → idle (on next transition).
            expect(cameraTransitionPhase()).toBe('arrived')
        })
    })

    // ── Focus camera assist ─────────────────────────────────────────────────

    describe('focus camera assist', () => {
        it('startFocusCameraAssist activates assist', () => {
            expect(cameraAssistActive()).toBe(false)
            startFocusCameraAssist(900, 'test-focus')
            expect(cameraAssistActive()).toBe(true)
        })

        it('releaseFocusCameraAssist deactivates assist', () => {
            startFocusCameraAssist(900, 'test-focus')
            releaseFocusCameraAssist('test')
            expect(cameraAssistActive()).toBe(false)
        })

        it('isFocusCameraAssistActive returns false when no assist set', () => {
            expect(isFocusCameraAssistActive()).toBe(false)
        })

        it('isFocusCameraAssistActive returns true within duration', () => {
            const now = performance.now()
            startFocusCameraAssist(60000, 'long')
            // Future time within the assist duration
            expect(isFocusCameraAssistActive(now + 1000)).toBe(true)
        })

        it('isFocusCameraAssistActive returns false after duration expires', () => {
            const now = performance.now()
            startFocusCameraAssist(50, 'short')
            // 1000ms in the future is well past the 50ms assist duration
            expect(isFocusCameraAssistActive(now + 1000)).toBe(false)
        })
    })

    // ── CAMERA_CONFIG sanity ────────────────────────────────────────────────

    describe('CAMERA_CONFIG', () => {
        it('exposes timing constants', () => {
            expect(CAMERA_CONFIG.AUTO_ROTATE_BASE_SPEED).toBeGreaterThan(0)
            expect(CAMERA_CONFIG.AUTO_ROTATE_IDLE_MS).toBeGreaterThan(0)
        })
    })

    // ── resetCamera ────────────────────────────────────────────────────────

    describe('resetCamera', () => {
        it('restores camera to DEFAULT_POSITION and DEFAULT_TARGET', () => {
            setCameraPosition([99, 99, 99])
            setCameraTarget([88, 88, 88])
            resetCamera()
            // resetCamera uses DEFAULT_POSITION [0,0,3] and DEFAULT_TARGET [0,0,0],
            // NOT OVERVIEW_CAMERA_POSE (which is [0, 0.45, 3.0]).
            expect(cameraPosition()).toEqual([0, 0, 3])
            expect(cameraTarget()).toEqual([0, 0, 0])
        })

        it('OVERVIEW_CAMERA_POSE is distinct from resetCamera defaults', () => {
            // Sanity check: OVERVIEW_CAMERA_POSE is an exported constant with
            // a different position than resetCamera's defaults.
            expect(OVERVIEW_CAMERA_POSE.position).toEqual([0, 0.45, 3.0])
            expect(OVERVIEW_CAMERA_POSE.target).toEqual([0, 0, 0])
        })
    })

    // ── Subscriber notification ────────────────────────────────────────────

    describe('subscriber notifications', () => {
        it('subscribers receive updates on setCameraPosition', () => {
            const received: number[][] = []
            const unsub = cameraStore.subscribe(() => {
                received.push([...cameraPosition()])
            })
            setCameraPosition([1, 2, 3])
            setCameraPosition([4, 5, 6])
            expect(received.length).toBeGreaterThanOrEqual(2)
            unsub()
        })
    })
})
