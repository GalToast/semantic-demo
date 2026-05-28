# lifecycle.js window.* Bridge Map

> Owned by Seam 4 — McCullough digital
> Covers: `js/modules/lifecycle.js` window bridge surface only

## Methodology
- Grepped all `window.XXX =` assignments in `js/modules/*.js`
- Cross-referenced every `window.XXX` call/guard in lifecycle.js against defined assignments
- Marked each bridge by where it is **defined** (canonical owner), **imported** from another module, or a **gap** (called but never assigned — likely dead or not-yet-wired)

---

## Part A — `window.*` bridges lifecycle.js defines

These are defined and assigned inside lifecycle.js (lines 2529–2788).

### Canonical public API (named exports)

| window property | source function | exported |
|---|---|---|
| `setLoadingPhase` | `setLoadingPhase` | yes |
| `hideLoadingOverlay` | `hideLoadingOverlay` | yes |
| `startSceneReveal` | `startSceneReveal` | yes |
| `startDeferredHydration` | `startDeferredHydration` | yes |
| `scheduleWeatherHydration` | `scheduleWeatherHydration` | yes |
| `setSemanticLaneUiState` | `setSemanticLaneUiState` | yes |
| `probeSemanticLane` | `probeSemanticLane` | yes |
| `scheduleSemanticLaneMonitor` | `scheduleSemanticLaneMonitor` | yes |
| `onWindowResize` | `onWindowResize` | yes |
| `syncFilterControls` | `syncFilterControls` | indirect |
| `updateClusterList` | `updateClusterList` | indirect |
| `populateCityFilter` | `populateCityFilter` | indirect |
| `syncCityFilterUi` | `syncCityFilterUi` | indirect |
| `updateExplorationUi` | `updateExplorationUi` | indirect |
| `setMyceliumMode` | `setMyceliumMode` | indirect |
| `setTrailDepth` | `setTrailDepth` | indirect |
| `applyStoryPrompt` | `applyStoryPrompt` | indirect |
| `updateUrlState` | `updateUrlState` | indirect |
| `copyCurrentViewLink` | `copyCurrentViewLink` | indirect |
| `resetExperienceState` | `resetExperienceState` | indirect |
| `resetStateBeforeUrlRestore` | `resetStateBeforeUrlRestore` | indirect |
| `switchView` | `switchView` | indirect |
| `refreshCompositionState` | `refreshCompositionState` | indirect |
| `syncSemanticDiveUi` | `syncSemanticDiveUi` | indirect |
| `getJourneyCompassState` | `getJourneyCompassState` | indirect |
| `updateJourneyCompass` | `updateJourneyCompass` | indirect |
| `executeJourneyCompassAction` | `executeJourneyCompassAction` | indirect |
| `showViewHandoff` | `showViewHandoff` | indirect |
| `hideViewHandoff` | `hideViewHandoff` | indirect |
| `showExperienceToast` | `showExperienceToast` | indirect |
| `setSemanticGuideButtonState` | `setSemanticGuideButtonState` | indirect |
| `showSummaryCard` | `showSummaryCard` | indirect |
| `hideSummaryCard` | `hideSummaryCard` | indirect |
| `requestSemanticGuide` | `requestSemanticGuide` | indirect |
| `focusOnNode` | `focusOnNode` | indirect |
| `focusOnPoint` | `focusOnPoint` | indirect |
| `resetNodePositions` | `resetNodePositions` | indirect |
| `syncSearchStatusForFocus` | `syncSearchStatusForFocus` | indirect |
| `recordSemanticLaneSnapshot` | `recordSemanticLaneSnapshot` | indirect |
| `setSemanticLaneOpsMode` | `setSemanticLaneOpsMode` | indirect |
| `refreshSemanticLaneOpsSummary` | `refreshSemanticLaneOpsSummary` | indirect |
| `showSemanticThreadsDetail` | `showSemanticThreadsDetail` | indirect |

### Inline closures (anonymous, defined inside the `if (typeof window !== 'undefined')` block)

