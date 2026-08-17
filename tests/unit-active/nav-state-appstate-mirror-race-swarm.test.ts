/**
 * nav-state-appstate-mirror-race-swarm.test.ts — Logfare swarm 2026-08-16 (K3 lane)
 *
 * Pins the navStore ↔ appState mirror ordering + Writable.set notification
 * semantics established by the 2026-08-16 navigation-state.svelte.ts
 * update/set rewrite. These are the race classes the rewrite closed:
 *
 *   1. Same-value navStore.set() still notifies subscribers — Writable.set
 *      contract. The canonical writeNavStateMirror path intentionally
 *      short-circuits no-op patches (no subscriber fan-out), so without the
 *      explicit navMirror.set(value) fallback a same-value .set() would
 *      silently swallow the notification. This test fails if that fallback
 *      is removed.
 *
 *   2. Changed navStore.set() notifies subscribers EXACTLY ONCE — the
 *      canonical path fires once via navMirror.update; the same-value
 *      fallback must NOT double-fire when the value actually changed.
 *
 *   3. During the subscriber callback of a CHANGED .set(), appState.navState
 *      already reflects the committed value — the canonical path applies
 *      Object.assign(appState.navState, patch) inside the mirror-update
 *      updater, which runs before _writable.set fans out to subscribers.
 *      A subscriber reading appState.navState mid-callback must never
 *      observe the previous snapshot.
 *
 *   4. navStore.update() with an in-place top-level mutation
 *      (state.currentView = 'map'; return state) must commit through the
 *      canonical path: draft isolation prevents pre-diff appState mutation,
 *      _lastCommittedView tracks, and exactly one VIEW_CHANGED publish fires.
 *      A same-value in-place reassert afterwards is a true no-op.
 *
 * Strategy: REAL appState (same pattern as state-mirror-drift-contract.test.ts)
 * so the test exercises the production mirror + createStateMirror + svelte
 * writable stack end-to-end. Only the event bus is mocked, to observe
 * VIEW_CHANGED publication. Deterministic: synchronous store notifications,
 * no timers, no network.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { NavState } from '@lib/types/state'

// ── Hoisted mocks (event bus only) ───────────────────────────────────────────
const mocks = vi.hoisted(() => ({
    publish: vi.fn()
}))

vi.mock('@lib/orchestration/event-bus', () => ({
    publish: (...args: unknown[]) => mocks.publish(...args),
    EVENTS: {
        VIEW_CHANGED: 'VIEW_CHANGED',
        TOOLTIP_HIDE_REQUESTED: 'TOOLTIP_HIDE_REQUESTED'
    },
    subscribe: vi.fn(() => () => {}),
    subscribeKeyed: vi.fn(() => () => {})
}))

// ── Imports after mocks — REAL appState, REAL mirror stack ───────────────────
import { appState } from '../../src/lib/state/app.svelte'
import {
    navStore,
    writeNavStateMirror,
    getLastCommittedView
} from '../../src/lib/stores/navigation.svelte'

// ── Constants / helpers ──────────────────────────────────────────────────────

const DEFAULT_NAV_STATE: NavState = {
    mode: 'overview',
    surface: 'idle',
    previousSurface: 'idle',
    focusedIndex: null,
    trailSeedIndex: null,
    trailNeighborIndices: [],
    trailCursor: -1,
    trailDepth: 0,
    walkHistoryIndices: [],
    lastTraversalReason: null,
    threadCandidates: [],
    threadReasonByIndex: new Map(),
    threadSource: '',
    focusPocketIndices: [],
    focusPocketMeta: null,
    focusPocketRoleByIndex: new Map(),
    focusFramingMeta: null,
    currentPersonality: null,
    neighborhoodIndices: [],
    explorationHistoryIndices: [],
    currentView: 'galaxy',
    myceliumMode: 'dormant',
    autoRotate: false,
    autoRotateSuspended: false,
    trailDepthFromExploration: 0,
    sceneRevealActive: false,
    sceneRevealStartedAt: 0,
    loadingPhaseKey: 'records',
    applyingUrlState: false,
    restoringBrowserHistory: false,
    urlStateRestoreToken: 0,
    activeStoryPrompt: null
}

const viewChangedCalls = () =>
    mocks.publish.mock.calls.filter((c: unknown[]) => c[0] === 'VIEW_CHANGED')

// ── Tests ────────────────────────────────────────────────────────────────────

describe('navStore ↔ appState mirror race semantics (logfare swarm 2026-08-16)', () => {
    beforeEach(() => {
        // Canonical reset — also re-baselines the DEV drift digest so a
        // prior test's mutations cannot leak into the next assertion.
        writeNavStateMirror({ ...DEFAULT_NAV_STATE })
        mocks.publish.mockClear()
    })

    afterEach(() => {
        // Leave the kernel at documented defaults for any subsequent file
        // sharing this environment.
        writeNavStateMirror({ ...DEFAULT_NAV_STATE })
        mocks.publish.mockClear()
    })

    it('same-value .set() still notifies subscribers (Writable.set contract)', () => {
        writeNavStateMirror({ currentView: 'map', mode: 'search' })
        const snapshot = navStore()

        let runs = 0
        const unsubscribe = navStore.subscribe(() => {
            runs++
        })
        // Svelte writable notifies once on subscribe (initial value).
        expect(runs).toBe(1)

        try {
            // New object, identical content: canonical path no-op
            // short-circuits; the store-level fallback must still fan out.
            navStore.set({ ...snapshot })
            expect(runs).toBe(2)
        } finally {
            unsubscribe()
        }
    })

    it('changed .set() notifies subscribers exactly once (no double-fire)', () => {
        let runs = 0
        const unsubscribe = navStore.subscribe(() => {
            runs++
        })
        expect(runs).toBe(1) // initial subscribe notification

        try {
            navStore.set({ ...navStore(), currentView: 'map' })
            expect(runs).toBe(2)
        } finally {
            unsubscribe()
        }
    })

    it('appState.navState is canonical before subscribers run on changed .set()', () => {
        const observedNavViews: string[] = []
        const observedFlatViews: string[] = []
        const unsubscribe = navStore.subscribe(() => {
            observedNavViews.push(appState.navState.currentView)
            observedFlatViews.push(appState.currentView)
        })
        try {
            navStore.set({ ...navStore(), currentView: 'map' })
        } finally {
            unsubscribe()
        }
        // Last entry = what the subscriber observed during the .set()
        // fan-out. Both the navState slice and the flat kernel alias must
        // already show the committed value mid-callback.
        expect(observedNavViews.at(-1)).toBe('map')
        expect(observedFlatViews.at(-1)).toBe('map')
        expect(appState.navState.currentView).toBe('map')
    })

    it('.update() with in-place top-level mutation commits via the canonical path', () => {
        navStore.update((s) => {
            s.currentView = 'map'
            return s
        })
        expect(navStore().currentView).toBe('map')
        // Flat alias mirrors too (writeNavStateMirror galaxy/map branch).
        expect(appState.currentView).toBe('map')
        // Canonical side effects fired: committed-view tracking + one publish.
        expect(getLastCommittedView()).toBe('map')
        const vc = viewChangedCalls()
        expect(vc.length).toBe(1)
        expect(vc[0][1]).toEqual(
            expect.objectContaining({ view: 'map', previousView: 'galaxy' })
        )
        // The canonical baseline must not flag its own write as drift: a
        // same-value in-place reassert now is a true no-op (no 2nd publish).
        mocks.publish.mockClear()
        navStore.update((s) => {
            s.currentView = 'map'
            return s
        })
        expect(viewChangedCalls().length).toBe(0)
    })
})
