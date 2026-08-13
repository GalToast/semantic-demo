# Semantic Explorer — Canonical State Transition Table

> **Purpose:** Single source of truth for the semantic explorer's view-phase state machine.
> Defines all phases, their body-dataset signatures, JS-state fields, URL param contracts,
> and the official reset/orchestration API. All other docs must converge here.

> ⚠️ **Last refreshed 2026-06-29:** The phase machine itself (`overview → search → focus → inside → map-trail`) and the dataset and URL contracts are **stable and unchanged**. The references to `js/state.js`, `js/modules/lifecycle.js`, `js/modules/search-state.js`, etc. are **stale**: that engine was retired by W42. The canonical modern equivalents are:
>
> | Legacy path cited in this doc | Modern home |
> |---|---|
> | `js/state.js` | `src/lib/state/app.svelte.ts` (state class) + `src/lib/state/state-types.ts` (interfaces) |
> | `js/modules/lifecycle.js` | `src/lib/orchestration/lifecycle.ts` + `src/lib/stores/lifecycle.ts` |
> | `js/modules/semantic-dive-ui.js` | `src/lib/journey/semantic-dive.ts` |
> | `js/modules/journey.js` | `src/lib/journey/journey.ts` (+ 30+ satellites) |
> | `js/modules/search-state.js` | `src/lib/stores/search.svelte.ts` |
> | `js/modules/lifecycle.js` (reset & URL) | `src/lib/orchestration/lifecycle.ts` (`returnToOverview`, `resetExperienceState`, `refreshCompositionState`, `updateUrlState`); `src/lib/stores/lifecycle.ts` (`resetExplorationFocus`) |
> | `js/modules/camera-controls.js` (`focusOnNode`) | `src/lib/engine/camera-controls.ts` |
> | `js/modules/thread-inspector.js` | `src/lib/journey/thread-inspector-{state,render,adapter}.ts` |
> | Window globals (`window.setSemanticDiveMode`, `window.refreshCompositionState`) | The same calls now live as exports in `src/lib/stores/focus.svelte.ts` (`setSemanticDiveMode`), `src/lib/orchestration/lifecycle.ts` (`refreshCompositionState`), etc. |
>
> Field types are defined in `src/lib/state/state-types.ts` (`NavState`, `ActiveFilters`, `ViewName`, `CompassPhase`, `Point[]`, etc.). Field values are mutated through the Svelte 5 state class via `withStateMutation(...)`. The "Key State Fields" section at the bottom of this doc maps each surfaced field to its modern type or accessor.
>
> **For implementation authority, read the source code in `src/lib/...`. For drift between this doc and the code, follow the source. For historical context (W47-A through W48) consult `docs/migration-plan.md` and `docs/typing-contract.md`.**

---

## Phase Definitions

| Phase | Description | navState.mode | trailDepth | semanticDiveMode | currentView | currentSearchSummary |
|-------|-------------|---------------|------------|-----------------|-------------|----------------------|
| **overview** | Initial galaxy load. No search, no focus. | `'overview'` | 0 | false | `'galaxy'` | null |
| **search** | Search submitted. Results rendered. Anchor may be set by explicit selection. Typing a replacement query while the input owns focus must not create scene focus. | `'search'` | 0 or 1 | false | `'galaxy'` | non-null |
| **focus** | A node is focused (selectedPoint / focusedNode set). Trail may or may not exist. | `'focus'` | 0 or 1 | false | `'galaxy'` | nullable |
| **inside** | "Step Inside" — user entered semantic-dive / neighborhood walk. | `'inside'` | 2 | true | `'galaxy'` | non-null |
| **map-trail** | Map view with active trail. | `'map'` | 1 or 2 | depends | `'map'` | non-null |

---

## Body Dataset Fields by Phase

**Sourced from the parity-bridge sync in `src/lib/orchestration/parity-attrs.svelte.ts` (the modern equivalent of the old `js/modules/lifecycle.js` sync functions: `switchView()`, `refreshCompositionState()`, `updateExplorationUi()`).** The dataset values drive CSS animations and layout shifts in the module CSS under `css/`.

