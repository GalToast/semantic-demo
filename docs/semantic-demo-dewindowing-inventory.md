# semantic-demo-dewindowing-inventory.md

## Session tools exposed (window globals)

| Global | Assigned in | Called from | Risk if absent |
|--------|-------------|-------------|----------------|
| `window.state` | app.js:48, lifecycle.js (shared state object) | 30+ call sites across tests and runtime | Crash / TypeError |
| `window.focusOnNode` | app.js:85 → camera-controls.js | **Direct import callers:** lifecycle.js:79, event-bindings.js:4, search-state.js (dewindowed 2026-05-21 — direct named import from camera-controls.js); **Test callers:** 6 Playwright spec files (unchanged) | Silent no-op (guarded) |
| `window.returnToOverview` | app.js:121 → lifecycle.js:2493 | event-bindings.js:275, lifecycle.js (internal) | Silent no-op (guarded) |
| `window.syncFocusStage` | **Retired 2026-05-25** | camera-controls, lifecycle, view-controller, and thread-inspector call `syncFocusStage` through named imports | Removed compatibility shim |
| `window.syncClusterSectionState` | lifecycle.js:2482 (window shim) | lifecycle.js:1479, scene-reveal.js:56, event-bindings.js:693 | UI state desync |
| `window.hydrateLeadContext` | lifecycle.js (window shim) | journey.js:1490 | Card not updating |
| `window.setSemanticDiveMode` | journey.js:3096 (overrides lifecycle.js:2551) | lifecycle.js:940/943, event-bindings.js:61 | Dive mode state desync |
| `window.getRouteLayerOrigin` | NOT assigned (intentional no-op) | lifecycle.js:1240/1340 | Falls back to 'galaxy' |
| `window.getJourneyCompassState` | Dewindowed 2026-05-25; use lifecycle named export from `journey-compass-state.js` | Former journey/search/thread/lifecycle callers | Bridge removed from lifecycle.js |
| `window.updateJourneyCompass` | Dewindowed 2026-05-25; use lifecycle named export from `journey-compass-controller.js` | Runtime callers now import directly or use adapters | Bridge removed from lifecycle.js |
| `window.executeJourneyCompassAction` | Dewindowed 2026-05-25; use lifecycle named export from `journey-compass-controller.js` | event-bindings.js imports directly | Bridge removed from lifecycle.js |
| `window.showViewHandoff` | lifecycle.js:2501 | lifecycle.js:1374/1586, map-state.js:431 | Handoff overlay never shown |
| `window.hideViewHandoff` | lifecycle.js:2502 | lifecycle.js:1402, map-state.js:431 | Handoff overlay never dismissed |
| `window.showExperienceToast` | Dewindowed 2026-05-25; use direct named export from `ui-feedback.js` | Former three-setup/event-bindings/journey/keyboard/thread/lifecycle callers | Bridge removed from lifecycle.js |
| `window.updateExplorationUi` | lifecycle.js:2488 | journey.js:1063, lifecycle.js:370/403/406/548, search-state.js:671/733/1255, thread-inspector.js:31 | Exploration UI stale |
| `window.setMyceliumMode` | lifecycle.js:2489 | app.js:115 | Mycelium mode not synced |
| `window.setTrailDepth` | lifecycle.js:2490 | app.js:116, lifecycle.js:318/324 | Trail depth not synced |
| `window.applyStoryPrompt` | lifecycle.js:2491 | app.js:117 | Story prompt not applied |
| `window.copyCurrentViewLink` | lifecycle.js:2492 | lifecycle.js:638 (internal) | Link copy broken |
| `window.resetExplorationFocus` | lifecycle.js:2494 | app.js:122 | Reset non-functional |
| `window.resetStateBeforeUrlRestore` | lifecycle.js:2495 | (used internally by lifecycle) | URL restore state bleed |
| `window.refreshCompositionState` | app.js/lifecycle.js compatibility bridge retained | search-state runtime callers dewindowed 2026-05-25 through `search-lifecycle-adapter.js`; app/lifecycle bridge remains for bootstrap/tests | Temporary test/external compatibility shim |
| `window.syncSemanticDiveUi` | Retired 2026-05-25 | Runtime source callers dewindowed 2026-05-25; camera-controls, journey-compass-controller, journey, and thread-inspector import `syncSemanticDiveUi` directly; reduced-motion tests exercise it through the `setTrailDepth` owner path | No compatibility bridge remains |
| `window.focusOnPoint` | Retired 2026-05-25 | Runtime source callers dewindowed 2026-05-25; map-state, journey, and thread-inspector import `focusOnPoint` directly from lifecycle.js | No compatibility bridge remains |
| `window.getInterestingBusinessNote` | lifecycle.js:2507 | journey.js:1212/1453 | Empty card notes |
| `window.buildSelectedMatchNarrative` | lifecycle.js:2545 | journey.js:1214/1455 | Empty match narrative |
| `window.setSemanticDiveMode` (journey.js) | journey.js:3096 (overrides lifecycle.js) | journey.js:61 | Overwrites lifecycle shim |
| `window.animateCameraToNode` | app.js:84 → camera-controls.js | camera-controls.js:1171 | Animation non-functional |
| `window.animateCameraToTerrainPrelude` | camera-controls.js:1236 | (internal) | — |
| `window.animateCameraToSearchCorridor` | camera-controls.js:1239 | (internal) | — |
| `window.animateCameraToOverview` | camera-controls.js:1238 | (internal) | — |
| `window.initThreeJS` | three-setup.js:2439 | (internal bootstrapping) | 3D init broken |
| `window.createPoints` | three-setup.js:2441 | (internal) | — |
| `window.createMycelium` | three-setup.js:2443 | (internal) | — |
| `window.updateMyceliumThreads` | three-setup.js:2448 | (internal) | — |
| `window.shouldRenderThreads` | three-setup.js:2449 | (internal) | — |
| `window.shouldRenderBridgeThreads` | three-setup.js:2450 | (internal) | — |
| `window.animate` | three-setup.js:2451 | (internal) | — |
| `window.cancelAnimate` | three-setup.js:2452 | app.js:251 | Animation not cancelled |
| `window.deinit` | three-setup.js:2453 | (internal) | — |
| `window.initMap` | app.js:94 → map-state.js | (internal) | Map init broken |
| `window.switchView` | app.js:118 → lifecycle.js | three-setup.js:102 | View switch broken |
| `window.updateUrlState` | app.js:119 → lifecycle.js | cluster-filter.js:38/50, lifecycle.js:374/415/548/684, journey.js:1066 | URL state drift |
| `window.resetExperienceState` | app.js:120 → lifecycle.js | (internal) | Reset broken |
| `window.updateHasQuery` | app.js:126 → event-bindings.js | (internal) | Query indicator stale |
| `window.findClusterByKeyword` | app.js:127 | (internal) | Cluster search broken |
| `window.initAudio` | app.js:63 → audio-scape.js | (internal) | Audio init broken |
| `window.triggerCorridorBloom` | audio-scape.js:178 | three-setup.js:1559 | Bloom animation broken |
| `window.playAudio` | audio-scape.js:179 | (internal) | Audio playback broken |
| `window.triggerAudio` | audio-scape.js:180 | (internal) | Audio triggers broken |
| `window.applyClusterUiAccent` | app.js:112 | journey.js:1149/1162/1170/1325/1389 | Card accent broken |
| `window.initWeather` | app.js:105 → weather.js | (internal) | Weather init broken |
| `window.fetchWeather` | app.js:106 → weather.js | (internal) | Weather fetch broken |
| `window.applyWeatherEffects` | app.js:107 → weather.js | (internal) | Weather effects broken |
| `window.clearWeatherEffects` | app.js:108 → weather.js | (internal) | Weather clear broken |
| `window.search` | app.js:66 → search-state.js | (internal) | Search broken |
| `window.applyFilters` | app.js:67 → search-state.js | cluster-filter.js:37 | Filter broken |
| `window.clearSearchGlow` | app.js:71 → search-state.js | cluster-filter.js:36 | Glow not cleared |
| `window.clearShortSemanticSearchState` | app.js:74 → search-state.js | cluster-filter.js:30 | Search state leak |
| `window.__semanticSearchCacheProbe` | app.js:77 → search-state.js | (internal diagnostics) | — |
| `window.THREE` | inject-three.js:7, three-setup.js:2 | three-shim.js | WebGL broken |
| `window.init` | (not found in js/modules) | three-setup.js:354 guard | — |

