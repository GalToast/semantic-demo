# Phase 5 & 6 Execution Plan: Orchestration Finalization & Bridge Elimination

> **Date:** 2026-06-10
> **Author:** Migration Planning Worker
> **Status:** Ready for execution
> **Baseline:** 21/21 Svelte components, 12/12 orchestration files, 72/72 contract tests, 0 TS errors

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Assessment](#2-current-state-assessment)
3. [The Bridge Elimination Problem](#3-the-bridge-elimination-problem)
4. [Dependency Graph](#4-dependency-graph)
5. [Phase 5A: Engine Module TS Ports](#5-phase-5a-engine-module-ts-ports)
6. [Phase 5B: Legacy Cleanup](#6-phase-5b-legacy-cleanup)
7. [Phase 6A: Bridge Slim-Down](#7-phase-6a-bridge-slim-down)
8. [Phase 6B: Bridge Elimination & Final Cleanup](#8-phase-6b-bridge-elimination--final-cleanup)
9. [Risk Register](#9-risk-register)
10. [Verification Matrix](#10-verification-matrix)
11. [Effort Estimates](#11-effort-estimates)
12. [Worker Assignment Template](#12-worker-assignment-template)

---

## 1. Executive Summary

The original migration plan's Phase 5 ("Orchestration Layer") and Phase 6 ("App Shell & Cleanup") are **partially complete** — the orchestration TS files, Svelte stores, components, and the typed event bus all exist and work. However, the **bridge is still the central coupling point** between the Svelte layer and the legacy Three.js engine.

The real remaining work is **eliminating the bridge dependency** by porting the 6 legacy engine modules it dynamically imports into native TypeScript, then removing the bridge entirely.

### What's Done
- ✅ 12/12 orchestration TS files exist and are functional
- ✅ 21/21 Svelte components are complete
- ✅ 12/12 stores (including `.svelte.ts` rune variants)
- ✅ 4/4 type files (business, state, webgl, events)
- ✅ Typed event bus (`src/lib/orchestration/event-bus.ts`)
- ✅ Parity attribute layer (`src/lib/orchestration/parity-attrs.ts`)
- ✅ Triggers module (`src/lib/orchestration/triggers.ts`)
- ✅ App init orchestration (`src/lib/orchestration/app-init.ts`)
- ✅ Main entry point (`src/main.ts`) and App shell (`src/App.svelte`)
- ✅ Loading overlay (`src/lib/ui/loading.ts`)
- ✅ URL state sync (`src/lib/orchestration/url-state.ts`)

### What Remains
- ❌ Bridge still dynamically imports 6 legacy JS modules at runtime
- ❌ `js/state.ts` (1156 lines) is the global state singleton still referenced by the engine
- ❌ 13 binding modules in `js/modules/bindings/` still wired via legacy `event-bindings.ts`
- ❌ `js/modules/composition-state.ts` duplicates logic now in `src/lib/stores/lifecycle.ts`
- ❌ CSS coexistence: `css/narrow.css` scope leak (Bug #9), orphaned `!important` rules
- ❌ No final bridge removal or legacy module deprecation

---

## 2. Current State Assessment

### 2.1 Orchestration Layer (Phase 5 Original Scope)

| Target | Status | Notes |
|---|---|---|
| `lifecycle.ts` | ✅ **Complete** | 425 lines. Replaces lifecycle.js. Writes to stores. Many no-op stubs for legacy bridge compat. |
| `compass-state.ts` | ✅ **Complete** | 288 lines. Pure derivation from stores. No legacy imports. |
| `compass-controller.ts` | ✅ **Complete** | 515 lines. DOM manipulation + store reads. Direct DOM writes for compass elements. |
| `event-bus.ts` | ✅ **Complete** | 195 lines. Typed pub/sub. Clean, no legacy deps. |
| `view-controller.ts` | ✅ **Complete** | 297 lines. Galaxy ↔ map switching. Direct DOM manipulation. |
| `url-state.ts` | ✅ **Complete** | 456 lines. URL state sync. Clean, no legacy deps. |
| `cluster-filter-controller.ts` | ✅ **Complete** | 323 lines. Cluster filtering, city filter, story prompts. |
| `parity-attrs.ts` | ✅ **Complete** | 419 lines. Body data-* attribute parity layer. |
| `triggers.ts` | ✅ **Complete** | 157 lines. Event subscriptions bridging search → compass. |
| `search-filter-core.ts` | ✅ **Complete** | Exists in orchestration directory. |
| `app-init.ts` | ✅ **Complete** | 261 lines. App initialization orchestrator. |
| `loading.ts` (in ui/) | ✅ **Complete** | 236 lines. Loading overlay phase management. |

**Phase 5 orchestration: 100% complete.** All target files exist and are functional.

### 2.2 App Shell (Phase 6 Original Scope)

| Target | Status | Notes |
|---|---|---|
| `src/main.ts` | ✅ **Complete** | 47 lines. Clean Svelte 5 mount. |
| `src/App.svelte` | ✅ **Complete** | 246 lines. Composes all 21 components. |
| Bridge slim-down | ❌ **Not started** | Bridge still has full adapter set (camera, search, lifecycle, data). |

### 2.3 Bridge Adapter State

The bridge (`src/lib/engine/bridge.ts`) is a thin re-export of `src/lib/engine/adapters/core.ts`, which composes 4 adapters:

| Adapter | File | Lines | Dynamic Legacy Imports |
|---|---|---|---|
| **lifecycle** | `lifecycle-bridge.ts` | 543 | `three-engine.js`, `camera-controls.js`, `three-node-manager.js`, `three-thread-manager.js`, `view-controller.js`, `filter-state.js`, `state.js`, `event-bus.js`, `journey-canvas-interaction.js` |
| **camera** | `camera-bridge.ts` | 105 | None (delegates to lifecycle's module refs) |
| **search** | `search-bridge.ts` | 151 | None (delegates to camera module refs) |
| **data** | `data-bridge.ts` | 103 | None (reads Svelte stores) |

**The lifecycle adapter is the bottleneck.** It dynamically imports 9 legacy JS modules during `init()` and stores their references on the shared `BridgeContext`. All other adapters read from these stored references.

### 2.4 Legacy Module Inventory

**Still imported by the bridge (must port to eliminate bridge):**

| Legacy Module | Lines | Complexity | Bridge Method |
|---|---|---|---|
| `three-engine.js` (→ `.ts`) | ~800 | HIGH | `init()`, `destroy()`, `animate()` |
| `camera-controls.js` | ~600 | HIGH | `focusNode()`, `settleToOverview()`, `setAutoRotate()`, `zoomCamera()` |
| `three-node-manager.js` | ~500 | MEDIUM | `createPoints()`, `disposeNodeVisuals()` |
| `three-thread-manager.js` | ~400 | MEDIUM | `createMycelium()`, `disposeMycelium()` |
| `filter-state.js` | ~200 | LOW | `overwriteActiveFilters()`, `getActiveFilters()` |
| `view-controller.js` | ~300 | LOW | `switchView()` |
| `event-bus.js` | ~150 | LOW | `subscribe()`, `EVENTS` (legacy bus for engine events) |
| `journey-canvas-interaction.js` | ~300 | MEDIUM | `ensureCanvasNodeInteractionBindings()` |
| `state.js` | ~1156 | HIGH | Global state singleton |

**Still exist but NOT imported by bridge (cleanup targets):**

| Legacy Module | Lines | Status |
|---|---|---|
| `event-bindings.ts` + `bindings/*.ts` (13 files) | ~2000 total | Wired by legacy `app.ts`, not by Svelte. Cleanup target. |
| `composition-state.ts` | 241 | Duplicated by `src/lib/stores/lifecycle.ts`. Cleanup target. |
| `lifecycle-modes.ts`, `lifecycle-reset.ts`, `lifecycle-search-sync.ts` | ~600 total | Absorbed into `src/lib/stores/lifecycle.ts`. Cleanup target. |
| `app.ts` | ~400 | Replaced by `src/lib/orchestration/app-init.ts`. Cleanup target. |
| `navigation-state.ts` | ~300 | Absorbed into `src/lib/stores/navigation.ts`. Cleanup target. |
| `micro-demo*.ts` (4 files) | ~800 total | Absorbed into `src/lib/demo/`. Cleanup target. |
| `journey-compass-state.ts`, `journey-compass-controller.ts` | ~600 total | Ported to orchestration. Cleanup target. |

---

## 3. The Bridge Elimination Problem

### Why the Bridge Exists

The bridge exists because the Three.js engine is still plain JavaScript that runs imperatively. The Svelte layer needs to call into it for:
1. **Camera focus** (`focusNode(index)`) — node selection, search corridor fly-to
2. **Search glow** (`setSearchResults(indices)`) — highlight matching nodes
3. **View switching** (`switchView('map')`) — galaxy ↔ map transitions
4. **Filter application** (`applyFilters(filters)`) — filter the 3D scene
5. **Engine lifecycle** (`init(canvas)`, `destroy()`, `resize(w,h)`)
6. **Thread inspection** (`inspectThread(index)`) — mycelium line highlighting
7. **Diagnostics** (`getDiagnostics()`, `getNodeCount()`)

### The Elimination Strategy

The bridge can only be eliminated when the Svelte layer can perform all these operations **directly** via TypeScript modules that own the Three.js scene. This requires:

1. **Port the 6 engine modules to TypeScript** (Phase 5A)
2. **Move engine lifecycle into the Canvas component** (Phase 6A)
3. **Remove bridge adapter imports** (Phase 6B)
4. **Delete bridge and legacy module references** (Phase 6B)

### Parallel Path: Legacy Shell Coexistence

The legacy production shell (`vector-explorer-polished.html`) loads the legacy JS entry point (`js/modules/app.ts`). Until the Svelte shell is the **sole** entry point, the legacy modules must remain importable. The bridge adapters serve as the compatibility layer.

**Decision Point:** Phase 6B requires choosing one of:
- **Option A:** Deprecate legacy shell entirely (delete `vector-explorer-polished.html`, `js/modules/app.ts`, `js/modules/event-bindings.ts`)
- **Option B:** Keep legacy shell as fallback, slim bridge to engine-only methods

**Recommendation:** Option A (full deprecation) — the Svelte shell is feature-complete and the legacy shell adds maintenance burden with no user-facing benefit.

---

## 4. Dependency Graph

```
                    ┌─────────────────────────────┐
                    │    Phase 5A: TS Engine Ports  │
                    │                               │
                    │  three-engine.ts ← (root)     │
                    │       ↑                       │
                    │  three-node-manager.ts         │
                    │  three-thread-manager.ts       │
                    │       ↑                       │
                    │  camera-controls.ts            │
                    │  camera-controls-core.ts       │
                    │  camera-controls-restore.ts    │
                    │  camera-controls-choreography.ts│
                    │       ↑                       │
                    │  filter-state.ts (TS)          │
                    │  journey-canvas-interaction.ts │
                    │       ↑                       │
                    │  event-bus.ts (TS, legacy)     │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │  Phase 5B: Legacy Cleanup      │
                    │  Delete: app.ts, event-bindings│
                    │  Delete: composition-state.ts  │
                    │  Delete: lifecycle-*.ts         │
                    │  Delete: navigation-state.ts   │
                    │  Delete: journey-compass-*.ts   │
                    │  Delete: micro-demo*.ts         │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │  Phase 6A: Bridge Slim-Down    │
                    │  Canvas owns engine lifecycle   │
                    │  Remove camera/search adapters  │
                    │  Remove data adapter            │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │  Phase 6B: Bridge Elimination  │
                    │  Remove lifecycle adapter       │
                    │  Delete bridge.ts               │
                    │  Delete adapters/               │
                    │  Delete js/state.ts             │
                    │  CSS final audit                │
                    └───────────────────────────────┘
```

---

## 5. Phase 5A: Engine Module TS Ports

**Goal:** Port the 6 legacy engine modules that the bridge dynamically imports to TypeScript. Each port maintains the same public API but uses typed imports, proper disposal, and Svelte store integration.

**Duration estimate:** 5-8 days (complex Three.js modules)

**Ordering:** Bottom-up by dependency depth.

### Task 5A-1: `three-engine.ts` (Root Engine)

| Property | Value |
|---|---|
| **Legacy source** | `js/modules/three-engine.ts` (~800 lines) |
| **Target** | `src/lib/engine/three-engine.ts` (already exists as `.ts` shadow) |
| **Dependencies** | `config.ts`, `design-tokens.ts`, `resource-tracker.ts`, `webgl-context.ts` |
| **Dependents** | `camera-controls.ts`, `three-node-manager.ts`, `three-thread-manager.ts` |
| **Effort** | 2 days |
| **Risk** | HIGH — WebGL context management, RAF loop, renderer lifecycle |

**What to port:**
- `initThreeJS()` — scene, camera, renderer, controls setup
- `deinit()` — renderer disposal, RAF cancellation
- `animate()` — the render loop
- `onWindowResize()` — viewport updates
- `getSceneRenderableDiagnostics()` — FPS, draw calls, memory
- WebGL context loss/restore handlers

**Verification:**
```bash
npm run check && npm run build:svelte && npm run test:contract
npm run qa:surface:desktop-idle && npm run qa:surface:mobile-idle
```

### Task 5A-2: `camera-controls.ts` (+ sub-modules)

| Property | Value |
|---|---|
| **Legacy sources** | `camera-controls.ts`, `camera-controls-core.ts`, `camera-controls-restore.ts`, `camera-controls-choreography*.ts`, `camera-framing-utils.ts`, `camera-orbit-slack.ts` |
| **Target** | `src/lib/engine/camera-controls.ts` + sub-modules |
| **Dependencies** | `three-engine.ts`, `seeded-random.ts`, `math-easing.ts` |
| **Dependents** | `camera-bridge.ts` adapter |
| **Effort** | 2-3 days |
| **Risk** | MEDIUM — animation timing, easing functions, auto-rotate sync |

**What to port:**
- `focusOnNode(index, options)` — camera fly-to with choreography
- `animateCameraToSearchCorridor()` — corridor animation
- `settleCameraToOverviewPose()` — overview return
- `zoomCamera(multiplier)` — zoom control
- `setAutoRotateSuspended()` / `syncOrbitAutoRotate()` — orbit management
- Camera orbit slack state machine

**Verification:**
```bash
npm run check && npm run build:svelte
npm run qa:surface:launch-focus && npm run qa:surface:focus-pocket
```

### Task 5A-3: `three-node-manager.ts`

| Property | Value |
|---|---|
| **Legacy source** | `js/modules/three-node-manager.ts` (~500 lines) |
| **Target** | `src/lib/engine/node-manager.ts` |
| **Dependencies** | `three-engine.ts`, `config.ts`, `design-tokens.ts`, `focus-pocket-geometry.ts` |
| **Dependents** | `camera-controls.ts`, `journey-canvas-interaction.ts` |
| **Effort** | 1-2 days |
| **Risk** | MEDIUM — instanced mesh lifecycle, texture disposal (Bug #4) |

**What to port:**
- `createPoints()` — instanced mesh creation
- `setNodeSporeInstanceMatrix()` — per-node visual updates
- `disposeNodeVisuals()` — GPU resource cleanup (including Bug #4 texture leak fix)
- `compilePointMaterialForReadiness()` — shader compilation

### Task 5A-4: `three-thread-manager.ts`

| Property | Value |
|---|---|
| **Legacy source** | `js/modules/three-thread-manager.ts` (~400 lines) |
| **Target** | `src/lib/engine/thread-manager.ts` |
| **Dependencies** | `three-engine.ts`, `config.ts`, `relationship-roles.ts` |
| **Dependents** | `thread-inspector.ts`, `journey-webgl.ts` |
| **Effort** | 1 day |
| **Risk** | MEDIUM — mycelium line geometry, opacity profiles |

**What to port:**
- `createMycelium()` / `disposeMycelium()` — line geometry lifecycle
- `getThreadPulseOpacity()` / `getThreadOpacityEnvelope()` — opacity calculations
- `getMyceliumPresentationProfile()` — presentation state
- `getGroupLineSegmentCount()` — diagnostics

### Task 5A-5: `filter-state.ts` (TS Native)

| Property | Value |
|---|---|
| **Legacy source** | `js/modules/filter-state.ts` (~200 lines) |
| **Target** | Already exists at `src/lib/stores/filter.ts` + `filter.svelte.ts` |
| **Dependencies** | `navigation.ts`, `search.ts` stores |
| **Dependents** | `cluster-filter-controller.ts`, `url-state.ts` |
| **Effort** | 0.5 days (verification + cleanup) |
| **Risk** | LOW — store is already the source of truth |

**What to do:** Verify the Svelte filter store fully replaces the legacy filter-state module. Remove any remaining legacy `overwriteActiveFilters` bridge calls.

### Task 5A-6: `journey-canvas-interaction.ts`

| Property | Value |
|---|---|
| **Legacy source** | `js/modules/journey-canvas-interaction.ts` (~300 lines) |
| **Target** | Already exists at `src/lib/journey/canvas-interaction.ts` |
| **Dependencies** | `canvas-hit-test.ts`, `canvas-hover.ts`, `canvas-node-picking.ts` |
| **Dependents** | `lifecycle-bridge.ts` init step 7 |
| **Effort** | 0.5 days (verification + bridge adapter update) |
| **Risk** | LOW — already ported, just needs bridge adapter to use TS version |

### Task 5A-7: Legacy `event-bus.ts` Replacement

| Property | Value |
|---|---|
| **Legacy source** | `js/modules/event-bus.ts` (~150 lines) |
| **Target** | Already exists at `src/lib/orchestration/event-bus.ts` |
| **Dependencies** | None |
| **Dependents** | `lifecycle-bridge.ts` event bridge subscription |
| **Effort** | 0.5 days (adapter update) |
| **Risk** | LOW — the TS event bus is already in use by all orchestration modules |

**What to do:** Update `lifecycle-bridge.ts` `bindEventBridge()` to import from `@lib/orchestration/event-bus` instead of `@legacy/modules/event-bus.js`.

### Task 5A-8: `state.js` → Read-Only Snapshot

| Property | Value |
|---|---|
| **Legacy source** | `js/state.ts` (1156 lines) |
| **Target** | Deprecate — keep as read-only snapshot for engine compat |
| **Dependencies** | Everything |
| **Dependents** | All bridge adapters |
| **Effort** | 1 day |
| **Risk** | HIGH — central state container; Bug #3 (Proxy bypass) |

**Strategy:** Do NOT port `state.ts` to the Svelte layer. Instead:
1. Keep `js/state.ts` as-is for engine consumption
2. The Svelte stores are the source of truth for UI state
3. The `data-bridge.ts` adapter syncs Svelte stores → `state.ts` at init
4. Engine code reads from `state.ts` directly (it always has)
5. Remove the `withStateMutation` guard from the Svelte side (it's an engine-only concern)

**Bug #3 (Proxy bypass):** During coexistence, the dev-mode `MutationTracker` in `state.ts` already surfaces bypass attempts. No additional work needed in Phase 5A.

---

## 6. Phase 5B: Legacy Cleanup

**Goal:** Remove legacy modules that have been fully ported and are no longer imported by any live code path.

**Duration estimate:** 1-2 days

**Pre-condition:** Phase 5A complete. All bridge adapter dynamic imports now reference TS modules.

### Task 5B-1: Delete Orphaned Legacy Orchestration Files

| File to Delete | Reason |
|---|---|
| `js/modules/app.ts` | Replaced by `src/lib/orchestration/app-init.ts` |
| `js/modules/event-bindings.ts` + `bindings/*.ts` (13 files) | Replaced by Svelte component event handlers |
| `js/modules/lifecycle.ts` | Replaced by `src/lib/orchestration/lifecycle.ts` |
| `js/modules/lifecycle-modes.ts` | Absorbed into `src/lib/stores/lifecycle/modes.ts` |
| `js/modules/lifecycle-reset.ts` | Absorbed into `src/lib/stores/lifecycle.ts` (reset functions) |
| `js/modules/lifecycle-search-sync.ts` | Absorbed into `src/lib/stores/lifecycle/search-sync.ts` |
| `js/modules/navigation-state.ts` | Absorbed into `src/lib/stores/navigation.ts` |
| `js/modules/journey-compass-state.ts` | Replaced by `src/lib/orchestration/compass-state.ts` |
| `js/modules/journey-compass-controller.ts` | Replaced by `src/lib/orchestration/compass-controller.ts` |
| `js/modules/composition-state.ts` | Replaced by `src/lib/stores/lifecycle.ts` (refreshCompositionState) |
| `js/modules/micro-demo.ts` + `micro-demo-*.ts` (4 files) | Replaced by `src/lib/demo/` |
| `js/modules/journey-lifecycle-adapter.ts` | Absorbed into orchestration |
| `js/modules/loading-ui.ts` | Replaced by `src/lib/ui/loading.ts` |
| `js/modules/url-state.ts` | Replaced by `src/lib/orchestration/url-state.ts` |
| `js/modules/view-controller.ts` | Replaced by `src/lib/orchestration/view-controller.ts` |
| `js/modules/island-mount-helper.ts` | Legacy islands track deleted |

### Task 5B-2: Clean Up Legacy Module Re-exports

| File | Action |
|---|---|
| `js/modules/stores.ts` | Delete if zero imports |
| `js/modules/search-chrome-island.ts` | Delete if zero imports |
| `js/modules/filter-chrome-island.ts` | Delete if zero imports |
| `js/modules/app-svelte-island.ts` | Delete if zero imports |

**Verification:**
```bash
npm run check && npm run build:svelte && npm run test:unit
npm run test:contract && npm run qa:surface:all
```

**Important:** Run `grep -r "from.*js/modules" src/` after deletions to verify no live imports reference deleted files.

---

## 7. Phase 6A: Bridge Slim-Down

**Goal:** Move engine lifecycle management from the bridge adapters into the Canvas Svelte component, eliminating the need for the camera, search, and data adapters.

**Duration estimate:** 2-3 days

### Task 6A-1: Canvas Component Owns Engine Lifecycle

**Current state:** `Canvas.svelte` calls `bridge.init(canvas)` and `bridge.destroy()`.

**Target state:** `Canvas.svelte` directly imports and manages the Three.js engine modules.

```
Canvas.svelte
  ├── imports three-engine.ts (init, animate, deinit)
  ├── imports node-manager.ts (createPoints, dispose)
  ├── imports thread-manager.ts (createMycelium, dispose)
  ├── imports camera-controls.ts (focusOnNode, settleToOverview)
  └── imports interaction-visuals.ts (initSemanticLens, etc.)
```

**What changes:**
1. Canvas.svelte `onMount`: directly calls `initThreeJS()`, `createPoints()`, `createMycelium()` instead of `bridge.init()`
2. Canvas.svelte `onDestroy`: directly calls `disposeMycelium()`, `deinit()` instead of `bridge.destroy()`
3. Camera focus calls go directly to `camera-controls.ts` functions
4. Search glow goes directly to `three-node-manager.ts` + `three-search-animations.ts`

### Task 6A-2: Remove Camera Adapter

**What changes:** Delete `src/lib/engine/adapters/camera-bridge.ts`. Move camera-related bridge methods into Canvas.svelte or a new `src/lib/engine/camera.ts` utility.

### Task 6A-3: Remove Search Adapter

**What changes:** Delete `src/lib/engine/adapters/search-bridge.ts`. Search glow management moves to `src/lib/stores/search.ts` (which already has `setSearchGlow`/`clearSearchGlow`).

### Task 6A-4: Remove Data Adapter

**What changes:** Delete `src/lib/engine/adapters/data-bridge.ts`. Data sync happens at module init time when the engine modules import their data dependencies.

### Task 6A-5: Slim Lifecycle Adapter to Engine-Only

**What remains in `lifecycle-bridge.ts`:**
- `init()` — engine init (move to Canvas)
- `destroy()` — engine teardown (move to Canvas)
- `switchView()` — view switching (delegate to `view-controller.ts`)
- `applyFilters()` — filter application (delegate to filter store)
- `hoverNode()` — hover state (delegate to state.ts directly)
- `inspectThread()` — thread inspection (delegate to state.ts directly)
- Diagnostic queries — read from state.ts directly

**After slim-down, the bridge is reduced to:** A thin utility module that reads from `js/state.ts` for diagnostic queries. No more dynamic imports.

**Verification:**
```bash
npm run check && npm run build:svelte && npm run test:contract
npm run qa:surface:all
```

---

## 8. Phase 6B: Bridge Elimination & Final Cleanup

**Goal:** Delete the bridge entirely. Remove all legacy JS module references. Final CSS audit.

**Duration estimate:** 2-3 days

**Pre-condition:** Phase 6A complete. Canvas component fully owns engine lifecycle.

### Task 6B-1: Delete Bridge and Adapters

| File to Delete | Reason |
|---|---|
| `src/lib/engine/bridge.ts` | No longer needed |
| `src/lib/engine/adapters/core.ts` | Composition root — gone |
| `src/lib/engine/adapters/types.ts` | Bridge types — gone |
| `src/lib/engine/adapters/lifecycle-bridge.ts` | Lifecycle adapter — moved to Canvas |
| `src/lib/engine/adapters/camera-bridge.ts` | Camera adapter — removed in 6A |
| `src/lib/engine/adapters/search-bridge.ts` | Search adapter — removed in 6A |
| `src/lib/engine/adapters/data-bridge.ts` | Data adapter — removed in 6A |

### Task 6B-2: Remove Legacy Module References from Svelte Layer

| File | Action |
|---|---|
| `src/lib/stores/lifecycle.ts` | Remove `getBloomIndices()` / `getBridgeIndices()` that read from `window.__semanticState` |
| `src/lib/stores/lifecycle.ts` | Remove `recenterFocusedNode()` that calls `window.animateCameraToNode` |
| `src/lib/orchestration/lifecycle.ts` | Remove legacy stub functions (probeSemanticLane, setSemanticLaneUiState, etc.) |
| `src/lib/orchestration/compass-controller.ts` | Remove `scheduleMapRouteRefresh()` that delegates to engine |
| `src/App.svelte` | Remove TODO comments about tooltip, trail review, experience toast |
| `src/lib/ui/loading.ts` | Complete `startDeferredHydration()` — port loadSemanticThreads call |

### Task 6B-3: CSS Final Audit

| Task | Details |
|---|---|
| **Bug #9: narrow.css scope leak** | Scope `.info-panel .search-result-item` under `.narrow-escape` or move to mobile premium search chrome module |
| **Remove `!important` declarations** | Audit `docs/semantic-demo-css-ownership-next-pass.md` for documented `!important` rules that are now owned by Svelte component scoped styles |
| **Verify mobile premium CSS** | Confirm `css/mobile_premium__*.css` files are still needed or can be replaced by component-scoped styles |
| **Dead selector cleanup** | Grep for CSS selectors targeting IDs/classes that no longer exist in the DOM |
| **Z-index audit** | Verify all z-index values flow from `src/lib/z-index.ts` → `src/lib/css/z-layers.css` |

### Task 6B-4: Final Verification

```bash
npm run check          # 0 TS errors
npm run build:svelte   # Clean production build
npm run lint           # 0 ESLint warnings
npm run test:unit      # All unit tests pass
npm run test:contract  # All 72 contract tests pass
npm run qa:surface:all # All visual surfaces match baselines
npm run test:microdemo # Demo state machine tests pass
```

**Manual checks:**
- App loads from `src/main.ts` — no legacy `app.js` imported
- All features work: search, focus, trail, inside mode, demo, map view
- No console errors
- No memory leaks (Chrome DevTools memory snapshot)
- Bundle size reasonable (current: 970KB+35KB, target: <1MB)

---

## 9. Risk Register

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | **Three.js port breaks rendering** — porting `three-engine.ts` introduces subtle WebGL bugs | HIGH | MEDIUM | Port incrementally. Run visual regression tests after each engine module. Keep legacy module as fallback import path during transition. |
| R2 | **Camera choreography timing** — easing curves, animation durations change during TS port | MEDIUM | MEDIUM | Port animation math verbatim from legacy. Use `seededRandom` for deterministic particle effects. Compare screenshots side-by-side. |
| R3 | **Bridge removal breaks engine init** — Canvas component doesn't properly sequence init steps | HIGH | LOW | Phase 6A keeps bridge as fallback. Canvas init mirrors the exact 10-step sequence from `lifecycle-bridge.ts` init(). |
| R4 | **Legacy shell breaks** — removing `event-bindings.ts` breaks the legacy production shell | MEDIUM | HIGH | Decision: deprecate legacy shell in Phase 6B. Before that, verify Svelte shell handles all surfaces. |
| R5 | **Test flakiness** — Playwright screenshot tests sensitive to animation timing | MEDIUM | HIGH | Use `--headed` mode. Add `waitForTimeout` for animation settle. Baseline screenshots per phase. |
| R6 | **CSS specificity wars** — scoped component styles vs. global CSS modules | MEDIUM | MEDIUM | Follow CSS ownership map. Use `:global()` sparingly. Phase 6B final audit. |
| R7 | **Bundle size regression** — importing Three.js engine modules directly into Svelte increases bundle | MEDIUM | LOW | Dynamic `import()` for engine modules in Canvas.svelte. Tree-shaking eliminates unused engine code. |
| R8 | **Memory leaks from undisposed GPU resources** — porting engine modules may miss disposal calls | HIGH | MEDIUM | Audit every `BufferGeometry`, `Material`, `Texture` creation against disposal. Use `Disposable` interface pattern. |

---

## 10. Verification Matrix

### Per-Phase Verification

| Check | 5A | 5B | 6A | 6B |
|---|---|---|---|---|
| `npm run check` (TS compile) | ✅ | ✅ | ✅ | ✅ |
| `npm run build:svelte` | ✅ | ✅ | ✅ | ✅ |
| `npm run test:unit` | ✅ | ✅ | ✅ | ✅ |
| `npm run test:contract` | ✅ | ✅ | ✅ | ✅ |
| `npm run test:microdemo` | ✅ | ✅ | ✅ | ✅ |
| `npm run qa:surface:all` | ✅ | ✅ | ✅ | ✅ |
| Manual: 3D scene renders | ✅ | ✅ | ✅ | ✅ |
| Manual: Search works | ✅ | — | ✅ | ✅ |
| Manual: Focus/trail works | ✅ | — | ✅ | ✅ |
| Manual: Demo runs | — | — | ✅ | ✅ |
| Manual: URL state sync | — | — | ✅ | ✅ |
| Manual: Map view works | ✅ | — | ✅ | ✅ |
| Manual: No console errors | ✅ | ✅ | ✅ | ✅ |
| Memory leak check | — | — | ✅ | ✅ |
| Legacy shell deprecated | — | — | — | ✅ |

### Named Surface Tests

Run after each phase:

```bash
# Phase 5A (engine modules)
npm run qa:surface:desktop-idle
npm run qa:surface:mobile-idle
npm run qa:surface:controls
npm run qa:surface:focus-pocket
npm run qa:surface:launch-focus

# Phase 6A (bridge slim)
npm run qa:surface:all

# Phase 6B (final)
npm run qa:surface:all
npm run qa:surface:global-spacing
```

---

## 11. Effort Estimates

| Phase | Task | Estimated Effort | Complexity |
|---|---|---|---|
| **5A** | three-engine.ts port | 2 days | HIGH |
| **5A** | camera-controls.ts port | 2-3 days | HIGH |
| **5A** | three-node-manager.ts port | 1-2 days | MEDIUM |
| **5A** | three-thread-manager.ts port | 1 day | MEDIUM |
| **5A** | filter-state.ts verification | 0.5 days | LOW |
| **5A** | journey-canvas-interaction.ts verification | 0.5 days | LOW |
| **5A** | event-bus adapter update | 0.5 days | LOW |
| **5A** | state.ts read-only strategy | 1 day | HIGH |
| **5A** | **Phase 5A Total** | **8-11 days** | |
| **5B** | Delete orphaned legacy files | 0.5 days | LOW |
| **5B** | Verify zero-import status | 0.5 days | LOW |
| **5B** | **Phase 5B Total** | **1 day** | |
| **6A** | Canvas owns engine lifecycle | 2 days | HIGH |
| **6A** | Remove camera/search/data adapters | 1 day | MEDIUM |
| **6A** | Slim lifecycle adapter | 0.5 days | LOW |
| **6A** | **Phase 6A Total** | **3-4 days** | |
| **6B** | Delete bridge and adapters | 0.5 days | LOW |
| **6B** | Remove legacy module refs from Svelte | 1 day | MEDIUM |
| **6B** | CSS final audit + Bug #9 | 1 day | MEDIUM |
| **6B** | Final verification | 0.5 days | LOW |
| **6B** | **Phase 6B Total** | **3 days** | |
| | **Grand Total** | **15-19 days** | |

---

## 12. Worker Assignment Template

### Phase 5A Worker (Engine Ports)

```
You are a migration worker for semantic-explorer.

## Phase: 5A — Engine Module TS Ports

## Scope
Port the following legacy JS engine modules to TypeScript:
1. js/modules/three-engine.ts → src/lib/engine/three-engine.ts
2. js/modules/camera-controls*.ts → src/lib/engine/camera-controls*.ts
3. js/modules/three-node-manager.ts → src/lib/engine/node-manager.ts
4. js/modules/three-thread-manager.ts → src/lib/engine/thread-manager.ts

## Rules
1. Each ported module must maintain the same public API as its JS predecessor.
2. Use typed imports, proper disposal, and Svelte store integration.
3. Run `npm run check` after each file port.
4. Run `npm run test:contract` after completing all ports.
5. Cross-seam findings: document with path + line range, return to main lane.

## Verification
After completing all ports:
- Run `npm run check && npm run build:svelte && npm run test:contract`
- Run `npm run qa:surface:all`
- Report: changed files, risks, any remaining legacy imports.
```

### Phase 6A Worker (Bridge Slim)

```
You are a migration worker for semantic-explorer.

## Phase: 6A — Bridge Slim-Down

## Scope
1. Move engine lifecycle from bridge adapters into Canvas.svelte
2. Remove camera-bridge.ts, search-bridge.ts, data-bridge.ts
3. Slim lifecycle-bridge.ts to engine-only methods

## Rules
1. Canvas.svelte must handle the exact same 10-step init sequence.
2. Keep the bridge as fallback during transition (don't delete yet).
3. Run `npm run test:contract` after each adapter removal.
4. Run `npm run qa:surface:all` to verify no visual regressions.

## Verification
After completing all tasks:
- Run `npm run check && npm run build:svelte && npm run test:contract`
- Run `npm run qa:surface:all`
- Verify no dynamic imports of legacy modules remain in src/.
```

---

## Appendix A: File Ownership by Phase

### Phase 5A (Engine Ports)
- `src/lib/engine/three-engine.ts`
- `src/lib/engine/camera-controls.ts` (+ sub-modules)
- `src/lib/engine/node-manager.ts`
- `src/lib/engine/thread-manager.ts`
- `src/lib/stores/filter.ts` (verification)
- `src/lib/journey/canvas-interaction.ts` (verification)

### Phase 5B (Legacy Cleanup)
- `js/modules/app.ts` (delete)
- `js/modules/event-bindings.ts` + `bindings/*.ts` (delete)
- `js/modules/lifecycle.ts` (delete)
- `js/modules/lifecycle-modes.ts`, `lifecycle-reset.ts`, `lifecycle-search-sync.ts` (delete)
- `js/modules/navigation-state.ts` (delete)
- `js/modules/journey-compass-state.ts`, `journey-compass-controller.ts` (delete)
- `js/modules/composition-state.ts` (delete)
- `js/modules/micro-demo*.ts` (delete)
- `js/modules/loading-ui.ts` (delete)
- `js/modules/url-state.ts` (delete)
- `js/modules/view-controller.ts` (delete)
- `js/modules/island-mount-helper.ts` (delete)

### Phase 6A (Bridge Slim)
- `src/components/Canvas.svelte` (major edit)
- `src/lib/engine/adapters/camera-bridge.ts` (delete)
- `src/lib/engine/adapters/search-bridge.ts` (delete)
- `src/lib/engine/adapters/data-bridge.ts` (delete)
- `src/lib/engine/adapters/lifecycle-bridge.ts` (slim to engine-only)

### Phase 6B (Bridge Elimination)
- `src/lib/engine/bridge.ts` (delete)
- `src/lib/engine/adapters/core.ts` (delete)
- `src/lib/engine/adapters/types.ts` (delete)
- `src/lib/engine/adapters/lifecycle-bridge.ts` (delete)
- `src/lib/stores/lifecycle.ts` (remove window.__semanticState reads)
- `src/lib/orchestration/lifecycle.ts` (remove legacy stubs)
- `src/lib/orchestration/compass-controller.ts` (remove engine delegation)
- `src/lib/ui/loading.ts` (complete deferred hydration)
- `css/narrow.css` (Bug #9 fix)
- All component `<style>` blocks (CSS audit)

---

## Appendix B: Bug Fix Tracking

| Bug | Phase | Status | Notes |
|---|---|---|---|
| #3 (state.js Proxy bypass) | Phase 5A | **Open** | Dev-mode MutationTracker exists. Consider adding runtime warnings in dev for nested property sets without `withStateMutation`. |
| #9 (narrow.css scope leak) | Phase 6B | **Open** | Scope `.info-panel .search-result-item` under `.narrow-escape`. |
| All others (#1, #2, #4-#8) | Phase 0-4 | **Resolved** | Fixed during earlier migration phases. |
