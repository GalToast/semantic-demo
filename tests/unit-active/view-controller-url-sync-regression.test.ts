/**
 * Regression — switchView must publish EVENTS.URL_SYNC_REQUESTED on the typed
 * event bus, not dispatch an orphaned DOM CustomEvent.
 *
 * The live subscriber for URL sync lives in triggers.ts:
 *   subscribeKeyed('triggers.ts:URL_SYNC_REQUESTED', EVENTS.URL_SYNC_REQUESTED, ...)
 * which forwards { params, mode, reason } to updateUrlState(). view-controller
 * used to dispatch a window CustomEvent ('semantic:url-sync-requested') that
 * nothing in the codebase listens for, so view switches silently stopped
 * syncing the URL. Payload semantics are preserved exactly:
 * { params: {}, mode: 'push', reason: 'view' }.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { subscribe, EVENTS, clearAllSubscribers } from '@lib/orchestration/event-bus'
import { switchView, initViewControllerAdapter, teardownViewController } from '@lib/orchestration/view-controller'

// Same minimal nav store mock as view-controller-timer-teardown.test.ts —
// switchView only reads navStore.currentView and writes via updateNavState.
vi.mock('@lib/stores/navigation.svelte.ts', () => {
    let currentView: 'galaxy' | 'map' = 'galaxy'
    const subs = new Set<(v: { currentView: 'galaxy' | 'map' }) => void>()
    const store = {
        subscribe(fn: (v: { currentView: 'galaxy' | 'map' }) => void) {
            subs.add(fn)
            fn({ currentView })
            return () => subs.delete(fn)
        },
        set(value: 'galaxy' | 'map') {
            currentView = value
            subs.forEach((fn) => fn({ currentView }))
        }
    }
    return {
        navStore: store,
        updateNavState(patch: { currentView?: 'galaxy' | 'map' }) {
            if (patch.currentView) store.set(patch.currentView)
        },
        get: (s: typeof store) => ({ currentView: s === store ? currentView : undefined })
    }
})

vi.mock('@lib/engine/camera-controls', () => ({
    animateCameraToTerrainPrelude: vi.fn()
}))

vi.mock('@lib/utils/map-flattening-layout', () => ({
    applyMapFlatteningLayout: vi.fn()
}))

// Ensure a handoff element exists for showViewHandoff / hideViewHandoff.
function installHandoff() {
    if (document.getElementById('view-handoff')) return
    const el = document.createElement('div')
    el.id = 'view-handoff'
    ;['view-handoff-rune', 'view-handoff-kicker', 'view-handoff-title', 'view-handoff-note'].forEach((id) => {
        const child = document.createElement('div')
        child.id = id
        el.appendChild(child)
    })
    document.body.appendChild(el)
}

function removeHandoff() {
    const el = document.getElementById('view-handoff')
    if (el) el.remove()
}

describe('view-controller URL sync via typed event bus', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: false })
        clearAllSubscribers()
        installHandoff()
        initViewControllerAdapter({ refreshCompositionState: vi.fn() })
    })

    afterEach(() => {
        teardownViewController()
        removeHandoff()
        clearAllSubscribers()
        vi.useRealTimers()
    })

    it('switchView("galaxy") publishes EVENTS.URL_SYNC_REQUESTED with { params: {}, mode: "push", reason: "view" }', () => {
        const syncHandler = vi.fn<(payload: Record<string, unknown>) => void>()
        subscribe(EVENTS.URL_SYNC_REQUESTED, syncHandler)

        switchView('galaxy')

        expect(syncHandler).toHaveBeenCalledTimes(1)
        expect(syncHandler).toHaveBeenCalledWith({ params: {}, mode: 'push', reason: 'view' })
    })

    it('switchView("map", { skipTerrainPrelude: true }) also publishes URL_SYNC_REQUESTED', () => {
        const syncHandler = vi.fn<(payload: Record<string, unknown>) => void>()
        subscribe(EVENTS.URL_SYNC_REQUESTED, syncHandler)

        switchView('map', { skipTerrainPrelude: true })

        expect(syncHandler).toHaveBeenCalledTimes(1)
        expect(syncHandler).toHaveBeenCalledWith({ params: {}, mode: 'push', reason: 'view' })
    })

    it('skipUrlSync: true suppresses the publish', () => {
        const syncHandler = vi.fn<(payload: Record<string, unknown>) => void>()
        subscribe(EVENTS.URL_SYNC_REQUESTED, syncHandler)

        switchView('galaxy', { skipUrlSync: true })

        expect(syncHandler).not.toHaveBeenCalled()
    })

    it('does not dispatch the orphaned DOM CustomEvent "semantic:url-sync-requested"', () => {
        const domListener = vi.fn()
        window.addEventListener('semantic:url-sync-requested', domListener)
        subscribe(EVENTS.URL_SYNC_REQUESTED, vi.fn())

        switchView('galaxy')

        expect(domListener).not.toHaveBeenCalled()
        window.removeEventListener('semantic:url-sync-requested', domListener)
    })
})
