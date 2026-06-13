# Parity Gap Audit — Bigger Picture

**Trigger:** Bug 2 (welcome card persists) → traced to `body.is-active` class never being set by the Svelte parity layer → opened a wider question.
**Date:** 2026-06-13

## Headline finding

`src/lib/orchestration/parity-attrs.svelte.ts` describes itself as the "Single source of truth for body data-* attributes the legacy production shell requires." It isn't. It's a **partial mirror** that:

1. Manages ~42 body `data-*` attrs (out of ~46 the legacy code sets)
2. Manages **zero** body **classes** that the legacy code sets
3. Is bypassed by ~70+ "wild writes" in components/stores that update the same attrs directly

The BOTH-pattern port from JS → TS dropped the class-management line of the parity contract. Multiple CSS rules in the mobile premium cascade that gate on `body.is-active` are silently dormant. Bug 2 (welcome card persists) is the most visible symptom; there are likely others.

## The data-attr gap (concrete)

| Body attr | Legacy code (writes) | Svelte parity-attrs (manages) | Svelte wild writes (elsewhere) | Notes |
|---|---|---|---|---|
| `panelSurface` | ✓ `composition-state.ts` | ✓ | (n/a) | Working |
| `panelSurfaceDetail` | ✓ `composition-state.ts` | ✗ | none found | **MISSING** — CSS reads it |
| `data-search-glow`, `data-scene-reveal`, `data-mobile-route-peek` | various | ✗ | ✓ Svelte wild writes | Working in practice |
| `cameraAssistReason`, `focusTransitionPhase`, `strandJourney{From,To,Reason}`, `terrainHandoffFrom,To`, `terrainRouteCount` | ✓ | ✗ | ✓ Svelte wild writes | Working in practice |

→ **24 legacy body data-attrs are not in `PARITY_ATTRIBUTES`**. ~6 of them are silently dropped (`panelSurfaceDetail` being the most impactful); the rest are written by Svelte code via "wild writes" that the parity layer doesn't know about.

## The class gap (concrete)

| Body class | Legacy code (sets) | Svelte code (sets) | CSS rules using it | Status |
|---|---|---|---|---|
| `is-active` | ✓ `composition-state.ts:106,180` | ✗ (only in test-only `__forceSemanticDiveContractSurface`) | **MANY** in `mobile_premium__*.css` | **MISSING — root cause of Bug 2** |
| `is-mobile` | ✓ `scene-reveal.ts:61` | ✓ same Svelte-port file | yes, but duplicates `data-mobile` | Working |
| `view-transitioning` | ✓ `view-controller.ts:182,191` | ✓ same Svelte-port file | `progressive_disclosure.css` | Working |

→ The `is-active` class is the one Svelte track missed. It's gated by `Boolean(surface)` in the legacy code — i.e., "user is on a non-idle surface."

## The "wild writes" pattern (concrete)

The Svelte track has **114 unique body `data-*` keys** written by various components/stores. Many of these overlap with what the parity layer manages. The parity layer's short-circuit (JSON.stringify comparison) prevents some thrashing, but two parallel write paths for the same data is a code smell.

Examples of wild writes that touch attrs the parity layer also manages:
- `src/lib/orchestration/view-controller.ts` writes `loadingPhase` (parity also writes it)
- Various components write `semanticDive` (parity also writes it)

## Test coverage gap (concrete)

- `tests/unit/svelte-parity-attrs.test.js` — comprehensive for `data-*` attrs, **zero tests for class management**
- `tests/composition-state-invariant-contract.mjs` — tests legacy `composePanelSurface` via fakes; **doesn't test parity layer coverage of same attrs**
- No test verifies that the Svelte parity layer's `PARITY_ATTRIBUTES` set is a superset of the legacy code's written attrs
- No test verifies that the Svelte parity layer manages body classes

## Why the Svelte parity port missed this

The parity layer's docstring restricts its scope to "data-* attributes." When the Svelte track ported the body-attr management from `composition-state.ts`, the author faithfully ported the dataset writes but stopped there. The class toggle on the same line — `root.classList.toggle('is-active', Boolean(surface))` — was treated as out of scope and dropped.

The legacy `composition-state.ts:106` does TWO things in one function:
```ts
root.dataset.panelSurface = surface;
root.classList.toggle('is-active', Boolean(surface));
root.dataset.panelSurfaceDetail = getPanelSurfaceDetailFromMobileSheet(...);
```

The parity layer ported #1, missed #2 and #3. The legacy code is still loaded via `@legacy/state.js` but the `composePanelSurface()` function isn't called from the Svelte track, so the class is never toggled.

## Strategic options

### A. 4-line surgical fix (already proposed)
Add `is-active` toggle to `applyParityAttributes`. Fixes Bug 2's most visible symptom.

**Pros:** Minimal change, high visibility, low risk
**Cons:** Leaves `panelSurfaceDetail` and the wild-writes fragmentation unfixed; doesn't add class-management tests; doesn't address the architectural drift

### B. Surgical fix + close adjacent gaps (recommended)
- Add `is-active` to `applyParityAttributes` (Bug 2)
- Add `panelSurfaceDetail` to `PARITY_ATTRIBUTES` + `computeParityAttributes` (CSS rules use it)
- Add a class-management test to `svelte-parity-attrs.test.js`
- Add a coverage assertion: "PARITY_ATTRIBUTES is a superset of {panelSurfaceDetail, is-active}"

**Pros:** Closes the most-impactful class of parity gaps; tests prevent regression; still minimal change
**Cons:** Doesn't address the wild-writes fragmentation; doesn't address the BOTH-pattern architecture question

### C. Full parity completion (architectural fix)
- Add all 24 missing legacy attrs to `PARITY_ATTRIBUTES`
- Move wild writes from components/stores to parity layer (or have them update stores that parity reads)
- Add class management to parity-attrs as a first-class concept
- Add comprehensive tests including class management and coverage assertions
- Document the parity contract in a way that future devs understand what's owned where

**Pros:** Truly makes the parity layer a single source of truth; eliminates the dual-write paths; clear test coverage
**Cons:** Big refactor; touches many files; risk of regression; needs careful sequencing

### D. Investigate BOTH pattern maturity first
Before patching, understand:
- Which legacy functions are still called from Svelte and which are dead?
- How much of the legacy code is still in the production hot path?
- Is the parity layer a long-term bridge or a temporary one?
- What does the migration roadmap look like?

**Pros:** Makes the right architectural decision; avoids re-patching if the parity layer is being deprecated soon
**Cons:** Time investment; might not lead to immediate fixes

## Recommended phasing

If the user wants to ship fixes (not just investigate), I'd recommend:

1. **Phase 1 (immediate, ~30 min)**: Option B — surgical fix + adjacent gaps + tests. Resolves the most visible Bug 2 symptoms. Safe.
2. **Phase 2 (next session)**: Option D — investigate the BOTH pattern maturity. Informs whether Option C is worth doing.
3. **Phase 3 (only if Phase 2 says parity-layer-stays)**: Option C — full parity completion.

If the user wants to slow down further:

- Option D first, then re-decide based on BOTH-pattern findings.
- Or option D in parallel with B (B can ship independently and doesn't depend on D).

## What I will NOT do

- Apply any code changes yet (this is investigation, per "let's look at the bigger picture before we go patching")
- Modify CSS rules
- Touch the legacy `composition-state.ts` (it's the source of truth, the parity layer needs to mirror it better)
- Remove wild writes (that's a Phase 3 decision)
