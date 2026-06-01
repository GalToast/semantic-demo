# Semantic Demo CSS Ownership Map

Status: active
Updated: 2026-06-01

## Purpose

`semantic-demo.css` is now an import sheet. It should stay small and only load the real CSS modules under `css/`.

Use this map to find the module that owns a UI surface before changing mobile layout, density, stacking, or state behavior. Do not re-add moved rules to `semantic-demo.css`.

The module order below is the cascade order. The first reconstruction preserved the original monolithic stylesheet as contiguous ranges, so moving rules between modules is a behavior change unless the cascade is re-verified.

## Current Recommendation

Treat CSS state ownership as the next cleanup seam. Do not move visual rules yet unless a surface has a failing contract or a specific visual bug. The useful work now is to keep state docs and contracts aligned with the actual cascade so later visual edits land in the right module.

Priority:

1. Keep `data-panel-surface` as the primary panel/sheet state gate.
2. Keep `data-panel-surface-detail` as the CSS-facing search drawer detail gate.
3. Keep route/camera choreography attributes (`data-route-director`, `data-mobile-route-peek`, `data-terrain-handoff`, `data-camera-assist`, `data-route-motion`) narrow and transient.
4. Avoid adding new selectors to broad modules (`css/progressive_disclosure.css`, `css/strands.css`, `css/mobile_base.css`) unless the ownership map is updated in the same change.

## Module Map

| Module | Primary Ownership |
|---|---|
| `semantic-demo.css` | Import order and cache-busted `@import` URLs only. |
| `css/base.css` | Root tokens, global visibility helpers, accessibility utilities. |
| `css/loading.css` | Loading overlay and startup progress surfaces. |
| `css/tooltips.css` | Hover tooltip/card preview surfaces. |
| `css/shell.css` | Core app shell, canvas, map container, map trail strip, biofield shell. |
| `css/time_weather.css` | Weather overlay, weather widget, and time display visibility/visuals. |
| `css/demo_ui.css` | Demo-specific UI helpers. |
| `css/synthesis.css` | Synthesis/summary card and guide CTA surfaces. |
| `css/controls.css` | View toggle, view handoff, shared icon/button primitives, keyboard close button, and adjacent control surfaces. |
| `css/layout_base.css` | Info panel, legend, mode chips, broad layout rules, map/search/focus supporting states. |
| `css/search.css` | Shared and desktop search/result styles. |
| `css/mobile_base.css` | Mobile base atoms and reduced-motion support. It no longer owns journey-compass mobile layout. |
| `css/journey_steps.css` | Step Inside, trail, journey, focus-stage active-trail styling, and many state-machine surfaces. |
| `css/journey_active.css` | Active journey, field-node, route, and mobile focus cockpit surfaces. |
| `css/clusters.css` | Startup notice, search errors, selected-card/about-card base styling, selected-card focus/map accent UI, and trail-context accents. Galaxy cluster labels are now WebGL Sprite-only via `js/modules/cluster-labels.js`; no HTML/CSS label surface remains. |
| `css/progressive_disclosure.css` | Show/hide behavior for graph-context and dive states, plus search empty-state and search-input glass component authority. |
| `css/strands.css` | Mobile bottom sheet, mobile chrome ownership, route-specific surfaces, and strand/connection preview surfaces. |
| `css/animations.css` | Final short-landscape/mobile override tail from the original cascade. |
| `css/mobile_premium.css` | Final mobile override import shell only. Keep this as the sole app-shell reference for premium mobile overrides. |
| `css/mobile_premium_focus.css` | Final mobile focus-search and semantic-dive composition. |
| `css/mobile_premium_chrome.css` | Final mobile search drawer, filter/chrome, and map-control polish. |
| `css/mobile_premium_state.css` | Final mobile idle, focus-search refinement, and map-view state ownership. |
| `css/mobile_premium_idle.css` | Final narrow idle-state corrections, including mobile idle suppression of global chrome that overlaps the idle drawer/search lane. |
| `css/mobile_premium_map_summary.css` | Final mobile `map-focus-search` selected map summary presentation. Keeps dedicated summary text/card styling out of late drawer geometry. |
| `css/mobile_premium_surfaces.css` | Final mobile bottom-sheet and surface geometry corrections. |

