# Semantic Demo CSS Authority Map

Date: 2026-05-17

`semantic-demo.css` is an import shell only. It is not compiled selector authority, and old cleanup notes that point to selector line numbers inside that file are stale.

| Surface | Base authority | Mobile authority | Final/tail authority | Cleanup warning | Verification states |
|---|---|---|---|---|---|
| `#info-panel` / `.info-panel` | `css/layout_base.css` | `css/progressive_disclosure.css` | `css/mobile_premium.css` for mobile idle composition | Do not remove scrollbar hiding unless mobile computed `scrollbar-width:none` still holds. `journey_steps.css` has no info-panel authority. | `01-mobile-idle`, `06-mobile-filters-open`, `07-desktop-idle` |
| `.search-container` / `#search-results` | `css/search.css`; shared `.search-results` scrollbar skin lives in `css/layout_base.css` | `css/search.css`, then later mobile state overrides. Search empty-state and search-input glass component authority live in `css/progressive_disclosure.css`; `css/search.css` keeps base input positioning/mechanics and `css/strands.css` owns scoped has-query overrides. | `css/mobile_premium.css` for final mobile drawer sizing | Do not hide result row subcontent without mobile screenshot proof; search can look present while rows are clipped or invisible. | `02-mobile-search-coffee`, `08-desktop-search-coffee` |
| `.journey-compass` | `css/layout_base.css`, `css/journey_steps.css` | `css/journey_active.css`, `css/progressive_disclosure.css`; mobile scrollbar hiding is late-owned by `css/progressive_disclosure.css` | `css/mobile_premium.css` for compact mobile states | `field-node` is live JS state. Do not delete `journey_active.css` field-node blocks as dead duplicates. | `01-mobile-idle`, `02-mobile-search-coffee`, `qa:contract:field-node`, mobile canvas-node focus proof |
| `#focus-stage` / `.focus-stage-card` | `css/clusters.css`, `css/journey_steps.css` | `css/progressive_disclosure.css`, `css/journey_active.css` | `css/mobile_premium.css` for focus/dive sheets | Highest-risk surface. Do not consolidate until every `data-panel-surface`, `data-focus-panel-mode`, and transition-only `data-semantic-dive` state is mapped. | `03-mobile-focus-first-result`, desktop focus |
| `.galaxy-cluster-label` | `css/clusters.css` for defensive DOM label styling; WebGL sprites are rendered by `js/modules/cluster-labels.js` | `css/clusters.css` mobile constraints | n/a | Treat DOM cluster label CSS as defensive compatibility. Do not add new cluster label systems without checking the WebGL sprite path. | WebGL sprite proof plus `07-desktop-idle` |
| `.selected-card` / `.about-card` | `css/clusters.css` for base and focus/map accent styling | `css/progressive_disclosure.css` for mobile state visibility and selected-card reduced-motion duration | `css/mobile_premium.css` hides idle mobile selected card | Keep the base and active selected-card package in `css/clusters.css`; `css/search.css`, `css/journey_steps.css`, and `css/mobile_base.css` should not reintroduce selected-card styling. | `07-desktop-idle`, `08-desktop-search-coffee`, `12-desktop-reduced-motion`, selected-card computed coverage |
| `.map-trail-strip` / map chrome | `css/shell.css` | `css/strands.css` | `css/mobile_premium.css`, `css/animations.css` | Map chrome is distributed. Do not consolidate from one file without a full `rg` sweep. | `05-mobile-map`, direct `?view=map&q=coffee&anchor=519` |
| Mobile final overrides | n/a | n/a | `css/mobile_premium.css` import shell loading `css/mobile_premium_focus.css`, `css/mobile_premium_chrome.css`, `css/mobile_premium_state.css`, `css/mobile_premium_idle.css`, and `css/mobile_premium_surfaces.css` | Keep scoped to mobile/state selectors; avoid `!important`; verify desktop is untouched. | All mobile states plus `07-desktop-idle` |

## Safe Cleanup Order

1. `#info-panel`: move one duplicate at a time, then verify mobile and desktop computed overflow.
2. `.selected-card`: base and focus/map accent authority are now in `css/clusters.css`; next cleanup should target mobile-only hide/reduced-motion overlaps with screenshot proof.
3. `.journey-compass`: run `npm run qa:contract:field-node` before touching `journey_active.css` field-node blocks.
4. `#focus-stage`: map state combinations before deleting any duplicate-looking rules.
5. Map chrome: clean by user-visible state, not by file.
6. `.rail-section`: authority is `css/search.css`; do not add duplicate rail-section rules to `css/clusters.css`.

## Baseline Checks

- `npm run build`
- `npm run refresh:cache`
- `npm run check:cache`
- `npm run check:shell`
- `npm run qa:visual`
- `git diff --check -- <edited paths>`
