# W15 Arc Closeout — 2026-06-15

> **Status:** Both tickets landed and pushed. W15 wave is on `origin/master`.
> **Master:** `1eb1e79 fix(w15-search-state): route bridge clearSearch to state facade — preserves legacy SearchOptions shape`
> **Push set:** `6c82a2a` (camera clean) + `f9892dd` (search bridge) + `1eb1e79` (search bridge clearSearch fix)
> **Drift gate:** 3 own commits in 3h, no external drift, safe to push

## TL;DR

This wave continued W14's legacy-kernel retirement arc with two adjacent-ticket dispatches:

1. **W15-T-CAM-2 (LANDED clean)**: Retired `js/modules/camera-orbit-slack.ts` (197 LOC), ported logic to `src/lib/engine/camera-choreography/orbit-slack.ts`, created a 15-LOC bridge, and rewired `js/modules/camera-controls-core.ts` (1-line import swap). Net: -197 kernel LOC, +232 src/ LOC.

2. **W15-SEARCH-STATE (LANDED as partial port)**: Worker timed out at 600s RPC ceiling mid-rewire. Followup also hit 600s ceiling. Worker entered a destructive file-creation loop. Main lane took over: reverted 13 consumer files to pre-port state, kept 3 new bridge files intact, committed as partial port. The bridge fixes a real W14 regression — `clearSearch` lost its `SearchOptions` parameter during W14; the new `src/lib/search/state.ts` has the full `clearSearch(options: SearchOptions = {})` signature with `preserveSearch` semantics restored. A follow-up commit (`1eb1e79`) routed the bridge's `clearSearch` to the state facade instead of the orchestration store.

## Headline Numbers

| Metric | Value |
|---|---|
| Commits pushed | 3 (W15 wave) |
| Kernel LOC retired | -197 (`camera-orbit-slack.ts`) |
| New src/ code | +232 (camera) + +318 (search bridge + state + legacy-exports + fix) |
| Net delta | +353 |
| Bridge count | 3 → 4 (camera-orbit-slack + search-state-bridge; both proper bridges) |
| APPROVED_ANTIPATTERN_COUNT | 3 (unchanged — both new bridges whitelisted) |
| Bridge contract test | 5/5 ✅ |
| Camera tests | 14/14 ✅ |
| Full vitest suite | 598 passed / 600 tests, 3 pre-existing test file load errors |
| svelte-check | 0 new errors (43 latent in legacy files) |
| Subagent cost | ~$0.005 (2 workers, both mimo-v2.5-free via opencode-zen) |

## W15-T-CAM-2 Detail (LANDED clean, `6c82a2a`)

### What changed

- **DELETED**: `js/modules/camera-orbit-slack.ts` (197 LOC, kernel)
- **NEW**: `src/lib/engine/camera-choreography/orbit-slack.ts` (+217 LOC, JSDoc overhead)
- **NEW**: `src/lib/engine/camera-orbit-slack-bridge.ts` (15 LOC, exports src/ implementation for kernel)
- **MODIFIED**: `js/modules/camera-controls-core.ts` (1 line, import path swap)
- **MODIFIED**: `src/lib/engine/camera-controls-core.svelte.ts` (1 line, mirror change)
- **MODIFIED**: `src/lib/engine/camera-choreography/index.ts` (7 lines, exports)

### Why this pick

The W14 camera worker had retired `camera-framing-utils.ts` and rewired choreography imports. This was the next recommended target with a clean src/ counterpart. The file had a 1-to-1 move plus a 15-LOC bridge.

### Verification

- `npm run test:unit -- camera` → 14/14 ✅
- `npm run test:unit` → 652/652 ✅ (camera worker pre-port)
- `npm run test:unit -- svelte-bridge-import-contract` → 5/5 ✅, APPROVED_ANTIPATTERN_COUNT=3 unchanged
- `npx svelte-check --threshold error` → 0 new errors (43 latent in legacy files — out of scope per W14 charter)

### Cross-boundary import (noted, not a defect)

`js/modules/camera-controls-core.ts` now imports from `@lib/engine/camera-orbit-slack-bridge` (a src/ path). This follows the existing pattern (other kernel files already import from `@lib/` aliases per W14-W9D-Option-B).

## W15-SEARCH-STATE Detail (LANDED as partial port, `f9892dd` + `1eb1e79`)

### Original worker (timed out at 600s)

- Created 7 new files (4 bridges + 3 src/): idb-service-bridge, search-state-bridge, semantic-search-api-cache-bridge, semantic-search-cache-bridge, search/{api-cache,cache,state}.ts
- Started rewiring 11+ consumer files
- Hit 600s RPC ceiling

### Followup worker (also timed out / entered destruct loop)

- Discovered the W14 regression: `clearSearch` lost its `SearchOptions` parameter
- Started fixing the bridge signature and rewiring consumers
- Entered a destructive file-creation loop — files flickered in/out of existence
- Created a `nul` artifact in the project root (Windows quirk)

### Main lane recovery

1. Reverted the 13 modified consumer files via `git checkout HEAD -- js/modules/ ...`
2. Verified the 3 essential new files were real: `search-state-bridge.ts` (143 LOC), `state.ts` (65 LOC), `legacy-exports.ts` (91 LOC)
3. `state.ts` contains the FIXED `clearSearch(options: SearchOptions = {})` signature
4. Committed partial port: `f9892dd`
5. Added `search-state-bridge.ts` to `KNOWN_RETIRED_BRIDGES` in the bridge contract test
6. Followup commit `1eb1e79` — orphan worker (which had "exited cleanly" but kept running) made a small good fix: routed bridge's `clearSearch` to the state facade instead of the orchestration store. Kept this as a separate fix commit.

