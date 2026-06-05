# Phase 5 State Mutation Audit

**Worker:** diagnostic (read-only)
**Date:** 2026-06-05

## Summary

| Store | Mutation Count |
|---|---|
| navStore | 139 |
| searchStore | 82 |
| focusStore | 176 |
| filterStore | 24 |
| cameraStore | 86 |
| engine-only | 232 |
| **Total** | **739** |

## File Breakdown by Store

### cameraStore (86)

| File | Count |
|---|---|
| js/modules/semantic-lane.ts | 15 |
| js/modules/semantic-lane.js | 15 |
| js/modules/view-controller.ts | 11 |
| js/modules/view-controller.js | 11 |
| js/modules/three-engine.ts | 6 |
| js/modules/three-engine.js | 6 |
| js/modules/scene-reveal.ts | 5 |
| js/modules/scene-reveal.js | 5 |
| js/modules/map-state.ts | 3 |
| js/modules/map-state.js | 3 |
| js/modules/camera-controls-core.ts | 1 |
| js/modules/camera-controls-core.js | 1 |
| js/modules/camera-controls-choreography.ts | 1 |
| js/modules/camera-controls-choreography.js | 1 |
| js/modules/state-mutators.js | 1 |
| js/modules/state-mutators.ts | 1 |

### engine-only (232)

| File | Count |
|---|---|
| js/modules/three-engine.ts | 35 |
| js/modules/semantic-threads.ts | 21 |
| js/modules/data-loader.ts | 20 |
| js/modules/semantic-threads.js | 19 |
| js/modules/three-node-manager.js | 19 |
| js/modules/three-engine.js | 16 |
| js/modules/map-state.ts | 15 |
| js/modules/map-state.js | 15 |
| js/modules/three-interaction-visuals.js | 11 |
| js/modules/data-loader.js | 10 |
| js/modules/three-thread-manager.js | 10 |
| js/modules/weather.ts | 5 |
| js/modules/weather.js | 5 |
| js/modules/journey-arrival-handoff.ts | 5 |
| js/modules/journey-arrival-handoff.js | 5 |
| js/modules/three-node-manager.ts | 5 |
| js/modules/semantic-search-cache.ts | 2 |
| js/modules/semantic-search-cache.js | 2 |
| js/modules/three-search-animations.ts | 2 |
| js/modules/three-search-animations.js | 2 |
| js/modules/journey-thread-model.js | 1 |
| js/modules/journey-thread-model.ts | 1 |
| js/modules/mycelium-engine.js | 1 |
| js/modules/mycelium-engine.ts | 1 |
| js/modules/state-mutators.js | 1 |
| js/modules/state-mutators.ts | 1 |
| js/modules/three-thread-manager.ts | 1 |
| js/modules/three-interaction-visuals.ts | 1 |

### filterStore (24)

| File | Count |
|---|---|
| js/modules/filter-state.ts | 6 |
| js/modules/filter-state.js | 6 |
| js/modules/cluster-filter.js | 4 |
| js/modules/journey-point-color.js | 3 |
| js/modules/cluster-filter.ts | 2 |
| js/modules/journey-point-color.ts | 1 |
| js/modules/navigation-state.ts | 1 |
| js/modules/navigation-state.js | 1 |

### focusStore (176)

| File | Count |
|---|---|
| js/modules/thread-inspector.ts | 24 |
| js/modules/thread-inspector.js | 22 |
| js/modules/camera-controls-core.ts | 12 |
| js/modules/camera-controls-core.js | 11 |
| js/modules/journey-canvas-hover.js | 9 |
| js/modules/camera-controls-choreography.ts | 7 |
| js/modules/journey-canvas-hover.ts | 7 |
| js/modules/camera-controls-choreography.js | 6 |
| js/modules/focus-anchor-indicator.js | 6 |
| js/modules/focus-anchor-indicator.ts | 6 |
| js/modules/focus-pocket.js | 5 |
| js/modules/micro-demo.js | 5 |
| js/modules/thread-inspector-webgl.ts | 5 |
| js/modules/thread-inspector-webgl.js | 5 |
| js/modules/camera-controls-restore.ts | 4 |
| js/modules/camera-orbit-slack.ts | 3 |
| js/modules/camera-orbit-slack.js | 3 |
| js/modules/micro-demo.ts | 3 |
| js/modules/camera-controls-restore.js | 2 |
| js/modules/journey-canvas-node-picking.ts | 2 |
| js/modules/journey-canvas-node-picking.js | 2 |
| js/modules/journey-thread-settler.js | 2 |
| js/modules/map-state.ts | 2 |
| js/modules/map-state.js | 2 |
| js/modules/bindings\mode-bindings.ts | 2 |
| js/modules/bindings\mode-bindings.js | 2 |
| js/modules/url-state.js | 2 |
| js/modules/url-state.ts | 2 |
| js/modules/journey.ts | 1 |
| js/modules/journey.js | 1 |
| js/modules/micro-demo-guards.ts | 1 |
| js/modules/micro-demo-guards.js | 1 |
| js/modules/search-state.js | 1 |
| js/modules/lifecycle.ts | 1 |
| js/modules/lifecycle.js | 1 |
| js/modules/three-engine.ts | 1 |
| js/modules/strand-continuity.ts | 1 |
| js/modules/strand-continuity.js | 1 |
| js/modules/three-engine.js | 1 |
| js/modules/bindings\journey-bindings.ts | 1 |
| js/modules/bindings\journey-bindings.js | 1 |

### navStore (139)

| File | Count |
|---|---|
| js/modules/camera-controls-restore.ts | 19 |
| js/modules/camera-controls-restore.js | 16 |
| js/modules/url-state.js | 13 |
| js/modules/focus-pocket.ts | 8 |
| js/modules/focus-pocket.js | 8 |
| js/modules/url-state.ts | 8 |
| js/modules/lifecycle.ts | 6 |
| js/modules/lifecycle.js | 6 |
| js/modules/journey-thread-settler.ts | 4 |
| js/modules/journey-thread-settler.js | 4 |
| js/modules/journey-point-color.ts | 3 |
| js/modules/journey-neighborhood.js | 3 |
| js/modules/journey-neighborhood.ts | 3 |
| js/modules/map-state.ts | 3 |
| js/modules/three-interaction-visuals.ts | 3 |
| js/modules/three-interaction-visuals.js | 3 |
| js/modules/journey-point-color.js | 2 |
| js/modules/map-state.js | 2 |
| js/modules/state-mutators.js | 2 |
| js/modules/three-engine.ts | 2 |
| js/modules/state-mutators.ts | 2 |
| js/modules/three-engine.js | 2 |
| js/modules/ui-feedback.ts | 2 |
| js/modules/event-bindings.ts | 1 |
| js/modules/event-bindings.js | 1 |
| js/modules/focus-pocket-personality.js | 1 |
| js/modules/bindings\view-bindings.ts | 1 |
| js/modules/focus-pocket-personality.ts | 1 |
| js/modules/bindings\view-bindings.js | 1 |
| js/modules/micro-demo-guards.ts | 1 |
| js/modules/loading-ui.ts | 1 |
| js/modules/map-flattening-layout.ts | 1 |
| js/modules/micro-demo-guards.js | 1 |
| js/modules/map-flattening-layout.js | 1 |
| js/modules/loading-ui.js | 1 |
| js/modules/ui-feedback.js | 1 |
| js/modules/bindings\global-bindings.ts | 1 |
| js/modules/bindings\global-bindings.js | 1 |

### searchStore (82)

| File | Count |
|---|---|
| js/modules/lifecycle.js | 18 |
| js/modules/lifecycle.ts | 16 |
| js/modules/search-state.js | 13 |
| js/modules/semantic-guide.js | 8 |
| js/modules/search-results-ui.js | 8 |
| js/modules/semantic-guide.ts | 5 |
| js/modules/search-result-renderer.js | 3 |
| js/modules/journey-point-color.js | 1 |
| js/modules/search-results-ui.ts | 1 |
| js/modules/search-mapper.js | 1 |
| js/modules/semantic-guide-ui.js | 1 |
| js/modules/search-mapper.ts | 1 |
| js/modules/search-trail-cue-renderer.js | 1 |
| js/modules/search-trail-cue-renderer.ts | 1 |
| js/modules/three-node-manager.js | 1 |
| js/modules/url-state.js | 1 |
| js/modules/url-state.ts | 1 |
| js/modules/three-node-manager.ts | 1 |

## Full Mutation Table

