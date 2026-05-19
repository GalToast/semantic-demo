# Semantic Demo Mobile State Ownership Matrix

Status: active
Updated: 2026-05-19

## Purpose

Maps which `data-*` body attribute owns which visual surface. Use this to determine which state attribute to change when editing a surface - and which CSS module owns the rules that respond to it.

## State Attribute Ownership

| Attribute | Values | Owns Surface | CSS Owner(s) | JS Writer(s) |
|---|---|---|---|---|
| `data-panel-surface` | `idle`, `search`, `focus`, `focus-search`, `semantic-dive`, `map-trail`, `map-focus`, `map-focus-search`, `map-search` | Primary panel/sheet visibility and layout. All non-map panels use this as the primary gate. Map variants gate map-specific chrome. | `css/layout_base.css`, `css/mobile_premium_state.css`, `css/journey_steps.css`, `css/journey_active.css`, `css/animations.css` | `js/modules/lifecycle.js` (`setPanelContext()`), `js/modules/search-state.js` (`setSearchPanelState()`) |
| `data-focus-panel-mode` | `field-node`, `overview`, `manual-panel`, `manual-collapsed`, `legend-open` | Focus HUD density and temporary mobile panel submodes. `field-node` controls compact canopy/walk-dock styling; manual and legend values track user-opened panel states. | `css/journey_active.css` (~lines 1145-1800), `css/mobile_premium_surfaces.css` (~lines 342-371), `css/progressive_disclosure.css` (~line 141) | `js/modules/lifecycle.js`, `js/modules/event-bindings.js`, QA scripts |
| `data-active-view` | `galaxy`, `map` | Global scene view: toggles view-toggle, view-handoff, journey-compass visibility, and map-trail strip visibility. | `css/controls.css` (~lines 163-263), `css/journey_active.css` (~lines 579-824, 1554-1795) | `js/three-setup.js` (`document.body.dataset.activeView`) |
| `data-journey-phase` | `overview`, `search`, `focus`, `inside`, `map` | Journey compass phase rail. Currently a **read-only CSS input** - no CSS rules directly gate on this attribute; it is consumed by JS and by the journey compass widget's own `data-phase`. | None (CSS reads `data-journey-phase` only via JS-set `.journey-compass[data-phase]` or compound selectors like `body[data-active-view="map"][data-terrain-handoff="landing"][data-phase="map"]`) | `js/modules/lifecycle.js` (`document.body.dataset.journeyPhase = phase`), `js/modules/journey.js`, `js/modules/semantic-dive-ui.js` |
| `data-route-director` | `search-focus` (current), `map-trail` | Controls focus-stage-dive-btn visibility in galaxy view, and map-strip-title rendering. Used as a transient choreographer signal, not a permanent state. | `css/journey_active.css` (~line 1070), `css/progressive_disclosure.css` (~line 1429) | `js/modules/map-state.js` (`document.body.dataset.routeDirector = directorState`) |
| `data-mobile-search-sheet` | `peek`, `expanded` | Mobile search drawer open state. Passed through as `panelSurfaceDetail` by JS, then consumed by CSS via compound selectors. | CSS via `panelSurfaceDetail` compound selectors in `css/mobile_premium_state.css`, `css/strands.css` | `js/modules/search-state.js` (`setMobileSearchSheetMode()`) - writes `mobileSearchSheet`; JS in `lifecycle.js` mirrors to `panelSurfaceDetail` |

## Key Compound State Interactions

### `data-panel-surface` + `data-focus-panel-mode="field-node"`

```css
/* journey_active.css:1145 - journey compass in field-node canopy mode */
body.is-active[data-panel-surface="focus-search"][data-focus-panel-mode="field-node"] .journey-compass { ... }

/* journey_active.css:1275 - focus-stage-card pseudo-element accent */
body[data-panel-surface="focus-search"][data-focus-panel-mode="field-node"] .focus-stage-card::before { ... }
```

Rule: `data-focus-panel-mode="field-node"` is a density/submode signal, not a primary surface. Prefer pairing it with `data-panel-surface="focus-search"` for product CSS, but keep a narrow fallback where QA or transition timing can expose `field-node` while `data-panel-surface` is still settling.

### `data-panel-surface` + `data-mobile-search-sheet`

