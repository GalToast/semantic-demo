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
    urlSearch: '' as string,
    // Search status the mocked searchStore reports. Tests set this to
    // 'searching' to simulate the stuck state a swallowed AbortError leaves
    // behind when the 30s restore deadline expires.
    searchStatus: 'idle' as string,
    // Records setSearchError calls so tests can assert the deadline settles
    // the global search state through the established error path.
    setSearchErrorCalls: [] as Array<{ query: string; err: unknown; type: unknown }>,
    // When true, the runSearch mock RESOLVES on abort instead of rejecting
    // (simulating runSearch swallowing the AbortError internally).
    runSearchSwallowAbort: false,
    // Records publish calls so tests can assert no post-restore focus writes
    // happen after a timeout.
    publishCalls: [] as Array<{ type: string; payload: unknown }>
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
        // Used by the record→anchor mapping and the anchor range check.
        points: Array.from({ length: 100 }, (_, i) => ({ lead_id: String(i), name: `Biz ${i}` })),
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
            // Reject if the signal aborts (the race we care about) — unless
            // the test simulates runSearch swallowing the AbortError, in
            // which case resolve instead.
            signal.addEventListener('abort', () => {
                if (mockState.runSearchSwallowAbort) {
                    resolve(undefined)
                } else {
                    reject(new DOMException('aborted', 'AbortError'))
                }
            })
            // Allow the test to drive completion.
            mockState._resolveSearch = () => resolve(undefined)
            mockState._rejectSearch = (err: unknown) => reject(err)
        })
    },
    clearSearch: () => {},
    searchStore: () => ({ status: mockState.searchStatus, query: '', summary: null, results: [] }),
    setSearchError: (query: string, err: unknown, type: unknown) => {
        mockState.setSearchErrorCalls.push({ query, err, type })
    }
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

// Mock event-bus publish so SEARCH_FOCUS_REQUESTED doesn't fail. publish
// records into mockState.publishCalls so tests can assert the restore does
// (or does not) dispatch focus events.
vi.mock('@lib/orchestration/event-bus', () => ({
    publish: (type: string, payload: unknown) => {
        mockState.publishCalls.push({ type, payload })
    },
    EVENTS: {
        SEARCH_FOCUS_REQUESTED: 'search:search-focus-requested',
        SEARCH_SUCCESS: 'search:success',
        SEARCH_EMPTY: 'search:empty',
        SEARCH_CLEARED: 'search:cleared',
        STATE_RESET: 'state:reset'
    },
    subscribe: (_type: string, _cb: (...args: unknown[]) => void) => () => {},
    subscribeKeyed: (_key: string, _event: string, _cb: (...args: unknown[]) => void) => () => {}
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

// Shared reset for every describe in this file (race/abort, restore
// deadline, and story composition). Module mocks must be reset BEFORE each
// test; mockState is hoisted so its identity survives vi.resetModules().
function resetMockState(): void {
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
    mockState.searchStatus = 'idle'
    mockState.setSearchErrorCalls = []
    mockState.runSearchSwallowAbort = false
    mockState.publishCalls = []
    // Reset URL bar so getSearchParams() reads cleanly between tests.
    if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/')
    }
}

describe('url-state — applyUrlState race protection', () => {
    beforeEach(() => {
        resetMockState()
    })

    afterEach(() => {
        // Restore AbortSignal.timeout spies created by the deadline tests.
        vi.restoreAllMocks()
    })

    it('does not reset an interaction when the URL only has boot flags', async () => {
        const { applyUrlState } = await import('@lib/orchestration/url-state')

        // app-init invokes the restore after data settles. A user can select
        // Search before that deferred call runs, so boot-only params must not
        // send the navigation state back to overview.
        mockState.navStore.mode = 'search'
        mockState.navStore.surface = 'search'
        mockState.urlSearch = '?nodemo=1&staticDev=1&mode=dormant'

        await applyUrlState({})

        expect(mockState.navStore.mode).toBe('search')
        expect(mockState.navStore.surface).toBe('search')
        expect(mockState.navStore.urlStateRestoreToken).toBe(0)
    }, 90000)

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
    }, 60000)

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
    }, 60000)

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
    }, 60000)
})