| File | Line | Property | Pattern | TargetStore | MigrationAction |
|---|---|---|---|---|---|
| js/modules/cluster-filter.ts | 30 | `activeStoryPrompt` | `state.activeStoryPrompt = null;` | filterStore | port to store |
| js/modules/cluster-filter.ts | 207 | `activeStoryPrompt` | `state.activeStoryPrompt = story \|\| null;` | filterStore | port to store |
| js/modules/cluster-filter.js | 26 | `activeStoryPrompt` | `state.activeStoryPrompt = null;` | filterStore | port to store |
| js/modules/cluster-filter.js | 70 | `_showAllClusters` | `const showAll = state._showAllClusters === true;` | filterStore | port to store |
| js/modules/cluster-filter.js | 108 | `_showAllClusters` | `state._showAllClusters = !showAll;` | filterStore | port to store |
| js/modules/cluster-filter.js | 203 | `activeStoryPrompt` | `state.activeStoryPrompt = story \|\| null;` | filterStore | port to store |
| js/modules/camera-controls-restore.ts | 44 | `currentView` | `state.currentView === 'galaxy' &&` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 45 | `focusedNode` | `state.focusedNode === null &&` | focusStore | port to store |
| js/modules/camera-controls-restore.ts | 46 | `selectedPoint` | `state.selectedPoint === null &&` | focusStore | port to store |
| js/modules/camera-controls-restore.ts | 63 | `autoRotateSoftResumeStartedAt` | `if (state.autoRotateSoftResumeStartedAt) state.autoRotateSoftResumeStartedAt = 0` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 76 | `autoRotateSuspended` | `if (state.autoRotateSuspended === suspended) return;` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 77 | `autoRotateSuspended` | `state.autoRotateSuspended = suspended;` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 79 | `autoRotateSoftResumeStartedAt` | `state.autoRotateSoftResumeStartedAt = 0;` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 81 | `autoRotateSoftResumeStartedAt` | `state.autoRotateSoftResumeStartedAt = performance.now();` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 92 | `autoRotateResumeTimer` | `state.autoRotateResumeTimer = null;` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 93 | `autoRotateResumeDueAt` | `state.autoRotateResumeDueAt = 0;` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 113 | `autoRotateResumeDueAt` | `state.autoRotateResumeDueAt = performance.now() + delay;` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 114 | `autoRotateResumeTimer` | `state.autoRotateResumeTimer = setTimeout(() => {` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 115 | `autoRotateResumeTimer` | `state.autoRotateResumeTimer = null;` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 116 | `autoRotateResumeDueAt` | `state.autoRotateResumeDueAt = 0;` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 119 | `currentView` | `state.currentView === 'galaxy' &&` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 120 | `focusedNode` | `state.focusedNode === null &&` | focusStore | port to store |
| js/modules/camera-controls-restore.ts | 121 | `selectedPoint` | `state.selectedPoint === null &&` | focusStore | port to store |
| js/modules/camera-controls-restore.ts | 125 | `trailDepth` | `state.trailDepth === 0` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 145 | `AUTO_ROTATE_BASE_SPEED` | `if (!Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)) state.AUTO_ROTATE_BASE_SPEED` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 164 | `autoRotateSoftResumeStartedAt` | `state.autoRotateSoftResumeStartedAt = 0;` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 177 | `autoRotate` | `state.autoRotate = false;` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 189 | `autoRotate` | `state.autoRotate = !state.autoRotate;` | navStore | port to store |
| js/modules/camera-controls-restore.ts | 195 | `autoRotate` | `rotateBtn.setAttribute('aria-pressed', String(state.autoRotate === true));` | navStore | port to store |
| js/modules/camera-controls-restore.js | 51 | `currentView` | `state.currentView === 'galaxy' &&` | navStore | port to store |
| js/modules/camera-controls-restore.js | 52 | `focusedNode` | `state.focusedNode === null &&` | focusStore | port to store |
| js/modules/camera-controls-restore.js | 53 | `selectedPoint` | `state.selectedPoint === null &&` | focusStore | port to store |
| js/modules/camera-controls-restore.js | 67 | `autoRotateSoftResumeStartedAt` | `if (state.autoRotateSoftResumeStartedAt) state.autoRotateSoftResumeStartedAt = 0` | navStore | port to store |
| js/modules/camera-controls-restore.js | 78 | `autoRotateSuspended` | `state.autoRotateSuspended = suspended` | navStore | port to store |
| js/modules/camera-controls-restore.js | 80 | `autoRotateSoftResumeStartedAt` | `state.autoRotateSoftResumeStartedAt = 0` | navStore | port to store |
| js/modules/camera-controls-restore.js | 82 | `autoRotateSoftResumeStartedAt` | `state.autoRotateSoftResumeStartedAt = performance.now()` | navStore | port to store |
| js/modules/camera-controls-restore.js | 90 | `autoRotateResumeTimer` | `state.autoRotateResumeTimer = null` | navStore | port to store |
| js/modules/camera-controls-restore.js | 91 | `autoRotateResumeDueAt` | `state.autoRotateResumeDueAt = 0` | navStore | port to store |
| js/modules/camera-controls-restore.js | 108 | `autoRotateResumeDueAt` | `state.autoRotateResumeDueAt = performance.now() + delay` | navStore | port to store |
| js/modules/camera-controls-restore.js | 109 | `autoRotateResumeTimer` | `state.autoRotateResumeTimer = setTimeout(() => {` | navStore | port to store |
| js/modules/camera-controls-restore.js | 110 | `autoRotateResumeTimer` | `state.autoRotateResumeTimer = null` | navStore | port to store |
| js/modules/camera-controls-restore.js | 111 | `autoRotateResumeDueAt` | `state.autoRotateResumeDueAt = 0` | navStore | port to store |
| js/modules/camera-controls-restore.js | 134 | `AUTO_ROTATE_BASE_SPEED` | `if (!Number.isFinite(state.AUTO_ROTATE_BASE_SPEED)) state.AUTO_ROTATE_BASE_SPEED` | navStore | port to store |
| js/modules/camera-controls-restore.js | 153 | `autoRotateSoftResumeStartedAt` | `state.autoRotateSoftResumeStartedAt = 0` | navStore | port to store |
| js/modules/camera-controls-restore.js | 163 | `autoRotate` | `state.autoRotate = false` | navStore | port to store |
| js/modules/camera-controls-restore.js | 175 | `autoRotate` | `state.autoRotate = !state.autoRotate` | navStore | port to store |
| js/modules/camera-controls-restore.js | 185 | `autoRotate` | `rotateBtn.setAttribute('aria-pressed', String(state.autoRotate === true))` | navStore | port to store |
| js/modules/camera-orbit-slack.ts | 100 | `focusOrbitSlackState` | `state.focusOrbitSlackState = {` | focusStore | port to store |
| js/modules/camera-orbit-slack.ts | 120 | `focusOrbitSlackState` | `state.focusOrbitSlackState = {` | focusStore | port to store |
| js/modules/camera-orbit-slack.ts | 139 | `focusOrbitSlackState` | `state.focusOrbitSlackState = {` | focusStore | port to store |
| js/modules/weather.ts | 55 | `weatherInitialized` | `state.weatherInitialized = true;` | engine-only | keep in bridge |
| js/modules/weather.ts | 65 | `weatherInitialized` | `state.weatherInitialized = false;` | engine-only | keep in bridge |
| js/modules/weather.ts | 71 | `weather` | `state.weather = normalizeWeatherPayload(payload);` | engine-only | keep in bridge |
| js/modules/weather.ts | 73 | `lastSuccessfulFetch` | `state.lastSuccessfulFetch = Date.now();` | engine-only | keep in bridge |
| js/modules/weather.ts | 82 | `weather` | `state.weather = null;` | engine-only | keep in bridge |
| js/modules/filter-state.ts | 23 | `activeFilters` | `state.activeFilters = { ...FILTER_DEFAULTS };` | filterStore | port to store |
| js/modules/filter-state.ts | 41 | `activeFilters` | `state.activeFilters = { ...FILTER_DEFAULTS, ...nextFilters };` | filterStore | port to store |
| js/modules/filter-state.ts | 63 | `activeFilters` | `state.activeFilters = { ...FILTER_DEFAULTS };` | filterStore | port to store |
| js/modules/filter-state.ts | 72 | `activeClusterFilter` | `state.activeClusterFilter = Number.isFinite(cluster) ? cluster : null;` | filterStore | port to store |
| js/modules/filter-state.ts | 78 | `filterVersion` | `state.filterVersion = Number(state.filterVersion \|\| 0) + 1;` | filterStore | port to store |
| js/modules/filter-state.ts | 98 | `activeClusterFilter` | `state.activeClusterFilter = requestedCluster !== null &&` | filterStore | port to store |
| js/modules/camera-controls-core.ts | 18 | `focusTransitionMode` | `state.focusTransitionMode = normalizedMode;` | focusStore | port to store |
| js/modules/camera-controls-core.ts | 19 | `focusTransitionStartedAt` | `state.focusTransitionStartedAt = performance.now();` | focusStore | port to store |
| js/modules/camera-controls-core.ts | 22 | `focusTransitionSettleTimer` | `state.focusTransitionSettleTimer = null;` | focusStore | port to store |
| js/modules/camera-controls-core.ts | 30 | `focusTransitionSettleTimer` | `state.focusTransitionSettleTimer = window.setTimeout(() => {` | focusStore | port to store |
| js/modules/camera-controls-core.ts | 48 | `focusCameraAssistActive` | `state.focusCameraAssistActive = true;` | focusStore | port to store |
| js/modules/camera-controls-core.ts | 49 | `focusCameraAssistUntil` | `state.focusCameraAssistUntil = performance.now() + Math.max(180, duration);` | focusStore | port to store |
| js/modules/camera-controls-core.ts | 50 | `focusCameraAssistReason` | `state.focusCameraAssistReason = reason;` | focusStore | port to store |
| js/modules/camera-controls-core.ts | 62 | `focusCameraAssistReason` | `state.focusCameraAssistReason = reason;` | focusStore | port to store |
| js/modules/camera-controls-core.ts | 66 | `focusCameraAssistActive` | `state.focusCameraAssistActive = false;` | focusStore | port to store |
| js/modules/camera-controls-core.ts | 67 | `focusCameraAssistUntil` | `state.focusCameraAssistUntil = 0;` | focusStore | port to store |
| js/modules/camera-controls-core.ts | 68 | `focusCameraAssistReason` | `state.focusCameraAssistReason = reason;` | focusStore | port to store |
| js/modules/camera-controls-core.ts | 69 | `focusCameraOffset` | `state.focusCameraOffset = null;` | focusStore | port to store |
| js/modules/camera-controls-core.ts | 110 | `routeExplorationState` | `state.routeExplorationState = {` | cameraStore | port to store |
| js/modules/camera-orbit-slack.js | 99 | `focusOrbitSlackState` | `state.focusOrbitSlackState = {` | focusStore | port to store |
| js/modules/camera-orbit-slack.js | 119 | `focusOrbitSlackState` | `state.focusOrbitSlackState = {` | focusStore | port to store |
| js/modules/camera-orbit-slack.js | 138 | `focusOrbitSlackState` | `state.focusOrbitSlackState = {` | focusStore | port to store |
| js/modules/data-loader.ts | 66 | `dataLoadAttempt` | `state.dataLoadAttempt = (state.dataLoadAttempt \|\| 0) + 1;` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 86 | `points` | `state.points = normalizedPoints;` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 87 | `leadEnrichment` | `state.leadEnrichment = enrichment;` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 88 | `pointIndexByLeadId` | `state.pointIndexByLeadId = new Map(Object.entries(pointIndexByLeadId));` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 89 | `rawPositionsBuffer` | `state.rawPositionsBuffer = positionsBuffer;` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 90 | `rawClustersBuffer` | `state.rawClustersBuffer = clustersBuffer;` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 112 | `points` | `state.points = [];` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 113 | `pointIndexByLeadId` | `state.pointIndexByLeadId = new Map();` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 114 | `leadEnrichment` | `state.leadEnrichment = enrichment;` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 115 | `projectedNeighborGrid` | `state.projectedNeighborGrid = null;` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 116 | `projectedNeighborCache` | `state.projectedNeighborCache = new Map();` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 117 | `rawPositionsBuffer` | `state.rawPositionsBuffer = null;` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 118 | `rawClustersBuffer` | `state.rawClustersBuffer = null;` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 158 | `points` | `state.points = points;` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 159 | `leadEnrichment` | `state.leadEnrichment = enrichment;` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 160 | `rawPositionsBuffer` | `state.rawPositionsBuffer = positionsBuffer;` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 161 | `rawClustersBuffer` | `state.rawClustersBuffer = clustersBuffer;` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 162 | `pointIndexByLeadId` | `state.pointIndexByLeadId = new Map();` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 220 | `projectedNeighborGrid` | `state.projectedNeighborGrid = null;` | engine-only | keep in bridge |
| js/modules/data-loader.ts | 221 | `projectedNeighborCache` | `state.projectedNeighborCache = new Map();` | engine-only | keep in bridge |
| js/modules/event-bindings.ts | 61 | `eventListenersInitialized` | `state.eventListenersInitialized = true;` | navStore | port to store |
| js/modules/weather.js | 28 | `weatherInitialized` | `state.weatherInitialized = true;` | engine-only | keep in bridge |
| js/modules/weather.js | 38 | `weatherInitialized` | `state.weatherInitialized = false;` | engine-only | keep in bridge |
| js/modules/weather.js | 44 | `weather` | `state.weather = normalizeWeatherPayload(payload);` | engine-only | keep in bridge |
| js/modules/weather.js | 46 | `lastSuccessfulFetch` | `state.lastSuccessfulFetch = Date.now();` | engine-only | keep in bridge |
| js/modules/weather.js | 56 | `weather` | `state.weather = null;` | engine-only | keep in bridge |
| js/modules/filter-state.js | 18 | `activeFilters` | `state.activeFilters = { ...FILTER_DEFAULTS };` | filterStore | port to store |
| js/modules/filter-state.js | 36 | `activeFilters` | `state.activeFilters = { ...FILTER_DEFAULTS, ...nextFilters };` | filterStore | port to store |
| js/modules/filter-state.js | 58 | `activeFilters` | `state.activeFilters = { ...FILTER_DEFAULTS };` | filterStore | port to store |
| js/modules/filter-state.js | 67 | `activeClusterFilter` | `state.activeClusterFilter = Number.isFinite(cluster) ? cluster : null;` | filterStore | port to store |
| js/modules/filter-state.js | 73 | `filterVersion` | `state.filterVersion = Number(state.filterVersion \|\| 0) + 1;` | filterStore | port to store |
| js/modules/filter-state.js | 93 | `activeClusterFilter` | `state.activeClusterFilter = requestedCluster !== null &&` | filterStore | port to store |
| js/modules/event-bindings.js | 45 | `eventListenersInitialized` | `state.eventListenersInitialized = true;` | navStore | port to store |
| js/modules/camera-controls-core.js | 9 | `focusTransitionMode` | `state.focusTransitionMode = normalizedMode` | focusStore | port to store |
| js/modules/camera-controls-core.js | 10 | `focusTransitionStartedAt` | `state.focusTransitionStartedAt = performance.now()` | focusStore | port to store |
| js/modules/camera-controls-core.js | 13 | `focusTransitionSettleTimer` | `state.focusTransitionSettleTimer = null` | focusStore | port to store |
| js/modules/camera-controls-core.js | 21 | `focusTransitionSettleTimer` | `state.focusTransitionSettleTimer = window.setTimeout(() => {` | focusStore | port to store |
| js/modules/camera-controls-core.js | 37 | `focusCameraAssistActive` | `state.focusCameraAssistActive = true` | focusStore | port to store |
| js/modules/camera-controls-core.js | 38 | `focusCameraAssistUntil` | `state.focusCameraAssistUntil = performance.now() + Math.max(180, duration)` | focusStore | port to store |
| js/modules/camera-controls-core.js | 39 | `focusCameraAssistReason` | `state.focusCameraAssistReason = reason` | focusStore | port to store |
| js/modules/camera-controls-core.js | 52 | `focusCameraAssistActive` | `state.focusCameraAssistActive = false` | focusStore | port to store |
| js/modules/camera-controls-core.js | 53 | `focusCameraAssistUntil` | `state.focusCameraAssistUntil = 0` | focusStore | port to store |
| js/modules/camera-controls-core.js | 54 | `focusCameraAssistReason` | `state.focusCameraAssistReason = reason` | focusStore | port to store |
| js/modules/camera-controls-core.js | 55 | `focusCameraOffset` | `state.focusCameraOffset = null` | focusStore | port to store |
| js/modules/camera-controls-core.js | 88 | `routeExplorationState` | `state.routeExplorationState = {` | cameraStore | port to store |
| js/modules/data-loader.js | 60 | `dataLoadAttempt` | `state.dataLoadAttempt = (state.dataLoadAttempt \|\| 0) + 1;` | engine-only | keep in bridge |
| js/modules/data-loader.js | 82 | `points` | `state.points = normalizedPoints;` | engine-only | keep in bridge |
| js/modules/data-loader.js | 83 | `leadEnrichment` | `state.leadEnrichment = enrichment;` | engine-only | keep in bridge |
| js/modules/data-loader.js | 84 | `pointIndexByLeadId` | `state.pointIndexByLeadId = new Map(Object.entries(pointIndexByLeadId));` | engine-only | keep in bridge |
| js/modules/data-loader.js | 85 | `rawPositionsBuffer` | `state.rawPositionsBuffer = positionsBuffer;` | engine-only | keep in bridge |
| js/modules/data-loader.js | 108 | `points` | `state.points = [];` | engine-only | keep in bridge |
| js/modules/data-loader.js | 109 | `pointIndexByLeadId` | `state.pointIndexByLeadId = new Map();` | engine-only | keep in bridge |
| js/modules/data-loader.js | 110 | `leadEnrichment` | `state.leadEnrichment = enrichment;` | engine-only | keep in bridge |
| js/modules/data-loader.js | 111 | `projectedNeighborGrid` | `state.projectedNeighborGrid = null;` | engine-only | keep in bridge |
| js/modules/data-loader.js | 157 | `points` | `state.points = points;` | engine-only | keep in bridge |
| js/modules/camera-controls-choreography.ts | 113 | `focusCameraTargetOffset` | `if (!(state.focusCameraTargetOffset as any)?.copy) state.focusCameraTargetOffset` | focusStore | port to store |
| js/modules/camera-controls-choreography.ts | 195 | `focusCameraOffset` | `state.focusCameraOffset = desiredCamPos.clone().sub(focusTarget);` | focusStore | port to store |
| js/modules/camera-controls-choreography.ts | 197 | `focusCameraTargetOffset` | `state.focusCameraTargetOffset = new THREE.Vector3();` | focusStore | port to store |
| js/modules/camera-controls-choreography.ts | 305 | `focusCameraOffset` | `state.focusCameraOffset = null;` | focusStore | port to store |
| js/modules/camera-controls-choreography.ts | 319 | `selectedPoint` | `state.selectedPoint = point;` | focusStore | port to store |
| js/modules/camera-controls-choreography.ts | 320 | `hoverHighlightIndex` | `state.hoverHighlightIndex = -1;` | focusStore | port to store |
| js/modules/camera-controls-choreography.ts | 321 | `pinnedThreadIndex` | `state.pinnedThreadIndex = null;` | focusStore | port to store |
| js/modules/camera-controls-choreography.ts | 483 | `routeCameraAnimationToken` | `const animationToken = (state.routeCameraAnimationToken = (state.routeCameraAnim` | cameraStore | port to store |
| js/modules/focus-pocket-personality.js | 35 | `trailDepth` | `if (state.trailDepth === 2) {` | navStore | port to store |
| js/modules/camera-controls-choreography.js | 94 | `focusCameraTargetOffset` | `if (!state.focusCameraTargetOffset?.copy) state.focusCameraTargetOffset = new TH` | focusStore | port to store |
| js/modules/camera-controls-choreography.js | 181 | `focusCameraOffset` | `state.focusCameraOffset = desiredCamPos.clone().sub(focusTarget)` | focusStore | port to store |
| js/modules/camera-controls-choreography.js | 183 | `focusCameraTargetOffset` | `state.focusCameraTargetOffset = new THREE.Vector3()` | focusStore | port to store |
| js/modules/camera-controls-choreography.js | 292 | `focusCameraOffset` | `state.focusCameraOffset = null` | focusStore | port to store |
| js/modules/camera-controls-choreography.js | 303 | `selectedPoint` | `state.selectedPoint = point` | focusStore | port to store |
| js/modules/camera-controls-choreography.js | 304 | `hoverHighlightIndex` | `state.hoverHighlightIndex = -1` | focusStore | port to store |
| js/modules/camera-controls-choreography.js | 468 | `routeCameraAnimationToken` | `const animationToken = (state.routeCameraAnimationToken = (state.routeCameraAnim` | cameraStore | port to store |
| js/modules/journey-canvas-node-picking.ts | 132 | `lastCanvasNodePick` | `state.lastCanvasNodePick = raycastCandidate as any;` | focusStore | port to store |
| js/modules/journey-canvas-node-picking.ts | 152 | `lastCanvasNodePick` | `state.lastCanvasNodePick = resolved as any;` | focusStore | port to store |
| js/modules/journey-arrival-handoff.ts | 22 | `arrivalHandoffGroup` | `state.arrivalHandoffGroup = null;` | engine-only | keep in bridge |
| js/modules/journey-arrival-handoff.ts | 23 | `arrivalHandoffDiagnostics` | `state.arrivalHandoffDiagnostics = {` | engine-only | keep in bridge |
| js/modules/journey-arrival-handoff.ts | 66 | `arrivalHandoffGroup` | `state.arrivalHandoffGroup = group;` | engine-only | keep in bridge |
| js/modules/journey-arrival-handoff.ts | 67 | `arrivalHandoffDiagnostics` | `state.arrivalHandoffDiagnostics = {` | engine-only | keep in bridge |
| js/modules/journey-arrival-handoff.ts | 136 | `arrivalHandoffDiagnostics` | `state.arrivalHandoffDiagnostics = {` | engine-only | keep in bridge |
| js/modules/focus-anchor-indicator.js | 56 | `focusAnchorGroup` | `state.focusAnchorGroup = group;` | focusStore | port to store |
| js/modules/focus-anchor-indicator.js | 80 | `focusAnchorRingMesh` | `state.focusAnchorRingMesh = ringMesh;` | focusStore | port to store |
| js/modules/focus-anchor-indicator.js | 100 | `focusAnchorHaloSprite` | `state.focusAnchorHaloSprite = haloSprite;` | focusStore | port to store |
| js/modules/focus-anchor-indicator.js | 193 | `focusAnchorGroup` | `state.focusAnchorGroup = null;` | focusStore | port to store |
| js/modules/focus-anchor-indicator.js | 194 | `focusAnchorRingMesh` | `state.focusAnchorRingMesh = null;` | focusStore | port to store |
| js/modules/focus-anchor-indicator.js | 195 | `focusAnchorHaloSprite` | `state.focusAnchorHaloSprite = null;` | focusStore | port to store |
| js/modules/focus-anchor-indicator.ts | 31 | `focusAnchorGroup` | `state.focusAnchorGroup = group;` | focusStore | port to store |
| js/modules/focus-anchor-indicator.ts | 53 | `focusAnchorRingMesh` | `state.focusAnchorRingMesh = ringMesh;` | focusStore | port to store |
| js/modules/focus-anchor-indicator.ts | 71 | `focusAnchorHaloSprite` | `state.focusAnchorHaloSprite = haloSprite;` | focusStore | port to store |
| js/modules/focus-anchor-indicator.ts | 152 | `focusAnchorGroup` | `state.focusAnchorGroup = null;` | focusStore | port to store |
| js/modules/focus-anchor-indicator.ts | 153 | `focusAnchorRingMesh` | `state.focusAnchorRingMesh = null;` | focusStore | port to store |
| js/modules/focus-anchor-indicator.ts | 154 | `focusAnchorHaloSprite` | `state.focusAnchorHaloSprite = null;` | focusStore | port to store |
| js/modules/journey.ts | 104 | `trailIndices` | `state.trailIndices = state.trailIndices \|\| new Set()` | focusStore | port to store |
| js/modules/journey-canvas-hover.ts | 16 | `hoverHighlightIndex` | `state.hoverHighlightIndex = -1;` | focusStore | port to store |
| js/modules/journey-canvas-hover.ts | 17 | `stableCanvasHover` | `state.stableCanvasHover = null;` | focusStore | port to store |
| js/modules/journey-canvas-hover.ts | 19 | `lastCanvasNodeHover` | `state.lastCanvasNodeHover = null;` | focusStore | port to store |
| js/modules/journey-canvas-hover.ts | 54 | `stableCanvasHover` | `state.stableCanvasHover = candidate as any;` | focusStore | port to store |
| js/modules/journey-canvas-hover.ts | 59 | `stableCanvasHover` | `state.stableCanvasHover = candidate as any;` | focusStore | port to store |
| js/modules/journey-canvas-hover.ts | 62 | `hoverHighlightIndex` | `state.hoverHighlightIndex = stableCandidate.index;` | focusStore | port to store |
| js/modules/journey-canvas-hover.ts | 64 | `lastCanvasNodeHover` | `state.lastCanvasNodeHover = stableCandidate as any;` | focusStore | port to store |
| js/modules/journey-canvas-node-picking.js | 109 | `lastCanvasNodePick` | `state.lastCanvasNodePick = raycastCandidate;` | focusStore | port to store |
| js/modules/journey-canvas-node-picking.js | 129 | `lastCanvasNodePick` | `state.lastCanvasNodePick = resolved;` | focusStore | port to store |
| js/modules/bindings\view-bindings.ts | 31 | `currentView` | `if (state.currentView === 'map' && typeof zoomMap === 'function') {` | navStore | port to store |
| js/modules/view-controller.ts | 73 | `viewHandoffTimer` | `state.viewHandoffTimer = null;` | cameraStore | port to store |
| js/modules/view-controller.ts | 99 | `viewHandoffTimer` | `state.viewHandoffTimer = null;` | cameraStore | port to store |
| js/modules/view-controller.ts | 105 | `viewHandoffTimer` | `state.viewHandoffTimer = window.setTimeout(() => {` | cameraStore | port to store |
| js/modules/view-controller.ts | 109 | `viewHandoffTimer` | `state.viewHandoffTimer = null;` | cameraStore | port to store |
| js/modules/view-controller.ts | 140 | `viewSwitchPreludeTimer` | `state.viewSwitchPreludeTimer = null;` | cameraStore | port to store |
| js/modules/view-controller.ts | 167 | `viewSwitchPreludeTimer` | `state.viewSwitchPreludeTimer = window.setTimeout(() => {` | cameraStore | port to store |
| js/modules/view-controller.ts | 168 | `viewSwitchPreludeTimer` | `state.viewSwitchPreludeTimer = null;` | cameraStore | port to store |
| js/modules/view-controller.ts | 233 | `viewSwitchPreludeTimer` | `state.viewSwitchPreludeTimer = null;` | cameraStore | port to store |
| js/modules/view-controller.ts | 240 | `clockTimer` | `state.clockTimer = null;` | cameraStore | port to store |
| js/modules/view-controller.ts | 245 | `semanticLaneMonitorTimer` | `state.semanticLaneMonitorTimer = null;` | cameraStore | port to store |
| js/modules/view-controller.ts | 249 | `semanticLaneOpsRefreshTimer` | `state.semanticLaneOpsRefreshTimer = null;` | cameraStore | port to store |
| js/modules/journey-canvas-hover.js | 10 | `canvasFieldHoverClearTimer` | `state.canvasFieldHoverClearTimer = null;` | focusStore | port to store |
| js/modules/journey-canvas-hover.js | 13 | `hoverHighlightIndex` | `state.hoverHighlightIndex = -1;` | focusStore | port to store |
| js/modules/journey-canvas-hover.js | 14 | `stableCanvasHover` | `state.stableCanvasHover = null;` | focusStore | port to store |
| js/modules/journey-canvas-hover.js | 22 | `canvasFieldHoverClearTimer` | `state.canvasFieldHoverClearTimer = canvasInteractionAdapter.setTimer(clear, CANV` | focusStore | port to store |
| js/modules/journey-canvas-hover.js | 32 | `canvasFieldHoverClearTimer` | `state.canvasFieldHoverClearTimer = null;` | focusStore | port to store |
| js/modules/journey-canvas-hover.js | 42 | `stableCanvasHover` | `state.stableCanvasHover = candidate;` | focusStore | port to store |
| js/modules/journey-canvas-hover.js | 47 | `stableCanvasHover` | `state.stableCanvasHover = candidate;` | focusStore | port to store |
| js/modules/journey-canvas-hover.js | 50 | `hoverHighlightIndex` | `state.hoverHighlightIndex = stableCandidate.index;` | focusStore | port to store |
| js/modules/journey-canvas-hover.js | 52 | `lastCanvasNodeHover` | `state.lastCanvasNodeHover = stableCandidate;` | focusStore | port to store |
| js/modules/focus-pocket.ts | 186 | `nodesAreSettling` | `state.nodesAreSettling = true;` | navStore | port to store |
| js/modules/focus-pocket.ts | 187 | `autoRotate` | `state.autoRotate = false;` | navStore | port to store |
| js/modules/focus-pocket.ts | 193 | `nodesAreSettling` | `state.nodesAreSettling = false;` | navStore | port to store |
| js/modules/focus-pocket.ts | 194 | `autoRotate` | `state.autoRotate = true;` | navStore | port to store |
| js/modules/focus-pocket.ts | 249 | `nodesAreSettling` | `state.nodesAreSettling = true;` | navStore | port to store |
| js/modules/focus-pocket.ts | 250 | `autoRotate` | `state.autoRotate = false;` | navStore | port to store |
| js/modules/focus-pocket.ts | 314 | `trailDepth` | `if (state.trailDepth === 2) {` | navStore | port to store |
| js/modules/focus-pocket.ts | 326 | `nodesAreSettling` | `state.nodesAreSettling = true;` | navStore | port to store |
| js/modules/journey-arrival-handoff.js | 17 | `arrivalHandoffGroup` | `state.arrivalHandoffGroup = null;` | engine-only | keep in bridge |
| js/modules/journey-arrival-handoff.js | 18 | `arrivalHandoffDiagnostics` | `state.arrivalHandoffDiagnostics = {` | engine-only | keep in bridge |
| js/modules/journey-arrival-handoff.js | 60 | `arrivalHandoffGroup` | `state.arrivalHandoffGroup = group;` | engine-only | keep in bridge |
| js/modules/journey-arrival-handoff.js | 61 | `arrivalHandoffDiagnostics` | `state.arrivalHandoffDiagnostics = {` | engine-only | keep in bridge |
| js/modules/journey-arrival-handoff.js | 128 | `arrivalHandoffDiagnostics` | `state.arrivalHandoffDiagnostics = {` | engine-only | keep in bridge |
| js/modules/focus-pocket-personality.ts | 71 | `trailDepth` | `if (state.trailDepth === 2) {` | navStore | port to store |
| js/modules/bindings\view-bindings.js | 18 | `currentView` | `if (state.currentView === 'map' && typeof zoomMap === 'function') {` | navStore | port to store |
| js/modules/journey.js | 107 | `trailIndices` | `state.trailIndices = state.trailIndices \|\| new Set()` | focusStore | port to store |
| js/modules/focus-pocket.js | 86 | `focusPocketMotionByIndex` | `state.focusPocketMotionByIndex = map;` | focusStore | port to store |
| js/modules/focus-pocket.js | 91 | `focusPocketMotionByIndex` | `state.focusPocketMotionByIndex = new Map();` | focusStore | port to store |
| js/modules/focus-pocket.js | 97 | `focusPocketMotionByIndex` | `state.focusPocketMotionByIndex = new Map();` | focusStore | port to store |
| js/modules/focus-pocket.js | 150 | `focusPocketAnimationFrameId` | `state.focusPocketAnimationFrameId = undefined;` | focusStore | port to store |
| js/modules/focus-pocket.js | 157 | `focusPocketTransitionStartedAt` | `state.focusPocketTransitionStartedAt = performance.now();` | focusStore | port to store |
| js/modules/focus-pocket.js | 198 | `nodesAreSettling` | `state.nodesAreSettling = true;` | navStore | port to store |
| js/modules/focus-pocket.js | 199 | `autoRotate` | `state.autoRotate = false;` | navStore | port to store |
| js/modules/focus-pocket.js | 207 | `nodesAreSettling` | `state.nodesAreSettling = false;` | navStore | port to store |
| js/modules/focus-pocket.js | 208 | `autoRotate` | `state.autoRotate = true;` | navStore | port to store |
| js/modules/focus-pocket.js | 263 | `nodesAreSettling` | `state.nodesAreSettling = true;` | navStore | port to store |
| js/modules/focus-pocket.js | 264 | `autoRotate` | `state.autoRotate = false;` | navStore | port to store |
| js/modules/focus-pocket.js | 330 | `trailDepth` | `if (state.trailDepth === 2) {` | navStore | port to store |
| js/modules/focus-pocket.js | 342 | `nodesAreSettling` | `state.nodesAreSettling = true;` | navStore | port to store |
| js/modules/view-controller.js | 39 | `viewHandoffTimer` | `state.viewHandoffTimer = null` | cameraStore | port to store |
| js/modules/view-controller.js | 65 | `viewHandoffTimer` | `state.viewHandoffTimer = null` | cameraStore | port to store |
| js/modules/view-controller.js | 71 | `viewHandoffTimer` | `state.viewHandoffTimer = window.setTimeout(() => {` | cameraStore | port to store |
| js/modules/view-controller.js | 75 | `viewHandoffTimer` | `state.viewHandoffTimer = null` | cameraStore | port to store |
| js/modules/view-controller.js | 106 | `viewSwitchPreludeTimer` | `state.viewSwitchPreludeTimer = null` | cameraStore | port to store |
| js/modules/view-controller.js | 133 | `viewSwitchPreludeTimer` | `state.viewSwitchPreludeTimer = window.setTimeout(() => {` | cameraStore | port to store |
| js/modules/view-controller.js | 134 | `viewSwitchPreludeTimer` | `state.viewSwitchPreludeTimer = null` | cameraStore | port to store |
| js/modules/view-controller.js | 197 | `viewSwitchPreludeTimer` | `state.viewSwitchPreludeTimer = null` | cameraStore | port to store |
| js/modules/view-controller.js | 204 | `clockTimer` | `state.clockTimer = null` | cameraStore | port to store |
| js/modules/view-controller.js | 209 | `semanticLaneMonitorTimer` | `state.semanticLaneMonitorTimer = null` | cameraStore | port to store |
| js/modules/view-controller.js | 213 | `semanticLaneOpsRefreshTimer` | `state.semanticLaneOpsRefreshTimer = null` | cameraStore | port to store |
| js/modules/journey-point-color.js | 39 | `filterColorStateKey` | `if (state.filterColorStateKey === colorStateKey) return;` | filterStore | port to store |
| js/modules/journey-point-color.js | 85 | `myceliumMode` | `} else if (state.myceliumMode === 'bloom') {` | navStore | port to store |
| js/modules/journey-point-color.js | 89 | `myceliumMode` | `} else if (state.myceliumMode === 'bridge') {` | navStore | port to store |
| js/modules/journey-point-color.js | 103 | `filterColorVersion` | `state.filterColorVersion = state.filterVersion;` | filterStore | port to store |
| js/modules/journey-point-color.js | 104 | `filterColorStateKey` | `state.filterColorStateKey = colorStateKey;` | filterStore | port to store |
| js/modules/journey-point-color.js | 107 | `searchGlowRenderStateKey` | `state.searchGlowRenderStateKey = '';` | searchStore | port to store |
| js/modules/journey-thread-model.js | 52 | `projectedNeighborGrid` | `state.projectedNeighborGrid = buildSpatialGrid(0.12);` | engine-only | keep in bridge |
| js/modules/journey-point-color.ts | 45 | `filterColorStateKey` | `if (state.filterColorStateKey === colorStateKey) return;` | filterStore | port to store |
| js/modules/journey-point-color.ts | 91 | `myceliumMode` | `} else if (state.myceliumMode === 'bloom') {` | navStore | port to store |
| js/modules/journey-point-color.ts | 95 | `myceliumMode` | `} else if (state.myceliumMode === 'bridge') {` | navStore | port to store |
| js/modules/journey-point-color.ts | 97 | `myceliumMode` | `} else if (state.myceliumMode === 'trail') {` | navStore | port to store |
| js/modules/journey-neighborhood.js | 311 | `currentView` | `const requireSemantic = options.requireSemantic ?? state.currentView === 'galaxy` | navStore | port to store |
| js/modules/journey-neighborhood.js | 312 | `currentView` | `const requireOnCanvas = options.requireOnCanvas ?? state.currentView === 'galaxy` | navStore | port to store |
| js/modules/journey-neighborhood.js | 334 | `currentView` | `if (state.currentView === 'map') {` | navStore | port to store |
| js/modules/journey-neighborhood.ts | 357 | `currentView` | `const requireSemantic: boolean = options.requireSemantic ?? state.currentView ==` | navStore | port to store |
| js/modules/journey-neighborhood.ts | 358 | `currentView` | `const requireOnCanvas: boolean = options.requireOnCanvas ?? state.currentView ==` | navStore | port to store |
| js/modules/journey-neighborhood.ts | 380 | `currentView` | `if (state.currentView === 'map') {` | navStore | port to store |
| js/modules/scene-reveal.ts | 23 | `sceneRevealActive` | `state.sceneRevealActive = true;` | cameraStore | port to store |
| js/modules/scene-reveal.ts | 25 | `sceneRevealStartedAt` | `state.sceneRevealStartedAt = performance.now();` | cameraStore | port to store |
| js/modules/scene-reveal.ts | 26 | `sceneRevealCameraEnd` | `state.sceneRevealCameraEnd = (state.camera as any).position.clone();` | cameraStore | port to store |
| js/modules/scene-reveal.ts | 28 | `sceneRevealCameraStart` | `state.sceneRevealCameraStart = (() => {` | cameraStore | port to store |
| js/modules/scene-reveal.ts | 42 | `sceneRevealActive` | `state.sceneRevealActive = false;` | cameraStore | port to store |
| js/modules/journey-thread-settler.ts | 195 | `currentView` | `state.currentView === 'galaxy' && isBoundedNeighborhoodActive() && !options.expa` | navStore | port to store |
| js/modules/journey-thread-settler.ts | 196 | `currentView` | `if (state.currentView === 'map') {` | navStore | port to store |
| js/modules/journey-thread-settler.ts | 277 | `currentView` | `requireSemantic: state.currentView === 'galaxy',` | navStore | port to store |
| js/modules/journey-thread-settler.ts | 278 | `currentView` | `requireOnCanvas: state.currentView === 'galaxy',` | navStore | port to store |
| js/modules/journey-thread-model.ts | 72 | `projectedNeighborGrid` | `state.projectedNeighborGrid = buildSpatialGrid(0.12) as any;` | engine-only | keep in bridge |
| js/modules/journey-thread-settler.js | 166 | `pinnedThreadIndex` | `state.pinnedThreadIndex = null;` | focusStore | port to store |
| js/modules/journey-thread-settler.js | 167 | `inspectedThreadIndex` | `state.inspectedThreadIndex = index;` | focusStore | port to store |
| js/modules/journey-thread-settler.js | 179 | `currentView` | `state.currentView === 'galaxy' && isBoundedNeighborhoodActive() && !options.expa` | navStore | port to store |
| js/modules/journey-thread-settler.js | 180 | `currentView` | `if (state.currentView === 'map') {` | navStore | port to store |
| js/modules/journey-thread-settler.js | 271 | `currentView` | `requireSemantic: state.currentView === 'galaxy',` | navStore | port to store |
| js/modules/journey-thread-settler.js | 272 | `currentView` | `requireOnCanvas: state.currentView === 'galaxy',` | navStore | port to store |
| js/modules/map-state.ts | 129 | `mapInitialized` | `if (state.mapInitialized && !state.map) state.mapInitialized = false;` | engine-only | keep in bridge |
| js/modules/map-state.ts | 137 | `map` | `state.map = null;` | engine-only | keep in bridge |
| js/modules/map-state.ts | 138 | `markersLayer` | `state.markersLayer = null;` | engine-only | keep in bridge |
| js/modules/map-state.ts | 139 | `mapRouteLayer` | `state.mapRouteLayer = null;` | engine-only | keep in bridge |
| js/modules/map-state.ts | 140 | `pointMarkers` | `state.pointMarkers = [];` | engine-only | keep in bridge |
| js/modules/map-state.ts | 156 | `map` | `state.map = L.map(container, {` | engine-only | keep in bridge |
| js/modules/map-state.ts | 171 | `markersLayer` | `state.markersLayer = L.layerGroup().addTo(state.map);` | engine-only | keep in bridge |
| js/modules/map-state.ts | 172 | `mapRouteLayer` | `state.mapRouteLayer = L.layerGroup().addTo(state.map);` | engine-only | keep in bridge |
| js/modules/map-state.ts | 173 | `pointMarkers` | `state.pointMarkers = [];` | engine-only | keep in bridge |
| js/modules/map-state.ts | 199 | `focusedNode` | `state.focusedNode === index;` | focusStore | port to store |
| js/modules/map-state.ts | 216 | `mapInitialized` | `state.mapInitialized = true;` | engine-only | keep in bridge |
| js/modules/map-state.ts | 227 | `mapInitialized` | `state.mapInitialized = false;` | engine-only | keep in bridge |
| js/modules/map-state.ts | 228 | `map` | `state.map = null;` | engine-only | keep in bridge |
| js/modules/map-state.ts | 229 | `markersLayer` | `state.markersLayer = null;` | engine-only | keep in bridge |
| js/modules/map-state.ts | 230 | `mapRouteLayer` | `state.mapRouteLayer = null;` | engine-only | keep in bridge |
| js/modules/map-state.ts | 231 | `pointMarkers` | `state.pointMarkers = [];` | engine-only | keep in bridge |
| js/modules/map-state.ts | 275 | `currentView` | `if (state.currentView === 'map' && !trailStateActive) {` | navStore | port to store |
| js/modules/map-state.ts | 392 | `focusedNode` | `const isFocused = state.focusedNode === index;` | focusStore | port to store |
| js/modules/map-state.ts | 464 | `currentView` | `if (state.currentView === 'map') {` | navStore | port to store |
| js/modules/map-state.ts | 497 | `terrainHandoffState` | `state.terrainHandoffState = {` | cameraStore | port to store |
| js/modules/map-state.ts | 516 | `terrainHandoffTimer` | `state.terrainHandoffTimer = null;` | cameraStore | port to store |
| js/modules/map-state.ts | 520 | `terrainHandoffTimer` | `state.terrainHandoffTimer = window.setTimeout(() => {` | cameraStore | port to store |
| js/modules/map-state.ts | 521 | `currentView` | `const settlePhase = options.settlePhase \|\| (state.currentView === 'map' ? 'set` | navStore | port to store |
| js/modules/scene-reveal.js | 17 | `sceneRevealActive` | `state.sceneRevealActive = true;` | cameraStore | port to store |
| js/modules/scene-reveal.js | 19 | `sceneRevealStartedAt` | `state.sceneRevealStartedAt = performance.now();` | cameraStore | port to store |
| js/modules/scene-reveal.js | 20 | `sceneRevealCameraEnd` | `state.sceneRevealCameraEnd = state.camera.position.clone();` | cameraStore | port to store |
| js/modules/scene-reveal.js | 22 | `sceneRevealCameraStart` | `state.sceneRevealCameraStart = (() => {` | cameraStore | port to store |
| js/modules/scene-reveal.js | 36 | `sceneRevealActive` | `state.sceneRevealActive = false;` | cameraStore | port to store |
| js/modules/micro-demo-guards.ts | 16 | `currentView` | `state.currentView === 'galaxy' &&` | navStore | port to store |
| js/modules/micro-demo-guards.ts | 17 | `focusedNode` | `state.focusedNode === null &&` | focusStore | port to store |
| js/modules/micro-demo.ts | 85 | `selectedPoint` | `state.selectedPoint = null;` | focusStore | port to store |
| js/modules/micro-demo.ts | 96 | `focusTransitionMode` | `state.focusTransitionMode = 'idle';` | focusStore | port to store |
| js/modules/micro-demo.ts | 109 | `selectedPoint` | `state.selectedPoint = point;` | focusStore | port to store |
| js/modules/loading-ui.ts | 103 | `deferredHydrationStarted` | `state.deferredHydrationStarted = true;` | navStore | port to store |
| js/modules/map-flattening-layout.ts | 42 | `nodesAreSettling` | `state.nodesAreSettling = true;` | navStore | port to store |
| js/modules/semantic-guide.ts | 134 | `currentSemanticGuide` | `state.currentSemanticGuide = settings;` | searchStore | port to store |
| js/modules/semantic-guide.ts | 227 | `semanticGuideAbortController` | `state.semanticGuideAbortController = null;` | searchStore | port to store |
| js/modules/semantic-guide.ts | 231 | `semanticGuideAbortController` | `state.semanticGuideAbortController = controller;` | searchStore | port to store |
| js/modules/semantic-guide.ts | 270 | `semanticGuideAbortController` | `if (state.semanticGuideAbortController === controller) {` | searchStore | port to store |
| js/modules/semantic-guide.ts | 271 | `semanticGuideAbortController` | `state.semanticGuideAbortController = null;` | searchStore | port to store |
| js/modules/micro-demo-guards.js | 14 | `currentView` | `state.currentView === 'galaxy' &&` | navStore | port to store |
| js/modules/micro-demo-guards.js | 15 | `focusedNode` | `state.focusedNode === null &&` | focusStore | port to store |
| js/modules/map-state.js | 81 | `mapInitialized` | `if (state.mapInitialized && !state.map) state.mapInitialized = false;` | engine-only | keep in bridge |
| js/modules/map-state.js | 89 | `map` | `state.map = null;` | engine-only | keep in bridge |
| js/modules/map-state.js | 90 | `markersLayer` | `state.markersLayer = null;` | engine-only | keep in bridge |
| js/modules/map-state.js | 91 | `mapRouteLayer` | `state.mapRouteLayer = null;` | engine-only | keep in bridge |
| js/modules/map-state.js | 92 | `pointMarkers` | `state.pointMarkers = [];` | engine-only | keep in bridge |
| js/modules/map-state.js | 107 | `map` | `state.map = window.L.map(container, {` | engine-only | keep in bridge |
| js/modules/map-state.js | 122 | `markersLayer` | `state.markersLayer = window.L.layerGroup().addTo(state.map);` | engine-only | keep in bridge |
| js/modules/map-state.js | 123 | `mapRouteLayer` | `state.mapRouteLayer = window.L.layerGroup().addTo(state.map);` | engine-only | keep in bridge |
| js/modules/map-state.js | 124 | `pointMarkers` | `state.pointMarkers = [];` | engine-only | keep in bridge |
| js/modules/map-state.js | 150 | `focusedNode` | `state.focusedNode === index;` | focusStore | port to store |
| js/modules/map-state.js | 167 | `mapInitialized` | `state.mapInitialized = true;` | engine-only | keep in bridge |
| js/modules/map-state.js | 178 | `mapInitialized` | `state.mapInitialized = false;` | engine-only | keep in bridge |
| js/modules/map-state.js | 179 | `map` | `state.map = null;` | engine-only | keep in bridge |
| js/modules/map-state.js | 180 | `markersLayer` | `state.markersLayer = null;` | engine-only | keep in bridge |
| js/modules/map-state.js | 181 | `mapRouteLayer` | `state.mapRouteLayer = null;` | engine-only | keep in bridge |
| js/modules/map-state.js | 182 | `pointMarkers` | `state.pointMarkers = [];` | engine-only | keep in bridge |
| js/modules/map-state.js | 225 | `currentView` | `if (state.currentView === 'map' && !trailStateActive) {` | navStore | port to store |
| js/modules/map-state.js | 339 | `focusedNode` | `const isFocused = state.focusedNode === index;` | focusStore | port to store |
| js/modules/map-state.js | 409 | `currentView` | `if (state.currentView === 'map') {` | navStore | port to store |
| js/modules/map-state.js | 440 | `terrainHandoffState` | `state.terrainHandoffState = {` | cameraStore | port to store |
| js/modules/map-state.js | 459 | `terrainHandoffTimer` | `state.terrainHandoffTimer = null;` | cameraStore | port to store |
| js/modules/map-state.js | 463 | `terrainHandoffTimer` | `state.terrainHandoffTimer = window.setTimeout(() => {` | cameraStore | port to store |
| js/modules/micro-demo.js | 90 | `selectedPoint` | `state.selectedPoint = null;` | focusStore | port to store |
| js/modules/micro-demo.js | 99 | `focusCameraAssistActive` | `state.focusCameraAssistActive = false;` | focusStore | port to store |
| js/modules/micro-demo.js | 100 | `focusCameraOffset` | `state.focusCameraOffset = null;` | focusStore | port to store |
| js/modules/micro-demo.js | 101 | `focusTransitionMode` | `state.focusTransitionMode = 'idle';` | focusStore | port to store |
| js/modules/micro-demo.js | 114 | `selectedPoint` | `state.selectedPoint = point;` | focusStore | port to store |
| js/modules/map-flattening-layout.js | 38 | `nodesAreSettling` | `state.nodesAreSettling = true;` | navStore | port to store |
| js/modules/loading-ui.js | 96 | `deferredHydrationStarted` | `state.deferredHydrationStarted = true;` | navStore | port to store |
| js/modules/mycelium-engine.js | 369 | `myceliumDirty` | `state.myceliumDirty = false;` | engine-only | keep in bridge |
| js/modules/semantic-guide.js | 130 | `currentSemanticGuide` | `state.currentSemanticGuide = settings;` | searchStore | port to store |
| js/modules/semantic-guide.js | 131 | `summaryCardTypeToken` | `state.summaryCardTypeToken = (state.summaryCardTypeToken \|\| 0) + 1;` | searchStore | port to store |
| js/modules/semantic-guide.js | 144 | `summaryCardTypeToken` | `state.summaryCardTypeToken = (state.summaryCardTypeToken \|\| 0) + 1;` | searchStore | port to store |
| js/modules/semantic-guide.js | 224 | `semanticGuideAbortController` | `state.semanticGuideAbortController = null;` | searchStore | port to store |
| js/modules/semantic-guide.js | 226 | `semanticGuideRequestSequence` | `const requestId = (state.semanticGuideRequestSequence = (state.semanticGuideRequ` | searchStore | port to store |
| js/modules/semantic-guide.js | 228 | `semanticGuideAbortController` | `state.semanticGuideAbortController = controller;` | searchStore | port to store |
| js/modules/semantic-guide.js | 267 | `semanticGuideAbortController` | `if (state.semanticGuideAbortController === controller) {` | searchStore | port to store |
| js/modules/semantic-guide.js | 268 | `semanticGuideAbortController` | `state.semanticGuideAbortController = null;` | searchStore | port to store |
| js/modules/search-state.js | 57 | `semanticTrailCue` | `state.semanticTrailCue = nextFocusing ? 'focusing' : nextSearching ? 'searching'` | searchStore | port to store |
| js/modules/search-state.js | 140 | `searchFocusTransitionToken` | `state.searchFocusTransitionToken = (state.searchFocusTransitionToken \|\| 0) + 1` | searchStore | port to store |
| js/modules/search-state.js | 145 | `searchAbortController` | `state.searchAbortController = null;` | searchStore | port to store |
| js/modules/search-state.js | 178 | `currentSearchSummary` | `state.currentSearchSummary = null;` | searchStore | port to store |
| js/modules/search-state.js | 179 | `searchAnchorIndex` | `state.searchAnchorIndex = null;` | searchStore | port to store |
| js/modules/search-state.js | 180 | `searchPreviewIndex` | `state.searchPreviewIndex = null;` | searchStore | port to store |
| js/modules/search-state.js | 192 | `searchRequestSequence` | `const requestId = (state.searchRequestSequence = (state.searchRequestSequence \|` | searchStore | port to store |
| js/modules/search-state.js | 194 | `searchAbortController` | `state.searchAbortController = controller;` | searchStore | port to store |
| js/modules/search-state.js | 221 | `searchAbortController` | `state.searchAbortController = null;` | searchStore | port to store |
| js/modules/search-state.js | 246 | `currentSearchSummary` | `state.currentSearchSummary = {` | searchStore | port to store |
| js/modules/search-state.js | 319 | `searchFocusTransitionToken` | `const token = (state.searchFocusTransitionToken = (state.searchFocusTransitionTo` | searchStore | port to store |
| js/modules/search-state.js | 361 | `currentSearchSummary` | `state.currentSearchSummary = priorSummary;` | searchStore | port to store |
| js/modules/search-state.js | 363 | `currentSearchSummary` | `state.currentSearchSummary = null;` | searchStore | port to store |
| js/modules/search-state.js | 376 | `selectedPoint` | `state.selectedPoint = null;` | focusStore | port to store |
| js/modules/navigation-state.ts | 136 | `activeStoryPrompt` | `state.activeStoryPrompt = null;` | filterStore | port to store |
| js/modules/mycelium-engine.ts | 390 | `myceliumDirty` | `state.myceliumDirty = false;` | engine-only | keep in bridge |
| js/modules/navigation-state.js | 194 | `activeStoryPrompt` | `state.activeStoryPrompt = null;` | filterStore | port to store |
| js/modules/lifecycle.ts | 192 | `myceliumMode` | `state.myceliumMode = mode;` | navStore | port to store |
| js/modules/lifecycle.ts | 223 | `trailDepth` | `state.trailDepth = nextDepth;` | navStore | port to store |
| js/modules/lifecycle.ts | 254 | `semanticDiveMode` | `state.semanticDiveMode = nextActive;` | navStore | port to store |
| js/modules/lifecycle.ts | 290 | `semanticDiveMode` | `state.semanticDiveMode = false;` | navStore | port to store |
| js/modules/lifecycle.ts | 291 | `trailDepth` | `state.trailDepth = 0;` | navStore | port to store |
| js/modules/lifecycle.ts | 295 | `searchGlowActive` | `state.searchGlowActive = false;` | searchStore | port to store |
| js/modules/lifecycle.ts | 296 | `myceliumMode` | `state.myceliumMode = 'default';` | navStore | port to store |
| js/modules/lifecycle.ts | 305 | `currentSearchSummary` | `state.currentSearchSummary = null;` | searchStore | port to store |
| js/modules/lifecycle.ts | 309 | `currentSearchSummary` | `state.currentSearchSummary = preservedSearchSummary;` | searchStore | port to store |
| js/modules/lifecycle.ts | 327 | `currentSearchSummary` | `state.currentSearchSummary = null;` | searchStore | port to store |
| js/modules/lifecycle.ts | 328 | `currentEmptyQuery` | `state.currentEmptyQuery = null;` | searchStore | port to store |
| js/modules/lifecycle.ts | 329 | `searchAnchorIndex` | `state.searchAnchorIndex = null;` | searchStore | port to store |
| js/modules/lifecycle.ts | 330 | `searchPreviewIndex` | `state.searchPreviewIndex = null;` | searchStore | port to store |
| js/modules/lifecycle.ts | 331 | `searchGlowActive` | `state.searchGlowActive = false;` | searchStore | port to store |
| js/modules/lifecycle.ts | 378 | `currentEmptyQuery` | `state.currentEmptyQuery = query;` | searchStore | port to store |
| js/modules/lifecycle.ts | 379 | `currentSearchSummary` | `state.currentSearchSummary = null;` | searchStore | port to store |
| js/modules/lifecycle.ts | 402 | `currentSearchSummary` | `state.currentSearchSummary = summary;` | searchStore | port to store |
| js/modules/lifecycle.ts | 403 | `currentEmptyQuery` | `state.currentEmptyQuery = null;` | searchStore | port to store |
| js/modules/lifecycle.ts | 404 | `searchGlowActive` | `state.searchGlowActive = true;` | searchStore | port to store |
| js/modules/lifecycle.ts | 406 | `searchGlowIndices` | `state.searchGlowIndices = new Set(summary.resultIndices);` | searchStore | port to store |
| js/modules/lifecycle.ts | 421 | `currentSearchSummary` | `state.currentSearchSummary = null;` | searchStore | port to store |
| js/modules/lifecycle.ts | 422 | `searchGlowActive` | `state.searchGlowActive = false;` | searchStore | port to store |
| js/modules/lifecycle.ts | 505 | `selectedPoint` | `state.selectedPoint = point;` | focusStore | port to store |
| js/modules/search-results-ui.ts | 223 | `currentSearchSummary` | `state.currentSearchSummary = null;` | searchStore | port to store |
| js/modules/search-mapper.js | 145 | `semanticResultContextByLeadId` | `if (!state.semanticResultContextByLeadId) state.semanticResultContextByLeadId = ` | searchStore | port to store |
| js/modules/semantic-guide-ui.js | 30 | `lastRenderedTypeToken` | `state.lastRenderedTypeToken = guideState.typeToken;` | searchStore | port to store |
| js/modules/search-mapper.ts | 200 | `semanticResultContextByLeadId` | `if (!state.semanticResultContextByLeadId) state.semanticResultContextByLeadId = ` | searchStore | port to store |
| js/modules/search-trail-cue-renderer.js | 51 | `searchTrailCueLastRenderedAt` | `state.searchTrailCueLastRenderedAt = performance.now();` | searchStore | port to store |
| js/modules/bindings\mode-bindings.ts | 19 | `focusedNode` | `if (button.dataset.story === 'trail' && state.focusedNode === null) {` | focusStore | port to store |
| js/modules/bindings\mode-bindings.ts | 27 | `focusedNode` | `if (mode === 'trail' && state.focusedNode === null) {` | focusStore | port to store |
| js/modules/search-results-ui.js | 155 | `currentSearchSummary` | `state.currentSearchSummary = null` | searchStore | port to store |
| js/modules/search-results-ui.js | 237 | `searchGlowActive` | `state.searchGlowActive = true;` | searchStore | port to store |
| js/modules/search-results-ui.js | 238 | `searchGlowIndices` | `state.searchGlowIndices = new Set(Array.isArray(resultIndices) ? resultIndices :` | searchStore | port to store |
| js/modules/search-results-ui.js | 239 | `searchGlowTopIndex` | `state.searchGlowTopIndex = Number.isFinite(anchorIndex) ? anchorIndex : state.se` | searchStore | port to store |
| js/modules/search-results-ui.js | 252 | `mobileRouteFieldPeekToken` | `state.mobileRouteFieldPeekToken = (state.mobileRouteFieldPeekToken \|\| 0) + 1;` | searchStore | port to store |
| js/modules/search-results-ui.js | 258 | `mobileRouteFieldPeekTimer` | `state.mobileRouteFieldPeekTimer = null;` | searchStore | port to store |
| js/modules/search-results-ui.js | 269 | `searchPreviewHoverTimer` | `state.searchPreviewHoverTimer = null;` | searchStore | port to store |
| js/modules/search-results-ui.js | 323 | `searchGlowActive` | `state.searchGlowActive = false;` | searchStore | port to store |
| js/modules/lifecycle.js | 191 | `myceliumMode` | `state.myceliumMode = mode;` | navStore | port to store |
| js/modules/lifecycle.js | 222 | `trailDepth` | `state.trailDepth = nextDepth;` | navStore | port to store |
| js/modules/lifecycle.js | 255 | `semanticDiveMode` | `state.semanticDiveMode = nextActive;` | navStore | port to store |
| js/modules/lifecycle.js | 297 | `semanticDiveMode` | `state.semanticDiveMode = false;` | navStore | port to store |
| js/modules/lifecycle.js | 298 | `trailDepth` | `state.trailDepth = 0;` | navStore | port to store |
| js/modules/lifecycle.js | 302 | `searchGlowActive` | `state.searchGlowActive = false;` | searchStore | port to store |
| js/modules/lifecycle.js | 303 | `myceliumMode` | `state.myceliumMode = 'default';` | navStore | port to store |
| js/modules/lifecycle.js | 312 | `currentSearchSummary` | `state.currentSearchSummary = null;` | searchStore | port to store |
| js/modules/lifecycle.js | 316 | `currentSearchSummary` | `state.currentSearchSummary = preservedSearchSummary;` | searchStore | port to store |
| js/modules/lifecycle.js | 335 | `currentSearchSummary` | `state.currentSearchSummary = null;` | searchStore | port to store |
| js/modules/lifecycle.js | 336 | `currentEmptyQuery` | `state.currentEmptyQuery = null;` | searchStore | port to store |
| js/modules/lifecycle.js | 337 | `searchAnchorIndex` | `state.searchAnchorIndex = null;` | searchStore | port to store |
| js/modules/lifecycle.js | 338 | `searchPreviewIndex` | `state.searchPreviewIndex = null;` | searchStore | port to store |
| js/modules/lifecycle.js | 339 | `searchGlowActive` | `state.searchGlowActive = false;` | searchStore | port to store |
| js/modules/lifecycle.js | 388 | `currentEmptyQuery` | `state.currentEmptyQuery = query;` | searchStore | port to store |
| js/modules/lifecycle.js | 389 | `currentSearchSummary` | `state.currentSearchSummary = null;` | searchStore | port to store |
| js/modules/lifecycle.js | 412 | `currentSearchSummary` | `state.currentSearchSummary = summary;` | searchStore | port to store |
| js/modules/lifecycle.js | 413 | `currentEmptyQuery` | `state.currentEmptyQuery = null;` | searchStore | port to store |
| js/modules/lifecycle.js | 414 | `searchGlowActive` | `state.searchGlowActive = true;` | searchStore | port to store |
| js/modules/lifecycle.js | 416 | `searchGlowIndices` | `state.searchGlowIndices = new Set(summary.resultIndices);` | searchStore | port to store |
| js/modules/lifecycle.js | 431 | `currentSearchSummary` | `state.currentSearchSummary = null;` | searchStore | port to store |
| js/modules/lifecycle.js | 432 | `searchGlowActive` | `state.searchGlowActive = false;` | searchStore | port to store |
| js/modules/lifecycle.js | 440 | `bloomIndices` | `state.bloomIndices = new Set(` | searchStore | port to store |
| js/modules/lifecycle.js | 450 | `bridgeIndices` | `state.bridgeIndices = new Set(` | searchStore | port to store |
| js/modules/lifecycle.js | 519 | `selectedPoint` | `state.selectedPoint = point;` | focusStore | port to store |
| js/modules/search-result-renderer.js | 174 | `compactSearchRevealToken` | `state.compactSearchRevealToken = (state.compactSearchRevealToken \|\| 0) + 1;` | searchStore | port to store |
| js/modules/search-result-renderer.js | 177 | `compactSearchRevealTimers` | `state.compactSearchRevealTimers = [];` | searchStore | port to store |
| js/modules/search-result-renderer.js | 195 | `compactSearchRevealTimers` | `if (!state.compactSearchRevealTimers) state.compactSearchRevealTimers = [];` | searchStore | port to store |
| js/modules/state-mutators.js | 11 | `currentView` | `state.currentView = view;` | navStore | port to store |
| js/modules/state-mutators.js | 23 | `semanticLaneState` | `state.semanticLaneState = newState;` | cameraStore | port to store |
| js/modules/state-mutators.js | 29 | `loadingPhaseKey` | `state.loadingPhaseKey = key;` | navStore | port to store |
| js/modules/state-mutators.js | 35 | `semanticThreadsStatus` | `state.semanticThreadsStatus = status;` | engine-only | keep in bridge |
| js/modules/search-trail-cue-renderer.ts | 60 | `searchTrailCueLastRenderedAt` | `state.searchTrailCueLastRenderedAt = performance.now();` | searchStore | port to store |
| js/modules/bindings\mode-bindings.js | 10 | `focusedNode` | `if (button.dataset.story === 'trail' && state.focusedNode === null) {` | focusStore | port to store |
| js/modules/bindings\mode-bindings.js | 18 | `focusedNode` | `if (mode === 'trail' && state.focusedNode === null) {` | focusStore | port to store |
| js/modules/semantic-search-cache.ts | 37 | `semanticSearchResultCache` | `if (!state.semanticSearchResultCache) state.semanticSearchResultCache = new Map<` | engine-only | keep in bridge |
| js/modules/semantic-search-cache.ts | 39 | `semanticSearchCacheDiagnostics` | `state.semanticSearchCacheDiagnostics = {` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 146 | `scene` | `state.scene = null;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 147 | `camera` | `state.camera = null;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 148 | `renderer` | `state.renderer = null;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 149 | `controls` | `state.controls = null;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 215 | `currentView` | `diagnostics.active = !!(state.renderer && state.scene && state.camera && state.c` | navStore | port to store |
| js/modules/three-engine.ts | 296 | `scene` | `state.scene = scene;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 302 | `camera` | `state.camera = camera;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 332 | `renderer` | `state.renderer = renderer;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 362 | `controls` | `state.controls = controls;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 365 | `autoRotate` | `state.autoRotate = false;` | navStore | port to store |
| js/modules/three-engine.ts | 384 | `hemiLight` | `state.hemiLight = hemiLight;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 390 | `dirLight` | `state.dirLight = dirLight;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 423 | `pointsMesh` | `state.pointsMesh = webglContext.pointsMesh;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 424 | `pointsMaterial` | `state.pointsMaterial = webglContext.pointsMaterial;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 425 | `nodeSporeMesh` | `state.nodeSporeMesh = webglContext.nodeSporeMesh;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 426 | `nodeSporeHitMesh` | `state.nodeSporeHitMesh = webglContext.nodeSporeHitMesh;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 427 | `nodeSporeMaterial` | `state.nodeSporeMaterial = webglContext.nodeSporeMaterial;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 429 | `myceliumGroup` | `state.myceliumGroup = webglContext.myceliumGroup;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 430 | `myceliumCoreLines` | `state.myceliumCoreLines = webglContext.myceliumCoreLines;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 431 | `myceliumWispyLines` | `state.myceliumWispyLines = webglContext.myceliumWispyLines;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 432 | `myceliumBridgeLines` | `state.myceliumBridgeLines = webglContext.myceliumBridgeLines;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 433 | `myceliumConnectionPairs` | `state.myceliumConnectionPairs = webglContext.myceliumConnectionPairs;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 437 | `semanticLensGroup` | `state.semanticLensGroup = webglContext.semanticLensGroup;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 438 | `semanticLensGlow` | `state.semanticLensGlow = webglContext.semanticLensGlow;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 439 | `semanticLensSpokes` | `state.semanticLensSpokes = webglContext.semanticLensSpokes;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 440 | `semanticManifold` | `state.semanticManifold = webglContext.semanticManifold;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 480 | `scene` | `state.scene = null;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 481 | `camera` | `state.camera = null;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 482 | `controls` | `state.controls = null;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 490 | `renderer` | `state.renderer = null;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 491 | `pointsMesh` | `state.pointsMesh = null;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 492 | `pointsMaterial` | `state.pointsMaterial = null;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 493 | `nodeSporeMesh` | `state.nodeSporeMesh = null;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 494 | `nodeSporeHitMesh` | `state.nodeSporeHitMesh = null;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 495 | `nodeSporeMaterial` | `state.nodeSporeMaterial = null;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 510 | `sceneRevealActive` | `state.sceneRevealActive = false;` | cameraStore | port to store |
| js/modules/three-engine.ts | 511 | `sceneRevealCameraStart` | `state.sceneRevealCameraStart = null;` | cameraStore | port to store |
| js/modules/three-engine.ts | 512 | `sceneRevealCameraEnd` | `state.sceneRevealCameraEnd = null;` | cameraStore | port to store |
| js/modules/three-engine.ts | 580 | `myceliumDirty` | `state.myceliumDirty = true;` | engine-only | keep in bridge |
| js/modules/three-engine.ts | 584 | `focusedNode` | `if (state.sceneRevealActive && state.sceneRevealCameraStart && state.sceneReveal` | focusStore | port to store |
| js/modules/three-engine.ts | 590 | `sceneRevealActive` | `state.sceneRevealActive = false;` | cameraStore | port to store |
| js/modules/three-engine.ts | 592 | `sceneRevealCameraStart` | `state.sceneRevealCameraStart = null;` | cameraStore | port to store |
| js/modules/three-engine.ts | 593 | `sceneRevealCameraEnd` | `state.sceneRevealCameraEnd = null;` | cameraStore | port to store |
| js/modules/three-engine.ts | 630 | `pulsePhase` | `state.pulsePhase = (state.pulsePhase + pulseIncrement) % (Math.PI * 2);` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 104 | `semanticSpaceLayoutManifest` | `state.semanticSpaceLayoutManifest = manifest;` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 105 | `semanticSpaceLayoutStatus` | `state.semanticSpaceLayoutStatus = 'ready';` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 106 | `semanticSpaceLayoutError` | `state.semanticSpaceLayoutError = null;` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 157 | `semanticNeighborMapByLeadId` | `state.semanticNeighborMapByLeadId = new Map();` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 222 | `semanticThreadsRetryTimer` | `state.semanticThreadsRetryTimer = null;` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 227 | `semanticThreadsStatus` | `if (state.semanticThreadsStatus === 'ready' \|\| state.semanticThreadsLoadPromis` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 244 | `semanticThreadsRetryTimer` | `state.semanticThreadsRetryTimer = window.setTimeout(() => {` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 245 | `semanticThreadsRetryTimer` | `state.semanticThreadsRetryTimer = null;` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 271 | `semanticThreadsLoadPromise` | `state.semanticThreadsLoadPromise = (async () => {` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 282 | `semanticThreadArtifactName` | `state.semanticThreadArtifactName = artifactName;` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 283 | `semanticNeighborMapByLeadId` | `state.semanticNeighborMapByLeadId = new Map(_normalizeSemanticNeighborEntries(ne` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 318 | `semanticThreadBundle` | `state.semanticThreadBundle = bundle;` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 319 | `semanticThreadArtifactName` | `state.semanticThreadArtifactName = loadedArtifactName;` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 329 | `semanticSpaceLayoutStatus` | `state.semanticSpaceLayoutStatus = 'failed';` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 331 | `semanticNeighborMapByLeadId` | `state.semanticNeighborMapByLeadId = new Map();` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 333 | `semanticThreadsLoadPromise` | `state.semanticThreadsLoadPromise = null;` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 359 | `semanticThreadsRetryAttempt` | `state.semanticThreadsRetryAttempt = state.semanticThreadsStatus === 'ready' ? 0 ` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 365 | `semanticThreadsStatus` | `thread_retry_count: state.semanticThreadsStatus === 'ready' ? 0 : state.semantic` | engine-only | keep in bridge |
| js/modules/semantic-threads.js | 369 | `semanticThreadsLoadPromise` | `state.semanticThreadsLoadPromise = null;` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 109 | `semanticSpaceLayoutManifest` | `state.semanticSpaceLayoutManifest = manifest;` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 110 | `semanticSpaceLayoutStatus` | `state.semanticSpaceLayoutStatus = 'ready';` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 111 | `semanticSpaceLayoutError` | `state.semanticSpaceLayoutError = null;` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 159 | `semanticNeighborMapByLeadId` | `state.semanticNeighborMapByLeadId = new Map();` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 224 | `semanticThreadsRetryTimer` | `state.semanticThreadsRetryTimer = null;` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 229 | `semanticThreadsStatus` | `if (state.semanticThreadsStatus === 'ready' \|\| state.semanticThreadsLoadPromis` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 246 | `semanticThreadsRetryTimer` | `state.semanticThreadsRetryTimer = window.setTimeout(() => {` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 247 | `semanticThreadsRetryTimer` | `state.semanticThreadsRetryTimer = null;` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 270 | `semanticThreadsLoadPromise` | `state.semanticThreadsLoadPromise = (async () => {` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 280 | `semanticThreadArtifactName` | `state.semanticThreadArtifactName = artifactName;` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 281 | `semanticNeighborMapByLeadId` | `state.semanticNeighborMapByLeadId = new Map(_normalizeSemanticNeighborEntries(ne` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 316 | `semanticThreadArtifactName` | `state.semanticThreadArtifactName = loadedArtifactName;` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 324 | `semanticThreadArtifactName` | `state.semanticThreadArtifactName = null;` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 325 | `semanticSpaceLayoutManifest` | `state.semanticSpaceLayoutManifest = null;` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 326 | `semanticSpaceLayoutStatus` | `state.semanticSpaceLayoutStatus = 'failed';` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 327 | `semanticSpaceLayoutError` | `state.semanticSpaceLayoutError = error?.message \|\| String(error);` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 328 | `semanticNeighborMapByLeadId` | `state.semanticNeighborMapByLeadId = new Map();` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 330 | `semanticThreadsLoadPromise` | `state.semanticThreadsLoadPromise = null;` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 356 | `semanticThreadsStatus` | `(state as any).semanticThreadsRetryAttempt = state.semanticThreadsStatus === 're` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 362 | `semanticThreadsStatus` | `thread_retry_count: state.semanticThreadsStatus === 'ready' ? 0 : (state as any)` | engine-only | keep in bridge |
| js/modules/semantic-threads.ts | 366 | `semanticThreadsLoadPromise` | `state.semanticThreadsLoadPromise = null;` | engine-only | keep in bridge |
| js/modules/strand-continuity.ts | 24 | `strandContinuityState` | `state.strandContinuityState = {` | focusStore | port to store |
| js/modules/state-mutators.ts | 14 | `currentView` | `state.currentView = view as ViewName;` | navStore | port to store |
| js/modules/state-mutators.ts | 26 | `semanticLaneState` | `state.semanticLaneState = newState;` | cameraStore | port to store |
| js/modules/state-mutators.ts | 32 | `loadingPhaseKey` | `state.loadingPhaseKey = key as 'records' \| 'scene' \| 'restore' \| 'launch';` | navStore | port to store |
| js/modules/state-mutators.ts | 38 | `semanticThreadsStatus` | `state.semanticThreadsStatus = status;` | engine-only | keep in bridge |
| js/modules/semantic-search-cache.js | 8 | `semanticSearchResultCache` | `if (!state.semanticSearchResultCache) state.semanticSearchResultCache = new Map(` | engine-only | keep in bridge |
| js/modules/semantic-search-cache.js | 10 | `semanticSearchCacheDiagnostics` | `state.semanticSearchCacheDiagnostics = {` | engine-only | keep in bridge |
| js/modules/strand-continuity.js | 10 | `strandContinuityState` | `state.strandContinuityState = {` | focusStore | port to store |
| js/modules/thread-inspector-webgl.ts | 199 | `inspectedStrandGroup` | `state.inspectedStrandGroup = new THREE.Group();` | focusStore | port to store |
| js/modules/thread-inspector-webgl.ts | 239 | `inspectedStrandDiagnostics` | `state.inspectedStrandDiagnostics = {` | focusStore | port to store |
| js/modules/thread-inspector-webgl.ts | 282 | `inspectedStrandDiagnostics` | `state.inspectedStrandDiagnostics = {` | focusStore | port to store |
| js/modules/thread-inspector-webgl.ts | 299 | `inspectedStrandGroup` | `state.inspectedStrandGroup = null;` | focusStore | port to store |
| js/modules/thread-inspector-webgl.ts | 300 | `inspectedStrandDiagnostics` | `state.inspectedStrandDiagnostics = {` | focusStore | port to store |
| js/modules/three-engine.js | 135 | `scene` | `state.scene = null;` | engine-only | keep in bridge |
| js/modules/three-engine.js | 136 | `camera` | `state.camera = null;` | engine-only | keep in bridge |
| js/modules/three-engine.js | 137 | `renderer` | `state.renderer = null;` | engine-only | keep in bridge |
| js/modules/three-engine.js | 138 | `controls` | `state.controls = null;` | engine-only | keep in bridge |
| js/modules/three-engine.js | 192 | `currentView` | `diagnostics.active = !!(state.renderer && state.scene && state.camera && state.c` | navStore | port to store |
| js/modules/three-engine.js | 279 | `scene` | `state.scene = scene;` | engine-only | keep in bridge |
| js/modules/three-engine.js | 285 | `camera` | `state.camera = camera;` | engine-only | keep in bridge |
| js/modules/three-engine.js | 291 | `hemiLight` | `state.hemiLight = hemiLight;` | engine-only | keep in bridge |
| js/modules/three-engine.js | 297 | `dirLight` | `state.dirLight = dirLight;` | engine-only | keep in bridge |
| js/modules/three-engine.js | 300 | `renderer` | `state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserv` | engine-only | keep in bridge |
| js/modules/three-engine.js | 322 | `controls` | `state.controls = new OrbitControls(state.camera, state.renderer.domElement);` | engine-only | keep in bridge |
| js/modules/three-engine.js | 335 | `autoRotate` | `state.autoRotate = false;` | navStore | port to store |
| js/modules/three-engine.js | 415 | `scene` | `state.scene = null;` | engine-only | keep in bridge |
| js/modules/three-engine.js | 416 | `camera` | `state.camera = null;` | engine-only | keep in bridge |
| js/modules/three-engine.js | 417 | `controls` | `state.controls = null;` | engine-only | keep in bridge |
| js/modules/three-engine.js | 428 | `nodeSporeMesh` | `state.nodeSporeMesh = null;` | engine-only | keep in bridge |
| js/modules/three-engine.js | 442 | `sceneRevealActive` | `state.sceneRevealActive = false;` | cameraStore | port to store |
| js/modules/three-engine.js | 443 | `sceneRevealCameraStart` | `state.sceneRevealCameraStart = null;` | cameraStore | port to store |
| js/modules/three-engine.js | 444 | `sceneRevealCameraEnd` | `state.sceneRevealCameraEnd = null;` | cameraStore | port to store |
| js/modules/three-engine.js | 514 | `myceliumDirty` | `state.myceliumDirty = true;` | engine-only | keep in bridge |
| js/modules/three-engine.js | 518 | `focusedNode` | `if (state.sceneRevealActive && state.sceneRevealCameraStart && state.sceneReveal` | focusStore | port to store |
| js/modules/three-engine.js | 524 | `sceneRevealActive` | `state.sceneRevealActive = false;` | cameraStore | port to store |
| js/modules/three-engine.js | 526 | `sceneRevealCameraStart` | `state.sceneRevealCameraStart = null;` | cameraStore | port to store |
| js/modules/three-engine.js | 527 | `sceneRevealCameraEnd` | `state.sceneRevealCameraEnd = null;` | cameraStore | port to store |
| js/modules/three-engine.js | 564 | `pulsePhase` | `state.pulsePhase = (state.pulsePhase + pulseIncrement) % (Math.PI * 2);` | engine-only | keep in bridge |
| js/modules/bindings\journey-bindings.ts | 80 | `pinnedThreadIndex` | `if (state.pinnedThreadIndex === index) {` | focusStore | port to store |
| js/modules/thread-inspector-webgl.js | 186 | `inspectedStrandGroup` | `state.inspectedStrandGroup = new THREE.Group();` | focusStore | port to store |
| js/modules/thread-inspector-webgl.js | 226 | `inspectedStrandDiagnostics` | `state.inspectedStrandDiagnostics = {` | focusStore | port to store |
| js/modules/thread-inspector-webgl.js | 269 | `inspectedStrandDiagnostics` | `state.inspectedStrandDiagnostics = {` | focusStore | port to store |
| js/modules/thread-inspector-webgl.js | 286 | `inspectedStrandGroup` | `state.inspectedStrandGroup = null;` | focusStore | port to store |
| js/modules/thread-inspector-webgl.js | 287 | `inspectedStrandDiagnostics` | `state.inspectedStrandDiagnostics = {` | focusStore | port to store |
| js/modules/thread-inspector.js | 178 | `threadInspectorPointerInside` | `state.threadInspectorPointerInside = true;` | focusStore | port to store |
| js/modules/thread-inspector.js | 181 | `canvasThreadInspectionClearTimer` | `state.canvasThreadInspectionClearTimer = null;` | focusStore | port to store |
| js/modules/thread-inspector.js | 185 | `threadInspectorPointerInside` | `state.threadInspectorPointerInside = false;` | focusStore | port to store |
| js/modules/thread-inspector.js | 195 | `canvasThreadInspectionClearTimer` | `state.canvasThreadInspectionClearTimer = null;` | focusStore | port to store |
| js/modules/thread-inspector.js | 275 | `inspectedThreadIndex` | `state.inspectedThreadIndex = Number.isFinite(index) ? index : null;` | focusStore | port to store |
| js/modules/thread-inspector.js | 290 | `canvasThreadInspectionClearTimer` | `state.canvasThreadInspectionClearTimer = null;` | focusStore | port to store |
| js/modules/thread-inspector.js | 292 | `pinnedThreadIndex` | `state.pinnedThreadIndex = index;` | focusStore | port to store |
| js/modules/thread-inspector.js | 293 | `inspectedThreadIndex` | `state.inspectedThreadIndex = index;` | focusStore | port to store |
| js/modules/thread-inspector.js | 307 | `canvasThreadInspectionClearTimer` | `state.canvasThreadInspectionClearTimer = null;` | focusStore | port to store |
| js/modules/thread-inspector.js | 309 | `pinnedThreadIndex` | `state.pinnedThreadIndex = null;` | focusStore | port to store |
| js/modules/thread-inspector.js | 310 | `inspectedThreadIndex` | `state.inspectedThreadIndex = null;` | focusStore | port to store |
| js/modules/thread-inspector.js | 319 | `canvasThreadInspectionClearTimer` | `state.canvasThreadInspectionClearTimer = window.setTimeout(() => {` | focusStore | port to store |
| js/modules/thread-inspector.js | 320 | `canvasThreadInspectionClearTimer` | `state.canvasThreadInspectionClearTimer = null;` | focusStore | port to store |
| js/modules/thread-inspector.js | 330 | `pinnedThreadIndex` | `state.pinnedThreadIndex = null;` | focusStore | port to store |
| js/modules/thread-inspector.js | 331 | `inspectedThreadIndex` | `state.inspectedThreadIndex = null;` | focusStore | port to store |
| js/modules/thread-inspector.js | 332 | `threadInspectorPointerInside` | `state.threadInspectorPointerInside = false;` | focusStore | port to store |
| js/modules/thread-inspector.js | 339 | `canvasThreadInspectionClearTimer` | `state.canvasThreadInspectionClearTimer = null;` | focusStore | port to store |
| js/modules/thread-inspector.js | 344 | `threadInspectorPointerInside` | `state.threadInspectorPointerInside = false;` | focusStore | port to store |
| js/modules/thread-inspector.js | 355 | `inspectedThreadIndex` | `state.inspectedThreadIndex = null;` | focusStore | port to store |
| js/modules/thread-inspector.js | 356 | `threadInspectorPointerInside` | `state.threadInspectorPointerInside = false;` | focusStore | port to store |
| js/modules/thread-inspector.js | 393 | `pinnedThreadIndex` | `state.pinnedThreadIndex = null;` | focusStore | port to store |
| js/modules/thread-inspector.js | 394 | `inspectedThreadIndex` | `state.inspectedThreadIndex = index;` | focusStore | port to store |
| js/modules/ui-feedback.ts | 32 | `experienceResetToastTimer` | `state.experienceResetToastTimer = window.setTimeout(() => {` | navStore | port to store |
| js/modules/ui-feedback.ts | 38 | `experienceResetToastTimer` | `state.experienceResetToastTimer = null;` | navStore | port to store |
| js/modules/semantic-lane.ts | 178 | `semanticLaneWarmingCounter` | `state.semanticLaneWarmingCounter = (state.semanticLaneWarmingCounter \|\| 0) + 1` | cameraStore | port to store |
| js/modules/semantic-lane.ts | 180 | `semanticLaneWarmingCounter` | `state.semanticLaneWarmingCounter = 0;` | cameraStore | port to store |
| js/modules/semantic-lane.ts | 244 | `semanticLanePendingWarm` | `state.semanticLanePendingWarm = state.semanticLanePendingWarm \|\| warm;` | cameraStore | port to store |
| js/modules/semantic-lane.ts | 250 | `semanticLanePendingWarm` | `state.semanticLanePendingWarm = false;` | cameraStore | port to store |
| js/modules/semantic-lane.ts | 275 | `semanticLaneProbePromise` | `state.semanticLaneProbePromise = (async () => {` | cameraStore | port to store |
| js/modules/semantic-lane.ts | 286 | `semanticLaneState` | `if (reason === 'focus' \|\| reason === 'visibility' \|\| effectiveWarm \|\| isTi` | cameraStore | port to store |
| js/modules/semantic-lane.ts | 303 | `semanticLaneProbePromise` | `state.semanticLaneProbePromise = null;` | cameraStore | port to store |
| js/modules/semantic-lane.ts | 307 | `semanticLanePendingWarm` | `state.semanticLanePendingWarm = false;` | cameraStore | port to store |
| js/modules/semantic-lane.ts | 326 | `semanticLaneMonitorTimer` | `state.semanticLaneMonitorTimer = typeof win?.setInterval === 'function' ? win.se` | cameraStore | port to store |
| js/modules/semantic-lane.ts | 429 | `semanticLaneSnapshot` | `state.semanticLaneSnapshot = {` | cameraStore | port to store |
| js/modules/semantic-lane.ts | 442 | `semanticLaneOpsMode` | `state.semanticLaneOpsMode = !!enabled;` | cameraStore | port to store |
| js/modules/semantic-lane.ts | 450 | `semanticLaneOpsRefreshTimer` | `state.semanticLaneOpsRefreshTimer = null;` | cameraStore | port to store |
| js/modules/semantic-lane.ts | 455 | `semanticLaneOpsRefreshTimer` | `state.semanticLaneOpsRefreshTimer = win.setInterval(() => {` | cameraStore | port to store |
| js/modules/semantic-lane.ts | 469 | `semanticLaneOpsFetchPromise` | `state.semanticLaneOpsFetchPromise = (async () => {` | cameraStore | port to store |
| js/modules/semantic-lane.ts | 481 | `semanticLaneOpsFetchPromise` | `state.semanticLaneOpsFetchPromise = null;` | cameraStore | port to store |
| js/modules/thread-inspector.ts | 214 | `threadInspectorPointerInside` | `state.threadInspectorPointerInside = true;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 217 | `canvasThreadInspectionClearTimer` | `state.canvasThreadInspectionClearTimer = null;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 221 | `threadInspectorPointerInside` | `state.threadInspectorPointerInside = false;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 231 | `canvasThreadInspectionClearTimer` | `state.canvasThreadInspectionClearTimer = null;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 308 | `inspectedThreadIndex` | `state.inspectedThreadIndex = Number.isFinite(index) ? index : null;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 323 | `canvasThreadInspectionClearTimer` | `state.canvasThreadInspectionClearTimer = null;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 325 | `pinnedThreadIndex` | `state.pinnedThreadIndex = index;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 326 | `inspectedThreadIndex` | `state.inspectedThreadIndex = index;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 340 | `canvasThreadInspectionClearTimer` | `state.canvasThreadInspectionClearTimer = null;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 342 | `pinnedThreadIndex` | `state.pinnedThreadIndex = null;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 343 | `inspectedThreadIndex` | `state.inspectedThreadIndex = null;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 352 | `canvasThreadInspectionClearTimer` | `state.canvasThreadInspectionClearTimer = window.setTimeout(() => {` | focusStore | port to store |
| js/modules/thread-inspector.ts | 353 | `canvasThreadInspectionClearTimer` | `state.canvasThreadInspectionClearTimer = null;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 363 | `pinnedThreadIndex` | `state.pinnedThreadIndex = null;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 364 | `inspectedThreadIndex` | `state.inspectedThreadIndex = null;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 365 | `threadInspectorPointerInside` | `state.threadInspectorPointerInside = false;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 372 | `canvasThreadInspectionClearTimer` | `state.canvasThreadInspectionClearTimer = null;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 375 | `pinnedThreadIndex` | `state.pinnedThreadIndex = null;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 376 | `inspectedThreadIndex` | `state.inspectedThreadIndex = null;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 377 | `threadInspectorPointerInside` | `state.threadInspectorPointerInside = false;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 388 | `inspectedThreadIndex` | `state.inspectedThreadIndex = null;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 389 | `threadInspectorPointerInside` | `state.threadInspectorPointerInside = false;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 426 | `pinnedThreadIndex` | `state.pinnedThreadIndex = null;` | focusStore | port to store |
| js/modules/thread-inspector.ts | 427 | `inspectedThreadIndex` | `state.inspectedThreadIndex = index;` | focusStore | port to store |
| js/modules/three-search-animations.ts | 397 | `searchCorridorGroup` | `state.searchCorridorGroup = corridorGroup;` | engine-only | keep in bridge |
| js/modules/three-search-animations.ts | 450 | `searchCorridorGroup` | `state.searchCorridorGroup = null;` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 241 | `pointsMesh` | `state.pointsMesh = null;` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 245 | `nodeSporeMesh` | `state.nodeSporeMesh = null;` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 249 | `nodeSporeHitMesh` | `state.nodeSporeHitMesh = null;` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 256 | `focusBeaconTexture` | `state.focusBeaconTexture = null;` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 260 | `focusRingTexture` | `state.focusRingTexture = null;` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 264 | `focusNextCueTexture` | `state.focusNextCueTexture = null;` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 296 | `nodeSporeMesh` | `state.nodeSporeMesh = sporeMesh;` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 297 | `nodeSporeMaterial` | `state.nodeSporeMaterial = sporeMat;` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 323 | `nodeSporeHitMesh` | `state.nodeSporeHitMesh = hitMesh;` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 335 | `nodePositions` | `state.nodePositions = [];` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 336 | `targetPositions` | `state.targetPositions = [];` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 337 | `originalPositions` | `state.originalPositions = [];` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 338 | `pointBaseColors` | `state.pointBaseColors = new Float32Array(state.points.length * 3);` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 340 | `searchGlowRenderStateKey` | `state.searchGlowRenderStateKey = '';` | searchStore | port to store |
| js/modules/three-node-manager.js | 344 | `overviewBounds` | `state.overviewBounds = {` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 353 | `focusBeaconTexture` | `state.focusBeaconTexture = sporeTexture;` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 354 | `focusRingTexture` | `state.focusRingTexture = createFocusRingTexture(THREE);` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 355 | `focusNextCueTexture` | `state.focusNextCueTexture = createFocusNextCueTexture(THREE);` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 403 | `pointsMaterial` | `state.pointsMaterial = new THREE.PointsMaterial({` | engine-only | keep in bridge |
| js/modules/three-node-manager.js | 419 | `pointsMesh` | `state.pointsMesh = pointsMesh;` | engine-only | keep in bridge |
| js/modules/ui-feedback.js | 44 | `experienceResetToastTimer` | `state.experienceResetToastTimer = null;` | navStore | port to store |
| js/modules/semantic-lane.js | 138 | `semanticLaneWarmingCounter` | `state.semanticLaneWarmingCounter = (state.semanticLaneWarmingCounter \|\| 0) + 1` | cameraStore | port to store |
| js/modules/semantic-lane.js | 140 | `semanticLaneWarmingCounter` | `state.semanticLaneWarmingCounter = 0;` | cameraStore | port to store |
| js/modules/semantic-lane.js | 200 | `semanticLanePendingWarm` | `state.semanticLanePendingWarm = state.semanticLanePendingWarm \|\| warm;` | cameraStore | port to store |
| js/modules/semantic-lane.js | 206 | `semanticLanePendingWarm` | `state.semanticLanePendingWarm = false;` | cameraStore | port to store |
| js/modules/semantic-lane.js | 231 | `semanticLaneProbePromise` | `state.semanticLaneProbePromise = (async () => {` | cameraStore | port to store |
| js/modules/semantic-lane.js | 242 | `semanticLaneState` | `if (reason === 'focus' \|\| reason === 'visibility' \|\| effectiveWarm \|\| isTi` | cameraStore | port to store |
| js/modules/semantic-lane.js | 259 | `semanticLaneProbePromise` | `state.semanticLaneProbePromise = null;` | cameraStore | port to store |
| js/modules/semantic-lane.js | 263 | `semanticLanePendingWarm` | `state.semanticLanePendingWarm = false;` | cameraStore | port to store |
| js/modules/semantic-lane.js | 280 | `semanticLaneMonitorTimer` | `state.semanticLaneMonitorTimer = typeof win?.setInterval === 'function' ? win.se` | cameraStore | port to store |
| js/modules/semantic-lane.js | 378 | `semanticLaneSnapshot` | `state.semanticLaneSnapshot = {` | cameraStore | port to store |
| js/modules/semantic-lane.js | 389 | `semanticLaneOpsMode` | `state.semanticLaneOpsMode = !!enabled;` | cameraStore | port to store |
| js/modules/semantic-lane.js | 397 | `semanticLaneOpsRefreshTimer` | `state.semanticLaneOpsRefreshTimer = null;` | cameraStore | port to store |
| js/modules/semantic-lane.js | 402 | `semanticLaneOpsRefreshTimer` | `state.semanticLaneOpsRefreshTimer = win.setInterval(() => {` | cameraStore | port to store |
| js/modules/semantic-lane.js | 414 | `semanticLaneOpsFetchPromise` | `state.semanticLaneOpsFetchPromise = (async () => {` | cameraStore | port to store |
| js/modules/semantic-lane.js | 426 | `semanticLaneOpsFetchPromise` | `state.semanticLaneOpsFetchPromise = null;` | cameraStore | port to store |
| js/modules/bindings\journey-bindings.js | 65 | `pinnedThreadIndex` | `if (state.pinnedThreadIndex === index) {` | focusStore | port to store |
| js/modules/three-search-animations.js | 390 | `searchCorridorGroup` | `state.searchCorridorGroup = corridorGroup;` | engine-only | keep in bridge |
| js/modules/three-search-animations.js | 443 | `searchCorridorGroup` | `state.searchCorridorGroup = null;` | engine-only | keep in bridge |
| js/modules/three-thread-manager.ts | 152 | `myceliumDirty` | `state.myceliumDirty = true;` | engine-only | keep in bridge |
| js/modules/three-thread-manager.js | 131 | `myceliumGroup` | `state.myceliumGroup = null;` | engine-only | keep in bridge |
| js/modules/three-thread-manager.js | 133 | `myceliumCoreLines` | `state.myceliumCoreLines = null;` | engine-only | keep in bridge |
| js/modules/three-thread-manager.js | 134 | `myceliumWispyLines` | `state.myceliumWispyLines = null;` | engine-only | keep in bridge |
| js/modules/three-thread-manager.js | 135 | `myceliumBridgeLines` | `state.myceliumBridgeLines = null;` | engine-only | keep in bridge |
| js/modules/three-thread-manager.js | 136 | `myceliumConnectionPairs` | `state.myceliumConnectionPairs = [];` | engine-only | keep in bridge |
| js/modules/three-thread-manager.js | 150 | `myceliumDirty` | `state.myceliumDirty = true;` | engine-only | keep in bridge |
| js/modules/three-thread-manager.js | 197 | `myceliumGroup` | `state.myceliumGroup = new THREE.Group();` | engine-only | keep in bridge |
| js/modules/three-thread-manager.js | 199 | `myceliumCoreLines` | `state.myceliumCoreLines = createLineSegments(coreConnections, coreColors, profil` | engine-only | keep in bridge |
| js/modules/three-thread-manager.js | 200 | `myceliumWispyLines` | `state.myceliumWispyLines = createLineSegments(wispyConnections, wispyColors, pro` | engine-only | keep in bridge |
| js/modules/three-thread-manager.js | 201 | `myceliumBridgeLines` | `state.myceliumBridgeLines = createLineSegments(bridgeConnections, bridgeColors, ` | engine-only | keep in bridge |
| js/modules/url-state.js | 50 | `_deferredUrlState` | `state._deferredUrlState = null;` | navStore | port to store |
| js/modules/url-state.js | 76 | `focusedNode` | `state.focusedNode = null;` | focusStore | port to store |
| js/modules/url-state.js | 77 | `selectedPoint` | `state.selectedPoint = null;` | focusStore | port to store |
| js/modules/url-state.js | 86 | `currentSearchSummary` | `state.currentSearchSummary = null;` | searchStore | port to store |
| js/modules/url-state.js | 88 | `trailDepth` | `state.trailDepth = 0;` | navStore | port to store |
| js/modules/url-state.js | 89 | `myceliumMode` | `state.myceliumMode = 'default';` | navStore | port to store |
| js/modules/url-state.js | 105 | `applyingUrlState` | `state.applyingUrlState = true;` | navStore | port to store |
| js/modules/url-state.js | 106 | `restoringBrowserHistory` | `state.restoringBrowserHistory = !!options.fromHistory;` | navStore | port to store |
| js/modules/url-state.js | 182 | `_deferredUrlState` | `state._deferredUrlState = { params: Object.fromEntries(params.entries()), timest` | navStore | port to store |
| js/modules/url-state.js | 187 | `_deferredUrlStateHandler` | `state._deferredUrlStateHandler = () => {` | navStore | port to store |
| js/modules/url-state.js | 193 | `applyingUrlState` | `state.applyingUrlState = false;` | navStore | port to store |
| js/modules/url-state.js | 207 | `_deferredUrlState` | `state._deferredUrlState = { params: Object.fromEntries(params.entries()), timest` | navStore | port to store |
| js/modules/url-state.js | 211 | `_deferredUrlStateHandler` | `state._deferredUrlStateHandler = () => {` | navStore | port to store |
| js/modules/url-state.js | 217 | `applyingUrlState` | `state.applyingUrlState = false;` | navStore | port to store |
| js/modules/url-state.js | 245 | `applyingUrlState` | `state.applyingUrlState = false;` | navStore | port to store |
| js/modules/url-state.js | 246 | `restoringBrowserHistory` | `state.restoringBrowserHistory = priorRestoringBrowserHistory;` | navStore | port to store |
| js/modules/bindings\global-bindings.ts | 19 | `eventListenersInitialized` | `state.eventListenersInitialized = false;` | navStore | port to store |
| js/modules/bindings\global-bindings.js | 12 | `eventListenersInitialized` | `state.eventListenersInitialized = false;` | navStore | port to store |
| js/modules/url-state.ts | 108 | `focusedNode` | `state.focusedNode = null;` | focusStore | port to store |
| js/modules/url-state.ts | 109 | `selectedPoint` | `state.selectedPoint = null;` | focusStore | port to store |
| js/modules/url-state.ts | 118 | `currentSearchSummary` | `state.currentSearchSummary = null;` | searchStore | port to store |
| js/modules/url-state.ts | 120 | `trailDepth` | `state.trailDepth = 0;` | navStore | port to store |
| js/modules/url-state.ts | 121 | `myceliumMode` | `state.myceliumMode = 'default';` | navStore | port to store |
| js/modules/url-state.ts | 137 | `applyingUrlState` | `state.applyingUrlState = true;` | navStore | port to store |
| js/modules/url-state.ts | 138 | `restoringBrowserHistory` | `state.restoringBrowserHistory = !!options.fromHistory;` | navStore | port to store |
| js/modules/url-state.ts | 226 | `applyingUrlState` | `state.applyingUrlState = false;` | navStore | port to store |
| js/modules/url-state.ts | 251 | `applyingUrlState` | `state.applyingUrlState = false;` | navStore | port to store |
| js/modules/url-state.ts | 279 | `applyingUrlState` | `state.applyingUrlState = false;` | navStore | port to store |
| js/modules/url-state.ts | 280 | `restoringBrowserHistory` | `state.restoringBrowserHistory = priorRestoringBrowserHistory;` | navStore | port to store |
| js/modules/three-interaction-visuals.ts | 372 | `anchorBloomLight` | `state.anchorBloomLight = anchorBloomLight;` | engine-only | keep in bridge |
| js/modules/three-interaction-visuals.ts | 396 | `trailDepth` | `const isInside = state.trailDepth === 2;` | navStore | port to store |
| js/modules/three-interaction-visuals.ts | 452 | `trailDepth` | `const isInside = state.trailDepth === 2;` | navStore | port to store |
| js/modules/three-interaction-visuals.ts | 550 | `trailDepth` | `const isInside = state.trailDepth === 2;` | navStore | port to store |
| js/modules/three-interaction-visuals.js | 183 | `semanticManifold` | `state.semanticManifold = null;` | engine-only | keep in bridge |
| js/modules/three-interaction-visuals.js | 187 | `semanticLensGroup` | `state.semanticLensGroup = null;` | engine-only | keep in bridge |
| js/modules/three-interaction-visuals.js | 191 | `focusLens` | `state.focusLens = null;` | engine-only | keep in bridge |
| js/modules/three-interaction-visuals.js | 193 | `semanticLensGlow` | `state.semanticLensGlow = null;` | engine-only | keep in bridge |
| js/modules/three-interaction-visuals.js | 194 | `semanticLensSpokes` | `state.semanticLensSpokes = null;` | engine-only | keep in bridge |
| js/modules/three-interaction-visuals.js | 254 | `semanticManifold` | `state.semanticManifold = new THREE.Mesh(manifoldGeo, manifoldMat);` | engine-only | keep in bridge |
| js/modules/three-interaction-visuals.js | 261 | `semanticLensGroup` | `state.semanticLensGroup = new THREE.Group();` | engine-only | keep in bridge |
| js/modules/three-interaction-visuals.js | 298 | `semanticLensGlow` | `state.semanticLensGlow = new THREE.Mesh(glowGeo, glowMat);` | engine-only | keep in bridge |
| js/modules/three-interaction-visuals.js | 334 | `semanticLensSpokes` | `state.semanticLensSpokes = new THREE.LineSegments(spokeGeo, spokeMat);` | engine-only | keep in bridge |
| js/modules/three-interaction-visuals.js | 370 | `focusLens` | `state.focusLens = new THREE.Mesh(focusLensGeo, focusLensMat);` | engine-only | keep in bridge |
| js/modules/three-interaction-visuals.js | 378 | `anchorBloomLight` | `state.anchorBloomLight = anchorBloomLight;` | engine-only | keep in bridge |
| js/modules/three-interaction-visuals.js | 402 | `trailDepth` | `const isInside = state.trailDepth === 2;` | navStore | port to store |
| js/modules/three-interaction-visuals.js | 458 | `trailDepth` | `const isInside = state.trailDepth === 2;` | navStore | port to store |
| js/modules/three-interaction-visuals.js | 556 | `trailDepth` | `const isInside = state.trailDepth === 2;` | navStore | port to store |
| js/modules/three-node-manager.ts | 305 | `nodePositions` | `state.nodePositions = [];` | engine-only | keep in bridge |
| js/modules/three-node-manager.ts | 306 | `targetPositions` | `state.targetPositions = [];` | engine-only | keep in bridge |
| js/modules/three-node-manager.ts | 307 | `originalPositions` | `state.originalPositions = [];` | engine-only | keep in bridge |
| js/modules/three-node-manager.ts | 308 | `pointBaseColors` | `state.pointBaseColors = new Float32Array(state.points.length * 3);` | engine-only | keep in bridge |
| js/modules/three-node-manager.ts | 310 | `searchGlowRenderStateKey` | `state.searchGlowRenderStateKey = '';` | searchStore | port to store |
| js/modules/three-node-manager.ts | 314 | `overviewBounds` | `state.overviewBounds = {` | engine-only | keep in bridge |

## Notes

- Deduplication rule: When a `.ts` and `.js` pair mutate the same property at the same line, only the `.ts` version is counted.
- Engine-only properties stay in the Three.js bridge layer; they do not map to Svelte stores.
- FocusStore includes focus transition state, thread inspection, hover/picking, strand continuity, and anchor indicators.
- NavStore includes navigation mode, view switching, auto-rotate, trail depth, loading state, and navState.* sub-properties.
- SearchStore includes search results, glow indices, query state, compact reveal, and search corridor.
- FilterStore includes active filter values, cluster filter, story prompt, and filter versioning.
- CameraStore includes route exploration, terrain handoff, scene reveal, view handoff timers, semantic lane health, and choreography.
- Some properties overlap stores (e.g. focusCameraOffset lives in focusStore but is also consumed by camera choreography). These are assigned to the primary owner.
