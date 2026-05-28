# Semantic Demo Mobile State Ownership Matrix

Status: active
Updated: 2026-05-28

## Purpose

Maps which `data-*` body attribute owns which visual surface. Use this to determine which state attribute to change when editing a surface - and which CSS module owns the rules that respond to it.

## State Attribute Ownership

| Attribute | Values | Owns Surface | CSS Owner(s) | JS Writer(s) |
|---|---|---|---|---|
| `data-panel-surface` | `idle`, `search`, `focus`, `focus-search`, `semantic-dive`, `map-trail`, `map-focus`, `map-focus-search`, `map-search` | Primary panel/sheet visibility and layout. All non-map panels use this as the primary gate. Map variants gate map-specific chrome. | `css/layout_base.css`, `css/mobile_premium_state.css`, `css/journey_steps.css`, `css/journey_active.css`, `css/animations.css` | `js/modules/lifecycle.js` (`setPanelContext()`), `js/modules/search-state.js` (`setSearchPanelState()`) |
| `data-panel-surface-detail` | `none`, `peek`, `expanded` | CSS-facing detail state for mobile search/focus-search drawer density. | `css/mobile_premium_state.css` (52 rules), `css/mobile_premium_surfaces.css` (16 rules) | `js/modules/lifecycle.js` mirrors `data-mobile-search-sheet`; product code should not set this directly |
| `data-focus-panel-mode` | `field-node`, `overview`, `manual-panel`, `manual-collapsed`, `legend-open` | Focus HUD density and temporary mobile panel submodes. `field-node` controls compact canopy/walk-dock styling; manual and legend values track user-opened panel states. | `css/journey_active.css` (76 rules), `css/mobile_premium_surfaces.css` (44 rules), `css/mobile_premium_focus.css` (8 rules), `css/progressive_disclosure.css` (1 rule) | `js/modules/lifecycle.js`, `js/modules/event-bindings.js`, QA scripts |
| `data-active-view` | `galaxy`, `map` | Global scene view: toggles view-toggle, view-handoff, journey-compass visibility, and map-trail strip visibility. | `css/controls.css`, `css/journey_active.css`, `css/time_weather.css`, `css/strands.css`, `css/progressive_disclosure.css`, `css/shell.css` | `js/three-setup.js`, `js/modules/lifecycle.js` |
| `data-journey-phase` | `overview`, `search`, `focus`, `inside`, `map` | Journey compass phase rail. Currently a **read-only CSS input** - no CSS rules directly gate on this attribute; it is consumed by JS and by the journey compass widget's own `data-phase`. | None for `body[data-journey-phase]`; CSS reads `.journey-compass[data-phase]` instead. | `js/modules/lifecycle.js` (`document.body.dataset.journeyPhase = phase`), `js/modules/journey.js` orchestration, `js/modules/semantic-dive-ui.js` |
| `data-route-director` | `search-focus` (current), `map-trail` | Controls focus-stage-dive-btn visibility in galaxy view, and map-strip-title rendering. Used as a transient choreographer signal, not a permanent state. | `css/journey_active.css`, `css/progressive_disclosure.css` | `js/modules/map-state.js` (`document.body.dataset.routeDirector = directorState`) |
| `data-mobile-search-sheet` | `peek`, `expanded` | Mobile search drawer open state. Passed through as `panelSurfaceDetail` by JS, then consumed by CSS via compound selectors. | CSS via `panelSurfaceDetail` compound selectors in `css/mobile_premium_state.css`, `css/mobile_premium_surfaces.css`, `css/strands.css` | `js/modules/search-state.js` (`setMobileSearchSheetMode()`) - writes `mobileSearchSheet`; JS in `lifecycle.js` mirrors to `panelSurfaceDetail` |
| `data-mobile-route-peek` | `active` or absent | Temporary mobile route-preview compression for non-map panels. | `css/layout_base.css`, `css/search.css`, `css/journey_active.css`, `css/shell.css` | `js/modules/search-state.js` (`activateMobileRouteFieldPeek()`, `clearMobileRouteFieldPeek()`) |
| `data-semantic-dive` | `inactive`, `active`, `transitioning` | Inside/semantic-dive transition choreography. CSS should only use this for transition and canvas effects; durable panel layout belongs to `data-panel-surface="semantic-dive"`. | `css/shell.css`, `css/journey_steps.css`, `css/mobile_base.css`, `css/progressive_disclosure.css`, `css/animations.css` | `js/modules/lifecycle.js`, `js/modules/semantic-dive-ui.js` |
| `data-terrain-handoff` | `idle`, `flattening`, `landing`, `settled` | Map terrain handoff and route landing effects. | `css/shell.css`, `css/controls.css`, `css/journey_active.css` | `js/modules/map-state.js` |
| `data-thread-inspect-surface` | `idle`, `canvas`, `inside-cue`, `pinned`, `inspector` | Thread inspector overlay visibility and density. Set during focus-thread interactions; transient choreographer signal, not a stable panel owner. | `css/journey_steps.css` (11 rules), `css/layout_base.css` (1 rule), `css/journey_active.css` (1 rule) | `js/modules/lifecycle.js`, QA scripts |
| `data-camera-assist` | `free`, `arriving`, other camera-assist phases | Camera-assist visual treatment during arrival/route choreography. | `css/progressive_disclosure.css` | `js/modules/camera-controls.js`, `js/modules/journey-compass-state.js` |

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
| `data-mobile-route-peek` is transient | This attribute compresses mobile chrome during route preview. New layout rules should still be scoped by `data-panel-surface`; do not let route-peek become a second primary panel owner. |
| `data-semantic-dive` vs `data-panel-surface="semantic-dive"` | `data-semantic-dive` is for transition/canvas choreography. Stable semantic-dive panel layout belongs to `data-panel-surface="semantic-dive"`. |
| `data-terrain-handoff` and `data-camera-assist` are choreography signals | Keep these attributes limited to map/camera effects. They should not own general panel visibility or drawer geometry. |
| Legacy focus fragments (`.focus-stage-filed`, `.focus-stage-meta`, `.focus-stage-badges`, `.focus-stage-trivia`) | `mobile_premium_focus.css` owns suppression for `focus-search` and `semantic-dive` states. `mobile_premium_surfaces.css` is the cascade-last geometry/suppression backstop for non-focus mobile states and must stay subordinate to focus-specific rules. |

