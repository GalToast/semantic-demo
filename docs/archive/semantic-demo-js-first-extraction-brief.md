# semantic-demo-js-first-extraction-brief

**Date:** 2026-05-19
**Author:** Codex extraction analysis
**Status:** Report only - no implementation in this lane
**Output path:** `docs/semantic-demo-js-first-extraction-brief.md`

---

## Executive Summary

The demonolith plan identified 5 candidate extraction modules. The **Cluster/Filter Subsystem** (lifecycle.js lines 48-173) is the smallest, most self-contained, lowest-risk first extraction. `journey-thread-model.js` is already a de facto module (just a re-export layer) and does not reduce monolith pressure - extracting it changes nothing about bundle topology.

This brief defines exact function boundaries, dependency graph, expected public API, and a low-risk implementation checklist for the Cluster/Filter subsystem.

---

## Candidate: Cluster/Filter Subsystem (`lifecycle.js` lines 48-173)

### Why This First

| Criterion | Score | Notes |
|---|---|---|
| Function count | 5 | 2 exported + 3 private helpers |
| Lines of code | ~125 | Smallest coherent subsystem identified |
| window.* surface | 3 | `clearShortSemanticSearchState`, `clearSearchGlow`, `applyFilters` - all guarded with `typeof` checks |
| DOM coupling | Isolated | Renders only into `#cluster-list` element |
| State coupling | Minimal | Reads `state.activeFilters`, `state.activeClusterFilter`, `state.points`, `state.currentSearchSummary`, `state.COLORS` |
| Testability | High | `clearClusterFilter` resets state to known values; `updateClusterList` reads state and renders |
| Risk | **Low-medium** | The 3 window.* calls are the only external wiring; all guarded with `typeof` checks |

### Function Boundaries

```
lifecycle.js:48-173
```

| Function | Visibility | Lines | Signature | Purpose |
|---|---|---|---|---|
| `pointMatchesActiveFilters` | private | 48-56 | `(point) => boolean` | Pure predicate: does point pass current activeFilters? |
| `getFilteredClusterCounts` | private | 58-67 | `() => Map<clusterId, count>` | Derive cluster->count from filtered points |
| `setClusterFilter` | private | 69-86 | `(cluster: number\|null) => void` | State mutation + window.* bridge calls |
| `clearClusterFilter` | **exported** | 88-102 | `() => void` | Reset all activeFilters + cluster filter |
| `updateClusterList` | **exported** | 104-173 | `() => void` | Render cluster buttons into `#cluster-list` |

### Dependency Graph (post-extraction)

```
state.js (shared global)
    ^                          v
    |                   journey-thread-model.js
    |                          (normalizeCityForFilter)
    |                               ^
    |                               |
js/modules/cluster-filter.js  utils/geo-data.js
    ^        v          v        ^
    |        |          |        |
    |   (init state)  (normalizeCityForFilter)
    |        |          |        |
    |        +----------+---------+
    |
lifecycle.js (imports cluster-filter)
```

### Imports Required in New Module

```js
import { state } from '../state.js';
import { normalizeCityForFilter } from './utils/geo-data.js';
// normalizeCityForFilter is defined in utils/geo-data.js line 26
// It is a pure string transformation - no state coupling
```

### Internal State Access

The new module reads/writes these state properties directly (not via any interface):

| State Property | Read | Write | Notes |
|---|---|---|---|
| `state.activeFilters` | yes (clearClusterFilter) | yes (clearClusterFilter) | Object with status/city/website/email/geocoded |
| `state.activeClusterFilter` | yes (setClusterFilter, updateClusterList) | yes (setClusterFilter) | `number \| null` |
| `state.currentSearchSummary` | yes (setClusterFilter) | - | Guards search-dismissal logic |
| `state.points` | yes (getFilteredClusterCounts) | - | Source data for filtering |
| `state.COLORS` | yes (updateClusterList) | - | Palette for cluster color coding |
| `state._showAllClusters` | yes (updateClusterList) | yes (updateClusterList) | Private toggle for "show more" UI |

### window.* Bridge Calls in Subsystem

These appear inside `setClusterFilter` (lifecycle.js:77-85), all guarded with `typeof` checks:

```js
// setClusterFilter (private, extracted with subsystem)
if (state.currentSearchSummary) {
    const resultsEl = document.getElementById('search-results');
    const statusEl = document.getElementById('search-status');
    if (typeof window.clearShortSemanticSearchState === 'function') {
        window.clearShortSemanticSearchState(resultsEl, statusEl);
    }
}
// ...
if (typeof window.clearSearchGlow === 'function') window.clearSearchGlow();
if (typeof window.applyFilters === 'function') window.applyFilters();
if (typeof window.updateUrlState === 'function') window.updateUrlState({}, { reason: 'cluster-filter' });
```

**All three window.* functions** are assigned in `app.js` or another wiring layer. They are NOT lifecycle.js's own functions - they are external contracts the subsystem calls through guarded references. This is the correct coupling pattern for a subsystem: call through `window.*` rather than importing directly.

### Shared DOM Contract

`#cluster-list` element ID is owned by the cluster-filter subsystem. No other module writes to this element.

---

## Expected Public API (post-extraction)

```ts
// js/modules/cluster-filter.js

export function clearClusterFilter(): void
// Resets state.activeFilters to defaults and clears state.activeClusterFilter.
// Calls window.updateUrlState({},{reason:'cluster-filter-clear'}) if available.

export function updateClusterList(): void
// Renders cluster buttons into #cluster-list.
// Reads state.points, state.activeFilters, state.activeClusterFilter, state.COLORS.
// Handles empty state, "show more" toggle, active cluster highlighting.
```

