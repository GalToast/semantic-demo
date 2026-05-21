# Semantic Demo State Transition Truth Table

## Overview → search → focus → semantic-dive → map-trail → reset

Canonical single source of truth for state transitions, derived from code inspection and
contract tests. Distinguishes **verified code behavior** from **proposed desired behavior**.

---

## State Dimensions

| Dimension | Type | Notes |
|---|---|---|
| `state.focusedNode` | `number\|null` | Canvas node index |
| `state.selectedPoint` | `object\|null` | Lead record `{lead_id, name, cluster…}` |
| `state.navState.focusedIndex` | `number\|null` | Separate from focusedNode; set by focus actions |
| `state.navState.mode` | `string` | `overview \| search \| focus \| trail` |
| `state.trailDepth` | `0 \| 1 \| 2` | 0=none, 1=trail active, 2=semantic-dive inside |
| `state.semanticDiveMode` | `boolean` | Getter: `trailDepth === 2`. Setter: `trailDepth = val ? 2 : 0` (journey.js:1070) |
| `state.currentView` | `galaxy \| map` | |
| `state.currentSearchSummary` | `object\|null` | |
| `document.body.dataset.activeView` | `galaxy \| map` | |
| `document.body.dataset.graphContext` | `idle \| search \| focus \| focus-search` | Galaxy only |
| `document.body.dataset.mapContext` | `idle \| search \| focus \| focus-search` | Map only |
| `document.body.dataset.semanticDive` | `inactive \| active \| transitioning` | Galaxy only |
| `document.body.dataset.panelSurface` | See derivePanelSurface table below | |
| `document.body.dataset.trailState` | `active \| inactive` | |

---

## Verified Owner API Surface

| Function | File | Role |
|---|---|---|
| `window.search(query)` | `js/modules/app.js:66` | Triggers search flow → sets `currentSearchSummary`, calls `refreshCompositionState()` |
| `window.clearSearch()` | `js/modules/app.js:78` | Clears search → nulls `currentSearchSummary`, calls `refreshCompositionState()` |
| `window.focusOnNode(index, opts)` | `js/modules/app.js:85` | Sets `focusedNode`, `navState.focusedIndex`, `navState.mode='focus'`, calls `refreshCompositionState()` |
| `window.setTrailDepth(depth, opts)` | `js/modules/app.js:116` | Sets `trailDepth` with guard: only depth 2 may be entered via user gesture |
| `window.setSemanticDiveMode(enabled)` | `js/modules/app.js:118` | Setter for `semanticDiveMode`; syncs `navState.mode='trail'`, calls `setTrailDepth(nextActive?2:1)` then `refreshCompositionState()` |
| `window.switchView(view, opts)` | `js/modules/app.js:118` | Sets `state.currentView`, calls `refreshCompositionState()` |
| `window.resetExplorationFocus()` | `js/modules/app.js:122` | Clears focus/trail but preserves search; calls `setTrailDepth(0)`, `refreshCompositionState()` |
| `window.refreshCompositionState()` | `js/modules/app.js:124` | Canonical DOM/dataset synchroniser — called after every state mutation |
| `window.syncSemanticDiveUi()` | `js/modules/lifecycle.js:2495` | Syncs dive button, `dataset.semanticDive`, `dataset.insideWalkState`; **calls `updateExplorationUi()`** |

---

## Transition Table

### T1: overview → search

| Field | overview (before) | search (after) | Notes |
|---|---|---|---|
| `focusedNode` | `null` | `null` | |
| `selectedPoint` | `null` | `null` | |
| `navState.focusedIndex` | `null` | `null` | |
| `trailDepth` | `0` | `0` | |
| `semanticDiveMode` | `false` | `false` | |
| `navState.mode` | `overview` | `overview` | Mode does NOT change to `search` |
| `currentSearchSummary` | `null` | `{query, visibleMatches…}` | |
| `activeView` | `galaxy` | `galaxy` | |
| `graphContext` | `idle` | `search` | |
| `panelSurface` | `idle` | `search` | |
| `semanticDive` | `inactive` | `inactive` | |
| `trailState` | `inactive` | `inactive` | No focus yet — trail inactive |

**Trigger**: `window.search('coffee')`  
**Owner API**: `search-state.js:searchModule.search()` → `window.search()`  
**Key code path**: `search-state.js` → sets `currentSearchSummary` → `refreshCompositionState()`  
**DOM effect**: `body.dataset.graphContext=search`, `body.dataset.panelSurface=search`

