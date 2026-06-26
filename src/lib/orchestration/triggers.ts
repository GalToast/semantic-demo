/**
 * @lib/orchestration/triggers.ts — Neutral cross-module event subscriptions
 *
 * Houses event subscriptions that bridge search lifecycle events to
 * compass controller updates. Extracted from search-sync.ts to break
 * the circular dependency:
 *
 *   compass-controller → @lib/stores/lifecycle (barrel) → search-sync → compass-controller
 *
 * By placing these subscriptions in a neutral module that imports from
 * both compass-controller and lifecycle leaf modules (not the barrel),
 * the cycle is broken. This module is a leaf — nothing in the
 * lifecycle barrel imports it.
 *
 * Import this module from App.svelte (or another init entry) to install
 * the subscriptions. The subscriptions are registered at import time
 * (module side-effect) matching the original search-sync.ts pattern.
 *
 * Strangler-fig port (W11-T6, 2026-06-15): the four new subscriptions
 * at the bottom (EXPLORATION_FOCUS_SYNC, SEARCH_STATE_RESET_REQUESTED,
 * SUMMARY_CARD_HIDE_REQUESTED, SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED)
 * are Svelte-native mirrors of the legacy
 * `initEventBusSubscriptions` calls in The legacy
 * subscribers stay in place during the transition; the Svelte subscribers
 * are the new canonical handlers. Once all callers publish to the
 * Svelte bus, the legacy `subscribeKeyed` calls can be retired.
 */
import { subscribeKeyed, EVENTS } from '@lib/orchestration/event-bus'
import { updateJourneyCompass } from '@lib/orchestration/compass-controller'
import { refreshCompositionState } from '@lib/stores/lifecycle/modes'
import { recordEmptySearch } from '@lib/stores/lifecycle/search-sync'
import { setActiveResult, setSearchStatus } from '@lib/stores/search.svelte'
import { returnToOverview, recenterFocusedNode, resetExplorationFocus, setSemanticLaneUiState } from './lifecycle'
import { hideSummaryCard } from '@lib/journey/semantic-guide'
import { updateUrlState } from '@lib/orchestration/url-state'
import { syncSearchStatusForFocus } from '@lib/ui/ui-feedback'
import { traverseNeighbor } from '@lib/journey/thread-settler-adapter'
import { navStore, dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation.svelte'
import { activeClusterFilter } from '@lib/stores/filter.svelte'
import { addTrailStop, setThreadCandidates, setTrailDepth, setTrailNeighborIndices } from '@lib/stores/journey.svelte'
import { getBusinessRecords } from '@lib/data-store'
import { appState } from '@lib/state/app.svelte.ts'
import { buildNeighborhoodManifest, getSemanticThreadDisplayLimit } from '@lib/journey/neighborhood'
import { withStateMutation } from '@lib/state/with-state-mutation'
import { legacyState } from '@lib/state/legacy-state-adapter'
import { bindSearchResultInteractions } from '@lib/search/orchestration'
import type { Point } from '@lib/state/state-types'
import type { SearchResult } from '@lib/types/state'
import type { SearchContext } from '@lib/search/state'
import { get } from 'svelte/store'

// ── Keyboard Support ──────────────────────────────────────────────────────────

function isKeyboardTextEntryTarget(target: HTMLElement): boolean {
    if (!target || typeof target.tagName !== 'string') return false
    const tagName = target.tagName.toLowerCase()
    const type = (target as HTMLInputElement).type?.toLowerCase() ?? ''
    return (
        (tagName === 'input' && ['text', 'search', 'email', 'url', 'password'].includes(type)) ||
        tagName === 'textarea' ||
        target.isContentEditable
    )
}

/**
 * Top-level keydown handler for the application shell.
 * Replaces the imperative listeners from global-bindings.js.
 */
export function handleGlobalKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement
    if (isKeyboardTextEntryTarget(target)) return

    const key = event.key

    if (key === 'Escape') {
        // Check if we have anything to reset
        const nav = get(navStore)
        if (nav.focusedIndex !== null || nav.currentView !== 'galaxy' || get(activeClusterFilter) !== null) {
            event.preventDefault()
            returnToOverview()
        }
        return
    }

    if (key === 'ArrowLeft' || key === 'ArrowUp') {
        event.preventDefault()
        traverseNeighbor(-1)
    } else if (key === 'ArrowRight' || key === 'ArrowDown') {
        event.preventDefault()
        traverseNeighbor(1)
    } else if (key === 'Home') {
        event.preventDefault()
        returnToOverview()
    } else if (key === 'End' || (key === 'c' && !event.ctrlKey && !event.metaKey)) {
        event.preventDefault()
        recenterFocusedNode()
    }
}