| Dataset Field | Set by | overview | search | focus | inside | map-trail |
|--------------|--------|----------|--------|-------|--------|-----------|
| `activeView` | `switchView()` / `refreshCompositionState()` | `'galaxy'` | `'galaxy'` | `'galaxy'` | `'galaxy'` | `'map'` |
| `graphContext` | `refreshCompositionState()` | `'idle'` | `'search'` or `'focus-search'` | `'focus'` or `'focus-search'` | `'focus'` | `'idle'` (map path) |
| `mapContext` | `refreshCompositionState()` (map branch) | `'idle'` | (galaxy path) | (galaxy path) | (galaxy path) | active trail context |
| `semanticDive` | `refreshCompositionState()` / `setSemanticDiveMode()` | `'inactive'` | `'inactive'` | `'inactive'` | `'active'` or `'transitioning'` | `'inactive'` |
| `trailState` | `refreshCompositionState()` | `'inactive'` | `'inactive'` or `'active'` | `'active'` | `'active'` | `'active'` |
| `trailDepth` | `updateExplorationUi()` | `0` | `0` or `1` | `0` or `1` | `2` | `1` or `2` |
| `myceliumMode` | `updateExplorationUi()` | `'default'` | `'default'` | any | any | any |
| `panelSurface` | `refreshCompositionState()` via `derivePanelSurface()` | `'idle'` | `'search'` / `'focus-search'` | `'focus'` / `'focus-search'` | `'semantic-dive'` | `'map-trail'` / `'map-focus-search'` / etc. |
| `panelSurfaceDetail` | `refreshCompositionState()` | `'none'` | `'none'` or mobile sheet | `'none'` or mobile sheet | `'none'` | `'none'` |
| `journeyPhase` | `updateJourneyCompass()` | `'overview'` | `'search'` | `'focus'` | `'inside'` | `'map'` |
| `journeyCompassDensity` | `updateJourneyCompass()` | `'expanded'` | `'compact'` | `'compact'` | `'compact'` | `'hidden'` |
| `journeyCompassCopy` | `updateJourneyCompass()` | `'full'` | `'quiet'` | `'quiet'` | `'quiet'` | `'quiet'` |
| `journeyNavigationOwner` | `updateJourneyCompass()` | `'journey-compass'` | `'scene'` | `'scene'` | `'inside-walk'` | `'map-trail-strip'` or `'map-controls'` |

---

## URL Param Contract

Managed by `updateUrlState()` in `js/modules/lifecycle.js`.

| URL Param | overview | search | focus | inside | map-trail |
|-----------|----------|--------|-------|--------|-----------|
| `view` | `'galaxy'` | `'galaxy'` | `'galaxy'` | `'galaxy'` | `'map'` |
| `q` | absent | search query | search query | search query | search query |
| `anchor` | absent | anchor lead_id | anchor lead_id | anchor lead_id | anchor lead_id |
| `record` | absent | focused lead_id | focused lead_id | focused lead_id | focused lead_id |
| `depth` | absent | absent or `1` | absent or `1` | `2` | `1` or `2` |
| `mode` | absent | `'trail'` if depth=1 | `'trail'` if depth=1 | `'trail'` | `'trail'` if depth>=1 |

---

## Phase Transition Diagram

```
                    ┌─────────────┐
                    │  overview   │
                    └──────┬──────┘
                           │ search input / search(query)
                           ▼
                    ┌─────────────┐
                    │   search    │
                    └──────┬──────┘
                           │ focusOnNode() / click result
                           ▼
                    ┌─────────────┐
                    │   focus     │
                    └──────┬──────┘
                           │ setTrailDepth(2) / setSemanticDiveMode(true)
                           │ (fromUserGesture required for depth=2)
                           ▼
                    ┌─────────────┐
                    │   inside    │
                    │(semantic-dive)│
                    └──────┬──────┘
                           │ switchView('map')
                           ▼
                    ┌─────────────┐
                    │ map-trail   │
                    └──────┬──────┘
                           │
           ┌───────────────┴───────────────┐
           │  resetExplorationFocus()      │
           │  (preserves search)            │
           ▼                               ▼
    ┌─────────────┐                ┌─────────────┐
    │   focus     │                │  overview  │
    │(search held)│                │ resetExperienceState()
    └─────────────┘                │ returnToOverview()
                                   │ (Esc key)
                                   └─────────────┘
```

**Transitions:**

