// js/state/selectors/index.js
// Barrel re-export for all domain selectors.
// Usage: import { getCurrentView, getNavState } from '../state/selectors/index.js';

export {
    getScene, getCamera, getControls, getRenderer, getHemiLight, getDirLight,
    getPoints, getPointsMesh, getPointsMaterial,
    getNodeSporeMesh, getNodeSporeHitMesh, getNodeSporeMaterial,
    getRawPositionsBuffer, getRawClustersBuffer,
    getMyceliumLines, getMyceliumGroup, getMyceliumCoreLines, getMyceliumWispyLines, getMyceliumBridgeLines,
    getMyceliumConnectionPairs, getMyceliumDirty,
    getFocusSemanticLines, getFocusSemanticConnectionPairs,
    getSemanticLensGroup, getSemanticLensGlow, getSemanticLensSpokes,
    getSemanticManifold, getRouteTraceLines, getArrivalHandoffGroup,
    getFocusAnchorGroup, getFocusAnchorRingMesh, getFocusAnchorHaloSprite,
    getHoverHalo, getFocusBeaconTexture, getFocusRingTexture, getFocusNextCueTexture,
    getFocusLens, getFocusHalo, getFocusCore, getFocusMoteGroup, getFocusMotes,
    getFocusPetalGroup, getFocusPetals, getFocusFilaments,
    getInspectedStrandGroup,
    getProjectedNeighborGrid, getProjectedNeighborCache
} from './renderer.js';

export {
    getCurrentView, getNavState, getFocusedNode, getSelectedPoint,
    getStrandContinuityState,
    getFocusTransitionMode, getFocusTransitionStartedAt,
    getFocusCameraAnimationToken, getFocusCameraAssistActive, getFocusCameraAssistUntil,
    getFocusCameraAssistReason, getFocusCameraOffset, getFocusCameraTargetOffset,
    getFocusOrbitSlackState,
    getPinnedThreadIndex, getInspectedThreadIndex,
    getRouteTraceConnectionPairs, getRouteTraceRenderStateKey,
    getTerrainHandoffState, getRouteExplorationState, getRouteChoreographyState,
    getTrailDepth, getSemanticDiveMode,
    getFocusPocketMotionByIndex, getFocusPocketTransitionStartedAt,
    getThreadInspectorPointerInside
} from './navigation.js';

export {
    getCurrentSearchSummary, getCurrentEmptyQuery,
    getSearchGlowActive, getSearchGlowIndices, getSearchGlowTopIndex, getSearchGlowRenderStateKey,
    getSearchRequestSequence, getSearchAnchorIndex, getSearchPreviewIndex,
    getSearchFocusTransitionToken,
    getSearchVectorScrambleInterval,
    getSearchAbortController,
    getCompactSearchRevealToken,
    getMobileRouteFieldPeekToken,
    getSemanticLaneState, getSemanticLaneProbePromise,
    getSemanticLaneOpsMode, getSemanticLaneOpsFetchPromise,
    getSemanticLanePendingWarm, getSemanticLaneSnapshot,
    getSemanticSearchResultCache, getSemanticResultContextByLeadId,
    getSemanticGuideAbortController, getSemanticGuideRequestSequence,
    getCurrentSemanticGuide, getSummaryCardTypeToken,
    getSemanticTrailCue, getTrailIndices
} from './search.js';

export {
    getAutoRotateResumeTimer, getAutoRotateResumeDueAt, getAutoRotateSoftResumeStartedAt,
    getViewHandoffTimer, getViewSwitchPreludeTimer, getTerrainHandoffTimer,
    getSemanticLaneMonitorTimer, getSemanticLaneOpsRefreshTimer,
    getSemanticThreadsRetryTimer,
    getCompactSearchRevealTimers,
    getMobileRouteFieldPeekTimer,
    getCanvasThreadInspectionClearTimer, getCanvasFieldHoverClearTimer,
    getFocusTransitionSettleTimer,
    getExperienceResetToastTimer,
    getClockTimer,
    getSearchTimeout, getSearchPreviewHoverTimer, getSearchVectorScrambleTimer,
    getFocusPocketAnimationFrameId
} from './timers.js';

