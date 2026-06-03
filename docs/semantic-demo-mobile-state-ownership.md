# Semantic Demo Mobile State Ownership Matrix

Status: active
Updated: 2026-06-03

## Purpose

Maps which `data-*` body attribute owns which visual surface. Use this to determine which state attribute to change when editing a surface - and which CSS module owns the rules that respond to it.

## State Attribute Ownership

| Attribute | Values | Owns Surface | CSS Owner(s) | JS Writer(s) |
|---|---|---|---|---|
| `data-panel-surface` | `idle`, `search`, `focus`, `focus-search`, `semantic-dive`, `map-trail`, `map-focus`, `map-focus-search`, `map-search` | Primary panel/sheet visibility and layout. All non-map panels use this as the primary gate. Map variants gate map-specific chrome. | `css/layout_base.css`, `css/mobile_premium.css`, `css/journey_steps.css`, `css/journey_active.css`, `css/animations.css` | `js/modules/lifecycle.js` (`refreshCompositionState()` / `derivePanelSurface()`) |
| `data-panel-surface-detail` | `none`, `peek`, `expanded` | CSS-facing detail state for mobile search/focus-search drawer density. | `css/mobile_premium.css` `STATE-MACHINE STYLES` section | `js/modules/lifecycle.js` mirrors `data-mobile-search-sheet`; `js/modules/search-panel-adapter.js` owns the search-sheet interaction write |
| `data-focus-panel-mode` | `field-node`, `overview`, `manual-panel`, `manual-collapsed`, `legend-open` | Focus HUD density and temporary mobile panel submodes. `field-node` controls compact canopy/walk-dock styling; manual and legend values track user-opened panel states. | `css/journey_active.css` for legacy/active journey choreography; `css/mobile_premium.css` for active mobile focus composition, non-active field-node, and late backstops; `css/progressive_disclosure.css` for legacy show/hide | `js/modules/lifecycle.js`, `js/modules/event-bindings.js`, QA scripts |
| `data-active-view` | `galaxy`, `map` | Global scene view: toggles view-toggle, view-handoff, journey-compass visibility, and map-trail strip visibility. | `css/controls.css`, `css/journey_active.css`, `css/time_weather.css`, `css/strands.css`, `css/progressive_disclosure.css`, `css/shell.css` | `js/modules/view-controller.js` owns view switches; `js/modules/lifecycle.js` mirrors from `state.currentView` during composition refresh |
| `data-view-handoff-active` | `true`, `false` | View handoff announcement visibility. This is owned by the view controller state lane, not by CSS masks. Map trail navigation suppresses and releases this state so it cannot become a hidden active surface. | `css/controls.css` for base view-handoff chrome; map-specific suppression belongs in `js/modules/view-controller.js` before CSS sees an active handoff | `js/modules/view-controller.js` (`showViewHandoff()`, `hideViewHandoff()`, `shouldShowViewHandoff()`) |
| `data-journey-phase` | `overview`, `search`, `focus`, `inside`, `map` | Journey compass phase rail. Currently a **read-only CSS input** - no CSS rules directly gate on this attribute; it is consumed by JS and by the journey compass widget's own `data-phase`. | None for `body[data-journey-phase]`; CSS reads `.journey-compass[data-phase]` instead. | `js/modules/journey-compass-controller.js`, with `js/modules/semantic-dive-ui.js` marking active dives as `inside` |
| `data-route-director` | `search-focus` (current), `map-trail` | Controls focus-stage-dive-btn visibility in galaxy view, and map-strip-title rendering. Used as a transient choreographer signal, not a permanent state. | `css/journey_active.css`, `css/progressive_disclosure.css` | `js/modules/map-state.js` (`document.body.dataset.routeDirector = directorState`) |
| `data-mobile-search-sheet` | `peek`, `expanded` | Mobile search drawer open state. Passed through as `panelSurfaceDetail` by JS, then consumed by CSS via compound selectors. | CSS via `panelSurfaceDetail` compound selectors in `css/mobile_premium.css`; legacy/supporting modules must not become detail-state owners. | `js/modules/search-panel-adapter.js` (`setMobileSearchSheetMode()`) - writes `mobileSearchSheet`; JS in `lifecycle.js` mirrors to `panelSurfaceDetail` |
| `data-mobile-route-peek` | `active` or absent | Temporary mobile route-preview compression for non-map panels. | `css/layout_base.css`, `css/search.css`, `css/journey_active.css`, `css/shell.css` | `js/modules/search-state.js` (`activateMobileRouteFieldPeek()`, `clearMobileRouteFieldPeek()`) |
| `data-semantic-dive` | `inactive`, `active`, `transitioning` | Inside/semantic-dive transition choreography. CSS should only use this for transition and canvas effects; durable panel layout belongs to `data-panel-surface="semantic-dive"`. | `css/shell.css`, `css/journey_steps.css`, `css/mobile_base.css`, `css/progressive_disclosure.css`, `css/animations.css` | `js/modules/lifecycle.js`, `js/modules/semantic-dive-ui.js` |
| `data-terrain-handoff` | `idle`, `flattening`, `landing`, `settled` | Map terrain handoff and route landing effects. | `css/shell.css`, `css/controls.css`, `css/journey_active.css` | `js/modules/map-state.js` |
| `data-thread-inspect-surface` | `idle`, `canvas`, `inside-cue`, `pinned`, `inspector` | Thread inspector overlay visibility and density. Set during focus-thread interactions; transient choreographer signal, not a stable panel owner. | `css/journey_steps.css` (11 rules), `css/layout_base.css` (1 rule), `css/journey_active.css` (1 rule) | `js/modules/lifecycle.js`, QA scripts |
| `data-camera-assist` | `free`, `arriving`, other camera-assist phases | Camera-assist visual treatment during arrival/route choreography. | `css/progressive_disclosure.css` | `js/modules/camera-controls.js` |