| From | To | Trigger |
|------|----|---------|
| overview | search | `search(query)` — user types and submits |
| search | focus | `focusOnNode(index)` — user clicks a result or anchor; keyboard navigation only enters this path after the user moves into/selects the result list |
| focus | inside | `setTrailDepth(2)` via `setSemanticDiveMode(true)` — user clicks "Step Inside" |
| inside | map-trail | `switchView('map')` |
| *(any)* | overview | `resetExperienceState()` / `returnToOverview()` / Esc — full clear |
| *(any)* | focus (search preserved) | `resetExplorationFocus()` — focus/trail cleared, search kept |

---

## Official Reset / Orchestration API

### `resetExplorationFocus()` — *Preserve Search*

**File:** `js/modules/lifecycle.js` line 711

Resets focus, trail, and mycelium mode **without** clearing the active search.
Use for "Return to overview" when search context should be retained.

```js
// Signature
export function resetExplorationFocus() {
    setMyceliumMode('default', { skipUrlSync: true });
    setTrailDepth(0, { skipUrlSync: true });
    resetNodePositions({ preserveSearch: true });  // clears glow only if preserveSearch=true
    clearSearchGlow();
    syncFocusStage(null);
    if (typeof window.refreshCompositionState === 'function') window.refreshCompositionState();
    if (typeof window.updateExplorationUi === 'function') window.updateExplorationUi();
}
```

**State effects:**

- `myceliumMode` → `'default'`
- `trailDepth` → `0`
- `focusedNode` → `null`
- `selectedPoint` → `null`
- `navState.mode` → `'overview'`
- `navState.trailCursor` → `-1`
- `trailIndices` → cleared
- `currentSearchSummary` → **preserved**
- `currentSearchSummary.anchorIndex` → **preserved**

### `resetExperienceState()` — *Full Reset*

**File:** `js/modules/lifecycle.js` line 679

Full scene reset including search, filters, focus, and trail. Returns to galaxy view.
Used by: reset button, Esc key, `returnToOverview()`.

```js
// Signature
export function resetExperienceState() {
    resetStateBeforeUrlRestore({ clearSearchInput: true });
    if (typeof window.switchView === 'function') {
        window.switchView('galaxy', { skipUrlSync: true, silentHandoff: true });
    }
    if (typeof window.updateUrlState === 'function') {
        window.updateUrlState(
            { q: null, anchor: null, record: null, offset: null,
              status: null, city: null, website: null, email: null,
              geocoded: null, mode: null, story: null, cluster: null },
            { reason: 'reset', mode: 'replace' }
        );
    }
    showExperienceToast('Scene restored', 'Search, connection path, filters, and map handoff cleared.');
}
```

**State effects:**

- `currentSearchSummary` → `null`
- `selectedPoint` → `null`
- `focusedNode` → `null`
- `navState.focusedIndex` → `null`
- `activeFilters` → defaults
- `activeStoryPrompt` → `null`
- `trailDepth` → `0`
- `myceliumMode` → `'default'`
- `currentView` → `'galaxy'`

### `returnToOverview()` — *Full Reset Alias*

**File:** `js/modules/lifecycle.js` line 742

```js
export function returnToOverview() { resetExperienceState(); }
```

### `resetStateBeforeUrlRestore()` — *Pre-restore Cleanup*

**File:** `js/modules/lifecycle.js` line 746

Called before URL state is reapplied. Clears search, focus, trail, and filters.

```js
// Signature
export function resetStateBeforeUrlRestore(options = {}) {
    // Aborts searchTimeout / searchAbortController
    // Increments searchRequestSequence
    if (options.clearSearchInput) input.value = '';
    state.currentSearchSummary = null;
    state.activeClusterFilter = null;
    state.activeStoryPrompt = null;
    setMyceliumMode('default', { skipUrlSync: true });
    state.activeFilters = { status: 'all', city: 'all', website: false, email: false, geocoded: false };
    state.selectedPoint = null;
    state.focusedNode = null;
    state.navState.focusedIndex = null;
    setTrailDepth(0, { skipUrlSync: true, allowDiveExit: true });
    // ... clears glow, filters, cluster UI
    state.navState.trailCursor = -1;
    state.navState.mode = 'overview';
    state.navState.explorationHistoryIndices = [];
    state.navState.threadCandidates = [];
    state.trailIndices.clear();
}
```

### `setSemanticDiveMode(enabled)` — *Enter/Exit Semantic Dive*

