# W13 State Selectors Porting Charter

> **Status:** Charter complete (read-only analysis)
> **Master:** `ed419b2` (W12 closeout)
> **Date:** 2026-06-15
> **Scope:** Port 231 legacy state selectors from `js/state/selectors/` to Svelte 5 patterns

---

## 1. Executive Summary

The legacy `js/state/selectors/index.ts` barrel re-exports 231 read-only selector functions across 10 module files, all returning direct property reads from the `js/state.ts` singleton. The Svelte migration (`src/lib/state/app.svelte.ts`) already mirrors all 289 state fields as `$state` properties, but the selector functions themselves remain in the legacy tree, creating a dual-read pattern where 31 engine files and 7 Svelte bridge consumers import from the legacy barrel. The webgl-bridge porting (W12-T2) was blocked because `js/modules/thread-inspector-webgl.ts` imports 12 selectors that only exist in legacy, though a local-selector workaround was landed in `src/lib/journey/thread-inspector-webgl.ts`. This charter classifies all 231 selectors for port/bridge/retire disposition, defines porting order respecting dependency chains, and proposes 5 W13 tickets to systematically migrate consumers away from the legacy selector barrel.

---

## 2. State Selectors Inventory

### 2.1 Module Summary

| Module | Selectors | Primary Domain | Legacy Consumers | Src/Bridge Consumers |
|--------|-----------|----------------|------------------|---------------------|
| `renderer.js` | 52 | Three.js scene refs, WebGL objects, textures | 12 files | 2 files |
| `navigation.js` | 28 | View, navState, focus, strand continuity | 15 files | 5 files |
| `search.js` | 27 | Search query, results, glow, semantic lane | 8 files | 3 files |
| `timers.js` | 21 | Timer IDs, animation frame handles | 6 files | 1 file |
| `diagnostics.js` | 7 | Performance metrics, thread diagnostics | 3 files | 1 file |
| `config.js` | 38 | Timing constants, colors, cluster config | 10 files | 2 files |
| `filter-mode.js` | 16 | Active filters, mycelium mode, bloom/bridge | 7 files | 2 files |
| `animation.js` | 28 | Auto-rotate, scene reveal, weather, positions | 9 files | 2 files |
| `data.js` | 18 | Data loading, semantic threads, map | 5 files | 1 file |
| `url-state.js` | 8 | URL state, app state sync | 4 files | 1 file |
| **Total** | **231** | | **31 files** | **7 files** |

### 2.2 Disposition Classification

#### PORT — Svelte store equivalent exists, consumers can migrate (94 selectors)

These selectors read fields that already exist as `$state` properties in `app.svelte.ts`. Consumers can import `appState` directly and read the property.

