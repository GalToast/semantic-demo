/**
 * state-class-migration-4-demo.test.ts
 *
 * Regression test for src/lib/stores/demo.svelte.ts (writable + withDemoNotify).
 * Validates:
 *   1. The writable .set() / .update() / subscribe() path works in vitest/jsdom
 *   2. Store actions (setDemoPhase, startDemo, cancelDemo, …) bridge to appState.demoPhase
 *   3. Subscribers receive notifications through the writable's .set()
 *   4. Getters (demoPhase, isDemoActive, isDemoRunning) reflect appState
 *   5. resetDemo() restores initial state and the start-guard, clearing appState
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── Local type replica ───────────────────────────────────────────────────────
type DemoPhase =
    | 'IDLE'
    | 'OVERVIEW'
    | 'SEARCH'
    | 'FOCUS'
    | 'THREADS'
    | 'NEIGHBORS'
    | 'TRAIL'
    | 'DIVE'
    | 'FILTER'
    | 'MAP'
    | 'RETURN'
    | 'COMPLETE'
    | 'CANCELLED'

interface DemoStoreState {
    phase: DemoPhase
    startTime: number
    lastPhaseChangeAt: number
}

// ── Hoisted mock state ───────────────────────────────────────────────────────

const _demoState = vi.hoisted(() => ({
    demoPhase: 'IDLE' as DemoPhase,
    points: undefined as Array<Record<string, unknown>> | undefined
}))

vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: {
        get demoPhase() {
            return _demoState.demoPhase
        },
        set demoPhase(v: DemoPhase) {
            _demoState.demoPhase = v
        },
        get points() {
            return _demoState.points
        },
        set points(v: Array<Record<string, unknown>> | undefined) {
            _demoState.points = v
        },
        withMutation: (fn: () => unknown) => fn(),
        // W11-T4 partition sub-records — production reads these at module-init
        // when stores this test transitively imports load.
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
        }
    }
}))

// ── Imports (must come after vi.mock) ─────────────────────────────────────────

import {
    demoStore,
    demoState,
    demoPhase,
    isDemoActive,
    isDemoRunning,
    demoNodeIndex,
    setDemoPhase,
    startDemo,
    cancelDemo,
    transitionDemo,
    scheduleDemoTimer,
    cancelAllDemoTimers,
    getActiveDemoTimerCount,
    markDemoCompleted,
    markDemoSessionSkipped,
    resetDemo,
    hasDemoBeenSeen,
    isDemoSuppressedThisSession,
    shouldRunDemo,
    findDemoNode,
    DEMO_TIMING,
    DEMO_LIFETIME_KEY,
    DEMO_SESSION_KEY
} from '../../src/lib/stores/demo.svelte.ts'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<DemoStoreState> = {}): DemoStoreState {
    return {
        phase: 'IDLE',
        startTime: 0,
        lastPhaseChangeAt: 0,
        ...overrides
    }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Demo store — state-class appState regression', () => {
    beforeEach(() => {
        resetDemo()
        _demoState.demoPhase = 'IDLE'
        _demoState.points = undefined

        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(DEMO_LIFETIME_KEY)
        }
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(DEMO_SESSION_KEY)
        }
        history.pushState(null, '', '/')
    })

    afterEach(() => {
        cancelAllDemoTimers()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    // ── 1. Store API shape & identity ─────────────────────────────────────

    it('demoState is the same object reference as demoStore', () => {
        expect(demoState).toBe(demoStore)
    })

    it('demoStore() returns a valid DemoStoreState', () => {
        const s = demoStore()
        expect(s).toHaveProperty('phase')
        expect(s).toHaveProperty('startTime')
        expect(s).toHaveProperty('lastPhaseChangeAt')
        expect(s.phase).toBe('IDLE')
    })

    // ── 2. Writable / local path ────────────────────────────────────────────

    it('demoStore.set() mutates the local writable', () => {
        demoStore.set(makeState({ phase: 'OVERVIEW' }))
        expect(demoStore().phase).toBe('OVERVIEW')
    })

    it('demoStore.update() transforms the local writable', () => {
        demoStore.update((s: DemoStoreState) => ({ ...s, phase: 'MAP' }))
        expect(demoStore().phase).toBe('MAP')
    })

    // ── 3. Bridge to appState via store actions ─────────────────────────────

    it('setDemoPhase pushes the new phase to appState', () => {
        setDemoPhase('NEIGHBORS')
        expect(_demoState.demoPhase).toBe('NEIGHBORS')
    })

    it('startDemo pushes OVERVIEW to appState', () => {
        startDemo()
        expect(_demoState.demoPhase).toBe('OVERVIEW')
    })

    it('cancelDemo pushes CANCELLED to appState', () => {
        setDemoPhase('OVERVIEW')
        cancelDemo()
        expect(_demoState.demoPhase).toBe('CANCELLED')
    })

    it('markDemoCompleted writes the lifetime completion guard', () => {
        markDemoCompleted()
        expect(_demoState.demoPhase).toBe('COMPLETE')
        if (typeof localStorage !== 'undefined') {
            expect(localStorage.getItem(DEMO_LIFETIME_KEY)).not.toBeNull()
        }
    })

    it('markDemoSessionSkipped writes the session guard without changing the current phase', () => {
        setDemoPhase('OVERVIEW')
        markDemoSessionSkipped()
        expect(_demoState.demoPhase).toBe('OVERVIEW')
        if (typeof sessionStorage !== 'undefined') {
            expect(sessionStorage.getItem(DEMO_SESSION_KEY)).toBe('1')
        }
    })

    it('demoPhase() reads directly from appState', () => {
        _demoState.demoPhase = 'FOCUS'
        expect(demoPhase()).toBe('FOCUS')
    })

    it('writable phase stays in sync with setDemoPhase', () => {
        setDemoPhase('RETURN')
        expect(demoStore().phase).toBe('RETURN')
    })

    // ── 4. Subscriber notifications ───────────────────────────────────────

    it('subscribe fires when demoStore.set() is called', () => {
        const cb = vi.fn()
        const unsub = demoStore.subscribe(cb)
        demoStore.set(makeState({ phase: 'SEARCH' }))
        unsub()

        expect(cb).toHaveBeenCalledTimes(2)
        expect(cb).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'SEARCH' }))
    })

    it('subscribe fires when demoStore.update() is called', () => {
        const cb = vi.fn()
        const unsub = demoStore.subscribe(cb)
        demoStore.update((s: DemoStoreState) => ({ ...s, phase: 'RETURN' }))
        unsub()

        expect(cb).toHaveBeenCalledTimes(2)
        expect(cb).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'RETURN' }))
    })

    it('withDemoNotify wrapper fires subscriber via setDemoPhase', () => {
        const cb = vi.fn()
        const unsub = demoStore.subscribe(cb)
        setDemoPhase('MAP')
        unsub()

        expect(cb).toHaveBeenCalledWith(expect.objectContaining({ phase: 'MAP' }))
    })

    // ── 5. isDemoActive / isDemoRunning getters ─────────────────────────────

    it('isDemoActive() is false when appState phase is IDLE', () => {
        _demoState.demoPhase = 'IDLE'
        expect(isDemoActive()).toBe(false)
    })

    it('isDemoActive() is false when appState phase is COMPLETE', () => {
        _demoState.demoPhase = 'COMPLETE'
        expect(isDemoActive()).toBe(false)
    })

    it('isDemoActive() is false when appState phase is CANCELLED', () => {
        _demoState.demoPhase = 'CANCELLED'
        expect(isDemoActive()).toBe(false)
    })

    it('isDemoActive() is true during non-terminal phases', () => {
        const activePhases: DemoPhase[] = [
            'OVERVIEW',
            'SEARCH',
            'FOCUS',
            'THREADS',
            'NEIGHBORS',
            'TRAIL',
            'DIVE',
            'FILTER',
            'MAP',
            'RETURN'
        ]
        for (const phase of activePhases) {
            _demoState.demoPhase = phase
            expect(isDemoActive()).toBe(true)
        }
    })

    it('isDemoRunning() mirrors isDemoActive()', () => {
        _demoState.demoPhase = 'FILTER'
        expect(isDemoRunning()).toBe(true)
    })

    it('isDemoActive reflects live changes from setDemoPhase', () => {
        resetDemo()
        expect(isDemoActive()).toBe(false)
        setDemoPhase('OVERVIEW')
        expect(isDemoActive()).toBe(true)
    })

    // ── 6. Reset ────────────────────────────────────────────────────────────

    it('resetDemo returns writable to IDLE with zeroed fields', () => {
        setDemoPhase('MAP')
        resetDemo()
        expect(demoStore().phase).toBe('IDLE')
        expect(demoStore().startTime).toBe(0)
        expect(demoStore().lastPhaseChangeAt).toBe(0)
    })

    it('resetDemo resets appState.demoPhase to IDLE', () => {
        setDemoPhase('RETURN')
        resetDemo()
        expect(_demoState.demoPhase).toBe('IDLE')
    })

    it('resetDemo resets the start guard so startDemo can be called again', () => {
        expect(startDemo()).toBe(true)
        expect(_demoState.demoPhase).toBe('OVERVIEW')

        expect(startDemo()).toBe(false)

        resetDemo()
        expect(startDemo()).toBe(true)
        expect(_demoState.demoPhase).toBe('OVERVIEW')
    })

    // ── 7. Storage helpers ──────────────────────────────────────────────────

    it('hasDemoBeenSeen returns false when localStorage key is absent', () => {
        if (typeof localStorage === 'undefined') {
            expect(hasDemoBeenSeen()).toBe(false)
            return
        }
        localStorage.removeItem(DEMO_LIFETIME_KEY)
        expect(hasDemoBeenSeen()).toBe(false)
    })

    it('hasDemoBeenSeen returns true when localStorage key is set', () => {
        if (typeof localStorage === 'undefined') return
        localStorage.setItem(DEMO_LIFETIME_KEY, '1')
        expect(hasDemoBeenSeen()).toBe(true)
    })

    it('isDemoSuppressedThisSession is driven by sessionStorage', () => {
        if (typeof sessionStorage === 'undefined') {
            expect(isDemoSuppressedThisSession()).toBe(false)
            return
        }
        sessionStorage.setItem(DEMO_SESSION_KEY, '1')
        expect(isDemoSuppressedThisSession()).toBe(true)
    })

    it('startDemo sets the sessionStorage suppression key', () => {
        if (typeof sessionStorage === 'undefined') return
        sessionStorage.removeItem(DEMO_SESSION_KEY)
        startDemo()
        expect(sessionStorage.getItem(DEMO_SESSION_KEY)).toBe('1')
    })

    it('startDemo does not lock the guard when sessionStorage throws', () => {
        if (typeof sessionStorage === 'undefined') return

        const original = globalThis.sessionStorage
        const mockStorage = {
            getItem: vi.fn(() => null),
            setItem: vi.fn<(key: string, value: string) => string | void>(() => {
                throw new Error('SecurityError')
            }),
            removeItem: vi.fn<(key: string) => void>(() => {}),
            clear: vi.fn(() => {})
        }

        try {
            Object.defineProperty(window, 'sessionStorage', {
                value: mockStorage,
                writable: true,
                configurable: true
            })
            ;(globalThis as Record<string, unknown>).sessionStorage = mockStorage

            const first = startDemo()
            expect(first).toBe(false)
            expect(_demoState.demoPhase).toBe('IDLE')

            mockStorage.setItem.mockImplementation(() => '1')
            mockStorage.removeItem(DEMO_SESSION_KEY)

            const second = startDemo()
            expect(second).toBe(true)
            expect(_demoState.demoPhase).toBe('OVERVIEW')
        } finally {
            Object.defineProperty(window, 'sessionStorage', {
                value: original,
                writable: true,
                configurable: true
            })
            ;(globalThis as Record<string, unknown>).sessionStorage = original
        }
    })

    // ── 8. Constants & misc helpers ─────────────────────────────────────────

    it('DEMO_TIMING exposes numeric durations', () => {
    expect(DEMO_TIMING.OVERVIEW_MS).toBeGreaterThan(0)
    expect(DEMO_TIMING.FOCUS_MS).toBeGreaterThan(0)
    })

    it('findDemoNode returns the first valid showcase node', () => {
        _demoState.points = [
            { name: 'okay', status: 'active' },
            { name: 'skip', status: 'disqualified' },
            { name: 'showcase', status: 'active' }
        ]
        expect(findDemoNode()).toBe(0)

        _demoState.points![0] = { name: 'skip', status: 'disqualified' }
        expect(findDemoNode()).toBe(2)
    })

    it('shouldRunDemo returns true when no guard is set', () => {
        expect(shouldRunDemo()).toBe(true)
    })

    it('shouldRunDemo honors nodemo and demo=force URL params', () => {
        history.pushState(null, '', '/?nodemo=1')
        expect(shouldRunDemo()).toBe(false)

        history.pushState(null, '', '/?demo=force')
        expect(shouldRunDemo()).toBe(true)
    })

    it('shouldRunDemo honors lifetime and session guards', () => {
        localStorage.setItem(DEMO_LIFETIME_KEY, '1')
        expect(shouldRunDemo()).toBe(false)
        localStorage.removeItem(DEMO_LIFETIME_KEY)

        sessionStorage.setItem(DEMO_SESSION_KEY, '1')
        expect(shouldRunDemo()).toBe(false)
    })

    it('scheduleDemoTimer removes fired timers from the active timer set', () => {
        vi.useFakeTimers()
        const callback = vi.fn()

        scheduleDemoTimer(callback, 25)
        expect(getActiveDemoTimerCount()).toBe(1)

        vi.advanceTimersByTime(25)
        expect(callback).toHaveBeenCalledTimes(1)
        expect(getActiveDemoTimerCount()).toBe(0)
    })

    it('demoNodeIndex returns null', () => {
        expect(demoNodeIndex()).toBeNull()
    })

    it('transitionDemo is an alias for setDemoPhase', () => {
        transitionDemo('TRAIL')
        expect(_demoState.demoPhase).toBe('TRAIL')
    })
})