describe('url-state — 30s restore deadline settles hung searches (timeout, not supersession)', () => {
    beforeEach(() => {
        resetMockState()
    })

    afterEach(() => {
        // Restore AbortSignal.timeout spies created by the deadline tests.
        vi.restoreAllMocks()
    })

    /**
     * Fire a ?q= restore whose runSearch never settles, then expire the
     * 30s deadline by aborting the AbortSignal.timeout() signal the
     * production code composes. AbortSignal.timeout is replaced with a
     * controllable controller so the test does not wait 30 real seconds.
     */
    async function startHungRestore(): Promise<{ timeoutCtrl: AbortController; p: Promise<void> }> {
        const timeoutCtrl = new AbortController()
        vi.spyOn(AbortSignal, 'timeout').mockImplementation((_ms: number) => timeoutCtrl.signal)
        mockState.urlSearch = '?q=coffee'
        window.history.replaceState({}, '', '/?q=coffee')
        const { applyUrlState } = await import('@lib/orchestration/url-state')
        const p = applyUrlState({})
        await new Promise((r) => setTimeout(r, 0))
        expect(mockState.runSearchCalls).toHaveLength(1)
        expect(mockState.runSearchCalls[0].query).toBe('coffee')
        expect(mockState.runSearchCalls[0].signal.aborted).toBe(false)
        return { timeoutCtrl, p }
    }

    it('settles the global search state via the error path when the 30s deadline expires (hung runSearch)', async () => {
        // Simulate runSearch leaving the store stuck at 'searching' (the
        // state a swallowed AbortError leaves behind).
        mockState.searchStatus = 'searching'
        const input = document.createElement('input')
        input.id = 'search-input'
        input.value = 'sentinel'
        document.body.appendChild(input)

        const { timeoutCtrl, p } = await startHungRestore()

        // The restore deadline expires while runSearch is still pending.
        timeoutCtrl.abort(new DOMException('The operation timed out.', 'TimeoutError'))
        await p

        // 1. Settled through the established error path — NOT stuck at
        //    'searching' forever.
        expect(mockState.setSearchErrorCalls).toHaveLength(1)
        expect(mockState.setSearchErrorCalls[0].query).toBe('coffee')
        expect(mockState.setSearchErrorCalls[0].err).toBeInstanceOf(DOMException)
        expect((mockState.setSearchErrorCalls[0].err as DOMException).name).toBe('TimeoutError')
        expect(mockState.setSearchErrorCalls[0].type).toBe('full')

        // 2. The restore promise must NOT continue as if results were
        //    restored: no input hydration, no focus dispatch, no pocket.
        expect(input.value).toBe('sentinel')
        expect(mockState.publishCalls.filter((c) => c.type === 'search:search-focus-requested')).toHaveLength(0)
        expect(mockState.applyLocalNeighborhoodFocusCalls).toHaveLength(0)

        document.body.removeChild(input)
    }, 60000)

    it('settles the search state even when runSearch swallows the deadline abort and resolves', async () => {
        // runSearch's real internal catch treats AbortError as a silent
        // return: it resolves without settling, leaving status 'searching'.
        mockState.searchStatus = 'searching'
        mockState.runSearchSwallowAbort = true
        const input = document.createElement('input')
        input.id = 'search-input'
        input.value = 'sentinel'
        document.body.appendChild(input)

        const { timeoutCtrl, p } = await startHungRestore()

        timeoutCtrl.abort(new DOMException('The operation timed out.', 'TimeoutError'))
        await p

        expect(mockState.setSearchErrorCalls).toHaveLength(1)
        expect(mockState.setSearchErrorCalls[0].query).toBe('coffee')
        expect(input.value).toBe('sentinel')
        expect(mockState.publishCalls.filter((c) => c.type === 'search:search-focus-requested')).toHaveLength(0)
        expect(mockState.applyLocalNeighborhoodFocusCalls).toHaveLength(0)

        document.body.removeChild(input)
    }, 60000)

    it('does NOT clobber a near-miss settle with a timeout error when results already landed', async () => {
        // Results landed before the deadline: runSearch settled to 'results'.
        mockState.searchStatus = 'results'
        const { timeoutCtrl, p } = await startHungRestore()

        timeoutCtrl.abort(new DOMException('The operation timed out.', 'TimeoutError'))
        await p

        // A settled search must not be overwritten by the timeout error.
        expect(mockState.setSearchErrorCalls).toHaveLength(0)
    }, 60000)

    it('caller supersession abort stays silent — no error settle, no restore writes', async () => {
        const { applyUrlState } = await import('@lib/orchestration/url-state')

        mockState.urlSearch = '?q=foo'
        window.history.replaceState({}, '', '/?q=foo')
        const p1 = applyUrlState({})
        await new Promise((r) => setTimeout(r, 0))
        expect(mockState.runSearchCalls).toHaveLength(1)

        // URL_B supersedes URL_A: URL_A's restore controller aborts.
        mockState.urlSearch = '?q=bar'
        window.history.replaceState({}, '', '/?q=bar')
        const p2 = applyUrlState({})
        await new Promise((r) => setTimeout(r, 0))

        // URL_A resolves silently via the abort path.
        await p1
        expect(mockState.runSearchCalls[0].signal.aborted).toBe(true)
        // Intentional supersession must NOT surface as a search error.
        expect(mockState.setSearchErrorCalls).toHaveLength(0)

        mockState._rejectSearch?.(new Error('cleanup-url-b'))
        await p2
    }, 60000)
})

