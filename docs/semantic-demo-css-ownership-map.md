# Semantic Demo CSS Ownership Map

Status: active
Updated: 2026-05-17

## Purpose

`semantic-demo.css` is now an import sheet. It should stay small and only load the real CSS modules under `css/`.

Use this map to find the module that owns a UI surface before changing mobile layout, density, stacking, or state behavior. Do not re-add moved rules to `semantic-demo.css`.

The module order below is the cascade order. The first reconstruction preserved the original monolithic stylesheet as contiguous ranges, so moving rules between modules is a behavior change unless the cascade is re-verified.

## Module Map

| Module | Primary Ownership |
|---|---|
| `semantic-demo.css` | Import order and cache-busted `@import` URLs only. |
| `css/base.css` | Root tokens, global visibility helpers, accessibility utilities. |
| `css/loading.css` | Loading overlay and startup progress surfaces. |
| `css/tooltips.css` | Hover tooltip/card preview surfaces. |
| `css/shell.css` | Core app shell, canvas, map container, map trail strip, biofield shell. |
| `css/time_weather.css` | Weather overlay, weather widget, time display, and weather/map mobile chrome variants. |
| `css/demo_ui.css` | Demo-specific UI helpers. |
| `css/synthesis.css` | Synthesis/summary card and guide CTA surfaces. |
| `css/controls.css` | View toggle, view handoff, keyboard close button, and adjacent control surfaces. |
| `css/layout_base.css` | Info panel, legend, mode chips, broad layout rules, map/search/focus supporting states. |
| `css/search.css` | Shared and desktop search/result styles. |
| `css/mobile_base.css` | Early mobile journey compass and mobile/reduced-motion owner blocks from the original cascade. |
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
| `css/mobile_premium_idle.css` | Final narrow idle-state corrections. |
| `css/mobile_premium_surfaces.css` | Final mobile bottom-sheet and surface geometry corrections. |

## Mobile Search And Result Drawer

Owner seam: `mobile-search-results`

Primary source:

- Markup: `vector-explorer-polished.html`, `.search-container`, `#synthesize-trigger`, `#search-results`
- State: `js/modules/search-state.js`, `setSearchPanelState()`, `renderSearchResultItems()`
- Current cascade owner: `css/mobile_base.css`, section `CSS OWNER: mobile-search-results`
- Supporting styles: `css/search.css`, `css/layout_base.css`, `css/progressive_disclosure.css`, `css/strands.css`

Rules:

- Edit the labeled owner block in `css/mobile_base.css` first for mobile search/result drawer layout, density, count, expanded-results, result-card polish, route-peek suppression, and summary CTA mobile behavior.
- Use supporting modules only when changing shared/base behavior. Do not add another late mobile override in an unrelated module until the owner block cannot safely express the state.
- Preserve these state contracts: `.has-query`, `.results-rendered`, `.has-expanded-results`, `#search-results.active`, `#search-results.is-expanded`, `data-mobile-route-peek`, `data-panel-surface="search"`, `data-panel-surface="focus-search"`, `data-active-view="map"`, and transition-only `data-semantic-dive`.

## Mobile Focus And Step Inside

Owner seam: `mobile-focus-stepinside`

Primary source:

- Markup: `vector-explorer-polished.html`, `.focus-stage`, `.focus-stage-card`, `.focus-stage-inside-status`, `.focus-stage-inside-controls`
- State: `data-panel-surface="focus"`, `data-panel-surface="focus-search"`, `data-panel-surface="semantic-dive"`, and transition-only `data-semantic-dive="transitioning"`
- Current cascade owner: `css/mobile_base.css`, section `CSS OWNER: mobile-focus-stepinside`
- Supporting styles: `css/journey_steps.css`, `css/strands.css`, `css/progressive_disclosure.css`, `css/shell.css`

Rules:

- Edit the labeled owner block in `css/mobile_base.css` first for mobile Step Inside HUD layout, readable focused-business title, inside status row, and inside control buttons.
- Preserve hidden-state behavior for `.focus-stage-journey`, `.focus-stage-neighbors`, `.focus-thread-inspector`, `.trail-controls`, and `.trail-context`; those are state-machine surfaces, not decorative duplicates.
- Do not consolidate Step Inside vignette or camera-motion selectors without live video proof.

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

- `#search-results.active`
- `.search-results-count`
- `.search-result-item` and state variants
- `.search-result-row`, name, rank, snippet, context
- Search-owned badges, result-row mechanics, and spinner selectors are canonical in `css/search.css`; search empty-state and suggestion-chip visual authority is in `css/progressive_disclosure.css`; do not reintroduce these in `css/clusters.css` or `css/journey_steps.css`.
- `#synthesize-trigger` and `.btn-synthesize`
- `.focus-stage`, `.focus-stage-card`, `.focus-stage-inside-status`, `.focus-stage-inside-controls`

Phase 3: split additional broad modules only when there is a clean surface boundary and a small proof route. Current priority seams:

- Keep `.rail-section` authority in `css/search.css`; do not reintroduce rail section styles in `css/clusters.css`.
- Resolve `.focus-stage` base ownership before broad edits; it is still distributed across `css/clusters.css`, `css/progressive_disclosure.css`, `css/journey_active.css`, `css/strands.css`, and `css/mobile_premium_focus.css`.
- Move self-contained transition effects out of `css/progressive_disclosure.css` only with cache refresh and before/after surface proof.

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

Known gaps that still need dedicated small checks: loading overlay, hover tooltip, weather widget, synthesis summary card, mode-chip locked/waiting states, search-trail cue, and short-landscape layout.