**File:** `js/modules/lifecycle.js` line 2551 (window bridge)

```js
// Signature
window.setSemanticDiveMode = function (enabled) {
    const nextActive = Boolean(enabled);
    state.semanticDiveMode = nextActive;
    if (nextActive) state.navState.mode = 'trail';
    if (typeof window.syncSemanticDiveUi === 'function') window.syncSemanticDiveUi();
    if (typeof window.setTrailDepth === 'function') {
        window.setTrailDepth(nextActive ? 2 : 1, { fromUserGesture: true });
    }
    if (state.semanticDiveMode) {
        document.body.dataset.semanticDive = 'transitioning';
        window.setTimeout(() => {
            if (state.semanticDiveMode && document.body.dataset.semanticDive === 'transitioning') {
                document.body.dataset.semanticDive = 'active';
            }
        }, 820);
        // Camera dive + focus pocket reapply
    } else {
        // Camera restore + focus pocket reapply
        if (document.body.dataset.threadInspectSurface === 'inside-cue') {
            if (typeof window.clearThreadInspection === 'function') window.clearThreadInspection({ force: true, preserveJourney: true });
        }
    }
    if (typeof window.refreshCompositionState === 'function') window.refreshCompositionState();
    if (typeof window.updateUrlState === 'function') window.updateUrlState({}, { reason: 'semantic-dive' });
};
```

---

## Key State Fields

> Field types live in `src/lib/state/state-types.ts` (`NavState` interface at line 162, `ActiveFilters`, `ViewName`, `CompassPhase`, `ThreadSource`, `LoadingPhaseKey`, etc.). Field values are stored on `appState` from `src/lib/state/app.svelte.ts` (Svelte 5 state class) and mutated through `withStateMutation(...)` from `src/lib/state/with-state-mutation.ts`. The compat path `src/lib/state/legacy-state.ts` exposes `legacyState.navState` and friends for engine modules that haven't completed the conversion. The line-number references below (e.g., "File: js/state.js line 182") are historical — read `src/lib/state/state-types.ts` for current declared types.

### `navState.mode` — Primary Phase Flag

**File:** `js/state.js` line 182

```js
navState: {
    mode: 'overview',  // 'overview' | 'search' | 'focus' | 'inside' | 'map'
    focusedIndex: null,
    trailSeedIndex: null,
    trailNeighborIndices: [],
    trailCursor: -1,
    walkHistoryIndices: [],
    lastTraversalReason: null,
    threadCandidates: [],
    threadReasonByIndex: new Map(),
    threadSource: 'geometric-fallback',
    focusPocketIndices: [],
    focusPocketMeta: null,
    focusPocketRoleByIndex: new Map(),
    focusPocketAnimationFrameId: null,
    focusFramingMeta: null,
    currentPersonality: null,
    neighborhoodIndices: []
}
```

Transitions: `mode` is set by `setMyceliumMode()`, `setTrailDepth()`, `resetNodePositions()`, and `resetStateBeforeUrlRestore()`.

### `trailDepth` — Trail Progression Level

**File:** `js/state.js` line 216

| Value | Meaning |
|-------|---------|
| `0` | Overview / search / focus — no trail |
| `1` | Trail active — user has focused a record |
| `2` | Inside — "Step Inside" semantic-dive mode |

- `trailDepth >= 1` → `myceliumMode` must be `'trail'`
- `trailDepth === 2` requires `fromUserGesture: true` on `setTrailDepth()` (gate at line 386)
- `trailDepth === 2` sets `semanticDiveMode = true` (via getter/setter at line 394)

### `semanticDiveMode` — Derived from trailDepth

**File:** `js/state.js` line 394

```js
Object.defineProperty(state, 'semanticDiveMode', {
    get: () => state.trailDepth === 2,
    set: (val) => {
        if (val === true) state.trailDepth = 2;
        else state.trailDepth = 0;
    },
    configurable: true,
    enumerable: true
});
```

### `currentView` — Galaxy vs Map

**File:** `js/state.js` line 148

```js
currentView: 'galaxy'  // 'galaxy' | 'map'
```

- `switchView('map')` → sets `currentView = 'map'`
- `switchView('galaxy')` → sets `currentView = 'galaxy'`
- `switchView()` owns `body.dataset.activeView`; `refreshCompositionState()` mirrors it from `state.currentView`

