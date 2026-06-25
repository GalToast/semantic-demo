/**
 * @lib/orchestration/lifecycle.ts — Semantic Demo Lifecycle & Global State Bridge
 *
 * Replaces js/modules/lifecycle.js.
 *
 * Orchestrates mode switching, trail depth, search glow, exploration focus,
 * and semantic dive. Writes to stores (navStore, searchStore, focusStore,
 * journeyStore) for all state mutations.
 *
 * Event subscriptions are wired at module load for backward compatibility
 * with the legacy event bus. These should be migrated to $effect or
 * onMount in a future pass.
 */

import { get } from 'svelte/store'
import {
    navStore,
    dispatchNavTransition,
    NAV_TRANSITION_ACTIONS,
    updateNavState,
    setAutoRotate,
    suspendAutoRotate,
    resumeAutoRotate
} from '@lib/stores/navigation.svelte.ts'
import { searchStore } from '@lib/stores/search.svelte'
import { focusStore, setSemanticDiveMode as setFocusDiveMode, setSelectedBusiness } from '@lib/stores/focus.svelte.ts'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { getFocusedJourneyPoint, getJourneyCompassState, JOURNEY_ACTIONS } from '@lib/journey/compass-state'
import {
    executeJourneyCompassAction,
    updateJourneyCompass,
    installSemanticJourneyProbe,
    scheduleMapRouteRefresh,
    getViewHandoffModel,
    getJourneyCompassPresentationState,
    invokeClearMobileRouteFieldPeek
} from '@lib/orchestration/compass-controller'
import { switchView, showViewHandoff, hideViewHandoff } from '@lib/orchestration/view-controller'
import { setLoadingPhase, startSceneReveal } from '@lib/stores/navigation.svelte.ts'
import { hideLoadingOverlay, startDeferredHydration, scheduleWeatherHydration } from '@lib/ui/loading'
import { syncViewport } from '@lib/stores/viewport.svelte.ts'
import {
    copyCurrentViewLink,
    resetStateBeforeUrlRestore,
    clearExplorationFocusSelection
} from '@lib/orchestration/url-state'
import {
    setTrailDepth,
    resetNodePositions,
    refreshCompositionState,
    showExploreTrailReview,
    hideExploreTrailReview
} from '@lib/stores/lifecycle'
import type { BusinessRecord } from '@lib/types/business'

// ── Re-exports from sub-modules (store/lifecycle split) ────────────────────────

export {
    MODE_DESCRIPTIONS,
    STORY_DESCRIPTIONS,
    refreshCompositionState,
    updateExplorationUi,
    setMyceliumMode,
    setTrailDepth,
    setSemanticDiveMode,
    getBloomIndices,
    getBridgeIndices
} from '@lib/stores/lifecycle'

export {
    resetExplorationFocus,
    resetNodePositions,
    resetExperienceState,
    returnToOverview
} from '@lib/stores/lifecycle'

export {
    activateSearchGlow,
    showExploreTrailReview,
    hideExploreTrailReview,
    getCurrentEmptyQuery
} from '@lib/stores/lifecycle'

export { setLoadingPhase, startSceneReveal }
export { hideLoadingOverlay, startDeferredHydration, scheduleWeatherHydration }

/**
 * Handle window resize events.
 * Stub that delegates to the viewport store's syncViewport.
 */
export function onWindowResize(): void {
    syncViewport()
}
export { copyCurrentViewLink, resetStateBeforeUrlRestore, clearExplorationFocusSelection }
export { switchView, showViewHandoff, hideViewHandoff }
export {
    getFocusedJourneyPoint,
    getJourneyCompassState,
    JOURNEY_ACTIONS,
    executeJourneyCompassAction as executeJourneyCompassAction,
    updateJourneyCompass,
    installSemanticJourneyProbe,
    scheduleMapRouteRefresh,
    getViewHandoffModel,
    getJourneyCompassPresentationState,
    invokeClearMobileRouteFieldPeek
}
export { dispatchNavTransition, NAV_TRANSITION_ACTIONS }

// ── Panel Surface Helpers ──────────────────────────────────────────────────────

/**
 * Derive a lifecycle panel surface context from search/focus intent flags.
 * Returns "idle", "search", "focus", or "focus-search".
 */
export function deriveLifecyclePanelSurfaceContext(
    opts: { hasSearchIntent?: boolean; hasFocus?: boolean } = {}
): string {
    const { hasSearchIntent = false, hasFocus = false } = opts
    if (hasSearchIntent && hasFocus) return 'focus-search'
    if (hasSearchIntent) return 'search'
    if (hasFocus) return 'focus'
    return 'idle'
}

// ── Semantic Dive Proxy (uses focus store) ────────────────────────────────────

/**
 * Enable or disable semantic dive mode. When entering, sets trailDepth=2
 * and transitions the body data attribute through "transitioning" → "active".
 * This is a thin proxy that delegates to the focus store"s setSemanticDiveMode.
 */
export function setSemanticDiveModeProxy(enabled: boolean): void {
    const nextActive = !!enabled
    setFocusDiveMode(nextActive)

    if (nextActive) {
        if (document.body) document.body.dataset.semanticDive = 'transitioning'
        setTrailDepth(2)
        updateNavState({ mode: 'inside', surface: 'inside', trailDepth: 2 })
    } else {
        const nav = get(navStore)
        const search = get(searchStore)
        const focus = focusStore()
        const hasFocus = nav.focusedIndex != null || Boolean(focus.selectedBusiness)
        const hasSearchIntent = Boolean(search.summary || search.query.trim().length >= 2)
        const mode = hasFocus ? 'focus' : hasSearchIntent ? 'search' : 'overview'
        const surface =
            hasFocus && hasSearchIntent ? 'focus-search' : hasFocus ? 'focus' : hasSearchIntent ? 'search' : 'idle'
        setTrailDepth(1)
        updateNavState({ mode, surface, trailDepth: 1 })
    }

    refreshCompositionState()
}

