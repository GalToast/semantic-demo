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
  loadingPhase,
  NAV_TRANSITION_ACTIONS,
  NAVIGATION_CONFIG,
  dispatchNavTransition,
  resetNavState,
  updateNavState,
  switchView,
  setFocusedIndex,
  setNavMode,
  setSurface,
  setAutoRotate,
  suspendAutoRotate,
  resumeAutoRotate,
  setLoadingPhase,
  startSceneReveal,
  completeSceneReveal,
  setActiveStoryPrompt,
  setMyceliumMode,
  setApplyingUrlState,
  setRestoringBrowserHistory,
  bumpUrlStateRestoreToken,
  setFocusPocketIndices,
  clearFocusPocketIndices,
  setFocusPocketMeta,
  clearFocusPocketMeta
} from './navigation.svelte';

export type {
  NavTransitionAction,
  NavTransitionPayload,
  NavTransitionResult,
  NavStoreState
} from './navigation.svelte';

// ── Search ───────────────────────────────────────────────────────────────────
export {
  searchStore,
  searchState,
  hasResults,
  activeResult,
  isSearching,
  searchQuery,
  searchStatus,
  searchSummary,
  searchAnchorIndex,
  searchGlowActive,
  setSearchQuery,
  setSearchResults,
  setSearchStatus,
  setActiveResult,
  setSearchSummary,
  setSearchGlow,
  clearSearchGlow,
  setSearchPreview,
  setTrailCue,
  incrementRequestSequence,
  isRequestCurrent,
  incrementFocusTransitionToken,
  setSemanticGuide,
  setDegraded,
  setCompactViewport,
  bumpSummaryCardTypeToken,
  clearSearch,
  clearSearchResults,
  validateSearchQuery,
  mapSemanticSearchResults,
  getSemanticSearchTotalMatches,
  getSemanticSearchServiceResults,
  tokenizeSearchText,
  expandSearchIntent,
  countTokenMatches,
  SEARCH_STOP_WORDS
} from './search.svelte';

export type {
  SearchStoreState,
  IntentExpansion,
  TokenMatchResult
} from './search.svelte';

// ── Journey ──────────────────────────────────────────────────────────────────
export {
  journeyStore,
  journeyState,
  journeyPhase,
  journeyTrail,
  compassState,
  compassPhase,
  journeyNeighbors,
  journeySelectedId,
  walkHistory,
  trailDepth,
  trailSeedIndex,
  trailNeighborIndices,
  threadCandidates,
  threadSource,
  walkHistoryIndices,
  transitionCompass,
  setJourneyPhase,
  addTrailStop,
  removeTrailStop,
  clearTrail,
  setSelectedStop,
  setTrailSeedIndex,
  setTrailNeighborIndices,
  advanceTrailCursor,
  setTrailDepth,
  setNeighbors,
  addWalkHistory,
  addWalkHistoryIndex,
  clearWalkHistory,
  setThreadCandidates,
  clearThreadCandidates,
  setTerrainHandoffPhase,
  setRouteExplorationPhase,
  setSelectedId,
  resetJourney,
  JOURNEY_CONFIG,
  JOURNEY_COMPASS_PHASE_ORDER
} from './journey.svelte';

export type { JourneyStoreState } from './journey.svelte';

// ── Compass ──────────────────────────────────────────────────────────────────
export {
  compassSteps,
  JOURNEY_ACTIONS,
  buildCompassStatus
} from './compass.svelte';

export type {
  CompassPhase,
  CompassStep,
  JourneyAction,
  CompassAction,
  CompassStatus
} from './compass.svelte';

