# Archived BOTH-pattern shims — 2026-06-13

## Why this archive exists

The BOTH pattern (`.js` shims under `js/modules/` re-exporting from Svelte/TS paths) is in the middle of being retired. As part of the 2026-06-13 consumer-surface investigation (`tmp/both-pattern-investigation-2026-06-13/`), 8 shims were confirmed to have **zero consumers** in the current codebase. They were deleted in a single commit, but preserved here for archaeological reference.

## Ast-grep verification

All 8 shims verified with `ast_grep_search` patterns `import $X from "@legacy/modules/<name>"` and `import("@legacy/modules/<name>")` — both returned zero matches across `src/` and `js/modules/`. The shims were redundant layers; the underlying functionality (where it exists) lives in the corresponding `js/modules/<name>.ts` files (which are kept) or the Svelte `src/lib/**` paths (which are kept).

## Inventory

| Shim file | Status | Real impl location | Original role |
|---|---|---|---|
| `camera-framing-utils.js` | Pass-through to Svelte | `src/lib/utils/camera-framing-utils.ts` (native TS exists) | Canvas unobstructed region, focus-pocket screen bounds, safe-area target offset |
| `camera-math-utils.js` | Pass-through to Svelte | `src/lib/utils/camera-math-utils.ts` (native TS exists) | Travel vector / orbit bias / camera arc control points |
| `connection-analysis.js` | Pure stub (`return null` / empty async) | `js/modules/connection-analysis.ts` (suspect also empty) | `analyzeConnection`, `showSemanticThreadsDetail` |
| `focus-panel-mode.js` | Pass-through to Svelte | `src/lib/utils/focus-panel-mode.ts` (native TS exists) | Focus panel mode utilities |
| `search-tokenizer.js` | Pass-through to Svelte | `src/lib/search/tokenizer.ts` (native TS exists) | Search query tokenization |
| `relationship-roles.js` | Redundant layer | `js/modules/relationship-roles.ts` (300+ line canonical impl) | Relationship role normalization; 10 callers in 5 files use the .ts directly |
| `semantic-dive-ui.js` | Empty body | `js/modules/semantic-dive-ui.ts` (300+ line real impl) | Semantic dive UI sync; 9 callers in 5 files use the .ts directly |
| `semantic-guide.js` | Empty bodies | `js/modules/semantic-guide.ts` (300+ line real impl) | Semantic guide lifecycle; 3 callers use the .ts directly |

## Follow-up tickets

- **Svelte-unification analysis** (pending): Should the Svelte path's `src/lib/utils/relationship-roles.ts`, `src/lib/journey/semantic-*.ts` etc. be unified with the legacy canonical implementations? The legacy `.ts` files have the canonical role normalization / dive UI / semantic guide logic; the Svelte path has its own versions. Unifying these is the next consolidation step.
- **search-engine single-track**: Required before the search-rerank feature (`docs/search-rerank-integration-design.md`) can be added. Search-engine is a two-source shim (Category 3 risk) per the 2026-06-13 audit.

## Source artifacts

- `tmp/both-pattern-investigation-2026-06-13/lane-1-rerun-mimo.md` — corrected hot-path counts (132 imports, 10 HOT)
- `tmp/both-pattern-investigation-2026-06-13/lane-4-deepseek.md` — comprehensive stub & dead-shim inventory
- `tmp/both-pattern-investigation-2026-06-13/SYNTHESIS-FINAL.md` — unified consumer-surface map
- `docs/semantic-demo-both-pattern-audit-2026-06-13.md` — original BOTH-pattern audit
- `docs/both-pattern-exit-criteria.md` — exit signal for the whole pattern
