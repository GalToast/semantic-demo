# State Coexistence Strategy

> **Date:** 2026-06-10
> **Phase:** 5A — Engine Module TS Ports
> **Status:** Active during bridge-mediated coexistence

---

## The Two-State Problem

During the phased migration from legacy JS to Svelte/TS, **two state systems coexist**:

1. **Legacy state singleton** (`js/state.js` / `js/state.ts`) — a deep Proxy-backed object that the entire Three.js engine reads from and writes to. Contains ~1,200 properties covering points, camera, filters, focus, search, mycelium, and diagnostics.

2. **Svelte stores** (`src/lib/stores/*.ts` + `.svelte.ts`) — 12 typed stores that are the **source of truth for UI state** (filters, navigation, search, compass, demo, viewport, etc.).

The bridge adapters (`src/lib/engine/adapters/`) sync between these two systems at defined seams. The strategy is:

- **Svelte stores own UI state.** Components read and write stores.
- **The legacy singleton owns engine state.** Three.js modules read and write the singleton.
- **The data-bridge adapter syncs Svelte → legacy at init time.** One-directional: Svelte stores populate the legacy singleton's initial values.
- **The lifecycle-bridge adapter syncs legacy → Svelte via events.** Engine-side changes (camera focus, view switch) emit events that Svelte stores subscribe to.

---

## Read-Only Strategy for `js/state.ts`

**Decision:** Do NOT port `js/state.ts` to the Svelte layer. Instead, keep it as a read-only snapshot for engine consumption.

### Why Not Port?

| Factor | Port to Svelte | Keep as-is |
|---|---|---|
| Risk | HIGH — changing state access patterns in 8,400+ lines of Three.js code | LOW — no engine changes |
| Effort | 5-10 days (replacing every `state.X` read with store subscription) | 0 days |
| Benefit | Cleaner architecture | None for end users |
| Timing | Phase 6B+ (after engine is fully TS-native) | Now |

### How It Works

1. **At init:** `data-bridge.ts` reads Svelte store snapshots and writes them into the legacy singleton's matching properties.

2. **During runtime:** The engine reads from `state` directly (it always has). The Svelte layer reads from stores. When the engine changes state (e.g., camera focus), it emits events via the event bus, which Svelte stores subscribe to.

3. **The `withStateMutation()` guard** remains an engine-only concern. The Svelte layer never calls it. All state mutations in Svelte go through store `.set()` / `.update()` methods.

---

## State Ownership Map

| State Slice | Owner | Consumer | Sync Direction |
|---|---|---|---|
| `points`, `nodePositions`, `rawPositionsBuffer` | Engine (via `createPoints()`) | Svelte (read-only, via data-bridge) | Engine → Svelte (one-time at init) |
| `focusedNode` | Engine (via `focusOnNode()`) | Svelte (FocusCard, InfoPanel, CompassRail) | Engine → Svelte (via `CAMERA_NODE_FOCUSED` event) |
| `currentView` | Svelte (`view-controller.ts`) | Engine (Three.js scene) | Svelte → Engine (via `VIEW_CHANGED` event) |
| `activeFilters` | Svelte (`filter.svelte.ts`) | Engine (via `overwriteActiveFilters()`) | Svelte → Engine (via data-bridge apply) |
| `navState.*` | Svelte (`navigation.svelte.ts`) | Engine (journey-canvas-interaction) | Svelte → Engine (via state singleton sync) |
| `searchGlowActive`, `searchGlowIndices` | Engine (via search-animations) | Svelte (SearchResults) | Engine → Svelte (via events) |
| `inspectedThreadIndex` | Svelte (ThreadInspector) | Engine (thread-inspector.js) | Svelte → Engine (via state singleton write) |
| `myceliumDirty` | Engine (`createMycelium()`) | Engine (internal) | N/A (engine-only) |
| `scenePerformanceDiagnostics` | Engine (RAF loop) | Svelte (Controls overlay) | Engine → Svelte (via diagnostic queries) |
| `filterVersion`, `filterColorVersion` | Svelte (filter store) | Engine (render triggers) | Svelte → Engine (via state singleton write) |

---

## Critical Keys

The legacy `state.js` uses a `CRITICAL_KEYS` set to gate deep mutations through `withStateMutation()`. These keys require the mutation guard in production:

- `currentView`
- `focusedNode`
- `activeFilters`
- `navState` (entire sub-object)

During coexistence, only the engine side writes these keys via `withStateMutation()`. The Svelte side writes to stores, and the data-bridge syncs the values into the singleton at well-defined seams (init, filter apply, view switch).

---

## Bug #3: Proxy Bypass

The dev-mode `MutationTracker` in `state.js` surfaces bypass attempts — writes to tracked keys that skip `withStateMutation()`. During coexistence:

- **Engine code** is the primary source of bypass risk. The tracker logs warnings in dev mode.
- **Svelte code** never touches the legacy singleton directly (it writes to stores).
- **No additional work needed in Phase 5A.** The existing tracker is sufficient. If bypasses are found during Phase 6B cleanup, they can be addressed then.

---

## Deprecation Path

When Phase 6B eliminates the bridge:

1. The engine modules (three-engine, camera-controls, node-manager, thread-manager) will be fully TS-native and import from `@lib/` paths.
2. The engine will read state from its own typed modules or from stores via direct subscription.
3. The legacy `state.js` singleton becomes dead code and can be deleted.
4. The `withStateMutation()` guard becomes unnecessary (Svelte stores handle reactivity).

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| State drift between Svelte stores and legacy singleton | MEDIUM | data-bridge syncs at init; events sync at runtime; diagnostic queries verify parity |
| Legacy singleton grows stale as Svelte stores diverge | LOW | Engine reads from singleton; UI reads from stores; they serve different consumers |
| `withStateMutation()` bypass in engine code | LOW | Dev-mode MutationTracker logs warnings; no production guard needed |
| Store subscription leaks during long sessions | LOW | All store subscriptions use `unsubscribe()` in component `onDestroy` |
