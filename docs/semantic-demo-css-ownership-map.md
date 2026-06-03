# Semantic Demo CSS Ownership Map

Status: active
Updated: 2026-06-03

> **Note (2026-06-03):** As of this update, the mobile premium is **un-collapsed** back into the 7-file split (`css/mobile_premium__*.css`). Pass notes earlier in this doc that describe a "2026-06-02 collapse into `css/mobile_premium.css`" are stale; the single-file `css/mobile_premium.css` is not part of the current cascade. The references to `css/mobile_premium.css` in the rows below (e.g. line 122, 131, 147, 163, 167, 240-244) are residual stale text from the 2026-06-02 collapse step; treat them as the relevant split file from the list at line 18.

## Purpose

`semantic-demo.css` is now an import sheet. It should stay small and only load the real CSS modules under `css/`.

Use this map to find the module that owns a UI surface before changing mobile layout, density, stacking, or state behavior. Do not re-add moved rules to `semantic-demo.css`.

The module order below is the cascade order. The first reconstruction preserved the original monolithic stylesheet as contiguous ranges, so moving rules between modules is a behavior change unless the cascade is re-verified.

## Current Recommendation

Treat CSS state ownership as the next cleanup seam. Do not move visual rules yet unless a surface has a failing contract or a specific visual bug. The useful work now is to keep state docs and contracts aligned with the actual cascade so later visual edits land in the right module.

As of 2026-06-03, the final premium mobile owner is the ordered split loaded directly by `vector-explorer-polished.html`: `css/mobile_premium__focus-dive.css`, `css/mobile_premium__chrome.css`, `css/mobile_premium__state.css`, `css/mobile_premium__idle.css`, `css/mobile_premium__map.css`, `css/mobile_premium__surfaces.css`, and `css/mobile_premium__narrow.css`. Do not edit or recreate the deleted collapsed `css/mobile_premium.css` as a shadow owner.

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
| `css/mobile_premium__*.css` | Split final mobile override owner, loaded directly after the base cascade. Files cover focus/dive, chrome, state-machine, idle, map summary, surface corrections, and narrow viewport corrections. |

## Mobile Search And Result Drawer

Owner seam: `mobile-search-results`

Primary source:

- Markup: `vector-explorer-polished.html`, `.search-container`, `#synthesize-trigger`, `#search-results`
- State: `js/modules/search-state.js`, `setSearchPanelState()`, `renderSearchResultItems()`
- Current cascade owners: `css/search.css` for shared search/result primitives and `css/mobile_premium__state.css` / `css/mobile_premium__chrome.css` for final mobile drawer/result chrome, `data-panel-surface-detail="peek"` / `"expanded"` layout, and compact result presentation.
- Supporting legacy/base styles: `css/mobile_base.css`, `css/layout_base.css`, `css/progressive_disclosure.css`, `css/strands.css`

Rules:

- Edit `css/search.css` first for shared result-card semantics and desktop/mobile primitive styling.
- Edit `css/mobile_premium__state.css` for `data-panel-surface-detail="peek"` or `"expanded"` behavior.
- Edit `css/mobile_premium__chrome.css` for mobile search drawer chrome, controls, and state-agnostic polish.
- `css/mobile_premium__chrome.css` owns late mobile positioning and visibility modifiers for `.share-toggle`, `.legend-toggle`, `.help-toggle`, and the compact `.controls` rail. Use existing z-index tokens and state-scoped selectors; do not use `!important` to force these above other surfaces.
- Use `css/mobile_premium__surfaces.css` only for generic late geometry/touch-target backstops or map-specific compact result guards.
- Treat `css/mobile_base.css`, `css/progressive_disclosure.css`, and `css/strands.css` as legacy/supporting surfaces for this seam; avoid new overrides there unless a contract or visual proof requires it.
- In `search` + `peek`, render one clean anchor row only; secondary result rows belong to expanded mode and must not appear as clipped slivers inside the collapsed sheet.
- Preserve these state contracts: `.has-query`, `.results-rendered`, `.has-expanded-results`, `#search-results.active`, `#search-results.is-expanded`, `data-mobile-route-peek`, `data-panel-surface="search"`, `data-panel-surface="focus-search"`, `data-active-view="map"`, and transition-only `data-semantic-dive`.