## Key Compound State Interactions

## Short-Landscape Viewport Taxonomy

Short-landscape QA intentionally uses multiple landscape mobile widths. Do not collapse these into one viewport unless the corresponding CSS breakpoint and QA intent are changed together.

| Tier | Viewport(s) | Purpose | Current Gate |
|---|---:|---|---|
| Constrained layout edge | `667x375`, `768x380` | Proves cramped landscape panel/chrome geometry does not overflow and focus cards leave canvas breathing room. These sizes exercise the fragile `max-height: 380px`/`max-width: 768px` CSS edge. | `npm run qa:short-landscape` |
| Transition behavior edge | `667x375` | Proves overview -> search -> clear -> focus -> semantic-dive -> reset behavior still works at the tightest short-landscape size. Kept outside the default gate because it is slower. | `npm run qa:short-landscape:transition` |
| Visual screenshot sweep | `896x414` | Captures a common large-phone landscape screenshot for visual inspection and screenshot diff evidence. This is a visual QA viewport, not the tightest layout contract. | `npm run qa:surface:short-landscape` |
| 3D interaction short-landscape | `844x390` | Proves focus-pocket, hit testing, thread, and pointer behavior in the interaction specs. This size is close to large-phone landscape while preserving enough canvas for 3D assertions. | targeted `3d-*` Playwright specs |

Release/checkpoint short-landscape proof should run `npm run qa:short-landscape:release`. Full launch visual proof should additionally run `npm run qa:surface:short-landscape` or `npm run qa:surface:all`.

At `896x414`, `css/mobile_premium.css` owns compact focus-stage suppression for nonessential `.focus-stage-meta` and `.focus-stage-badges` rows so the primary name, short description, and Step Inside action remain inside the viewport. Its chrome section owns the competing chrome lane at the same breakpoint: focus/semantic states hide canvas utility controls, share/help/panel toggles, weather/time widgets, and clipped compass note copy while preserving the view toggle.

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

In `search` + `peek`, the search sheet is a compact route preview. It renders the search input and the top anchor result only; additional ranked rows belong to expanded/full browsing so hidden overflow rows do not create false content density or offscreen click targets.

In `focus-search` + `peek`, the search sheet is a compact context tray. The selected business details belong to `#focus-stage`, so the mobile peek tray intentionally hides `#search-results.active` to avoid a competing result stack above the focus card. Expanded search states still own full result browsing.

`css/mobile_premium.css` owns both the drawer geometry and compact result presentation for these `peek`/`expanded` states. Its chrome section owns state-agnostic result chrome; supporting modules must not become `data-panel-surface-detail` owners.

### `data-active-view` + `data-route-director`

`data-route-director="search-focus"` gates `.focus-stage-dive-btn` only when `data-active-view="galaxy"`. In map view the dive button is suppressed by `data-active-view="map"` rules regardless of route-director.

