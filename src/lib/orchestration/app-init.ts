/**
 * @lib/orchestration/app-init.ts — Svelte-first app initialization orchestration
 *
 * Replaces the init from for the Svelte shell.
 *
 * Coordinates the startup sequence:
 *   1. Safety valve timers (detect stuck loading overlay)
 *   2. Data loading (delegates to initData from data-store)
 *   3. URL state application (after data loads)
 *   4. Window globals for Playwright test compat (__APP_STATE__, __navActions__)
 *   5. WebGL context restore handler
 *   6. First-paint coordination (scene reveal, hide overlay, deferred hydration, demo)
 *
 * The engine bridge (Canvas.svelte) handles WebGL/Three.js initialization.
 * The LoadingOverlay and DemoChoreography components handle their own
 * visibility reactively from stores. This module provides the top-level
 * orchestration glue.
 */

import { initData, setLoadingPhase, setDataLoadError } from '@lib/data-store'
import { prewarmLocalIndex } from '@lib/search/local-search-index'
import { initViewportListeners } from '@lib/stores/viewport.svelte.ts'
import { debugWarn } from '@lib/utils/debug'
import { initAdapters } from '@lib/orchestration/adapters'
import { buildAdapterDeps } from '@lib/orchestration/adapter-deps'
import { installParityAttributeSync } from '@lib/orchestration/parity-attrs.svelte.ts'
import { installTestStoreGlobals } from '@lib/orchestration/test-globals'
import { debugError } from '@lib/utils/debug'
import { teardownViewController } from '@lib/orchestration/view-controller'
import { claimRestoreOwnership, isRestoreOwned, releaseRestoreOwnership } from '@lib/engine/webgl-restore-ownership'
import { disposeJourneyFocusTimers } from '@lib/journey/journey-focus-timers'

// Side-effect: initializes journey state, canvas interaction adapter,
// and thread-settler bindings. Must load before engine init so that
// canvas hit-test and thread walking work on first user interaction.
import '@lib/journey/journey'

// ── Debug Window Extensions (Playwright test compat) ────────────────────────
// `__APP_STATE__` and `__navActions__` are debug/test shims. Their types are
// declared in src/window.d.ts (the canonical location for window globals).
// The action bag itself lives in window-test-bridge.ts; this module only
// invokes install/teardown.

// ── Types ────────────────────────────────────────────────────────────────────

interface SafetyTimers {
    slowProgress: ReturnType<typeof setTimeout>
    safetyValve: ReturnType<typeof setTimeout>
}

interface AppInitOptions {
    /** Force demo to run regardless of eligibility */
    forceDemo?: boolean
    /** Suppress demo entirely */
    noDemo?: boolean
    /** Whether the current URL is a deep-link (anchor/record/view=q/search). Gates lazy url-state import. */
    isDeepLink?: boolean
}

// ── Configuration ────────────────────────────────────────────────────────────

/**
 * After the lazy-load fix, blocking init is well under 4s on a healthy
 * network. The slow-progress threshold drops from 8s to 4s so the
 * "still preparing" UI surfaces earlier.
 */
const SLOW_PROGRESS_MS = 4000

/**
 * The 15s safety valve is a last-resort fallback for genuinely broken
 * networks. Shows error state if the overlay is still visible.
 */
const SAFETY_VALVE_MS = 15_000

// ── Internal State ───────────────────────────────────────────────────────────

let _initCalled = false
let _safetyTimers: SafetyTimers | null = null
let _unsubWindowGlobals: (() => void) | null = null
let _unsubWebglRestore: (() => void) | null = null
let _unsubViewport: (() => void) | null = null
let _unsubParity: (() => void) | null = null
let _lastCleanup: (() => void) | null = null
let _prewarmTimer: ReturnType<typeof setTimeout> | null = null

// ── Safety Valves ────────────────────────────────────────────────────────────

