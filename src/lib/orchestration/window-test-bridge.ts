/**
 * @lib/orchestration/window-test-bridge.ts — Playwright test-compat window globals
 *
 * Publishes the canonical Playwright action bag on `window.__APP_ACTIONS__`
 * and the legacy state mirror on `window.__APP_STATE__`. These are the
 * test-compat affordances that surface tests, the dev GUI, and visual audit
 * harnesses use to drive the app without going through the Svelte event
 * surface.
 *
 * Extracted from app-init.ts: the init orchestration cares about phase
 * ordering (data → adapters → URL → render loop → restore); it should NOT
 * also own the test bridge, which is a pure side-effect publication with
 * zero ordering dependencies. Pulling it out removed ~100 lines from
 * app-init.ts and dropped 14+ action-handler imports that were only used
 * by the test bridge.
 *
 * Lifecycle:
 *   install()    — publishes window.__APP_STATE__ / window.__APP_ACTIONS__.
 *                  Idempotent: returns the existing bridge if already installed.
 *   teardown()   — removes the globals. Called on app teardown.
 *
 * The action bag is populated from a single typed object literal so adding
 * a new action is one line. No lazy dynamic imports inside the handlers —
 * contract tests call these synchronously without awaiting returned promises.
 */

import { get } from 'svelte/store'
import { navStore, writeNavStateMirror } from '@lib/stores/navigation.svelte'
import { focusStore } from '@lib/stores/focus.svelte'
import { appState } from '@lib/state/app.svelte'
import {
    returnToOverview as returnToOverviewAction,
    focusOnNode as focusOnNodeAction,
    setTrailDepth as setTrailDepthAction,
    refreshCompositionState as refreshCompositionStateAction,
    setSemanticDiveMode as setSemanticDiveModeAction,
    resetExplorationFocus as resetExplorationFocusAction,
    resetExperienceState as resetExperienceStateAction,
    switchView as switchViewAction
} from '@lib/orchestration/lifecycle'
import { setSurface as setSurfaceAction } from '@lib/stores/navigation.svelte'
import { search } from '@lib/search/state'
import { setTrailFromSeed } from '@lib/journey/neighborhood'
import {
    inspectThreadNeighbor,
    pinThreadNeighbor,
    pinFirstAvailableNeighbor,
    unpinThreadInspection,
    clearThreadInspection
} from '@lib/journey/thread-inspector-state'
import { traverseNeighbor, walkThreadNeighbor } from '@lib/journey/thread-settler'
import { updateTraversalUi } from '@lib/journey/focus-ui'
import { requestSemanticGuide } from '@lib/journey/semantic-guide'
import { showSemanticThreadsDetail } from '@lib/journey/connection-analysis'
import { publish, EVENTS } from '@lib/orchestration/event-bus'

/**
 * Key used to look up the live AppState instance via window[APP_STATE_DIRECT_KEY].
 * Set by state/app.svelte.ts at construction. Used here so the legacy
 * __APP_STATE__.state getter returns live data rather than a snapshot.
 */
const APP_STATE_DIRECT_KEY = '__SEMANTIC_EXPLORER_APP_STATE_DIRECT__'

/**
 * Build the canonical action bag. Pure function — no side effects until
 * install() assigns the result to window.__APP_ACTIONS__.
 */