| window property | Notes |
|---|---|
| `getInterestingBusinessNote(point)` | Filters trivia; suppresses placeholder QA strings |
| `buildSelectedMatchNarrative(point)` | Returns `currentSearchSummary.reason` or `''` |
| `setSemanticDiveMode(enabled)` | Syncs `state.semanticDiveMode`; calls `window.setTrailDepth`, `window._fp.applyLocalNeighborhoodFocus`, `window.animateCameraToNode`, `window.previewInsideNextThread` |
| `exploreInsideToNextStop()` | Guards `strandContinuityState.phase`; delegates to `walkThreadNeighbor` or `traverseNeighbor` |
| `recenterFocusedNode()` | Shortcut: calls `window.animateCameraToNode` with `transitionStyle:'focus'` |
| `returnToCountyView()` | Resets `semanticDiveMode`; calls `window.resetNodePositions` |
| `toggleAutoRotate()` | Respects `prefers-reduced-motion`; toggles `state.controls.autoRotate` |
| `_openTrailReview()` | DOM-only; no external dependencies |
| `_closeTrailReview()` | DOM-only with return-focus |

### Retired internal probe

| window property | Notes |
|---|---|
| `__semanticJourneyProbe()` | Retired 2026-05-28; `installSemanticJourneyProbe()` now returns `getJourneyCompassPresentationState()` directly without assigning to `window`. |

---

## Part B — `window.*` bridges lifecycle.js calls but does NOT own

These are invoked via `typeof window.XXX === 'function'` guards. All are **canonical** in other modules.

### Owned by app.js

