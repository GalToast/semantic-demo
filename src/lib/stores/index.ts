/**
 * @lib/stores/index.ts — Re-export all stores for convenience
 */

export {
  navState,
  isOverview,
  isExploration,
  hasFocus,
  hasTrail,
  currentMode,
  currentSurface,
  trailDepth,
  focusedIndex,
  NAV_TRANSITION_ACTIONS,
  dispatchNavTransition,
  resetNavState,
  updateNavState
} from './navigation';

export type { NavTransitionAction, NavTransitionPayload, NavTransitionResult } from './navigation';

export {
  searchState,
  hasResults,
  activeResult,
  isSearching,
  searchQuery,
  searchStatus,
  searchSummary,
  setSearchQuery,
  setSearchResults,
  setSearchStatus,
  setActiveResult,
  setSearchSummary,
  clearSearch
} from './search';

export {
  journeyState,
  journeyPhase,
  journeyTrail,
  compassState,
  compassPhase,
  journeyNeighbors,
  journeySelectedId,
  walkHistory,
  transitionCompass,
  setJourneyPhase,
  addTrailStop,
  removeTrailStop,
  clearTrail,
  setSelectedStop,
  setNeighbors,
  addWalkHistory,
  clearWalkHistory,
  resetJourney
} from './journey';

export {
  compassSteps,
} from './compass';

export type { CompassPhase, CompassStep } from './compass';

export {
  focusState,
  focusPocketNodes,
  focusTransitionMode,
  isSettling,
  threadInspector,
  threadInspectorActive,
  orbitSlack,
  anchorIndicator,
  setFocusTransition,
  setPocketNodes,
  clearPocketNodes,
  setSettling,
  updateThreadInspector,
  clearThreadInspector,
  updateOrbitSlack,
  resetOrbitSlack,
  setAnchorIndicator,
  resetFocus
} from './focus';

export {
  demoState,
  demoPhase,
  isDemoActive,
  demoNodeIndex,
  transitionDemo,
  startDemo,
  cancelDemo,
  resetDemo,
  setDemoTimer,
  clearDemoTimer,
  cancelAllDemoTimers
} from './demo';

export {
  cameraState,
  cameraPosition,
  cameraTarget,
  cameraTransitionPhase,
  isAutoRotating,
  isTransitioning,
  setCameraPosition,
  setCameraTarget,
  setAutoRotate,
  suspendAutoRotate,
  resumeAutoRotate,
  startCameraTransition,
  completeCameraTransition,
  resetCamera
} from './camera';

export {
  viewport,
  viewportWidth,
  viewportHeight,
  dpr,
  reducedMotion,
  isCompact,
  isMobile,
  isLandscape,
  syncViewport,
  initViewportListeners
} from './viewport';

export {
  filterState,
  hasActiveFilters,
  activeFilterCount,
  statusFilter,
  cityFilter,
  contactFilters,
  toggleFilter,
  resetFilters,
  getFilterState
} from './filter';

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
