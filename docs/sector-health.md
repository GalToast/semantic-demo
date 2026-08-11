# Sector Health Map — Semantic Explorer

_measured 2026-08-11, main lane_

Ranks the 9 repo sectors by source size and pain attribution, then points the
dartboard at the 2-3 highest-leverage seams for the next wave. **NOT a work
plan** — ownership verification gates every "zero-risk" refactor.

## 1. Ranking

| # | Sector | LOC | Top-3 files (LOC) | Pain attribution |
|---|--------|-----|-------------------|------------------|
| 1 | engine | 13,270 | semantic-threads.ts 817 · engine/lifecycle.ts 696 · thread-manager.ts 674 | ~10 contract re-points last wave; 3d/env battery fails here |
| 2 | journey | 11,980 | focus-ui.ts 742 · focus-pocket.ts 695 · semantic-overlay.ts 670 | focus-ui/focus-pocket pair unstable; overlay material drift (semantic-overlay) |
| 3 | orchestration | 7,626 | url-restore.ts 869 · parity-attrs.svelte.ts 821 · map-state.ts 768 | parity `hasFocus` bug; url-restore ↔ parity both returned `DO-NOT-SPLIT` (kiro, `tmp/engine-hover-FORENSICS-REPORT.md`) |
| 4 | stores | 6,663 | data-store.ts 723 · (no other >600) | S-1/S-2 churn mid-split — split blocked until S-1/S-2 settle |
| 5 | search | 3,770 | search-core.ts 644 | mild; contract stable |
| 6 | state | 2,669 | app.svelte.ts 762 | low; AGENTS.md source-of-truth stays single |
| 7 | ui | 1,910 | (no file >400) | low |
| 8 | keyboard | 700 | (no file >400) | low |
| 9 | components | 250 | (no file >400) | low |

## 2. Where the dartboard points

Three sectors hold 67% of the LOC: **engine (13.3K) + journey (12.0K) + orchestration (7.6K) = 32.9K of the ~48.8K total**. The other six combined are 16K — smaller than the top two alone — and carry no acute pain signal.

**Kiro-nominated "zero-risk" refactors — flag `verify-ownership-first` before commit:**

- Additive-mesh boilerplate kill in `engine/three-interaction-visuals.ts` (662) — repetitive mesh-add helpers suspected extractable
- Corridor-uniform collapse in `engine/three-search-animations.ts` (673) — repeated uniform writes for the search corridor

Both came out of the kiro forensics pass as low-risk, additive-only changes. **Neither is a plan to do now.** Before either lands: confirm the file actually owns that code (no recent hot-fix overlap), confirm no test or contract references the inline shape, and re-run the 3d/env battery.

**Orchestration is the cheapest leverage, not the biggest:** `url-restore.ts` (869) and `parity-attrs.svelte.ts` (821) are both >800 LOC and both returned `DO-NOT-SPLIT` from the kiro pass (splitting them made things worse). The real bug — parity `hasFocus` — sits across both, so the fix is a **contract change at the seam**, not a split.

## 3. Contract fidelity

`engine` and `journey` are the two sectors where public-surface churn directly breaks consumers — the ~10 contract re-points are the proof. Mitigation already in flight: **three-engine-api harden** — api-contract stability tests for the engine seam. Extend the same pattern to `journey` (the `focus-ui` + `focus-pocket` boundary is the obvious shared-shape seam) before the next refactor wave, or the next 10 re-points arrive the same way.
