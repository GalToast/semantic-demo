/**
 * @lib/stores/lifecycle — Lifecycle helpers ported from *.js
 *
 * Functions here read from and write to the Svelte stores (navStore,
 * focusStore, searchStore, journeyStore) and derive body data attributes
 * for CSS composition.  The event-bus publish() call keeps the legacy
 * engine bridge subscribers in sync.
 *
 * The 3 working delegates (setTrailDepth, setMyceliumMode,
 * setSemanticDiveMode) remain unchanged.
 */
import { get } from 'svelte/store'
import {
    navStore,
    updateNavState,
    switchView,
    currentView,
    setMyceliumMode as _setMyceliumMode
} from './navigation.svelte'
import { applyParityAttributes, computeParityAttributes } from '../orchestration/parity-attrs.svelte'
import { setSemanticDiveMode as _setSemanticDiveMode, focusStore, resetFocus } from './focus.svelte'
import { searchStore, clearSearch, clearSearchGlow, setSearchStatus } from './search.svelte'
import { resetJourney, setTrailDepth as _setTrailDepth } from './journey.svelte'
import { publish, EVENTS } from '../orchestration/event-bus'

// ── Delegates to real stores ─────────────────────────────────────────────────

export function setTrailDepth(depth: number, _options?: unknown): void {
    const nextDepth = Math.max(0, Number(depth) || 0)
    _setTrailDepth(nextDepth)
    updateNavState({ trailDepth: nextDepth })

    if (typeof window !== 'undefined') {
        const stateWindow = window as Window & {
            __APP_STATE__?: Record<string, unknown> & { navState?: Record<string, unknown> }
            __TEST_STATE__?: Record<string, unknown> & { navState?: Record<string, unknown> }
            __LEGACY_APP_STATE__?: Record<string, unknown> & { navState?: Record<string, unknown> }
            __semanticState?: Record<string, unknown> & { navState?: Record<string, unknown> }
            state?: Record<string, unknown> & { navState?: Record<string, unknown> }
        }
        for (const appState of [
            stateWindow.__APP_STATE__,
            stateWindow.__TEST_STATE__,
            stateWindow.__LEGACY_APP_STATE__,
            stateWindow.__semanticState,
            stateWindow.state
        ]) {
            if (!appState) continue
            appState.trailDepth = nextDepth
            if (appState.navState) {
                appState.navState.trailDepth = nextDepth
            }
        }
    }
}
export const setSemanticDiveMode = _setSemanticDiveMode
export const setMyceliumMode = _setMyceliumMode

// ── Composition State (ported from ) ──────────────────

/**
 * Derive the graph-context from the current nav/search state.
 * Matches the legacy `deriveGraphContext` in lifecycle.js.
 */
function deriveGraphContext(
    _view: string,
    hasFocus: boolean,
    hasSearchIntent: boolean,
    mapContextOverride?: string
): string {
    if (mapContextOverride !== undefined) return mapContextOverride
    if (hasFocus && hasSearchIntent) return 'focus-search'
    if (hasFocus) return 'focus'
    if (hasSearchIntent) return 'search'
    return 'idle'
}

/**
 * Derive the panel surface label from view, graph context, semantic dive,
 * search intent, and focus state.
 * Matches the legacy `derivePanelSurface` in lifecycle.js.
 */
export function derivePanelSurface(opts: {
    view: string
    graphContext: string
    mapContext: string
    semanticDive: string
    hasSearchIntent: boolean
    hasFocus: boolean
    hasActiveTrailState: boolean
}): string {
    const { view, graphContext, mapContext, semanticDive } = opts
    if (view !== 'galaxy') {
        if (mapContext === 'focus-search') return 'map-focus-search'
        if (mapContext === 'focus') return 'map-focus'
        if (mapContext === 'search') return 'map-search'
        if (opts.hasActiveTrailState) return 'map-trail'
        return 'map-idle'
    }
    if (semanticDive === 'active' || semanticDive === 'transitioning') return 'semantic-dive'
    if (graphContext === 'focus-search') return 'focus-search'
    if (graphContext === 'focus') return 'focus'
    if (graphContext === 'search') return 'search'
    return 'idle'
}

