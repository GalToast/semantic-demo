# Semantic Explorer: JS → TypeScript + Svelte Migration Plan

> **Date:** 2026-06-05
> **Author:** Migration Architect
> **Status:** Historical reference — W11 arc is in progress (T1-T9 done, T10-T11 partially done). See `docs/w11-arc-closeout-2026-06-15.md` for current status and `docs/w11-t10-thinnability-strategy.md` for T10 scope.

**W11 progress (2026-06-15):**
- T1-T9: ALL DONE (state kernel, stores, camera, lifecycle, focus, search, journey subsystems)
- T10: render loop thinnability (state-touch footprint reduction) — prep done, waves ready
- T11: build:legacy retirement — data-worker port done (`70d0b5e`), build:legacy removed from package.json (`22d4833`), dist/bundle.js gitignored (`e9f9d49`)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Dependency Graph Analysis](#2-dependency-graph-analysis)
3. [State.js → Store Mapping](#3-statejs--store-mapping)
4. [Known Bugs & Phase Assignment](#4-known-bugs--phase-assignment)
5. [Coexistence Strategy](#5-coexistence-strategy)
6. [Phase 0: Foundation & Bridge](#6-phase-0-foundation--bridge)
7. [Phase 1: Leaf Modules (No Dependers)](#7-phase-1-leaf-modules-no-dependers)
8. [Phase 2: Rendering Core](#8-phase-2-rendering-core)
9. [Phase 3: Search & Filter Pipeline](#9-phase-3-search--filter-pipeline)
10. [Phase 4: Journey & Focus](#10-phase-4-journey--focus)
11. [Phase 5: Orchestration Layer](#11-phase-5-orchestration-layer)
12. [Phase 6: App Shell & Cleanup](#12-phase-6-app-shell--cleanup)
13. [CSS Migration Steps](#13-css-migration-steps)
14. [Verification Matrix](#14-verification-matrix)
15. [Risk Register](#15-risk-register)

---

## 1. Executive Summary

This plan migrates the semantic-explorer from plain JS/Three.js to TypeScript + Svelte 5 over 6 phases. Each phase is self-contained, assignable to a worker, and produces a runnable app at its boundary. The legacy engine continues to operate via an imperative bridge until fully replaced.

**Key principles:**
- **Leaves first, roots last.** Modules with no dependents migrate first; `app.js` and `lifecycle.js` migrate last.
- **Bridge coexistence.** `src/lib/engine/bridge.ts` delegates to legacy JS modules. Svelte components call the bridge; the bridge calls legacy code. No big-bang rewrite.
- **Bug fixes in transit.** Each known bug is assigned to the phase where its owning module migrates.
- **Stores are truth.** Once a store owns a state slice, legacy `state.js` writers must sync to the store (via bridge callbacks) until the legacy writer is replaced.

---

## 2. Dependency Graph Analysis

### Leaf Modules (no internal dependents — migrate first)

```
design-tokens.js          ← pure constants
config.js                 ← pure constants
utils/seeded-random.js    ← pure function
utils/math-easing.js      ← pure functions
utils/geo-data.js         ← pure functions (computeOverviewScatterOffsets, pointHasGeocode, calculateSignalScore)
utils/dom-formatters.js   ← pure functions (formatBusinessName)
utils/timer-utils.js      ← stateless timer cleanup
utils/ui-presentation.js  ← mixed (pure + state-dependent helpers)
diagnostic-adapter.js     ← thin logging adapter
resource-tracker.js       ← disposeObject3D
webgl-context.js          ← shared context object
environment.js            ← viewport/motion detection
```

### Mid-tier Modules (depend on leaves, depended on by facades)

```
focus-pocket-geometry.js   ← geometry math + seeded placement
focus-pocket-personality.js← personality variants
strand-continuity.js       ← timer-ID drop (ALREADY FIXED in TS)
search-tokenizer.js        ← text tokenization
search-mapper.js           ← result mapping
search-filter-core.js      ← filter logic
search-results-ui.js       ← result DOM rendering
search-panel-adapter.js    ← mobile search sheet
navigation-state.js        ← nav transition dispatch
filter-state.js            ← filter state ownership
cluster-filter.js          ← cluster filtering
legend-ui.js               ← legend panel state
ui-renderers.js            ← DOM renderers (legend, search rows, card)
```

### Facade / Orchestration Modules (depend on many, depended on by app.js)

```
camera-controls.js         ← facade over core/restore/choreography
camera-controls-core.js    ← focus transition & assist
camera-controls-restore.js ← auto-rotate & overview restore
camera-controls-choreography.js ← animation primitives

three-node-manager.js      ← instanced mesh, point creation
three-thread-manager.js    ← mycelium line geometry
three-interaction-visuals.js ← semantic lens, focus core, motes
three-search-animations.js ← hero moment, corridor glow

journey-thread-model.js    ← thread candidate derivation
journey-thread-settler.js  ← traversal, walk, settle flow
journey-neighborhood.js    ← bounded neighborhood manifest
journey-selected-card.js   ← selected card DOM hydration
journey-focus-ui.js        ← neighbor rail, traversal UI
journey-canvas-interaction.js ← canvas node picking
journey-canvas-hit-test.js ← raycaster hit testing
journey-canvas-hover.js    ← hover state
journey-canvas-node-picking.js ← raycaster node picking
journey-point-color.js     ← per-point color derivation
journey-text-helpers.js    ← microcopy truncation
journey-webgl.js           ← route trace, arrival handoff overlays
thread-inspector.js        ← thread inspection overlay

micro-demo-guards.js       ← eligibility guards
micro-demo-camera.js       ← camera snapshots
micro-demo-ui.js           ← veil, pill, toast DOM

semantic-lane.js           ← lane health probe
semantic-search-api-cache.js ← search result caching
semantic-threads.js        ← thread data loading
semantic-guide.js          ← semantic guide UI
semantic-dive-ui.js        ← dive mode subscriptions
```

### Root Modules (migrate last)

```
journey-compass-state.js   ← compass state reader
journey-compass-controller.js ← compass action executor
lifecycle.js               ← global state bridge, re-exports
app.js                     ← initialization orchestrator
```

---

## 3. State.js → Store Mapping

| `state.js` Slice | Svelte Store | Store File | Notes |
|---|---|---|---|
| `navState` (mode, focusedIndex, trailSeedIndex, trailNeighborIndices, trailCursor, walkHistoryIndices, threadCandidates, focusPocketIndices, focusPocketMeta, focusPocketRoleByIndex, currentPersonality, neighborhoodIndices) | `navState` | `src/lib/stores/navigation.ts` | Primary navigation truth. `dispatchNavTransition()` replaces stringly-typed lifecycle dispatch. |
| `searchRequestSequence`, `searchAnchorIndex`, `searchPreviewIndex`, `searchGlowIndices`, `searchGlowTopIndex`, `currentSearchSummary`, `searchFocusTransitionToken`, `semanticTrailCue` | `searchState` | `src/lib/stores/search.ts` | Search orchestration state. |
| `trailDepth`, `semanticDiveMode`, `focusTransitionMode`, `strandContinuityState`, `focusOrbitSlackState`, `inspectedThreadIndex`, `pinnedThreadIndex`, `threadInspectorPointerInside`, `inspectedStrandDiagnostics`, `arrivalHandoffDiagnostics` | `focusState` | `src/lib/stores/focus.ts` | Focus, thread inspection, and orbit slack. |
| `activeFilters`, `filterVersion`, `filterColorVersion`, `activeClusterFilter` | `filterState` | `src/lib/stores/filter.ts` | Filter pipeline truth. |
| `demoPhase` (implicit in micro-demo closure vars) | `demoState` | `src/lib/stores/demo.ts` | Demo state machine with timer-ID bug fix. |
| `autoRotate`, `autoRotateSuspended`, camera position/target | `cameraState` | `src/lib/stores/camera.ts` | Camera orbit and transition state. |
| `width`, `height`, `dpr`, `reducedMotion` | `viewport` | `src/lib/stores/viewport.ts` | Viewport dimensions and motion preference. |
| `myceliumMode`, `trailDepth`, `activeStoryPrompt` | (split across `navState` + `filterState`) | Multiple | Mode is nav; story prompt is filter. |

### State Properties That Stay in Legacy (Engine-Only)

These are Three.js scene objects that only the engine touches. They stay on `window.__semanticState` (or `webglContext`) until the engine itself is fully ported:

- `scene`, `camera`, `renderer`, `controls`
- `pointsMesh`, `pointsMaterial`, `nodeSporeMesh`, `nodeSporeHitMesh`, `nodeSporeMaterial`
- `myceliumGroup`, `myceliumCoreLines`, `myceliumWispyLines`, `myceliumBridgeLines`
- `semanticManifold`, `semanticLensGroup`, `semanticLensGlow`, `semanticLensSpokes`
- `focusCore`, `focusHalo`, `focusMotes`, `focusPetals`, `focusFilaments`
- `focusLens`, `anchorBloomLight`, `hoverHalo`
- `routeTraceLines`, `arrivalHandoffGroup`
- `rawPositionsBuffer`, `rawClustersBuffer`, `nodePositions`, `targetPositions`, `originalPositions`
- `pointBaseColors`, `pulsePhase`
- All timer IDs (searchTimeout, autoRotateResumeTimer, etc.)

The bridge reads/writes these via `window.__semanticState` during coexistence. Once the engine modules are ported to TS, these move to proper typed fields.

---

## 4. Known Bugs & Phase Assignment

| # | Severity | Module | Bug | Fix Phase | Fix Strategy |
|---|---|---|---|---|---|
| 1 | HIGH | `strand-continuity.js` | Timer-ID drop (whole-object replacement loses timeout IDs) | **Phase 0** | Already fixed in `src/lib/utils/strand-continuity.ts` — Map-based timer tracking. |
| 2 | HIGH | `three-interaction-visuals.js` | `micro-demo-node-highlight` and `micro-demo-name-pulse` listeners added at module scope, never removed | **Phase 2** | Move listeners to `onMount`/`onDestroy` in the Canvas component. Store handler refs for cleanup. |
| 3 | HIGH | `state.js` | Proxy bypass: direct property mutation on `_rawState` (e.g., `state.navState.focusedIndex = X` inside `navState` object) skips the Proxy `set` trap because it's a nested property set, not a top-level set | **Phase 5** | Replace with store `.update()` calls. During coexistence, add a `MutationTracker` that wraps `_rawState` in a deep proxy or uses `Object.freeze` on nested objects to surface bypass attempts in dev mode. |
| 4 | HIGH | `three-node-manager.js` | `createPoints()` calls `disposeNodeVisuals()` which disposes old meshes, but textures (`focusBeaconTexture`, `focusRingTexture`, `focusNextCueTexture`) created via `createSporeTexture`/`createFocusRingTexture`/`createFocusNextCueTexture` are assigned to `state` but never `.dispose()`d on re-init | **Phase 2** | Add texture disposal in `disposeNodeVisuals()`: `state.focusBeaconTexture?.dispose()`, `state.focusRingTexture?.dispose()`, `state.focusNextCueTexture?.dispose()` before nulling. |
| 5 | MEDIUM | `micro-demo.js` | `startMicroDemo()` has a retry loop (`_startRetryDeadline` + `_startRetryCount`) that can stack if `isAppReadyForDemo()` flips true/false rapidly; the `SESSION_STORAGE_KEY` guard check happens after the retry loop, so a race between `sessionStorage.setItem` and the retry can cause double-starts | **Phase 4** | Port to `demoState` store with atomic `transitionDemo()` guard. The store's `get(demoPhase)` check is synchronous and race-free. |
| 6 | MEDIUM | `journey-thread-settler.js` | Race between `walkThreadNeighbor` setting `strandContinuityState.phase = 'exploring'` and the setTimeout arrival callback — if user clicks fast, the old arrival callback fires after the new phase is set, resetting to `idle` prematurely | **Phase 4** | Use the fixed `StrandContinuityManager` from Phase 0. The `setTimer()` method clears the previous timer before setting a new one, preventing stale callbacks. |
| 7 | MEDIUM | `search-state.js` | `tokenizeSearchText()` edge case: Unicode combining characters (e.g., é = e + combining accent) are split into separate tokens, producing false matches | **Phase 3** | Port tokenizer to TS with `Intl.Segmenter` for grapheme-aware tokenization, falling back to simple split for environments without `Intl.Segmenter`. |
| 8 | HIGH (CSS) | `focus-dive.css` | Dead `.journey-chip` block (lines referencing `.journey-chip` selectors) that styles a removed DOM element, causing specificity interference with active journey chrome selectors | **Phase 4** | Delete dead block during CSS ownership audit. Verify no selectors in `journey_active.css` or `mobile_premium__focus-dive.css` reference `.journey-chip`. |
| 9 | HIGH (CSS) | `narrow.css` | Escape-hatch scope leak: `@media (max-width: 480px)` block contains a `.info-panel .search-result-item` rule that overrides search result hover styles on all viewports below 480px, not just the narrow escape-hatch context | **Phase 6** | Scope the rule under `.narrow-escape .info-panel .search-result-item` or move it to the mobile premium search chrome module. |

---

## 5. Coexistence Strategy

### The Bridge Pattern

```
┌─────────────────────────────────────────────────┐
│                  Svelte Layer                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Stores    │  │Components│  │ App.svelte   │  │
│  │ (truth)   │  │ (UI)     │  │ (orchestrate)│  │
│  └─────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│        │              │               │          │
│        │         ┌────┴───────────────┘          │
│        │         │  Engine Bridge                │
│        │         │  (src/lib/engine/bridge.ts)   │
│        │         │  - imperative calls only      │
│        │         │  - no reactive state          │
│        │         │  - lazy-loads legacy JS       │
│        │         └────────┬──────────────        │
└───────────────────────────┼─────────────────────┘
                            │ dynamic import()
┌───────────────────────────┼─────────────────────┐
│                  Legacy JS Layer                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ state.js  │  │ engine   │  │ modules      │  │
│  │ (fading)  │  │ (RAF)    │  │ (business)   │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└─────────────────────────────────────────────────┘
```

### Sync Contract

**Svelte → Legacy:** Bridge methods call legacy module functions directly (e.g., `bridge.focusNode(42)` → `_cameraControls.focusOnNode(42)`).

**Legacy → Svelte:** Legacy modules fire DOM CustomEvents (`semantic:nodePicked`, `semantic:loadingPhase`, etc.) or mutate `window.__semanticState`. The bridge listens to events and invokes `EngineCallbacks`, which update Svelte stores.

**Store ↔ state.js bidirectional sync:** During coexistence, a sync layer in `App.svelte` subscribes to store changes and writes to `window.__semanticState` for engine consumption. Conversely, the bridge's event callbacks write to stores when the engine changes state.

### When to Remove the Bridge

Each phase replaces one or more legacy modules with native TS/Svelte implementations. The bridge method for that module becomes a no-op or is removed. The final phase (Phase 6) removes the bridge entirely when `app.js` and `lifecycle.js` are fully ported.

---

## 6. Phase 0: Foundation & Bridge

**Goal:** Establish the coexistence infrastructure. App runs via legacy JS but the bridge and stores are wired.

**Duration estimate:** 1-2 days

### Files to Create/Modify

| File | Action | Description |
|---|---|---|
| `src/lib/engine/bridge.ts` | Modify | Wire event listeners, add missing methods (`applyFilters`, `switchView`, `inspectThread`, etc.) |
| `src/lib/stores/index.ts` | Create | Barrel export for all stores |
| `src/lib/stores/viewport.ts` | Verify | Ensure `initViewportListeners()` is called from `main.ts` |
| `src/main.ts` | Modify | Import and call legacy `init()` via bridge, or mount Svelte shell alongside legacy init |
| `src/App.svelte` | Modify | Add store ↔ state.js sync layer (subscribe to stores, write to `window.__semanticState`) |
| `src/lib/utils/strand-continuity.ts` | Verify | Confirm bug fix is complete and tested |
| `src/lib/css/z-layers.css` | Verify | Confirm CSS custom properties match `z-index.ts` values |

### Bug Fixes in This Phase

- **Bug #1 (strand-continuity timer-ID drop):** Already fixed. Verify with unit test that `StrandContinuityManager.setTimer()` clears previous timer before setting new one.

### Milestone Verification

```bash
npm run dev:svelte        # Svelte app mounts at localhost:5173
npm run build:svelte      # No TS errors
npm run check             # svelte-check passes
npm run test:unit         # strand-continuity tests pass
```

**Manual check:** Open browser. Svelte app mounts. Legacy engine initializes via bridge. Canvas renders 3D scene. Navigation store updates when nodes are clicked (check via React DevTools equivalent or console).

---

## 7. Phase 1: Leaf Modules (No Dependers)

**Goal:** Port all pure-function and utility modules to TypeScript. No behavioral changes.

**Duration estimate:** 1-2 days

### Files to Port

| Legacy JS File | New TS File | Description |
|---|---|---|
| `js/modules/design-tokens.js` | `src/lib/engine/design-tokens.ts` | Color palette, scene constants |
| `js/modules/config.js` | `src/lib/engine/config.ts` | Orbit/material/timing constants |
| `js/modules/utils/seeded-random.js` | `src/lib/utils/seeded-random.ts` | `seededUnit()` — GLSL-portable PRNG |
| `js/modules/utils/math-easing.js` | `src/lib/utils/math-easing.ts` | `easeInOutCubic`, `easeOutQuint` |
| `js/modules/utils/geo-data.js` | `src/lib/utils/geo-data.ts` | `computeOverviewScatterOffsets`, `pointHasGeocode`, `calculateSignalScore`, `normalizeCityForFilter` |
| `js/modules/utils/dom-formatters.js` | `src/lib/utils/dom-formatters.ts` | `formatBusinessName` |
| `js/modules/utils/timer-utils.js` | `src/lib/utils/timer-utils.ts` | `clearAllTimers` |
| `js/modules/utils/ui-presentation.js` | `src/lib/utils/ui-presentation.ts` | `isCompactSearchViewport`, `getThreadCategoryColor`, `describeCluster` |
| `js/modules/diagnostic-adapter.js` | `src/lib/utils/diagnostic-adapter.ts` | `debugWarn` |
| `js/modules/resource-tracker.js` | `src/lib/engine/resource-tracker.ts` | `disposeObject3D` |
| `js/modules/webgl-context.js` | `src/lib/engine/webgl-context.ts` | Shared WebGL context object |
| `js/modules/environment.js` | `src/lib/utils/environment.ts` | `prefersReducedMotion` |
| `js/modules/search-tokenizer.js` | `src/lib/search/tokenizer.ts` | Search tokenization (with Bug #7 fix) |
| `js/modules/focus-pocket-geometry.js` | `src/lib/focus/geometry.ts` | Constellation geometry, seeded placement |
| `js/modules/focus-pocket-personality.js` | `src/lib/focus/personality.ts` | Per-focus personality variants |

### Bug Fixes in This Phase

- **Bug #7 (search tokenizer Unicode edge case):** Port `tokenizeSearchText()` to use `Intl.Segmenter` for grapheme-aware tokenization. Add unit tests for Unicode combining characters (é, ñ, ü).

### Milestone Verification

```bash
npm run check             # All new TS files compile
npm run test:unit         # New unit tests for seeded-random, math-easing, geo-data, tokenizer
npm run build:svelte      # Bundle succeeds
```

**Manual check:** Legacy app still works (leaf modules are imported by both legacy JS and new TS). No behavioral changes visible.

---

## 8. Phase 2: Rendering Core

**Goal:** Port Three.js engine modules to TypeScript. Canvas component owns the engine lifecycle.

**Duration estimate:** 3-5 days

### Files to Port

| Legacy JS File | New TS File | Description |
|---|---|---|
| `js/modules/three-engine.js` | `src/lib/engine/three-engine.ts` | Scene, camera, renderer, RAF loop, WebGL context resilience |
| `js/modules/three-node-manager.js` | `src/lib/engine/node-manager.ts` | Instanced mesh, point creation, spore textures |
| `js/modules/three-thread-manager.js` | `src/lib/engine/thread-manager.ts` | Mycelium line geometry, opacity profiles |
| `js/modules/three-interaction-visuals.js` | `src/lib/engine/interaction-visuals.ts` | Semantic lens, focus core, motes, filaments, anchor bloom |
| `js/modules/three-search-animations.js` | `src/lib/engine/search-animations.ts` | Hero moment, corridor glow |
| `js/modules/mycelium-engine.js` | `src/lib/engine/mycelium-engine.ts` | Edge building (geometric + semantic) |
| `js/modules/scene-reveal.js` | `src/lib/engine/scene-reveal.ts` | Camera reveal animation |
| `js/modules/focus-anchor-indicator.js` | `src/lib/engine/focus-anchor-indicator.ts` | Size + ring + pulse indicator |
| `js/modules/journey-webgl.js` | `src/lib/engine/journey-webgl.ts` | Route trace, arrival handoff overlays |

### Component to Implement

| Component | Action | Description |
|---|---|---|
| `src/components/Canvas.svelte` | Implement | Owns engine bridge lifecycle (`onMount` → `bridge.init()`, `onDestroy` → `bridge.destroy()`). Wires `viewport` store to `bridge.resize()`. Handles WebGL fallback UI. |

### Bug Fixes in This Phase

- **Bug #2 (three-interaction-visuals un-cleaned listeners):** The `micro-demo-node-highlight` and `micro-demo-name-pulse` listeners at module scope (lines 566-605) are moved to the Canvas component's `onMount`/`onDestroy`. Handler refs are stored for targeted `removeEventListener`.

- **Bug #4 (three-node-manager texture leak):** In `disposeNodeVisuals()`, add disposal calls for `state.focusBeaconTexture`, `state.focusRingTexture`, `state.focusNextCueTexture` before nulling them. The TS port includes a `Disposable` interface that all GPU resources implement.

### Milestone Verification

```bash
npm run dev:svelte        # 3D scene renders in Svelte app
npm run check             # No TS errors in engine modules
npm run test:contract     # Scene atmosphere contract test passes
npm run qa:surface:desktop-idle  # Screenshot matches baseline
```

**Manual check:** Full 3D scene renders. Node spores visible. Mycelium threads visible. Search glow works. Focus pocket animation works. No console errors about leaked textures or listeners.

---

## 9. Phase 3: Search & Filter Pipeline

**Goal:** Port the search orchestration and filter pipeline to TypeScript with Svelte stores as truth.

**Duration estimate:** 2-3 days

### Files to Port

| Legacy JS File | New TS File | Description |
|---|---|---|
| `js/modules/search-state.js` | `src/lib/search/orchestration.ts` | Search pipeline, result rendering, glow activation |
| `js/modules/search-mapper.js` | `src/lib/search/mapper.ts` | Result mapping, service result extraction |
| `js/modules/search-filter-core.js` | `src/lib/search/filter-core.ts` | `applyFilters`, `getFilteredIndices`, `pointMatchesActiveFilters` |
| `js/modules/search-results-ui.js` | `src/lib/search/results-ui.ts` | Result DOM rendering, scramble animation |
| `js/modules/search-panel-adapter.js` | `src/lib/search/panel-adapter.ts` | Mobile search sheet toggle |
| `js/modules/semantic-search-api-cache.js` | `src/lib/search/api-cache.ts` | Search result caching |
| `js/modules/semantic-lane.js` | `src/lib/search/semantic-lane.ts` | Lane health probe and monitoring |
| `js/modules/filter-state.js` | `src/lib/stores/filter.ts` (already exists) | Extend with legacy sync |
| `js/modules/cluster-filter.js` | `src/lib/search/cluster-filter.ts` | Cluster list, city filter sync |
| `js/modules/legend-ui.js` | `src/lib/ui/legend.ts` | Legend panel state |
| `js/modules/ui-renderers.js` | `src/lib/ui/renderers.ts` | DOM renderers for legend, search rows, card chrome |

### Components to Implement

| Component | Action | Description |
|---|---|---|
| `src/components/SearchBar.svelte` | Implement | Binds to `searchState` store. Calls `bridge.focusSearchCorridor()` on result click. |
| `src/components/Filters.svelte` | Implement | Binds to `filterState` store. Calls `bridge.applyFilters()` on toggle. |
| `src/components/Legend.svelte` | Implement | Reads cluster data from engine. Syncs with filter store. |

### Bug Fixes in This Phase

- **Bug #7 (tokenizer Unicode):** Already fixed in Phase 1. Integration tests in this phase verify end-to-end search with Unicode queries.

### Milestone Verification

```bash
npm run dev:svelte        # Search works end-to-end
npm run check             # No TS errors
npm run test:unit         # Search tokenizer tests, filter logic tests
npm run qa:surface:search-chrome  # Search UI renders correctly
npm run qa:surface:filters        # Filter UI renders correctly
```

**Manual check:** Type a search query. Results appear. Click a result. Camera focuses on node. Filters toggle correctly. Cluster colors update. Legend reflects active filters.

---

## 10. Phase 4: Journey & Focus

**Goal:** Port the journey orchestration, focus pocket, thread inspection, and demo choreography.

**Duration estimate:** 3-5 days

### Files to Port

| Legacy JS File | New TS File | Description |
|---|---|---|
| `js/modules/journey-thread-model.js` | `src/lib/journey/thread-model.ts` | Thread candidate derivation |
| `js/modules/journey-thread-settler.js` | `src/lib/journey/thread-settler.ts` | Traversal, walk, settle flow |
| `js/modules/journey-neighborhood.js` | `src/lib/journey/neighborhood.ts` | Bounded neighborhood manifest |
| `js/modules/journey-selected-card.js` | `src/lib/journey/selected-card.ts` | Selected card DOM hydration |
| `js/modules/journey-focus-ui.js` | `src/lib/journey/focus-ui.ts` | Neighbor rail, traversal UI |
| `js/modules/journey-canvas-interaction.js` | `src/lib/journey/canvas-interaction.ts` | Canvas node picking orchestration |
| `js/modules/journey-canvas-hit-test.js` | `src/lib/journey/canvas-hit-test.ts` | Raycaster hit testing |
| `js/modules/journey-canvas-hover.js` | `src/lib/journey/canvas-hover.ts` | Hover state |
| `js/modules/journey-canvas-node-picking.js` | `src/lib/journey/canvas-node-picking.ts` | Raycaster node picking |
| `js/modules/journey-point-color.js` | `src/lib/journey/point-color.ts` | Per-point color derivation |
| `js/modules/journey-text-helpers.js` | `src/lib/journey/text-helpers.ts` | Microcopy truncation |
| `js/modules/thread-inspector.js` | `src/lib/journey/thread-inspector.ts` | Thread inspection overlay |
| `js/modules/focus-pocket.js` | `src/lib/focus/pocket.ts` | Focus pocket layout and breathing |
| `js/modules/micro-demo.js` | `src/lib/demo/choreography.ts` | Demo state machine |
| `js/modules/micro-demo-guards.js` | `src/lib/demo/guards.ts` | Eligibility guards |
| `js/modules/micro-demo-camera.js` | `src/lib/demo/camera.ts` | Camera snapshots |
| `js/modules/micro-demo-ui.js` | `src/lib/demo/ui.ts` | Veil, pill, toast DOM |
| `js/modules/strand-continuity.js` | (already ported in Phase 0) | — |

### Components to Implement

| Component | Action | Description |
|---|---|---|
| `src/components/JourneyChrome.svelte` | Implement | Breadcrumb, trail indicators. Binds to `journeyState`. |
| `src/components/FocusPocket.svelte` | Implement | Focus pocket card overlay. Binds to `focusState`. |
| `src/components/CompassRail.svelte` | Implement | Compass actions. Binds to `journeyState.compass`. |
| `src/components/ThreadInspector.svelte` | Implement | Thread inspection overlay. Binds to `focusState.threadInspector`. |
| `src/components/DemoChoreography.svelte` | Implement | Demo overlay (veil, pill, end toast). Binds to `demoState`. |

### Bug Fixes in This Phase

- **Bug #5 (micro-demo skip-guard race):** The ported `startDemo()` uses `get(demoPhase)` — a synchronous store read — to guard against double-starts. The retry loop is replaced by a `derived` readiness store that the demo subscribes to.

- **Bug #6 (journey-thread-settler race):** The ported `walkThreadNeighbor` uses the `StrandContinuityManager` from Phase 0. The manager's `setTimer()` clears the previous arrival callback before setting a new one, preventing stale-callback race conditions.

- **Bug #8 (focus-dive.css dead journey-chip block):** During CSS audit of `focus-pocket` and `journey-chrome` components, delete the dead `.journey-chip` block from `css/focus-dive.css`. Verify no selectors in `journey_active.css` or `mobile_premium__focus-dive.css` reference `.journey-chip`.

### Milestone Verification

```bash
npm run dev:svelte        # Journey, focus, demo all work
npm run check             # No TS errors
npm run test:microdemo    # Demo state machine tests pass
npm run test:contract     # Focus pocket motion contract tests
npm run qa:surface:mobile-idle     # Mobile idle state
npm run qa:surface:launch-focus    # Focus launch state
npm run qa:surface:focus-pocket    # Focus pocket state
npm run qa:surface:thread-inspector # Thread inspector state
npm run qa:surface:compass-rail    # Compass rail state
```

**Manual check:** Search → focus → trail walk → inside mode all work. Demo choreography runs on first visit. Thread inspection overlay appears on hover. Compass rail shows correct actions per phase.

---

## 11. Phase 5: Orchestration Layer

**Goal:** Port `lifecycle.js` and `journey-compass-state.js` / `journey-compass-controller.js` to TypeScript. Replace the legacy event bus with Svelte store subscriptions.

**Duration estimate:** 2-3 days

### Files to Port

| Legacy JS File | New TS File | Description |
|---|---|---|
| `js/modules/lifecycle.js` | `src/lib/orchestration/lifecycle.ts` | Global state bridge, re-exports, exploration state reset |
| `js/modules/journey-compass-state.js` | `src/lib/orchestration/compass-state.ts` | Compass state reader (phase derivation from stores) |
| `js/modules/journey-compass-controller.js` | `src/lib/orchestration/compass-controller.ts` | Compass action executor |
| `js/modules/event-bus.js` | `src/lib/orchestration/event-bus.ts` | Typed event bus (gradually replaced by store subscriptions) |
| `js/modules/navigation-state.js` | (absorbed into `src/lib/stores/navigation.ts`) | — |
| `js/modules/view-controller.js` | `src/lib/orchestration/view-controller.ts` | View switching (galaxy ↔ map) |
| `js/modules/url-state.js` | `src/lib/orchestration/url-state.ts` | URL state sync |
| `js/modules/loading-ui.js` | `src/lib/ui/loading.ts` | Loading overlay phase management |
| `js/modules/composition-state.js` | `src/lib/orchestration/composition.ts` | Panel surface composition |
| `js/modules/journey-lifecycle-adapter.js` | `src/lib/orchestration/journey-lifecycle-adapter.ts` | Adapter between journey and lifecycle |

### Bug Fixes in This Phase

- **Bug #3 (state.js Proxy bypass):** During the port of `lifecycle.js`, all direct `state.navState.focusedIndex = X` patterns are replaced with `navState.update(s => ({ ...s, focusedIndex: X }))`. A dev-mode `MutationTracker` is added to `_rawState` that wraps nested objects in `Proxy` to surface bypass attempts via `console.warn`. This tracker is removed in production builds.

### Milestone Verification

```bash
npm run dev:svelte        # Full app flow works
npm run check             # No TS errors
npm run test:contract     # DOM/layout contract tests pass
npm run qa:surface:all    # All visual surfaces match baselines
```

**Manual check:** URL state restoration works. View switching works. Loading overlay phases advance correctly. Panel surface composition updates reactively. No console warnings about Proxy bypass (in dev mode).

---

## 12. Phase 6: App Shell & Cleanup

**Goal:** Port `app.js` initialization to TypeScript. Remove the legacy JS entry point. Clean up bridge.

**Duration estimate:** 2-3 days

### Files to Port

| Legacy JS File | New TS File | Description |
|---|---|---|
| `js/modules/app.js` | `src/lib/orchestration/app-init.ts` | Application initialization orchestrator |
| `js/modules/event-bindings.js` | (absorbed into component event handlers) | DOM event listeners become Svelte `on:*` handlers |
| `js/modules/bindings/*.js` | (absorbed into component event handlers) | Per-surface bindings become component-level |

### Files to Remove/Deprecate

| File | Action |
|---|---|
| `js/state.js` | Deprecate. Stores are truth. Keep `_rawState` as a read-only snapshot for debugging. |
| `js/modules/app.js` | Replace with `src/main.ts` → `src/lib/orchestration/app-init.ts` |
| `src/lib/engine/bridge.ts` | Slim down to only engine-lifecycle methods (init, destroy, resize). Remove node/search/filter methods that are now native TS. |

### Bug Fixes in This Phase

- **Bug #9 (narrow.css escape-hatch scope leak):** Scope the `.info-panel .search-result-item` rule under `.narrow-escape` or move it to the mobile premium search chrome module. Verify with `npm run qa:surface:mobile-idle`.

### CSS Migration

- Audit all CSS modules for dead rules and specificity conflicts.
- Remove `!important` declarations documented in `docs/semantic-demo-css-ownership-next-pass.md` where the owning module is now a Svelte component with scoped styles.
- Verify `css/mobile_premium__*.css` files are no longer needed (replaced by component-scoped styles).

### Milestone Verification

```bash
npm run dev:svelte        # App initializes from TS entry point
npm run build:svelte      # Production build succeeds
npm run check             # Zero TS errors
npm run lint              # Zero ESLint warnings
npm run test:contract     # All contract tests pass
npm run qa:surface:all    # All visual surfaces match baselines
npm run test:unit         # All unit tests pass
```

**Manual check:** App loads from `src/main.ts`. No legacy `app.js` is imported. All features work. No console errors. No memory leaks (check via Chrome DevTools memory snapshot). Bundle size is reasonable.

---

## 13. CSS Migration Steps

### Phase-by-Phase CSS Ownership

| Phase | CSS Action | Files |
|---|---|---|
| **Phase 0** | Verify `z-layers.css` custom properties match `z-index.ts`. No changes. | `src/lib/css/z-layers.css` |
| **Phase 1** | No CSS changes. | — |
| **Phase 2** | Canvas component gets scoped styles for WebGL fallback notice. Verify `layout_base.css` info-panel positioning works with Svelte-rendered DOM. | `src/components/Canvas.svelte` `<style>` |
| **Phase 3** | SearchBar, Filters, Legend components get scoped styles. Verify mobile premium search chrome. | `src/components/SearchBar.svelte`, `Filters.svelte`, `Legend.svelte` |
| **Phase 4** | JourneyChrome, FocusPocket, CompassRail, ThreadInspector, DemoChoreography get scoped styles. **Delete dead `.journey-chip` block from `focus-dive.css`** (Bug #8). | `src/components/JourneyChrome.svelte`, etc. |
| **Phase 5** | Loading overlay and composition state styles. | `src/components/LoadingOverlay.svelte` |
| **Phase 6** | **Fix narrow.css escape-hatch scope leak** (Bug #9). Final CSS audit. Remove orphaned `!important` rules. Verify all `data-*` attribute selectors still work during coexistence. | `css/narrow.css`, various |

### CSS Coexistence Rules

1. **Body `data-*` attributes** are synced from stores via `$effect()` blocks in `App.svelte`. Legacy CSS that reads `body[data-journey-phase="focus"]` continues to work.
2. **Scoped component styles** take precedence over global CSS for elements inside that component.
3. **No new `!important` rules.** If a component style is overridden by global CSS, resolve via specificity or CSS layers.
4. **Mobile premium CSS** (`css/mobile_premium__*.css`) is the last global CSS to migrate. It stays loaded via `index.html` until all components have scoped mobile styles.

---

## 14. Verification Matrix

### Per-Phase Verification Checklist

| Check | P0 | P1 | P2 | P3 | P4 | P5 | P6 |
|---|---|---|---|---|---|---|---|
| `npm run check` (TS compile) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `npm run build:svelte` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `npm run test:unit` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `npm run test:contract` | — | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| `npm run test:microdemo` | — | — | — | — | ✅ | ✅ | ✅ |
| `npm run qa:surface:all` | — | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manual: 3D scene renders | — | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manual: Search works | — | — | — | ✅ | ✅ | ✅ | ✅ |
| Manual: Focus/trail works | — | — | — | — | ✅ | ✅ | ✅ |
| Manual: Demo runs | — | — | — | — | ✅ | ✅ | ✅ |
| Manual: URL state sync | — | — | — | — | — | ✅ | ✅ |
| Manual: No console errors | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Memory leak check | — | — | ✅ | — | ✅ | — | ✅ |

### Named Surface Tests (Playwright)

Run after each phase that touches the relevant surface:

```bash
npm run qa:surface:mobile-idle        # P2+
npm run qa:surface:desktop-idle       # P2+
npm run qa:surface:launch-focus       # P4+
npm run qa:surface:search-chrome      # P3+
npm run qa:surface:focus-pocket       # P4+
npm run qa:surface:thread-inspector   # P4+
npm run qa:surface:compass-rail       # P4+
npm run qa:surface:loading-overlay    # P5+
npm run qa:surface:mode-grid          # P3+
npm run qa:surface:filters            # P3+
npm run qa:surface:controls           # P2+
npm run qa:surface:info-panel-populated  # P3+
npm run qa:surface:global-spacing     # P6
```

---

## 15. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **Bridge latency** — dynamic imports of legacy modules add startup delay | Medium | Low | Bridge lazy-loads modules in parallel. Legacy `app.js` init is already async. |
| **Store ↔ state.js desync** — legacy writers mutate `_rawState` without syncing to stores | High | High | Dev-mode `MutationTracker` (Phase 5) surfaces bypass. Bridge event callbacks keep stores in sync during coexistence. |
| **Three.js type conflicts** — legacy JS passes untyped objects that don't match TS interfaces | Medium | Medium | Bridge uses `as any` casts at the boundary. Gradually tighten as engine modules are ported. |
| **CSS specificity wars** — scoped component styles vs. global CSS modules | Medium | Medium | Follow CSS ownership map. Use `:global()` sparingly. Phase 6 final audit. |
| **Test flakiness** — Playwright screenshot tests sensitive to animation timing | Medium | High | Use `--headed` mode. Add `waitForTimeout` for animation settle. Baseline screenshots per phase. |
| **Worker coordination** — parallel phases touching overlapping files | High | Medium | Strict file ownership per phase. Cross-seam findings go to main lane. No opportunistic edits. |

---

## Appendix A: File Ownership by Phase

### Phase 0 (Foundation)
- `src/lib/engine/bridge.ts`
- `src/lib/stores/index.ts`
- `src/main.ts`
- `src/App.svelte`
- `src/lib/utils/strand-continuity.ts`

### Phase 1 (Leaves)
- `src/lib/engine/design-tokens.ts`
- `src/lib/engine/config.ts`
- `src/lib/utils/seeded-random.ts`
- `src/lib/utils/math-easing.ts`
- `src/lib/utils/geo-data.ts`
- `src/lib/utils/dom-formatters.ts`
- `src/lib/utils/timer-utils.ts`
- `src/lib/utils/ui-presentation.ts`
- `src/lib/utils/diagnostic-adapter.ts`
- `src/lib/engine/resource-tracker.ts`
- `src/lib/engine/webgl-context.ts`
- `src/lib/utils/environment.ts`
- `src/lib/search/tokenizer.ts`
- `src/lib/focus/geometry.ts`
- `src/lib/focus/personality.ts`

### Phase 2 (Rendering)
- `src/lib/engine/three-engine.ts`
- `src/lib/engine/node-manager.ts`
- `src/lib/engine/thread-manager.ts`
- `src/lib/engine/interaction-visuals.ts`
- `src/lib/engine/search-animations.ts`
- `src/lib/engine/mycelium-engine.ts`
- `src/lib/engine/scene-reveal.ts`
- `src/lib/engine/focus-anchor-indicator.ts`
- `src/lib/engine/journey-webgl.ts`
- `src/components/Canvas.svelte`

### Phase 3 (Search/Filter)
- `src/lib/search/orchestration.ts`
- `src/lib/search/mapper.ts`
- `src/lib/search/filter-core.ts`
- `src/lib/search/results-ui.ts`
- `src/lib/search/panel-adapter.ts`
- `src/lib/search/api-cache.ts`
- `src/lib/search/semantic-lane.ts`
- `src/lib/search/cluster-filter.ts`
- `src/lib/ui/legend.ts`
- `src/lib/ui/renderers.ts`
- `src/components/SearchBar.svelte`
- `src/components/Filters.svelte`
- `src/components/Legend.svelte`
- `src/components/ModeChips.svelte`

### Phase 4 (Journey/Focus)
- `src/lib/journey/thread-model.ts`
- `src/lib/journey/thread-settler.ts`
- `src/lib/journey/neighborhood.ts`
- `src/lib/journey/selected-card.ts`
- `src/lib/journey/focus-ui.ts`
- `src/lib/journey/canvas-interaction.ts`
- `src/lib/journey/canvas-hit-test.ts`
- `src/lib/journey/canvas-hover.ts`
- `src/lib/journey/canvas-node-picking.ts`
- `src/lib/journey/point-color.ts`
- `src/lib/journey/text-helpers.ts`
- `src/lib/journey/thread-inspector.ts`
- `src/lib/focus/pocket.ts`
- `src/lib/demo/choreography.ts`
- `src/lib/demo/guards.ts`
- `src/lib/demo/camera.ts`
- `src/lib/demo/ui.ts`
- `src/components/JourneyChrome.svelte`
- `src/components/FocusPocket.svelte`
- `src/components/CompassRail.svelte`
- `src/components/ThreadInspector.svelte`
- `src/components/DemoChoreography.svelte`
- `src/components/Controls.svelte`

### Phase 5 (Orchestration)
- `src/lib/orchestration/lifecycle.ts`
- `src/lib/orchestration/compass-state.ts`
- `src/lib/orchestration/compass-controller.ts`
- `src/lib/orchestration/event-bus.ts`
- `src/lib/orchestration/view-controller.ts`
- `src/lib/orchestration/url-state.ts`
- `src/lib/orchestration/composition.ts`
- `src/lib/orchestration/journey-lifecycle-adapter.ts`
- `src/lib/ui/loading.ts`

### Phase 6 (App Shell)
- `src/lib/orchestration/app-init.ts`
- `src/main.ts` (final form)
- `src/App.svelte` (final form)
- `src/lib/engine/bridge.ts` (slim final form)
- All component `<style>` blocks (CSS audit)
- `css/narrow.css` (Bug #9 fix)

---

## Appendix B: Worker Prompt Template

Each phase is assignable to a worker subagent. Use this prompt template:

```
You are a migration worker for the semantic-explorer project.

## Your Phase
Phase N: [Phase Name]

## Scope
[List of files to port/modify from the ownership table]

## Rules
1. Stay inside your assigned file list. Do not edit files owned by other phases.
2. Each new TS file must compile with `npm run check`.
3. Each ported module must maintain the same public API as its JS predecessor.
4. Bug fixes assigned to this phase must be included.
5. Run `npm run test:unit` after each file port. Fix failures before moving on.
6. Cross-seam findings: document with path + line range, return to main lane.

## Verification
After completing all files:
- Run `npm run check && npm run build:svelte && npm run test:unit`
- Run `[phase-specific QA commands from verification matrix]`
- Report: changed files, bug fixes applied, any risks or blockers.
```
