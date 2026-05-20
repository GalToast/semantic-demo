# Semantic Demo Next Seams - 2026-05-20

Status: active audit note

## Current Follow-Up Workers

MiniMax workers launched from the 2026-05-20 follow-up pass:

- `semantic-gemma-fallback-followup-1779287625817`: owns Gemma/story fallback completeness and deterministic fallback tests.
- `semantic-a11y-focus-followup-1779287626643`: owns focus restoration and ARIA fixes for info panel, legend, and related controls.
- `semantic-reduced-motion-interrupt-followup-1779287627752`: owns reduced-motion interruption/recovery proof.

Do not edit their owned files until their diffs are reviewed, unless coordinating through switchboard.

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

### 4. Dirty Worktree Grouping

Evidence:

- The worktree contains broad modified tracked files plus many new tests/modules/docs.
- Several changes are accepted and verified, while worker follow-up patches are still in flight.

Risk:

- Review and commit quality will fall if unrelated seams remain mixed.

Best next move:

- After active workers finish, group diffs into review bundles: CSS/UI ownership, JS extraction/runtime, QA contracts, docs/cache/build artifacts. Run targeted checks per bundle before commit.

### 5. Behavioral Proof Gaps

Known gaps:

- Reduced-motion interruption/recovery path.
- Gemma/story fallback error source rendering.
- Overlay focus restoration and ARIA state synchronization.
- Focus-stage dedicated visual state that proves live state rather than brittle forced DOM.
- Short-landscape layout and transition-effect cleanup.

Best next move:

- Promote these to deterministic, narrow tests before large visual polish moves.

