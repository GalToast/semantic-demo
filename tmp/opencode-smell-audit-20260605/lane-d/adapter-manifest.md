# Adapter Manifest — Lane D Audit

Generated: 2026-06-05

---

## 1. cluster-filter-adapter.js (2903 bytes)

- **Consumers:** `app.js:19` (init call, OFF-LIMITS), `cluster-filter.js:7` (usage: imports `applyFilters`, `clearSearchGlow`, `updateUrlState`, `clearShortSemanticSearchState`)
- **Cycle solved?** Yes — decouples `cluster-filter.js` from raw `window.applyFilters` / `window.clearSearchGlow` / `window.updateUrlState` globals (breaks cluster-filter → window → url-state cycle)
- **Inlineable?** No — `app.js` (off-limits) calls `initClusterFilterAdapter`. The adapter is the only safe seam between `cluster-filter.js` and the window globals. Inlining would require `app.js` changes.

## 2. connection-analysis-adapter.js (1943 bytes)

- **Consumers:** `connection-analysis.js:9` (usage: imports `getConnectionStateSnapshot`, `getElementById`, `getSummaryTextEl`, `getSummaryCardEl`, `getStoryNoteEl`, `getStoryTextEl`, `getStorySourceEl`)
- **Cycle solved?** No — this is a pure DOM/state snapshot helper; no circular dependency is broken.
- **Inlineable?** Yes — `connection-analysis.js` could import `state` directly from `state.js` and use `document.getElementById` inline. No cycle, no off-limits consumer. **Out of scope for this lane** (future wave).

## 3. diagnostic-adapter.js (1473 bytes)

- **Consumers:** `audio-scape.js:2`, `event-bus.js:8`, `idb-service.js:8`, `journey-semantic-overlay.js:14`, `micro-demo.js:8`, `pathfinding.js:2`, `semantic-lane.js:13`, `semantic-search-api-cache.js:2`, `thread-inspector.js:447` (all import `debugWarn` or `registerDiagnosticProbe`)
- **Cycle solved?** No — standalone debug gating utility. No cycle broken.
- **Inlineable?** Yes — each consumer could inline the `debugWarn` / `registerDiagnosticProbe` logic. But 9 consumers = high churn. **Out of scope for this lane** (future wave).

## 4. inspected-strand-overlay-adapter.js (309 bytes)

- **Consumers:** `thread-inspector.js:39` (producer: calls `setInspectedStrandOverlayUpdater(updateInspectedStrandOverlay)`), `three-engine.js:29` (consumer: imports `updateInspectedStrandOverlayFrame`), `three-engine.ts:31` (consumer: same)
- **Cycle solved?** Yes — decouples `thread-inspector.js` from `three-engine.js` (no direct import either way)
- **Inlineable?** Yes — no cycle between `three-engine.js` and `thread-inspector.js`. `three-engine.js` can import `updateInspectedStrandOverlay` directly from `thread-inspector.js`.

## 5. journey-lifecycle-adapter.js (3192 bytes)

- **Consumers:**
  - `app.js:18,44` (OFF-LIMITS — calls `initJourneyLifecycleAdapter`, imports `getInterestingBusinessNote`, `buildSelectedMatchNarrative`)
  - `components/SelectedBusinessDetails.svelte:16` (imports `buildSelectedMatchNarrative`, `describeThreadLensForPoint`, `getInterestingBusinessNote`, `getSelectedBusinessRoleLabel`)
  - `journey-canvas-interaction.js:2` (star import — uses `setLastCanvasNodePick`, `setLastCanvasNodeFocusPick`)
  - `journey-compass-controller.js:31` (imports `setSemanticDiveMode`)
  - `journey-compass-state.js:7,11` (OFF-LIMITS — imports `getInterestingBusinessNote`, `getNextWalkCandidateForIndex`)
  - `journey-focus-ui.js:7` (star import — uses `hasColdDegradedSemanticFallback`, `shouldUseFloatingFocusJourneyOnly`)
  - `journey-selected-card.js:5` (star import — uses `getPreviouslyFocusedFocusStage`, `setPreviouslyFocusedFocusStage`, `isFieldNodeFocusContext`, `revealSelectedBusinessCard`, `hydrateLeadContext`)
  - `semantic-dive-ui.js:11` (imports `getNextWalkCandidateForIndex`)
