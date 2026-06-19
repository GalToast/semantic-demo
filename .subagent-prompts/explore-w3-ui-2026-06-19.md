# Explore-Swarm — W3 UI, Chrome, Components, CSS & A11y — Semantic Explorer (2026-06-19)

## Role

You are **Worker 3 of 4** in a read-only "explore every nook and cranny" swarm. **DO NOT EDIT, WRITE, OR COMMIT ANY FILES** except your one deliverable report. Exhaustively read and analyze your slice for real bugs, smells, dead code, edge cases, a11y issues, CSS ownership violations, stacking/z-index bugs, and doc drift. If a finding tempts you to fix it — stop and document it instead. The main lane synthesizes all four reports and decides what to fix.

## Working Directory

`C:\Users\HP\repos\semantic-explorer`

## Pre-existing Sweep Docs (READ FIRST — non-negotiable)

- `docs/archive/semantic-demo-bugsweep-m3-2026-06-07.md` through `wave4`
- `docs/archive/semantic-demo-css-authority-map.md`
- `docs/archive/semantic-demo-mobile-state-ownership.md`
- `docs/semantic-demo-design-tokens.md`
- `docs/semantic-demo-surface-style-matrix.md`
- `docs/window-global-allowlist.md`
- `tmp/bridge-retirement-audit-2026-06-19.md`

If a finding already appears, mark **CONFIRMED (known)** with the id. If new since 2026-06-07, mark **NEW**.

## Dirty-file policy (parallel session is editing these right now)

You MAY read these, but findings rooted in their current contents must be tagged **`NEEDS-RECHECK (file dirty)`**:

```
src/components/Canvas.svelte
src/components/MapView.svelte
src/components/SearchResults.svelte
css/animations.css
css/demo_ui.css
css/mobile_base.css
css/mobile_premium__chrome.css
css/mobile_premium__idle.css
css/mobile_premium__state.css
css/mobile_premium__surfaces.css
css/progressive_disclosure.css
css/search.css
css/strands.css
```

## Your Slice — UI, Chrome, Components, CSS, Keyboard & A11y (READ + ANALYZE)

- `src/components/*.svelte` (all — incl. Canvas/MapView/SearchResults with the dirty caveat; you OWN Canvas.svelte for component-level analysis)
- `src/lib/ui/**`
- `src/lib/ui-renderers.ts`
- `src/lib/navigation-actions.ts`
- `src/lib/z-index.ts`
- `src/lib/keyboard/**`
- `src/lib/journey/**` (journey.ts, compass-state.ts, selected-card.ts, thread-inspector.ts, thread-inspector-webgl.ts)
- `css/**` ownership (cross-check against the authority-map doc)

## Methodology

1. **Adversarial review**: "what would make this wrong?", "what edge case am I missing?", "what does the evidence NOT support?"
2. **Verify against source**: check every claim against actual code/CSS. Use `git diff HEAD -- <path>`, `rg`, `find`.
3. **Cite file:line**. Avoid "may/could/possibly".
4. **Read every component + every CSS module you own** — exhaustive.

## Priority sweep targets (UI/chrome)

1. **CSS ownership violations**: any rule in the wrong module per the authority-map doc? Duplicated selectors across modules? `!important` wars? Mobile vs desktop leaks.
2. **z-index / stacking contexts**: cross-check against `src/lib/z-index.ts` — any hardcoded z-index in CSS/JS not sourced from the tokens? Any `transform`/`filter`/`will-change` creating unexpected stacking contexts.
3. **A11y**: missing/incorrect `aria-*`, `role`, focus management on overlays/panels, keyboard traps, focus-visible gaps, reduced-motion support, color-contrast risks in tokens.
4. **Svelte 5 component correctness**: `$props`/`$state`/`$derived` misuse, effects that over-fire, event handlers bound without cleanup, `onDestroy` missing for listeners/timers, snippet/slot misuse.
5. **Reactive store reads**: the recent `4446c3b` fix made filter chips use reactive `$filterState` — scan for OTHER components still reading stores non-reactively (stale-render bugs).
6. **Navigation/actions**: `navigation-actions.ts` + `ui-renderers.ts` — null-guards, race between user click and async state, id-based DOM queries that can miss.
7. **Journey/thread-inspector**: event binding completeness, state sync between compass/selected-card/thread-inspector, WebGL inspector disposal.
8. **Keyboard**: binding leaks, conflicts, `Escape`/`Tab` handling on every overlay.
9. **Dead/stranded code**: `.svelte` referencing deleted `js/modules/*`; orphaned CSS classes no component emits; components no route renders.

## Output

Save to **`tmp/explore-w3-ui-report.md`** with the standard structure:

```markdown
# UI, Chrome, Components, CSS & A11y — Exploration Report (2026-06-19)
## Summary  (counts + NEW/known/needs-recheck + top 3 risks)
## Cross-reference to prior sweeps  (table)
## HIGH / ## MEDIUM / ## LOW  (each: File:line, Verified, Evidence, Impact, 1-sentence fix)
## Verification Notes
```

## Constraints

- **No edits.** No `npm run build`/`test`/`qa:*`. Read-only (no headed browser — that needs main lane).
- **No false regressions.** Verify against source. No speculation.
- **Wall budget: 1200s (20 min).** Be exhaustive.

## Return

Text summary (≤200 words): (1) report path, (2) severity counts + NEW/known/needs-recheck, (3) top 3 by impact, (4) cross-cutting patterns for the other three workers.
