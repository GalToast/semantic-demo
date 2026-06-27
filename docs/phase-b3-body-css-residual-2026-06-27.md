# Phase B3 Body-Attr CSS Residual Rules

_Generated 2026-06-27 after Phase B3d completion. Documents the 130 remaining body[...] CSS rules and the rationale for keeping them on body._

## Context

Phase B3 (body[X] → element-level migration) ran across 4 sub-phases:

- **B3a**: 90 body[X] .journey-compass rules migrated to element-level (1fe9c8d0)
- **B3d.1**: 709 body[data-panel-surface|active-view] rules → body.surface-X / body.view-X (8a869b82, dd08aa5a)
- **B3d.2**: 619 body.is-active[X] rules → class mirrors (ac561065)
- **B3d.3**: 175 body.is-active rules → body:not(.surface-idle) (d09d305b)

**Total migrated**: ~1,593 rules across 16 CSS files.

## State after Phase B3

| Metric | Before | After |
|---|---|---|
| body[...] selectors in css/ | ~1,700 | 130 |
| body.is-active selectors in css/ | 794 | 0 |
| is-active toggle in parity-attrs.svelte.ts | yes | **removed** |
| body.surface-X / body.view-X selectors | 0 | 678+ |

## 130 Remaining body[...] rules — categorized

After Phase B3, 130 body[...] CSS rules remain. Each category has a documented rationale and migration path.

### Category 1: Pseudo-element-only rules (3 rules, intentionally stay on body)

These rules target `body::before` / `body::after` / `#canvas-container::before` / `#canvas-container::after`. Pseudo-elements can ONLY be styled from their parent or ancestor selectors.

| File | Line | Rule |
|---|---|---|
| css/mobile_base.css | 565 | `body[data-semantic-dive='transitioning']::before` |
| css/shell.css | 92 | `body[data-semantic-dive='transitioning'] #canvas-container` |
| css/shell.css | 193, 197 | `body[data-mobile-route-peek='active'][data-route-motion='search-corridor'] #canvas-container::before/::after` |
| css/shell.css | 322, 333 | `body[data-trail-depth='2'] #canvas-container::before/::after` |

**Why stay on body**: Pseudo-element constraints.
**Migration path**: Move data-* to `#canvas-container` element (already wired in B3a) — but the body selector is currently the simplest. Can refactor to `#canvas-container[data-X]` in a future cleanup.

### Category 2: Bypass-written attrs (28 rules, deferred to Phase B3b)

These rules target attrs that are NOT in parity-attrs.svelte.ts BODY_CLASS_MAP. They're written directly by bypass code (no parity migration):

| Attr | Rules | Bypass writer | Phase |
|---|---|---|---|
| `data-mobile-route-peek='active'` | 26 | `results-ui.ts` (not yet migrated) | B3b |
| `data-trail-depth='2'` | 2 | `lifecycle.ts` / `window-actions.ts` (multi-writer, see body-attr-state-machine doc) | B3b |

**Why stay on body**: Migration requires parity-attrs to gain these attrs (currently bypass-only).
**Migration path**:

1. Add `data-mobile-route-peek` to BODY_CLASS_MAP (1 line)
2. Migrate bypass writer from `body.dataset` to `.semantic-explorer` or container
3. Codemod CSS to use class mirror

### Category 3: Domain-owner + multi-element-cluster (41 rules, deferred to Phase B3b/d)

These rules use bare `body[data-panel-surface]` (no value) + `:not([data-panel-surface^='map-'])` negation:

```css
body[data-panel-surface]:not([data-panel-surface^='map-']) .legend-toggle { ... }
```

**Why stay on body**: Domain-owner (targets multiple elements: legend, info-panel, search-input) without clear single-owner.
**Migration path**: Container ownership on `.semantic-explorer` (Strategy C from synthesis) — needs architecture decision.

### Category 4: Substring class match for map-* (46 rules, deferred to Phase B3d)

These rules use `body[class*='surface-map-']` (substring match across `surface-map-trail`, `surface-map-focus`, etc.):

```css
body[class*='surface-map-'] .info-panel { ... }
```