## Mobile Focus And Step Inside

Owner seam: `mobile-focus-stepinside`

Primary source:

- Markup: `vector-explorer-polished.html`, `.focus-stage`, `.focus-stage-card`, `.focus-stage-inside-status`, `.focus-stage-inside-controls`
- State: `data-panel-surface="focus"`, `data-panel-surface="focus-search"`, `data-panel-surface="semantic-dive"`, and transition-only `data-semantic-dive="transitioning"`
- JS owner: `js/modules/journey-selected-card.js` owns `syncFocusStage()` and selected-card DOM hydration; `js/modules/journey-focus-ui.js` owns focus/traversal DOM UI and the neighbor rail; `js/modules/journey.js` is now the orchestration/re-export layer for this surface.
- Current cascade owners: `css/journey_active.css` for active journey/field-node choreography and `css/mobile_premium__focus-dive.css` / `css/mobile_premium__surfaces.css` for final mobile focus-search, semantic-dive composition, and late canopy/bottom-sheet geometry corrections.
- Supporting legacy/base styles: `css/journey_steps.css`, `css/mobile_base.css`, `css/strands.css`, `css/progressive_disclosure.css`, `css/shell.css`

Rules:

- Edit `css/journey_active.css` first for field-node/route choreography and journey-compass state behavior.
- Edit `css/mobile_premium__focus-dive.css` first for mobile focus-search or semantic-dive composition.
- Edit `css/mobile_premium__surfaces.css` only for late loaded geometry correction after focus/state rules.
- Treat `css/mobile_base.css`, `css/progressive_disclosure.css`, and `css/strands.css` as supporting legacy surfaces; do not add new focus HUD ownership there without updating this map.
- Preserve hidden-state behavior for `.focus-stage-journey`, `.focus-stage-neighbors`, `.focus-thread-inspector`, `.trail-controls`, and `.trail-context`; those are state-machine surfaces, not decorative duplicates.
- Do not consolidate Step Inside vignette or camera-motion selectors without live video proof.
- Product-route handoff leaks are guarded by `mobile-product-focus-route` and `mobile-product-preview-route` in `tests/surface-contract-check.mjs`: focused result routes must hide lower search/info chrome, keep `#mode-grid` suppressed, and make `#focus-stage` or `#focus-thread-inspector` the owning mobile surface.
- Known watchpoint: legacy map selected-card accents still exist in `css/progressive_disclosure.css` and `css/clusters.css`. Treat them as supporting/base rules until a focused map visual or contract proves they should move; the late mobile owner is now the appropriate file in the `css/mobile_premium__*.css` split (typically `surfaces.css` for late geometry, `map.css` for map-specific overrides).

## Mobile Map Focus Search Summary

Owner seam: `mobile-map-focus-search-summary`

Primary source:

- Markup: `vector-explorer-polished.html`, `#selected-map-summary`
- State/content: `js/modules/focus-stage-renderer.js`, `syncSelectedCardContentVariant()`
- Current cascade owners: `css/mobile_premium__map.css` and `css/mobile_premium__surfaces.css` for the dedicated map summary presentation, map selected-card visibility, bottom drawer geometry, and suppression backstops.

Rules:

- Edit `css/mobile_premium__map.css` first for `#selected-map-summary` text hierarchy, role pill, match copy, and compact summary presentation.
- Edit `css/mobile_premium__surfaces.css` only when the `map-focus-search` bottom drawer geometry, hidden legacy surfaces, or final suppression backstops need to change.
- Do not style old selected-card internals for `map-focus-search`; the source contract keeps that surface on the dedicated summary subtree.
- Keep the summary read-only. Map actions remain in `.map-trail-strip`.

## Journey Compass Ownership

Owner seam: `journey-compass`

The journey-compass cascade is distributed across base/supporting files plus the collapsed mobile premium owner. Edit the canonical owner first; use supporting files only for late geometry corrections or state-specific polish that must override the canonical owner.