/**
 * Apply current state to body data-attributes for CSS composition.
 *
 * Mirrored attrs (activeView, trailState, trailDepth, graphContext,
 * mapContext, semanticDive, panelSurface, panelSurfaceDetail) are
 * written by parity-attrs.svelte.ts via refreshCompositionState →
 * applyParityAttributes(computeParityAttributes()). We do not write them
 * here to avoid races.
 *
 * What lifecycle.ts still owns:
 *   - searchGlow — not in PARITY_ATTRIBUTES, no parity mirror
 *   - mobileRoutePeek + mobileRoutePeekReason — not in PARITY_ATTRIBUTES,
 *     managed here because we need the clear-on-graphContext !== 'idle' rule
 *
 * `derivePanelSurface` is still exported (line 83) for callers that need
 * the computed surface value without a DOM side effect (e.g., tests,
 * info-panel-state). This function does not call it.
 */
export function applyCompositionState(): void {
    const $nav = get(navStore)
    const $focus = get(focusStore)
    const $search = get(searchStore)

    const activeView = $nav.currentView || 'galaxy'
    const hasFocus = !!($nav.focusedIndex != null || $focus.selectedBusiness)
    const hasSearchIntent = !!($search.summary || $search.query.trim().length >= 2)

    const graphContext = deriveGraphContext(activeView, hasFocus, hasSearchIntent)

    const root = document.body
    if (root?.dataset) {
        // searchGlow is non-mirrored; parity-attrs does not own it.
        root.dataset.searchGlow = $search.glowActive ? 'active' : 'inactive'
        // mobileRoutePeek + reason are non-mirrored; clear them when
        // the user enters a non-idle surface so the peek affordance
        // doesn't stick around stale.
        if (graphContext !== 'idle') {
            delete root.dataset.mobileRoutePeek
            delete root.dataset.mobileRoutePeekReason
        }
    }

    // Setup global state mirrors for tests
    if (typeof window !== 'undefined') {
        const stateWindow = window as Window & {
            __APP_STATE__?: Record<string, unknown> & { navState?: Record<string, unknown> }
            __TEST_STATE__?: Record<string, unknown> & { navState?: Record<string, unknown> }
            __LEGACY_APP_STATE__?: Record<string, unknown> & { navState?: Record<string, unknown> }
            __semanticState?: Record<string, unknown> & { navState?: Record<string, unknown> }
            state?: Record<string, unknown> & { navState?: Record<string, unknown> }
        }
        for (const appSt of [
            stateWindow.__APP_STATE__,
            stateWindow.__TEST_STATE__,
            stateWindow.__LEGACY_APP_STATE__,
            stateWindow.__semanticState,
            stateWindow.state
        ]) {
            if (!appSt) continue
            appSt.focusedNode = hasFocus
                ? ($nav.focusedIndex ??
                  ($focus.selectedBusiness ? ($focus.selectedBusiness as { index?: number }).index : null) ??
                  null)
                : null
            appSt.selectedPoint = $focus.selectedBusiness
            appSt.semanticDiveMode = semanticDive === 'active'
            if (appSt.navState) {
                appSt.navState.focusedIndex = appSt.focusedNode
                appSt.navState.mode = $nav.mode
            }
        }
    }
}

/**
 * Refresh the composition state: apply body data-attributes and emit event.
 * This is the central "sync UI to state" function called after every
 * state mutation that affects the visual composition.
 */
export function refreshCompositionState(): void {
    applyCompositionState()
    // W15+ parity-attrs fix: the $effect.root() subscription in parity-attrs
    // doesn't fire reliably in the live browser. Force-write the full
    // parity attribute set on every composition refresh so body data-attrs
    // (mode, navMode, navSurface, panelSurfaceMode, journeyPhase, etc.) always
    // reflect the current Svelte 5 navStore. See tmp/parity-attrs-diagnostic-2026-06-17.md.
    applyParityAttributes(computeParityAttributes())
    publish(EVENTS.COMPOSITION_UPDATED)
}

/**
 * updateExplorationUi is a legacy alias for refreshCompositionState.
 * Matches the legacy lifecycle.js where both names pointed to the same impl.
 */
export function updateExplorationUi(): void {
    refreshCompositionState()
}

// ── Bloom / Bridge Indices (legacy state bridge) ────────────────────────────

/**
 * Get bloom indices from the legacy global state.
 * The bloom/bridge computation lives in the legacy lifecycle.js (recomputeBloomIndices)
 * and operates on the global state.points array, so we bridge through window.
 */
export function getBloomIndices(): number[] {
    const s = window.__semanticState as { bloomIndices?: Set<number> } | undefined
    if (!s?.bloomIndices) return []
    return Array.from(s.bloomIndices)
}