describe('url-state — story param composes with the rest of the URL restore (no early return)', () => {
    beforeEach(() => {
        resetMockState()
    })

    afterEach(() => {
        // Restore AbortSignal.timeout spies created by the deadline tests.
        vi.restoreAllMocks()
    })

    it('?story=...&q=... restores the story AND runs the search restore', async () => {
        const { applyUrlState } = await import('@lib/orchestration/url-state')

        mockState.urlSearch = '?story=welcome&q=coffee'
        window.history.replaceState({}, '', '/?story=welcome&q=coffee')
        const p = applyUrlState({})
        await new Promise((r) => setTimeout(r, 0))

        // Story state applied...
        expect(mockState.navStore.activeStoryPrompt).toBe('welcome')
        // ...AND the search restore ran. Before the fix, the story branch
        // returned early and the ?q= was silently dropped.
        expect(mockState.runSearchCalls).toHaveLength(1)
        expect(mockState.runSearchCalls[0].query).toBe('coffee')
        expect(mockState.runSearchCalls[0].signal.aborted).toBe(false)

        mockState._rejectSearch?.(new Error('done'))
        await p
    }, 60000)

    it('?story=...&anchor=... restores the story AND the anchor focus', async () => {
        const { applyUrlState } = await import('@lib/orchestration/url-state')

        mockState.urlSearch = '?story=welcome&anchor=42'
        window.history.replaceState({}, '', '/?story=welcome&anchor=42')
        await applyUrlState({})

        expect(mockState.navStore.activeStoryPrompt).toBe('welcome')
        const focusPublishes = mockState.publishCalls.filter((c) => c.type === 'search:search-focus-requested')
        expect(focusPublishes.some((c) => (c.payload as { index?: number })?.index === 42)).toBe(true)
        expect(mockState.applyLocalNeighborhoodFocusCalls).toContain(42)
    }, 60000)

    it('?story=...&record=...&depth=... restores story, record focus, and depth together', async () => {
        const { applyUrlState } = await import('@lib/orchestration/url-state')

        mockState.urlSearch = '?story=welcome&record=5&depth=2'
        window.history.replaceState({}, '', '/?story=welcome&record=5&depth=2')
        await applyUrlState({})

        expect(mockState.navStore.activeStoryPrompt).toBe('welcome')
        // record=5 maps to the array index whose lead_id === '5'.
        const focusPublishes = mockState.publishCalls.filter((c) => c.type === 'search:search-focus-requested')
        expect(focusPublishes.some((c) => (c.payload as { index?: number })?.index === 5)).toBe(true)
        expect(mockState.navStore.trailDepthFromExploration).toBe(2)
        // No query in the URL — the search restore must not run.
        expect(mockState.runSearchCalls).toHaveLength(0)
    }, 60000)

    it('?story=... alone still restores the story without running a search', async () => {
        const { applyUrlState } = await import('@lib/orchestration/url-state')

        mockState.urlSearch = '?story=welcome'
        window.history.replaceState({}, '', '/?story=welcome')
        await applyUrlState({})

        expect(mockState.navStore.activeStoryPrompt).toBe('welcome')
        expect(mockState.runSearchCalls).toHaveLength(0)
        expect(mockState.setSearchErrorCalls).toHaveLength(0)
    }, 60000)
})