| File | Journey-compass selectors | Role |
|---|---|---|
| `css/journey_active.css` | 162 | Journey-compass base, phase/density states, focus/search/inside behavior, map-trail active styling |
| `css/mobile_premium__*.css` (7 files, see Module Map) | 135 | Split mobile premium compass owner: focus/dive (`focus-dive.css`), chrome (`chrome.css`), state-machine (`state.css`), idle (`idle.css`), map (`map.css`), surface correction (`surfaces.css`), narrow viewport (`narrow.css`) |
| `css/strands.css` | 40 | Mobile bottom sheet, route surfaces, journey-compass field-node action buttons |
| `css/layout_base.css` | 12 | Info panel, map-focus/trail state overrides |
| `css/mobile_base.css` | 6 | Reduced-motion support only; no mobile journey-compass layout ownership |
| `css/progressive_disclosure.css` | 6 | Show/hide, reduced-motion journey-compass suppression |
| `css/animations.css` | 7 | Final mobile/reduced-motion override tail, galaxy overview compass |

**Canonical owners:**
- `css/journey_active.css` owns `.journey-compass` base styling (lines 155–327), phase/density states (`[data-phase]`, `[data-density]`), and active-view map behavior.
- The 7 split files `css/mobile_premium__*.css` own final mobile compass normalization and variants: focus/dive (`focus-dive.css`), chrome (`chrome.css`), state-machine (`state.css`), idle (`idle.css`), map (`map.css`), surface correction (`surfaces.css`), narrow viewport (`narrow.css`). Edit the named file matching the state.

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

2026-06-03 mobile split (un-collapse) pass:
- The collapsed `css/mobile_premium.css` is retired; the 7-file split (`css/mobile_premium__*.css`) is the current edit target. `tests/focus-stage-css-ownership-contract.mjs` and `tests/surface-redundancy-contract.mjs` were updated to register the split files.

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

Phase 1: root stylesheet modularization is active. `semantic-demo.css` imports the base modules and the app shell loads the 7 split `css/mobile_premium__*.css` files directly as the final mobile owner.

Phase 2: reduce duplicate mobile rules inside `css/mobile_base.css`, `css/progressive_disclosure.css`, and adjacent supporting modules one selector family at a time:

- `.search-results.active` — owned across `css/search.css` (3), `css/journey_active.css` (1), `css/progressive_disclosure.css` (3), `css/strands.css` (8), the `css/mobile_premium__*.css` split (13 total, primarily `state.css` + `surfaces.css`), and `css/animations.css` (1). `css/layout_base.css` is no longer a search-result owner. The baseline count is tracked in `tests/css-ownership-check.mjs`; any new definition beyond these owners will trigger a violation.

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
| `css/journey_steps.css` | 99 | **Neighbor rail + desktop focus-card presentation**: `.focus-stage-neighbor-*`, `.focus-stage-route-*`, thread inspector buttons, focus-transition-phase arrival animations, and desktop-gated `.focus-stage-card` presentation |
| `css/mobile_premium__focus-dive.css` / `css/mobile_premium__surfaces.css` | 270+ | **Final mobile owner**: focus/dive composition, mobile geometry corrections, chip/kicker/actions layout, active field-node canopy, and focus-stage action/button primitives |
| `css/strands.css` | 5 | **Galaxy view**: `data-active-view="galaxy"` visibility for action/dive/inside/neighbor buttons |
| `css/controls.css` | 2 | **Button primitives**: `.focus-stage-journey-btn` sizing alongside shared control-btn |
| `css/mobile_base.css` | 1 | **Early mobile**: `.focus-stage-inside-pulse` reduced-motion override only; no `.focus-stage-card` ownership |
| `css/layout_base.css` | 1 | **Search state hide**: `body[data-panel-surface="search"] .focus-stage` |
| `css/progressive_disclosure.css` | 1 | **Disclosure hide**: `.focus-stage` within graph-context show/hide |
| `css/search.css` | 1 | **Search state hide**: `body[data-panel-surface="search"] .focus-stage` |

**Canonical owners by sub-surface:**

- **Base structure & desktop** → `css/modules/focus_stage.css`
- **Neighbor rail & thread inspector** → `css/journey_steps.css`
- **Desktop focus-card presentation** → `css/journey_steps.css` under `@media (min-width: 769px)`
- **Mobile focus/semantic-dive composition** → `css/mobile_premium__focus-dive.css`
- **Mobile focus-stage action/button primitives** → `css/mobile_premium__focus-dive.css`
- **Mobile geometry corrections (late cascade)** → `css/mobile_premium__surfaces.css`
- **Galaxy-view visibility** → `css/strands.css`

