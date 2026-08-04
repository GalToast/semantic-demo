/**
 * @lib/stores/navigation.svelte.ts — Navigation state store (Svelte 5 runes)
 *
 * This file is a thin re-export barrel. The actual implementation has been
 * split into focused modules under `navigation/`:
 *
 *   - navigation/navigation-state.svelte.ts  — core state, store, getters, setters
 *   - navigation/url-state.svelte.ts         — URL synchronization state
 *   - navigation/compass-phase.svelte.ts     — loading phase & scene reveal
 *   - navigation/mode-transitions.svelte.ts  — mode/view transitions & dispatcher
 *   - navigation/index.ts                    — barrel re-exports
 *
 * All public API is preserved: same 48 exports with identical signatures.
 * External callers continue importing from `@lib/stores/navigation.svelte`.
 */

// Re-export everything from the sub-modules so all existing imports work unchanged.
export {
    // ── Core state ──
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
    getLastCommittedView,
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
    clearFocusPocketMeta,
    // ── Types ──
    type NavStoreApi,
    type NavStoreState,
    // ── URL state ──
    setApplyingUrlState,
    setRestoringBrowserHistory,
    bumpUrlStateRestoreToken,
    // ── Compass phase ──
    setLoadingPhase,
    setLoadingPhaseKey,
    startSceneReveal,
    completeSceneReveal,
    setSceneRevealActive,
    // ── Mode transitions ──
    NAV_TRANSITION_ACTIONS,
    switchView,
    setCurrentView,
    setSurface,
    setNavSurface,
    dispatchNavTransition,
    type NavTransitionAction,
    type NavTransitionPayload,
    type NavTransitionResult
} from './navigation/index.ts'
