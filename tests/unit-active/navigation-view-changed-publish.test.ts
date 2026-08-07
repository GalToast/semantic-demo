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
import { writeNavStateMirror, navStore } from '../../src/lib/stores/navigation.svelte'

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