---

## Semantic lane window bridges

| Bridge | Source | Exposed via | Called from |
|--------|--------|-------------|-------------|
| `window.semanticLaneReady` | semantic-lane.js (internal fetch only) | NOT exposed to window | — |
| `window.semanticLaneUiState` | lifecycle.js (setSemanticLaneUiState) | NOT found as window global | — |
| `window.probeSemanticLane` | lifecycle.js | NOT found as window global | — |

Semantic lane uses `getWindow()` / `getDocument()` guard pattern internally (lines 13-18), no raw `window.` references.

---

## Connection analysis globals

| Global | Assigned | Called from |
|--------|----------|-------------|
| `window.syncArrivalHandoffOverlay` | journey-webgl.js compatibility bridge retained | journey.js and thread-inspector.js dewindowed 2026-05-25; bridge remains for external/test callers |
| `window.disposeArrivalHandoffOverlay` | journey-webgl.js compatibility bridge retained | journey.js and thread-inspector.js dewindowed 2026-05-25; bridge remains for external/test callers |
| `window.syncInspectedStrandOverlay` | **Retired 2026-05-25** | journey.js imports `syncInspectedStrandOverlay` directly from thread-inspector.js; `window._ti` diagnostic namespace remains |
| `window.applyLocalNeighborhoodFocus` | journey.js:1006 guard only, NOT assigned | journey.js:1006 |
| `window.syncSemanticDiveUi` | Retired 2026-05-25 | Runtime source and reduced-motion test callers dewindowed; no compatibility bridge remains |
| `window.previewInsideNextThread` | NOT found | journey.js:651 |
| `window.updateJourneyCompass` | Dewindowed 2026-05-25 | Former guarded callers now use direct named imports/adapters |
| `window.getSelectedBusinessRoleLabel` | NOT found | journey.js:1421 |
| `window.revealSelectedBusinessCard` | NOT found | journey.js:1463 |
| `window.describeThreadLensForPoint` | NOT found | journey.js:1508 |
| `window.isFieldNodeFocusContext` | NOT found | journey.js:1461 |