| window property | Called at lifecycle.js lines | Owner module |
|---|---|---|
| `findClusterByKeyword` | 483 | app.js (inline) |
| `getRouteEmbodimentIndices` | 1125, 1234, 1362, 1433 | map-state.js via app.js |
| `getRouteLayerOrigin` | 1126, 1226 | intentional no-op guard with `'galaxy'` fallback |
| `setTerrainHandoffState` | 1239, 1358, 1368, 1434 | map-state.js via app.js |
| `setRouteChoreographyPhase` | 1246, 1396, 1424, 1443 | camera-controls.js via app.js |
| `animateCameraToTerrainPrelude` | 1253 | camera-controls.js via app.js |
| `animateCameraToSearchCorridor` | 1403 | camera-controls.js via app.js |
| `initMap` | 1450 | map-state.js via app.js |
| `applyWeatherEffects` | 1460 | weather.js via app.js |
| `clearWeatherEffects` | 1374 | weather.js via app.js |
| `updateLegendGuideState` | retired window bridge; direct imports from `legend-ui.js` | legend-ui.js |
| `syncRouteDirectorState` | 1048, 1089 | map-state.js via app.js |
| `updateSelectedCardHeading` | 1049, 1090, 1289 | ui-renderers.js |
| `updateFocusNeighborRail` | 1052, 1094 | journey.js |
| `refreshMapMarkers` | 1053, 1095 | map-state.js via app.js |
| `refreshMapRouteEmbodiment` | 1054, 1096, 2144 | map-state.js via app.js |
| `refreshRouteTraceOverlay` | 1055, 1097 | journey.js |
| `centerMapOnRouteAnchor` | 1107 | map-state.js via app.js |
| `clearRouteExploration` | 1294, 2145 | camera-controls.js via app.js |
| `clearMobileRouteFieldPeek` | 1086, 1224 | search-state.js |
| `syncClusterSectionState` | 1478 | lifecycle.js window shim |
| `getFilteredIndices` | 709 | search-state.js via app.js |
| `updateSearchStatusMessage` | 708 | search-state.js via app.js |
| `getFilteredIndices` | 709 | search-state.js via app.js |
| `applyFilters` | 496, 706 | search-state.js via app.js |
| `updateSelectedBusiness` | 704, 2138 | journey.js |
| `setTrailFromSeed` | 1387, 1420, 2132 | journey.js |
| `updateTrailIndices` | 2133, 524 (search-state) | journey.js |
| `refreshFocusSemanticOverlay` | 2134, 89 (loading-ui) | journey.js |
| `clearThreadInspection` | 2131, 2653 | journey.js |
| `setActiveSearchResultRow` | 1520 | ui-renderers.js |
| `beginSearchFocusTransition` | 1787 | search-state.js via app.js |
| `setSearchPanelState` | 693 | search-state.js |
| `hideTooltip` | 694, 2130 | tooltip.js |
| `clearSearchPreviewHoverTimer` | 695 | search-state.js |
| `clearSearchPreviewOverlay` | 696 | search-state.js |
| `clearSearchGlow` | 495, 697 | search-state.js via app.js |
| `updateSearchTrailCue` | 698, 1540, 1559, 1576 | search-state.js via app.js |
| `syncFocusStage` | 711, 1480, 2141 | journey.js |
| `refreshCompositionState` | 712, 1484 | lifecycle.js own export |
| `applyPointFilterColors` | 326, 2136 | journey.js |
| `updateExplorationUi` | 329, 497, 707 | lifecycle.js own export |
| `syncSemanticDiveUi` | 362, 1050, 1092 | lifecycle.js own export |
| `updateJourneyCompass` | 365, 639 | lifecycle.js own export |
| `updateUrlState` | 332, 368, 499, 1474 | lifecycle.js own export |
| `clearWeatherRefreshTimer` | 1345 | weather.js |
| `animateCameraToNode` | 1302, 2154, 2639, 2645, 2674 | camera-controls.js via app.js |
| `previewInsideNextThread` | 2642 | journey.js |
| `walkThreadNeighbor` | 2665 | journey.js |
| `traverseNeighbor` | 2668 | journey.js |
| `search` | 1779 | search-state.js via app.js |
| `syncFilterControls` | 494, 700 | lifecycle.js own export |
| `resetNodePositions` | 702, 2681 | journey.js |
| `clearShortSemanticSearchState` | 873 | search-state.js |
| `clearSearch` | 868 | search-state.js |
| `updateHasQuery` | url-state.js:147 | event-bindings.js |
| `renderSignalBadges` | 1164–1413 | ui-renderers.js |
| `renderSelectedMetaStrip` | 1302, 1415 | ui-renderers.js |
| `renderSelectedMatchPanel` | 1303, 1416 | ui-renderers.js |
| `renderSelectedActionRow` | 1304, 1417 | ui-renderers.js |
| `describeThreadLensForPoint` | 1483 | journey.js |
| `getSelectedBusinessRoleLabel` | 1396 | app.js (inline) |
| `hydrateLeadContext` | 1490 | lifecycle.js window shim |
| `getInterestingBusinessNote` | 1187 | lifecycle.js own closure |
| `buildSelectedMatchNarrative` | 1189 | lifecycle.js own closure |
| `applySearchGlowVisualState` | 3039 | superseded by `syncSearchStatusForFocus` |

### Owned by ui-renderers.js

| window property | Called at lifecycle.js |
|---|---|
| `renderSignalBadges` | journey.js:1164–1413 (via lifecycle.js calling journey.js) |
| `renderSelectedMetaStrip` | journey.js:1302, 1415 |
| `renderSelectedMatchPanel` | journey.js:1303, 1416 |
| `renderSelectedActionRow` | journey.js:1304, 1417 |
| `updateSelectedCardHeading` | lifecycle.js:1050, 1091; journey.js:1289 |
| `setActiveSearchResultRow` | lifecycle.js:1520 |

### Dead extraction stub

`js/modules/ui-renderers-lifecycle.js` was an unimported extraction stub and has been removed.
Do not recreate it as an owner unless it is wired into the live app.
The live renderer owner for selected-card bridge functions is `js/modules/ui-renderers.js`.

---

## Semantic Guide Payload Extraction

`js/modules/semantic-guide-payload.js` is a shared helper module extracted from
`lifecycle.js` and `connection-analysis.js` to eliminate duplicate implementations of
`buildSemanticGuidePayloadResult`, `getSemanticGuidePayloadResults`,
`getSemanticGuideAnchorPoint`, and `buildSemanticGuideRequestPayload`.

