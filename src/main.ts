/**
 * @/main.ts — Svelte 5 app entry point
 *
 * Imports App.svelte and mounts to #app target using the Svelte 5 `mount` API.
 * Initializes stores from URL params (?demo=force, ?nodemo=1).
 */
import { mount, unmount } from 'svelte'
import { get } from 'svelte/store'
import { navStore, setFocusedIndex, setCurrentView } from '@lib/stores/navigation.svelte'
import { setSearchSummary } from '@lib/stores/search.svelte'
import { focusStore } from '@lib/stores/focus.svelte'
import type { NavState } from '@lib/types/state'
import App from './App.svelte'
// W5-T3: JourneyCompass is now lazy-loaded by App.svelte via
// requestIdleCallback (scheduleIdleComponentImport). Removed static
// import here to keep it off the cold-load main-thread critical path.
import { testState } from '@lib/stores/index.svelte.ts'
import { installWindowActions } from '@lib/orchestration/window-actions'
import { installGestureMonitor } from '@lib/orchestration/wait-for-gesture'
import { engineReady } from '@lib/stores/engine-ready.svelte'
import { hydrateFromLegacyState } from '@lib/data-store'
import { terminateDataLoaderWorkers } from '@lib/data-loader'
import type { WeatherData } from '@lib/utils/weather'
import { appState, legacyState } from '@lib/state/app.svelte.ts'
import { withStateMutation } from '@lib/state/with-state-mutation'
// Side-effect: generates and exposes window.__semanticExplorerSessionSeed
import '@lib/state/session.svelte'
import type { ViewName, SearchSummary, Point } from '@lib/state/state-types'
import type { BusinessRecord } from '@lib/types/business'
import { appInit } from '@lib/orchestration/app-init'
import { teardownToastHooks } from '@lib/orchestration/toast'
import { registerUrlStateEventListeners } from '@lib/orchestration/url-state'
import { registerClusterFilterEventListeners } from '@lib/orchestration/cluster-filter-controller'
import { preloadJourneyWebgl } from '@lib/engine/journey-webgl-lazy'
import { webglContext } from '@lib/engine/webgl-context'
import { getInitialRenderKind, isDeepLinkParams } from '@lib/orchestration/responsive-renderer'
import { setRenderKind } from '@lib/orchestration/parity-attrs.svelte'
import './lib/css/biofield.css'
import { debugError, debugWarn } from '@lib/utils/debug'
// Laguna-FT-1 fix (2026-07-25): the MutationObserver-driven focus trap
// was exported but NEVER INVOKED — the entire a11y binding was dead code
// at runtime. main.ts is the install site, paired with the same-teardown
// pattern as registerUrlStateEventListeners above.
import { bindFocusTrapObserver, disposeFocusTrapBindings } from '@lib/utils'

// ── Global error sink (ring buffer) ────────────────────────────────────────
// Top-level catch for otherwise-uncaught errors / unhandled promise
// rejections. Keeps a tiny ring buffer so recent failures are inspectable
// via window.__ERROR_RING__.
const ERROR_RING_MAX = 20
const errorRing: Array<{ timestamp: number; message: string; stack?: string }> = []

// F8 (2026-08-07): keep the handler refs so the exact same listeners can be
// removed on HMR via disposeGlobalErrorSink() — previously each hot reload
// stacked a fresh pair, producing duplicate sinks + ring spam.
let _globalErrorListener: ((event: ErrorEvent) => void) | null = null
let _globalRejectionListener: ((event: PromiseRejectionEvent) => void) | null = null

