/**
 * T2#12 regression test — view-controller timer teardown
 *
 * Verifies that teardownViewController() clears all pending timers and is
 * idempotent, preventing orphaned timers from firing after HMR / unmount.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    teardownViewController,
    showViewHandoff,
    switchView,
    initViewControllerAdapter
} from '@lib/orchestration/view-controller'

const mockRefresh = vi.fn()

// Minimal nav store mock — switchView only reads navStore.currentView and
// writes via updateNavState, so a writable Svelte-style store is enough.
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

describe('view-controller timer teardown', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: false })
        installHandoff()
        document.body.classList.remove('view-transitioning')
        initViewControllerAdapter({ refreshCompositionState: mockRefresh })
    })

    afterEach(() => {
        teardownViewController()
        removeHandoff()
        vi.useRealTimers()
        mockRefresh.mockClear()
    })

    it('teardown clears all three timers so they never fire', () => {
        // Set all three timer sites in motion.
        switchView('map')
        // switchView('map') from galaxy triggers the terrain prelude path, so
        // _preludeTimer and _handoffDismissTimer are set. _viewTransitionTimer
        // is set only when the prelude completes and switchView is called again.
        // Fire the prelude timer to reach the non-prelude path.
        vi.advanceTimersByTime(430)
        // Now _viewTransitionTimer and a second _handoffDismissTimer exist.
        expect(document.body.classList.contains('view-transitioning')).toBe(true)

        teardownViewController()

        // Advancing time after teardown must not mutate DOM or body class.
        vi.advanceTimersByTime(5000)
        expect(document.body.classList.contains('view-transitioning')).toBe(false)
        const handoff = document.getElementById('view-handoff')
        expect(handoff?.classList.contains('active')).toBe(false)
    })

    it('teardown resets composition callback so subsequent refreshes are no-ops', () => {
        switchView('map')
        // Allow the prelude path to complete and trigger composition refresh.
        vi.advanceTimersByTime(430)
        // The prelude completion calls switchView('map') which calls _refreshCompositionState.
        expect(mockRefresh.mock.calls.length).toBeGreaterThanOrEqual(1)

        mockRefresh.mockClear()
        teardownViewController()

        // After teardown, a subsequent switchView must not invoke the original adapter.
        switchView('galaxy')
        expect(mockRefresh).not.toHaveBeenCalled()
    })

    it('teardown is idempotent', () => {
        switchView('map')
        vi.advanceTimersByTime(430)
        teardownViewController()
        expect(() => teardownViewController()).not.toThrow()
        expect(() => teardownViewController()).not.toThrow()
    })
})