The private helpers `pointMatchesActiveFilters`, `getFilteredClusterCounts`, and `setClusterFilter` remain internal to the new module.

---

## Implementation Checklist (Low-Risk)

### Phase 1: New module skeleton
- [ ] Create `js/modules/cluster-filter.js`
- [ ] Copy lines 48-56 (`pointMatchesActiveFilters`) as private function
- [ ] Copy lines 58-67 (`getFilteredClusterCounts`) as private function
- [ ] Copy lines 69-86 (`setClusterFilter`) as private function
- [ ] Copy lines 88-102 (`clearClusterFilter`) as exported function
- [ ] Copy lines 104-173 (`updateClusterList`) as exported function
- [ ] Add `import { state } from '../state.js'` at top
- [ ] Add `import { normalizeCityForFilter } from './utils/geo-data.js'` at top
- [ ] Remove all copied lines from `lifecycle.js`

### Phase 2:lifecycle.js wiring
- [ ] Add `import { clearClusterFilter, updateClusterList } from './cluster-filter.js'` to `lifecycle.js`
- [ ] Verify `syncFilterControls` (lifecycle.js:294) remains independent of cluster rendering. Current inspection found it does not call `updateClusterList`; cluster list rendering is triggered elsewhere.
- [ ] Verify `window.updateClusterList = updateClusterList` at lifecycle.js:3186 still works (window.* binding migrates with the function)
- [ ] Verify `buildLegend` (lifecycle.js:175) calls `getFilteredClusterCounts` - it will need to call `updateClusterList` or the new module must expose `getFilteredClusterCounts`. Consider whether `buildLegend` stays in lifecycle.js or moves too.
- [ ] Verify `clearClusterFilter` is not called anywhere that won't have the new import available

### Phase 3: Verify window.* bridge
- [ ] Confirm `window.clearShortSemanticSearchState` is assigned in `app.js` or equivalent wiring layer
- [ ] Confirm `window.clearSearchGlow` is assigned in the same layer
- [ ] Confirm `window.applyFilters` is assigned in the same layer
- [ ] These guards (`typeof === 'function'`) are the correct decoupling pattern - no change needed

### Phase 4: DOM ownership
- [ ] Confirm `#cluster-list` element is not written by any module other than `updateClusterList`
- [ ] Confirm `#cluster-empty-state` inner HTML (line 114-125) is owned by cluster-filter subsystem

### Phase 5: Test
- [ ] `npm run check:shell` - verify no import/require breakage
- [ ] `npm run test` - shell + manifest + cache + ownership checks
- [ ] Manual: load page, click a cluster filter, verify cluster buttons render
- [ ] Manual: with active filters, click "Clear filters" button, verify all filters reset

---

## What Does NOT Change in This Extraction

- No change to `package.json` - no new dependencies
- No change to `state.js` - state properties remain as direct assignments
- No new contract tests added in this lane (test:contract lane is separate)
- No change to bundle output or dist/ - this is a pure code-move refactor
- `window.updateClusterList` binding stays in lifecycle.js at its current location (line 3186) - lifecycle.js still imports and re-exports via window.*

---

## Risks and Open Questions

### Risk: `buildLegend` calls `getFilteredClusterCounts` directly
`buildLegend` (lifecycle.js:179) reads `getFilteredClusterCounts` without going through `updateClusterList`. After extraction, either:
- **Option A:** Export `getFilteredClusterCounts` from the new module (low coupling, fine since it's a pure derive)
- **Option B:** Refactor `buildLegend` to call `updateClusterList` or import from cluster-filter
- **Recommendation:** Option A - export it as a low-level derive, same category as the already-exported utility functions

### Risk: cluster rendering is coordinated outside `syncFilterControls`
`syncFilterControls` (lifecycle.js:294) renders filter controls and does not directly reference cluster functions. Current inspection found cluster list rendering is called through `window.updateClusterList` from `data-loader.js` and `search-state.js`. After extraction, preserve those call sites and keep the `window.updateClusterList = updateClusterList` bridge intact.

### Risk: `window.updateClusterList` binding at line 3186
The window.* binding at line 3186 (`window.updateClusterList = updateClusterList`) references the function directly by name. After extraction to `cluster-filter.js`, this binding needs to read:
```js
// lifecycle.js (after extraction)
import { updateClusterList } from './cluster-filter.js';
// ...
window.updateClusterList = updateClusterList; // still works, same variable reference
```
This is a zero-change refactor - the binding works as long as `updateClusterList` is in the import namespace.

### Unresolved: `applyStoryPrompt` and `setClusterFilter`
`applyStoryPrompt` (lifecycle.js:614) calls `setClusterFilter` internally (via setting `state.activeClusterFilter = foodCluster` then calling `window.applyFilters`). This is indirect state coupling, not a direct call to `setClusterFilter`. No action needed for this extraction.

---

## Verification Commands

```bash
npm run test              # fast checks (shell, manifest, cache, ownership)
npm run check:shell        # subset: only the fast static checks
```

`npm run test:contract` was not run because this is a report-only lane. Contract tests are in the test:contract lane and should be run after implementation completes.

---

## Files Changed (Implementation Only)

```
js/modules/cluster-filter.js   [NEW] - extracted cluster/filter subsystem
js/modules/lifecycle.js         [MOD] - remove extracted lines, add import
```

No other files affected. No CSS, no HTML, no package.json, no dist/ changes.

---

## Relationship to demonolith-plan.md

This brief refines **Module B: Cluster/Filter Sub-system** (demonolith-plan.md lines 39-61) with:
- Exact line boundaries for the first extraction candidate
- Exact function signatures and internal dependencies
- Concrete dependency graph
- Phased implementation checklist with risk flags per step
- Open questions surfaced from reading actual code (buildLegend coupling, syncFilterControls coordination)