function installGlobalErrorSink(): void {
    function pushToRing(err: unknown): void {
        errorRing.push({
            timestamp: Date.now(),
            message: String(err),
            stack: err instanceof Error ? err.stack : undefined
        })
        if (errorRing.length > ERROR_RING_MAX) errorRing.shift()
    }
    _globalErrorListener = (event: ErrorEvent) => {
        const err = event.error ?? event.message
        debugError('[global-error] uncaught error:', err)
        pushToRing(err)
    }
    _globalRejectionListener = (event: PromiseRejectionEvent) => {
        const reason = event.reason
        debugError('[global-error] unhandled promise rejection:', reason)
        pushToRing(reason)
    }
    window.addEventListener('error', _globalErrorListener)
    window.addEventListener('unhandledrejection', _globalRejectionListener)
    Object.defineProperty(window, '__ERROR_RING__', {
        get: () => errorRing,
        configurable: true
    })
}

function disposeGlobalErrorSink(): void {
    if (_globalErrorListener) window.removeEventListener('error', _globalErrorListener)
    if (_globalRejectionListener) window.removeEventListener('unhandledrejection', _globalRejectionListener)
    _globalErrorListener = null
    _globalRejectionListener = null
    // __ERROR_RING__ getter left in place — harmless across reloads and keeps
    // recent failures inspectable even after dispose.
}
installGlobalErrorSink()

// ── URL parameter initialization ──────────────────────────────────────────────

function parseUrlParams(): { forceDemo: boolean; noDemo: boolean; isDeepLink: boolean } {
    const params = new URLSearchParams(window.location.search)
    return {
        forceDemo: params.get('demo') === 'force',
        noDemo: params.get('nodemo') === '1',
        // PR-B2: detect deep-link params so we can dismiss the Splash
        // gesture gate before the user clicks Explore. Without this,
        // a user landing on ?anchor=519 sees focus state restored
        // behind the modal and has to click through to view it. Same
        // for ?q=coffee (search results) and ?view=map (map deep-link).
        // ?story= is intentionally NOT included — story prompts fire
        // post-splash as part of DemoChoreography.
        // Uses the canonical classifier in @lib/orchestration/responsive-renderer
        // (single source of truth, shared with demo.svelte.ts).
        isDeepLink: isDeepLinkParams(params)
    }
}

// ── W45-A: Set the render kind on body BEFORE mounting App.svelte ─────────────
// App.svelte has a Playwright-test branch that auto-signals engineReady when
// window.__PLAYWRIGHT__ is set, which calls setRenderKind('webgl') on body.
// If we mount App.svelte before writing the initial renderKind, the test
// auto-signal flips the body to 'webgl', then main.ts's later
// setRenderKind(getInitialRenderKind()) overwrites it back to 'placeholder2d'.
// That leaves engineReady._value=true (locked) while body says placeholder2d:
// the placeholder-cta click then short-circuits via the signalReady early
// return, so the surface-contract test for search-no-results can't get the
// info-panel unblocked. Writing the initial renderKind first, then mounting,
// lets the Playwright auto-signal win cleanly when the test wants webgl and
// otherwise stay in the placeholder2d path.
if (typeof document !== 'undefined' && document.body) {
    setRenderKind(getInitialRenderKind())
}

// ── Mount ─────────────────────────────────────────────────────────────────────

const { forceDemo, noDemo, isDeepLink } = parseUrlParams()
const mountTarget = document.getElementById('app') ?? document.getElementById('app-root')
let app: ReturnType<typeof mount> | undefined

// Ensure legacy state is exposed on window before any async data loads
// so that the test-compat proxy + legacy-data consumers read the real state
// object instead of an empty placeholder. (The __APP_STATE__ fallback claim
// for semantic-threads.ts was stale — that module never reads it; removed.)
if (typeof window !== 'undefined') {
    window.__LEGACY_APP_STATE__ = legacyState
}

if (mountTarget) {
    app = mount(App, {
        target: mountTarget,
        props: { forceDemo, noDemo }
    })
}

// ── Canonical app initialization (safety valves, adapters, data, URL state) ──
// Phase 1-7 of app-init.ts: safety valves, window globals, data loading,
// adapter initialization, URL state, WebGL context restore, audio init.
// This replaces the ad-hoc initData() + applyUrlState() that previously
// lived in App.svelte onMount.
let appInitCleanup: (() => void) | undefined
appInit({ forceDemo, noDemo, isDeepLink })
    .then((cleanup) => {
        appInitCleanup = cleanup
    })
    .catch((err) => {
        debugError('[main] appInit failed:', err)
    })

