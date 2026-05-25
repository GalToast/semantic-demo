# semantic-demo-js-demonolith-plan

**Date:** 2026-05-19
**Scope:** `js/modules/lifecycle.js`, `js/modules/journey.js`
**Goal:** Identify safe extraction seams and document contract tests for eventual de-monolith refactoring.

---

## 1. Module A: `journey-thread-model.js` - Already a Hidden Extractor

**Current state:**
- `journey.js` imports and re-exports all 7 functions from `./journey-thread-model.js` as its public API
- Functions: `normalizeLeadId`, `buildSpatialGrid`, `buildProjectedNeighborGrid`, `getProjectedNeighborCandidates`, `getSemanticThreadCandidates`, `getGeometricThreadCandidates`, `getThreadCandidatesForIndex`
- `thread-inspector.js` imports `normalizeLeadId` directly from `journey-thread-model.js`; this avoids local lookup-normalization drift against `state.semanticNeighborMapByLeadId`
- `initJourneyState()` in `journey.js` calls `state.trailIndices = state.trailIndices || new Set()` - the only state coupling from thread-model

**Risk:** Medium-low. The auto-init side-effect in `journey.js` (line 66: `initJourneyState()`) means thread-model can't self-initialize. Extracting `initJourneyState` to thread-model itself creates a clean import-time contract.

**Exported API to stabilize:**
```
normalizeLeadId(value: any): string
buildSpatialGrid(cellSize?: number): Grid
buildProjectedNeighborGrid(): Grid
getProjectedNeighborCandidates(index: number): Candidate[]
getSemanticThreadCandidates(index: number): Candidate[]
getGeometricThreadCandidates(index: number): Candidate[]
getThreadCandidatesForIndex(index: number): Candidate[]
```

**Suggested contract tests:**
- `normalizeLeadId(' 0123 ') === ' 0123 '`
- `normalizeLeadId(null) === null`
- `buildSpatialGrid()` returns object with `cellSize` property
- `getProjectedNeighborCandidates(-1)` returns array
- `getSemanticThreadCandidates(9999)` returns array (out-of-range gracefully returns [])
- `getThreadCandidatesForIndex(0)` resolves semantic vs geometric candidates

**Completed cleanup:**
- `journey.js` text helpers `truncateMicrocopy` and `getSharedTrailTopicLabel` now live in `journey-text-helpers.js`
- `journey.js` re-exports those helpers to preserve its public surface
- `journey-thread-inspector-contract.mjs` and `journey-window-surface-contract.mjs` guard the helper extraction and shared `normalizeLeadId` import

---

## 2. Module B: Cluster/Filter Sub-system - `lifecycle.js` lines 48-173

**Current state:**
- `pointMatchesActiveFilters(point)` - pure predicate on point + state.activeFilters
- `getFilteredClusterCounts()` - pure derive from state.points
- `setClusterFilter(cluster)` - state mutation + window.* calls (clearShortSemanticSearchState, clearSearchGlow, applyFilters, updateUrlState)
- `clearClusterFilter()` - resets all state.activeFilters + calls setClusterFilter(null)
- `updateClusterList()` - DOM render of cluster buttons

**Risk:** Medium. The seam is cleanest because `setClusterFilter` calls window.* bridge functions that are attached by `app.js`. The DOM render in `updateClusterList` is isolated.

**Exported API to stabilize:**
```
clearClusterFilter(): void
updateClusterList(): void
```

**Suggested contract tests:**
- `clearClusterFilter()` resets `state.activeFilters` to defaults
- `updateClusterList()` called after `setClusterFilter(null)` renders empty cluster list
- `setClusterFilter(0)` sets `state.activeClusterFilter = 0`
- Repeated `setClusterFilter(0)` toggles back to null

---

## 3. Module C: Journey Compass State Machine - `lifecycle.js` lines 878-1280

**Current state:**
- `getJourneyCompassState()` - pure derive from state + document.body.dataset
- `executeJourneyCompassAction(action)` - dispatches actions; calls window.* (syncRouteDirectorState, animateCameraToNode, walkThreadNeighbor, etc.)
- `updateJourneyCompass()` - DOM render of compass buttons

**Risk:** Medium. Tight coupling to `document.body.dataset.journeyPhase` and `document.body.dataset.journeyCompass*` attributes. These are cross-module contracts that several other files also read/write (`semantic-dive-ui.js`, `thread-inspector.js`, `journey.js`).

**Exported API to stabilize:**
```
getJourneyCompassState(): CompassState
executeJourneyCompassAction(action: object): void
updateJourneyCompass(): void
```