// ── Hydrate Lead Context ──────────────────────────────────────────────────────

/**
 * Hydrate the UI context for a given lead/business point.
 * Syncs the focus stage and updates the selected business card.
 */
export function hydrateLeadContext(point: BusinessRecord | null): void {
    if (!point) return
    focusOnPoint(point, { revealCard: true })
}

// ── Focus on Point ────────────────────────────────────────────────────────────

/**
 * Focus on a business record point. Delegates camera movement to the
 * index-based camera owner via engine bridge.
 */
export function focusOnPoint(
    point: BusinessRecord | null,
    options: { skipUrlSync?: boolean; revealCard?: boolean } = {}
): boolean {
    if (!point) return false

    setSelectedBusiness({
        name: point.name,
        category: point.category,
        city: point.city,
        status: point.status,
        website: point.website,
        email: point.email,
        phone: point.phone
    })

    if (!options.skipUrlSync) {
        publish(EVENTS.CAMERA_NODE_FOCUSED, { point, options })
    }

    return true
}

// ── Inside / Next Stop ────────────────────────────────────────────────────────

/**
 * Explore to the next stop in the inside (immersive) surface.
 * Called from compass NEXT_STOP action and journey-bindings.
 */
export function exploreInsideToNextStop(): void {
    const $focus = focusStore()
    if ($focus.strandContinuityPhase === 'exploring') return

    // Engine bridge handles the actual traversal;
    // this store-level port only guards against re-entry.
}

// ── Legacy Semantic Lane Probes ────────────────────────────────────────────────
// Thin re-exports: canonical implementations moved to semantic-lane.ts
// (see W7-C cleanup). Remove once bridge retirement phase 6 retires
// lifecycle.ts as a re-export hub.
export { probeSemanticLane, setSemanticLaneUiState } from './semantic-lane'

/**
 * Focus on node by index.
 * Delegates to dispatchNavTransition.
 */
export function focusOnNode(index: number, _options?: Record<string, unknown>): boolean {
    const result = dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, { index })
    return result.ok
}

/**
 * Apply story prompt.
 * Delegates to navStore.
 */
export function applyStoryPrompt(prompt: string | null): void {
    navStore.update((s) => ({ ...s, activeStoryPrompt: prompt }))
}

/**
 * Update URL state.
 * Re-export from url-state.ts.
 */
export { updateUrlState } from '@lib/orchestration/url-state'

/**
 * Get interesting business note (filters trivia, suppresses placeholder QA strings).
 * Window bridge function from lifecycle.js.
 */
export function getInterestingBusinessNote(point: Record<string, unknown> | null): string {
    if (!point) return ''
    const trivia = point.trivia as string | undefined
    if (!trivia) return ''
    // Suppress placeholder QA strings
    if (trivia.includes('placeholder') || trivia.includes('QA') || trivia.includes('test')) return ''
    return trivia
}

/**
 * Build selected match narrative (returns currentSearchSummary.reason or "").
 * Window bridge function from lifecycle.js.
 */
export function buildSelectedMatchNarrative(_point: Record<string, unknown> | null): string {
    const summaryReason = (get(searchStore).summary as unknown as Record<string, unknown>)?.reason as string | undefined
    if (summaryReason) return summaryReason
    return ''
}

declare global {
    interface Window {
        animateCameraToNode?: (opts: { transitionStyle: string }) => void
    }
}

/**
 * Recenter focused node.
 * Window bridge function from lifecycle.js.
 */
export function recenterFocusedNode(): void {
    if (typeof window !== 'undefined' && typeof window.animateCameraToNode === 'function') {
        window.animateCameraToNode({ transitionStyle: 'focus' })
    }
}

/**
 * Return to county view.
 * Window bridge function from lifecycle.js.
 */
export function returnToCountyView(): void {
    setSemanticDiveModeProxy(false)
    resetNodePositions()
}

/**
 * Toggle auto-rotate.
 * Window bridge function from lifecycle.js.
 */
export function toggleAutoRotate(): void {
    const $nav = get(navStore)
    const prefersReducedMotion =
        typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    if ($nav.autoRotate) {
        suspendAutoRotate()
    } else {
        resumeAutoRotate()
        setAutoRotate(true)
    }
}

/**
 * Open trail review (internal).
 * Window bridge function from lifecycle.js.
 */
export function _openTrailReview(): void {
    showExploreTrailReview()
}

/**
 * Close trail review (internal).
 * Window bridge function from lifecycle.js.
 */
export function _closeTrailReview(): void {
    hideExploreTrailReview()
}

// ── Event Subscriptions ───────────────────────────────────────────────────────
//
// Duplicate subscriptions previously lived here for the 10 search/reset/dive
// events. They were removed because the barrel import of @lib/stores/lifecycle
// (modes.ts, reset.ts, search-sync.ts) already registers the canonical
// subscriptions at module load. lifecycle.ts re-exports those functions, so
// the split modules' subscribe() calls run when the barrel is imported.
// Re-subscribing here caused every search event to fire handlers twice.