```css
/* journey_active.css:1070 */
body[data-active-view="galaxy"][data-route-director="search-focus"] .focus-stage-dive-btn { ... }
```

### Mobile Map-Trail Ownership

Mobile map-trail is owned by the map surface, not by the legacy selected-card panel. The visual contract expects:

- `data-active-view="map"`
- `data-panel-surface` starts with `map-`
- `data-journey-navigation-owner="map-trail-strip"`
- `.map-trail-strip` is visible
- `.map-strip-title` is visible as normal grid content inside `.map-trail-strip`; do not depend on legacy absolute `.map-strip-title` rules
- `.selected-card` remains hidden on mobile map-trail
- `.selected-empty` remains hidden on mobile map-trail/map-search so legacy empty-card copy cannot render over map/search results
- `.search-container` sits below `.map-trail-strip`
- map search results render as a compact anchor lane: no full count line and no secondary result stack
- `#filters-section` remains hidden; filters belong to expanded/full search browsing, not the compact map trail lane
- legacy info-panel content such as stats, starters, semantic neighborhoods, and empty selected-card copy remains hidden under the map trail lane
- the demoted `#info-panel` shell is collapsed so it cannot leave a blank glass slab behind the fixed map search lane
- `.info-header` is suppressed for mobile `map-*` surfaces so the compact `.controls` dock can occupy the open map band above the lower sheet

`map-trail` itself is a constructed visual guard, not the expected steady-state result of the visible mobile product route. When the route has a focused business and search context, composition resolves to `map-focus-search`; when it has neither, it resolves to `map-idle`. Keep `11-mobile-selected-card-map-trail` as a regression guard for stale/legacy trail geometry, and use `24-mobile-map-focus-search` for real-click proof of the active mobile map traversal surface.

Edit map trail strip chrome and map/search sheet geometry in the matching MAP / STATE-MACHINE / SURFACES sections of `css/mobile_premium.css`. Do not re-enable `.selected-card`, `.selected-empty`, or `.info-header` for mobile map surfaces unless the contract and this ownership note are intentionally changed together.

### Mobile Map-Focus-Search Ownership

`map-focus-search` keeps the search query as selected-card context, not as an editable search drawer. Primary drawer ownership belongs to the selected map/business info panel. `.search-container`, `#search-results.active`, and `#filters-section` are intentionally hidden in this state so a semantic-dive-to-map transition does not create detached or occluding drawers above the map detail panel. Full result browsing belongs to `map-search`; focused map traversal belongs to the single selected-info drawer plus map trail strip.

The selected-card content owner for this state is the dedicated `#selected-map-summary` variant. `js/modules/focus-stage-renderer.js` writes `data-content-variant="map-summary"` / `data-content-owner="selected-map-summary"` on `#selected-card`, populates the map summary name/description/match copy, and hides the full `#selected-details` payload. Do not restore the previous pattern where map-focus-search rendered the full selected-card details and relied on late CSS to hide bulky leftover rows.

`#selected-map-summary` is intentionally read-only. Map interactions remain in `.map-trail-strip` (`Mycelium`, `Reset`, `Search`) so the summary does not become a second action owner.

Seven ownership lanes are explicit for this state:

- State owner: `data-panel-surface="map-focus-search"` is the canonical CSS gate. Do not use legacy `data-map-context` as a CSS owner.
- Surface owner: `#info-panel` is the only drawer-sized primary surface; `.search-container`, `#search-results`, and `#filters-section` stay hidden.
- Interaction owner: map traversal remains with the map/trail strip; the selected map summary is informational/read-only in this state.
- Content owner: `#selected-map-summary` shows the business name, summary, role, and match context; the full `#selected-details` payload is hidden by the renderer, not by late CSS suppression.
- Spatial/camera owner: `data-active-view="map"` and the map route own camera/framing; the drawer must remain bottom-attached and below 40% viewport height.
- Style owner: dedicated selected-map summary presentation, selected-card/map-state visibility, final drawer geometry, and suppression backstops live in `css/mobile_premium.css`.
- Semantic/data owner: semantic neighbor ranking and thread metadata stay hydrated through the route; map-focus-search renders the currently focused business context without taking ownership of search ranking.

The reset/map ownership contract expects:

