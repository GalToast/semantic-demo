/**
 * @lib/stores/navigation/index.ts — Re-export barrel
 *
 * All public symbols from the navigation sub-modules are re-exported here
 * for convenience. External callers should import from
 * `@lib/stores/navigation.svelte` (the original path) which re-exports
 * from this barrel.
 */

// ── Core state ───────────────────────────────────────────────────────────────
export {
    NAVIGATION_CONFIG,
    INITIAL_NAV_STATE,
    navStore,
    readNavMirrorValue,
    _readNavSnapshot,
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
    loadingPhase,
    writeNavStateMirror,
    resetNavState,
    updateNavState,
    setFocusedIndex,
    setNavMode,
    setNeighborhoodIndices,
    setExplorationHistoryIndices,
    setAutoRotate,
    suspendAutoRotate,
    resumeAutoRotate,
    setMyceliumMode,
    setFocusPocketIndices,
    clearFocusPocketIndices,
    setFocusPocketMeta,
    clearFocusPocketMeta
} from './navigation-state.svelte.ts'
export type { NavStoreApi, NavStoreState } from './navigation-state.svelte.ts'

// ── URL state ────────────────────────────────────────────────────────────────
export {
    setApplyingUrlState,
    setRestoringBrowserHistory,
    bumpUrlStateRestoreToken
} from './url-state.svelte.ts'

// ── Compass phase ────────────────────────────────────────────────────────────
export {
    setLoadingPhase,
    setLoadingPhaseKey,
    startSceneReveal,
    completeSceneReveal,
    setSceneRevealActive
} from './compass-phase.svelte.ts'

// ── Mode transitions ─────────────────────────────────────────────────────────
export {
    NAV_TRANSITION_ACTIONS,
    switchView,
    setCurrentView,
    setSurface,
    setNavSurface,
    dispatchNavTransition
} from './mode-transitions.svelte.ts'
export type { NavTransitionAction } from './mode-transitions.svelte.ts'
export type { NavTransitionPayload, NavTransitionResult } from './mode-transitions.svelte.ts'
