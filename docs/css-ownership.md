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

There is **no `@import` chain** in `css/` at all (verified: `grep -rn "@import" css/`
returns nothing). The "cascade" is purely `<link>` injection **ORDER** in
`vite.config.ts` → `LEGACY_CSS_LINKS`. Later links win on equal specificity.

Injection order (current HEAD, after `refactor(css): delete empty
mobile_premium__map.css stub`):

1. `semantic-demo.css`
2. `vector-explorer-pandora.css`
3. `css/mobile_premium__focus-dive.css`
4. `css/mobile_premium__chrome.css`
5. `css/mobile_premium__state.css`
6. `css/mobile_premium__idle.css`
7. `css/mobile_premium__surfaces.css`   (`mobile_premium__map.css` deleted)
8. `css/mobile_premium__narrow.css`
9. `css/modules/focus_stage.css`   (loaded last)

## 2. Module ownership table

Total: **23 files** (`css/*.css` roots + `css/modules/focus_stage.css`).
LOC from `find css -name '*.css' | xargs wc -l` at plan-investigation HEAD.
`mobile_premium__map.css` (was 1 line, empty stub) deleted by `2eba62bf`.

| File                                  | LOC  | Owns                                                                                  |
| ------------------------------------- | ---- | ------------------------------------------------------------------------------------- |
| `css/mobile_premium__focus-dive.css`  | 2107 | FOCUS/DIVE states; journey-compass focus geometry; focus-stage-card; cascade header   |
| `css/search.css`                      | 1822 | Search chrome, results, filters, `.rail-section` (desktop+global)                     |
| `css/mobile_premium__surfaces.css`    | 1512 | Panel-specific surface rules (info-panel, selected-details, view-toggle in idle)      |
| `css/strands.css`                     | 1421 | Strand/thread visuals, compass geometry, canvas                                      |
| `css/layout_base.css`                 | 1292 | Core desktop layout; references shard interplay                                      |
| `css/modules/focus_stage.css`         | 1290 | Focus-stage visibility/positioning; loaded last via `<link>`                         |
| `css/progressive_disclosure.css`      | 1061 | Disclosure/rail expansions; references `surfaces.css`                                |
| `css/mobile_premium__chrome.css`      | 961  | Chrome/furniture across states (≤768px + 900 landscape)                              |
| `css/journey_steps.css`               | 916  | Journey step UI                                                                       |
| `css/mobile_premium__state.css`       | 859  | State-machine styles (≤640px + 641–768px)                                            |
| `css/shell.css`                       | 759  | App shell                                                                            |
| `css/journey_active.css`              | 668  | Active journey state                                                                 |
| `css/mobile_base.css`                 | 566  | Base mobile layout                                                                   |
| `css/controls.css`                    | 451  | Control widgets                                                                      |
| `css/time_weather.css`                | 441  | Weather/time widget                                                                  |
| `css/clusters.css`                   | 401  | Cluster visuals                                                                      |
| `css/loading.css`                    | 350  | Loading overlay                                                                      |
| `css/base.css`                        | 285  | Root base                                                                            |
| `css/mobile_premium__narrow.css`      | 253  | ≤360px narrow viewport tightening                                                    |
| `css/synthesis.css`                   | 196  | Synthesis panel                                                                      |
| `css/animations.css`                  | 129  | Keyframes                                                                            |
| `css/mobile_premium__idle.css`        | 102  | Idle surface rules (≤768px)                                                          |
| `css/demo_ui.css`                     | 12   | **Near-dead** — 1 live rule (`body[data-demo-active='true'] .view-toggle`), rest comment |

## 3. Mobile premium shard map

The 7 `mobile_premium__*.css` shards were micro-sliced on 2026-06-02
("because the chrome/state/surfaces files all targeted 6–8 of the same
`data-panel-surface` values with overlapping concerns" — see the cascade
header in `css/mobile_premium__focus-dive.css:1-25`).

`mobile_premium__map.css` was an empty 1-line stub and is **deleted**
(`2eba62bf`).

Remaining 6 shards have documented overlap — e.g. `body.surface-idle .info-panel`
is styled in chrome + state + surfaces + narrow; `.focus-stage-card` for
`body.surface-semantic-dive` has 9 blocks inside `focus-dive.css` alone.
Fragmented breakpoint tiers (360 / 480 / 640 / 768 / 900) compound the drift.

**Planned consolidation** (see `docs/cleanup-plans/css-surface-cleanup-plan.md` §3):
merge the 6 shards → 3:

- `mobile_premium__components.css` ← `focus-dive` (rename) + `idle` (fold)
- `mobile_premium__state.css` ← `state` + `surfaces` (fold)
- `mobile_premium__layout.css` ← `chrome` + `narrow` (fold)

After merge, update `LEGACY_CSS_LINKS` and the cascade-header comment, and
re-point the cross-file references in `journey_active.css:47`,
`mobile_premium__idle.css:24`, `mobile_premium__narrow.css:155`,
`search.css:54`, `strands.css:815,619`, `layout_base.css:243,389-390`,
`progressive_disclosure.css:790`.

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
component. The only safe, dependency-free inline candidate is `demo_ui.css`'s
single live rule.

## 5. Body-class / state taxonomy

State is gated via `body.surface-*` classes and `data-panel-surface`
attributes (idle / search / focus / semantic-dive / map). Many broad
selectors (`body.surface-idle`, `body.surface-focus`, `.journey-compass`,
`#canvas-container`, `.stat-caption`, `.info-header`, `.rail-section`,
`.view-toggle`) appear in 8–13 files each — these are state-gated _context_
prefixes, not duplicate rules. When editing a surface rule, grep every shard
that gates the same `body.surface-*` class to avoid silent cascade drift.

One un-gated rule to watch: `css/mobile_premium__surfaces.css:3-5`
(`body:not(.surface-idle) #selected-details.active:not([hidden])`) has **no
`@media`** and applies at all viewports — a desktop-leak risk. If merged, gate
it explicitly with `@media (max-width:768px)` or confirm intent.

## 6. Change protocol

- **Add a CSS file:** append its `<link>` to `LEGACY_CSS_LINKS` in load order
  (later entry = higher cascade priority). Do not introduce an `@import` chain.
- **Add a mobile surface:** prefer folding into the matching shard; do **not**
  re-splinter into new `mobile_premium__*.css` files.
- **New breakpoint:** reuse the existing tier set (360 / 480 / 640 / 768 / 900);
  avoid one-off `@media` widths that fragment the taxonomy.
- **Preserve `!important` counts:** `tests/unit-active/css-important-invariant.test.ts`
  guards against silent `!important` drift across merges — keep it green.
- **Verify after CSS-link edits:** `npm run build:svelte` (link injection) and
  `npm run qa:surface:all` (surface regression).