function setupSafetyValves(): SafetyTimers {
    // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
    const slowProgress = setTimeout(() => {
        if (typeof document === 'undefined') return
        const overlay = document.getElementById('loading-overlay')
        // When the Svelte LoadingOverlay hides via {#if actuallyVisible}, the
        // DOM element is removed entirely. Treat a missing overlay the same as
        // a hidden one — the overlay has already been dismissed.
        if (!overlay || overlay.classList.contains('hidden')) return

        setLoadingPhase('restore')
        // Push overrides via DOM (matches legacy setLoadingPhase override pattern)
        const noteEl = document.getElementById('loading-note')
        const footEl = document.getElementById('loading-foot')
        if (noteEl) noteEl.textContent = 'Still preparing the scene…'
        if (footEl) footEl.textContent = 'Taking longer than usual. Hold on a moment longer.'
    }, SLOW_PROGRESS_MS)

    // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
    const safetyValve = setTimeout(() => {
        if (typeof document === 'undefined') return
        const overlay = document.getElementById('loading-overlay')
        if (overlay?.classList.contains('hidden')) return

        if (!overlay) return
        debugError('[app-init] Safety valve: loading overlay stuck after 15s. Showing error state.')

        // Apply error state to the overlay (matches legacy applyLoadingErrorState)
        // — built with DOM API per pi-lens innerHTML safety rule.
        const shell = document.createElement('div')
        shell.setAttribute('role', 'alert')
        shell.className = 'loading-shell'

        const kicker = document.createElement('div')
        kicker.className = 'loading-kicker'
        kicker.textContent = 'Graph unavailable'
        shell.appendChild(kicker)

        const titleEl = document.createElement('div')
        titleEl.className = 'loading-title'
        titleEl.textContent = 'Failed to load'
        shell.appendChild(titleEl)

        const noteEl = document.createElement('div')
        noteEl.className = 'loading-note'
        noteEl.textContent = 'Initialization timed out after 15 seconds. Refresh after the connection recovers.'
        shell.appendChild(noteEl)

        const footEl = document.createElement('div')
        footEl.className = 'loading-foot'
        footEl.textContent = 'Safety valve triggered.'
        shell.appendChild(footEl)

        overlay.replaceChildren(shell)
        overlay.hidden = false
        overlay.inert = false
        overlay.removeAttribute('aria-hidden')
        overlay.classList.remove('hidden', 'launching')
        overlay.dataset.loadingState = 'error'
        // W47-D: also update the store so the reactively-bound LoadingOverlay
        // can hide on the error state. Previously the safety valve only
        // touched the DOM, leaving dataLoadState.status stuck at 'loading'
        // and LoadingOverlay blocking all subsequent clicks.
        setDataLoadError('Loading timed out after 15 seconds. Refresh after the connection recovers.')
    }, SAFETY_VALVE_MS)

    return { slowProgress, safetyValve }
}

function clearSafetyTimers(timers: SafetyTimers | null): void {
    if (timers?.slowProgress) clearTimeout(timers.slowProgress)
    if (timers?.safetyValve) clearTimeout(timers.safetyValve)
}

function clearPrewarmTimer(): void {
    if (_prewarmTimer !== null) {
        clearTimeout(_prewarmTimer)
        _prewarmTimer = null
    }
}

function scheduleSearchIndexPrewarm(): void {
    clearPrewarmTimer()
    // eslint-disable-next-line no-restricted-syntax -- one-shot defer is canceled by app cleanup
    _prewarmTimer = setTimeout(() => {
        _prewarmTimer = null
        void prewarmLocalIndex()
    }, 0)
}

// ── URL State Application ────────────────────────────────────────────────────

/**
 * Apply URL state after data is loaded. The URL may contain navigation
 * params (view, focusedIndex, filters, search query) that need the data
 * layer to be ready before they can be resolved.
 */
import { applyUrlState } from '@lib/orchestration/url-state'

async function applyUrlStateAfterData(isDeepLink: boolean): Promise<void> {
    if (!isDeepLink) return
    try {
        await applyUrlState()
    } catch (err) {
        debugError('[app-init] applyUrlState failed during init:', err)
    }
}

// ── WebGL Context Restore ─────────────────────────────────────────────────

/**
 * Subscribe to WebGL context lost/restored events on the canvas.
 * On restore, re-run the Svelte-first init to re-create the Three.js scene.
 *
 * This mirrors the legacy setWebGLContextRestoreHandler(init) call at the
 * bottom of
 *
 * @returns A cleanup function that removes the event listeners.
 */
