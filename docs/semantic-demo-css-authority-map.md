# Semantic Demo CSS Authority Map

Date: 2026-05-17
Updated: 2026-06-04

> **2026-06-04 audit:** ZERO `!important` declarations remain in the CSS cascade. The authority map's earlier warnings about `!important` in surfaces.css (lines 188, 268, etc.) are stale. The cascade now relies entirely on selector specificity and load order.

## Compass Ownership Contract

The journey-compass redundancy contract (`tests/surface-redundancy-contract.mjs`) tracks whether compass ownership is **shrinking, stable, or growing** across the CSS cascade.

**Key metrics per primitive:**
- `ownerCount` — current number of cascade files declaring the primitive
- `registeredCount` — number of files in the allowedOwners registry
- `knownDebt = ownerCount - registeredCount` — positive means the registry is under-counting; negative means retired owners remain registered
- `debtSign` — `shrinking | stable | growing` based on comparing ownerCount to baselineOwnerCount
- `baselineOwnerCount` — the ownerCount captured at the time the contract was last updated

**Ratchet mode** (`RATCHET=1`): unknown owners cause immediate failure, preventing silent ownership drift. Without RATCHET, unknown owners are still reported but do not fail the contract, allowing the baseline to evolve without forcing a hard reset.

Run: `npm run qa:surface-redundancy` — or `RATCHET=1 npm run qa:surface-redundancy` to enforce strict registry alignment.

`semantic-demo.css` is an import shell only. It is not compiled selector authority, and old cleanup notes that point to selector line numbers inside that file are stale.

| Surface | Base authority | Mobile authority | Final/tail authority | Cleanup warning | Verification states |
|---|---|---|---|---|---|
| `#info-panel` / `.info-panel` | `css/layout_base.css` | `css/progressive_disclosure.css` | `css/mobile_premium__idle.css` for mobile idle composition | Do not remove scrollbar hiding unless mobile computed `scrollbar-width:none` still holds. `journey_steps.css` has no info-panel authority. | `01-mobile-idle`, `06-mobile-filters-open`, `07-desktop-idle` |
| `.search-container` / `#search-results` | `css/search.css`; shared `.search-results` scrollbar skin lives in `css/layout_base.css` | `css/search.css`, then later mobile state overrides. Search empty-state and search-input glass component authority live in `css/progressive_disclosure.css`; `css/search.css` keeps base input positioning/mechanics and `css/strands.css` owns scoped has-query overrides. | `css/mobile_premium__surfaces.css` for final mobile drawer sizing | Do not hide result row subcontent without mobile screenshot proof; search can look present while rows are clipped or invisible. | `02-mobile-search-coffee`, `08-desktop-search-coffee` |
| `.journey-compass` | `css/layout_base.css` (12 selectors), `css/modules/focus_stage.css` (7 selectors) | `css/journey_active.css` (38 selectors), `css/mobile_base.css` (7 selectors); duplicate mobile layout in `css/progressive_disclosure.css` was removed on 2026-05-19 | `css/mobile_premium__state.css` for state-machine, `focus-dive.css` for compact focus/dive, `chrome.css` for header chrome, `idle.css` for non-active idle | `field-node` is live JS state. Do not delete `journey_active.css` journey-compass base blocks as dead duplicates — but note `css/journey_steps.css` has **0 journey-compass selectors** (confirmed 2026-06-04). Active mobile field-node overrides live in `css/mobile_premium__focus-dive.css` (58 journey-compass selectors) and `css/mobile_premium__surfaces.css` (58 journey-compass selectors). | `01-mobile-idle`, `02-mobile-search-coffee`, `qa:contract:field-node`, `qa:contract:compass-rail`, mobile canvas-node focus proof |
| `#focus-stage` / `.focus-stage-card` | `css/modules/focus_stage.css` (119 selectors, tail-loaded — last in HTML link cascade), `css/journey_steps.css` (83 selectors) | `css/progressive_disclosure.css` (4 selectors), `css/journey_active.css` (5 selectors), `css/strands.css` (6 selectors) | `css/mobile_premium__focus-dive.css` (250 focus-stage selectors) for focus/dive sheets, `css/mobile_premium__surfaces.css` (34 selectors) for late geometry | Highest-risk surface. `css/search.css` has **0 focus-stage selectors** (removed since 2026-06-03). `css/layout_base.css` has **0 focus-stage selectors**. `css/clusters.css` is no longer a focus-stage authority. | `03-mobile-focus-first-result`, desktop focus |
| `.galaxy-cluster-label` | `css/clusters.css` for defensive DOM label styling; WebGL sprites are rendered by `js/modules/cluster-labels.js` | `css/clusters.css` mobile constraints | n/a | Treat DOM cluster label CSS as defensive compatibility. Do not add new cluster label systems without checking the WebGL sprite path. | WebGL sprite proof plus `07-desktop-idle` |
| `.selected-card` / `.about-card` | `css/clusters.css` for base and focus/map accent styling | `css/progressive_disclosure.css` for mobile state visibility and selected-card reduced-motion duration | `css/mobile_premium__idle.css` hides idle mobile selected card | Keep the base and active selected-card package in `css/clusters.css`; `css/search.css`, `css/journey_steps.css`, and `css/mobile_base.css` should not reintroduce selected-card styling. | `07-desktop-idle`, `08-desktop-search-coffee`, `12-desktop-reduced-motion`, selected-card computed coverage |
| `.map-trail-strip` / map chrome | `css/shell.css` | `css/strands.css` | `css/mobile_premium__map.css`, `css/animations.css` | Map chrome is distributed. Do not consolidate from one file without a full `rg` sweep. | `05-mobile-map`, direct `?view=map&q=coffee&anchor=519` |
| Mobile final overrides | n/a | n/a | The 7-file `css/mobile_premium__*.css` split, loaded directly by the app shell | Keep scoped to mobile/state selectors; avoid `!important`; verify desktop is untouched. | All mobile states plus `07-desktop-idle` |