## Mobile Search And Result Drawer

Owner seam: `mobile-search-results`

Primary source:

- Markup: `vector-explorer-polished.html`, `.search-container`, `#synthesize-trigger`, `#search-results`
- State: `js/modules/search-state.js`, `setSearchPanelState()`, `renderSearchResultItems()`
- Current cascade owners: `css/search.css` for shared search/result primitives, `css/mobile_premium_chrome.css` for state-agnostic mobile drawer/result chrome polish, and `css/mobile_premium_state.css` for `data-panel-surface-detail="peek"` / `"expanded"` layout and compact result presentation. `css/mobile_premium_surfaces.css` must not read `data-panel-surface-detail`.
- Supporting legacy/base styles: `css/mobile_base.css`, `css/layout_base.css`, `css/progressive_disclosure.css`, `css/strands.css`

Rules:

- Edit `css/search.css` first for shared result-card semantics and desktop/mobile primitive styling.
- Edit `css/mobile_premium_state.css` first for `data-panel-surface-detail="peek"` or `"expanded"` behavior.
- Edit `css/mobile_premium_chrome.css` first for mobile search drawer chrome, controls, and state-agnostic polish.
- Use `css/mobile_premium_surfaces.css` only for generic late geometry/touch-target backstops or map-specific compact result guards; do not add `data-panel-surface-detail` rules there.
- Treat `css/mobile_base.css`, `css/progressive_disclosure.css`, and `css/strands.css` as legacy/supporting surfaces for this seam; avoid new overrides there unless a contract or visual proof requires it.
- In `search` + `peek`, render one clean anchor row only; secondary result rows belong to expanded mode and must not appear as clipped slivers inside the collapsed sheet.
- Preserve these state contracts: `.has-query`, `.results-rendered`, `.has-expanded-results`, `#search-results.active`, `#search-results.is-expanded`, `data-mobile-route-peek`, `data-panel-surface="search"`, `data-panel-surface="focus-search"`, `data-active-view="map"`, and transition-only `data-semantic-dive`.

## Mobile Focus And Step Inside

Owner seam: `mobile-focus-stepinside`

Primary source:

- Markup: `vector-explorer-polished.html`, `.focus-stage`, `.focus-stage-card`, `.focus-stage-inside-status`, `.focus-stage-inside-controls`
- State: `data-panel-surface="focus"`, `data-panel-surface="focus-search"`, `data-panel-surface="semantic-dive"`, and transition-only `data-semantic-dive="transitioning"`
- JS owner: `js/modules/journey-selected-card.js` owns `syncFocusStage()` and selected-card DOM hydration; `js/modules/journey-focus-ui.js` owns focus/traversal DOM UI and the neighbor rail; `js/modules/journey.js` is now the orchestration/re-export layer for this surface.
- Current cascade owners: `css/journey_active.css` for active journey/field-node choreography, `css/mobile_premium_focus.css` for final mobile focus-search and semantic-dive composition, and `css/mobile_premium_surfaces.css` for late canopy/bottom-sheet geometry corrections.
- Supporting legacy/base styles: `css/journey_steps.css`, `css/mobile_base.css`, `css/strands.css`, `css/progressive_disclosure.css`, `css/shell.css`

Rules:

- Edit `css/journey_active.css` first for field-node/route choreography and journey-compass state behavior.
- Edit `css/mobile_premium_focus.css` first for mobile focus-search or semantic-dive composition.
- Edit `css/mobile_premium_surfaces.css` only for late loaded geometry correction after focus/state rules.
- Treat `css/mobile_base.css`, `css/progressive_disclosure.css`, and `css/strands.css` as supporting legacy surfaces; do not add new focus HUD ownership there without updating this map.
- Preserve hidden-state behavior for `.focus-stage-journey`, `.focus-stage-neighbors`, `.focus-thread-inspector`, `.trail-controls`, and `.trail-context`; those are state-machine surfaces, not decorative duplicates.
- Do not consolidate Step Inside vignette or camera-motion selectors without live video proof.
- Product-route handoff leaks are guarded by `mobile-product-focus-route` and `mobile-product-preview-route` in `tests/surface-contract-check.mjs`: focused result routes must hide lower search/info chrome, keep `#mode-grid` suppressed, and make `#focus-stage` or `#focus-thread-inspector` the owning mobile surface.
- Known watchpoint: legacy map selected-card accents still exist in `css/progressive_disclosure.css` and `css/clusters.css`. Treat them as supporting/base rules until a focused map visual or contract proves they should move; the late mobile owners remain `css/mobile_premium_chrome.css`, `css/mobile_premium_state.css`, and `css/mobile_premium_surfaces.css`.