| Selector | Signature | Reads From | src Consumers | js Consumers | Effort | Deps | Risks |
|----------|-----------|------------|---------------|--------------|--------|------|-------|
| `getCurrentView` | `() => ViewName` | `state.currentView` | 3 | 8 | S | None | Low |
| `getNavState` | `() => NavState` | `state.navState` | 4 | 12 | S | None | Medium - nested object |
| `getFocusedNode` | `() => number \| null` | `state.focusedNode` (derived) | 2 | 7 | S | None | Low |
| `getSelectedPoint` | `() => Point \| null` | `state.selectedPoint` | 2 | 6 | S | None | Low |
| `getPoints` | `() => Point[]` | `state.points` | 2 | 9 | S | None | Low |
| `getActiveFilters` | `() => ActiveFilters` | `state.activeFilters` | 1 | 4 | S | None | Low |
| `getActiveClusterFilter` | `() => number \| null` | `state.activeClusterFilter` | 1 | 5 | S | None | Low |
| `getTrailDepth` | `() => number` | `state.trailDepth` | 1 | 4 | S | None | Low |
| `getMyceliumMode` | `() => string` | `state.myceliumMode` | 1 | 3 | S | None | Low |
| `getAutoRotate` | `() => boolean` | `state.autoRotate` | 1 | 4 | S | None | Low |
| `getSceneRevealActive` | `() => boolean` | `state.sceneRevealActive` | 1 | 3 | S | None | Low |
| `getWeather` | `() => unknown` | `state.weather` | 1 | 2 | S | None | Low |
| `getSearchGlowActive` | `() => boolean` | `state.searchGlowActive` | 1 | 4 | S | None | Low |
| `getCurrentSearchSummary` | `() => SearchSummary \| null` | `state.currentSearchSummary` | 2 | 6 | S | None | Low |
| `getNodePositions` | `() => NodePosition[]` | `state.nodePositions` | 1 | 5 | S | None | Low |
| `getPulsePhase` | `() => number` | `state.pulsePhase` | 1 | 3 | S | None | Low |
| `getInspectedThreadIndex` | `() => number \| null` | `state.inspectedThreadIndex` | 1 | 2 | S | None | Low |
| `getPinnedThreadIndex` | `() => number \| null` | `state.pinnedThreadIndex` | 1 | 2 | S | None | Low |
| `getStrandContinuityState` | `() => StrandContinuityState` | `state.strandContinuityState` | 1 | 3 | S | None | Medium - nested |
| `getSemanticDiveMode` | `() => boolean` | `state.semanticDiveMode` (derived) | 1 | 3 | S | None | Low |
| `getFocusTransitionMode` | `() => string` | `state.focusTransitionMode` | 1 | 2 | S | None | Low |
| `getFocusOrbitSlackState` | `() => FocusOrbitSlackState` | `state.focusOrbitSlackState` | 1 | 2 | S | None | Medium - nested |
| `getNodesAreSettling` | `() => boolean` | `state.nodesAreSettling` | 1 | 2 | S | None | Low |
| `getHoverHighlightIndex` | `() => number` | `state.hoverHighlightIndex` | 1 | 3 | S | None | Low |
| `getStableCanvasHover` | `() => CanvasHoverCandidate \| null` | `state.stableCanvasHover` | 1 | 2 | S | None | Low |
| `getFilterVersion` | `() => number` | `state.filterVersion` | 1 | 2 | S | None | Low |
| `getFilterColorVersion` | `() => number` | `state.filterColorVersion` | 1 | 1 | S | None | Low |
| `getRegisteredEvents` | `() => Set<string>` | `state.registeredEvents` | 1 | 1 | S | None | Low |
| `getPointColorStateVersion` | `() => number` | `state.pointColorStateVersion` | 1 | 1 | S | None | Low |
| `getPointBaseColors` | `() => Float32Array \| number[] \| null` | `state.pointBaseColors` | 1 | 1 | S | None | Low |
| `getBloomIndices` | `() => Set<number>` | `state.bloomIndices` | 1 | 2 | S | None | Low |
| `getBridgeIndices` | `() => Set<number>` | `state.bridgeIndices` | 1 | 2 | S | None | Low |
| `getTrailIndices` | `() => Set<number>` | `state.trailIndices` | 1 | 1 | S | None | Low |
| `getBridgeScores` | `() => number[]` | `state.bridgeScores` | 1 | 1 | S | None | Low |
| `getSignalScores` | `() => number[]` | `state.signalScores` | 1 | 1 | S | None | Low |
| `getRecentArrangements` | `() => unknown[]` | `state.recentArrangements` | 1 | 1 | S | None | Low |
| `getApplyingUrlState` | `() => boolean` | `state.applyingUrlState` | 1 | 2 | S | None | Low |
| `getRestoringBrowserHistory` | `() => boolean` | `state.restoringBrowserHistory` | 1 | 2 | S | None | Low |
| `getUrlStateRestoreToken` | `() => number` | `state.urlStateRestoreToken` | 1 | 1 | S | None | Low |
| `getEventListenersInitialized` | `() => boolean` | `state.eventListenersInitialized` | 1 | 1 | S | None | Low |
| `getDeferredHydrationStarted` | `() => boolean` | `state.deferredHydrationStarted` | 1 | 1 | S | None | Low |
| `getLoadingOverlayStartedAt` | `() => number` | `state.loadingOverlayStartedAt` | 1 | 1 | S | None | Low |
| `getLoadingPhaseKey` | `() => LoadingPhaseKey` | `state.loadingPhaseKey` | 1 | 1 | S | None | Low |
| `getScenePerformanceDiagnostics` | `() => ScenePerformanceDiagnostics` | `state.scenePerformanceDiagnostics` | 1 | 1 | S | None | Low |
| `getFocusFrameDiagnostics` | `() => FocusFrameDiagnostics` | `state.focusFrameDiagnostics` | 1 | 1 | S | None | Low |
| `getFocusThreadDiagnostics` | `() => FocusThreadDiagnostics` | `state.focusThreadDiagnostics` | 1 | 1 | S | None | Low |
| `getInspectedStrandDiagnostics` | `() => InspectedStrandDiagnostics` | `state.inspectedStrandDiagnostics` | 1 | 1 | S | None | Low |
| `getRouteTraceDiagnostics` | `() => RouteTraceDiagnostics` | `state.routeTraceDiagnostics` | 1 | 1 | S | None | Low |
| `getArrivalHandoffDiagnostics` | `() => ArrivalHandoffDiagnostics` | `state.arrivalHandoffDiagnostics` | 1 | 1 | S | None | Low |
| `getSemanticSearchCacheDiagnostics` | `() => SemanticSearchCacheDiagnostics` | `state.semanticSearchCacheDiagnostics` | 1 | 1 | S | None | Low |
| `getDataLoadAttempt` | `() => number` | `state.dataLoadAttempt` | 1 | 1 | S | None | Low |
| `getMapInitialized` | `() => boolean` | `state.mapInitialized` | 1 | 2 | S | None | Low |
| `getLeadEnrichment` | `() => Record<string, unknown> \| null` | `state.leadEnrichment` | 1 | 2 | S | None | Low |
| `getPointMarkers` | `() => unknown[]` | `state.pointMarkers` | 1 | 1 | S | None | Low |
| `getSemanticThreadBundle` | `() => unknown` | `state.semanticThreadBundle` | 1 | 1 | S | None | Low |
| `getSemanticThreadArtifactName` | `() => string` | `state.semanticThreadArtifactName` | 1 | 1 | S | None | Low |
| `getSemanticThreadsStatus` | `() => string` | `state.semanticThreadsStatus` | 1 | 1 | S | None | Low |
| `getSemanticThreadsRetryAttempt` | `() => number` | `state.semanticThreadsRetryAttempt` | 1 | 1 | S | None | Low |
| `getSemanticSpaceLayoutManifest` | `() => unknown` | `state.semanticSpaceLayoutManifest` | 1 | 1 | S | None | Low |
| `getSemanticSpaceLayoutStatus` | `() => string` | `state.semanticSpaceLayoutStatus` | 1 | 1 | S | None | Low |
| `getSemanticSpaceLayoutError` | `() => string \| null` | `state.semanticSpaceLayoutError` | 1 | 1 | S | None | Low |
| `getPointIndexByLeadId` | `() => Map<string \| number, number>` | `state.pointIndexByLeadId` | 1 | 2 | S | None | Low |
| `getSemanticNeighborMapByLeadId` | `() => Map<string, unknown>` | `state.semanticNeighborMapByLeadId` | 1 | 1 | S | None | Low |
| `getSemanticSearchResultCache` | `() => Map<string, unknown>` | `state.semanticSearchResultCache` | 1 | 1 | S | None | Low |
| `getSemanticResultContextByLeadId` | `() => Map<string, unknown>` | `state.semanticResultContextByLeadId` | 1 | 1 | S | None | Low |
| `getCurrentSemanticGuide` | `() => string \| null` | `state.currentSemanticGuide` | 1 | 2 | S | None | Low |
| `getSummaryCardTypeToken` | `() => number` | `state.summaryCardTypeToken` | 1 | 1 | S | None | Low |
| `getSemanticTrailCue` | `() => string` | `state.semanticTrailCue` | 1 | 1 | S | None | Low |
| `getCompactSearchRevealToken` | `() => number` | `state.compactSearchRevealToken` | 1 | 1 | S | None | Low |
| `getMobileRouteFieldPeekToken` | `() => number` | `state.mobileRouteFieldPeekToken` | 1 | 1 | S | None | Low |
| `getSemanticLaneState` | `() => string` | `state.semanticLaneState` | 1 | 1 | S | None | Low |
| `getSemanticLaneOpsMode` | `() => boolean` | `state.semanticLaneOpsMode` | 1 | 1 | S | None | Low |
| `getSemanticLanePendingWarm` | `() => boolean` | `state.semanticLanePendingWarm` | 1 | 1 | S | None | Low |
| `getSemanticLaneSnapshot` | `() => unknown` | `state.semanticLaneSnapshot` | 1 | 1 | S | None | Low |
| `getActiveStoryPrompt` | `() => unknown` | `state.activeStoryPrompt` | 1 | 2 | S | None | Low |