// ── Focus ────────────────────────────────────────────────────────────────────
export {
  focusStore,
  focusState,
  focusPocketNodes,
  focusTransitionMode,
  isSettling,
  threadInspector,
  threadInspectorActive,
  orbitSlack,
  selectedBusiness,
  infoPanelOpen,
  semanticDiveMode,
  inspectedStrandIndex,
  setFocusTransition,
  setPocketNodes,
  clearPocketNodes,
  setSettling,
  setPocketMotionForIndex,
  clearPocketMotionByIndex,
  updateThreadInspector,
  clearThreadInspector,
  pinThread,
  unpinThread,
  updateOrbitSlack as updateFocusOrbitSlack,
  resetOrbitSlack as resetFocusOrbitSlack,
  setSelectedBusiness,
  setInfoPanelOpen,
  setSemanticDiveMode,
  setStrandContinuityPhase,
  setNodesAreSettling,
  resetFocus,
  FOCUS_CONFIG,
  FOCUS_CONSTELLATION_MOTIFS
} from './focus.svelte';

export type {
  FocusStoreState,
  PocketMotionData,
  SelectedBusinessCard,
  ConstellationMotif
} from './focus.svelte';

// ── Demo ─────────────────────────────────────────────────────────────────────
export {
  demoState,
  demoPhase,
  isDemoActive,
  isDemoRunning,
  demoNodeIndex,
  transitionDemo,
  startDemo,
  cancelDemo,
  resetDemo,
  setDemoTimer,
  clearDemoTimer,
  cancelAllDemoTimers,
  getActiveDemoTimerCount,
  findDemoNode,
  shouldRunDemo,
  hasDemoBeenSeen,
  isDemoSuppressedThisSession,
  markDemoCompleted,
  markDemoSessionSkipped,
  DEMO_TIMING,
  DEMO_TOTAL_DURATION_MS,
  DEMO_START_DELAY_MS,
  DEMO_LIFETIME_KEY,
  DEMO_SESSION_KEY
} from './demo.svelte';

// ── Camera ───────────────────────────────────────────────────────────────────
export {
  cameraStore,
  cameraState,
  cameraPosition,
  cameraTarget,
  cameraTransitionPhase,
  isAutoRotating,
  isTransitioning,
  orbitSlackPhase,
  cameraAssistActive,
  setCameraPosition,
  setCameraTarget,
  setAutoRotate as setCameraAutoRotate,
  suspendAutoRotate as suspendCameraAutoRotate,
  resumeAutoRotate as resumeCameraAutoRotate,
  toggleAutoRotate,
  startCameraTransition,
  completeCameraTransition,
  resetCamera,
  scheduleAutoRotateResume,
  clearAutoRotateResumeTimer,
  startAutoRotateSoftResume,
  noteSceneInteraction,
  startFocusCameraAssist,
  releaseFocusCameraAssist,
  isFocusCameraAssistActive,
  setRouteExplorationState,
  clearRouteExploration,
  markRouteExploration,
  shouldMarkRouteExploration,
  updateOrbitSlack as updateCameraOrbitSlack,
  resetOrbitSlack as resetCameraOrbitSlack,
  setFocusTransitionMode,
  isSearchRouteFocusActive,
  getRouteLayerOrigin,
  CAMERA_CONFIG,
  OVERVIEW_CAMERA_POSE
} from './camera.svelte';

export type { CameraStoreState } from './camera.svelte';

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
  syncViewport,
  initViewportListeners,
  getViewportSize,
  isMobileViewport,
  isCompactFocusStage,
  prefersReducedMotion,
  hasCoarsePointer,
  getDevicePixelRatio,
  getPanelSurface,
  isMapSummarySurface,
  isSemanticDiveSurface,
  matchMediaSafe,
  getLocation,
  getCurrentUrl
} from './viewport.svelte';

// ── Test State (visual settle sync for Playwright surface/visual tests) ──────

import { navStore } from './navigation.svelte';
import { searchStore } from './search.svelte';
import { journeyStore } from './journey.svelte';
import { demoState } from './demo.svelte';
import { viewport } from './viewport.svelte';
import { derived, get, type Readable } from 'svelte/store';
import { focusStore } from './focus.svelte';

/**
 * Test state store — snapshot of visual state for Playwright surface tests.
 * Derived from the Svelte store owners so window.__TEST_STATE__ stays live.
 */
