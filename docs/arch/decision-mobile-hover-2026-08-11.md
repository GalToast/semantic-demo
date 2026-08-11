# Decision — Mobile hover surface (2026-08-11)

**Status: DECIDED (with a revisit condition).**

## The call
Hover affordances (pointerover-driven highlight/cursor) are **not a supported interaction on the mobile (<768px) surface**. The narrow-viewport branch of `getInitialRenderKind` ships `placeholder2d` by design (LCP: keeps the 587 KB three.js chunk off the cold path; docs/performance-budget.md). The 3 mobile hover spec cases were therefore **skipped with product rationale** (commit `053748f0`), and `openApp`'s 3D boot gate stays as-is.

## Rationale (evidence)
- `responsive-renderer.ts`: viewport ≤768 → placeholder BEFORE webdriver/param overrides (the `?webgl=1` param DOES force webgl for QA when a suite genuinely needs it — that path is not the default UX).
- Hover exists only on canvas (WebGL) surfaces. Placeholder2d has no canvas/raycast hover; asserting it there was a phantom contract.
- Desktop hover remains fully supported + test-covered (7/7 green incl. focus-invariance on the fresh build).

## Revisit condition
Re-open (b)/(c)/(e) + extend `openApp` with a `forceWebgl` mobile boot WHEN a mobile hover/raycast product surface ships. Until then: **no mobile-hover tests, no placeholder-hover registry.**

## Consequence log (test-side)
- tests/3d-hover-affordance.spec.js: 3 `test.skip` with doc-comments; family 7/7 green on remaining.
- docs/dev-commands.md: worktree `data.dat` copy rule + this flag.

## Process note
Flag approved via main-lane + board #65 close; revisit ticket = a product surface change, not a test fix.