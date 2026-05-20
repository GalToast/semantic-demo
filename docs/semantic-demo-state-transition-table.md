# Semantic Demo State Transition Table

Canonical reference for the overview → search → focus → semantic-dive → map-trail → reset state machine.

## State Variables

| Variable | Type | Purpose |
|---|---|---|
| `state.focusedNode` | `number\|null` | Index of the focused node in `state.points` |
| `state.selectedPoint` | `object\|null` | Currently selected point record (lead_id, name, cluster…) |
| `state.navState.focusedIndex` | `number\|null` | Navigational focus index (separate from `focusedNode`) |
| `state.trailDepth` | `number` | Trail depth: 0 = none, 1 = trail active, 2 = semantic-dive inside |
| `state.semanticDiveMode` | `boolean` | Derived getter: `trailDepth === 2`. Setter adjusts `trailDepth`. |
| `state.navState.mode` | `string` | Journey mode: `overview`, `search`, `focus`, `trail`, `inside`, `map` |
| `state.currentView` | `string` | Active view: `galaxy` (3D) or `map` (Leaflet) |
| `state.currentSearchSummary` | `object\|null` | Active search result summary |

## Dataset Attributes (set by `refreshCompositionState()`)

| Attribute | Values | When |
|---|---|---|
| `activeView` | `galaxy` \| `map` | Always |
| `graphContext` | `idle` \| `search` \| `focus` \| `focus-search` | `currentView === 'galaxy'` |
| `mapContext` | `idle` \| `search` \| `focus` \| `focus-search` | `currentView !== 'galaxy'` |
| `semanticDive` | `inactive` \| `active` | `currentView === 'galaxy'` |
| `panelSurface` | `idle` \| `search` \| `focus` \| `focus-search` \| `semantic-dive` \| `map-idle` \| `map-search` \| `map-focus` \| `map-focus-search` \| `map-trail` | Always |
| `trailState` | `active` \| `inactive` | Always |
| `trailDepth` | `0` \| `1` \| `2` | Always |
| `trailState` | `active` \| `inactive` | Always |

## Transition Table

| Phase | focusedNode | selectedPoint | navState.focusedIndex | trailDepth | semanticDiveMode | graphContext | panelSurface | semanticDive |
|---|---|---|---|---|---|---|---|---|
| **overview** | `null` | `null` | `null` | `0` | `false` | `idle` | `idle` | `inactive` |
| **search** | `null` | `null` | `null` | `0` | `false` | `search` | `search` | `inactive` |
| **focus** (no search) | `index` | `null` | `index` | `0` | `false` | `focus` | `focus` | `inactive` |
| **focus** (with search) | `index` | `null` | `index` | `0` | `false` | `focus-search` | `focus-search` | `inactive` |
| **semantic-dive** | `index` | `null` | `index` | `2` | `true` | `focus` | `semantic-dive` | `active` |
| **map-trail** | `index` | `object` | `index` | `1+` | `false` | `idle` | `map-focus-search` | `inactive` |
| **reset** | `null` | `null` | `null` | `0` | `false` | `idle` | `idle` | `inactive` |

## Transition Logic (refreshCompositionState)

```
Galaxy branch (currentView === 'galaxy'):
  hasFocus = selectedPoint OR focusedNode !== null OR focusedIndex !== null
  hasSearchIntent = currentSearchSummary OR input.length >= 2 OR active results

  semanticDive = semanticDiveMode AND hasFocus ? 'active' : 'inactive'

  if hasFocus AND hasSearchIntent → graphContext = 'focus-search'
  else if hasFocus               → graphContext = 'focus'
  else if hasSearchIntent        → graphContext = 'search'
  else                           → graphContext = 'idle'

  derivePanelSurface:
    if semanticDive === 'active' → panelSurface = 'semantic-dive'
    else if graphContext === 'focus-search' → panelSurface = 'focus-search'
    else if graphContext === 'focus' → panelSurface = 'focus'
    else if graphContext === 'search' → panelSurface = 'search'
    else → panelSurface = 'idle'

Map branch (currentView !== 'galaxy'):
  mapContext uses same hasFocus/hasSearchIntent logic
  graphContext always = 'idle'
  semanticDive always = 'inactive'
  panelSurface uses derivePanelSurface with mapContext
```

## Key Rules

1. `semanticDive` is only `active` when `currentView === 'galaxy'` AND `trailDepth === 2` AND focus exists
2. `graphContext` and `mapContext` are mutually exclusive (map branch sets graphContext to `idle`)
3. `panelSurface` derives from both view mode and context, via `derivePanelSurface()`
4. `trailState` depends on `hasActiveTrailState` which requires `navState.mode === 'trail' OR hasSearchIntent` in galaxy, or different logic in map (see lifecycle.js:1053-1056)
5. `navState.focusedIndex` is cleared by `resetStateBeforeUrlRestore()` — resolved (2026-05-20)