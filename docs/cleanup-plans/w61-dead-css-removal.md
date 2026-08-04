# W61 — Dead-CSS Removal Plan (validated, collision-aware)

> **STATUS (2026-07-31, branch `master`, HEAD ~`5222e684`):** Validated removable list is **READY** — 117 unique selectors / 247 instances across 19 CSS files, estimated ~80–134 KiB savings. **NOT YET APPLIED** in this lane: the parallel live lane is actively editing the search-result surface (`tests/search-result-item-real-impl-contract.mjs`, `tests/widget-journey.spec.js`) — the `.search-result-cluster / -meta / -title / -type / -location / -actions` selectors below live in that exact seam. Per `AGENTS.md` ("surface the conflict in chat rather than silently picking a side"), the removal is parked until coordination with the live lane. The live lane owns the css-dead-CSS removal commit practice (recent commits `fc060667`, `9fa4e5d2`, `5477e113`) — this plan is the validated input for them or for a future coordinated removal pass.

> Read-only investigation + main-lane verification. No source edits in this plan. Every claim cites the verifier artifacts.

## 0. How this differs from ling's raw audit

The Free opencode-zen/ling-3.0-flash-free worker (B) produced `tmp/w61-unused-css-REPORT.md` claiming **160 dead selectors / ~134 KiB**. Main-lane verification showed ling's method had **~24% false-positives** (it grepped src/ for the `.`/`#`-prefixed token form and missed bare class names in `.svelte` markup + vendor (`leaflet-*`) selectors + svelte `class:` directives). Blind removal of ling's 160 would delete live rules.

This plan is the **main-lane-validated** subset: every selector below was checked with TWO passes:

1. `rg -w "token" src/` (word-bounded) — catches class usage in `.svelte`/`.ts`/`.js`.
2. `rg "token" src/` (substring, no `-w`) + `rg "prefix-${" src/` (template-ctor probe) — catches runtime template literals like `` `surface-map-${mode}` ``.

Select survivors: **66 selectors** were rejected as false-positives (KEPT — applied search-result markup real, vendor leaflet, real `view-toggle`/`is-anchor`/`search-clear-btn`/`cluster-item` etc.) and **18 hex colors** (`#ffffff`, `#ff6b6b`, `#eefaf8`, `#fff`, …) were skipped (they are color values, not element ids). **0 selectors** had a runtime template-ctor (`SUSPECT_PREFIX_TEMPLATE = 0`), so no residual construction-time false-negative risk.

## 1. Summary

| Metric                                     | Value                                                           |
| ------------------------------------------ | --------------------------------------------------------------- |
| Total ling dead-claims                     | 331                                                             |
| Hex colors (skipped, color values not ids) | 18                                                              |
| USED (false-positive — KEEP)               | 66                                                              |
| SUSPECT_TEMPLATE (prefix-`${` ctor — KEEP) | 0                                                               |
| **SAFE_DEAD (validated removable)**        | **247 instances = 117 unique**                                  |
| Files affected                             | 19 (`css/*.css`)                                                |
| Estimated savings                          | ~80–134 KiB                                                     |
| Verified by                                | `tmp/verify-dead-css.mjs` (v1), `tmp/verify-dead-css2.mjs` (v2) |
| Full validated output                      | `tmp/w61-dead-css-VALIDATED.txt`                                |

## 2. The 117 validated-safe-dead selectors (unique)