---

### T2: search → focus

| Field | search (before) | focus (after) | Notes |
|---|---|---|---|
| `focusedNode` | `null` | `index` | Set by clicking search result |
| `selectedPoint` | `null` | `null` | |
| `navState.focusedIndex` | `null` | `index` | |
| `trailDepth` | `0` | `0` | **NOTE**: clicking a search result triggers `trailDepth=1` as a side-effect — this is working-as-designed per codebase (lifecycle.js calls `setTrailDepth(1)` in the focus pipeline). Users see the Trail chip activate but have NOT yet Stepped Inside. |
| `semanticDiveMode` | `false` | `false` | |
| `navState.mode` | `overview` | `focus` | |
| `currentSearchSummary` | `{query…}` | `{query…}` | Preserved |
| `graphContext` | `search` | `focus-search` | Both search intent AND focus present → combined |
| `panelSurface` | `search` | `focus-search` | |
| `trailState` | `inactive` | `active` | `hasActiveTrailState = hasFocusedTrailRecord && (mode==='trail' || hasSearchIntent)` |

**Trigger**: Click `.search-result-item` → `event-bindings.js` click handler → `focusOnNode()`  
**Owner API**: `window.focusOnNode(index)`  
**Key code path**: `camera-controls.js:focusOnNode()` → sets `focusedNode`, `navState.focusedIndex`, `navState.mode='focus'` → `refreshCompositionState()`  
**Verified side effect**: `focusOnNode` at `camera-controls.js:922` calls `refreshCompositionState()`. The focus pipeline (lifecycle.js:924) also calls `setTrailDepth(1)` — **this sets trailDepth=1 on focus entry**, which activates the Trail chip.  
**DOM effect**: `body.dataset.graphContext=focus-search`, `body.dataset.panelSurface=focus-search`, `body.dataset.trailState=active`

**Verified behavior (from 3d-state-transition-integrity.spec.js:266-269)**:
> clicking a search result triggers trailDepth=1 as a side effect (setTrailDepth 1 is called in the focus pipeline). This is working-as-designed per current codebase; trailDepth 1 means the Trail chip activates but the user has not yet Stepped Inside (trailDepth 2).

---

### T3: focus → semantic-dive (Step Inside)

| Field | focus (before) | semantic-dive (after) | Notes |
|---|---|---|---|
| `focusedNode` | `index` | `index` | Unchanged |
| `selectedPoint` | `null` | `null` | |
| `navState.focusedIndex` | `index` | `index` | |
| `trailDepth` | `1` | `2` | Explicit upgrade via `setSemanticDiveMode(true)` |
| `semanticDiveMode` | `false` | `true` | Setter maps `true → trailDepth=2` |
| `navState.mode` | `focus` | `trail` | `setSemanticDiveMode` sets `mode='trail'` (lifecycle.js:2557) |
| `currentSearchSummary` | `{query…}` | `{query…}` | Preserved |
| `graphContext` | `focus-search` | `focus` | Dive mode suppresses focus-search → focus (lifecycle.js:1177-1178) |
| `panelSurface` | `focus-search` | `semantic-dive` | |
| `semanticDive` | `inactive` | `active` | `dataset.semanticDive = 'transitioning'` briefly (820ms) then `'active'` |
| `trailState` | `active` | `active` | Still active (hasSearchIntent still true) |

**Trigger**: Click `#btn-focus-dive` OR call `window.setSemanticDiveMode(true)`  
**Owner API**: `window.setSemanticDiveMode(true)` (lifecycle.js:2549)  
**Key code path**:
1. `setSemanticDiveMode(true)` → `state.semanticDiveMode = true` → `navState.mode = 'trail'`
2. calls `window.setTrailDepth(2, {fromUserGesture: true})`
3. sets `body.dataset.semanticDive = 'transitioning'`
4. calls `window.syncSemanticDiveUi()` → `window.updateExplorationUi()`
5. calls `window.refreshCompositionState()`
6. After 820ms: `body.dataset.semanticDive = 'active'` (via setTimeout in lifecycle.js:2571)

**Verified behavior** (from lifecycle.js:2553-2565):
```javascript
window.setSemanticDiveMode = function (enabled) {
    const nextActive = Boolean(enabled);
    state.semanticDiveMode = nextActive;
    if (nextActive) {
        state.navState.mode = 'trail';  // <-- mode forced to 'trail'
    }
    if (typeof window.syncSemanticDiveUi === 'function') window.syncSemanticDiveUi();
    if (typeof window.setTrailDepth === 'function') {
        window.setTrailDepth(nextActive ? 2 : 1, { fromUserGesture: true });
    }
    // ...
    if (typeof window.refreshCompositionState === 'function') window.refreshCompositionState();
};
```

