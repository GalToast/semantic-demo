/**
 * @lib/orchestration/app-init.ts — Svelte-first app initialization orchestration
 *
 * Replaces the init from for the Svelte shell.
 *
 * Coordinates the startup sequence:
 *   1. Safety valve timers (detect stuck loading overlay)
 *   2. Data loading (delegates to initData from data-store)
 *   3. URL state application (after data loads)
 *   4. Window globals for Playwright test compat (__APP_STATE__, __APP_ACTIONS__)
 *   5. WebGL context restore handler
 *   6. First-paint coordination (scene reveal, hide overlay, deferred hydration, demo)
 *
 * The engine bridge (Canvas.svelte) handles WebGL/Three.js initialization.
 * The LoadingOverlay and DemoChoreography components handle their own
 * visibility reactively from stores. This module provides the top-level
 * orchestration glue.
 */

import { get } from 'svelte/store'
import { initData, setLoadingPhase, setDataLoadError } from '@lib/data-store'
import { navStore } from '@lib/stores/navigation.svelte'
import { focusStore } from '@lib/stores/focus.svelte'
import { initViewportListeners } from '@lib/stores/viewport.svelte.ts'
import { appState } from '@lib/state/app.svelte'
import { returnToOverview as returnToOverviewAction } from '@lib/stores/lifecycle'
import {
    focusOnNode as focusOnNodeAction,
    refreshCompositionState as refreshCompositionStateAction,
    resetExperienceState as resetExperienceStateAction,
    resetExplorationFocus as resetExplorationFocusAction,
    setSemanticDiveMode as setSemanticDiveModeAction,
    setTrailDepth as setTrailDepthAction
} from '@lib/orchestration/lifecycle'
import { switchView as switchViewAction } from '@lib/orchestration/view-controller'
import { debugWarn } from '@lib/utils/diagnostic-adapter'
import { initAdapters } from '@lib/orchestration/adapters'
import { buildAdapterDeps } from '@lib/orchestration/adapter-deps'
import { installParityAttributeSync } from '@lib/orchestration/parity-attrs.svelte.ts'
import { search } from '@lib/search/state'
import { setTrailFromSeed } from '@lib/journey/neighborhood'
import { traverseNeighbor, walkThreadNeighbor } from '@lib/journey/thread-settler'
import {
    inspectThreadNeighbor,
    pinThreadNeighbor,
    pinFirstAvailableNeighbor,
    unpinThreadInspection,
    clearThreadInspection
} from '@lib/journey/thread-inspector'
import { updateTraversalUi } from '@lib/journey/focus-ui'
import { requestSemanticGuide } from '@lib/journey/semantic-guide'
import { showSemanticThreadsDetail } from '@lib/journey/connection-analysis'

const APP_STATE_DIRECT_KEY = '__SEMANTIC_EXPLORER_APP_STATE_DIRECT__'

// ── Debug Window Extensions (Playwright test compat) ────────────────────────
// `__APP_STATE__` and `__APP_ACTIONS__` are debug/test shims exposing a grab-bag
// of action handles and a state getter for Playwright page.evaluate(). They are
// intentionally loosely typed here (Record<string, unknown>) because their
// shape is driven by test contracts, not app internals.
declare global {
    interface Window {
        __APP_STATE__?: unknown
        __APP_ACTIONS__?: Record<string, unknown>
    }
}

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

function refreshTraversalUiForCompatAction(action: string): void {
    try {
        updateTraversalUi()
    } catch (error) {
        debugWarn('AppInit', `${action}: traversal UI refresh failed`, error)
    }
}

// ── Safety Valves ────────────────────────────────────────────────────────────