**Why stay on body**: Multi-element-cluster. Substring match is a workaround for "any map-* surface" without listing all values.
**Migration path**: Either:

- Use `:where()` selector list: `.semantic-explorer:where(.surface-map-trail, .surface-map-focus, ...) .info-panel` (verbose)
- Add a parent class like `.surface-map-any` toggled by parity-attrs

### Category 5: Cross-component compound rules (8 rules, deferred to Phase B3d)

Rules with compound body selectors + multiple non-idle surface values:

```css
body[data-mobile-route-peek='active'][data-panel-surface]:not([data-panel-surface^='map-']) .info-panel { ... }
```

**Why stay on body**: Combines mobile-route-peek AND panel-surface. Multi-element-cluster.
**Migration path**: Container ownership (depends on Category 3 architecture decision).

## Page-global rules — philosophy

The Phase B3 synthesis (tmp/phase-b3d-synthesis.md) classified rules into 4 buckets:

| Bucket | Count | Status |
|---|---|---|
| 🟢 SINGLE-OWNER | 33 | DONE (B3a) |
| 🟡 DOMAIN-OWNER | 30+ | DEFERRED (B3b) |
| 🔴 PAGE-GLOBAL | 13 | DONE (this commit + 3 pseudo-element rules remain) |
| 🟣 ELEMENT-CLUSTER | ~750 | DEFERRED (B3d, needs architecture decision) |

The "page-global" category covers rules where body ownership is intentional:

- Pseudo-element-only rules (can't move)
- Global app-state flags (e.g., `data-graphics-mode='fallback'` — already migrated)

## Migration priority for remaining 130 rules

| Priority | Category | Effort | Risk |
|---|---|---|---|
| HIGH | Category 2 (bypass-written) — adds parity support | Medium (2-4 hrs) | Low (codemod + 1-line parity) |
| MEDIUM | Category 5 + Category 3 (compound + domain-owner) | High (4-6 hrs) | Medium (architecture decision) |
| LOW | Category 4 (substring match) | High (rewrite all 46) | Medium |
| NEVER | Category 1 (pseudo-element) | N/A | N/A |

## What this commit changed

Commit `phaseB(css): eliminate is-active toggle + migrate body.is-active src/ CSS rules`:

- **Migrated 7 body.is-active CSS rules in src/**:
  - `src/components/Controls.svelte:130` — `:global(body.is-active[data-panel-surface='idle'])` → `:global(body.surface-idle)` (also fixed latent bug: original selector was logically contradictory since is-active ≡ panelSurface !== 'idle')
  - `src/components/JourneyChrome.css:126,129` — drop `body.is-active[`
  - `src/App.svelte:788-813` — drop `body.is-active.` from 4 :global() rules
- **Removed is-active toggle from parity-attrs.svelte.ts** (lines 504-506):
  - 11 lines deleted
  - Comment added explaining the removal + backward-compat note
- **Updated parity-attrs file header docstring** to remove is-active reference
- **Removed dead `body.classList.add('is-active')` would not be safe to remove**:
  - `src/App.svelte:194` and `src/lib/orchestration/app-orchestration.svelte.ts:97` — `__forceSemanticDiveContractSurface` test hooks. These are test infrastructure that directly sets is-active for contract testing. Kept as backward compat.

## Test compatibility note

Many tests directly add `is-active` to body via `document.body.classList.add('is-active')` as test fixtures. After this commit:

- **Tests that directly set `is-active`**: Continue to work (bypass parity-attrs, no dependency).
- **Tests that set `body.dataset.panelSurface` and rely on parity-attrs to add `is-active`**: NONE FOUND — all tests that read CSS effects use the new `surface-{value}` class selectors.

vitest: 2035/2035 PASSED after this commit.

## Related docs

- `tmp/phase-b3d-synthesis.md` — full Phase B3 plan
- `tmp/phase-b3d1-self-review.md`, `phase-b3d2-self-review.md`, `phase-b3d3-self-review.md` — per-phase review reports
- `docs/body-attr-state-machine-retirement-plan-2026-06-26.md` — parity-attrs contract
- `docs/semantic-demo-state-transition-table.md` — body dataset field semantics