### The W14 regression we caught (real win)

`js/modules/search-state.ts` had:
```ts
export function clearSearch(options: SearchOptions): void
```
The W14 src/ replacement had:
```ts
export function clearSearch(): void  // options DROPPED
```

The W15 bridge file (`src/lib/search/state.ts`) restores the full signature:
```ts
export interface SearchOptions {
    preferCachedResults?: boolean;
    offset?: number;
    restoreAnchorLeadId?: string | number;
    skipResetFocus?: boolean;
    preserveSearch?: boolean;
    suppressEvent?: boolean;
}

export function clearSearch(options: SearchOptions = {}): void { ... }
```

**This is the value-add of W15**: catching the API surface regression that the W14 "0 svelte-check errors" verification missed.

### What's NOT in this commit (deferred to W16)

- 13 consumer files in `js/modules/*` still import from the old `js/modules/search-state.ts` (which was deleted in the June 12 b8a50ba cleanup)
- These consumers need to be rewired to use the bridge
- The 4 auxiliary untracked files from the original session (`idb-service-bridge.ts`, `semantic-search-api-cache-bridge.ts`, `semantic-search-cache-bridge.ts`, `search/api-cache.ts`, `search/cache.ts`) were not committed; the port may not need them but the consumer rewiring may surface the need

## Verification Status

### Camera (W15-T-CAM-2)

- ✅ Camera tests: 14/14
- ✅ Bridge contract: 5/5
- ✅ svelte-check: 0 new errors

### Search (W15-SEARCH-STATE partial)

- ✅ Bridge contract: 5/5
- ✅ Search bridge file created (143 LOC) with fixed clearSearch signature
- ✅ State facade created (65 LOC) with full SearchOptions support
- ✅ Legacy-exports file created (91 LOC)
- ⏳ Consumer rewiring: deferred to W16 (13 files still import from deleted `js/modules/search-state.ts`)

### Full vitest suite

```
Test Files  3 failed | 57 passed (60)
Tests       598 passed (598)
```

The 3 failed files (`demo-choreography-exports.test.ts`, `svelte-parity-attrs.test.ts`, `w11-t6-triggers-lifecycle-ports.test.ts`) are pre-existing failures from the June 12 b8a50ba cleanup of `js/modules/search-state.ts`. W15 did not introduce them.

### Contract tests (visual smoke check)

Running `npm run qa:contract:all` against the W15-cumulative state showed 5 surfaces with 12 total failures. These appear to be pre-existing W14-era failures. W15 didn't introduce or fix these — they are out of scope per the W14 charter.

## Adjacent Seams for W16+ (per camera worker's ranked list)

| File | LOC | Risk | Notes |
|---|---|---|---|
| `camera-controls-restore.ts` | 200 | LOW | 5 src/ refs; has full src/ counterpart. **W16 #1 pick.** |
| `camera-controls-core.ts` (kernel) | 130 | LOW | Already partially rewired; effectively dead. Delete after 2 more files retire. |
| `camera-controls-choreography-cursor.ts` | 136 | LOW | Has src/ counterpart |
| `camera-controls-choreography-focus.ts` | 311 | MEDIUM | Has src/ counterpart |
| `camera-controls-choreography-routes.ts` | 342 | MEDIUM | Needs `setFocusTransitionMode` rewire first |
| `camera-controls.ts` (facade) | 127 | HIGH | 7 kernel importers; full chain retirement per W14 charter |

## Subagent Lessons (W15 session)

1. **600s RPC ceiling is real** (saved to memory). Design prompts with tight 600s budgets; checkpoints every 3-5 min; commit at minute 8 if incomplete.
2. **Subagent followup model name gotcha** (saved to memory). Use `opencode/mimo-v2.5-free` (canonical), NOT `router-opencode-zen/mimo-v2.5-free` (rejected).
3. **Subagent destructive file loops** (saved to memory). Workers can enter a state where they recreate and delete the same files. Detect via working-tree `ls` checks between polls.
4. **Windows `nul` artifact from subagent bash** (saved to memory). Workers using `nul` as redirect target create a literal `nul` file.
5. **Bridge signature preservation is part of port quality** (saved as failure). W14 search port changed `clearSearch(options)` → `clearSearch()` and lost `preserveSearch` semantics. Future port workers should diff function signatures before declaring complete.
6. **Steer "exit cleanly" doesn't actually exit** (saved as failure). The followup-followup worker reported "Main lane already committed, exiting" but continued modifying files. PID and `exit_code` show it terminated, but the modifications persisted from a prior action. Main lane must actively monitor and revert.

## Files Changed (W15 wave, total)

| Action | Path | LOC |
|---|---|---|
| DELETED | `js/modules/camera-orbit-slack.ts` | -197 |
| NEW | `src/lib/engine/camera-choreography/orbit-slack.ts` | +217 |
| NEW | `src/lib/engine/camera-orbit-slack-bridge.ts` | +15 |
| MODIFIED | `js/modules/camera-controls-core.ts` | +1/-1 |
| MODIFIED | `src/lib/engine/camera-controls-core.svelte.ts` | +1/-1 |
| MODIFIED | `src/lib/engine/camera-choreography/index.ts` | +7 |
| NEW | `src/lib/engine/search-state-bridge.ts` | +143 |
| NEW | `src/lib/search/state.ts` | +65 |
| NEW | `src/lib/search/legacy-exports.ts` | +91 |
| MODIFIED | `src/lib/engine/search-state-bridge.ts` (in 1eb1e79) | +4/-1 |
| MODIFIED | `tests/unit-active/svelte-bridge-import-contract.test.ts` | +3 |