**Rules:**

- Edit `css/modules/focus_stage.css` first for base styles, hover effects, disabled states, and desktop layout.
- Edit `css/journey_steps.css` first for neighbor cards, neighbor actions, route line/dots, thread inspector focus-visible, and desktop-only focus-card presentation.
- Edit `css/mobile_premium__focus-dive.css` first for mobile focus-search or semantic-dive overrides.
- Edit `css/mobile_premium__focus-dive.css` first for `.focus-stage-action-btn`, `.focus-stage-dive-btn`, `.focus-stage-journey-btn`, `.focus-thread-inspector-btn`, and related mobile focus action primitives.
- Edit `css/mobile_premium__surfaces.css` only for late geometry corrections that must load after focus/state rules; do not reintroduce focus action primitive ownership elsewhere.
- Do not add new `.focus-stage` selectors to `css/mobile_base.css`, `css/progressive_disclosure.css`, or `css/search.css` — those are legacy/supporting with minimal footprint.
- Touch target minimum: all `.focus-stage-*-btn` elements must maintain `min-height: 44px` and `flex-shrink: 0` (enforced in `css/modules/focus_stage.css`; verified by `global-spacing` contract).

2026-06-01 compact route-chip pass:
- Moved non-field-node `focus-search` `.focus-stage-journey.active` compact layout, route progress/next copy, and hidden prev/next controls from `css/mobile_premium_surfaces.css` to `css/mobile_premium_focus.css`.
- `css/mobile_premium_surfaces.css` now keeps only field-node/late backstops for this family; ordinary focus-search journey chip composition belongs to the focus owner.

2026-06-01 field-node canopy pass:
- Moved active `focus-search` field-node focus-stage suppression and journey-chip composition into `css/mobile_premium_focus.css`.
- Active field-node journey-compass action sizing/pseudo-label typography now belongs to `css/mobile_premium_focus.css`; `css/mobile_premium_surfaces.css` keeps non-active fallback/backstop selectors only.

2026-06-03 mobile split (un-collapse) pass:
- The prior 2026-06-02 collapse notes above describe historical movement. The active edit target for those owners is the corresponding named file in the 7-file `css/mobile_premium__*.css` split.

## Minimal QA Matrix For CSS Edits

Run the smallest proof that exercises the surface you touched before reaching for the full visual suite.

| Touched module | Minimum check |
|---|---|
| `css/base.css`, `css/layout_base.css`, `css/clusters.css` selected-card/base card work | `npm run qa:contract:desktop-idle` and `npm run qa:contract:mobile-idle` |
| `css/search.css` search rail, results, filters, rail sections | `npm run qa:contract:mobile-idle`; add `npm run qa:contract:search-error` for error/retry states |
| `css/journey_steps.css`, `css/journey_active.css` focus-stage or journey controls | `npm run qa:contract:launch-focus`, `npm run qa:contract:focus-pocket`, and `npm run qa:contract:field-node` for field-node blocks |
| `css/mobile_premium__focus-dive.css` | `npm run qa:surface:focus` and `npm run qa:contract:focus-pocket` |
| `css/mobile_premium__map.css` (map trail strip/chrome) | `npm run qa:contract:map-trail` and `npm run qa:surface:map-trail` |
| The `css/mobile_premium__*.css` split (state, chrome, idle, surfaces), `css/mobile_base.css`, `css/strands.css` mobile state layout | `npm run qa:contract:mobile-idle` plus the touched state-specific surface |
| `semantic-demo.css` or any `css/mobile_premium__*.css` import/hash edits | `npm run check:shell` and `npm run check:cache` when the JS bundle hash is intentionally current |
| `css/mobile_premium__map.css` (map summary section) | `npm run qa:surface:map-focus-search` and `node tests/map-focus-search-content-owner-contract.mjs` |

Known gaps that still need dedicated small checks: loading overlay, hover tooltip, synthesis summary card, mode-chip locked/waiting states, search-trail cue, and short-landscape layout. Weather widget ownership is covered by `tests/weather-surface-ownership-contract.mjs`.