- `data-active-view="map"`
- `data-panel-surface="map-focus-search"`
- `data-journey-navigation-owner="map-trail-strip"`
- `.search-container`, `#search-results.active`, and `#filters-section` are hidden so they cannot occlude the selected drawer
- `data-view-handoff-active="false"`; the view handoff must be released by `view-controller.js`, not merely hidden by CSS
- at most one drawer-sized independent primary surface is visible: `#info-panel`
- `#selected-card[data-content-variant="map-summary"][data-content-owner="selected-map-summary"]` and `#selected-map-summary` are visible
- `#selected-details` is hidden
- bulky selected-card/trail content remains hidden
- `#info-panel` remains bottom-attached and below 40% viewport height

### Mobile Map Reset Semantics

Map strip `Reset` is a county-overview reset. It clears route/focus/semantic state and releases the search and selected-info drawers so the map returns to a calm overview.

The mobile route ownership contract expects map strip reset to:

- preserve `data-active-view="map"`
- change `data-panel-surface` from `map-focus-search` to `map-idle`
- clear `trailDepth`, focused node, inspected thread, semantic-dive activity, current query text, and search intent
- release `data-journey-navigation-owner="map-trail-strip"`
- hide `.map-trail-strip`, `.search-container`, `#search-results.active`, and `#info-panel`
- leave map overview chrome to `.journey-compass` / map controls only
- expose only `Return to Mycelium` and `Search` in the calm map controls; `County Reset` is hidden because the reset has already completed

Search continuation belongs to the visible Search affordance, not to county reset. Do not preserve the query/results lane from `county-overview` unless the product copy, route contract, and `09-mobile-return-county` ergonomics assertions change together.

## Ambiguity Notes

| Ambiguity | Resolution |
|---|---|
| `data-journey-phase` is set by JS but no CSS rules gate directly on it | Journey phase is consumed by the `.journey-compass[data-phase]` attribute on the widget itself. CSS gates on the widget's attribute, not the body attribute. Do not add new CSS rules directly targeting `body[data-journey-phase]` - route through the widget. |
| `data-focus-panel-mode` has both product and QA writers | Production writes occur in `lifecycle.js` and `event-bindings.js`; QA also simulates `field-node` in `surface-contract-check.mjs`. Treat it as a derived submode, not a top-level surface owner. |
| `data-mobile-search-sheet` vs `data-panel-surface-detail` | `data-mobile-search-sheet` is the canonical source-of-truth written by `search-panel-adapter.js`. `data-panel-surface-detail` is the CSS-facing mirror written by `lifecycle.js`, with `search-panel-adapter.js` allowed to update it while handling the sheet interaction. Never set `panelSurfaceDetail` from unrelated product code - always go through `setMobileSearchSheetMode()`. |
| `data-route-director` is transient | This attribute is set during route choreography state transitions and cleared shortly after. Do not write CSS rules that depend on it being stable across sessions. |
| `data-mobile-route-peek` is transient | This attribute compresses mobile chrome during route preview. New layout rules should still be scoped by `data-panel-surface`; do not let route-peek become a second primary panel owner. |
| `data-semantic-dive` vs `data-panel-surface="semantic-dive"` | `data-semantic-dive` is for transition/canvas choreography. Stable semantic-dive panel layout belongs to `data-panel-surface="semantic-dive"`. |
| `data-terrain-handoff` and `data-camera-assist` are choreography signals | Keep these attributes limited to map/camera effects. They should not own general panel visibility or drawer geometry. |
| Legacy focus fragments (`.focus-stage-filed`, `.focus-stage-meta`, `.focus-stage-badges`, `.focus-stage-trivia`) | `css/mobile_premium.css` owns suppression for `focus-search` and `semantic-dive` states plus cascade-last geometry/suppression backstops for non-focus mobile states. Keep edits in the matching named section. |

## Migration Rules