- **Cycle solved?** Yes — decouples `journey.js` from `focus-pocket.js`, `lifecycle.js`, `focus-stage-renderer.js`, `ui-renderers.js`, `event-bindings.js`, `journey-focus-ui.js`, `journey-point-color.js`, and raw `state` writes
- **Inlineable?** Partially — 17 wrapper functions. Some consumers are off-limits (`app.js`, `journey-compass-state.js`). See Commit 3 analysis for per-wrapper breakdown.

## 6. route-arrival-overlay-adapter.js (765 bytes)

- **Consumers:** `journey-webgl.js:30` (producer: calls `setRouteArrivalOverlayUpdaters`), `three-engine.js:34` (consumer: imports `updateArrivalHandoffOverlayFrame`, `updateRouteTraceOverlayFrame`), `three-engine.ts:36` (consumer: same)
- **Cycle solved?** Yes — decouples `journey-webgl.js` from `three-engine.js` (no direct import either way)
- **Inlineable?** Yes — no cycle between `three-engine.js` and `journey-webgl.js`. `three-engine.js` can import the two functions directly from `journey-webgl.js`.

## 7. search-panel-adapter.js (5153 bytes)

- **Consumers:** `app.js:43` (OFF-LIMITS), `components/SearchChrome.svelte:6`, `composition-state.js:10`, `lifecycle.js:35` (OFF-LIMITS), `search-results-ui.js:5`, `search-state.js:18`
- **Cycle solved?** Yes — decouples `search-state.js` from cross-surface DOM flags and mobile sheet state
- **Inlineable?** No — `app.js` and `lifecycle.js` are off-limits. The adapter owns real DOM logic (toggle classes, aria attributes, event binding). Inlining would spread DOM concerns across 6+ files.

## 8. semantic-guide-payload-adapter.js (3084 bytes)

- **Consumers:** `semantic-guide-payload.js:13` (single consumer: imports `getSearchContextSnapshot`, `getPoints`, `getResultContextMap`, `buildSemanticGuidePayloadResult`, `mapResultIndicesToPayloadResults`, `getAnchorPoint`, `formatBusinessName`)
- **Cycle solved?** Yes — decouples `semantic-guide-payload.js` from raw `state.js` shape
- **Inlineable?** Yes — single non-off-limits consumer could import `state` and `dom-formatters` directly. **Out of scope for this lane** (future wave).

## 9. thread-inspector-adapter.js (1682 bytes)

- **Consumers:** `app.js:22` (OFF-LIMITS — calls `initThreadInspectorAdapter`), `thread-inspector-webgl.js:3` (imports `adapter_getFocusThreadCurvePoint`), `thread-inspector.js:36` (imports `adapter_summarizeNeighborReason`, `adapter_getInsideRelationshipLabel`, `adapter_getCurrentTrailFocusIndex`)
- **Cycle solved?** Yes — decouples `thread-inspector.js` from `journey.js` and `focus-pocket.js`
- **Inlineable?** No — `app.js` (off-limits) provides the injected implementations. The adapter breaks a real cycle between `thread-inspector.js` ↔ `journey.js` / `focus-pocket.js`.

## 10. webgl-restore-adapter.js (307 bytes)

- **Consumers:** `app.js:35` (OFF-LIMITS — calls `setWebGLContextRestoreHandler`), `three-engine.js:27` (consumer: imports `restoreWebGLContext`), `three-engine.ts:29` (consumer: same)
- **Cycle solved?** Yes — decouples `three-engine.js` from `app.js` (app.js provides the restore handler implementation)
- **Inlineable?** No — `app.js` is off-limits and is the sole provider of the restore handler. The adapter is the only safe injection seam.

---

## Summary

| # | Adapter | Inlineable? | Reason |
|---|---------|-------------|--------|
| 1 | cluster-filter-adapter | No | app.js off-limits, cycle-breaking |
| 2 | connection-analysis-adapter | Yes* | *Future wave (9-file scope) |
| 3 | diagnostic-adapter | Yes* | *Future wave (9-file scope) |
| 4 | inspected-strand-overlay-adapter | **Yes** | No cycle, no off-limits |
| 5 | journey-lifecycle-adapter | **Partial** | 3 off-limits consumers block some wrappers |
| 6 | route-arrival-overlay-adapter | **Yes** | No cycle, no off-limits |
| 7 | search-panel-adapter | No | app.js + lifecycle.js off-limits |
| 8 | semantic-guide-payload-adapter | Yes* | *Future wave (single consumer) |
| 9 | thread-inspector-adapter | No | app.js off-limits, cycle-breaking |
| 10 | webgl-restore-adapter | No | app.js off-limits, sole provider |
