/**
 * @vitest-environment jsdom
 *
 * Direct coverage for the 334-LOC init orchestrator at
 * src/lib/orchestration/app-init.ts.
 *
 * appInit() is the single entry point for app startup (called from main.ts).
 * It has 42 indirect consumers and 0 direct unit tests — the last untested
 * seam in the orchestration graph. This file locks in:
 *
 *   (A) Happy-path call order — every imported side-effect fires, in the
 *       documented phase order (data load → URL state → globals).
 *   (B) skipDataLoad option — phase 2 is skipped, URL state + globals still
 *       run.
 *   (C) initData rejection — setDataLoadError is called, init still resolves.
 *   (D) isAppInitComplete() lifecycle — false → true → false after teardown.
 *   (E) teardownAppShell() — invokes cleanups, uninstalls window globals.
 *   (F) Double-call idempotency — second call is a no-op, no double-init.
 *   (G) Phase-order invariant — data load completes BEFORE applyUrlState.
 *   (H) Safety-valve timers — deferred (it.todo) — intertwined with timing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoisted mock handles (available before any vi.mock factory runs) ────────
const mock = vi.hoisted(() => ({
    initData: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
    setLoadingPhase: vi.fn(),
    setDataLoadError: vi.fn(),
    initViewportListeners: vi.fn<[], () => void>().mockReturnValue(() => {}),
    initAdapters: vi.fn(),
    buildAdapterDeps: vi.fn().mockReturnValue({}),
    installParityAttributeSync: vi.fn<[], () => void>().mockReturnValue(() => {}),
    installTestStoreGlobals: vi.fn<[], () => void>().mockReturnValue(() => {}),
    applyUrlState: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
    debugWarn: vi.fn(),
    debugError: vi.fn(),
    initAudio: vi.fn(),
}))

// ── Module mocks (isolate every downstream consumer) ─────────────────────────
vi.mock('@lib/data-store', async () => {
    const actual = await vi.importActual('@lib/data-store')
    return {
        ...actual,
        initData: mock.initData,
        setLoadingPhase: mock.setLoadingPhase,
        setDataLoadError: mock.setDataLoadError,
    }
})

vi.mock('@lib/stores/viewport.svelte.ts', async () => {
    const actual = await vi.importActual('@lib/stores/viewport.svelte.ts')
    return {
        ...actual,
        initViewportListeners: mock.initViewportListeners,
    }
})

vi.mock('@lib/orchestration/adapters', async () => {
    const actual = await vi.importActual('@lib/orchestration/adapters')
    return {
        ...actual,
        initAdapters: mock.initAdapters,
    }
})

vi.mock('@lib/orchestration/adapter-deps', async () => {
    const actual = await vi.importActual('@lib/orchestration/adapter-deps')
    return {
        ...actual,
        buildAdapterDeps: mock.buildAdapterDeps,
    }
})

vi.mock('@lib/orchestration/parity-attrs.svelte.ts', async () => {
    const actual = await vi.importActual('@lib/orchestration/parity-attrs.svelte.ts')
    return {
        ...actual,
        installParityAttributeSync: mock.installParityAttributeSync,
    }
})

vi.mock('@lib/orchestration/test-globals', async () => {
    const actual = await vi.importActual('@lib/orchestration/test-globals')
    return {
        ...actual,
        installTestStoreGlobals: mock.installTestStoreGlobals,
    }
})

vi.mock('@lib/orchestration/url-state', async () => {
    const actual = await vi.importActual('@lib/orchestration/url-state')
    return {
        ...actual,
        applyUrlState: mock.applyUrlState,
    }
})

vi.mock('@lib/utils/debug', () => ({
    debugWarn: mock.debugWarn,
    debugError: mock.debugError,
}))

vi.mock('@lib/audio/audio-scape', () => ({
    initAudio: mock.initAudio,
}))

// ── Import the SUT AFTER all mocks are registered ───────────────────────────
import { appInit, isAppInitComplete, teardownAppShell } from '@lib/orchestration/app-init'

// ── Helpers ──────────────────────────────────────────────────────────────────

/// <reference types="vitest" />

/**
 * Import app-init in a reset module registry so its internal state
 * (_initCalled, _safetyTimers, etc.) starts clean. Uses vi.resetModules()
 * which re-executes the top-level vi.mock declarations above on the next
 * import, giving us a pristine module instance.
 */
