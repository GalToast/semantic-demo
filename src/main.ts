/**
 * @/main.ts — Svelte 5 app entry point
 *
 * Imports App.svelte and mounts to #app target using the Svelte 5 `mount` API.
 * Initializes stores from URL params (?demo=force, ?nodemo=1).
 */
import { mount, unmount } from 'svelte'
import App from './App.svelte'
// W5-T3: LegacyCompassSurface is now lazy-loaded by App.svelte via
// requestIdleCallback (scheduleIdleComponentImport). Removed static
// import here to keep it off the cold-load main-thread critical path.
import { testState } from '@lib/stores/index.svelte.ts'
import { installWindowActions } from '@lib/orchestration/window-actions'
import { installGestureMonitor } from '@lib/orchestration/wait-for-gesture'
import { engineReady } from '@lib/stores/engine-ready.svelte'
import { hydrateFromLegacyState } from '@lib/data-store'
import type { WeatherData } from '@lib/utils/weather'
import { appState } from '@lib/state/app.svelte.ts'
import type { ViewName } from '@lib/state/state-types'
import { appInit } from '@lib/orchestration/app-init'
import { legacyState } from '@lib/state/legacy-state-adapter'
import { preloadJourneyWebgl } from '@lib/engine/journey-webgl-lazy'
import { getInitialRenderKind } from '@lib/orchestration/responsive-renderer'
import './lib/css/biofield.css'
import { debugError } from '@lib/utils/debug'

// ── URL parameter initialization ──────────────────────────────────────────────

function parseUrlParams(): { forceDemo: boolean; noDemo: boolean } {
    const params = new URLSearchParams(window.location.search)
    return {
        forceDemo: params.get('demo') === 'force',
        noDemo: params.get('nodemo') === '1'
    }
}

// ── Mount ─────────────────────────────────────────────────────────────────────

const { forceDemo, noDemo } = parseUrlParams()
const mountTarget = document.getElementById('app') ?? document.getElementById('app-root')
let app: ReturnType<typeof mount> | undefined

// Ensure legacy state is exposed on window before any async data loads
// so that semantic-threads.ts (which may fall back to window.__APP_STATE__)
// writes to the real state object instead of an empty placeholder.
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
appInit({ forceDemo, noDemo })
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
engineReady.subscribe((ready) => {
    if (!ready || journeyWebglPreloaded) return
    journeyWebglPreloaded = true
    // Dynamic import to keep Three.js out of the main bundle
    import('@lib/journey/route-trace')
        .then(({ initRouteTraceSubscriptions }) => {
            initRouteTraceSubscriptions()
        })
        .catch(() => {})
    // Preload journey WebGL overlay modules so they're available when the
    // user first opens the thread inspector or reaches the arrival phase.
    preloadJourneyWebgl()
})

// ── W6-T1 gesture-driven engine-ready signal ─────────────────────────────────
// The engine waits for first user gesture (or visibility flip) before any
// heavy init runs from <Canvas defer />. Idempotent — safe to call once.
//
// W45-A: Set the render kind on body BEFORE installing the gesture monitor so
// the monitor can skip auto-fire when the 2D placeholder is shown on mobile.
if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.renderKind = getInitialRenderKind()
}
const teardownGestureMonitor = installGestureMonitor({
    onReady: () => engineReady.signalReady()
})
window.addEventListener('beforeunload', () => teardownGestureMonitor(), { once: true })

// Hydrate Svelte stores from the legacy state after mount.
// The legacy init path sets __APP_STATE__ asynchronously; retry until the
// data is present or the cap is reached.
let hydrateAttempts = 0
const tryHydrate = (): void => {
    const didHydrate = hydrateFromLegacyState()
    hydrateAttempts += 1
    if (didHydrate) return
    if (hydrateAttempts < 60) {
        window.setTimeout(tryHydrate, 500)
    }
}
tryHydrate()

// ── __TEST_STATE__ sync (visual settle for Playwright surface/visual tests) ──

type TestCompatWindow = Window & {
    __APP_STATE__?: unknown
    __TEST_STATE__?: unknown
    __LEGACY_APP_STATE__?: unknown
    __refreshTestCompatState__?: () => void
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
    return {
        ...asRecord(legacyState.navState),
        ...asRecord(svelteState.navState)
    }
}

function getCompatValue(prop: string | symbol): unknown {
    if (typeof prop !== 'string') return undefined
    const { legacyState, svelteState } = getCompatSources()
    if (prop === 'navState') return getCompatNavState()
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
                if (prop === 'weatherState' && appState) {
                    appState.weatherState = value as {
                        weather: WeatherData | null
                        lastFetch: number | null
                        fallback: boolean
                        stalenessMsg: string
                    }
                } else if (prop === 'currentView' && appState) {
                    appState.currentView = value as ViewName
                } else if (prop === 'weather' && appState) {
                    appState.weather = value
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
    w.__APP_STATE__ = testCompatProxy
}

window.__refreshTestCompatState__ = publishTestCompatState
const unsubTestState = testState.subscribe((value) => {
    latestTestState = value
    publishTestCompatState()
})
const cleanupWindowActions = installWindowActions()

// ── Cleanup on page unload ────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
    unsubTestState()
    cleanupWindowActions()
    appInitCleanup?.()
    if (app) unmount(app)
})

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
        unsubTestState()
        cleanupWindowActions()
        teardownGestureMonitor()
        appInitCleanup?.()
        if (app) unmount(app)
    })
}

export default app