## Mobile Map Focus Search Summary

Owner seam: `mobile-map-focus-search-summary`

Primary source:

- Markup: `vector-explorer-polished.html`, `#selected-map-summary`
- State/content: `js/modules/focus-stage-renderer.js`, `syncSelectedCardContentVariant()`
- Current cascade owners: `css/mobile_premium_map_summary.css` for the dedicated summary presentation, `css/mobile_premium_state.css` for map selected-card visibility, and `css/mobile_premium_surfaces.css` for bottom drawer geometry and suppression backstops.

Rules:

- Edit `css/mobile_premium_map_summary.css` first for `#selected-map-summary` text hierarchy, role pill, match copy, and compact summary presentation.
- Edit `css/mobile_premium_surfaces.css` only when the `map-focus-search` bottom drawer geometry, hidden legacy surfaces, or final suppression backstops need to change.
- Do not add `#selected-map-summary` rules to `css/mobile_premium_surfaces.css`; the source contract keeps that file from becoming a content-style owner again.
- Keep the summary read-only. Map actions remain in `.map-trail-strip`.

## Journey Compass Ownership

Owner seam: `journey-compass`

The journey-compass cascade is distributed across eight files. Edit the canonical owner first; use supporting files only for late geometry corrections or state-specific polish that must override the canonical owner.

| File | Journey-compass selectors | Role |
|---|---|---|
| `css/journey_active.css` | 162 | Journey-compass base, phase/density states, focus/search/inside behavior, map-trail active styling |
| `css/mobile_premium_surfaces.css` | 62 | Mobile premium shared non-map compass normalization, idle/search/field-node backstops, map-search final geometry |
| `css/strands.css` | 40 | Mobile bottom sheet, route surfaces, journey-compass field-node action buttons |
| `css/layout_base.css` | 12 | Info panel, map-focus/trail state overrides |
| `css/mobile_base.css` | 6 | Reduced-motion support only; no mobile journey-compass layout ownership |
| `css/mobile_premium_focus.css` | 42 | Mobile focus-search and semantic-dive journey-compass composition, including compact/glass-heavy refinements |
| `css/progressive_disclosure.css` | 6 | Show/hide, reduced-motion journey-compass suppression |
| `css/animations.css` | 7 | Final mobile/reduced-motion override tail, galaxy overview compass |
| `css/mobile_premium_chrome.css` | 2 | Mobile search drawer chrome journey-compass polish |
| `css/mobile_premium_state.css` | 11 | Mobile idle, focus-search refinement, map-view state ownership |

**Canonical owners:**
- `css/journey_active.css` owns `.journey-compass` base styling (lines 155–327), phase/density states (`[data-phase]`, `[data-density]`), and active-view map behavior.
- `css/mobile_premium_surfaces.css` owns shared mobile non-map compass normalization: glass positioning, `.journey-compass-copy`/`.journey-compass-kicker`/`.journey-compass-title`/`.journey-compass-action` baseline typography/layout, idle/search sizing, and field-node grid backstops.
- `css/mobile_premium_focus.css` owns mobile focus-search and semantic-dive journey-compass overrides, including `.journey-compass.glass-heavy`, semantic-dive compact `[data-density="compact"]` layout, compact rail display, and focus/dive title wrapping.
- `css/mobile_premium_chrome.css` owns mobile search drawer journey-compass chrome polish.
- `css/mobile_premium_state.css` owns mobile idle and map-view state journey-compass refinement.

**Supporting roles:**
- `css/strands.css` owns mobile bottom sheet journey-compass field-node action buttons and route surfaces; do not add new journey-compass geometry here without updating this map.
- `css/layout_base.css` owns map-focus and map-trail info-panel overrides for journey-compass; those rules must not be moved without verifying map-focus/map-trail contracts.
- `css/mobile_base.css` only provides reduced-motion support for journey-compass selectors; it must not own mobile journey-compass layout.
- `css/progressive_disclosure.css` owns journey-compass show/hide and reduced-motion suppression; not geometry.
- `css/animations.css` owns final mobile/reduced-motion override tail and galaxy overview compass; not geometry.

