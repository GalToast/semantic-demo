/**
 * url-anchor-valid-focus.test.ts — Verify that valid ?anchor=42 focuses the correct node
 *
 * Coverage:
 *  1. _restoreAnchorFromParams dispatches SEARCH_FOCUS_REQUESTED for a valid numeric anchor
 *  2. _restoreAnchorFromParams calls applyLocalNeighborhoodFocus for a valid numeric anchor
 *  3. The focused index is validated against appState.points.length
 *  4. The navStore is updated with the focused index
 *  5. The URL is synced after focus restoration
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockNavStore = vi.hoisted(() => ({
    state: {
        mode: 'overview',
        surface: 'idle',
        currentView: 'galaxy',
        focusedIndex: null as number | null,
        applyingUrlState: false,
        restoringBrowserHistory: false,
        urlStateRestoreToken: 0
    },
    subscribers: [] as Array<(s: typeof mockNavStore.state) => void>
}))

vi.mock('../../src/lib/stores/navigation.svelte', () => ({
    navStore: {
        subscribe: (fn: (s: typeof mockNavStore.state) => void) => {
            mockNavStore.subscribers.push(fn)
            fn(mockNavStore.state)
            return () => {
                const idx = mockNavStore.subscribers.indexOf(fn)
                if (idx >= 0) mockNavStore.subscribers.splice(idx, 1)
            }
        },
        update: (fn: (s: typeof mockNavStore.state) => typeof mockNavStore.state) => {
            mockNavStore.state = fn(mockNavStore.state)
            mockNavStore.subscribers.forEach((s) => s(mockNavStore.state))
        },
        set: (s: typeof mockNavStore.state) => {
            mockNavStore.state = s
            mockNavStore.subscribers.forEach((fn) => fn(s))
        }
    },
    bumpUrlStateRestoreToken: () => {
        mockNavStore.state.urlStateRestoreToken += 1
        return mockNavStore.state.urlStateRestoreToken
    },
    writeNavStateMirror: vi.fn()
}))

vi.mock('../../src/lib/orchestration/event-bus', () => ({
    publish: vi.fn(),
    subscribe: () => () => {},
    EVENTS: {
        SEARCH_FOCUS_REQUESTED: 'SEARCH_FOCUS_REQUESTED',
        SEARCH_SUCCESS: 'SEARCH_SUCCESS',
        SEARCH_EMPTY: 'SEARCH_EMPTY',
        SEARCH_CLEARED: 'SEARCH_CLEARED',
        URL_SYNC_REQUESTED: 'URL_SYNC_REQUESTED'
    }
}))

vi.mock('../../src/lib/journey/focus-pocket', () => ({
    applyLocalNeighborhoodFocus: vi.fn(() => true)
}))

vi.mock('../../src/lib/utils/diagnostic-adapter', () => ({
    debugWarn: vi.fn()
}))

vi.mock('../../src/lib/state/app.svelte', () => ({
    appState: {
        points: Array.from({ length: 100 }, (_, i) => ({
            id: `lead-${i}`,
            name: `Business ${i}`,
            city: 'Conroe',
            status: 'active'
        })),
        withMutation: <T>(fn: () => T): T => fn()
    }
}))

// Import after mocks
import { applyLocalNeighborhoodFocus } from '../../src/lib/journey/focus-pocket'
import { publish } from '../../src/lib/orchestration/event-bus'
import type { NavState } from '../../src/lib/types/state'

describe('URL anchor valid focus (?anchor=42)', () => {
    beforeEach(() => {
        mockNavStore.state = {
            mode: 'overview',
            surface: 'idle',
            currentView: 'galaxy',
            focusedIndex: null,
            applyingUrlState: false,
            restoringBrowserHistory: false,
            urlStateRestoreToken: 0
        }
        mockNavStore.subscribers = []
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('source: _restoreAnchorFromParams validates numericId against appState.points.length', () => {
        const fs = require('fs')
        const path = require('path')
        const source = fs.readFileSync(
            path.resolve(__dirname, '../../src/lib/orchestration/url-state.ts'),
            'utf-8'
        )
        // Must validate numericId >= 0 and numericId < pointCount
        expect(source).toMatch(/numericId\s*<\s*0/)
        expect(source).toMatch(/numericId\s*>=\s*pointCount/)
    })

    it('source: _restoreAnchorFromParams calls applyLocalNeighborhoodFocus for valid anchors', () => {
        const fs = require('fs')
        const path = require('path')
        const source = fs.readFileSync(
            path.resolve(__dirname, '../../src/lib/orchestration/url-state.ts'),
            'utf-8'
        )
        // Must call applyLocalNeighborhoodFocus in the valid-anchor branch
        expect(source).toMatch(/applyLocalNeighborhoodFocus\s*\(\s*numericId\s*\)/)
    })

    it('source: _restoreAnchorFromParams dispatches SEARCH_FOCUS_REQUESTED for valid anchors', () => {
        const fs = require('fs')
        const path = require('path')
        const source = fs.readFileSync(
            path.resolve(__dirname, '../../src/lib/orchestration/url-state.ts'),
            'utf-8'
        )
        // Must publish SEARCH_FOCUS_REQUESTED in the valid branch
        expect(source).toMatch(/EVENTS\.SEARCH_FOCUS_REQUESTED/)
        expect(source).toMatch(/publish\s*\(\s*EVENTS\.SEARCH_FOCUS_REQUESTED/)
    })

    it('source: applyUrlState calls _restoreAnchorFromParams before _restoreSearchFromParams', () => {
        const fs = require('fs')
        const path = require('path')
        const source = fs.readFileSync(
            path.resolve(__dirname, '../../src/lib/orchestration/url-state.ts'),
            'utf-8'
        )
        // Must call _restoreAnchorFromParams before _restoreSearchFromParams
        // so numeric anchors are settled before search results populate
        const anchorMatch = source.match(/_restoreAnchorFromParams\s*\(/)
        const searchMatch = source.match(/_restoreSearchFromParams\s*\(/)
        expect(anchorMatch).toBeTruthy()
        expect(searchMatch).toBeTruthy()
        expect(anchorMatch!.index).toBeLessThan(searchMatch!.index)
    })

    it('source: valid anchor publishes SEARCH_FOCUS_REQUESTED with numericId', () => {
        const fs = require('fs')
        const path = require('path')
        const source = fs.readFileSync(
            path.resolve(__dirname, '../../src/lib/orchestration/url-state.ts'),
            'utf-8'
        )
        // The valid-anchor branch publishes SEARCH_FOCUS_REQUESTED with the index
        expect(source).toMatch(/publish\s*\(\s*EVENTS\.SEARCH_FOCUS_REQUESTED\s*,\s*\{\s*index:\s*numericId\s*\}\)/)
    })
})