### `currentSearchSummary` — Search Result Container

**File:** `js/state.js` line 173

```js
currentSearchSummary: null  // { query, anchorIndex, resultIndices, ... }
```

Set by `search()` in `js/modules/search-state.js`. Cleared by `resetStateBeforeUrlRestore()`,
`clearSearch()`, and `resetExperienceState()`.

---

## Journey Compass Phase Order

**File:** `js/state.js` line 67

```js
JOURNEY_COMPASS_PHASE_ORDER: ['overview', 'search', 'focus', 'inside', 'map']
```

- `map` in compass order represents the map view phase, not `navState.mode === 'map'`
- The compass renders `inside` / `map` steps based on `currentView === 'map'`, not `navState.mode`
- `body.dataset.journeyPhase` is set by `journey-compass-controller.js` from `getJourneyCompassState().phase`; semantic-dive UI may mark active dives as `inside`

---

## Garbage-state Guards

These combinations should never occur:

| Invalid State | Why | Guard |
|--------------|-----|-------|
| `trailDepth === 2` with `navState.mode !== 'inside'` | Dive mode requires inside phase | `setTrailDepth(2)` requires `fromUserGesture: true` |
| `semanticDiveMode === true` with `currentView === 'map'` | Dive is a galaxy-phase concept | `setSemanticDiveMode(false)` called on `switchView('map')` |
| `currentSearchSummary !== null` with `navState.mode === 'overview'` | Search implies search phase | `currentSearchSummary` set only by `search()` |
| `trailDepth === 0` with `trailIndices.size > 0` | No trail without depth | `setTrailDepth(0)` clears `trailIndices` |

---

## Transition Derivation Logic (refreshCompositionState)

```
Galaxy branch (currentView === 'galaxy'):
  hasFocusedTrailRecord = selectedPoint OR focusedNode !== null OR focusedIndex !== null
  hasSearchIntent = currentSearchSummary OR input.length >= 2
  hasActiveTrailState = hasFocusedTrailRecord AND (navState.mode === 'trail' OR hasSearchIntent)

  semanticDive = semanticDiveMode AND hasFocusedTrailRecord
      ? (document.body.dataset.semanticDive === 'transitioning' ? 'transitioning' : 'active')
      : 'inactive'

  if semanticDive === 'active' OR semanticDive === 'transitioning'
      context = hasFocusedTrailRecord ? 'focus' : 'idle'
  else if hasFocusedTrailRecord AND hasSearchIntent → context = 'focus-search'
  else if hasFocusedTrailRecord                    → context = 'focus'
  else if hasSearchIntent                           → context = 'search'
  else                                              → context = 'idle'

  panelSurface = derivePanelSurface({ view, graphContext, mapContext: 'idle', semanticDive, hasSearchIntent, hasFocus: hasFocusedTrailRecord, hasActiveTrailState })

Map branch (currentView !== 'galaxy'):
  hasMapFocus = selectedPoint OR focusedNode !== null
  hasActiveTrailState = hasSearchIntent OR hasFocusedTrailRecord
  mapContext uses same hasFocus/hasSearchIntent logic
  graphContext always = 'idle'
  semanticDive always = 'inactive'
```

derivePanelSurface (lifecycle.js:1077):

```
if view !== 'galaxy':
  if mapContext === 'focus-search' → return 'map-focus-search'
  if mapContext === 'focus'        → return 'map-focus'
  if mapContext === 'search'       → return 'map-search'
  if hasActiveTrailState           → return 'map-trail'
  return 'map-idle'
if semanticDive === 'active' OR semanticDive === 'transitioning' → return 'semantic-dive'
if graphContext === 'focus-search' → return 'focus-search'
if graphContext === 'focus'        → return 'focus'
if graphContext === 'search'       → return 'search'
return 'idle'
```

---

*Last verified against:* `src/lib/state/state-types.ts` (NavState, CompassPhase, ViewName, ActiveFilters), `src/lib/state/app.svelte.ts` (state class), `src/lib/orchestration/lifecycle.ts` (refreshCompositionState, returnToOverview, resetExperienceState, switchView, updateUrlState), `src/lib/stores/lifecycle.ts` (`resetExplorationFocus`), `src/lib/stores/focus.svelte.ts` (`setSemanticDiveMode`, `setInfoPanelOpen`), `src/lib/journey/semantic-dive.ts`, `src/lib/journey/journey.ts`.

