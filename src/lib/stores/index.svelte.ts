/**
 * @lib/stores/index.svelte.ts — Re-export all stores for convenience (Svelte 5 runes)
 */

// ── Navigation ───────────────────────────────────────────────────────────────
export {
    navStore,
    isOverview,
    isExploration,
    hasFocus,
    hasTrail,
    currentMode,
    currentSurface,
    focusedIndex,
    currentView,
    myceliumMode,
    isMapMode,
    loadingPhase
} from './navigation.svelte'

export {
    dispatchNavTransition,
    setNavMode,
    setNavSurface,
    setFocusedIndex,
    setNeighborhoodIndices,
    setExplorationHistoryIndices,
    setCurrentView,
    setMyceliumMode,
    setAutoRotate,
    setSceneRevealActive,
    setLoadingPhaseKey,
    resetNavState,
    updateNavState,
    NAV_TRANSITION_ACTIONS
} from './navigation.svelte'

// ── Search ───────────────────────────────────────────────────────────────────
export {
    searchStore,
    searchState,
    searchQuery,
    searchStatus,
    searchResults,
    hasSearchQuery,
    hasResults,
    isSearching,
    searchSummary,
    getSearchSummary
} from './search.svelte'

export {
    setSearchQuery,
    setSearchStatus,
    setSearchSummary,
    setAnchorIndex,
    setPreviewIndex,
    setGlowIndices,
    setGlowActive,
    setSearchGlow,
    clearSearchGlow,
    setTrailCue,
    incrementRequestSequence,
    isRequestCurrent,
    incrementFocusTransitionToken,
    setSemanticGuide,
    setCompactViewport,
    bumpSummaryCardTypeToken,
    clearSearchResults,
    clearSearch,
    setActiveResult,
    setSearchVisibleCount,
    setSearchResults,
    castSearchResults,
    validateSearchQuery
} from './search.svelte'

// ── Journey ──────────────────────────────────────────────────────────────────
export {
    journeyStore,
    journeyState,
    journeyPhase,
    journeyTrail,
    compassPhase,
    trailDepth,
    trailSeedIndex,
    trailNeighborIndices,
    threadCandidates,
    threadSource,
    walkHistoryIndices,
    currentJourneyIndex
} from './journey.svelte'

export {
    setJourneyPhase,
    setTrailDepth,
    addWalkHistoryIndex,
    transitionCompass,
    resetJourney,
    JOURNEY_COMPASS_PHASE_ORDER
} from './journey.svelte'

// ── Filter ───────────────────────────────────────────────────────────────────
export {
    filterState,
    filterVersion,
    filterColorVersion,
    activeClusterFilter,
    activeClusterFilterStore,
    hasActiveFilters
} from './filter.svelte'

export {
    toggleFilter,
    setFilter,
    resetFilters,
    incrementFilterVersion,
    bumpFilterColorVersion,
    setActiveClusterFilter,
    overwriteActiveFilters
} from './filter.svelte'

// ── Focus ────────────────────────────────────────────────────────────────────
export {
    focusStore,
    pocketNodes,
    pocketMeta,
    selectedBusiness,
    infoPanelOpen,
    pocketListVisible,
    semanticDiveMode,
    nodesAreSettling,
    inspectedStrandIndex,
    pinnedThreadIndex,
    threadInspector,
    threadInspectorActive
} from './focus.svelte'

export {
    setPocketNodes,
    clearPocketNodes,
    setPocketListVisible,
    pinThread,
    unpinThread,
    clearThreadInspector,
    updateThreadInspector,
    setSemanticDiveMode,
    setSelectedBusiness,
    setInfoPanelOpen,
    resetFocus
} from './focus.svelte'

// ── Viewport ─────────────────────────────────────────────────────────────────
export {
    viewport,
    viewportWidth,
    viewportHeight,
    dpr,
    reducedMotion,
    isCompact,
    isMobile,
    isLandscape,
    isCompactLandscape,
    isUltraCompactPortrait,
    getViewportSize,
    isMobileViewport,
    prefersReducedMotion,
    getDevicePixelRatio,
    getPanelSurface,
    isMapSummarySurface,
    isSemanticDiveSurface,
    initViewportListeners,
    syncViewport
} from './viewport.svelte.ts'

// ── Weather ──────────────────────────────────────────────────────────────────
export {
    weatherData,
    weatherInitialized,
    weatherCondition,
    isWeatherInitialized,
    setWeatherInitialized,
    weatherTemperature,
    weatherLabel,
    weatherForecast,
    hasWeather,
    fetchWeather
} from './weather.svelte.ts'

// ── Camera ───────────────────────────────────────────────────────────────────
export {
    cameraStore,
    cameraPosition,
    cameraTarget,
    autoRotate,
    autoRotateSuspended,
    getRouteLayerOrigin
} from './camera.svelte.ts'

// ── Test Compatibility ───────────────────────────────────────────────────────
export {
    testCompatStore,
    testCompatStore as testState,
    syncTestStateFromBody,
    resetTestState
} from './test-compat.svelte.ts'

// ── Combined Helpers ─────────────────────────────────────────────────────────

import { get } from 'svelte/store'
import type { BusinessRecord } from '@lib/types/business'
import { navStore } from './navigation.svelte'
import {
    businessRecords,
    getBusinessRecords as getDataBusinessRecords,
    getIsDataReady as getDataIsReady
} from '../data-store'

/** Returns the currently focused business record index. */
export function getFocusedIndex(): number | null {
    const nav = get(navStore)
    return nav.focusedIndex ?? null
}

/** Returns the current list of business records. */
export function getBusinessRecords(): BusinessRecord[] {
    return [...getDataBusinessRecords()] as BusinessRecord[]
}

/** Returns whether records are ready for UI consumption. */
export function getIsDataReady(): boolean {
    return getDataIsReady()
}

// Reactive mirrors of the underlying stores (finding T5-7). `$store` auto-subscription
// is unavailable inside `.svelte.ts` modules, so we subscribe manually and expose
// `$state` mirrors that `$derived.by` can track. This keeps `selectedPointStore()`
// reactive so `$derived(selectedPointStore())` re-evaluates when the focused index
// or the business records change.
//
// The subscription is set up lazily on first call (not at module init) because
// `navStore` is defined by a sibling module that can still be initializing when
// this module evaluates; reading it at init would throw (circular-import TDZ) and
// break every importer of this module.
let _focusedIndex = $state<number | null>(null)
let _selectedRecords = $state<readonly BusinessRecord[]>([])
let _selectedPointSubscribed = false
function _ensureSelectedPointSubscribed(): void {
    if (_selectedPointSubscribed) return
    _selectedPointSubscribed = true
    navStore.subscribe((v) => {
        _focusedIndex = v?.focusedIndex ?? null
    })
    businessRecords.subscribe((v) => {
        _selectedRecords = v
    })
}

const _selectedPointDerived = $derived.by(() => {
    const idx = _focusedIndex
    const records = _selectedRecords
    if (idx == null || idx < 0 || !records || idx >= records.length) {
        return null
    }
    return records[idx] ?? null
})

/** Reactive store for the selected point record. */
export function selectedPointStore() {
    _ensureSelectedPointSubscribed()
    return _selectedPointDerived
}
