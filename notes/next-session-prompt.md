# Next-session seam prompt

## Current state (2026-06-16, post-W15 cleanup + W16-T-CAM-3 prep + W11-T11 entry readiness)

**Branch:** `master` tracking `origin/master` (0 ahead, 0 behind)
**Working tree:** CLEAN
**Master HEAD:** `294d857`

### This session (2026-06-16) scorecard

| Commit | Title | Net LOC |
|---|---|---|
| `e5228ab` | chore(w15-search-state): retire search-state.ts to death-bridge + commit deferred search aux files | +483/-458 (10 files) |
| `91e0fed` | chore(w16-t-cam-3): prep camera-controls-restore-bridge for kernel retirement | +21 (1 file) |
| `294d857` | chore(w11-t11): update ts-js-drift entry readiness to Svelte/Vite native | +29/-20 (1 file) |

**Net session delta: +533/-478 across 12 files in 3 commits.**

### What landed in this session

1. **W15 search state cleanup (e5228ab)** — closed the partial port deferred in the W15 closeout:
   - `js/modules/search-state.ts` 502→52 LOC DEATH-BRIDGE (single re-export from `@lib/engine/search-state-bridge`)
   - `src/lib/search/state.ts` re-export fix: `setActiveSearchResultRow` now from `./result-renderer` (canonical home), not `./orchestration`
   - 5 new files: `src/lib/search/{api-cache,cache}.ts` (canonical implementations), `src/lib/engine/{idb-service,semantic-search-api-cache,semantic-search-cache}-bridge.ts` (legacy bridges)
   - 2 lines added to `src/lib/engine/semantic-search-mock-catalog-bridge.ts` for `buildMockCatalogForQuery` and `EXPLICIT_EMPTY_QUERY_PATTERN` (was a real bug — new api-cache.ts imported them but bridge didn't export them)
   - Test whitelist: `semantic-search-cache-bridge` + `camera-controls-restore-bridge` (W16 prep)

2. **W16-T-CAM-3 prep (91e0fed)** — bridge file for the W16 #1 pick:
   - `src/lib/engine/camera-controls-restore-bridge.ts` (21 LOC) re-exports from `camera-controls-restore.svelte.ts`
   - Whitelist entry already in test file (committed in e5228ab)

3. **W11-T11 entry readiness punctuation (294d857)** — verifies the active Svelte/Vite native entry:
   - `indexUsesMainTs && viteUsesSrcRoot && mainTsExists` is the active readiness signal
   - `app.js retired: YES` retained as contextual fallback detail
   - Drift direction inverted: now checks for orphaned .js files (legacy shims), not orphaned .ts (BOTH pattern retired)

### Verification baseline (end of this session)

- test:unit: 652/652 across 60 files (verified post-commit)
- svelte-check: 22 errors, ALL pre-existing latent in legacy files (out of scope per W14 charter)
- svelte-bridge-import-contract: 5/5
- todo-without-ticket-invariant: 2/2
- commit-purity-invariant: no new violations (soft warning for test file vs w15-search-state scope — chore prefix doesn't trigger the check)
- ts-js-drift-contract: 90 .ts files inspected, no regression
- Memory: 99% (audit on disk, blocked on tool quirk)

### W16 #1 pick — ready to execute

The W15 closeout's adjacent-seam ranking identified the next camera retirements:

| File | LOC | Risk | Notes | Status |
|---|---|---|---|---|
| `camera-controls-restore.ts` | 200 | LOW | 5 src/ refs; bridge already prepped (91e0fed) | **READY: W16-T-CAM-3 actual retirement** |
| `camera-controls-core.ts` (kernel) | 130 | LOW | Already partially rewired; effectively dead | Next after restore |
| `camera-controls-choreography-cursor.ts` | 136 | LOW | Has src/ counterpart | Next after core |
| `camera-controls-choreography-focus.ts` | 311 | MEDIUM | Has src/ counterpart | After cursor |
| `camera-controls-choreography-routes.ts` | 342 | MEDIUM | Needs `setFocusTransitionMode` rewire first | Last choreography |
| `camera-controls.ts` (facade) | 127 | HIGH | 7 kernel importers; full chain retirement per W14 charter | Final punctuation |

**Recommended next action**: Dispatch W16-T-CAM-3 (camera-controls-restore retirement) as a worker. The 91e0fed bridge is in place. Worker should rewire 5+ kernel consumers in `js/modules/*` to import from `@lib/engine/camera-controls-restore-bridge` and delete `js/modules/camera-controls-restore.ts`.

### Recommended session (T0: verify state)

1. **Verify the 3 commits are on origin/master** — `git log --oneline origin/master..HEAD` should be empty.
2. **Dispatch W16-T-CAM-3 worker** — 200 LOC, LOW risk, well-scoped. Use mimo-v2.5 (opencode-go) per W15 pattern. ~$0.005, 5-10 min runtime.
3. **Update AGENTS.md if needed** — the W15 closeout's "W16 #1 pick" language should propagate.
4. **Memory consolidation** — still at 99%, follow-up needed.

### W11 engine port remaining tickets (W11-T9, T10, T11)

- **W11-T9** journey subsystem port (~1,777 LOC untouched, 8 files) — Wave 1 prep in `tmp/w11-t9-prep/`
- **W11-T10** Three.js render loop — depends on T9
- **W11-T11** build:legacy retirement — punctuation: `app.ts` + `scripts/build-app.mjs` + `dist/bundle.js` + `package.json:build:legacy` (T11 entry readiness check is now done in 294d857; the remaining T11 work is deleting the legacy build artifacts and the `build:legacy` script)

### Open questions

1. **Should the 5+ W15 rewired consumer files be tested for visual regressions?** The 9d79494 etc commits rewired them mechanically. A spot-check via Playwright would be wise.
2. **Should the legacy `js/modules/idb-service` be ported in W16?** It's the only legacy module still imported by the new src/lib/search/cache.ts. Port would be a small but isolated ticket.
3. **What is the next non-camera retirement?** The W14 charter ranked the full file list. Camera is the most natural next arc; after camera, the largest remaining retirements are search/journey/filter legacy modules.
4. **W13-T5 (delete legacy + unify types)** was the final cleanup in the W13 charter. With W15 closing search and W11-T9 closing journey, T5 is nearly within reach.

### Doctrine refinements from this session

- **DEATH-BRIDGE pattern works** — 502→52 LOC single re-export is a clean retirement signal. TODO marker within the bridge docstring + Wave reference satisfies the TODO invariant.
- **Auxiliary file bundles are common** — the W15 partial port left 6 untracked files. The pattern is: code in src/ + bridge in src/lib/engine/ + re-export from canonical impl.
- **"Re-export from wrong submodule" is a real bug class** — `setActiveSearchResultRow` was in `./orchestration` but the canonical home was `./result-renderer`. Always verify the re-export target.
- **Whitelist rationale matters** — the bridge contract test counts UNEXPECTED dead bridges. Adding a new bridge requires either a consumer (use the bridge) OR a whitelist entry (defer with rationale comment). The W15 pattern is: "W15-T-SEARCH-STATE auxiliary — bridge to semantic-search-...; no consumer yet".