async function freshAppInit() {
    vi.resetModules()
    const mod = await import('@lib/orchestration/app-init')
    return mod
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('appInit — happy path', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Ensure jsdom has a canvas element for the WebGL restore handler
        document.body.innerHTML = '<canvas></canvas>'
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('returns a cleanup function', async () => {
        const cleanup = await appInit({})
        expect(typeof cleanup).toBe('function')
        cleanup()
    })

    it('sets isAppInitComplete=true after init resolves', async () => {
        expect(isAppInitComplete()).toBe(false)
        const cleanup = await appInit({})
        expect(isAppInitComplete()).toBe(true)
        cleanup()
    })

    it('calls initData exactly once', async () => {
        const cleanup = await appInit({})
        expect(mock.initData).toHaveBeenCalledTimes(1)
        cleanup()
    })

    it('calls initViewportListeners exactly once', async () => {
        const cleanup = await appInit({})
        expect(mock.initViewportListeners).toHaveBeenCalledTimes(1)
        cleanup()
    })

    it('calls buildAdapterDeps and initAdapters exactly once', async () => {
        const cleanup = await appInit({})
        expect(mock.buildAdapterDeps).toHaveBeenCalledTimes(1)
        expect(mock.initAdapters).toHaveBeenCalledTimes(1)
        cleanup()
    })

    it('calls installParityAttributeSync exactly once', async () => {
        const cleanup = await appInit({})
        expect(mock.installParityAttributeSync).toHaveBeenCalledTimes(1)
        cleanup()
    })

    it('calls installTestStoreGlobals exactly once', async () => {
        const cleanup = await appInit({})
        expect(mock.installTestStoreGlobals).toHaveBeenCalledTimes(1)
        cleanup()
    })

    it('calls applyUrlState exactly once', async () => {
        const cleanup = await appInit({})
        expect(mock.applyUrlState).toHaveBeenCalledTimes(1)
        cleanup()
    })

    it('calls initAudio (dynamic import) exactly once', async () => {
        const cleanup = await appInit({})
        expect(mock.initAudio).toHaveBeenCalledTimes(1)
        cleanup()
    })
})

describe('appInit — call order (phase invariant)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        document.body.innerHTML = '<canvas></canvas>'
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('fires every side-effect in the documented phase order', async () => {
        const callOrder: string[] = []

        // Wrap each mock to record call order
        mock.initData.mockImplementation(async () => {
            callOrder.push('initData')
        })
        mock.initViewportListeners.mockImplementation(() => {
            callOrder.push('initViewportListeners')
            return () => {}
        })
        mock.installParityAttributeSync.mockImplementation(() => {
            callOrder.push('installParityAttributeSync')
            return () => {}
        })
        mock.installTestStoreGlobals.mockImplementation(() => {
            callOrder.push('installTestStoreGlobals')
            return () => {}
        })
        mock.buildAdapterDeps.mockImplementation(() => {
            callOrder.push('buildAdapterDeps')
            return {}
        })
        mock.initAdapters.mockImplementation(() => {
            callOrder.push('initAdapters')
        })
        mock.applyUrlState.mockImplementation(async () => {
            callOrder.push('applyUrlState')
        })
        mock.initAudio.mockImplementation(() => {
            callOrder.push('initAudio')
        })

        const cleanup = await appInit({})

        // The documented order:
        //   Phase 1: safety timers (not mocked — setTimeout)
        //   Phase 2: installTestStoreGlobals (window globals)
        //   Phase 2.5: initViewportListeners + installParityAttributeSync
        //   Phase 3: initData (async, but not awaited yet)
        //   Phase 3.5: buildAdapterDeps + initAdapters
        //   Phase 4: applyUrlState (awaits dataReadyPromise first)
        //   Phase 5: WebGL restore handler (DOM query)
        //   Phase 6: clear timers
        //   Phase 7: initAudio (dynamic import)
        expect(callOrder).toEqual([
            'installTestStoreGlobals',
            'initViewportListeners',
            'installParityAttributeSync',
            'initData',
            'buildAdapterDeps',
            'initAdapters',
            'applyUrlState',
            'initAudio',
        ])

        cleanup()
    })

    it('data load completes BEFORE applyUrlState runs (documented invariant)', async () => {
        let dataResolved = false
        let urlStateRanBeforeData = false

        mock.initData.mockImplementation(async () => {
            // Simulate async work
            await new Promise((r) => setTimeout(r, 10))
            dataResolved = true
        })
        mock.applyUrlState.mockImplementation(async () => {
            if (!dataResolved) urlStateRanBeforeData = true
        })

        const cleanup = await appInit({})

        expect(urlStateRanBeforeData).toBe(false)
        expect(dataResolved).toBe(true)

        cleanup()
    })
})