---

## Nav Transition Reducer — Consolidation Plan

> **Status:** Planned for future implementation (Wave 22).
> Current state: `navState.mode`, `trailDepth`, `focusedIndex`, trail/walk history are written
> by 8+ modules with no central orchestrator. The reducer consolidates these into one transition
> gate without breaking existing window-bridge APIs.
>
> **Evidence:** See `tmp/wave22-nav-transition-reducer-plan.md` for full analysis.

### 8.1 Current Scattered Writers (documented as transitional owners)

| Module | Field(s) written | Current phase |
|--------|-----------------|---------------|
| `lifecycle.js` — `setMyceliumMode()` | `navState.mode` | `'inside'` (line 241), `'overview'` (line 247) |
| `lifecycle.js` — `setSemanticDiveMode()` | `navState.mode = 'trail'` | line 226 |
| `lifecycle.js` — `resetNodePositions()` | `navState.mode = 'overview'` | line 1564 |
| `lifecycle.js` — `resetStateBeforeUrlRestore()` | `navState.mode = 'overview'` | line 739 |
| `lifecycle.js` — `setTrailDepth()` | `trailDepth` | line 304 |
| `camera-controls.js` — `focusOnNode()` | `navState.mode`, `navState.focusedIndex`, `trailDepth` | lines 1084-1099 |
| `journey.js` — `walkThreadNeighbor()` | `navState.mode = 'trail'`, `walkHistoryIndices` | line 612 |
| `thread-inspector.js` — `renderThreadInspection()` | `navState.mode = 'trail'` | transitional owner |
| `search-state.js` | `navState.mode = 'overview'` | filter eviction clear |
| `micro-demo.js` | various navState trail fields | demo mode only |
| `loading-ui.js` | `navState.mode = priorMode` | brief restore only |

### 8.2 Semantic Dissonance (core incoherence the reducer resolves)

```
setSemanticDiveMode(true):
  state.semanticDiveMode = true     ← derived setter sets trailDepth=2
  state.navState.mode = 'trail'     ← NOT 'inside'!
  setTrailDepth(2, { fromUserGesture: true })
  → trailDepth=2, semanticDiveMode=true, navState.mode='trail'

Phase table says: 'inside' phase requires navState.mode='inside'
But the above produces navState.mode='trail' with trailDepth=2
→ semanticDive='active' but navState.mode is 'trail'
→ The journey-compass sees 'inside' (from trailDepth) but mode is 'trail'
```

The reducer's `ENTER_INSIDE` action co-authors `trailDepth=2` **and** `navState.mode='inside'`
in one atomic step, resolving this dissonance.

### 8.3 Proposed Reducer Actions

| Action | Owned fields | Canonical callers |
|--------|-------------|-------------------|
| `FOCUS_NODE` | `navState.mode`, `navState.focusedIndex`, `navState.walkHistoryIndices`, `navState.trailCursor` | `camera-controls.focusOnNode()`, `thread-inspector.renderThreadInspection()` |
| `SET_DEPTH` | `trailDepth`, `myceliumMode`, `navState.mode` (co-authored) | `lifecycle.setTrailDepth()`, `lifecycle.setMyceliumMode()` |
| `WALK_TO` | `navState.walkHistoryIndices`, `navState.trailCursor`, `navState.lastTraversalReason`, `navState.mode` | `journey.walkThreadNeighbor()` |
| `BACKTRACK` | `navState.walkHistoryIndices`, `navState.trailCursor`, `navState.focusedIndex` | `journey.backtrackWalk()` |
| `RESET_FOCUS` | `navState.mode`, `navState.focusedIndex`, `navState.walkHistoryIndices`, `navState.trailCursor`, `trailDepth` | `lifecycle.resetExplorationFocus()`, `lifecycle.resetNodePositions()` |
| `RESET_EXPERIENCE` | All above + `currentSearchSummary=null` | `lifecycle.resetExperienceState()`, `lifecycle.resetStateBeforeUrlRestore()` |
| `ENTER_INSIDE` | `trailDepth=2`, `navState.mode='inside'` | `lifecycle.setSemanticDiveMode(true)` |
| `EXIT_INSIDE` | `trailDepth=1`, `navState.mode='trail'` | `lifecycle.setSemanticDiveMode(false)` |