### Journey Compass Title/Action Subownership

The compass is still intentionally distributed, but title/action edits must preserve this split:

| Primitive | Primary owner | Allowed modifiers | Guard |
|---|---|---|---|
| `.journey-compass-title` | `css/journey_active.css` for base/legacy phase variants | `css/mobile_base.css` for mobile base, the `css/mobile_premium__*.css` split (focus-dive, state, idle, map) for mobile variants, `css/strands.css` for legacy galaxy/mobile variants, `css/layout_base.css` for search base | `npm run check:ownership`, `npm run qa:contract:real-route`, affected `qa:contract` surfaces |
| `.journey-compass-actions` / `.journey-compass-rail` | `css/journey_active.css` for base phase states; `css/mobile_premium__focus-dive.css` / `css/mobile_premium__surfaces.css` for active field-node choreography | `css/mobile_base.css`, the `css/mobile_premium__*.css` split (state, chrome, narrow viewport corrections), `css/strands.css`, and the existing `css/progressive_disclosure.css` actions modifier | `npm run check:ownership`, `npm run qa:contract:field-node`, `npm run qa:contract:compass-rail` |
| `.journey-compass-action.primary` | `css/journey_active.css` for base primary action behavior | The `css/mobile_premium__*.css` split (focus-dive, state) for focus/dive mobile sizing and final mobile touch-target harmonization, existing `css/mobile_base.css`, `css/search.css`, `css/strands.css`, and `css/animations.css` modifiers | `npm run check:ownership`, `npm run qa:contract:real-route` |

Do not add a new compass title/action selector owner without updating `tests/css-ownership-check.mjs` and this table in the same change. The current counts are a ratchet against further ownership sprawl, not a claim that the existing spread is ideal.

## Search CSS Ownership Drift Guard

`css/search.css` owns shared and desktop search/result styles. It has **0 focus-stage selectors** and **0 journey-compass selectors** as of 2026-06-04. Do not reintroduce focus-stage or journey-compass selectors into `css/search.css`.

| Primitive | `css/search.css` authority | Drift risk |
|---|---|---|
| `.search-results`, `.search-result-item`, `.search-result-row` | Canonical owner for all result-card semantics, badges, row mechanics, and spinner selectors | Do not reintroduce in `css/clusters.css` or `css/journey_steps.css` |
| `.rail-section` | Canonical owner for rail section styling | Do not add duplicate rail-section rules to `css/clusters.css` |
| `#synthesize-trigger`, `.btn-synthesize` | Shared base button primitives | Late mobile overrides belong in `css/mobile_premium__chrome.css` |
| `.search-input-wrapper`, `.search-empty-state` | Base input positioning/mechanics only; visual authority for empty-state and suggestion-chip lives in `css/progressive_disclosure.css` | Do not add search-input glass component authority here |
| `.focus-stage`, `.journey-compass` | **0 selectors — do not add** | Any new focus-stage or journey-compass rule here is ownership drift; the ratchet in `tests/css-ownership-check.mjs` will catch it |

**Verification:** `rg -c "focus-stage|journey-compass" css/search.css` must return 0. If it returns >0, the new selectors are ownership drift and should be moved to the correct owner file.

## Safe Cleanup Order

1. `#info-panel`: move one duplicate at a time, then verify mobile and desktop computed overflow.
2. `.selected-card`: base and focus/map accent authority are now in `css/clusters.css`; next cleanup should target mobile-only hide/reduced-motion overlaps with screenshot proof.
3. `.journey-compass`: run `npm run qa:contract:field-node` before touching field-node blocks in `css/mobile_premium__focus-dive.css` or `css/mobile_premium__surfaces.css`; run `npm run qa:contract:compass-rail` before touching `journey_active.css` journey-compass base states.
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