**DOM effect**: `body.dataset.graphContext=focus`, `body.dataset.panelSurface=semantic-dive`, `body.dataset.semanticDive=active`, `body.dataset.journeyPhase=inside`

---

### T4: semantic-dive → map-trail (switch to map view while in dive)

| Field | semantic-dive (before) | map-trail (after) | Notes |
|---|---|---|---|
| `focusedNode` | `index` | `index` | Unchanged |
| `selectedPoint` | `null` | `object` | Set during map handoff |
| `navState.focusedIndex` | `index` | `index` | |
| `trailDepth` | `2` | `1` | **BUG**: `syncSemanticDiveUi` forces `semanticDiveMode=false` which sets `trailDepth=1` |
| `semanticDiveMode` | `true` | `false` | **BUG**: force-cleared by `syncSemanticDiveUi` when `canDive=false` (currentView!=='galaxy') |
| `navState.mode` | `trail` | `trail` | |
| `currentSearchSummary` | `{query…}` | `{query…}` | |
| `activeView` | `galaxy` | `map` | |
| `graphContext` | `focus` | `idle` | Map branch forces graphContext='idle' |
| `mapContext` | `idle` | `focus-search` | hasFocus + hasSearchIntent in map |
| `panelSurface` | `semantic-dive` | `map-focus-search` | |
| `semanticDive` | `active` | `inactive` | Map branch forces 'inactive' (lifecycle.js:1134) |

**Trigger**: Click `#btn-map` OR call `window.switchView('map')`  
**Owner API**: `window.switchView('map')`  
**Key code path**:
1. `switchView('map')` sets `state.currentView = 'map'`
2. calls `refreshCompositionState()`
3. `refreshCompositionState()` at line 1147 calls `syncSemanticDiveUi()`
4. `syncSemanticDiveUi()` (semantic-dive-ui.js:47-50):
   ```javascript
   if (state.semanticDiveMode && !canDive) {
       state.semanticDiveMode = false;  // <-- FORCE CLEARED
       if (typeof window.updateExplorationUi === 'function') window.updateExplorationUi();
   }
   ```
5. `state.semanticDiveMode = false` triggers the setter (state.js:396-398) → `state.trailDepth = 0` (setter maps `false → trailDepth=0`); **BUT** the setter also maps `false → trailDepth=0`, NOT to 1. Wait — actually `false → trailDepth = 0` per state.js. Let me re-check.

**ACTUAL BUG DETAIL** (from 3d-state-transition-integrity.spec.js:381-388 and lifecycle.js:47-50):

The bug is that `syncSemanticDiveUi` force-clears `semanticDiveMode` when `canDive` becomes false (view !== galaxy), which cascades:

1. `switchView('map')` → `refreshCompositionState()` → `syncSemanticDiveUi()` called at lifecycle.js:1147 AND 1199 (both galaxy and map branches)
2. `syncSemanticDiveUi()` sees `canDive = currentView==='galaxy' && hasFocus` → false (currentView is now 'map')
3. It sets `state.semanticDiveMode = false` (semantic-dive-ui.js:48)
4. The `semanticDiveMode` setter maps `false → state.trailDepth = 0` (state.js:397: `else state.trailDepth = 0`)
5. But the contract test at 3d-state-transition-integrity.spec.js:385-388 shows `trailDepth` ends up at `1` (not 0), which means `setTrailDepth` may have been called with 1 during the map handoff (possibly by `focusOnNode` → lifecycle.js:925 calling `setTrailDepth(1)`)

**INVARIANT STILL HOLDS**: `semanticDiveMode === (trailDepth === 2)` remains consistent — when map is switched, both are false/0, so the invariant is not violated. **However**, the user EXPECTS `semanticDiveMode=true` to persist when switching views — the semantic dive state should be preserved, not force-cleared.

**Contract test confirmed** (3d-state-transition-integrity.spec.js:380-388):
```
// NOTE: switchView('map') → refreshCompositionState() → syncSemanticDiveUi() calls
// setSemanticDiveMode(false) when canDive becomes false (because currentView !== 'galaxy').
// This is a known side-effect bug: semanticDiveMode should NOT be cleared merely by
// switching views while in dive mode.
expect(snap.semanticDiveMode, 'semanticDiveMode matches trailDepth').toBe(snap.trailDepth === 2);
```