1. **Adding a new panel state** -> add to `data-panel-surface` values; write CSS in `css/layout_base.css` (base) or the matching section of `css/mobile_premium.css` (mobile). Never add a new standalone `data-*` attribute without updating this document.
2. **Adding a new journey phase** -> update journey compass state/action synthesis and let `js/modules/journey-compass-controller.js` write `document.body.dataset.journeyPhase`. If CSS needs to respond, add a corresponding `.journey-compass[data-phase="..."]` rule - not a body attribute rule.
3. **Changing mobile search drawer behavior** -> edit `setMobileSearchSheetMode()` in `js/modules/search-panel-adapter.js`. The composition mirror in `lifecycle.js` should not need changes.
4. **Changing focus HUD density** -> edit `css/journey_active.css` for legacy field-node choreography and the `FOCUS / DIVE STATES` or `SURFACES` section in `css/mobile_premium.css` for active mobile focus-search/semantic-dive composition and fallback backstops. Do not invent a new `data-focus-panel-mode` value without a corresponding JS writer and contract update.
5. **Adding route/camera choreography CSS** -> prefer `css/shell.css` for canvas/map effects and `css/journey_active.css` for journey-compass effects. Do not add panel layout rules under `data-terrain-handoff`, `data-camera-assist`, or `data-mobile-route-peek`.

## Composition State Writer Ownership

`js/modules/lifecycle.js` is the primary writer for body composition fields: `trailState`, `trailDepth`, `graphContext`, `mapContext`, `semanticDive`, `panelSurface`, and the composition mirror of `panelSurfaceDetail`.

Route/view/camera choreography has separate owners:

- `js/modules/view-controller.js` owns `activeView` during view switches and `viewHandoffActive`; it also decides whether a view handoff is allowed for the target view. `lifecycle.js` only mirrors `activeView` from `state.currentView` during composition refresh.
- `js/modules/camera-controls.js` owns `cameraAssist`, `focusTransition`, and `routeExploration`; `js/modules/camera-orbit-slack.js` owns the focused-route `cameraSlack` dataset fields.
- `js/modules/map-state.js` owns `routeDirector` and `terrainHandoff`.
- `js/modules/journey-webgl.js` owns `routeMotion`.
- `js/modules/journey-compass-controller.js` owns journey compass presentation fields: `journeyPhase`, `journeyCompassDensity`, `journeyCompassCopy`, and `journeyNavigationOwner`.
- `js/modules/semantic-dive-ui.js` owns the semantic-dive widget mirror (`insideWalkState`) and may mark active dives as `journeyPhase="inside"`.

Do not add `panelSurface` or context derivation back to journey compass code, and do not let view handoff write camera-assist fields directly; `tests/composition-state-owner-contract.mjs` guards this boundary.

## Source References

- `js/modules/search-panel-adapter.js` - `setMobileSearchSheetMode()` writes `mobileSearchSheet` and its sheet detail
- `js/modules/search-state.js` - search lifecycle; mobile route-peek helpers write and clear `mobileRoutePeek`
- `js/modules/lifecycle.js` - writes `panelSurface`, `panelSurfaceDetail`, `graphContext`, `mapContext`, `semanticDive`, `trailState`, and `trailDepth`; mirrors `activeView`
- `js/modules/view-controller.js` - owns view switches, `activeView`, and `viewHandoffActive`
- `js/modules/camera-controls.js` - owns `cameraAssist`, `focusTransition`, and `routeExploration`; delegates focused-route orbit slack fields to `camera-orbit-slack.js`
- `js/modules/camera-orbit-slack.js` - owns `cameraSlack` and `cameraSlackReason`
- `js/modules/journey-compass-controller.js` - writes journey compass presentation fields such as `journeyPhase`, `journeyCompassDensity`, `journeyCompassCopy`, and `journeyNavigationOwner`
- `js/modules/event-bindings.js` - sets manual focus panel modes
- `js/modules/map-state.js` - writes `routeDirector` and `terrainHandoff`
- `js/modules/journey-webgl.js` - writes route motion state for route trace visuals
- `js/modules/journey.js` - thin orchestration/re-export layer; reads `journeyPhase`
- `js/modules/journey-neighborhood.js` - owns neighborhood manifests, walk candidates, trail seeds, and route indices
- `js/modules/journey-selected-card.js` - owns `syncFocusStage()`, selected-card rendering, and selected business DOM hydration
- `js/modules/journey-canvas-interaction.js` - owns canvas node hit testing, hover state, pointer bindings, and canvas-to-thread inspection handoff
- `js/modules/journey-focus-ui.js` - owns focus/traversal DOM UI, neighbor rail rendering, and walk breadcrumb internals
- `js/modules/journey-thread-settler.js` - owns thread walk traversal, neighbor timers, inspection settle flow, and inside preview state
- `js/modules/strand-continuity.js` - owns strand continuity phase state shared by journey and thread inspector
- `tests/surface-contract-check.mjs` - simulates `field-node` state for QA