// ── Search → Compass Subscriptions ────────────────────────────────────────────
//
// These were previously in search-sync.ts at module scope.  Moving them
// here eliminates search-sync's import of compass-controller, which was
// the reverse edge of the cycle.

subscribeKeyed('triggers.ts:SEARCH_SUCCESS', EVENTS.SEARCH_SUCCESS, () => {
    refreshCompositionState()
    updateJourneyCompass()
})

subscribeKeyed('triggers.ts:SEARCH_EMPTY', EVENTS.SEARCH_EMPTY, ({ query }) => {
    refreshCompositionState()
    updateJourneyCompass()
    recordEmptySearch(query)
})

subscribeKeyed('triggers.ts:SEARCH_STARTED', EVENTS.SEARCH_STARTED, () => {
    refreshCompositionState()
})

subscribeKeyed('triggers.ts:SEARCH_CLEARED', EVENTS.SEARCH_CLEARED, () => {
    refreshCompositionState()
    updateJourneyCompass()
})

subscribeKeyed('triggers.ts:SEARCH_FOCUS_TRANSITION_STARTED', EVENTS.SEARCH_FOCUS_TRANSITION_STARTED, () => {
    refreshCompositionState()
    updateJourneyCompass()
})

subscribeKeyed('triggers.ts:SEARCH_FOCUS_TRANSITION_SETTLED', EVENTS.SEARCH_FOCUS_TRANSITION_SETTLED, () => {
    refreshCompositionState()
    updateJourneyCompass()
})

// ── Engine → Compass Subscriptions ───────────────────────────────────────────
//
// These were previously in compass-controller.ts at module scope.
// Moving them here keeps all cross-module event wiring in one place.

// CAMERA_NODE_FOCUSED is published by the legacy focusOnNode() (called from
// canvas clicks, traversal, and the search focus pipeline). The Svelte
// navStore needs a mirror so FocusPocket, ThreadInspector, and the focus
// stage render with the new anchor. We preserve an existing 'focus-search'
// surface so a search-result click that emits CAMERA_NODE_FOCUSED right
// after SEARCH_FOCUS_REQUESTED keeps its search context.
subscribeKeyed(
    'triggers.ts:CAMERA_NODE_FOCUSED',
    EVENTS.CAMERA_NODE_FOCUSED,
    (payload: { index?: number; point?: unknown; options?: Record<string, unknown> } = {}) => {
        const index = Number(payload?.index)
        if (Number.isFinite(index) && index >= 0) {
            // Guard: when SEARCH_FOCUS_REQUESTED fires just before this event (the
            // search-click hot path), it has already set focusedIndex, mode, surface
            // ('focus-search'), and trailDepth to the same values this subscriber
            // would set. Re-running navStore.update() is functionally a no-op but
            // triggers a redundant Svelte reactivity cascade that compounds the
            // 200-500ms sync work in the focus-click pipeline (W15-T1 diagnosis
            // in tmp/w15-focus-deadlock-diagnosis.md). Skip the update when the
            // index is already current; updateJourneyCompass() below still runs
            // (idempotent for the same focus context).
            const current = get(navStore) as { focusedIndex?: number | null }
            if (current.focusedIndex !== index) {
                navStore.update((s) => ({
                    ...s,
                    focusedIndex: index,
                    mode: 'focus',
                    surface: s.surface === 'focus-search' ? s.surface : 'focus',
                    trailDepth: Math.max(1, s.trailDepth ?? 0)
                }))
            }
        }
        updateJourneyCompass()
    }
)
subscribeKeyed('triggers.ts:EXPLORATION_DEPTH_CHANGED', EVENTS.EXPLORATION_DEPTH_CHANGED, updateJourneyCompass)
subscribeKeyed('triggers.ts:STATE_RESET', EVENTS.STATE_RESET, updateJourneyCompass)

// ── Search Focus → Nav Subscriptions ─────────────────────────────────────────
//
// Ported from subscribeKeyed('app:search-focus-requested', ...).
// The Svelte migration owns focus/nav state in navState; we set the focused
// index + mode here so FocusPocket, ThreadInspector, and the focus stage
// reactively render. The legacy engine reads the same focus state via its
// own state mirror.