// Initialize legacy route trace event subscriptions so the Svelte track
// still builds WebGL route trace overlays and writes routeTraceDiagnostics
// for visual-audit compatibility.
// W45: These two calls pull `three` into the cold-load modulepreload set:
// route-trace.ts statically imports three, and preloadJourneyWebgl() dynamic-
// imports @lib/journey/webgl + thread-inspector-webgl (which static-import
// three). Firing them at module eval forced the 587 KB three chunk to
// download+parse on every cold load — the mobile LCP killer (see
// docs/w44-performance-recheck-2026-06-21.md). Gate them behind the first
// user gesture so three stays off the network until engaged.
//
// Safe to defer: route-trace overlays are only consumed during the demo
// arrival phase (which begins after splash dismiss = the same gesture), and
// preloadJourneyWebgl only primes the thread inspector (user-initiated).
let journeyWebglPreloaded = false
let unsubJourneyWebglPreload: (() => void) | null = engineReady.subscribe((ready) => {
    if (!ready || journeyWebglPreloaded) return
    journeyWebglPreloaded = true
    // Dynamic import keeps Three.js out of the main bundle.
    import('@lib/journey/route-trace')
        .then(({ initRouteTraceSubscriptions }) => {
            initRouteTraceSubscriptions()
        })
        .catch((err) => {
            // Surface dynamic-import failures so they're visible in dev;
            // route-trace is non-critical and the welcome demo degrades
            // gracefully when it can't load.
            debugWarn('[main] initRouteTraceSubscriptions failed (non-fatal):', err)
        })
    // Prime thread-inspector + arrival-phase overlays so they're ready
    // the first time the user opens them.
    preloadJourneyWebgl()
})

function disposeJourneyWebglPreload(): void {
    unsubJourneyWebglPreload?.()
    unsubJourneyWebglPreload = null
}

// ── W6-T1 gesture-driven engine-ready signal ─────────────────────────────────
// The engine waits for first user gesture (or visibility flip) before any
// heavy init runs from <Canvas defer />. Idempotent — safe to call once.
//
// (The initial setRenderKind(getInitialRenderKind()) call moved up before
// mount(App) so App.svelte's Playwright auto-signal doesn't race with it.
// See the comment above the mount block for the full rationale.)
// PR-B2: dismiss the Splash gesture gate early on deep-link boot.
// parseUrlParams() already classified the URL; on desktop (webgl) we
// can signal ready now so the focus/search/map state — which app-init
// loads in the background — is visible to the user immediately. The
// renderKind guard mirrors GestureMonitor's own skip-on-placeholder2d
// logic: mobile keeps the 2D placeholder + splash flow.
if (isDeepLink && document.body?.dataset?.renderKind !== 'placeholder2d') {
    engineReady.signalReady()
}
const teardownGestureMonitor = installGestureMonitor({
    onReady: () => engineReady.signalReady()
})
window.addEventListener('beforeunload', () => teardownGestureMonitor(), { once: true })

// Register URL-state + cluster-filter event-bus listeners exactly once and hold
// their teardown handles (previously dropped → leak on HMR / module re-eval).
// register* is idempotent, so the module-load auto-call and this explicit call
// resolve to the same teardown.
const teardownUrlStateListeners = registerUrlStateEventListeners()
const teardownClusterFilterListeners = registerClusterFilterEventListeners()
// Laguna-FT-1 fix: install the focus-trap MutationObserver so the trap
// actually activates on panelSurface changes ('search' | 'focus' |
// 'focus-search' | 'semantic-dive'). Without this call, the contract
// test tests/focus-trap-contract.mjs passed only because the 3D canvas
// isn't natively focusable — it never actually exercised the trap.
bindFocusTrapObserver()
window.addEventListener(
    'beforeunload',
    () => {
        teardownUrlStateListeners()
        teardownClusterFilterListeners()
        disposeFocusTrapBindings()
    },
    { once: true }
)