`data-mobile-search-sheet` is mirrored to `data-panel-surface-detail` by `lifecycle.js`. No CSS rule reads `data-mobile-search-sheet` directly. All CSS rules use `data-panel-surface-detail` as the canonical form.

```js
// lifecycle.js:1366 - mirror
document.body.dataset.panelSurfaceDetail = context === 'search' || context === 'focus-search'
    ? document.body.dataset.mobileSearchSheet || 'peek'
    : 'none';
```

### `data-active-view` + `data-route-director`

`data-route-director="search-focus"` gates `.focus-stage-dive-btn` only when `data-active-view="galaxy"`. In map view the dive button is suppressed by `data-active-view="map"` rules regardless of route-director.

```css
/* journey_active.css:1070 */
body[data-active-view="galaxy"][data-route-director="search-focus"] .focus-stage-dive-btn { ... }
```

## Ambiguity Notes

| Ambiguity | Resolution |
|---|---|
| `data-journey-phase` is set by JS but no CSS rules gate directly on it | Journey phase is consumed by the `.journey-compass[data-phase]` attribute on the widget itself. CSS gates on the widget's attribute, not the body attribute. Do not add new CSS rules directly targeting `body[data-journey-phase]` - route through the widget. |
| `data-focus-panel-mode` has both product and QA writers | Production writes occur in `lifecycle.js` and `event-bindings.js`; QA also simulates `field-node` in `surface-contract-check.mjs`. Treat it as a derived submode, not a top-level surface owner. |
| `data-mobile-search-sheet` vs `data-panel-surface-detail` | `data-mobile-search-sheet` is the canonical source-of-truth written by `search-state.js`. `data-panel-surface-detail` is the CSS-facing mirror written by `lifecycle.js`. Never set `panelSurfaceDetail` directly in product code - always go through `setMobileSearchSheetMode()`. |
| `data-route-director` is transient | This attribute is set during route choreography state transitions and cleared shortly after. Do not write CSS rules that depend on it being stable across sessions. |
| Legacy focus fragments (`.focus-stage-filed`, `.focus-stage-meta`, `.focus-stage-badges`, `.focus-stage-trivia`) | `mobile_premium_focus.css` owns suppression for `focus-search` and `semantic-dive` states. `mobile_premium_surfaces.css` holds a fallback `display:none` without `!important`. The surfaces.css copy is demoted and will not override focus.css suppression. |

## Migration Rules

1. **Adding a new panel state** -> add to `data-panel-surface` values; write CSS in `css/layout_base.css` (base) or `css/mobile_premium_state.css` (mobile). Never add a new standalone `data-*` attribute without updating this document.
2. **Adding a new journey phase** -> set `document.body.dataset.journeyPhase` in `lifecycle.js`. If CSS needs to respond, add a corresponding `.journey-compass[data-phase="..."]` rule - not a body attribute rule.
3. **Changing mobile search drawer behavior** -> edit `setMobileSearchSheetMode()` in `js/modules/search-state.js`. The CSS mirror in `lifecycle.js` should not need changes.
4. **Changing focus HUD density** -> edit `css/journey_active.css` for legacy field-node choreography and `css/mobile_premium_surfaces.css` for loaded-last mobile canopy harmonization. Do not invent a new `data-focus-panel-mode` value without a corresponding JS writer and contract update.

## Source References

- `js/modules/search-state.js:75` - `setMobileSearchSheetMode()` writes `mobileSearchSheet`
- `js/modules/search-state.js:76` - mirrors to `panelSurfaceDetail`
- `js/modules/lifecycle.js:1174` - sets `journeyPhase`
- `js/modules/lifecycle.js:1255` - reads `mobileSearchSheet`
- `js/modules/lifecycle.js:1366` - mirrors `mobileSearchSheet` -> `panelSurfaceDetail`
- `js/modules/lifecycle.js:2747` - sets `focusPanelMode = 'field-node'`
- `js/modules/lifecycle.js:2828` - resets `focusPanelMode = 'overview'`
- `js/modules/event-bindings.js:490` - sets manual focus panel modes
- `js/modules/event-bindings.js:553` - sets `focusPanelMode = 'legend-open'`
- `js/modules/map-state.js:405` - sets `routeDirector`
- `js/modules/journey.js:1648` - reads `journeyPhase`
- `js/three-setup.js:88` - sets `activeView`
- `tests/surface-contract-check.mjs:872-878` - simulation of `field-node` state for QA