export {
    getScenePerformanceDiagnostics, getFocusFrameDiagnostics,
    getFocusThreadDiagnostics, getInspectedStrandDiagnostics,
    getRouteTraceDiagnostics, getArrivalHandoffDiagnostics,
    getSemanticSearchCacheDiagnostics
} from './diagnostics.js';

export {
    getMapHandoffPreludeMs, getViewHandoffOutMs, getTerrainLandingSettleMs,
    getTerrainLandingSettleLongMs, getShowViewHandoffDismissMs,
    getMapTrailRefreshLateDelayMs,
    getAutoRotateIdleMs, getAutoRotateManualIdleMs, getAutoRotateSoftResumeMs, getAutoRotateBaseSpeed,
    getMobileRouteFieldPeekMs, getSelectedCardFadeMs, getSearchTrailCueMinDwellMs,
    getSceneRevealDurationMs, getLoadingMinVisibleMs, getHoverLockConfirmMs, getHoverSampleMs,
    getOrbitMinDistanceDefault, getOrbitMinDistanceInside,
    getOrbitMaxDistanceDefault, getOrbitMaxDistanceFree,
    getOrbitRotateSpeedDefault, getOrbitRotateSpeedFree,
    getOrbitPanSpeedDefault, getOrbitPanSpeedFree,
    getPointsMaterialBaseSize, getPointsMaterialBaseOpacity, getFocusThreadSegments,
    getLeafletCssUrl, getLeafletJsUrl,
    getColors, getClusterNames, getLoadingPhaseMeta,
    getJourneyCompassPhaseOrder, getFocusConstellationMotifs,
    getModeDescriptions, getStoryDescriptions
} from './config.js';

export {
    getActiveFilters, getActiveClusterFilter,
    getFilterVersion, getFilterColorVersion,
    getRegisteredEvents, getActiveStoryPrompt, getMyceliumMode,
    getBloomIndices, getBridgeIndices,
    getBridgeScores, getSignalScores,
    getPointColorStateVersion, getPointBaseColors,
    getRecentArrangements
} from './filter-mode.js';

export {
    getAutoRotate, getAutoRotateSuspended,
    getSceneRevealActive, getSceneRevealStartedAt, getSceneRevealCameraStart, getSceneRevealCameraEnd,
    getRouteCameraAnimationToken,
    getNodesAreSettling, getPulsePhase,
    getNodePositions, getTargetPositions, getOriginalPositions,
    getWeather, getWeatherInitialized,
    getRippleActive, getRippleStartTime, getRippleCenter,
    getBloomPulseStartTime, getBridgePulseStartTime,
    getHoverHighlightIndex, getStableCanvasHover,
    getLastCanvasNodeHover, getLastCanvasNodePick, getLastCanvasNodeFocusPick,
    getFocusTargetVector, getDesiredCameraVector
} from './animation.js';

export {
    getLeadEnrichment,
    getPointIndexByLeadId, getSemanticNeighborMapByLeadId,
    getSemanticThreadBundle, getSemanticThreadArtifactName,
    getSemanticSpaceLayoutManifest, getSemanticSpaceLayoutStatus, getSemanticSpaceLayoutError,
    getSemanticThreadsLoadPromise, getSemanticThreadsStatus, getSemanticThreadsRetryAttempt,
    getDataLoadAttempt,
    getPointMarkers,
    getMapInitialized, getMarkersLayer, getMapRouteLayer, getMap,
    getLeafletAssetsPromise
} from './data.js';

export {
    getApplyingUrlState, getRestoringBrowserHistory, getUrlStateRestoreToken,
    getEventListenersInitialized, getDeferredUrlStateHandler,
    getDeferredHydrationStarted,
    getLoadingOverlayStartedAt, getLoadingPhaseKey
} from './url-state.js';