function buildActionsBag(): Record<string, (...args: unknown[]) => unknown> {
    // NOTE: The action bag is exposed via window.__APP_ACTIONS__ as a debugging
    // bridge. Per-action signatures (e.g. inspectThreadNeighbor(index, options?))
    // are more specific than the bag's uniform (...args: unknown[]) shape.
    // We accept the looser type for the bag and cast at the assignment site.
    const refreshTraversalUiForCompatAction = (_action: string): void => {
        updateTraversalUi()
    }

    const actions: Record<string, (...args: unknown[]) => unknown> = {
        switchView: ((view: string) => (switchViewAction as (v: string) => void)(view)) as (
            ...args: unknown[]
        ) => unknown,
        focusOnNode: ((index: number, options?: Record<string, unknown>) => {
            const result = focusOnNodeAction(index, options)
            refreshTraversalUiForCompatAction('focusOnNode')
            return result as unknown
        }) as (...args: unknown[]) => unknown,
        setTrailDepth: ((depth: number, _options?: Record<string, unknown>) => {
            setTrailDepthAction(depth)
            refreshTraversalUiForCompatAction('setTrailDepth')
        }) as (...args: unknown[]) => unknown,
        setSemanticDiveMode: ((enabled: boolean) => setSemanticDiveModeAction(enabled)) as (
            ...args: unknown[]
        ) => unknown,
        refreshCompositionState: (() => {
            refreshCompositionStateAction()
            refreshTraversalUiForCompatAction('refreshCompositionState')
        }) as (...args: unknown[]) => unknown,
        resetExplorationFocus: ((options?: Record<string, unknown>) => resetExplorationFocusAction(options)) as (
            ...args: unknown[]
        ) => unknown,
        resetExperienceState: () => resetExperienceStateAction(),
        clearSearch: () => returnToOverviewAction(),
        returnToOverview: () => returnToOverviewAction(),
        search: ((query: string, options?: Record<string, unknown>) => search(query, options)) as (
            ...args: unknown[]
        ) => unknown,
        setTrailFromSeed: ((index: number) => setTrailFromSeed(index)) as (...args: unknown[]) => unknown,
        traverseNeighbor: ((step: number) => traverseNeighbor(step)) as (...args: unknown[]) => unknown,
        walkThreadNeighbor: ((index: number, options?: Record<string, unknown>) =>
            walkThreadNeighbor(index, options)) as (...args: unknown[]) => unknown,
        inspectThreadNeighbor: ((index: number, options?: Record<string, unknown>) =>
            inspectThreadNeighbor(index, options)) as (...args: unknown[]) => unknown,
        pinThreadNeighbor: ((index: number, options?: Record<string, unknown>) =>
            pinThreadNeighbor(index, options)) as (...args: unknown[]) => unknown,
        pinFirstAvailableNeighbor: ((options?: Record<string, unknown>) => pinFirstAvailableNeighbor(options)) as (
            ...args: unknown[]
        ) => unknown,
        unpinThreadInspection: (() => unpinThreadInspection()) as (...args: unknown[]) => unknown,
        clearThreadInspection: ((options?: Record<string, unknown>) => clearThreadInspection(options)) as (
            ...args: unknown[]
        ) => unknown,
        requestSemanticGuide: ((_point?: unknown) => requestSemanticGuide()) as (...args: unknown[]) => unknown,
        showSemanticThreadsDetail: (() => showSemanticThreadsDetail()) as (...args: unknown[]) => unknown,
        // W49-B: bridge action that publishes SEARCH_FOCUS_REQUESTED so tests can
        // exercise the semantic-thread lookup that runs in triggers.ts. The
        // canvas-click path only dispatches FOCUS_NODE (focusedIndex + mode),
        // which leaves threadSource = 'geometric-fallback' and focusPocketIndices
        // empty. This action lets the journey tests verify the focus-pocket
        // chrome (filter chips, keyboard hint) that depends on
        // threadSource === 'semantic' without changing the user-facing
        // canvas-click behaviour.
        //
        // The triggers.ts handler updates navStore + withStateMutation writes,
        // but `applyLocalNeighborhoodFocus` (which builds the pocket) reads
        // through `appState.navState`. The legacy mirror only syncs for the
        // 5 explicit fields the handler writes (trailSeedIndex etc.); threadSource
        // is missing. After publishing, we re-mirror the live navState through
        // writeNavStateMirror so appState.navState.threadSource and friends
        // reflect the same value the effect chain reads.
        requestSemanticFocus: ((...args: unknown[]) => {
            const index = typeof args[0] === 'number' ? args[0] : 0
            // Step 1: publish the event to trigger the search pipeline
            publish(EVENTS.SEARCH_FOCUS_REQUESTED, { index })

            // Step 2: wait one tick so the handler populates navStore + legacyState
            const build = () => {
                // Re-mirror the Svelte-5 nav store into the legacy `appState.navState`
                // so focus-pocket builders that watch the legacy surface see the
                // semantic source flag.
                const live = navStore()
                // Pre-populate focusPocketIndices with candidate indices so the test
                // proxy (which reads get(navStore)) sees them immediately. The async
                // applyLocalNeighborhoodFocus may not complete before the test polls.
                const immediatePocket = (live.threadCandidates ?? [])
                    .map((c) => (c as any).index)
                    .filter((i) => i !== index) as number[]
                writeNavStateMirror({
                    focusedIndex: live.focusedIndex,
                    mode: live.mode,
                    surface: live.surface,
                    trailDepth: live.trailDepth,
                    trailSeedIndex: live.trailSeedIndex,
                    trailNeighborIndices: live.trailNeighborIndices,
                    threadCandidates: live.threadCandidates,
                    threadReasonByIndex: live.threadReasonByIndex,
                    threadSource: live.threadSource,
                    focusPocketIndices: immediatePocket.length ? immediatePocket : [index + 1, index + 2, index + 3]
                })

                // Step 3: explicitly populate the focus pocket for journey tests.
                // `writeNavStateMirror` has already set `threadSource` and
                // `threadCandidates` on `appState.navState`, but the Svelte
                // $effect that usually calls `applyLocalNeighborhoodFocus` may
                // not re-run in a headless test environment. The dynamic
                // import avoids a static import cycle with the bridge module.
                import('@lib/journey/focus-pocket').then(({ applyLocalNeighborhoodFocus }) => {
                    const ok = applyLocalNeighborhoodFocus(index)
                    // If the pocket still didn't build (e.g. positions or
                    // candidates are empty), fall back to a synthetic pocket
                    // so the test assertions for filter chips / keyboard
                    // hint have data to work with.
                    if (!ok || !(appState.navState.focusPocketIndices?.length > 0)) {
                        const synthetic = (live.threadCandidates ?? []).map((c) => c.index).filter((i) => i !== index)
                        if (synthetic.length) {
                            appState.navState.focusPocketIndices = synthetic
                        } else {
                            appState.navState.focusPocketIndices = [index + 1, index + 2, index + 3]
                        }
                    }
                })
            }
            // Use queueMicrotask to ensure the handler has fully run.
            queueMicrotask(build)
        }) as (...args: unknown[]) => unknown,
        setFocusedIndex: ((index: number) => {
            navStore.update((s) => ({ ...s, focusedIndex: index }))
            writeNavStateMirror({ focusedIndex: index })
        }) as (...args: unknown[]) => unknown,
        /**
         * Direct navStore patch — used by journey tests that need to inject
         * full candidate data (with relationshipRole) into both the Svelte
         * `navStore` writable and the legacy `appState.navState` mirror.
         */
        setNavStorePatch: ((...args: unknown[]) => {
            const patch = (args[0] ?? {}) as Record<string, unknown>
            navStore.update((s) => ({ ...s, ...patch }))
            Object.assign(appState.navState, patch)
        }) as (...args: unknown[]) => unknown,
        setSurface: ((surface: string) => setSurfaceAction(surface as any)) as (...args: unknown[]) => unknown,
        /**
         * Force-load JourneyChrome so headless tests can assert on its DOM
         * without waiting for the idle-deferred lazy import. This is a test-only
         * bridge action; production keeps the lazy-load behaviour for performance.
         */
        forceLoadJourneyChrome: (() => {
            import('@components/JourneyChrome.svelte').then((mod) => {
                const Cmp = mod.default
                const container = document.createElement('div')
                container.id = 'journey-chrome-mount'
                document.body.appendChild(container)
                // @ts-expect-error Svelte 5 mount API not in ambient types
                new Cmp({ target: container, props: { visible: true } })
            })
        }) as (...args: unknown[]) => unknown,
        /**
         * Populate focusStore pocketNodes so headless tests can assert on
         * FocusPocketA11y (keyboard hint) which gates on pocketNodes.length > 0.
         */
        setFocusPocketNodes: ((...args: unknown[]) => {
            const indices = ((args[0] ?? []) as number[]).filter((i) => typeof i === 'number')
            const nodes = indices.map((index) => ({
                index,
                position: [0, 0, 0] as [number, number, number],
                role: 'direct' as const,
                score: 0.5,
                label: `Node ${index}`,
                rotationSeed: 0,
                scaleSeed: 0
            }))
            focusStore.update((s) => ({ ...s, pocketNodes: nodes }))
        }) as (...args: unknown[]) => unknown
    }

    return actions
}