export function setupWebglContextRestore(): () => void {
    // H1 fix (Jul-10 bugsweep cross-seam): previously queried #engine-canvas
    // which is REMOVED by scene-init.ts:90 (all canvases != renderer.domElement
    // are stripped). So lost/restored listeners on detached #engine-canvas
    // never fired — context loss left animate() dead forever and W53 M5 dev
    // test simulateWebGLContextLoss never restored.
    //
    // Canonical source of truth is now three-listener-registration which owns
    // C5/C6 on renderer.domElement inside the DisposableRegistry. This app-init
    // path remains as a safety re-init path and is re-bound lazily to the live
    // renderer.domElement if available. If no live canvas yet, return no-op;
    // the registry will handle restore when engine inits.
    // Prefer live renderer.domElement if already mounted; fallback to id query
    // only for very early boot before three init (will be superseded by registry).
    // (2026-08-07: removed a dead `__APP_STATE__?.renderer?.domElement` proxy read —
    // its `_appState` binding was never referenced; canvas comes from the DOM query
    // below. compat-proxy-wrongpath-scan flagged it as needless proxy read.)
    // Try to resolve live canvas without importing appState statically (keeps module acyclic).
    // The registry path is now primary; this fallback ensures restore still re-inits if registry torn down.
    const liveCanvasFromDom =
        (typeof document !== 'undefined'
            ? document.querySelector<HTMLCanvasElement>('#canvas-container canvas')
            : null) ??
        document?.querySelector<HTMLCanvasElement>('#engine-canvas') ??
        null
    const canvas = liveCanvasFromDom
    if (!canvas) return () => {}

    // Ownership check: if the engine registry already owns restore handling
    // for this canvas, yield to it. The registry path is primary and handles
    // the full re-init via webglNeedsRestoreReinit + animate() wakeup.
    if (isRestoreOwned(canvas)) {
        debugWarn('[app-init] Restore ownership claimed by engine registry; fallback yielding')
        return () => {}
    }

    const handleContextLost = (event: Event) => {
        event.preventDefault()
        debugWarn('[app-init] WebGL context lost (app-init fallback)')
    }

    const handleContextRestored = async () => {
        debugWarn('[app-init] WebGL context restored; reinitializing (app-init fallback)')
        _initCalled = false
        try {
            await appInit()
        } catch (err) {
            debugError('[app-init] WebGL restore reinit failed:', err)
        }
    }

    const fallbackOwner = {}
    const cleanup = () => {
        canvas.removeEventListener('webglcontextlost', handleContextLost)
        canvas.removeEventListener('webglcontextrestored', handleContextRestored)
        releaseRestoreOwnership(canvas, fallbackOwner)
    }

    // Claim the fallback explicitly so a later engine init can remove this
    // listener pair before installing its primary handlers on the same canvas.
    if (!claimRestoreOwnership(canvas, fallbackOwner, { kind: 'fallback', cleanup })) {
        return () => {}
    }

    canvas.addEventListener('webglcontextlost', handleContextLost)
    canvas.addEventListener('webglcontextrestored', handleContextRestored)

    return cleanup
}

// ── Main Init ────────────────────────────────────────────────────────────────

/**
 * Initialize the Svelte-first application.
 *
 * This is the single entry point for app initialization, called from main.ts.
 * It orchestrates the startup sequence:
 *   1. Safety valve timers
 *   2. Data loading (business records + semantic threads)
 *   3. URL state application
 *   4. Window globals for test compat
 *   5. First-paint coordination
 *
 * The engine bridge (Canvas.svelte) and UI components handle their own
 * initialization reactively. This module coordinates timing and error recovery.
 *
 * @returns A cleanup function that tears down listeners and timers.
 */