**Suggested contract tests:**
- `getJourneyCompassState()` with no phase returns 'overview' step
- `executeJourneyCompassAction({ action: 'start-search' })` transitions phase
- `updateJourneyCompass()` after phase change reflects correct step

---

## 4. Module D: URL State Bridge - `lifecycle.js` lines 652-776

**Current state:**
- `updateUrlState(extra, options)` - reads/writes `window.history.state`, calls `window.updateUrlState` (self-call guard), triggers `showExperienceToast` on error
- `resetExperienceState()`, `resetStateBeforeUrlRestore()` - bulk state reset functions

**Risk:** Medium-high. `updateUrlState` calls itself through `window.updateUrlState` which is set by `app.js`. This is a self-referential wiring that would need a named import to decouple.

**Exported API to stabilize:**
```
updateUrlState(extra?: object, options?: object): void
resetExperienceState(options?: object): void
resetStateBeforeUrlRestore(options?: object): void
```

**Suggested contract tests:**
- `updateUrlState({}, { reason: 'test' })` does not throw
- `resetExperienceState()` clears `state.points`, `state.trailIndices`, `state.navState`
- URL fragment is stable after multiple rapid calls

---

## 5. Module E: Semantic Lane Monitor - `lifecycle.js` lines 1934-2172

**Current state:**
- `applySemanticLaneHealthPayload(payload)` - applies health payload to state
- `shouldWarmSemanticLane(reason)` - decision predicate
- `scheduleSemanticLaneMonitor()` - polling timer
- `setSemanticLaneUiState(laneState, options)` - UI update
- `recordSemanticLaneSnapshot(partial)` - snapshot capture

**Risk:** Medium-low. Functions are largely state-driven with clear inputs/outputs. The polling timer is the main cleanup concern (need `clearInterval` on teardown).

**Exported API to stabilize:**
```
applySemanticLaneHealthPayload(payload: object, options?: object): void
shouldWarmSemanticLane(reason?: string): boolean
setSemanticLaneUiState(laneState: object, options?: object): void
recordSemanticLaneSnapshot(partial?: object): Snapshot
```

**Suggested contract tests:**
- `applySemanticLaneHealthPayload({ ok: true, state: 'healthy' })` sets `state.semanticLaneHealth`
- `shouldWarmSemanticLane('interval')` returns boolean
- `recordSemanticLaneSnapshot()` returns object with `timestamp`, `phase`

---

## Cross-Cutting Observations

### Tight Coupling: journey.js <-> lifecycle.js via window.*
`window.updateJourneyCompass`, `window.showExperienceToast`, and runtime `window.syncSemanticDiveUi` callers were dewindowed 2026-05-25; callers now use direct named imports from their owner modules. `window.syncSemanticDiveUi` remains as a temporary lifecycle compatibility bridge for tests/external callers. `journey.js` still calls legacy bridge helpers such as `window.focusOnPoint`; to extract `journey.js` cleanly, the remaining bridge calls must become proper named imports.

### Auto-init Pattern in journey.js (line 66)
`initJourneyState()` runs on import - a side-effect that prevents journey.js from being a pure module. Moving this to a factory function `createJourneyModule(state)` or requiring callers to invoke `initJourneyState()` first is the extraction prerequisite.

### Shared DOM State contracts
`document.body.dataset.journeyPhase` is written by `lifecycle.js`, `semantic-dive-ui.js`, `journey.js`, and `thread-inspector.js`. Any extraction involving journey-phase must preserve this attribute as the canonical cross-module contract, documented as a shared DOM state contract.

### window.* Bridge Explosion in lifecycle.js (lines 3171-3207)
`lifecycle.js` assigns ~35 functions to `window.*` directly. This is the largest compat surface. Each extracted module should take ownership of its own window.* bindings, but only after extraction is complete for that module's code.

---

## Extraction Order Recommendation

1. **Cluster/Filter Sub-system** - Small, self-contained, low window.* exposure (see `semantic-demo-js-first-extraction-brief.md`)
2. **Journey text helpers** - Partially done; continue extracting pure label/string helpers from `journey.js`
3. ~~Semantic Lane Monitor~~ — **COMPLETED** — `js/modules/semantic-lane.js` extracted, all 10 contracts pass
4. **Journey Compass** - Moderate; stabilize the CompassState contract first
5. **URL State Bridge** - Risky due to self-referential window.updateUrlState; extract last

---

## Verification

- **Test command:** `npm run test` (runs shell, manifest, cache, ownership checks)
- **Contract test lane:** `npm run test:contract` (fast Node/module contracts)
- **Served surface lane:** `npm run qa:contract:all` with `npm run serve` running first (DOM/layout surface contracts)