**Never add to:** `css/journey_steps.css` — no journey-compass selectors exist there and it must stay that way.

2026-06-01 focus/dive refinement pass:
- Moved focus-search / semantic-dive journey-compass compact and glass-heavy state refinements from `css/mobile_premium_surfaces.css` to `css/mobile_premium_focus.css`.
- `tests/focus-stage-css-ownership-contract.mjs` now blocks those state refinements from returning to the late surfaces file.

## Required Proof For Movement Or Dedupe

- `npm run build`
- `npm run refresh:cache`
- `npm run check:cache`
- `npm run check:shell`
- `git diff --check` or a scoped equivalent when unrelated dirty files contain pre-existing whitespace issues
- Mobile browser proof at `390x844` for the touched state
- DOM metrics for overflow, clipping, visible controls, horizontal scroll, and console warnings

When moving a rule between modules, verify that `semantic-demo.css` import order still preserves the intended cascade and that the changed module's `?v=` hash is refreshed.

## Current Cleanup Phase

Phase 1: root stylesheet modularization is active. `semantic-demo.css` imports the base modules and `css/mobile_premium.css` imports the current final mobile owner modules.

Phase 2: reduce duplicate mobile rules inside `css/mobile_base.css`, `css/progressive_disclosure.css`, and adjacent supporting modules one selector family at a time:

- `.search-results.active` — owned across `css/search.css` (3), `css/journey_active.css` (1), `css/progressive_disclosure.css` (3), `css/strands.css` (8), `css/mobile_premium_chrome.css` (7), `css/mobile_premium_state.css` (6), `css/mobile_premium_surfaces.css` (1), `css/animations.css` (1). `css/layout_base.css` is no longer a search-result owner. The baseline count is tracked in `tests/css-ownership-check.mjs`; any new definition beyond these owners will trigger a violation.

- `#search-results.active`
- `.search-results-count`
- `.search-result-item` and state variants
- `.search-result-row`, name, rank, snippet, context
- Search-owned badges, result-row mechanics, and spinner selectors are canonical in `css/search.css`; search empty-state and suggestion-chip visual authority is in `css/progressive_disclosure.css`; do not reintroduce these in `css/clusters.css` or `css/journey_steps.css`.
- `#synthesize-trigger` and `.btn-synthesize`
- `.focus-stage`, `.focus-stage-card`, `.focus-stage-inside-status`, `.focus-stage-inside-controls` — see **Focus Stage Ownership** section below.

Phase 3: split additional broad modules only when there is a clean surface boundary and a small proof route. Current priority seams:

- Keep `.rail-section` authority in `css/search.css`; do not reintroduce rail section styles in `css/clusters.css`.
- Move self-contained transition effects out of `css/progressive_disclosure.css` only with cache refresh and before/after surface proof.

## Focus Stage Ownership

Owner seam: `focus-stage`

The `.focus-stage` selector family is distributed across **10 CSS files** (410+ total selector matches). This section documents the canonical owner for each sub-surface to prevent cross-file conflict.

| File | Selectors | Canonical ownership |
|---|---|---|
| `css/modules/focus_stage.css` | 97 | **Base definitions**: `.focus-stage`, `.focus-stage-card`, `.focus-stage-dive-btn`, `.focus-stage-action-btn`, `.focus-stage-inside-*`, desktop layout, galaxy/map state visibility |
| `css/journey_steps.css` | 99 | **Neighbor rail**: `.focus-stage-neighbor-*`, `.focus-stage-route-*`, thread inspector buttons, focus-transition-phase arrival animations |
| `css/mobile_premium_focus.css` | 205 | **Mobile focus/dive composition**: `data-panel-surface="focus"`, `"focus-search"`, `"semantic-dive"` mobile overrides, chip/kicker/actions layout, focus-stage action/button primitives |
| `css/mobile_premium_surfaces.css` | 38 | **Mobile geometry corrections**: idle state `.info-panel` max-height, neighbor card mobile layout, route dot sizing, and remaining field-node/late backstops |
| `css/strands.css` | 5 | **Galaxy view**: `data-active-view="galaxy"` visibility for action/dive/inside/neighbor buttons |
| `css/controls.css` | 2 | **Button primitives**: `.focus-stage-journey-btn` sizing alongside shared control-btn |
| `css/mobile_base.css` | 1 | **Early mobile**: `.focus-stage-inside-pulse` reduced-motion override only; no `.focus-stage-card` ownership |
| `css/layout_base.css` | 1 | **Search state hide**: `body[data-panel-surface="search"] .focus-stage` |
| `css/progressive_disclosure.css` | 1 | **Disclosure hide**: `.focus-stage` within graph-context show/hide |
| `css/search.css` | 1 | **Search state hide**: `body[data-panel-surface="search"] .focus-stage` |