---

## Test files that call window globals directly (not via page.evaluate)

| Test file | Globals called |
|----------|----------------|
| tests/3d-accessibility-fallback-performance.spec.js | `window.focusOnNode`, `window.state` |
| tests/3d-camera-orbit-resilience.spec.js | `window.state` |
| tests/3d-state-transition-integrity.spec.js | `window.state` |
| tests/3d-thread-orchestration-quality.spec.js | `window.focusOnNode`, `window.state` |
| tests/3d-touch-parity.spec.js | `window.state` |
| tests/3d-viewport-dpr-resilience.spec.js | `window.state` |
| tests/persistence-contract.mjs | `window[t].getItem` (dynamic) |

---

## Top 5 window/global dependencies to retire (ranked by blast radius)

1. **`window.state`** — The central state object. Any dewindowing must provide a stable module-level export. All 6 test files read it; 2 runtime files assign it. Risk of removing: total state desync across map, focus, and search.

2. **`window.focusOnNode`** — Primary navigation action. Runtime modules now use direct named imports; the app-level window bridge remains for Playwright/test compatibility during the transition. Risk of removing the bridge before test migration: focus navigation proof paths silently break.

3. **`window.syncFocusStage`** — Retired 2026-05-25. Runtime source callers use named imports and reduced-motion tests no longer exercise the compatibility bridge.

4. **`window.setSemanticDiveMode`** — lifecycle.js owns the authoritative implementation (lifecycle.js:2547).
   journey.js exports a backward-compatible delegating alias (journey.js:1082) that calls
   `window.setSemanticDiveMode`. app.js does NOT assign it directly — callers use the lifecycle
   window shim after init(). The apparent duplicate is an intentional layered alias:
   lifecycle.js (owner) + journey.js (delegating named export). See `bootstrap-window-export-contract.mjs`
   and `semantic-dive-active-owner-contract.mjs`.

