/**
 * @lib/stores/index.ts — Re-export all stores for convenience
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
} from './navigation';

export type {
  NavTransitionAction,
  NavTransitionPayload,
  NavTransitionResult,
  NavStoreState
} from './navigation';

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
} from './search';

export type {
  SearchStoreState,
  IntentExpansion,
  TokenMatchResult
} from './search';

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
} from './journey';

export type { JourneyStoreState } from './journey';

// ── Compass ──────────────────────────────────────────────────────────────────
export {
  compassSteps,
  JOURNEY_ACTIONS,
  buildCompassStatus
} from './compass';

export type {
  CompassPhase,
  CompassStep,
  JourneyAction,
  CompassAction,
  CompassStatus
} from './compass';

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
  anchorIndicator,
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
  setAnchorIndicator,
  setSelectedBusiness,
  setInfoPanelOpen,
  setSemanticDiveMode,
  setStrandContinuityPhase,
  setNodesAreSettling,
  resetFocus,
  FOCUS_CONFIG,
  FOCUS_CONSTELLATION_MOTIFS
} from './focus';

export type {
  FocusStoreState,
  PocketMotionData,
  SelectedBusinessCard,
  ConstellationMotif
} from './focus';

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
} from './demo';

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
} from './camera';

export type { CameraStoreState } from './camera';

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
} from './viewport';

// ── Test State (visual settle sync for Playwright surface/visual tests) ──────

import { derived } from 'svelte/store';
import { navStore } from './navigation';
import { searchStore } from './search';
import { journeyStore } from './journey';
import { demoState } from './demo';
import { viewport } from './viewport';
import { focusStore } from './focus';

/**
 * Derived store composing visual state from navigation, search, journey,
 * demo, and viewport stores into a flat shape matching the legacy
 * `window.__TEST_STATE__` contract expected by Playwright surface tests.
 */
export const testState = derived(
  [navStore, searchStore, journeyStore, demoState, viewport, focusStore],
  ([$nav, $search, $journey, $demo, $vp, $focus]) => {
    // Derive viewMode from nav mode + search activity
    let viewMode: string;
    if ($search.status !== 'idle') {
      viewMode = 'search';
    } else if ($nav.mode === 'focus') {
      viewMode = 'focus';
    } else if ($nav.mode === 'trail') {
      viewMode = 'trail';
    } else if ($nav.mode === 'inside') {
      viewMode = 'inside';
    } else {
      viewMode = 'idle';
    }

    // Surface from viewport breakpoint
    const surface = $vp.isCompact ? 'mobile' : 'desktop';

    return {
      // ── User-facing visual state contract ──
      viewMode,
      focusedNode: $nav.focusedIndex,
      searchActive: $search.status !== 'idle',
      searchQuery: $search.query,
      journeyPhase: $journey.compass.phase,
      demoPhase: $demo.phase,
      loadingPhase: $nav.loadingPhaseKey,
      surface,
      reducedMotion: $vp.reducedMotion,
      compactViewport: $search.isCompactViewport ?? $vp.isCompact,

      // ── Standard legacy aliases for existing test consumers ──
      navState: {
        mode: $nav.mode,
        focusedIndex: $nav.focusedIndex,
        surface: $nav.surface,
        currentView: $nav.currentView
      },
      semanticDiveMode: $focus.semanticDiveMode,
      currentView: $nav.currentView,
      loadingPhaseKey: $nav.loadingPhaseKey
    };
  }
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
} from './filter';

// ── Data Store ───────────────────────────────────────────────────────────────
export {
  businessRecords,
  positionBuffer,
  clustersBuffer,
  pointIndexByLeadId,
  leadEnrichment,
  semanticThreadBundle,
  semanticThreadArtifactName,
  semanticNeighborMap,
  layoutManifest,
  dataLoadState,
  recordCount,
  isDataReady,
  isLoading,
  positionDescriptor,
  threadEdgeCount,
  neighborMapSize,
  setBusinessData,
  setSemanticThreadData,
  setDataLoadStatus,
  setDataLoadError,
  resetDataStores,
  initData,
} from '../data-store';

export type { DataLoadStatus, DataLoadState } from '../data-store';