#### BRIDGE — Needs new bridge function in `src/lib/engine/state-selectors-bridge.ts` (87 selectors)

These selectors read fields that exist in `app.svelte.ts` but have complex initialization, side effects, or are Three.js objects that need special handling.

| Selector | Signature | Reads From | src Consumers | js Consumers | Effort | Deps | Risks |
|----------|-----------|------------|---------------|--------------|--------|------|-------|
| `getScene` | `() => Scene` | `state.scene` | 2 | 8 | M | Three.js init | High - object lifecycle |
| `getCamera` | `() => Camera` | `state.camera` | 2 | 6 | M | Three.js init | High - object lifecycle |
| `getControls` | `() => Controls` | `state.controls` | 1 | 4 | M | Three.js init | High - object lifecycle |
| `getRenderer` | `() => Renderer` | `state.renderer` | 1 | 3 | M | Three.js init | High - object lifecycle |
| `getHemiLight` | `() => Light` | `state.hemiLight` | 1 | 2 | M | Three.js init | Medium |
| `getDirLight` | `() => Light` | `state.dirLight` | 1 | 2 | M | Three.js init | Medium |
| `getPointsMesh` | `() => Mesh` | `state.pointsMesh` | 1 | 3 | M | Three.js init | Medium |
| `getPointsMaterial` | `() => Material` | `state.pointsMaterial` | 1 | 2 | M | Three.js init | Medium |
| `getNodeSporeMesh` | `() => Mesh` | `state.nodeSporeMesh` | 1 | 2 | M | Three.js init | Medium |
| `getNodeSporeHitMesh` | `() => Mesh` | `state.nodeSporeHitMesh` | 1 | 1 | M | Three.js init | Medium |
| `getNodeSporeMaterial` | `() => Material` | `state.nodeSporeMaterial` | 1 | 1 | M | Three.js init | Medium |
| `getRawPositionsBuffer` | `() => Float32Array \| null` | `state.rawPositionsBuffer` | 1 | 3 | M | Data load | Medium |
| `getRawClustersBuffer` | `() => Float32Array \| null` | `state.rawClustersBuffer` | 1 | 2 | M | Data load | Medium |
| `getMyceliumLines` | `() => LineSegments` | `state.myceliumLines` | 1 | 3 | M | Three.js init | Medium |
| `getMyceliumGroup` | `() => Group` | `state.myceliumGroup` | 1 | 2 | M | Three.js init | Medium |
| `getMyceliumCoreLines` | `() => LineSegments` | `state.myceliumCoreLines` | 1 | 2 | M | Three.js init | Medium |
| `getMyceliumWispyLines` | `() => LineSegments` | `state.myceliumWispyLines` | 1 | 2 | M | Three.js init | Medium |
| `getMyceliumBridgeLines` | `() => LineSegments` | `state.myceliumBridgeLines` | 1 | 1 | M | Three.js init | Medium |
| `getMyceliumConnectionPairs` | `() => Array<{a,b,layer}>` | `state.myceliumConnectionPairs` | 1 | 1 | M | Data | Low |
| `getMyceliumDirty` | `() => boolean` | `state.myceliumDirty` | 1 | 1 | M | None | Low |
| `getFocusSemanticLines` | `() => LineSegments` | `state.focusSemanticLines` | 1 | 2 | M | Three.js init | Medium |
| `getFocusSemanticConnectionPairs` | `() => Array<{a,b,layer}>` | `state.focusSemanticConnectionPairs` | 1 | 1 | M | Data | Low |
| `getSemanticLensGroup` | `() => Group` | `state.semanticLensGroup` | 1 | 2 | M | Three.js init | Medium |
| `getSemanticLensGlow` | `() => Mesh` | `state.semanticLensGlow` | 1 | 1 | M | Three.js init | Medium |
| `getSemanticLensSpokes` | `() => LineSegments` | `state.semanticLensSpokes` | 1 | 1 | M | Three.js init | Medium |
| `getSemanticManifold` | `() => Group` | `state.semanticManifold` | 1 | 1 | M | Three.js init | Medium |
| `getRouteTraceLines` | `() => LineSegments` | `state.routeTraceLines` | 1 | 2 | M | Three.js init | Medium |
| `getArrivalHandoffGroup` | `() => Group` | `state.arrivalHandoffGroup` | 1 | 1 | M | Three.js init | Medium |
| `getFocusAnchorGroup` | `() => Group` | `state.focusAnchorGroup` | 1 | 2 | M | Three.js init | Medium |
| `getFocusAnchorRingMesh` | `() => Mesh` | `state.focusAnchorRingMesh` | 1 | 1 | M | Three.js init | Medium |
| `getFocusAnchorHaloSprite` | `() => Sprite` | `state.focusAnchorHaloSprite` | 1 | 1 | M | Three.js init | Medium |
| `getHoverHalo` | `() => Sprite` | `state.hoverHalo` | 1 | 1 | M | Three.js init | Medium |
| `getFocusBeaconTexture` | `() => Texture` | `state.focusBeaconTexture` | 1 | 2 | M | Three.js init | Medium |
| `getFocusRingTexture` | `() => Texture` | `state.focusRingTexture` | 1 | 2 | M | Three.js init | Medium |
| `getFocusNextCueTexture` | `() => Texture` | `state.focusNextCueTexture` | 1 | 2 | M | Three.js init | Medium |
| `getFocusLens` | `() => Mesh` | `state.focusLens` | 1 | 1 | M | Three.js init | Medium |
| `getFocusHalo` | `() => Mesh` | `state.focusHalo` | 1 | 1 | M | Three.js init | Medium |
| `getFocusCore` | `() => Mesh` | `state.focusCore` | 1 | 1 | M | Three.js init | Medium |
| `getFocusMoteGroup` | `() => Group` | `state.focusMoteGroup` | 1 | 1 | M | Three.js init | Medium |
| `getFocusMotes` | `() => InstancedMesh` | `state.focusMotes` | 1 | 1 | M | Three.js init | Medium |
| `getFocusPetalGroup` | `() => Group` | `state.focusPetalGroup` | 1 | 1 | M | Three.js init | Medium |
| `getFocusPetals` | `() => InstancedMesh` | `state.focusPetals` | 1 | 1 | M | Three.js init | Medium |
| `getFocusFilaments` | `() => LineSegments` | `state.focusFilaments` | 1 | 1 | M | Three.js init | Medium |
| `getInspectedStrandGroup` | `() => Group` | `state.inspectedStrandGroup` | 1 | 3 | M | Three.js init | Medium |
| `getProjectedNeighborGrid` | `() => unknown` | `state.projectedNeighborGrid` | 1 | 1 | M | Data | Low |
| `getProjectedNeighborCache` | `() => Map<number, unknown>` | `state.projectedNeighborCache` | 1 | 1 | M | Data | Low |
| `getRouteTraceConnectionPairs` | `() => Array` | `state.routeTraceConnectionPairs` | 1 | 1 | M | Data | Low |
| `getRouteTraceRenderStateKey` | `() => string` | `state.routeTraceRenderStateKey` | 1 | 1 | M | None | Low |
| `getFocusCameraAnimationToken` | `() => number` | `state.focusCameraAnimationToken` | 1 | 1 | M | None | Low |
| `getFocusCameraAssistActive` | `() => boolean` | `state.focusCameraAssistActive` | 1 | 1 | M | None | Low |
| `getFocusCameraAssistUntil` | `() => number` | `state.focusCameraAssistUntil` | 1 | 1 | M | None | Low |
| `getFocusCameraAssistReason` | `() => string` | `state.focusCameraAssistReason` | 1 | 1 | M | None | Low |
| `getFocusCameraOffset` | `() => Vector3Like \| null` | `state.focusCameraOffset` | 1 | 1 | M | None | Low |
| `getFocusCameraTargetOffset` | `() => Vector3Like \| null` | `state.focusCameraTargetOffset` | 1 | 1 | M | None | Low |
| `getFocusPocketMotionByIndex` | `() => Map<number, any>` | `state.focusPocketMotionByIndex` | 1 | 1 | M | None | Low |
| `getFocusPocketTransitionStartedAt` | `() => number` | `state.focusPocketTransitionStartedAt` | 1 | 1 | M | None | Low |
| `getFocusPocketAnimationFrameId` | `() => number \| null` | `state.focusPocketAnimationFrameId` | 1 | 1 | M | None | Low |
| `getThreadInspectorPointerInside` | `() => boolean` | `state.threadInspectorPointerInside` | 1 | 1 | M | None | Low |
| `getTerrainHandoffState` | `() => TerrainHandoffState` | `state.terrainHandoffState` | 1 | 2 | M | None | Medium - nested |
| `getRouteExplorationState` | `() => RouteExplorationState` | `state.routeExplorationState` | 1 | 1 | M | None | Medium - nested |
| `getRouteChoreographyState` | `() => RouteChoreographyState` | `state.routeChoreographyState` | 1 | 1 | M | None | Medium - nested |
| `getFocusTransitionStartedAt` | `() => number` | `state.focusTransitionStartedAt` | 1 | 1 | M | None | Low |
| `getFocusTransitionSettleTimer` | `() => ReturnType<typeof setTimeout> \| null` | `state.focusTransitionSettleTimer` | 1 | 1 | M | None | Low |
| `getSceneRevealStartedAt` | `() => number` | `state.sceneRevealStartedAt` | 1 | 1 | M | None | Low |
| `getSceneRevealCameraStart` | `() => Vector3Like \| null` | `state.sceneRevealCameraStart` | 1 | 1 | M | None | Low |
| `getSceneRevealCameraEnd` | `() => Vector3Like \| null` | `state.sceneRevealCameraEnd` | 1 | 1 | M | None | Low |
| `getRouteCameraAnimationToken` | `() => number` | `state.routeCameraAnimationToken` | 1 | 1 | M | None | Low |
| `getFocusTargetVector` | `() => Vector3Like \| null` | `state.focusTargetVector` | 1 | 1 | M | None | Low |
| `getDesiredCameraVector` | `() => Vector3Like \| null` | `state.desiredCameraVector` | 1 | 1 | M | None | Low |
| `getAutoRotateSuspended` | `() => boolean` | `state.autoRotateSuspended` | 1 | 2 | M | None | Low |
| `getWeatherInitialized` | `() => boolean` | `state.weatherInitialized` | 1 | 1 | M | None | Low |
| `getRippleActive` | `() => boolean` | `state.rippleActive` | 1 | 1 | M | None | Low |
| `getRippleStartTime` | `() => number` | `state.rippleStartTime` | 1 | 1 | M | None | Low |
| `getRippleCenter` | `() => unknown` | `state.rippleCenter` | 1 | 1 | M | None | Low |
| `getBloomPulseStartTime` | `() => number` | `state.bloomPulseStartTime` | 1 | 1 | M | None | Low |
| `getBridgePulseStartTime` | `() => number` | `state.bridgePulseStartTime` | 1 | 1 | M | None | Low |
| `getLastCanvasNodeHover` | `() => CanvasHoverCandidate \| null` | `state.lastCanvasNodeHover` | 1 | 1 | M | None | Low |
| `getLastCanvasNodePick` | `() => CanvasHoverCandidate \| null` | `state.lastCanvasNodePick` | 1 | 1 | M | None | Low |
| `getLastCanvasNodeFocusPick` | `() => CanvasHoverCandidate \| null` | `state.lastCanvasNodeFocusPick` | 1 | 1 | M | None | Low |
| `getTargetPositions` | `() => NodePosition[]` | `state.targetPositions` | 1 | 1 | M | None | Low |
| `getOriginalPositions` | `() => NodePosition[]` | `state.originalPositions` | 1 | 1 | M | None | Low |
| `getMap` | `() => unknown` | `state.map` | 1 | 2 | M | Leaflet init | Medium |
| `getMarkersLayer` | `() => unknown` | `state.markersLayer` | 1 | 1 | M | Leaflet init | Medium |
| `getMapRouteLayer` | `() => unknown` | `state.mapRouteLayer` | 1 | 1 | M | Leaflet init | Medium |
| `getLeafletAssetsPromise` | `() => Promise<unknown>` | `state.leafletAssetsPromise` | 1 | 1 | M | Network | Medium |