```
#btn-focus-expand
#btn-focus-overview
#info-panel-title
#mode-grid
.about-card
.action-beacon
.ambiguous-hover-indicator
.canvas-color-legend-row
.canvas-color-legend-swatch
.close-icon
.controls-divider
.controls-info
.controls-rail
.controls-view
.demo-journey-steps
.desktop-only
.discovery-active
.exploration-secondary
.filter-row
.filter-select
.focus-lens-truth
.focus-lens-truth-mark
.focus-stage-badges
.focus-stage-filed
.focus-stage-journey-btn
.focus-stage-journey-kicker
.focus-stage-journey-meta
.focus-stage-journey-progress
.focus-stage-meta
.focus-stage-name
.focus-stage-neighbor-card
.focus-stage-note
.focus-stage-route-dot
.focus-stage-route-line
.focus-stage-trivia
.focus-stage-what
.fog-overlay
.glass-light
.glass-medium
.glass-ultra
.guide-cta-kicker
.guide-cta-note
.info-subtitle
.interactive-element
.is-current
.is-focus-cluster
.is-waiting
.journey-compass-copy
.journey-compass-rail
.lane-degraded
.lane-healthy
.lane-reconnecting
.launch-btn
.legend-chip
.legend-chip-row
.legend-copy
.legend-meta
.legend-pill
.loading-spore
.loading-spores
.loading-thread
.mode-caption
.mode-grid
.mode-name
.navigation-map-trail-strip
.panel-section-title
.rail-section-body
.render-kind-placeholder2d
.reveal-focus
.search-error-detail-label
.search-input-wrapper
.search-result-actions
.search-result-cluster
.search-result-location
.search-result-meta
.search-result-title
.search-result-type
.search-results-count-empty
.search-spinner-overlay
.selected-empty-icon
.selected-highlight
.selected-meta-chip
.semantic-error
.semantic-lane-assist-row
.semantic-lane-rail
.slide-in-left
.sparkle
.spore-a
.spore-b
.spore-c
.startup-recovery-notice
.stat-box
.stat-caption
.stat-label
.stat-number
.stat-row
.stats-row
.story-chip
.summary-field-note
.summary-note
.sun-rays
.surface-inside
.surface-map-focus
.surface-map-focus-search
.surface-map-idle
.surface-map-search
.surface-map-trail
.surprise-btn
.terrain-bridge-halo
.terrain-bridge-veil
.time-display
.view-galaxy
.view-handoff-copy
.view-map
.weather-condition-icon
.weather-seed-base
.weather-wind
```

## 3. Per-file breakdown (for surgical removal — read this from `tmp/w61-dead-css-VALIDATED.txt`)

The full per-file list is in `tmp/w61-dead-css-VALIDATED.txt` (section "=== SAFE_DEAD by file ==="). Counts:

| File                                 | Count |
| ------------------------------------ | ----- |
| `css/mobile_premium__state.css`      | 30    |
| `css/layout_base.css`                | 27    |
| `css/strands.css`                    | 24    |
| `css/mobile_premium__components.css` | 23    |
| `css/modules/focus_stage.css`        | 22    |
| `css/mobile_base.css`                | 16    |
| `css/search.css`                     | 16    |
| `css/progressive_disclosure.css`     | 15    |
| `css/journey_active.css`             | 9     |
| `css/animations.css`                 | 8     |
| `css/clusters.css`                   | 7     |
| `css/journey_steps.css`              | 8     |
| `css/loading.css`                    | 6     |
| `css/controls.css`                   | 5     |
| `css/mobile_premium__layout.css`     | 13    |
| `css/time_weather.css`               | 11    |
| `css/shell.css`                      | 4     |
| `css/base.css`                       | 1     |
| `css/synthesis.css`                  | 1     |

## 4. Multi-selector rule handling (REQUIRED for safe removal)

A CSS rule like:

```css
.focus-stage-meta,
.focus-stage-note,
.live-rule {
    color: red;
}
```

must **NOT** have its whole block removed (`.live-rule` is live). Instead, surgically remove only the dead selectors from the comma list:

```css
.live-rule {
    color: red;
}
```

Multi-selector rules are common in this repo (e.g., `.stats-row, .stat-box { … }`). Handle each rule-block by walking its selector list and removing only the entries present in the 117-list above; if the list becomes empty, remove the block. **Re-run `tests/css-ownership-check.mjs` + `tests/mobile-chrome-ownership-contract.mjs` after edits** — they assert per-file selector-count baselines and may need a baseline bump.

## 5. Search-result seam — coordinate per-token with the live lane

The live lane's in-flight PR (`tests/search-result-item-real-impl-contract.mjs` + `tests/unit-active/search-result-item-real-impl.spec.ts` + `tests/widget-journey.spec.js`) reworks search-result rendering. The dead singleton `.search-result-cluster / -meta / -title / -type / -location / -actions` selectors (singular `search-result-*`, distinct from the live plural `.search-results-*`) overlap exactly that seam. **Before removing these six selectors**, check the live lane's `SearchResultItem.svelte` / result-renderer for any new use — if reintroduced, they must move OUT of the dead-list (and their CSS kept).

## 6. Suggested commit pattern

Following the live lane's precedent (`fix(css): remove dead …`, `cleanup(css): …`):

```
fix(css): remove 117 validated-dead selectors (W61 dead-CSS audit)
```

Commit body should cite `tmp/w61-dead-css-VALIDATED.txt` + the verifier scripts.

