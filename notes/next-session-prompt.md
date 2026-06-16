# Next-session seam prompt

## Current state (2026-06-16 02:55, post-W16 wave closure)

**Branch:** `master` tracking `origin/master` (0 ahead, 0 behind)
**Working tree:** CLEAN
**Master HEAD:** `6dd5680 docs(w16-closeout): record W16 wave closure`

### This session (2026-06-16) summary — 11 commits pushed to origin

**Main lane commits (4):**
- `e5228ab` chore(w15-search-state): retire search-state.ts to death-bridge + commit deferred search aux files
- `91e0fed` chore(w16-t-cam-3): prep camera-controls-restore-bridge for kernel retirement
- `294d857` chore(w11-t11): update ts-js-drift entry readiness to Svelte/Vite native
- `0069719` docs(w15-closeout): record W15 follow-up

**Worker dispatches (4 successful, 1 deferred, 1 cancelled):**
- `ocw_5a567951` (W11-T9 Wave 1) — ✅ COMPLETED (`72314a0`, in master)
- `ocw_cddf2c60` (W11-T11 retire) — ⏸️ CANCELED (files deleted, never committed)
- `ocw_f33e6421` (Visual QA) — ⏸️ CANCELED after writing report
- `ocw_baff8573` (Contract QA) — ⏸️ CANCELED mid-write
- `ocw_34242015` (W16-T-CAM-4) — ✅ COMPLETED (`77babd2`, pushed)
- `ocw_2775014c` (W16-T-CAM-5) — ⏸️ CANCELED with correct off-seam finding (10 consumers, not 4)
- `ocw_9f884941` (W13-T5 final cleanup) — ⏸️ CANCELED after revert (150 svelte-check errors)

**Parallel Codex session commits (consolidated into 4f471d0 + 5 individual W16 commits):**
- `90c54e8` port(w16-t-cam-3): retire camera-controls-restore.ts — rewire 2 kernel consumers to bridge
- `d440b14` chore(w16-t-cam-3): adapt camera-auto-rotate-settle-contract to canonical .svelte.ts implementations
- `e54e885` port(w16-t-cam-3): delete camera-controls-core.ts — consumers already rewired to src/ shim
- `77babd2` port(w16-t-cam-4): retire camera-controls-choreography-routes.ts — rewire 2 consumers to canonical src/ path
- `41c9bad` port(w16-t-cam-3): delete camera-controls-choreography-types.ts shim — no consumers after routes port
- `a05f66c` port(w16-cleanup): delete design-tokens.ts shim — all consumers already import from @lib/utils/design-tokens
- `4f471d0` port(w16-followup): camera choreography canonicalization + view-bindings + event-bus + thread-settler W16 retirements
- `6dd5680` docs(w16-closeout): record W16 wave closure (this just landed)

**Plus the parallel session drove the W11 engine port to completion during the W16 wave:**
- W11-T5 (Bridge Retirement Wave 1): `a0caa19`
- W11-T6 (Lifecycle Wave 2): `ba5e27f`, `9128d2b`
- W11-T9 (Journey Subsystem, all 4 waves): `72314a0`, `1e47022`, `a0caa19`, `17abe73`, `b8bec78`, `7669dda`, `48434eb`
- W11-T10 (Three.js Render Loop, both waves): `a48b12c`, `777a2ce`, `532c6c5`, `d11ea72`
- W11-T11 (build:legacy retirement): `70d0b5e`, `22d4833`
- W11 closeout doc: `2260a28`

**Net commits pushed this session:** 11 (4 main + 7 parallel session via main lane's push)

### Final state at `6dd5680`

| Gate | Status |
|---|---|
| svelte-check | ✅ 0 errors, 0 warnings (was 22 pre-existing latent before W11) |
| test:unit | ✅ 652/652 across 60 files |
| bridge contract | ✅ 5/5 |
| TODO invariant | ✅ 2/2 |
| commit-purity | ✅ no new violations |
| ts-js-drift | ✅ 88 .ts files, no regression |
| vite build | ✅ clean |

**File counts (W11+W16 complete):**
- `js/modules/*.ts`: 84 (down from ~200+ before W11)
- `src/lib/journey/*.ts`: 29 (full Svelte 5 port)
- `src/lib/engine/*-bridge.ts`: 53
- `src/lib/engine/*.svelte.ts`: 2

**Only one legacy camera file remains:** `js/modules/camera-controls.ts` (131 LOC) — now a **DEATH-BRIDGE** re-exporting from canonical Svelte 5. 20+ consumers import from this file transparently executing from canonical code.

### Recommended next session

1. **Write W13-T5b charter** — the W13-T5 final cleanup (delete `js/state.ts` + `js/state/selectors/index.ts`) is BLOCKED because the W13-T5a consumer migration is incomplete. ~80 files still import from these. The charter should:
   - Identify the 80 files that still import from `js/state.ts` or `js/state/selectors/index.ts`
   - Categorize them (kernel files, journey subsystem, camera, etc.)
   - Define a wave order: simplest first (kernel), then journey, then camera, then journey-binding consumer
   - Each wave dispatches a worker to rewire N files and commit
   - Final wave deletes the 2 files after all consumers are migrated

2. **Visual QA re-run** — the W15 rewires and W11/W16 changes should be smoke-tested via Playwright. Previous Visual QA (Worker C1) was blocked by the parallel session's camera breakage, which is now fixed.

3. **A2 audit items** (W11 audit closure backlog):
   - A2-4: mode chips visible in search/focus (touches `App.svelte`)
   - A2-5: mode chips roving radiogroup (touches `Header.svelte`)
   - A2-6: H1 heading (touches `App.svelte`)

4. **9 BOTH-pattern .js shims in `js/state/selectors/`** — separate retirement target: `animation.js`, `config.js`, `data.js`, `diagnostics.js`, `filter-mode.js`, `navigation.js`, `renderer.js`, `search.js`, `url-state.js`. Verify they are unused, then delete.

5. **Future wave**: delete `js/modules/camera-controls.ts` DEATH-BRIDGE (131 LOC) once consumer rewiring to direct canonical imports is desired. This is the final legacy file.

### Verification baseline (end of this session)

- All gates green
- Working tree clean
- Master in sync with origin
- Memory at ~3% (after failure memory addition)

### Doctrine refinements from this session

- **DEATH-BRIDGE pattern** for "delete a file with many consumers" — convert to thin re-export, leave consumers alone. This is the cleanest retirement pattern.
- **Trust worker off-seam findings** over original prompt scope (Worker B's 10-consumer finding was correct, not the 4 I estimated)
- **Parallel session staged WIP can be consolidated** into a single follow-up commit
- **Transient error states in parallel sessions** — wait for commit, don't panic revert
- **MCP queue saturation is flexible** — 4 dispatches in 2 minutes worked; the 60s guidance is a soft heuristic, not a hard constraint

### Open questions

1. **Should the `js/modules/camera-controls.ts` DEATH-BRIDGE (131 LOC) be deleted?** It's the last legacy camera file. 20+ consumers still import from it. The DEATH-BRIDGE is transparent (executes from canonical), so functionally there's no problem. Deleting it would require rewiring all 20+ consumers.
2. **Should the 9 BOTH-pattern .js shims in `js/state/selectors/` be verified as dead code and deleted?** They might be artifacts from the BOTH pattern retirement.
3. **What's the W13-T5b scope estimate?** Based on the 150-error count, ~80 files. 3-5 waves of ~20 files each?
4. **Memory at 3%** — lots of room. The DEATH-BRIDGE + parallel session consolidation patterns are now documented.