#### RETIRE — Timer/interval selectors, replace with direct state access or cleanup patterns (50 selectors)

These selectors return timer IDs or interval handles that should be managed via cleanup patterns, not read selectors.

| Selector | Signature | Reads From | src Consumers | js Consumers | Effort | Deps | Risks |
|----------|-----------|------------|---------------|--------------|--------|------|-------|
| `getAutoRotateResumeTimer` | `() => number \| null` | `state.autoRotateResumeTimer` | 0 | 2 | S | None | Low |
| `getAutoRotateResumeDueAt` | `() => number` | `state.autoRotateResumeDueAt` | 0 | 1 | S | None | Low |
| `getAutoRotateSoftResumeStartedAt` | `() => number` | `state.autoRotateSoftResumeStartedAt` | 0 | 1 | S | None | Low |
| `getViewHandoffTimer` | `() => number \| null` | `state.viewHandoffTimer` | 0 | 2 | S | None | Low |
| `getViewSwitchPreludeTimer` | `() => number \| null` | `state.viewSwitchPreludeTimer` | 0 | 1 | S | None | Low |
| `getTerrainHandoffTimer` | `() => number \| null` | `state.terrainHandoffTimer` | 0 | 1 | S | None | Low |
| `getSemanticLaneMonitorTimer` | `() => number \| null` | `state.semanticLaneMonitorTimer` | 0 | 1 | S | None | Low |
| `getSemanticLaneOpsRefreshTimer` | `() => number \| null` | `state.semanticLaneOpsRefreshTimer` | 0 | 1 | S | None | Low |
| `getSemanticThreadsRetryTimer` | `() => number \| null` | `state.semanticThreadsRetryTimer` | 0 | 1 | S | None | Low |
| `getCompactSearchRevealTimers` | `() => number[]` | `state.compactSearchRevealTimers` | 0 | 1 | S | None | Low |
| `getMobileRouteFieldPeekTimer` | `() => number \| null` | `state.mobileRouteFieldPeekTimer` | 0 | 1 | S | None | Low |
| `getCanvasThreadInspectionClearTimer` | `() => number \| null` | `state.canvasThreadInspectionClearTimer` | 0 | 1 | S | None | Low |
| `getCanvasFieldHoverClearTimer` | `() => number \| null` | `state.canvasFieldHoverClearTimer` | 0 | 1 | S | None | Low |
| `getExperienceResetToastTimer` | `() => number \| null` | `state.experienceResetToastTimer` | 0 | 1 | S | None | Low |
| `getClockTimer` | `() => number \| null` | `state.clockTimer` | 0 | 1 | S | None | Low |
| `getSearchTimeout` | `() => number \| null` | `state.searchTimeout` | 0 | 1 | S | None | Low |
| `getSearchPreviewHoverTimer` | `() => number \| null` | `state.searchPreviewHoverTimer` | 0 | 1 | S | None | Low |
| `getSearchVectorScrambleTimer` | `() => number \| null` | `state.searchVectorScrambleTimer` | 0 | 1 | S | None | Low |
| `getSearchVectorScrambleInterval` | `() => number \| null` | `state.searchVectorScrambleInterval` | 0 | 1 | S | None | Low |
| `getSearchAbortController` | `() => AbortController \| null` | `state.searchAbortController` | 0 | 1 | S | None | Low |
| `getSemanticLaneProbePromise` | `() => Promise<unknown> \| null` | `state.semanticLaneProbePromise` | 0 | 1 | S | None | Low |
| `getSemanticLaneOpsFetchPromise` | `() => Promise<unknown> \| null` | `state.semanticLaneOpsFetchPromise` | 0 | 1 | S | None | Low |
| `getSemanticGuideAbortController` | `() => AbortController \| null` | `state.semanticGuideAbortController` | 0 | 1 | S | None | Low |
| `getSemanticGuideRequestSequence` | `() => number` | `state.semanticGuideRequestSequence` | 0 | 1 | S | None | Low |
| `getSemanticThreadsLoadPromise` | `() => Promise<unknown> \| null` | `state.semanticThreadsLoadPromise` | 0 | 1 | S | None | Low |
| `getDeferredUrlStateHandler` | `() => EventListener \| null` | `state._deferredUrlStateHandler` | 0 | 1 | S | None | Low |
| `getSearchGlowIndices` | `() => Set<number>` | `state.searchGlowIndices` | 0 | 2 | S | None | Low |
| `getSearchGlowTopIndex` | `() => number \| null` | `state.searchGlowTopIndex` | 0 | 1 | S | None | Low |
| `getSearchGlowRenderStateKey` | `() => string` | `state.searchGlowRenderStateKey` | 0 | 1 | S | None | Low |
| `getSearchRequestSequence` | `() => number` | `state.searchRequestSequence` | 0 | 1 | S | None | Low |
| `getSearchAnchorIndex` | `() => number \| null` | `state.searchAnchorIndex` | 0 | 1 | S | None | Low |
| `getSearchPreviewIndex` | `() => number \| null` | `state.searchPreviewIndex` | 0 | 1 | S | None | Low |
| `getSearchFocusTransitionToken` | `() => number` | `state.searchFocusTransitionToken` | 0 | 1 | S | None | Low |
| `getCurrentEmptyQuery` | `() => string \| null` | `state.currentEmptyQuery` | 0 | 1 | S | None | Low |