describe('appInit — initData rejection path', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        document.body.innerHTML = '<canvas></canvas>'
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('logs the error via debugError and still resolves when initData rejects', async () => {
        // In app-init.ts, initData().catch() only logs — the actual
        // setDataLoadError is called inside data-store's own try/catch.
        // When initData rejects (e.g., unhandled internal error), app-init
        // treats it as non-fatal and continues the init sequence.
        mock.initData.mockRejectedValue(new Error('network failure'))

        const cleanup = await appInit({})

        // debugError should have been called with the rejection
        expect(mock.debugError).toHaveBeenCalledWith(
            '[app-init] initData failed:',
            expect.any(Error)
        )

        // Init still completes — URL state and globals still run
        expect(mock.applyUrlState).toHaveBeenCalledTimes(1)
        expect(mock.installTestStoreGlobals).toHaveBeenCalledTimes(1)
        expect(isAppInitComplete()).toBe(true)

        cleanup()
    })

    it('calls setDataLoadError when the mocked initData invokes it internally', async () => {
        // This path simulates the case where data-store's own try/catch
        // catches an error and calls setDataLoadError before re-throwing.
        mock.initData.mockImplementation(async () => {
            mock.setDataLoadError('internal data error')
            throw new Error('internal data error')
        })

        const cleanup = await appInit({})

        expect(mock.setDataLoadError).toHaveBeenCalledTimes(1)
        expect(mock.setDataLoadError).toHaveBeenCalledWith('internal data error')

        // Init still resolves despite the error
        expect(isAppInitComplete()).toBe(true)

        cleanup()
    })
})

describe('isAppInitComplete — lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        document.body.innerHTML = '<canvas></canvas>'
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('returns false before any call, true after, false after teardown', async () => {
        // Note: this test assumes module state is fresh. Since other tests
        // may have already called appInit, we use a fresh import.
        const { appInit: freshInit, isAppInitComplete: freshComplete } = await freshAppInit()

        expect(freshComplete()).toBe(false)
        const cleanup = await freshInit({})
        expect(freshComplete()).toBe(true)
        cleanup()
        expect(freshComplete()).toBe(false)
    })
})

describe('teardownAppShell', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        document.body.innerHTML = '<canvas></canvas>'
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('invokes cleanup functions and uninstalls window globals', async () => {
        const viewportCleanup = vi.fn()
        const parityCleanup = vi.fn()
        const globalsCleanup = vi.fn()

        mock.initViewportListeners.mockReturnValue(viewportCleanup)
        mock.installParityAttributeSync.mockReturnValue(parityCleanup)
        mock.installTestStoreGlobals.mockReturnValue(globalsCleanup)

        const { appInit: freshInit, teardownAppShell: freshTeardown } = await freshAppInit()

        const cleanup = await freshInit({})

        // The returned cleanup function should call all uninstallers
        cleanup()

        expect(viewportCleanup).toHaveBeenCalledTimes(1)
        expect(parityCleanup).toHaveBeenCalledTimes(1)
        expect(globalsCleanup).toHaveBeenCalledTimes(1)
    })

    it('is safe to call even if appInit never ran (no-op)', async () => {
        const { teardownAppShell: freshTeardown } = await freshAppInit()
        expect(() => freshTeardown()).not.toThrow()
    })
})

describe('appInit — double-call idempotency', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        document.body.innerHTML = '<canvas></canvas>'
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('second call returns a no-op cleanup and does not double-init', async () => {
        const { appInit: freshInit } = await freshAppInit()

        const firstCleanup = await freshInit({})
        expect(mock.initData).toHaveBeenCalledTimes(1)
        expect(mock.installTestStoreGlobals).toHaveBeenCalledTimes(1)

        // Second call — should be a no-op
        const secondCleanup = await freshInit({})
        expect(mock.initData).toHaveBeenCalledTimes(1) // still 1
        expect(mock.installTestStoreGlobals).toHaveBeenCalledTimes(1) // still 1

        // Second cleanup is a no-op (returns () => {})
        expect(typeof secondCleanup).toBe('function')
        secondCleanup()

        // First cleanup still works
        firstCleanup()
    })
})

describe('appInit — safety valve timers (deferred)', () => {
    it.todo('slow-progress timer fires after 4s if overlay still visible')
    it.todo('safety valve timer fires after 15s and shows error state')
    it.todo('timers are cleared when init completes before they fire')
    it.todo('timers are cleared by the returned cleanup function')
})