/**
 * Get bridge indices from the legacy global state.
 */
export function getBridgeIndices(): number[] {
    const s = window.__semanticState as { bridgeIndices?: Set<number> } | undefined
    if (!s?.bridgeIndices) return []
    return Array.from(s.bridgeIndices)
}

// ── Focus Reset (ported from ) ─────────────────

/**
 * Reset exploration focus: clears navState focus fields, trail depth,
 * semantic dive, mycelium mode, and optionally clears the search summary.
 * Matches the legacy `resetExplorationFocus` in lifecycle-reset.js.
 */
export function resetExplorationFocus(options?: {
    preserveSearch?: boolean
    skipSearchClearEvent?: boolean
    skipUrlSync?: boolean
}): void {
    const preserveSearch = options?.preserveSearch !== false

    updateNavState({
        focusedIndex: null,
        trailDepth: 0,
        trailDepthFromExploration: 0,
        mode: 'overview',
        surface: 'idle',
        previousSurface: 'idle',
        walkHistoryIndices: [],
        threadCandidates: [],
        trailNeighborIndices: [],
        threadReasonByIndex: new Map(),
        threadSource: ''
    })

    _setSemanticDiveMode(false)
    _setTrailDepth(0)
    resetJourney()

    resetFocus()
    clearSearchGlow()

    _setMyceliumMode('default')

    if (preserveSearch) {
        // Keep the search summary intact — only reset the focus/nav state.
    } else {
        clearSearch()
    }

    if (!options?.skipUrlSync) {
        publish(EVENTS.STATE_RESET, { reason: 'manual-reset', options })
    }

    if (typeof window !== 'undefined') {
        const stateWindow = window as Window & {
            __APP_STATE__?: Record<string, unknown> & { navState?: Record<string, unknown> }
            __TEST_STATE__?: Record<string, unknown> & { navState?: Record<string, unknown> }
            state?: Record<string, unknown> & { navState?: Record<string, unknown> }
        }
        for (const appState of [stateWindow.__APP_STATE__, stateWindow.__TEST_STATE__, stateWindow.state]) {
            if (!appState) continue
            appState.trailDepth = 0
            appState.semanticDiveMode = false
            appState.focusedNode = null
            if (appState.navState) {
                appState.navState.focusedIndex = null
                appState.navState.trailDepth = 0
                appState.navState.walkHistoryIndices = []
                appState.navState.threadCandidates = []
                appState.navState.trailNeighborIndices = []
                appState.navState.surface = 'idle'
                appState.navState.mode = 'overview'
            }
        }
    }

    // NOTE: body.dataset.threadInspectSurface + mapContext writes removed —
    // parity-attrs.svelte.ts derives both from store state. After the
    // appState.navState reset above (surface='idle', mode='overview'), the
    // mirror produces threadInspectSurface='idle' and mapContext='idle'.
    if (typeof document !== 'undefined' && document.body) {
        document.body.removeAttribute('data-focused-node')
    }

    refreshCompositionState()
}

/**
 * Reset positions: clear focus selection then reset exploration focus.
 * Matches the legacy `resetNodePositions` in lifecycle-reset.js.
 */
export function resetNodePositions(_options?: object): void {
    resetFocus()
    resetExplorationFocus(_options as Parameters<typeof resetExplorationFocus>[0])
}

// ── Experience Reset (ported from ) ─────────────

/**
 * Full experience reset: clears everything — focus, search, empty query,
 * glow, and the search input DOM element.
 * Matches the legacy `resetExperienceState` in lifecycle-reset.js.
 */
export function resetExperienceState(): void {
    resetExplorationFocus({ skipSearchClearEvent: true })

    searchStore.update((s) => ({
        ...s,
        summary: null,
        currentEmptyQuery: null,
        anchorIndex: null,
        previewIndex: null,
        glowActive: false,
        glowIndices: new Set()
    }))
    clearSearchGlow()

    // Clear the search input DOM element
    const searchInput = document.getElementById('search-input') as HTMLInputElement | null
    if (searchInput) searchInput.value = ''

    // Hide search results panel
    const searchResults = document.getElementById('search-results')
    if (searchResults) {
        searchResults.classList.remove('active')
        setTimeout(() => {
            if (!searchResults.classList.contains('active')) {
                searchResults.hidden = true
            }
        }, 450)
    }

    setSearchStatus('idle')
    refreshCompositionState()
    publish(EVENTS.STATE_RESET, { reason: 'manual-reset' })
}