function getTestStateSnapshot() {
  const nav = get(navStore);
  const search = get(searchStore);
  const journey = get(journeyStore);
  const demo = get(demoState);
  const vp = get(viewport);
  const focus = get(focusStore);

  const viewMode =
    search.status !== 'idle'
      ? 'search'
      : nav.mode === 'focus'
      ? 'focus'
      : nav.mode === 'trail'
      ? 'trail'
      : nav.mode === 'inside'
      ? 'inside'
      : 'idle';

  const surface = vp.isCompact ? 'mobile' : 'desktop';

  return {
    surface,
    reducedMotion: vp.reducedMotion,
    compactViewport:
      search.isCompactViewport ?? vp.isCompact,
    viewMode,
    focusedNode: nav.focusedIndex,
    searchActive: search.status !== 'idle',
    searchQuery: search.query,
    journeyPhase: journey.compass?.phase ?? journey.phase ?? 'idle',
    demoPhase: demo.phase,
    loadingPhase: nav.loadingPhaseKey,
    navState: {
      mode: nav.mode,
      focusedIndex: nav.focusedIndex,
      surface: nav.surface,
      currentView: nav.currentView,
      trailDepth: nav.trailDepth,
      walkHistoryIndices: [...nav.walkHistoryIndices],
      threadCandidates: [...nav.threadCandidates],
      threadSource: nav.threadSource,
      lastTraversalReason: nav.lastTraversalReason,
    },
    semanticDiveMode: focus.semanticDiveMode,
    trailDepth: nav.trailDepth,
    walkHistory: [...journey.walkHistoryIndices],
    currentView: nav.currentView,
    loadingPhaseKey: nav.loadingPhaseKey,
  };
}

export const testState: Readable<ReturnType<typeof getTestStateSnapshot>> = derived(
  [navStore, searchStore, journeyStore, demoState, viewport, focusStore],
  () => getTestStateSnapshot(),
  getTestStateSnapshot()
);

// ── Filter ───────────────────────────────────────────────────────────────────
export {
  filterState,
  filterVersion,
  filterColorVersion,
  activeClusterFilter,
  hasActiveFilters,
  activeFilterCount,
  statusFilter,
  cityFilter,
  contactFilters,
  toggleFilter,
  overwriteActiveFilters,
  setClusterFilter,
  resetFilters,
  getFilterState,
  pointMatchesActiveFilters
} from './filter.svelte';

// ── Data Store ───────────────────────────────────────────────────────────────
export {
  getBusinessRecords,
  getPositionBuffer,
  getClustersBuffer,
  getPointIndexByLeadId,
  getLeadEnrichment,
  getSemanticThreadBundle,
  getSemanticThreadArtifactName,
  getSemanticNeighborMap,
  getLayoutManifest,
  dataLoadState,
  getLoadingPhaseStore,
  getGraphicsModeStore,
  getRecordCount,
  getIsDataReady,
  getIsLoading,
  getPositionDescriptor,
  getThreadEdgeCount,
  getNeighborMapSize,
  setBusinessData,
  setSemanticThreadData,
  setDataLoadStatus,
  setDataLoadError,
  resetDataStores,
  initData,
} from '@lib/data-store';

export type { DataLoadStatus, DataLoadState } from '@lib/data-store';

// ── Derived: selectedPointStore ─────────────────────────────────────────────
// Combines focusedIndex + businessRecords into the currently selected point.
// InfoPanel.svelte and focus-card consumers read this store.
import { getBusinessRecords as _getBusinessRecords } from '@lib/data-store.svelte';

/**
 * The currently selected business record, derived from navStore.focusedIndex
 * and businessRecords. Returns null when nothing is focused or data isn't loaded.
 */
export function selectedPointStore() {
  const idx = (navStore as any).focusedIndex;
  const records = _getBusinessRecords();
  if (idx == null || idx < 0 || !records || idx >= records.length) {
    return null;
  }
  return records[idx] ?? null;
}