function setupSafetyValves(): SafetyTimers {
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

    const safetyValve = setTimeout(() => {
        if (typeof document === 'undefined') return
        const overlay = document.getElementById('loading-overlay')
        if (overlay?.classList.contains('hidden')) return

        if (!overlay) return
        if (import.meta.env.DEV)
            console.error('[app-init] Safety valve: loading overlay stuck after 15s. Showing error state.')

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

// ── Window Globals for Test Compat ───────────────────────────────────────────

/**
 * Install window globals expected by Playwright surface tests and
 * visual audit harnesses. The testState derived store is the Svelte-native
 * source of truth; __TEST_STATE__ is synced via subscription in main.ts.
 *
 * __APP_STATE__ exposes the legacy state shape for backward compat with
 * contract tests that read window.__APP_STATE__.state.*.
 *
 * __APP_ACTIONS__ provides action handles for Playwright test automation.
 * Each action is a thin wrapper that delegates to the store or orchestration layer.
 */
function installWindowGlobals(): () => void {
    if (typeof window === 'undefined') return () => {}

    // If a test compat proxy (or another init path) already set __APP_STATE__,
    // preserve it. The canonical test proxy in main.ts is more comprehensive
    // than the fallback snapshot here.
    if (!window.__APP_STATE__) {
        window.__APP_STATE__ = {
            get state() {
                const liveAppState =
                    ((window as unknown as Record<string, unknown>)[APP_STATE_DIRECT_KEY] as
                        | typeof appState
                        | undefined) || appState
                return {
                    currentView: get(navStore).currentView,
                    navState: get(navStore),
                    activeFilters: focusStore(),
                    routeTraceDiagnostics: liveAppState.routeTraceDiagnostics,
                    routeTraceLines: (liveAppState as unknown as { routeTraceLines?: unknown }).routeTraceLines,
                    points: liveAppState.points
                }
            }
        }
    }

    // __APP_ACTIONS__: synchronous action handles for Playwright test automation.
    // Contract tests call these inside page.evaluate() without awaiting returned
    // promises, so these wrappers must not use lazy dynamic imports.
    window.__APP_ACTIONS__ = {
        switchView: (view: string) => {
            switchViewAction(view)
        },
        focusOnNode: (index: number, options?: Record<string, unknown>) => {
            const result = focusOnNodeAction(index, options)
            refreshTraversalUiForCompatAction('focusOnNode')
            return result
        },
        setTrailDepth: (depth: number, _options?: Record<string, unknown>) => {
            setTrailDepthAction(depth)
            refreshTraversalUiForCompatAction('setTrailDepth')
        },
        setSemanticDiveMode: (enabled: boolean) => {
            setSemanticDiveModeAction(enabled)
        },
        refreshCompositionState: () => {
            refreshCompositionStateAction()
            refreshTraversalUiForCompatAction('refreshCompositionState')
        },
        resetExplorationFocus: (options?: Record<string, unknown>) => {
            resetExplorationFocusAction(options)
        },
        resetExperienceState: () => {
            resetExperienceStateAction()
        },
        clearSearch: () => {
            returnToOverviewAction()
        },
        returnToOverview: () => {
            returnToOverviewAction()
        }
    }

    window.__APP_ACTIONS__.search = (query: string, options?: Record<string, unknown>) => {
        return search(query, options)
    }
    window.__APP_ACTIONS__.setTrailFromSeed = (index: number) => {
        setTrailFromSeed(index)
    }
    window.__APP_ACTIONS__.traverseNeighbor = (step: number) => {
        traverseNeighbor(step)
    }
    window.__APP_ACTIONS__.inspectThreadNeighbor = (index: number, options?: Record<string, unknown>) => {
        return inspectThreadNeighbor(index, options)
    }
    window.__APP_ACTIONS__.pinThreadNeighbor = (index: number, options?: Record<string, unknown>) => {
        return pinThreadNeighbor(index, options)
    }
    window.__APP_ACTIONS__.pinFirstAvailableNeighbor = (options?: Record<string, unknown>) => {
        return pinFirstAvailableNeighbor(options)
    }
    window.__APP_ACTIONS__.unpinThreadInspection = () => {
        return unpinThreadInspection()
    }
    window.__APP_ACTIONS__.clearThreadInspection = (options?: Record<string, unknown>) => {
        return clearThreadInspection(options)
    }
    window.__APP_ACTIONS__.walkThreadNeighbor = (index: number, options?: Record<string, unknown>) => {
        return walkThreadNeighbor(index, options)
    }
    window.__APP_ACTIONS__.requestSemanticGuide = (_point?: unknown) => {
        return requestSemanticGuide()
    }
    window.__APP_ACTIONS__.showSemanticThreadsDetail = () => {
        return showSemanticThreadsDetail()
    }

    // No cleanup needed — window globals persist for the page lifetime.
    return () => {
        if (window.__APP_STATE__ && typeof window.__APP_STATE__ === 'object' && 'state' in window.__APP_STATE__) {
            delete window.__APP_STATE__
        }
        delete window.__APP_ACTIONS__
    }
}

// ── URL State Application ────────────────────────────────────────────────────

/**
 * Apply URL state after data is loaded. The URL may contain navigation
 * params (view, focusedIndex, filters, search query) that need the data
 * layer to be ready before they can be resolved.
 */
async function applyUrlStateAfterData(): Promise<void> {
    try {
        const { applyUrlState } = await import('@lib/orchestration/url-state')
        await applyUrlState()
    } catch (err) {
        if (import.meta.env.DEV) console.error('[app-init] applyUrlState failed during init:', err)
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
function setupWebglContextRestore(): () => void {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas')
    if (!canvas) return () => {}

    const handleContextLost = (event: Event) => {
        event.preventDefault()
        if (import.meta.env.DEV) console.warn('[app-init] WebGL context lost')
    }

    const handleContextRestored = async () => {
        if (import.meta.env.DEV) console.warn('[app-init] WebGL context restored; reinitializing')
        // Re-run the Svelte-first init. The init guard (_initCalled) will
        // prevent double-init, so we reset it first.
        _initCalled = false
        try {
            await appInit()
        } catch (err) {
            if (import.meta.env.DEV) console.error('[app-init] WebGL restore reinit failed:', err)
        }
    }

    canvas.addEventListener('webglcontextlost', handleContextLost)
    canvas.addEventListener('webglcontextrestored', handleContextRestored)

    return () => {
        canvas.removeEventListener('webglcontextlost', handleContextLost)
        canvas.removeEventListener('webglcontextrestored', handleContextRestored)
    }
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

    const { forceDemo: _forceDemo = false, noDemo: _noDemo = false } = options

    debugWarn('[app-init] Starting Svelte-first initialization…')

    // ── Phase 1: Safety valves ────────────────────────────────────────────────
    _safetyTimers = setupSafetyValves()

    // ── Phase 2: Window globals (immediate, before async work) ────────────────
    _unsubWindowGlobals = installWindowGlobals()

    // ── Phase 2.5: Viewport listeners + parity attribute sync ─────────────────
    // W46-B1: These were previously installed by App.svelte's onMount, which
    // duplicated the orchestration seam. Moving them here makes App.svelte a
    // thin shell that delegates lifecycle to appInit(). Cleanups are exposed
    // via teardownAppShell() so App.svelte's onMount return-cleanup can drive
    // teardown without re-importing the installers.
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
        if (import.meta.env.DEV) console.error('[app-init] initData failed:', err)
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
    await applyUrlStateAfterData()

    // ── Phase 5: WebGL context restore handler ────────────────────────────────
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
        if (import.meta.env.DEV) console.error('[app-init] initAudio failed:', err)
    }

    debugWarn('[app-init] Initialization orchestration complete.')

    // ── Return cleanup function ───────────────────────────────────────────────
    return () => {
        clearSafetyTimers(_safetyTimers)
        _safetyTimers = null
        _unsubWindowGlobals?.()
        _unsubViewport?.()
        _unsubParity?.()
        _unsubWebglRestore?.()
        _initCalled = false
    }
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
}