// Hydrate Svelte stores from the legacy state after mount.
// The legacy init path sets __APP_STATE__ asynchronously; retry until the
// data is present or the cap is reached.
let hydrateAttempts = 0
// F7 (2026-08-07): track the pending retry timer so HMR/unload can cancel
// it (previously the setTimeout chain had no cancellation path) and so the
// cap-exhaustion give-up is surfaced instead of silent.
let hydrateTimer: number | null = null
const tryHydrate = (): void => {
    const didHydrate = hydrateFromLegacyState()
    hydrateAttempts += 1
    if (didHydrate) return
    if (hydrateAttempts < 60) {
        hydrateTimer = window.setTimeout(tryHydrate, 500)
    } else {
        debugError('[main] legacy-state hydration failed after 60 attempts — app may be degraded')
    }
}
function clearHydrateTimer(): void {
    if (hydrateTimer !== null) {
        clearTimeout(hydrateTimer)
        hydrateTimer = null
    }
}
tryHydrate()

// ── __TEST_STATE__ sync (visual settle for Playwright surface/visual tests) ──

type TestCompatWindow = Window & {
    __APP_STATE__?: unknown
    __TEST_STATE__?: unknown
    __LEGACY_APP_STATE__?: unknown
    __refreshTestCompatState__?: () => void
    withStateMutation?: (fn: () => void) => void
}

let latestTestState: unknown = null
let testCompatProxy: Record<string, unknown> | null = null

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function getCompatSources(): {
    legacyState: Record<string, unknown>
    svelteState: Record<string, unknown>
} {
    const w = window as TestCompatWindow
    return {
        legacyState: asRecord(w.__LEGACY_APP_STATE__),
        svelteState: asRecord(latestTestState)
    }
}

function getCompatNavState(): Record<string, unknown> {
    const { legacyState, svelteState } = getCompatSources()
    const liveNav = (() => {
        try {
            return { ...get(navStore) }
        } catch (_e) {
            return {}
        }
    })()
    return {
        ...asRecord(legacyState.navState),
        ...asRecord(svelteState.navState),
        ...liveNav
    }
}