/**
 * Return to the county overview: full experience reset + switch to galaxy view.
 * Matches the legacy `returnToOverview` in lifecycle-reset.js.
 */
export function returnToOverview(): void {
    resetExperienceState()
    if (currentView() !== 'galaxy') {
        switchView('galaxy')
    }
    refreshCompositionState()
}

// ── Search Glow (ported from ) ────────────

/**
 * Activate search glow on the field: sets the search summary and glow
 * indices so the Three.js renderer can highlight matching nodes.
 * Matches the legacy `activateSearchGlow` in lifecycle-search-sync.js.
 */
export function activateSearchGlow(summary?: unknown): void {
    const s = summary as
        | {
              resultIndices?: number[]
              summary?: unknown
              [key: string]: unknown
          }
        | undefined

    searchStore.update((st) => ({
        ...st,
        summary: (s?.summary as typeof st.summary) ?? st.summary,
        currentEmptyQuery: null,
        glowActive: true,
        glowIndices: new Set(s?.resultIndices ?? [])
    }))

    refreshCompositionState()
}

// ── Empty Query Tracking (ported from ) ───

/**
 * Get the last recorded empty query (for no-results fallback suggestions).
 * Matches the legacy `getCurrentEmptyQuery` selector.
 */
export function getCurrentEmptyQuery(): string | null {
    return get(searchStore).currentEmptyQuery ?? null
}

/**
 * Record an empty search query so the UI can show suggestions.
 * Matches the legacy `recordEmptySearch` in lifecycle-search-sync.js.
 *
 * Note (A3-2 fix, 2026-06-15): do NOT nullify `summary` here. `setSearchResults([])`
 * has just populated it with `{query, resultCount: 0, resultIndices: []}`,
 * which the elaborate `search-empty-state` branch in `SearchResults.svelte:351-360`
 * reads via `$searchState.summary?.query` to render. Nullifying here made
 * `$searchState.summary` (subscribed to the writable) diverge from
 * `appState.currentSearchSummary` and prevented the empty state from firing
 * after the static-dev fallback returned zero results.
 */
export function recordEmptySearch(query?: string): void {
    searchStore.update((s) => ({
        ...s,
        currentEmptyQuery: query ?? null
    }))
}

// ── Trail Review Overlay (ported from ) ───

let _trailReviewPreviouslyFocused: HTMLElement | null = null

/**
 * Show the trail-review overlay DOM element.
 * Matches the legacy `showExploreTrailReview` in lifecycle-search-sync.js.
 */
export function showExploreTrailReview(_summary?: unknown): void {
    const overlay = document.getElementById('trail-review-overlay')
    if (!overlay) return

    overlay.setAttribute('aria-hidden', 'false')
    overlay.hidden = false
    overlay.classList.add('visible')

    const closeBtn = overlay.querySelector('.trail-review-close') as HTMLElement | null
    if (closeBtn) {
        _trailReviewPreviouslyFocused = document.activeElement as HTMLElement | null
        closeBtn.focus()
    }
}

/**
 * Hide the trail-review overlay and restore focus.
 * Matches the legacy `hideExploreTrailReview` in lifecycle-search-sync.js.
 */
export function hideExploreTrailReview(): void {
    const overlay = document.getElementById('trail-review-overlay')
    if (overlay) {
        overlay.setAttribute('aria-hidden', 'true')
        overlay.hidden = true
        overlay.classList.remove('visible')

        if (_trailReviewPreviouslyFocused && typeof _trailReviewPreviouslyFocused.focus === 'function') {
            _trailReviewPreviouslyFocused.focus()
        }
        _trailReviewPreviouslyFocused = null
    }

    searchStore.update((s) => ({ ...s, summary: null, glowActive: false }))
    clearSearchGlow()
    refreshCompositionState()
}

// ── Constants ────────────────────────────────────────────────────────────────

export const MODE_DESCRIPTIONS = {
    default: 'County-wide overview across all visible records.',
    bloom: 'Living records with high relationship potential.',
    bridge: 'Connective nodes linking disparate county themes.',
    trail: 'Focused path of related business entities.',
    inside: 'Immersive exploration of local neighborhoods.'
}

export const STORY_DESCRIPTIONS = {
    standard: 'A semantic journey through Montgomery County.'
}