5. **`window.getRouteLayerOrigin`** — Already a no-op guard (not assigned). Safe to formalize
   as a null-op rather than keep the guard pattern. Risk of removing: zero — it is already absent.

---

## Bootstrap alias rule (app.js compatibility layer)

app.js is the **compatibility / bootstrap export layer** — NOT an authoritative owner.
Its window assignments are thin re-exports of named imports from source modules.
Sensitive bridges (setMyceliumMode, setTrailDepth, applyStoryPrompt) are dual-layered:
app.js imports them from lifecycle.js and also lifecycle.js installs them to window.
This is intentional during the dewindowing transition.

See `tests/bootstrap-window-export-contract.mjs` for the formal contract.

---

## Completed patches

### search-state.js dewindowed (2026-05-21)
`search-state.js` now imports `focusOnNode` directly from `camera-controls.js` and calls it directly at two call sites (formerly lines 339-347 and 1206-1208). The `typeof window.focusOnNode === 'function'` guards were removed — the direct import is statically available. No cycle was introduced: `search-state.js` does not import from `lifecycle.js`, and `camera-controls.js` does not import from `search-state.js`. Bootstrap window bridge kept intact elsewhere.

### journey compass bridge dewindowed (2026-05-25)
`updateJourneyCompass`, `executeJourneyCompassAction`, and `getJourneyCompassState` are no longer exported onto `window` by `lifecycle.js`. Runtime callers use lifecycle named exports, direct controller imports, or the existing search lifecycle adapter. Playwright/browser tests that need journey compass behavior should use visible UI actions or module contracts instead of `window.updateJourneyCompass`.

---

## Proposed remaining patches

### focusOnNode — COMPLETED (2026-05-21)
All runtime callers (event-bindings.js, lifecycle.js, journey.js, journey-compass-controller.js, thread-inspector.js, search-state.js) now use direct named imports from camera-controls.js. app.js window bridge retained for test compatibility during transition.

### Rank 1 — `window.syncFocusStage` → named imports
**Status**: Completed 2026-05-25.
**Risk**: Low after reduced-motion setup migration.
**Former guarded call shape**:
```js
if (typeof window.syncFocusStage === 'function') window.syncFocusStage(point);
```
**Dewindowed approach**: Runtime source callers use named imports. `lifecycle.js` imports and re-exports `syncFocusStage`; `thread-inspector.js` imports it through lifecycle to avoid adding a new direct `thread-inspector -> journey.js` edge. The `journey.js` window compatibility shim is retired.
**Files**: lifecycle.js, thread-inspector.js
**Verification**: `rg -n "window\.syncFocusStage" js/modules tests` should show no runtime/test callers, except source-contract strings that assert absence.

### Rank 2 — `window.updateExplorationUi` → direct local call in lifecycle.js
**Risk**: Very low. `updateExplorationUi` is locally defined at lifecycle.js:311.
**Call sites** (lifecycle.js: 441, 456, 672):
```js
if (typeof window.updateExplorationUi === 'function') window.updateExplorationUi();
```
**Dewindowed approach**: Replace with direct `updateExplorationUi()` calls — function is already locally defined and exported.
**Files**: lifecycle.js (3 replacements)
**Verification**: `rg -n "window\.updateExplorationUi" js/modules/lifecycle.js` → expect 0 hits

### focusOnPoint — COMPLETED (2026-05-25)
`focusOnPoint` runtime callers migrated to direct named imports from `lifecycle.js`:
- **journey.js**: Added `focusOnPoint` to the lifecycle import and replaced the map-mode traversal window guard with a direct `focusOnPoint()` call.
- **map-state.js**: Added `focusOnPoint` to the lifecycle import and replaced the marker click window guard with a direct `focusOnPoint()` call.
- **thread-inspector.js**: Added `focusOnPoint` to the lifecycle import and removed the redundant local window wrapper.
- **lifecycle.js**: Removed the temporary `window.focusOnPoint = focusOnPoint` compatibility bridge after runtime callers were direct-imported.
- **Verification**: `rg -n "window\.focusOnPoint" js/modules` should show 0 hits.