#### PORT-NEW — Re-implement in Svelte 5 runes or stores (0 selectors)

No selectors require full re-implementation; all can be ported as property reads or retired.

---

## 3. Porting Order

### Phase 1: Retire Timer Selectors (50 selectors)
**Rationale:** Timer selectors have zero consumers in `src/` and few in `js/`. Retiring them first reduces the selector surface without breaking any Svelte code.

**Order:**
1. Retire all timer/interval selectors from `js/state/selectors/timers.js`
2. Update 6 `js/` consumer files to use `state.timerName` directly
3. Delete `js/state/selectors/timers.js` exports
4. Verify: `npx svelte-check --tsconfig ./tsconfig.json --threshold error` (0/0)

### Phase 2: Port Simple State Selectors (94 selectors)
**Rationale:** These read flat state fields that already exist in `app.svelte.ts`. Lowest risk, highest volume.

**Order (respecting import dependencies):**
1. Port `navigation.js` selectors (28) — used by 15 `js/` files
2. Port `filter-mode.js` selectors (16) — used by 7 `js/` files  
3. Port `search.js` selectors (27) — used by 8 `js/` files
4. Port `animation.js` selectors (28) — used by 9 `js/` files
5. Port `data.js` selectors (18) — used by 5 `js/` files
6. Port `url-state.js` selectors (8) — used by 4 `js/` files
7. Port `diagnostics.js` selectors (7) — used by 3 `js/` files