function getCompatValue(prop: string | symbol): unknown {
    if (typeof prop !== 'string') return undefined
    const { legacyState, svelteState } = getCompatSources()
    if (prop === 'navState') return getCompatNavState()
    // F1 regression probe (2026-07-15): live snapshot of the Points geometry
    // position attribute, so journey tests can verify the dominant
    // points-instanced-field layer tracks state.nodePositions during the
    // focus-pocket gather (previously the geometry was written once at
    // creation and never updated — the pocket was invisible in the Points layer).
    if (prop === 'pointsGeometryPositions') {
        const mesh = webglContext.pointsMesh
        const attr = mesh?.geometry?.attributes?.position
        if (!attr) return null
        return Array.from(attr.array as Float32Array)
    }
    // F14 probe (2026-07-15): live snapshot of the Points geometry color attribute
    // so journey tests can verify pocket-vs-field contrast after field-dim.
    if (prop === 'pointsGeometryColors') {
        try {
            const attr = webglContext.pointsMesh?.geometry?.attributes?.color
            return attr ? Array.from(attr.array as Float32Array) : null
        } catch {
            return null
        }
    }
    // F15 probe (2026-07-15): live opacity of the focus semantic overlay line material.
    if (prop === 'focusSemanticLineOpacity') {
        try {
            const line = appState.focusSemanticLines
            if (!line) return null
            const mat = line.material
            const m = Array.isArray(mat) ? mat[0] : mat
            return m?.opacity ?? null
        } catch {
            return null
        }
    }
    // F15 probe (2026-07-15): anchor→satellite thread edge pairs so journey tests
    // can assert the anchor-only invariant (every edge touches the focused anchor).
    if (prop === 'focusSemanticConnectionPairs') {
        try {
            const pairs = appState.focusSemanticConnectionPairs
            if (!Array.isArray(pairs)) return null
            return pairs.map((p: { a?: number; b?: number }) => [p?.a ?? -1, p?.b ?? -1])
        } catch {
            return null
        }
    }
    // F16 probe (2026-07-15): twin-mesh pocket size overlay info (count + size).
    if (prop === 'focusPocketSizeMeshInfo') {
        try {
            const mesh = appState.focusPocketSizeMesh
            if (!mesh) return null
            const ids = mesh.userData?.indices
            const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
            const size = mat && 'size' in mat ? (mat as { size: number }).size : null
            return { count: Array.isArray(ids) ? ids.length : 0, size }
        } catch {
            return null
        }
    }
    if (prop === 'state') {
        return {
            ...asRecord(legacyState.state),
            ...asRecord(svelteState.state),
            currentView: svelteState.currentView ?? legacyState.currentView,
            navState: getCompatNavState(),
            points: legacyState.points as unknown
        }
    }
    const svelteValue = svelteState[prop]
    if (svelteValue !== undefined) return svelteValue
    const legacyValue = legacyState[prop]
    if (legacyValue !== undefined) return legacyValue
    // Backward-compat fallback for fields that live under `focusState` /
    // `searchState` at runtime but legacy contract tests still query at
    // the flat appState.* path. Without this, snapshots racing the async
    // init clear see `undefined` and assertions like
    // `expect(snap.selectedPoint).toBeNull()` fail. See
    // tmp/selectedPoint-bug-audit-2026-06-29.md Section 4(c).
    if (typeof prop === 'string') {
        if (prop === 'selectedPoint') {
            const nested = (legacyState as unknown as { focusState?: { selectedPoint?: unknown } }).focusState
                ?.selectedPoint
            if (nested !== undefined) return nested
        }
        if (prop === 'currentSearchSummary') {
            const nested = (legacyState as unknown as { searchState?: { currentSearchSummary?: unknown } }).searchState
                ?.currentSearchSummary
            if (nested !== undefined) return nested
        }
    }
    // Fallback to Svelte appState for properties not synced to legacy/testState
    return legacyState[prop]
}

function createTestCompatProxy(): Record<string, unknown> {
    return new Proxy(
        {},
        {
            get(_target, prop) {
                return getCompatValue(prop)
            },
            set(_target, prop, value) {
                if (typeof prop !== 'string') return false
                const { legacyState } = getCompatSources()
                legacyState[prop] = value
                // Also write to Svelte appState so tests that target the
                // Svelte build see their mutations reflected in the UI.
                if (appState) {
                    {
                        if (prop === 'weatherState') {
                            appState.weatherState = value as {
                                weather: WeatherData | null
                                lastFetch: number | null
                                fallback: boolean
                                stalenessMsg: string
                            }
                        } else if (prop === 'currentView') {
                            // Route the test-compat currentView write through the
                            // canonical view-transition helper so the navStore
                            // mirror + VIEW_CHANGED event stay in sync. The bare
                            // `appState.currentView = …` alias door bypassed the
                            // mirror (wrote navState.currentView directly).
                            setCurrentView(value as ViewName)
                        } else if (prop === 'weather') {
                            appState.weather = value
                        } else if (prop === 'currentSearchSummary') {
                            appState.searchState.currentSearchSummary = value as SearchSummary
                            // Keep the searchStore writable in sync so parity-attrs
                            // recomputes panelSurface/graphContext for tests that
                            // write through the compat proxy.
                            setSearchSummary(value as SearchSummary | null)
                        } else if (prop === 'points') {
                            appState.points = value as Point[]
                        } else if (prop === 'focusedNode') {
                            void import('@lib/journey/thread-settler')
                                .then((m) => m.setFocusedNode(value === null ? null : (value as number)))
                                .catch((err) => console.warn('[lazify] thread-settler focus failed', err))
                            // Keep navStore in sync for parity-attrs.
                            setFocusedIndex(value === null ? null : (value as number))
                        } else if (prop === 'selectedPoint') {
                            // Keep focusStore.selectedBusiness in sync for parity-attrs.
                            focusStore.update((s) => ({
                                ...s,
                                selectedBusiness: value as BusinessRecord | null
                            }))
                        } else if (prop === 'navState' && value && typeof value === 'object') {
                            // Preserve the reactive $state navState object; merge
                            // the test-supplied patch in place instead of replacing it.
                            Object.assign(appState.navState, value)
                            // Keep the navStore writable in sync so tests that
                            // read back s.navState see the mutated mode/trailDepth.
                            navStore.set(appState.navState as NavState)
                        } else if (prop === 'focusState' && value && typeof value === 'object') {
                            Object.assign(appState.focusState, value)
                        } else if (prop === 'searchState' && value && typeof value === 'object') {
                            Object.assign(appState.searchState, value)
                        }
                    }
                }
                return true
            },
            has(_target, prop) {
                if (typeof prop !== 'string') return false
                const { legacyState, svelteState } = getCompatSources()
                return prop in legacyState || prop in svelteState || prop === 'state'
            },
            ownKeys() {
                const { legacyState, svelteState } = getCompatSources()
                return Array.from(new Set([...Reflect.ownKeys(legacyState), ...Reflect.ownKeys(svelteState), 'state']))
            },
            getOwnPropertyDescriptor(_target, prop) {
                return {
                    configurable: true,
                    enumerable: true,
                    value: getCompatValue(prop)
                }
            },
            deleteProperty(_target, prop) {
                if (typeof prop !== 'string') return false
                const { legacyState } = getCompatSources()
                return delete legacyState[prop]
            }
        }
    )
}

