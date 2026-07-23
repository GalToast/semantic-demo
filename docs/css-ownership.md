# CSS Ownership Map

Live replacement for the archived `docs/archive/semantic-demo-css-authority-map.md`
and `docs/archive/semantic-demo-mobile-state-ownership.md`. Those two were
moved to `docs/archive/` by `7d240eb7` (intentional scope reduction of the
`docs/` root — see that commit's body). This doc is the current source of
truth for CSS ownership. Edit mobile/surface styles against this map.

## 1. Load mechanism

CSS is injected into `index.html` at build time via the `legacyRootAssetPlugin`
in `vite.config.ts`, which serializes the `LEGACY_CSS_LINKS` array into
`<link>` tags inside `transformIndexHtml`.

The effective cascade is a single explicit `<link>` injection **ORDER** from
`vite.config.ts` → `LEGACY_CSS_LINKS`. Every `css/*.css` file is listed directly
in that array; there is **no longer an `@import` chain inside `semantic-demo.css`**.
An earlier historical `@import` block lived at the repo root in `semantic-demo.css`,
but it has been removed in favor of explicit links so the full shipment map
lives in one place.`vite.config.ts` `copyRuntimeAssetsPlugin` still minifies every root-level
`.css` file when copying into `dist/svelte/`.

Injection order (current HEAD, after `refactor(css): consolidate
mobile_premium 7-shard split into 3 files`):

1. `semantic-demo.css`
2. `vector-explorer-pandora.css`
3. `css/mobile_premium__components.css` (FOCUS/DIVE/IDLE components)
4. `css/mobile_premium__layout.css` (chrome/furniture + narrow breakpoint)
5. `css/mobile_premium__state.css` (surface state machine)
6. `css/modules/focus_stage.css` (loaded last)

The previous 7-way shard split (`focus-dive`, `chrome`, `state`, `idle`,
`surfaces`, `map`, `narrow`) was consolidated in `7726d39c`.

## 2. Module ownership table

Total: **21 files** (`css/*.css` roots + `css/modules/focus_stage.css`).
`mobile_premium__map.css` (empty stub) was deleted by `2eba62bf`; the remaining
6 mobile premium shards were consolidated into 3 files by `7726d39c`.

| File                                 | LOC  | Owns                                                                                         |
| ------------------------------------ | ---- | -------------------------------------------------------------------------------------------- |
| `css/mobile_premium__components.css` | 2185 | FOCUS/DIVE/IDLE components; journey-compass focus geometry; focus-stage-card; cascade header |
| `css/search.css`                     | 1822 | Search chrome, results, filters, `.rail-section` (desktop+global)                            |
| `css/mobile_premium__state.css`      | 1664 | Surface state-machine + panel-specific rules (info-panel, selected-details, view-toggle)     |
| `css/strands.css`                    | 1421 | Strand/thread visuals, compass geometry, canvas                                              |
| `css/layout_base.css`                | 1292 | Core desktop layout; references shard interplay                                              |
| `css/modules/focus_stage.css`        | 1290 | Focus-stage visibility/positioning; loaded last via `<link>`                                 |
| `css/progressive_disclosure.css`     | 1061 | Disclosure/rail expansions; references state.css                                             |
| `css/mobile_premium__layout.css`     | 1048 | Mobile chrome/furniture across states + ≤360px narrow breakpoint                             |
| `css/journey_steps.css`              | 916  | Journey step UI                                                                              |
| `css/journey_active.css`             | 668  | Active journey state                                                                         |
| `css/shell.css`                      | 759  | App shell                                                                                    |
| `css/mobile_base.css`                | 566  | Base mobile layout                                                                           |
| `css/controls.css`                   | 451  | Control widgets                                                                              |
| `css/time_weather.css`               | 441  | Weather/time widget                                                                          |
| `css/clusters.css`                   | 401  | Cluster visuals                                                                              |
| `css/loading.css`                    | 350  | Loading overlay                                                                              |
| `css/base.css`                       | 285  | Root base                                                                                    |
| `css/synthesis.css`                  | 196  | Synthesis panel                                                                              |
| `css/animations.css`                 | 129  | Keyframes                                                                                    |

## 3. Mobile premium shard map

The previous 7-way shard split was consolidated in `7726d39c` to remove
overlapping ownership and fragmented breakpoint tiers. The current 3-file map:

| File                                 | Source files          | Concern                                                                                  |
| ------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------- |
| `css/mobile_premium__components.css` | `focus-dive` + `idle` | FOCUS/DIVE/IDLE component geometry, focus-stage-card, journey-compass focus geometry     |
| `css/mobile_premium__state.css`      | `state` + `surfaces`  | Surface state machine + panel-specific rules (info-panel, selected-details, view-toggle) |
| `css/mobile_premium__layout.css`     | `chrome` + `narrow`   | Mobile chrome/furniture and ≤360px narrow breakpoint                                     |
| _(deleted)_                          | `map.css`             | Empty 1-line stub removed in `2eba62bf`                                                  |

Within each file, the original source order is preserved so the cascade is
stable. Cross-file references in `journey_active.css`, `layout_base.css`,
`search.css`, `strands.css`, `progressive_disclosure.css`, `App.svelte`, and
`parity-attrs.svelte.ts` were re-pointed in `537bb582`.

## 4. Component-owned CSS convention

Of 40 `src/**/*.svelte` files, **36 have a `<style>` block** (inline is the
default). Only **2** use the Header `@import` pattern:

- `src/components/Header.svelte` → `@import '@lib/components/header/header.css'`
- `src/components/ProximityLegend.svelte` → `@import '@lib/css/z-layers.css'`

4 components have no `<style>` (shell / no-UI): `AppBoot.svelte`,
`DevToolsMount.svelte`, `SearchResultItem.svelte`, `WalkBreadcrumb.svelte`.

No high-ROI extract-global-into-component candidates exist — large global
files (`search.css` 1822, `strands.css` 1421) style 8–13 components per
selector; pulling them inline would force re-extraction of every dependent
component. (`demo_ui.css`'s single live rule was deleted 2026-07-23 as dead
CSS — no DOM ever matched the `.view-toggle` class — so no further
dependency-free inline candidates exist.)

## 5. Body-class / state taxonomy

State is gated via `body.surface-*` classes and `data-panel-surface`
attributes (idle / search / focus / semantic-dive / map). Many broad
selectors (`body.surface-idle`, `body.surface-focus`, `.journey-compass`,
`#canvas-container`, `.stat-caption`, `.info-header`, `.rail-section`,
`.view-toggle`) appear in 8–13 files each — these are state-gated _context_
prefixes, not duplicate rules. When editing a surface rule, grep every shard
that gates the same `body.surface-*` class to avoid silent cascade drift.

One previously un-gated rule in `css/mobile_premium__surfaces.css:3-5`
(`body:not(.surface-idle) #selected-details.active:not([hidden])`) now lives in
`css/mobile_premium__state.css` and is explicitly gated by
`@media (max-width:768px)` so it does not leak to desktop.

## 6. Change protocol

- **Add a CSS file:** append its `<link>` to `LEGACY_CSS_LINKS` in load order
  (later entry = higher cascade priority). Every `css/*.css` file must appear
  directly in that array; do not add `@import` rules to `semantic-demo.css`.
- **Add a mobile surface:** prefer folding into the matching shard
  (`components`, `state`, or `layout`); do **not** re-splinter into new
  `mobile_premium__*.css` files.
- **New breakpoint:** reuse the existing tier set (360 / 480 / 640 / 768 / 900);
  avoid one-off `@media` widths that fragment the taxonomy.
- **Preserve `!important` counts:** `tests/unit-active/css-important-invariant.test.ts`
  guards against silent `!important` drift across merges — keep it green.
- **Verify after CSS-link edits:** `npm run build:svelte` (link injection) and
  `npm run qa:surface:all` (surface regression).
- **Legacy shell:** `semantic-demo.css` is retained as the legacy shell entry
  point only. Do not add local rules or `@import`s to it; the owning shards are
  loaded explicitly via `LEGACY_CSS_LINKS`.
