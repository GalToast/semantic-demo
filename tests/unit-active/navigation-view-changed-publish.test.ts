/**
 * navigation-view-changed-publish.test.ts — W49-F
 *
 * Locks in the contract for `writeNavStateMirror` (the canonical nav-store
 * mutation path) and `setLegacyView` (in MapView.svelte, the legacy
 * direct-mutation path). Both must publish `EVENTS.VIEW_CHANGED` when
 * `currentView` actually transitions:
 *
 *   1. `writeNavStateMirror({ currentView: 'map' })` when previous was
 *      `'galaxy'`  →  fires VIEW_CHANGED with { view:'map', previousView:'galaxy' }
 *   2. `writeNavStateMirror({ currentView: 'galaxy' })` when previous was
 *      `'map'`    →  fires VIEW_CHANGED with the inverse payload
 *   3. `writeNavStateMirror({ currentView: 'map' })` when previous was
 *      ALSO `'map'` (no-op match)  →  does NOT fire (avoid loop)
 *   4. `writeNavStateMirror({ focusedIndex: 5 })` (no currentView change)  →
 *      does NOT fire VIEW_CHANGED
 *   5. `setLegacyView('map')` in MapView  →  fires VIEW_CHANGED too,
 *      because that path bypasses writeNavStateMirror and would
 *      otherwise skip the event.
 *
 * Before W49-F, both `writeNavStateMirror` and `setLegacyView` updated
 * currentView but never published VIEW_CHANGED. The 9 subscribers
 * (focus-ui, semantic-dive, selected-card, route-trace, map-state,
 * legend-ui, legend-panel, cluster-labels, engine lifecycle)
 * had been silently waiting on an event that never fired.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

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

// Import AFTER mocks are in scope so the navigation store sees them.
import { writeNavStateMirror, navStore, getLastCommittedView } from '../../src/lib/stores/navigation.svelte'
import { appState } from '../../src/lib/state/app.svelte'

const publishSpy = mocks.publish

const viewChangedCall = () =>
    publishSpy.mock.calls.find((c: unknown[]) => c[0] === 'VIEW_CHANGED') as unknown[] | undefined

const viewChangedPayload = () => {
    const call = viewChangedCall()
    return call?.[1] as Record<string, unknown> | undefined
}

describe('writeNavStateMirror VIEW_CHANGED publish (W49-F)', () => {
    beforeEach(() => {
        publishSpy.mockClear()
        // Reset nav state to galaxy
        writeNavStateMirror({ currentView: 'galaxy' })
        publishSpy.mockClear() // ignore the trailing galaxy→galaxy reset publish
    })

    it('publishes VIEW_CHANGED when currentView transitions galaxy → map', () => {
        writeNavStateMirror({ currentView: 'map' })
        const payload = viewChangedPayload()
        expect(payload).toEqual(
            expect.objectContaining({
                view: 'map',
                previousView: 'galaxy'
            })
        )
        expect(navStore().currentView).toBe('map')
    })

    it('publishes VIEW_CHANGED when currentView transitions map → galaxy', () => {
        writeNavStateMirror({ currentView: 'map' })
        publishSpy.mockClear()
        writeNavStateMirror({ currentView: 'galaxy' })
        const payload = viewChangedPayload()
        expect(payload).toEqual(
            expect.objectContaining({
                view: 'galaxy',
                previousView: 'map'
            })
        )
    })

    it('does NOT publish VIEW_CHANGED on a same-value reassertion (no-op detection)', () => {
        writeNavStateMirror({ currentView: 'map' })
        publishSpy.mockClear()
        // Re-assert the same view — should short-circuit on the noop
        // detection (which writeNavStateMirror already had) and never
        // reach our publish.
        writeNavStateMirror({ currentView: 'map' })
        expect(viewChangedCall()).toBeUndefined()
    })

    it('does NOT publish VIEW_CHANGED when only non-currentView fields change', () => {
        // Bump the view once for a known baseline.
        writeNavStateMirror({ currentView: 'map' })
        publishSpy.mockClear()
        // Change other fields — must not flood subscribers with stale
        // "currentView changed" notifications.
        writeNavStateMirror({ focusedIndex: 7 })
        writeNavStateMirror({ mode: 'focus' })
        writeNavStateMirror({ trailDepth: 2 })
        expect(viewChangedCall()).toBeUndefined()
    })

    it('payload includes myceliumMode when set on appState', () => {
        // writeNavStateMirror reads appState.myceliumMode at publish time.
        // We don't have the full appState harness here — but we can assert
        // that the payload's myceliumMode field is either a string or
        // undefined (in case the harness provides no default).
        writeNavStateMirror({ currentView: 'map' })
        const payload = viewChangedPayload() ?? {}
        expect('myceliumMode' in payload).toBe(true)
        expect(['string', 'undefined']).toContain(typeof payload.myceliumMode)
    })

    it('publishes exactly once per real transition (no duplicate publishes)', () => {
        writeNavStateMirror({ currentView: 'map' })
        expect(viewChangedCall()).toBeDefined()
        const firstPublishCount = publishSpy.mock.calls.filter(
            (c: unknown[]) => c[0] === 'VIEW_CHANGED'
        ).length
        expect(firstPublishCount).toBe(1)
    })
})

// ─────────────────────────────────────────────────────────────────────────
// navStore.update: regression coverage for the canonical-mirror delegation fix.
// Before the fix, navStore.update bypassed writeNavStateMirror entirely, so
// VIEW_CHANGED never fired and _lastCommittedView was never tracked.
// ─────────────────────────────────────────────────────────────────────────
describe('navStore.update VIEW_CHANGED publish (nav-mirror update fix)', () => {
    beforeEach(() => {
        publishSpy.mockClear()
        // Reset nav state to galaxy via writeNavStateMirror so the drift
        // baseline is clean before each test.
        writeNavStateMirror({ currentView: 'galaxy' })
        publishSpy.mockClear()
    })

    it('publishes VIEW_CHANGED when currentView transitions galaxy → map via .update()', () => {
        navStore.update((s) => ({ ...s, currentView: 'map' }))
        const payload = viewChangedPayload()
        expect(payload).toEqual(
            expect.objectContaining({
                view: 'map',
                previousView: 'galaxy'
            })
        )
        expect(navStore().currentView).toBe('map')
    })

    it('publishes VIEW_CHANGED when currentView transitions map → galaxy via .update()', () => {
        navStore.update((s) => ({ ...s, currentView: 'map' }))
        publishSpy.mockClear()
        navStore.update((s) => ({ ...s, currentView: 'galaxy' }))
        const payload = viewChangedPayload()
        expect(payload).toEqual(
            expect.objectContaining({
                view: 'galaxy',
                previousView: 'map'
            })
        )
    })

    it('does NOT publish VIEW_CHANGED on a same-value .update() reassertion', () => {
        navStore.update((s) => ({ ...s, currentView: 'map' }))
        publishSpy.mockClear()
        navStore.update((s) => ({ ...s, currentView: 'map' }))
        expect(viewChangedCall()).toBeUndefined()
    })

    it('does NOT publish VIEW_CHANGED when only non-view fields change via .update()', () => {
        navStore.update((s) => ({ ...s, currentView: 'map' }))
        publishSpy.mockClear()
        navStore.update((s) => ({ ...s, focusedIndex: 7, mode: 'focus', trailDepth: 2 }))
        expect(viewChangedCall()).toBeUndefined()
    })

    it('.update() commits non-view fields correctly', () => {
        navStore.update((s) => ({ ...s, focusedIndex: 42, mode: 'focus', surface: 'focus' }))
        expect(navStore().focusedIndex).toBe(42)
        expect(navStore().mode).toBe('focus')
        expect(navStore().surface).toBe('focus')
        expect(navStore().currentView).toBe('galaxy') // unchanged
    })

    it('.update() commits view field correctly', () => {
        navStore.update((s) => ({ ...s, currentView: 'map' }))
        expect(navStore().currentView).toBe('map')
    })

    it('.update() protects the canonical state from an in-place top-level updater', () => {
        navStore.update((s) => {
            s.currentView = 'map'
            return s
        })
        expect(viewChangedPayload()).toEqual(
            expect.objectContaining({
                view: 'map',
                previousView: 'galaxy'
            })
        )
        expect(navStore().currentView).toBe('map')
    })

    it('.set() synchronizes appState before notifying subscribers', () => {
        const observedViews: Array<'galaxy' | 'map'> = []
        const unsubscribe = navStore.subscribe(() => {
            observedViews.push(appState.navState.currentView)
        })
        try {
            navStore.set({ ...navStore(), currentView: 'map' })
        } finally {
            unsubscribe()
        }
        expect(observedViews.at(-1)).toBe('map')
        expect(appState.navState.currentView).toBe('map')
    })

    it('tracks _lastCommittedView through .update() (regression vs bypass)', () => {
        // getLastCommittedView is exported and must reflect the last view
        // committed via the canonical path — both writeNavStateMirror and
        // navStore.update route there now.
        navStore.update((s) => ({ ...s, currentView: 'map' }))
        expect(getLastCommittedView()).toBe('map')
        navStore.update((s) => ({ ...s, currentView: 'galaxy' }))
        expect(getLastCommittedView()).toBe('galaxy')
    })
})

// ─────────────────────────────────────────────────────────────────────────
// MapView setLegacyView: bypass path that must also publish.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('MapView setLegacyView publishes VIEW_CHANGED (W49-F)', () => {
    it('MapView.svelte setLegacyView routes through writeNavStateMirror', () => {
        // Source inspection: setLegacyView must route through the canonical
        // writeNavStateMirror funnel (cbc770bb refactor). writeNavStateMirror
        // handles VIEW_CHANGED publish (tested in the describe block above),
        // so setLegacyView does NOT need its own publish call anymore.
        // We assert on the source because the import path of MapView.svelte
        // pulls in Leaflet which is heavy to import in the test runtime.
        const src = readFileSync(
            resolve(__dirname, '../../src/components/MapView.svelte'),
            'utf-8'
        )
        // The function body now routes through writeNavStateMirror (the
        // canonical single-writer path) instead of directly mutating
        // appState.currentView (cbc770bb refactor).
        expect(src).toMatch(/function setLegacyView[^{]*\{[\s\S]*writeNavStateMirror\(\{\s*currentView:\s*view/)
        // MapView still imports publish/EVENTS for TOOLTIP_HIDE_REQUESTED
        expect(src).toContain('publish')
        expect(src).toContain('EVENTS')
    })
})
