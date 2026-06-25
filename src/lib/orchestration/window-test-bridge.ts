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
import { navStore } from '@lib/stores/navigation.svelte'
import { focusStore } from '@lib/stores/focus.svelte'
import { appState } from '@lib/state/app.svelte'
import {
    returnToOverview as returnToOverviewAction,
    focusOnNode as focusOnNodeAction,
    setTrailDepth as setTrailDepthAction,
    refreshCompositionState as refreshCompositionStateAction,
    setSemanticDiveMode as setSemanticDiveModeAction,
    resetExplorationFocus as resetExplorationFocusAction,
    resetExperienceState as resetExperienceStateAction
} from '@lib/orchestration/lifecycle'
import { switchView as switchViewAction } from '@lib/orchestration/view-controller'
import { search } from '@lib/search/state'
import { setTrailFromSeed } from '@lib/journey/neighborhood'
import {
    inspectThreadNeighbor,
    pinThreadNeighbor,
    pinFirstAvailableNeighbor,
    unpinThreadInspection,
    clearThreadInspection
} from '@lib/journey/thread-inspector'
import { traverseNeighbor, walkThreadNeighbor } from '@lib/journey/thread-settler'
import { updateTraversalUi } from '@lib/journey/focus-ui'
import { requestSemanticGuide } from '@lib/journey/semantic-guide'
import { showSemanticThreadsDetail } from '@lib/journey/connection-analysis'

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
    const refreshTraversalUiForCompatAction = (action: string): void => {
        updateTraversalUi()
    }

    const actions: Record<string, (...args: unknown[]) => unknown> = {
        switchView: (view: string) => switchViewAction(view),
        focusOnNode: (index: number, options?: Record<string, unknown>) => {
            const result = focusOnNodeAction(index, options)
            refreshTraversalUiForCompatAction('focusOnNode')
            return result
        },
        setTrailDepth: (depth: number, _options?: Record<string, unknown>) => {
            setTrailDepthAction(depth)
            refreshTraversalUiForCompatAction('setTrailDepth')
        },
        setSemanticDiveMode: (enabled: boolean) => setSemanticDiveModeAction(enabled),
        refreshCompositionState: () => {
            refreshCompositionStateAction()
            refreshTraversalUiForCompatAction('refreshCompositionState')
        },
        resetExplorationFocus: (options?: Record<string, unknown>) => resetExplorationFocusAction(options),
        resetExperienceState: () => resetExperienceStateAction(),
        clearSearch: () => returnToOverviewAction(),
        returnToOverview: () => returnToOverviewAction(),
        search: (query: string, options?: Record<string, unknown>) => search(query, options),
        setTrailFromSeed: (index: number) => setTrailFromSeed(index),
        traverseNeighbor: (step: number) => traverseNeighbor(step),
        walkThreadNeighbor: (index: number, options?: Record<string, unknown>) =>
            walkThreadNeighbor(index, options),
        inspectThreadNeighbor: (index: number, options?: Record<string, unknown>) =>
            inspectThreadNeighbor(index, options),
        pinThreadNeighbor: (index: number, options?: Record<string, unknown>) => pinThreadNeighbor(index, options),
        pinFirstAvailableNeighbor: (options?: Record<string, unknown>) => pinFirstAvailableNeighbor(options),
        unpinThreadInspection: () => unpinThreadInspection(),
        clearThreadInspection: (options?: Record<string, unknown>) => clearThreadInspection(options),
        requestSemanticGuide: (_point?: unknown) => requestSemanticGuide(),
        showSemanticThreadsDetail: () => showSemanticThreadsDetail()
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
            const liveAppState =
                (window as unknown as Record<string, unknown>)[APP_STATE_DIRECT_KEY] || appState
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

    return () => {
        if (window.__APP_STATE__ && typeof window.__APP_STATE__ === 'object' && 'state' in window.__APP_STATE__) {
            delete window.__APP_STATE__
        }
        delete window.__APP_ACTIONS__
    }
}