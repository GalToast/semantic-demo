# Semantic Explorer — Canonical State Transition Table

> **Purpose:** Single source of truth for the semantic explorer's view-phase state machine.
> Defines all phases, their body-dataset signatures, JS-state fields, URL param contracts,
> and the official reset/orchestration API. All other docs must converge here.

**Verified against:** `js/state.js` lines 67, 148, 182-200, 216, 239-241, 394-402, 679-744, 811-844, 984-987, 1077-1091, 1099-1213, 1337-1588, 2112-2141, 2394-2421, 2551-2607, `js/modules/semantic-dive-ui.js` lines 54-77, `js/modules/journey.js` lines 337-344, 363, 1081-1085.

---

## Phase Definitions

| Phase | Description | navState.mode | trailDepth | semanticDiveMode | currentView | currentSearchSummary |
|-------|-------------|---------------|------------|-----------------|-------------|----------------------|
| **overview** | Initial galaxy load. No search, no focus. | `'overview'` | 0 | false | `'galaxy'` | null |
| **search** | Search submitted. Results rendered. Anchor may be set. | `'search'` | 0 or 1 | false | `'galaxy'` | non-null |
| **focus** | A node is focused (selectedPoint / focusedNode set). Trail may or may not exist. | `'focus'` | 0 or 1 | false | `'galaxy'` | nullable |
| **inside** | "Step Inside" — user entered semantic-dive / neighborhood walk. | `'inside'` | 2 | true | `'galaxy'` | non-null |
| **map-trail** | Map view with active trail. | `'map'` | 1 or 2 | depends | `'map'` | non-null |

---

## Body Dataset Fields by Phase

**Sourced from three separate sync functions in `js/modules/lifecycle.js`:**

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
| search | focus | `focusOnNode(index)` — user clicks a result or anchor |
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
    if (typeof window.syncFocusStage === 'function') window.syncFocusStage(null);
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
- `switchView()` also updates `body.dataset.activeView`

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
- `body.dataset.journeyPhase` is set from `getJourneyCompassState().phase` (from `journey-compass-state.js`)

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
  hasSearchIntent = currentSearchSummary OR input.length >= 2 OR active results
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

*Last verified against:* `js/state.js` line 67, `js/modules/lifecycle.js` lines 67-68, 182-200, 216, 239-241, 679-744, 811-844, 984-987, 1077-1091, 1099-1213, 1337-1588, 2112-2141, 2394-2421, 2551-2607, `js/modules/semantic-dive-ui.js` lines 54-77, `js/modules/journey.js` lines 337-344, 363, 1081-1085.