---

### T5: map-trail → reset (Escape / resetExplorationFocus)

| Field | map-trail (before) | reset/overview (after) | Notes |
|---|---|---|---|
| `focusedNode` | `index` | `null` | Cleared |
| `selectedPoint` | `object` | `null` | Cleared |
| `navState.focusedIndex` | `index` | `null` | Cleared |
| `trailDepth` | `1` | `0` | Cleared |
| `semanticDiveMode` | `false` | `false` | Already false |
| `navState.mode` | `trail` | `overview` | Reset |
| `currentSearchSummary` | `{query…}` | `null` | Cleared by `resetStateBeforeUrlRestore` |
| `activeView` | `map` | `galaxy` | Reset |
| `graphContext` | `idle` | `idle` | |
| `mapContext` | `focus-search` | `idle` | |
| `panelSurface` | `map-focus-search` | `idle` | |
| `semanticDive` | `inactive` | `inactive` | |
| `trailState` | `active` | `inactive` | |

**Trigger**: Escape key OR `window.resetExplorationFocus()` OR `window.resetStateBeforeUrlRestore()`  
**Owner API**: `window.resetExplorationFocus()` (lifecycle.js:705) and `window.resetStateBeforeUrlRestore()` (lifecycle.js:740)  
**Key code path** (resetExplorationFocus):
1. `setMyceliumMode('default')`, `setTrailDepth(0)`
2. `resetNodePositions({preserveSearch:true})` → clears `focusedNode`, `selectedPoint`, `navState.focusedIndex`
3. `clearSearchGlow()`
4. `syncFocusStage(null)`
5. `refreshCompositionState()`
6. `updateExplorationUi()`

**Key code path** (resetStateBeforeUrlRestore):
1. Clears `currentSearchSummary`, `selectedPoint`, `focusedNode`, `navState.focusedIndex`
2. `setTrailDepth(0, {allowDiveExit:true})`
3. `clearSearchGlow()`
4. `refreshCompositionState()`

**DOM effect**: All dataset attributes return to `idle`/`inactive`/`galaxy` — full clean state restored.

---

## derivePanelSurface() Logic

```
derivePanelSurface({ view, graphContext, mapContext, semanticDive, hasSearchIntent, hasFocus, hasActiveTrailState })

Galaxy (view === 'galaxy'):
  semanticDive === 'active'|'transitioning' → 'semantic-dive'
  graphContext === 'focus-search'            → 'focus-search'
  graphContext === 'focus'                   → 'focus'
  graphContext === 'search'                  → 'search'
  hasSearchIntent && !hasFocus               → 'search'
  else                                       → 'idle'

Map (view !== 'galaxy'):
  mapContext === 'focus-search'              → 'map-focus-search'
  mapContext === 'focus'                    → 'map-focus'
  mapContext === 'search'                   → 'map-search'
  hasActiveTrailState                       → 'map-trail'
  else                                      → 'map-idle'
```

---

## Key Decision / Design Hotspots

### HD-1: focus → search side effect on trailDepth
Clicking a search result currently triggers `setTrailDepth(1)` as a side effect (lifecycle.js:925). This activates the Trail chip even though the user has not clicked "Step Inside".  
**User expectation**: Clicking a result should focus only; Trail chip activation should require a separate action.  
**Code behavior**: Both `setTrailDepth(1)` AND focus happen in the focus pipeline.  
**Decision needed**: Should clicking a search result set `trailDepth=1`? This is a product call — the current behavior is intentional but may not match UX intent.  
**Verified by**: 3d-state-transition-integrity.spec.js:266-269, lifecycle.js:924-926

### HD-2: semanticDiveMode force-cleared on switchView to map
`syncSemanticDiveUi()` (semantic-dive-ui.js:47-50) force-clears `semanticDiveMode` when `currentView !== 'galaxy'`. This is a known side-effect bug (documented in 3d-state-transition-integrity.spec.js:381-384).  
**Code behavior**: `setSemanticDiveMode(false)` → trailDepth=0/1 → user loses dive state when switching to map.  
**Desired behavior**: Semantic dive state should persist across view switches — the user should be able to switch back to galaxy and resume the dive.  
**Decision needed**: Should semanticDiveMode be preserved across view switches? A proper fix would require `syncSemanticDiveUi()` to NOT force-clear on canDive becoming false, or to store/restore the dive state.  
**Verified by**: 3d-state-transition-integrity.spec.js:381-388, semantic-dive-ui.js:47-50, lifecycle.js:1147