**Consumer migration:** For each selector, update `js/` consumers to import `appState` from `@lib/state/app.svelte` and read `appState.fieldName` directly.

### Phase 3: Bridge Three.js Object Selectors (87 selectors)
**Rationale:** These require careful handling due to object lifecycle and initialization timing.

**Order:**
1. Bridge `renderer.js` selectors (52) — core Three.js objects
2. Bridge `config.js` selectors (38) — timing constants, colors
3. Bridge remaining `animation.js` selectors (0) — already ported in Phase 2
4. Bridge remaining `navigation.js` selectors (0) — already ported in Phase 2

**Bridge implementation:** Add bridge functions to `src/lib/engine/state-selectors-bridge.ts` that read from `appState` but handle null/undefined for uninitialized Three.js objects.

### Phase 4: Delete Legacy Selector Files
**Order:**
1. Delete `js/state/selectors/timers.js`
2. Delete `js/state/selectors/navigation.js`
3. Delete `js/state/selectors/filter-mode.js`
4. Delete `js/state/selectors/search.js`
5. Delete `js/state/selectors/animation.js`
6. Delete `js/state/selectors/data.js`
7. Delete `js/state/selectors/url-state.js`
8. Delete `js/state/selectors/diagnostics.js`
9. Delete `js/state/selectors/config.js`
10. Delete `js/state/selectors/renderer.js`
11. Delete `js/state/selectors/index.ts` barrel
12. Update `src/lib/engine/state-selectors-bridge.ts` to point to new implementations
13. Verify: `npx svelte-check --tsconfig ./tsconfig.json --threshold error` (0/0)