### 8.4 Callsite Migration Order (7 phases)

**Phase 1** — Export reducer, no behavior change:

- Create `navTransitionReducer()` in `lifecycle.js` (internal, non-exported)
- Export `dispatchNavTransition()` as window bridge
- All existing callers unchanged; contracts verify reducer parity with scattered writers

**Phase 2** — Redirect `camera-controls.focusOnNode()`:

- Replace direct `navState.mode`, `navState.focusedIndex`, `navState.walkHistoryIndices` writes with `dispatchNavTransition('FOCUS_NODE', ...)`
- Retain direct writes to `focusedNode`, `selectedPoint` (its canonical domain)

**Phase 3** — Redirect `lifecycle.setTrailDepth` / `setMyceliumMode`:

- `setTrailDepth(n, opts)` → `dispatchNavTransition('SET_DEPTH', {depth:n, ...opts})`
- `setMyceliumMode('trail')` → `dispatchNavTransition('SET_DEPTH', {depth:1})`
- `setMyceliumMode('inside')` → `dispatchNavTransition('ENTER_INSIDE', {fromUserGesture:true})`
- `setMyceliumMode('default'|'bridge'|'bloom')` → `dispatchNavTransition('RESET_FOCUS')`

**Phase 4** — Redirect `journey.walkThreadNeighbor()` / `backtrackWalk()`:

- `walkThreadNeighbor()` → `dispatchNavTransition('WALK_TO', ...)`
- `backtrackWalk()` → `dispatchNavTransition('BACKTRACK')`

**Phase 5** — Redirect lifecycle reset functions:

- `resetNodePositions()` → `dispatchNavTransition('RESET_FOCUS')`
- `resetStateBeforeUrlRestore()` → `dispatchNavTransition('RESET_EXPERIENCE')`
- `resetExplorationFocus()` → `dispatchNavTransition('RESET_FOCUS', {preserveSearch:true})`

**Phase 6** — Redirect remaining transitional owners:

- `thread-inspector.renderThreadInspection()` → `dispatchNavTransition('FOCUS_NODE', {index, fromTraversal:true})`
- `search-state.js` filter-eviction → `dispatchNavTransition('RESET_FOCUS')`
- `micro-demo.js` demo focus/reset → `dispatchNavTransition(...)` (demo-specific payload)

**Phase 7** — Flag deprecated direct writers:

- Add `state-ownership-contract.mjs` assertion: no module may directly write `navState.mode`, `navState.walkHistoryIndices`, `navState.trailCursor`, `navState.trailNeighborIndices` outside the reducer
- Existing direct writes in journey, thread-inspector, search-state, micro-demo are "transitional owners" during migration window only

### 8.5 Breaking Change Audit (backward compatibility)

All existing window-bridge APIs remain callable:

| API | Internally routes to |
|-----|---------------------|
| `window.setSemanticDiveMode(bool)` | `dispatchNavTransition(bool ? 'ENTER_INSIDE' : 'EXIT_INSIDE')` |
| `window.setTrailDepth(n, opts)` | `dispatchNavTransition('SET_DEPTH', {depth:n, ...opts})` |
| `window.setMyceliumMode(mode, opts)` | Phase 3 migration above |
| `window.resetExplorationFocus()` | `dispatchNavTransition('RESET_FOCUS', {preserveSearch:true})` |
| `window.resetExperienceState()` | `dispatchNavTransition('RESET_EXPERIENCE')` |
| `window.focusOnNode(index, opts)` | `dispatchNavTransition('FOCUS_NODE', {index, ...opts})` |

### 8.6 Pre-condition: focus-pocket.js ownership fix

`resetNodePositions()` now clears focus-pocket role/motion maps through the focus-pocket owner helpers instead of assigning those maps directly. This pre-condition is satisfied before the reducer migration begins, so Phase 5 can move reset orchestration without reintroducing ownership-crossing writes.

Keep this invariant during the reducer migration:

```js
clearFocusPocketRoleByIndex();
clearFocusPocketMotionByIndex();
```

Do not restore direct `state.navState.focusPocketRoleByIndex = new Map()` or `state.focusPocketMotionByIndex = new Map()` writes outside `focus-pocket.js`.