## Migration Rules

1. **Adding a new panel state** -> add to `data-panel-surface` values; write CSS in `css/layout_base.css` (base) or `css/mobile_premium_state.css` (mobile). Never add a new standalone `data-*` attribute without updating this document.
2. **Adding a new journey phase** -> set `document.body.dataset.journeyPhase` in `lifecycle.js`. If CSS needs to respond, add a corresponding `.journey-compass[data-phase="..."]` rule - not a body attribute rule.
3. **Changing mobile search drawer behavior** -> edit `setMobileSearchSheetMode()` in `js/modules/search-state.js`. The CSS mirror in `lifecycle.js` should not need changes.
4. **Changing focus HUD density** -> edit `css/journey_active.css` for legacy field-node choreography and `css/mobile_premium_surfaces.css` for loaded-last mobile canopy harmonization. Do not invent a new `data-focus-panel-mode` value without a corresponding JS writer and contract update.
5. **Adding route/camera choreography CSS** -> prefer `css/shell.css` for canvas/map effects and `css/journey_active.css` for journey-compass effects. Do not add panel layout rules under `data-terrain-handoff`, `data-camera-assist`, or `data-mobile-route-peek`.

## Source References

- `js/modules/search-state.js` - `setMobileSearchSheetMode()` writes `mobileSearchSheet`; mobile route-peek helpers write and clear `mobileRoutePeek`
- `js/modules/lifecycle.js` - writes `activeView`, `panelSurface`, `panelSurfaceDetail`, `graphContext`, `mapContext`, `semanticDive`, and `journeyPhase`
- `js/modules/event-bindings.js` - sets manual focus panel modes
- `js/modules/map-state.js` - writes `routeDirector` and `terrainHandoff`
- `js/modules/journey.js` - thin orchestration/re-export layer; reads `journeyPhase`
- `js/modules/journey-neighborhood.js` - owns neighborhood manifests, walk candidates, trail seeds, and route indices
- `js/modules/journey-selected-card.js` - owns `syncFocusStage()`, selected-card rendering, and selected business DOM hydration
- `js/modules/journey-canvas-interaction.js` - owns canvas node hit testing, hover state, pointer bindings, and canvas-to-thread inspection handoff
- `js/modules/journey-focus-ui.js` - owns focus/traversal DOM UI, neighbor rail rendering, and walk breadcrumb internals
- `js/modules/journey-thread-settler.js` - owns thread walk traversal, neighbor timers, inspection settle flow, and inside preview state
- `js/modules/strand-continuity.js` - owns strand continuity phase state shared by journey and thread inspector
- `js/three-setup.js` - sets `activeView` during map activation
- `tests/surface-contract-check.mjs` - simulates `field-node` state for QA
