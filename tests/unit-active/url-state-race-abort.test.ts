/**
 * @vitest-environment jsdom
 *
 * url-state-race-abort.test.ts — regression tests for the applyUrlState
 * race protection added in:
 *   4346411b fix(url-state): abort previous runSearch when newer applyUrlState starts
 *   527ad540 fix(url-state): token-abort stale applyUrlState restores at await points
 *   0f3bb3c2 chore(url-state): remove dead initUrlStateSync
 *
 * Tests verify the CONTROLLER-ABORT path: when a newer applyUrlState
 * starts while an older one's runSearch is in flight, the older's signal
 * is aborted so runSearch rejects and the older doesn't write stale
 * results on top of the newer.
 *
 * Uses minimal mocks — only the dependencies the applyUrlState flow needs
 * (navStore, runSearch, searchStore, etc.). Existing harness in
 * url-state-mock-harness.test.ts covers the non-race shapes; this file
 * focuses on race/interaction patterns.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mutable mock state ────────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
    navStore: {
        urlStateRestoreToken: 0,
        applyingUrlState: false,
        restoringBrowserHistory: false
    } as Record<string, unknown>,
    appState: {} as Record<string, unknown>,
    runSearchCalls: [] as Array<{ query: string; signal: AbortSignal }>,
    runSearchRejectWith: undefined as unknown,
    runSearchResolveWith: undefined as unknown,
    // External resolvers for in-flight runSearch promises. The runSearch
    // mock sets these on each call so tests can drive completion.
    _resolveSearch: undefined as (() => void) | undefined,
    _rejectSearch: undefined as ((err: unknown) => void) | undefined,
    focusPocketImportCalls: 0,
    applyLocalNeighborhoodFocusCalls: [] as Array<number>,
    // URL ?q= parameter the mocked getSearchParams returns. Tests set this
    // before firing applyUrlState so the search-restore path is exercised.
    urlSearch: '' as string
}))

// ── Module mocks ─────────────────────────────────────────────────────────────

// Mock focus and journey stores — resetStateBeforeUrlRestore calls
// focusStore.update + journeyStore.update, which use the real
// writeNavStateMirror path. Mocking these stores keeps the test focused
// on the URL-restore race and avoids needing setters on every appState
// field.
vi.mock('@lib/stores/focus.svelte', () => ({
    focusStore: {
        update: (_fn: (s: Record<string, unknown>) => Record<string, unknown>) => {}
    },
    setSemanticDiveMode: (_v: unknown) => {}
}))

vi.mock('@lib/stores/journey.svelte', () => ({
    journeyStore: {
        update: (_fn: (s: Record<string, unknown>) => Record<string, unknown>) => {}
    },
    setJourneyPhase: (_v: unknown) => {},
    JOURNEY_COMPASS_PHASE_ORDER: ['overview'],
    JOURNEY_CONFIG: {},
    setTrailDepth: (_v: unknown) => {}
}))

// Mock lifecycle since url-state imports `resetExplorationFocus` from it.
// (lifecycle also re-exports setSemanticDiveMode etc.; mock it to keep
// appState setters from being needed.)
vi.mock('@lib/orchestration/lifecycle', () => ({
    resetExplorationFocus: () => {},
    refreshCompositionState: () => {}
}))

// Spread the real navigation module and override the symbols applyUrlState
// reads/writes for race protection. Other exports (setMyceliumMode, etc.)
// come from the real module so consumers like lifecycle.ts can still
// import what they need.
vi.mock('@lib/stores/navigation.svelte.ts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/stores/navigation.svelte.ts')>()
    return {
        ...actual,
        navStore: {
            subscribe: (fn: (v: unknown) => void) => {
                fn(mockState.navStore)
                return () => {}
            }
        },
        writeNavStateMirror: (patch: Record<string, unknown>) => {
            Object.assign(mockState.navStore, patch)
        },
        bumpUrlStateRestoreToken: () => {
            const next = (mockState.navStore.urlStateRestoreToken as number) + 1
            mockState.navStore.urlStateRestoreToken = next
            return next
        }
    }
})

// Minimal appState mock — applyUrlState reads `appState.navState.trailDepth` etc.
// in resetStateBeforeUrlRestore; provide the minimum shape.
vi.mock('@lib/state/app.svelte', () => ({
    appState: {
        get navState() {
            return { trailDepth: 0 }
        },
        get currentView() {
            return 'galaxy'
        },
        get semanticDiveMode() {
            return false
        },
        get myceliumMode() {
            return 'default'
        },
        set semanticDiveMode(_v: unknown) {},
        set myceliumMode(_v: unknown) {},
        get filterVersion() {
            return 0
        },
        get trailIndices() {
            return null
        },
        get viewportState() {
            // compass-controller.ts -> viewport.svelte.ts transitively reads
            // appState.viewportState.viewportWidth at module init via its
            // createStateMirror factory's computeFromAppState. Provide the
            // shape so the load doesn't throw.
            return {
                viewportWidth: 1920,
                viewportHeight: 1080,
                viewportDpr: 1,
                viewportReducedMotion: false,
                viewportIsCompact: false
            }
        }
    }
}))

// Controllable runSearch — returns a promise that resolves/rejects on
// demand via mockState.resolveSearch() / rejectSearch(). Captures the
// signal so tests can verify abort behavior.
vi.mock('@lib/stores/search.svelte', () => ({
    runSearch: (query: string, signal: AbortSignal) => {
        mockState.runSearchCalls.push({ query, signal })
        return new Promise((resolve, reject) => {
            // Reject if the signal aborts (the race we care about).
            signal.addEventListener('abort', () => {
                reject(new DOMException('aborted', 'AbortError'))
            })
            // Allow the test to drive completion.
            mockState._resolveSearch = () => resolve(undefined)
            mockState._rejectSearch = (err: unknown) => reject(err)
        })
    },
    clearSearch: () => {},
    searchStore: () => ({ query: '', summary: null, results: [] })
}))

vi.mock('@lib/journey/selected-card', () => ({
    updateSelectedBusiness: (_v: unknown) => {}
}))

vi.mock('@lib/orchestration/search-filter-core', () => ({
    applyFilters: (_v: unknown) => {}
}))

vi.mock('@lib/orchestration/cluster-filter-controller', () => ({
    syncFilterControls: () => {},
    restoreActiveClusterFilterFromUrl: (_v: unknown) => {}
}))

vi.mock('@lib/orchestration/toast', () => ({
    showExperienceToast: (_t: string, _m: string) => {},
    debugWarn: (_msg: string) => {}
}))

// Mock the dynamic import target for anchor restore. We DON'T make
// _restoreAnchorFromParams the test focus here; we only need it to not
// throw so the search path's race window can be exercised.
vi.mock('@lib/focus/pocket', () => ({
    applyLocalNeighborhoodFocus: (index: number) => {
        mockState.applyLocalNeighborhoodFocusCalls.push(index)
    }
}))

// Mock event-bus publish so SEARCH_FOCUS_REQUESTED doesn't fail.
vi.mock('@lib/orchestration/event-bus', () => ({
    publish: (_type: string, _payload: unknown) => {},
    EVENTS: {
        SEARCH_FOCUS_REQUESTED: 'search:search-focus-requested'
    },
    subscribe: (_type: string, _cb: (...args: unknown[]) => void) => () => {}
}))

// Mock URL search params helper — `getSearchParams` reads from mockState
// so tests can change the URL ?q= between applyUrlState calls.
vi.mock('@lib/orchestration/url-params', () => ({
    getSearchParams: () => new URLSearchParams(mockState.urlSearch),
    getLocationHref: () => `http://localhost/${mockState.urlSearch}`,
    getLocationPathname: () => '/',
    isDomForcedFocusSearchSurface: () => false
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('url-state — applyUrlState race protection', () => {
    beforeEach(() => {
        // Reset modules FIRST so the await import('@lib/orchestration/url-state')
        // below re-evaluates against THIS test's mocks. Without this, vitest
        // may serve the cached real module from a prior test file's import,
        // causing cross-test pollution in the full suite run.
        vi.resetModules()
        // Reset mock state (must come AFTER vi.resetModules; mockState is
        // hoisted so its identity persists across resetModules).
        mockState.navStore.urlStateRestoreToken = 0
        mockState.navStore.applyingUrlState = false
        mockState.navStore.restoringBrowserHistory = false
        mockState.runSearchCalls = []
        mockState.runSearchRejectWith = undefined
        mockState.runSearchResolveWith = undefined
        mockState.focusPocketImportCalls = 0
        mockState.applyLocalNeighborhoodFocusCalls = []
        mockState.urlSearch = ''
        mockState._resolveSearch = undefined
        mockState._rejectSearch = undefined
        // Reset URL bar so getSearchParams() reads cleanly between tests.
        if (typeof window !== 'undefined') {
            window.history.replaceState({}, '', '/')
        }
    })

    it('aborts the previous runSearch signal when a newer applyUrlState starts', async () => {
        const { applyUrlState } = await import('@lib/orchestration/url-state')

        // Fire applyUrlState #1 with ?q=foo. It will start and await runSearch.
        // getSearchParams() reads window.location.search directly, so we set
        // the URL bar to drive the restore path.
        mockState.urlSearch = '?q=foo'
        window.history.replaceState({}, '', '/?q=foo')
        let p1Err: unknown = null
        const p1 = applyUrlState({}).catch((e) => {
            p1Err = e
        })
        // Wait a microtask so runSearch gets called and the signal is captured.
        await new Promise((r) => setTimeout(r, 0))

        if (p1Err) {
            console.error('p1 errored:', p1Err)
        }
        // URL_A's runSearch should have been called once with a live signal.
        expect(mockState.runSearchCalls).toHaveLength(1)
        expect(mockState.runSearchCalls[0].query).toBe('foo')
        expect(mockState.runSearchCalls[0].signal.aborted).toBe(false)

        // Fire applyUrlState #2 with ?q=bar. This MUST abort URL_A's signal.
        // We don't await p2 — we just need it to start, bump the token, and
        // abort the previous controller. URL_B itself will hang on its own
        // runSearch (we leave it pending).
        mockState.urlSearch = '?q=bar'
        window.history.replaceState({}, '', '/?q=bar')
        const p2 = applyUrlState({})
        await new Promise((r) => setTimeout(r, 0))

        // URL_A's runSearch signal should now be aborted.
        expect(mockState.runSearchCalls[0].signal.aborted).toBe(true)

        // URL_B's runSearch should have started with a fresh, non-aborted signal.
        expect(mockState.runSearchCalls).toHaveLength(2)
        expect(mockState.runSearchCalls[1].query).toBe('bar')
        expect(mockState.runSearchCalls[1].signal.aborted).toBe(false)

        // The token should have been bumped twice (once per applyUrlState entry).
        expect(mockState.navStore.urlStateRestoreToken).toBe(2)

        // Clean up: reject both in-flight runSearch promises (URL_A is
        // already aborted; URL_B is still pending). This lets applyUrlState
        // resolve cleanly without leaving dangling promises.
        mockState._rejectSearch?.(new Error('cleanup-url-a'))
        mockState._rejectSearch?.(new Error('cleanup-url-b'))
        await p1
        await p2
    }, 10000)

    it('the previous applyUrlState bails via the catch path when its runSearch is aborted', async () => {
        const { applyUrlState } = await import('@lib/orchestration/url-state')

        mockState.urlSearch = '?q=foo'
        window.history.replaceState({}, '', '/?q=foo')
        const p1 = applyUrlState({})
        await new Promise((r) => setTimeout(r, 0))
        expect(mockState.runSearchCalls).toHaveLength(1)

        // Start URL_B — this aborts URL_A's signal.
        mockState.urlSearch = '?q=bar'
        window.history.replaceState({}, '', '/?q=bar')
        const p2 = applyUrlState({})
        await new Promise((r) => setTimeout(r, 0))

        // URL_A's runSearch was aborted, so p1 should resolve (catch path
        // swallows the AbortError as a debugWarn). Wait for it.
        await p1

        // URL_A should NOT have done post-runSearch writes (publishing
        // SEARCH_FOCUS_REQUESTED, mutating DOM input). We didn't add a
        // mock for SEARCH_FOCUS_REQUESTED observable side-effects beyond
        // the publish spy, so the cleanest assertion is: p1 resolved
        // without throwing, and the abort was the cause.
        expect(mockState.runSearchCalls[0].signal.aborted).toBe(true)

        // Cleanup URL_B
        mockState._rejectSearch?.(new Error('cleanup-url-b'))
        await p2
    }, 10000)

    it('singleton-style: a single applyUrlState (no race) completes its runSearch normally', async () => {
        const { applyUrlState } = await import('@lib/orchestration/url-state')

        // Single fire — should NOT be aborted.
        mockState.urlSearch = '?q=baz'
        window.history.replaceState({}, '', '/?q=baz')
        const p = applyUrlState({})
        await new Promise((r) => setTimeout(r, 0))
        expect(mockState.runSearchCalls).toHaveLength(1)
        expect(mockState.runSearchCalls[0].signal.aborted).toBe(false)

        // Resolve by rejecting (cleanup pattern; we don't care about the
        // post-runSearch writes in this test).
        mockState._rejectSearch?.(new Error('done'))
        await p
    }, 10000)
})