subscribeKeyed('triggers.ts:SEARCH_FOCUS_REQUESTED', EVENTS.SEARCH_FOCUS_REQUESTED, ({ index }: { index?: number }) => {
    if (typeof index !== 'number' || !Number.isFinite(index)) return
    if (appState.searchError) return // Don't focus if there's a search error
    const focusIndex = index
    const searchSummary = appState.currentSearchSummary
    const resultIndices = (searchSummary?.resultIndices as number[] | undefined) || []
    const manifest = buildNeighborhoodManifest(focusIndex, resultIndices, {
        displayLimit: getSemanticThreadDisplayLimit()
    })
    const candidateIndices: number[] = [...(manifest?.candidateIndices ?? [])]
    const threadSource = manifest && manifest.anchorEdgeCount > 0 ? 'semantic' : 'geometric-fallback'
    const threadReasonByIndex = new Map<number, string>(
        candidateIndices.map((candidateIndex: number) => [
            candidateIndex,
            threadSource === 'semantic' ? 'semantic neighbor' : 'geometric proximity'
        ])
    )
    navStore.update((s) => ({
        ...s,
        focusedIndex: focusIndex,
        mode: 'focus',
        surface: 'focus-search',
        trailDepth: 1,
        trailSeedIndex: focusIndex,
        trailNeighborIndices: candidateIndices,
        threadCandidates: candidateIndices.map((idx) => ({
            index: idx,
            source: threadSource,
            reason: threadReasonByIndex.get(idx) ?? ''
        })),
        threadReasonByIndex,
        threadSource
    }))
    withStateMutation(() => {
        // legacyState.navState is `NavState | null`; withStateMutation guarantees
        // the state is initialized, so the structural cast is safe. We only write
        // 5 fields here; the inline shape uses a loose threadCandidates element
        // type (only `index`, `source`, `reason`) rather than the strict
        // `ThreadCandidateLike` because we don't compute the scoring fields
        // (`score`, `semanticScore`, `sameCity`, `sameStatus`) at this layer.
        const nav = legacyState.navState as unknown as {
            trailSeedIndex?: number | null
            trailNeighborIndices?: number[]
            threadCandidates?: Array<{ index: number; source: string; reason: string }>
            threadReasonByIndex?: Map<number, string>
            threadSource?: string
        }
        nav.trailSeedIndex = index
        nav.trailNeighborIndices = [...candidateIndices]
        nav.threadCandidates = candidateIndices.map((candidateIndex: number) => ({
            index: candidateIndex,
            source: threadSource,
            reason: threadReasonByIndex.get(candidateIndex) ?? 'nearby business relationship'
        }))
        nav.threadReasonByIndex = threadReasonByIndex
        nav.threadSource = threadSource
    })
    // Add the focused node as the first trail stop so MapSummary
    // (which gates on hasTrail() && trail.length > 0) renders.
    // Guard against duplicate trail stops when SEARCH_FOCUS_REQUESTED re-fires
    // (e.g. the url-state post-search re-publish for numeric anchors — see
    // docs/bug-thread-inspector-baseline-and-activation-2026-06-18.md).
    const records = getBusinessRecords()
    const record = records[Number(index)]
    const walkHist = appState.navState.walkHistoryIndices ?? []
    const lastTrailIndex = walkHist.length > 0 ? walkHist[walkHist.length - 1] : null
    if (lastTrailIndex !== Number(index)) {
        addTrailStop({
            index: Number(index),
            name: record?.name ?? `Node ${index}`,
            reason: 'search-focus',
            visitedAt: Date.now()
        })
    }
    setTrailNeighborIndices(candidateIndices)
    setThreadCandidates(candidateIndices)
    setTrailDepth(1)
    setActiveResult(String(index))
    setSearchStatus('focusing')
    refreshCompositionState()
    updateJourneyCompass()
})

// ── Engine → Nav Sync Subscriptions ──────────────────────────────────────────
//
// Ported from ::initEventBusSubscriptions.
// The engine kernel publishes these events from the legacy track; the
// Svelte track needs to mirror the side effects so the Svelte navStore
// and the Svelte focus card stay in lockstep with the engine's
// exploration state.

/**
 * EXPLORATION_FOCUS_SYNC is published by the engine after a canvas node
 * pick, a search-result focus, or a thread traversal. The legacy code
 * used it to dispatch a NAV_TRANSITION_ACTIONS.FOCUS_NODE with
 * skipHistory: true so the navigation history isn't pushed twice. The
 * Svelte navStore handles focusedIndex / mode / surface via the FOCUS_NODE
 * branch of dispatchNavTransition, so we mirror that here.
 */
subscribeKeyed(
    'triggers.ts:EXPLORATION_FOCUS_SYNC',
    EVENTS.EXPLORATION_FOCUS_SYNC,
    (payload: { index?: number; skipHistory?: boolean } = {}) => {
        const index = Number(payload?.index)
        if (!Number.isFinite(index) || index < 0) return
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, {
            index,
            // The Svelte navStore does not have a skipHistory flag, but
            // appendHistory:false is the closest equivalent and prevents
            // duplicate history entries when the engine has already recorded
            // the focus.
            appendHistory: payload.skipHistory === true ? false : true
        })
    }
)

/**
 * SEARCH_STATE_RESET_REQUESTED is published by the search pipeline when
 * a clear-search action should also clear exploration focus. The Svelte
 * resetExplorationFocus preserves the current search summary by default,
 * matching the legacy preserveSearch:true default in lifecycle-reset.ts.
 */