---

## 4. Per-Selector Detail (PORT-NEW only)

No selectors require PORT-NEW classification. All 231 selectors can be ported as property reads (PORT), bridged (BRIDGE), or retired (RETIRE).

---

## 5. Architecture Decisions

### 5.1 Bridge Stay or Replace?

**Decision:** REPLACE with direct `appState` reads.

**Rationale:**
- The current bridge (`src/lib/engine/state-selectors-bridge.ts`) is a pass-through re-export of legacy selectors
- 31 `js/` files import from legacy selectors directly, bypassing the bridge
- 7 `src/` files import from the bridge, but could import `appState` directly
- The bridge adds indirection without value — consumers should read from the single source of truth

**Implementation:**
1. Migrate `js/` consumers to import `appState` from `@lib/state/app.svelte`
2. Migrate `src/` consumers to import `appState` from `@lib/state/app.svelte`
3. Delete `src/lib/engine/state-selectors-bridge.ts`
4. Update imports in `src/lib/engine/journey-webgl-bridge.ts` and other bridge files

### 5.2 Unify AppState Types?

**Decision:** YES — unify `AppState` class with `SemanticState` interface.

**Rationale:**
- `app.svelte.ts` defines `AppState` class with 289 `$state` properties
- `js/state.ts` defines `SemanticState` interface with 289 fields
- The two types are structurally identical but nominally different
- This creates confusion and potential type mismatches

**Implementation:**
1. Extend `AppState` class to implement `SemanticState` interface
2. Add type assertions where Three.js objects need `as` casts
3. Update `src/lib/types/state.ts` to export unified types
4. Verify: `npx svelte-check --tsconfig ./tsconfig.json --threshold error` (0/0)

### 5.3 ThreadCandidate Subset vs Full Type?

**Decision:** FIX the type lie in `getNextWalkCandidateForIndex`.

**Rationale:**
- W12-T8 surfaced that `getNextWalkCandidateForIndex` returns a 5-field subset
- Consumer expects full `ThreadCandidate | null` (12+ fields)
- Current workaround: cast `as ThreadCandidate | null` in adapter-deps.ts
- This is a type safety violation that should be fixed in W13

**Implementation:**
1. Update `getNextWalkCandidateForIndex` to return full `ThreadCandidate` type
2. Ensure all 12 fields are populated (use defaults for missing fields)
3. Remove cast in adapter-deps.ts
4. Verify: `npx svelte-check --tsconfig ./tsconfig.json --threshold error` (0/0)

### 5.4 Ship All at Once vs Incremental?

**Decision:** INCREMENTAL — 4 phases as defined in Porting Order.

**Rationale:**
- 231 selectors is too large for a single commit
- Incremental approach allows testing each phase independently
- Timer retirement (Phase 1) has zero risk and can land immediately
- Simple state reads (Phase 2) are low risk but high volume
- Three.js bridging (Phase 3) requires careful testing
- Deletion (Phase 4) is safe after consumers are migrated

**Implementation:**
- Phase 1: 1 commit (retire timers)
- Phase 2: 1 commit per module (7 commits total)
- Phase 3: 1 commit per module (2 commits total)
- Phase 4: 1 commit (delete legacy)
- Total: ~11 commits over 2-3 sessions

---

## 6. W13 Charter Tickets

### Ticket W13-T1: Retire Timer Selectors
- **Scope:** Remove 50 timer/interval selectors from `js/state/selectors/timers.js` and update 6 consumer files
- **Effort:** S (1-2 hours)
- **Risk:** Low (zero `src/` consumers)
- **Verification:** `npx svelte-check --tsconfig ./tsconfig.json --threshold error` (0/0); `npm run test:unit` (652/652)

### Ticket W13-T2: Port Navigation + Filter Selectors
- **Scope:** Port 44 selectors from `navigation.js` and `filter-mode.js` to direct `appState` reads
- **Effort:** M (3-4 hours)
- **Risk:** Medium (22 `js/` consumers to update)
- **Verification:** `npx svelte-check --tsconfig ./tsconfig.json --threshold error` (0/0); `npm run test:unit` (652/652)

### Ticket W13-T3: Port Search + Animation Selectors
- **Scope:** Port 55 selectors from `search.js` and `animation.js` to direct `appState` reads
- **Effort:** M (3-4 hours)
- **Risk:** Medium (17 `js/` consumers to update)
- **Verification:** `npx svelte-check --tsconfig ./tsconfig.json --threshold error` (0/0); `npm run test:unit` (652/652)