export async function appInit(options: AppInitOptions = {}): Promise<() => void> {
    if (_initCalled) {
        debugWarn('[app-init] init() called more than once; skipping.')
        return () => {}
    }
    _initCalled = true

    // F6 fix (context-restore cleanup accumulation): dispose the previous
    // run's resources before re-initializing. The WebGL context-restore path
    // sets _initCalled=false and re-enters appInit(); without this, safety
    // timers and window-global subscriptions from earlier runs accumulate.
    _lastCleanup?.()
    _lastCleanup = null

    const { forceDemo: _forceDemo = false, noDemo: _noDemo = false } = options

    debugWarn('[app-init] Starting Svelte-first initialization…')

    // ── Phase 1: Safety valves ────────────────────────────────────────────────
    _safetyTimers = setupSafetyValves()

    // ── Phase 2: Window globals (immediate, before async work) ────────────────
    _unsubWindowGlobals = installTestStoreGlobals()

    // ── Phase 2.5: Viewport listeners + parity attribute sync ─────────────────
    // W46-B1: These were previously installed by App.svelte's onMount, which
    // duplicated the orchestration seam. Moving them here makes App.svelte a
    // thin shell that delegates lifecycle to appInit(). Cleanups are exposed
    // via teardownAppShell() so App.svelte's onMount return-cleanup can drive
    // teardown without re-importing the installers.
    // F6 fix: previous-run teardown is now handled by _lastCleanup at the
    // top of appInit(); no need for individual _unsub*?.() calls here.
    _unsubViewport = initViewportListeners()
    _unsubParity = installParityAttributeSync()

    // ── Phase 3: Data loading ─────────────────────────────────────────────────
    //
    // initData() is async and loads business records + semantic threads.
    // LoadingOverlay.svelte reads loadingPhaseStore reactively, so phase
    // transitions (records → scene → restore → launch) appear immediately.
    //
    // We don't await here — the data loads in the background while the engine
    // bridge initializes WebGL via Canvas.svelte. The URL state application
    // (Phase 4) awaits data readiness before running.
    const dataReadyPromise = initData().catch((err) => {
        debugError('[app-init] initData failed:', err)
        // Non-fatal: data-store sets error state; UI shows error overlay
    })

    // ── Phase 3.5: Adapter initialization ─────────────────────────────────
    initAdapters(buildAdapterDeps())

    // ── Phase 4: URL state (after data is ready) ──────────────────────────────
    //
    // URL state may reference focusedIndex, view, filters, or search query —
    // all of which need business data to be loaded. Awaiting dataReadyPromise
    // ensures the URL state can resolve against loaded records.
    await dataReadyPromise
    // Prewarm the local search index off the first-search path: the lazy
    // getLocalIndex() build over the full corpus (8,406 records) freezes the
    // main thread for seconds — it stalled the demo's SEARCH phase and made
    // first user searches (and journey tests) feel hung. Deferred tick keeps
    // the boot/URL-restore flow unblocked.
    scheduleSearchIndexPrewarm()
    // Fix B (tmp/focus-blank-investigation.md): don't block first paint on the
    // deep-link URL-state restore, which awaits a network search (up to 30 s).
    // Run it fire-and-forget so the loading overlay / safety valve clears
    // immediately; the focus pocket still rebuilds when the restore resolves
    // (and Fix A guarantees it's non-empty even before then).
    void applyUrlStateAfterData(options.isDeepLink ?? false)

    // ── Phase 5: WebGL context restore handler ────────────────────────────────
    // F6 fix: prior-handler teardown is now handled by _lastCleanup at the top.
    _unsubWebglRestore = setupWebglContextRestore()

    // ── Phase 6: First-paint coordination ─────────────────────────────────────
    //
    // The LoadingOverlay component hides itself when loadingPhaseStore = 'launch'.
    // The Canvas bridge fires onLoadingPhase('launch') once WebGL is ready.
    // DemoChoreography.svelte handles demo eligibility and choreography.
    //
    // The safety valve timer (Phase 1) is cleared once we reach this point.
    if (_safetyTimers) {
        clearSafetyTimers(_safetyTimers)
        _safetyTimers = null
    }

    // ── Phase 7: Audio Scape Initialization ─────────────────────────────────
    try {
        const { initAudio } = await import('@lib/audio/audio-scape')
        initAudio()
    } catch (err) {
        debugError('[app-init] initAudio failed:', err)
    }

    debugWarn('[app-init] Initialization orchestration complete.')

    // ── Return cleanup function ───────────────────────────────────────────────
    const cleanup = () => {
        clearSafetyTimers(_safetyTimers)
        _safetyTimers = null
        clearPrewarmTimer()
        disposeJourneyFocusTimers()
        _unsubWindowGlobals?.()
        _unsubViewport?.()
        _unsubParity?.()
        _unsubWebglRestore?.()
        _initCalled = false
    }
    _lastCleanup = cleanup
    return cleanup
}

/**
 * Check whether the app initialization has been called.
 */
export function isAppInitComplete(): boolean {
    return _initCalled
}

/**
 * Explicit teardown for App.svelte's onMount return-cleanup.
 * Calls the viewport and parity cleanups installed by appInit() Phase 2.5.
 * Safe to call even if appInit() never ran (no-op).
 */
export function teardownAppShell(): void {
    _unsubViewport?.()
    _unsubViewport = null
    _unsubParity?.()
    _unsubParity = null
    teardownViewController()
    // Lazify seam-1: fire-and-forget dynamic import so teardownTriggers
    // (and its closure) leave the boot-side module graph entirely.
    // teardownAppShell() stays sync; callers (AppBoot.svelte onMount cleanup)
    // do not await.
    void import('@lib/orchestration/triggers')
        .then((m) => m.teardownTriggers())
        .catch((err) => debugWarn('[lazify] trigger teardown failed', err))
}