## 7. Surface-test gating (per `AGENTS.md`)

Pre-commit verification for the removal pass:

- `npm run build` (catches CSS parse errors)
- `node tests/css-ownership-check.mjs` (or bump `selectorBaselines` to post-removal counts)
- `node tests/mobile-chrome-ownership-contract.mjs` (shard-set check — no shard deleted)
- `npm run qa:contract` (surface contracts named in AGENTS.md)
- `npm run qa:journey:headless` (DOM-invariant journey tests)
- Mobile + desktop Lighthouse spot-check (a11y must stay 100)

## 8. Reference artifacts

- `tmp/w61-unused-css-REPORT.md` — ling's raw audit (lead-generator; ~24% false positives).
- `tmp/verify-dead-css.mjs` — v1 verifier (word-bounded `-w` + hex-color filter).
- `tmp/verify-dead-css2.mjs` — v2 verifier (adds substring + prefix-`${` template-ctor probe).
- `tmp/w61-dead-css-VALIDATED.txt` — full validated output (per-file breakdown + unique list).

## 9. Related: mode-transition-deps lazification — DESIGNED-EAGER, DO NOT RE-AUDIT

A parallel W61 workstream attempted to lazify the `mode-transition-deps` eager JS chunk (1.26 MB, ~70% "unused at boot") via source-level dynamic-import conversion of orchestrator imports. An empirical magistral-small-latest audit (`ocw_f376f0a5`) was **REJECTED** — the produced `safe.patch` was both corrupt (`git apply --check` fails at line 118) and based on misclassification: the url-state helpers `_frameCameraOnAnchor` / `_restoreFocusStateForAnchor` / `_restoreSearchFromParams` run during cold-boot deep-link restoration via the PR-B2/B4 splash bypass (for `?anchor`/`?record`/`?q`), not just in post-boot handlers. Deeper deferral requires deep-link-aware async gating (accepting focus-overlay flash on deep-link cold-load = explicit UX regression). See `vite.config.ts` manualChunks perf note (W61 update paragraph) for the durable repo reference, and harness `failures.md` key `w61-mode-transition-deps-lazify-rejected` for the cross-session harness-memory entry. **Do not re-audit this seam.**

## 10. Addendum (2026-08-04): field-node wrapper lift — newly validated dead rule

**Finding:** `body.surface-focus-search[data-focus-panel-mode='field-node'][data-trail-state='idle'] #focus-stage.focus-stage { bottom: calc(108px + env(safe-area-inset-bottom, 0px)) }` (was `mobile_premium__components.css` ~L1296) is **dead CSS** — removed in the `field-node` contract-flush fix.

**Rationale (evidence chain):**

- The rule's file comment justified it as "to clear the info-panel in focus-search idle state", but `ef3e1e56` (2026-06-17) **suppresses `#info-panel` inside field-node** ("Field-node: also suppress `#info-panel` so focus-stage-card sits flush at bottom") — the panel this lift was clearing no longer renders in field-node.
- Live geometry probe (390x844, trail-idle fixture): the visible `.focus-stage-card` was **flush at bottomInset 0px**; the `#focus-stage` wrapper carried a 96–108px bottom inset that only moved an **invisible container** (children position absolute vs root, per App.svelte comment) → the lift was dead weight matching zero user-visible nodes.
- The adjacent **non-field-node** idle rule (`:not([data-focus-panel-mode='field-node'])` "sits above the info-panel peek sheet") is **KEPT** — that surface genuinely still shows the peek sheet.

**Detection signal:** `qa:contract` surface `field-node` → `layout:focus-stage-bottom-flush` failed while `layout:focus-stage-card-bottom-flush` passed. The dead wrapper lift was a real finding; the wrapper's residual gap comes from the Svelte-scoped `.focus-stage.active` rule (`top: var(--app-header-height)` + legacy mobile `max-height: calc(100dvh - 96px)`) pinning the invisible container short of the viewport bottom while the visible card inside reaches it. Final fix (2026-08-04): (1) removed the dead 108px idle lift; (2) corrected `layout:focus-stage-bottom-flush` in `tests/surface-contract-check.mjs` to pass when EITHER the wrapper or the visible card is flush — asserting the user-facing surface, not an implementation detail; the strict `layout:focus-stage-card-bottom-flush` assertion unchanged. field-node: 21 pass / 0 fail after fix. The non-field-node idle/trail rules are untouched by design.