subscribeKeyed(
    'triggers.ts:SEARCH_STATE_RESET_REQUESTED',
    EVENTS.SEARCH_STATE_RESET_REQUESTED,
    (options: Record<string, unknown> = {}) => {
        resetExplorationFocus(options as Parameters<typeof resetExplorationFocus>[0])
    }
)

/**
 * SUMMARY_CARD_HIDE_REQUESTED is published when the summary card should
 * be hidden. Delegates to the canonical implementation in
 * journey/semantic-guide.ts (was previously a no-op proxy via
 * orchestration/lifecycle.ts — fixed in W46-T2-a when the dead no-op
 * stubs in lifecycle.ts were traced to their real implementations).
 */
subscribeKeyed('triggers.ts:SUMMARY_CARD_HIDE_REQUESTED', EVENTS.SUMMARY_CARD_HIDE_REQUESTED, () => {
    hideSummaryCard()
})

/**
 * SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED is published when the semantic
 * guide button should change state. The Svelte guide UI is reactive and
 * owns its own state via the focus store, so this subscription is a
 * documented no-op (matches the legacy stub at app.ts:228-231).
 */
subscribeKeyed(
    'triggers.ts:SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED',
    EVENTS.SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED,
    () => {
        // Handled reactively by the Svelte focus store and semantic-guide component.
    }
)

// ── W11-T6 Wave 2: Remaining event-bus subscriptions ────────────────────────
//
// Ported from ::initEventBusSubscriptions lines 289-339.
// These five subscriptions complete the Svelte-native mirror of the legacy
// event-bus wiring. The legacy subscribeKeyed calls stay in place until all
// callers publish to the Svelte bus.

/**
 * URL_SYNC_REQUESTED is published when the URL hash/state should be
 * synchronized. The Svelte url-state module owns URL updates; we
 * forward params and options directly.
 */
subscribeKeyed('triggers.ts:URL_SYNC_REQUESTED', EVENTS.URL_SYNC_REQUESTED, (payload: Record<string, unknown> = {}) => {
    const params = payload.params as Record<string, string | null | undefined> | undefined
    const reason = payload.reason as string | undefined
    const mode = payload.mode as 'push' | 'replace' | undefined
    updateUrlState(params ?? {}, { reason, mode })
})

/**
 * SEARCH_UI_SYNC_REQUESTED is published when search result DOM elements
 * need their click/hover interactions rebound.
 *
 * The Svelte search orchestration module owns rebinding for DOM results
 * rendered outside the component lifecycle.
 */
subscribeKeyed(
    'triggers.ts:SEARCH_UI_SYNC_REQUESTED',
    EVENTS.SEARCH_UI_SYNC_REQUESTED,
    (payload: Record<string, unknown> = {}) => {
        const resultsEl = payload.resultsEl instanceof HTMLElement ? payload.resultsEl : null
        const statusEl = payload.statusEl instanceof HTMLElement ? payload.statusEl : null
        const results = Array.isArray(payload.results) ? (payload.results as SearchResult[]) : null
        const renderContext = payload.renderContext as SearchContext | undefined
        if (!resultsEl || !statusEl || !results || !renderContext) return
        bindSearchResultInteractions(resultsEl, statusEl, results, renderContext)
    }
)

/**
 * SEARCH_STATUS_SYNC_REQUESTED is published when the search status
 * display should update to reflect focus on a specific point. The Svelte
 * ui-feedback module owns the status DOM sync.
 */
subscribeKeyed(
    'triggers.ts:SEARCH_STATUS_SYNC_REQUESTED',
    EVENTS.SEARCH_STATUS_SYNC_REQUESTED,
    (payload: Record<string, unknown> = {}) => {
        const point = payload.point as Point | undefined
        const options = payload.options as Record<string, unknown> | undefined
        if (!point) return
        syncSearchStatusForFocus(point, options)
    }
)

/**
 * SEMANTIC_LANE_STATE_REQUESTED is published when the semantic lane
 * health state should update. The Svelte lifecycle module owns this
 * as a no-op (state is managed reactively in the Svelte store).
 */
subscribeKeyed(
    'triggers.ts:SEMANTIC_LANE_STATE_REQUESTED',
    EVENTS.SEMANTIC_LANE_STATE_REQUESTED,
    (payload: Record<string, unknown> = {}) => {
        const laneState = payload.laneState as string | undefined
        const options = payload.options as Record<string, unknown> | undefined
        setSemanticLaneUiState(laneState ?? '', options)
    }
)

/**
 * TOOLTIP_HIDE_REQUESTED is now handled directly by
 * src/lib/ui/tooltip.ts:initTooltipEventBusSubscriptions().
 * The previous no-op subscriber here was redundant; removed W7-C.
 */