### HD-3: navState.mode='trail' set by setSemanticDiveMode (journey.js) vs lifecycle.js
Two `setSemanticDiveMode` implementations exist:
- `js/modules/journey.js:1070`: Sets `navState.mode='trail'` on activation
- `js/modules/lifecycle.js:2549`: Also sets `navState.mode='trail'` on activation  
Both are nearly identical; journey.js appears to be the primary export used by `window.setSemanticDiveMode` (app.js:118 → lifecycle.js:2549). The journey.js version at line 1070 appears unused by the window export chain.  
**Decision needed**: Consolidate to one implementation.

### HD-4: panelSurface='semantic-dive' only in galaxy
Semantic dive panel surface is only rendered when `currentView === 'galaxy'`. In map mode, `semanticDive` is forced to `inactive` (lifecycle.js:1134) and `panelSurface` derives as map context.  
**Design question**: Should map mode have a distinct `panelSurface` value for "inside map trail"? Currently it falls through to `map-focus-search`.

---

## Proposed Contract Tests per Transition

| Transition | Contract test file | What to test |
|---|---|---|
| T1 overview→search | `tests/search-state-surface-contract.mjs` | graphContext=search, panelSurface=search, semanticDive=inactive |
| T2 search→focus | `tests/focus-transition-contract.mjs` + `tests/state-transition-contract.mjs` | focusedNode set, graphContext=focus-search, panelSurface=focus-search, trailState=active |
| T3 focus→dive | `tests/semantic-dive-reverse-contract.mjs` | semanticDiveMode=true, trailDepth=2, panelSurface=semantic-dive |
| T4 dive→map | `tests/3d-state-transition-integrity.spec.js` (Phase 5) | **BUG: semanticDiveMode force-cleared** — add explicit FAILING test documenting desired behavior |
| T5 reset | `tests/reset-experience-state.spec.js` + `tests/live-reset-proof-wave2.spec.js` | all fields null/0/false, dataset=idle |

### Tests that can be deleted/merged
- `tests/visual-state-audit.mjs` — redundant with `state-transition-contract.mjs` for dataset assertions
- `tests/focus-semantic-state-boundary-contract.mjs` — covered by `state-transition-contract.mjs` phases 3-4
- `tests/connection-analysis-render-state-contract.mjs` — concerns render state, not transition state
- `tests/mode-chip-state-render-contract.mjs` — concerns chip rendering, not state machine

---

## Open Decisions (Require Product Call)

1. **HD-1 (trailDepth on search result click)**: Should clicking a result auto-activate Trail chip (trailDepth=1)? Current code: yes. UX intent: unclear — the chip "Trail" label and "Step Inside" interaction suggest depth=1 is a separate affordance.
2. **HD-2 (semanticDiveMode across view switches)**: Should dive state survive switching to map and back? Current code: no. User expectation: likely yes — switching view should not lose dive state.
3. **HD-3 (duplicate setSemanticDiveMode)**: Two implementations exist. Which is canonical? Journey.js 1070 appears to be the older one; lifecycle.js 2549 is what window.setSemanticDiveMode points to.

---

## Files Inspected

| File | Key findings |
|---|---|
| `tests/3d-state-transition-integrity.spec.js` | Phase 5 documents the switchView bug; Phase 3 documents trailDepth=1 side effect |
| `tests/state-transition-contract.mjs` | Phases 1-6 define expected state per transition; edges 1-6 |
| `js/state.js:393-398` | semanticDiveMode getter: `trailDepth === 2`; setter: `true→2, false→0` |
| `js/modules/semantic-dive-ui.js:44-198` | syncSemanticDiveUi — **contains bug**: force-clears semanticDiveMode when canDive=false |
| `js/modules/lifecycle.js:705-784` | resetExplorationFocus + resetStateBeforeUrlRestore |
| `js/modules/lifecycle.js:1071-1085` | derivePanelSurface |
| `js/modules/lifecycle.js:1093-1205` | refreshCompositionState galaxy+map branches |
| `js/modules/lifecycle.js:1331-1505` | switchView |
| `js/modules/lifecycle.js:2549-2605` | window.setSemanticDiveMode (overrides journey.js version) |
| `js/modules/journey.js:1070-1103` | journey.js setSemanticDiveMode (older, appears superseded) |
| `docs/semantic-demo-state-transition-table.md` | Existing doc — needs updating with bug HD-2 and test gaps |