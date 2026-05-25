# Semantic Demo Next Seams - 2026-05-20

Status: active next-seams note — historical worker locks closed 2026-05-25

## Wave56 (2026-05-23) — Small Dewindowing Cleanup

- `event-bindings.js:64–65`: Fixed unguarded `window.traverseNeighbor(-1/1)` calls
  in `bindFocusControls()` (btn-focus-prev/next). Added `typeof` guard to match the
  pattern already used at lines 632–633. Verification: `node --check` + both contracts pass.
- `setSemanticDiveMode` duplicate export in `journey.js:1089` — passthrough wrapper; lifecycle.js
  is canonical owner per `state-ownership-contract.mjs` CONTRACT 4. HD-3 fully resolved:
  two contracts (`semantic-dive-active-owner-contract.mjs`, `state-ownership-contract.mjs`
  CONTRACT 4) already prove lifecycle is sole canonical owner and journey is a delegating
  alias only. No new contract needed — see `tmp/wave56-duplicate-semantic-dive-owner-audit.md`.
- `__semanticFocusCueProbe` unguarded call at `journey.js:2433` — intentional fail-fast dev probe;
  correct fix (sequencing in journey-webgl.js) is larger refactor, deferred.

See `tmp/wave56-dewindowing-small-cleanups.md` for full report.

## Historical Follow-Up Workers

MiniMax workers launched from the 2026-05-20 follow-up pass:

- `semantic-gemma-fallback-followup-1779287625817`: owns Gemma/story fallback completeness and deterministic fallback tests.
- `semantic-a11y-focus-followup-1779287626643`: owns focus restoration and ARIA fixes for info panel, legend, and related controls.
- `semantic-reduced-motion-interrupt-followup-1779287627752`: owns reduced-motion interruption/recovery proof.

Status as of 2026-05-25: these worker lanes are historical context, not active blockers. Re-audit the listed scopes before editing if they become current work again.

## Wave52 Follow-Up (2026-05-22)

Wave50/Wave51 verified coverage update — new specs and findings from the current lane.

### New Verified Specs (Wave52)

| Spec | File | Score |
|------|------|-------|
| Rapid re-selection (A→B, A→B→A, canvas click race) | `3d-rapid-re-selection-contract.spec.js` | **6/6** |
| HiDPI click accuracy (DPR=2, desktop/mobile/short-landscape) | `3d-hidpi-click-accuracy.spec.js` | **6/6** |
| Ghost graph visibility (opacity, size, projection, spore layering) | `3d-focus-ghost-graph-visibility.spec.js` | **7/7** |
| Short-landscape thread quality | `3d-thread-orchestration-quality.spec.js` | **1/1** |
| Escape-from-dive (state transition, DOM dataset reset) | `3d-state-transition-integrity.spec.js` | **2/2** |

### Runner Isolation Finding
Runner isolation finding: `3d-focus-neighborhood` runner is sequential and confirmed not causal for remaining failures. Still failing: `3d-overlay-hit-stealing.spec.js`, `3d-hover-affordance.spec.js` — timeout/state-convergence issues, not runner artifacts.

### Manifest Groups
Targeted groups added: `3d-focus-ghost-graph-visibility`, `3d-hidpi-click-accuracy`, `3d-rapid-re-selection`.

### Docs Updated
- `semantic-demo-qa-scripts.md` — manifest group table updated with new Wave52 groups, quality/lifecycle counts corrected.
- `semantic-demo-state-transition-truth-table.md` — HD-5, HD-6 added; verified results table added.

## Larger Seams Found

### 1. Focus-Stage CSS Ownership

Evidence:

- `rg -n "focus-stage" css | Measure-Object` returns 684 matches.
- Highest-count files:
  - `css/progressive_disclosure.css`: 176
  - `css/journey_active.css`: 111
  - `css/strands.css`: 103
  - `css/journey_steps.css`: 93
  - `css/mobile_premium_focus.css`: 55
  - `css/clusters.css`: 54
  - `css/mobile_premium_surfaces.css`: 52

Risk:

- Focus-stage layout, visibility, motion, and mobile composition are still distributed across many cascade layers. The current tests catch major breakage, but ownership is hard to reason about.

Best next move:

- Create a focus-stage owner matrix by state (`focus`, `focus-search`, `semantic-dive`, `map-*`, `field-node`) and migrate one selector family at a time with computed-style proof.

### 2. Window Bridge De-Windowing

Evidence:

- `docs/lifecycle-window-bridge-map.md` documents lifecycle and journey coordination through many `window.*` guards.
- Current large files remain:
  - `js/modules/journey.js`: ~150 KB
  - `js/modules/lifecycle.js`: ~126 KB
  - `js/modules/search-state.js`: ~64 KB
  - `js/modules/focus-pocket.js`: ~47 KB

Risk:

- Behavior is mostly guarded, but ownership is implicit. It is easy to add another bridge or no-op guard without a contract.

Best next move:

- Extract one bridge seam at a time into named imports or a small bridge registry. Start with the already documented low-risk cluster/filter seam or with `ui-renderers.js` selected-card bridge completion.

### 3. Contract Runner And QA Script Sprawl

Evidence:

- `package.json` now has many targeted `qa:*` scripts.
- `test:contract` is a long serial shell chain of individual `.mjs` files.

Risk:

- Failure output is hard to classify by owner, adding new contracts is manual, and parallelization is awkward.

Best next move:

- Replace the long `test:contract` shell chain with a small manifest-driven Node runner that reports contract file, owner, duration, and failure. Keep existing script names as aliases.

### 4. Worktree Grouping

Evidence:

- This note was created when the worktree contained broad modified tracked files plus many new tests/modules/docs.
- As of 2026-05-25, the active review-bundle blocker is closed; use this section as historical context for future mixed-worktree reviews.

Risk:

- Review and commit quality will fall if unrelated seams remain mixed.

Best next move:

- For future mixed waves, group diffs into review bundles: CSS/UI ownership, JS extraction/runtime, QA contracts, docs/cache/build artifacts. Run targeted checks per bundle before commit.

### 5. Behavioral Proof Gaps

Known gaps:

- Reduced-motion interruption/recovery path.
- Gemma/story fallback error source rendering.
- Overlay focus restoration and ARIA state synchronization.
- Focus-stage dedicated visual state that proves live state rather than brittle forced DOM.
- Short-landscape layout and transition-effect cleanup.

Best next move:

- Promote these to deterministic, narrow tests before large visual polish moves.