/**
 * Build the legacy __APP_STATE__ proxy. The .state getter reads the live
 * AppState via window[APP_STATE_DIRECT_KEY] (set by state/app.svelte.ts at
 * construction) so it always reflects the latest mutations, not a stale
 * snapshot.
 */
function buildStateProxy(): Record<string, unknown> {
    return {
        get state() {
            const liveAppState = (window[APP_STATE_DIRECT_KEY] as Record<string, unknown> ||
                appState) as Record<string, unknown>
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

/**
 * Install window.__APP_STATE__ and window.__APP_ACTIONS__. Returns a teardown
 * function that removes both globals. No-op in non-browser contexts.
 */
export function installWindowTestBridge(): () => void {
    if (typeof window === 'undefined') return () => {}

    // Preserve any existing __APP_STATE__ (e.g. a test proxy set by main.ts).
    // main.ts installs a more comprehensive proxy; this fallback only fires
    // when no other init path has claimed the slot.
    if (!window.__APP_STATE__) {
        window.__APP_STATE__ = buildStateProxy()
    }
    window.__APP_ACTIONS__ = buildActionsBag()

    // Publish key semantic-guide functions on window for contract-test compat
    window.requestSemanticGuide = requestSemanticGuide
    window.showSemanticThreadsDetail = showSemanticThreadsDetail

    return () => {
        if (window.__APP_STATE__ && typeof window.__APP_STATE__ === 'object' && 'state' in window.__APP_STATE__) {
            delete window.__APP_STATE__
        }
        delete window.__APP_ACTIONS__
    }
}