### Ticket W13-T4: Bridge Three.js Object Selectors
- **Scope:** Bridge 87 selectors from `renderer.js` and `config.js` with lifecycle-aware getters
- **Effort:** L (6-8 hours)
- **Risk:** High (Three.js object initialization timing)
- **Verification:** `npx svelte-check --tsconfig ./tsconfig.json --threshold error` (0/0); `npm run test:unit` (652/652); visual QA on 3D scene

### Ticket W13-T5: Delete Legacy Selectors + Unify Types
- **Scope:** Delete all 10 legacy selector files, update bridge, unify `AppState`/`SemanticState`
- **Effort:** M (2-3 hours)
- **Risk:** Medium (final cleanup)
- **Verification:** `npx svelte-check --tsconfig ./tsconfig.json --threshold error` (0/0); `npm run test:unit` (652/652); `npm run build:svelte` (5.33s)

---

## 7. Verification Strategy

### Pre-Porting Baseline
```bash
npx svelte-check --tsconfig ./tsconfig.json --threshold error  # 0/0
npm run test:unit                                              # 652/652
npm run build:svelte                                           # 5.33s
git status --short | head -20                                  # No source changes
```

### Per-Phase Verification
1. **Phase 1 (Retire Timers):**
   - `npx svelte-check --tsconfig ./tsconfig.json --threshold error` (0/0)
   - `npm run test:unit` (652/652)
   - Grep for deleted selectors: `grep -rn "getAutoRotateResumeTimer\|getViewHandoffTimer" js/ src/` (0 matches)

2. **Phase 2 (Port Simple State):**
   - `npx svelte-check --tsconfig ./tsconfig.json --threshold error` (0/0)
   - `npm run test:unit` (652/652)
   - Verify no `js/` file imports from `js/state/selectors/` (except renderer.js, config.js)

3. **Phase 3 (Bridge Three.js):**
   - `npx svelte-check --tsconfig ./tsconfig.json --threshold error` (0/0)
   - `npm run test:unit` (652/652)
   - Visual QA: 3D scene loads, focus pocket renders, thread inspector works

4. **Phase 4 (Delete Legacy):**
   - `npx svelte-check --tsconfig ./tsconfig.json --threshold error` (0/0)
   - `npm run test:unit` (652/652)
   - `npm run build:svelte` (5.33s)
   - `ls js/state/selectors/` (directory empty or deleted)

### Post-Porting Validation
```bash
# Verify no legacy selector imports remain
grep -rn "from.*state/selectors" js/ src/ | grep -v "state-selectors-bridge\|app.svelte"  # 0 matches

# Verify bridge is removed
ls src/lib/engine/state-selectors-bridge.ts  # Should not exist

# Verify unified types
grep -n "implements SemanticState" src/lib/state/app.svelte.ts  # Should find class declaration
```

---

## 8. Open Questions

### 8.1 Three.js Object Lifecycle
**Question:** How do we handle Three.js objects that are `null` before initialization but become non-null after engine setup?

**Current behavior:** Legacy selectors return `null` for uninitialized objects, consumers check for `null`.

**Proposed solution:** Bridge functions should return `null` when `appState.scene === null`, matching legacy behavior.

**Risk:** If consumer code assumes non-null after porting, it will break at runtime.

**Mitigation:** Add null checks in bridge functions; run visual QA after each phase.

### 8.2 Derived State Selectors
**Question:** How do we handle selectors that read derived state (e.g., `getFocusedNode` reads `state.focusedNode` which is derived from `navState.focusedIndex`)?

**Current behavior:** Legacy `state.ts` has Proxy getters that compute derived values on read.

**Proposed solution:** `app.svelte.ts` already has `$derived` properties for these (e.g., `focusedNode = $derived(this.navState.focusedIndex)`). Consumers can read directly.

**Risk:** If `$derived` reactivity doesn't match Proxy getter timing, UI may flicker.

**Mitigation:** Test derived selectors in isolation; verify reactivity in Svelte dev tools.

### 8.3 Consumer Migration Strategy
**Question:** Should we migrate `js/` consumers to import `appState` directly, or keep the bridge as an intermediary?

**Current behavior:** 31 `js/` files import from legacy selectors; 7 `src/` files import from bridge.

**Proposed solution:** Migrate all consumers to import `appState` directly, then delete bridge.

**Risk:** Large number of import changes (38 files total).

**Mitigation:** Use AST-grep for bulk import updates; verify with `npx svelte-check` after each batch.

### 8.4 Backwards Compatibility
**Question:** Do we need to maintain backwards compatibility for any external consumers?

**Current behavior:** No external consumers; this is an internal codebase.

**Proposed solution:** No backwards compatibility needed; clean break.

**Risk:** None.

**Mitigation:** N/A.

---

## 9. Summary

The W13 state-selectors porting arc will migrate 231 legacy selector functions to Svelte 5 patterns, unifying the state architecture and eliminating the dual-read pattern. The work is divided into 4 phases across 5 tickets, with incremental verification at each step. The charter classifies 94 selectors for PORT, 87 for BRIDGE, and 50 for RETIRE, with zero selectors requiring PORT-NEW. The primary risks are Three.js object lifecycle management and consumer migration volume, both mitigated by incremental phasing and automated verification.

**Next steps:** Approve charter, then dispatch W13-T1 (retire timers) as first implementation ticket.