**Canonical owners by sub-surface:**

- **Base structure & desktop** → `css/modules/focus_stage.css`
- **Neighbor rail & thread inspector** → `css/journey_steps.css`
- **Mobile focus/semantic-dive composition** → `css/mobile_premium_focus.css`
- **Mobile focus-stage action/button primitives** → `css/mobile_premium_focus.css`
- **Mobile geometry corrections (late cascade)** → `css/mobile_premium_surfaces.css`
- **Galaxy-view visibility** → `css/strands.css`

**Rules:**

- Edit `css/modules/focus_stage.css` first for base styles, hover effects, disabled states, and desktop layout.
- Edit `css/journey_steps.css` first for neighbor cards, neighbor actions, route line/dots, and thread inspector focus-visible.
- Edit `css/mobile_premium_focus.css` first for mobile focus-search or semantic-dive overrides.
- Edit `css/mobile_premium_focus.css` first for `.focus-stage-action-btn`, `.focus-stage-dive-btn`, `.focus-stage-journey-btn`, `.focus-thread-inspector-btn`, and related mobile focus action primitives.
- Edit `css/mobile_premium_surfaces.css` only for late geometry corrections that must load after focus/state rules; do not reintroduce focus action primitive ownership there.
- Do not add new `.focus-stage` selectors to `css/mobile_base.css`, `css/progressive_disclosure.css`, or `css/search.css` — those are legacy/supporting with minimal footprint.
- Touch target minimum: all `.focus-stage-*-btn` elements must maintain `min-height: 44px` and `flex-shrink: 0` (enforced in `css/modules/focus_stage.css`; verified by `global-spacing` contract).

## Minimal QA Matrix For CSS Edits

Run the smallest proof that exercises the surface you touched before reaching for the full visual suite.

| Touched module | Minimum check |
|---|---|
| `css/base.css`, `css/layout_base.css`, `css/clusters.css` selected-card/base card work | `npm run qa:contract:desktop-idle` and `npm run qa:contract:mobile-idle` |
| `css/search.css` search rail, results, filters, rail sections | `npm run qa:contract:mobile-idle`; add `npm run qa:contract:search-error` for error/retry states |
| `css/journey_steps.css`, `css/journey_active.css` focus-stage or journey controls | `npm run qa:contract:launch-focus`, `npm run qa:contract:focus-pocket`, and `npm run qa:contract:field-node` for field-node blocks |
| `css/mobile_premium_focus.css` | `npm run qa:surface:focus` and `npm run qa:contract:focus-pocket` |
| `css/mobile_premium_chrome.css`, map trail strip/chrome work | `npm run qa:contract:map-trail` and `npm run qa:surface:map-trail` |
| `css/mobile_premium_state.css`, `css/mobile_base.css`, `css/strands.css` mobile state layout | `npm run qa:contract:mobile-idle` plus the touched state-specific surface |
| `semantic-demo.css` or `css/mobile_premium.css` import/hash edits | `npm run check:shell` and `npm run check:cache` when the JS bundle hash is intentionally current |
| `css/mobile_premium_map_summary.css` | `npm run qa:surface:map-focus-search` and `node tests/map-focus-search-content-owner-contract.mjs` |

Known gaps that still need dedicated small checks: loading overlay, hover tooltip, synthesis summary card, mode-chip locked/waiting states, search-trail cue, and short-landscape layout. Weather widget ownership is covered by `tests/weather-surface-ownership-contract.mjs`.