| Function | lifecycle.js | connection-analysis.js |
|---|---|---|
| `buildSemanticGuidePayloadResult` | now imports from semantic-guide-payload.js | now imports from semantic-guide-payload.js |
| `getSemanticGuidePayloadResults` | now imports from semantic-guide-payload.js | now imports from semantic-guide-payload.js |
| `getSemanticGuideAnchorPoint` | now imports from semantic-guide-payload.js | now imports from semantic-guide-payload.js |
| `buildSemanticGuideRequestPayload` | now imports from semantic-guide-payload.js | now imports from semantic-guide-payload.js |

The module depends only on `../state.js` and `../utils.js` — no circular import risk.
Both `lifecycle.js` and `connection-analysis.js` retain their own full `utils.js` imports for
other utility calls. `connection-analysis.js` drops its direct utils imports since it now
uses only the payload builder from the shared module.

---

## Part C — Named diagnostic probes (read-only, `window.__*`)

| window property | Defined by | Accessed by |
|---|---|---|
| `__semanticJourneyProbe()` | retired 2026-05-28 | replaced by direct `installSemanticJourneyProbe()` return value |
| `__semanticSearchCacheProbe()` | app.js:72 | external diagnostics |
| `__semanticThreadInspectorProbe()` | journey.js:3085 | external diagnostics |
| `__semanticFocusCueProbe()` | journey.js:3086 | external diagnostics |
| `__semanticCanvasThreadProbe()` | journey.js:3096 | external diagnostics |
| `__lastCanvasNodePick` | journey.js:2494–2615 | internal only |
| `__lastCanvasNodeHover` | journey.js:2527–2563 | internal only |
| `__lastCanvasNodeFocusPick` | journey.js:2615 | internal only |

---

## Part D — Gaps: resolved vs. intentionally documented

### Resolved gaps

| window property | Resolution | Source |
|---|---|---|
| `syncClusterSectionState` | Implemented in lifecycle.js window shim (lines 2544–2549) | lifecycle.js:2544 |
| `hydrateLeadContext` | Implemented in lifecycle.js window shim (lines 2793–2798); delegates to `window.updateSelectedBusiness` | journey.js:1490 |
| `applySearchGlowVisualState` | No-op guard removed; journey.js:3037–3044 now calls `window.syncSearchStatusForFocus` directly instead | journey.js:3037–3044 |
| `updateSelectedCardHeading` | Implemented in ui-renderers.js and assigned to `window.updateSelectedCardHeading` | ui-renderers.js |

### Intentional no-op guards

| window property | Decision | Rationale |
|---|---|---|
| `getRouteLayerOrigin` | **Document as intentional no-op** (lines 1127, 1227) | The `'galaxy'` fallback is architecturally correct — the caller (`getViewHandoffModel`) only reads the `from` field for cosmetic strings. A correct implementation would require tracking `previousView` origin across all view transitions, which is out-of-scope for this seam. The no-op guard is safe because the fallback is hardcoded `'galaxy'` in the same call site. |

---

## Verification commands

```bash
# Prove resolved gaps and intentional no-op guards (contract test)
node tests/window-bridge-gaps-contract.mjs

# Prove syncClusterSectionState is assigned in lifecycle.js
grep 'window.syncClusterSectionState =' js/modules/lifecycle.js

# Prove hydrateLeadContext is assigned in lifecycle.js
grep 'window.hydrateLeadContext =' js/modules/lifecycle.js

# Prove applySearchGlowVisualState no longer has bare calls
grep 'window.applySearchGlowVisualState' js/modules/journey.js  # should appear only in comments

# Prove updateSelectedCardHeading is assigned in ui-renderers.js
grep 'window.updateSelectedCardHeading =' js/modules/ui-renderers.js
```

## Top bridge risks

1. **`getRouteLayerOrigin` — intentional no-op guard**: lifecycle.js falls back to `'galaxy'`, so terrain handoff copy is stable but not origin-specific. This is low risk today and should only be revisited if the product needs precise previous-view handoff language.

2. **Window bridge surface area**: lifecycle/journey still coordinate through several guarded `window.*` bridges. The resolved gaps are covered by `tests/window-bridge-gaps-contract.mjs`; new bridges should be added to the contract or moved to direct imports during de-windowing seams.