function publishTestCompatState(): void {
    const w = window as TestCompatWindow
    testCompatProxy ??= createTestCompatProxy()
    w.__TEST_STATE__ = testCompatProxy
    w.__APP_STATE__ = testCompatProxy as unknown as typeof w.__APP_STATE__
}

window.__refreshTestCompatState__ = publishTestCompatState
window.withStateMutation = withStateMutation
const unsubTestState = testState.subscribe((value) => {
    latestTestState = value
    publishTestCompatState()
})
const cleanupWindowActions = installWindowActions()

// ── Cleanup on page unload ────────────────────────────────────────────────

// Shared teardown for the tests-state subscription, window actions, journey
// WebGL preload, app-init, and the mounted App. Extracted so the same logic
// can back both the real `beforeunload` path and the Vite HMR dispose path.
function disposeAppListeners(): void {
    clearHydrateTimer()
    terminateDataLoaderWorkers()
    unsubTestState()
    cleanupWindowActions()
    disposeJourneyWebglPreload()
    disposeFocusTrapBindings()
    teardownToastHooks()
    appInitCleanup?.()
    disposeGlobalErrorSink()
    if (app) unmount(app)
}

// Use `{ once: true }` so the listener auto-removes after it fires, preventing
// accumulation across HMR reloads (each re-execution re-adds the listener).
window.addEventListener('beforeunload', disposeAppListeners, { once: true })

// Hot Module Replacement (dev mode only): Vite re-executes this module on
// every hot reload, but unlike page navigation it does not fire
// `beforeunload`. Without explicit cleanup, appInit subscriptions, window
// listeners, gesture-monitor timers, and the previously mounted App all
// leak across reloads -- visible as duplicate subscriptions, growing
// memory, and stale renders in dev.
//
// Mirror the beforeunload cleanup in import.meta.hot.dispose so dev
// sessions stay sane. Production builds tree-shake this branch.
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        disposeAppListeners()
        // { once: true } on the beforeunload listener handles auto-removal;
        // no explicit removeEventListener needed.
        // disposeFocusTrapBindings is called via disposeAppListeners above.
        teardownGestureMonitor()
        appInitCleanup?.()
        if (app) unmount(app)
    })
}

export default app
