# Next-session seam prompt

## Current state (2026-06-16 11:50 UTC, post-W14-T2 closeout)

**Branch:** `master` tracking `origin/master`
**Master HEAD:** `76c1748 docs(w14-t2): closeout + legend-ui W15 candidate finding` (pushed, 0 ahead)
**Working tree:** ~33 uncommitted modifications (parallel session W14-DEATH-BRIDGE mid-flight on `camera-controls` consumers + dist/ regenerated artifacts)

### This session (2026-06-16, 09:30–11:50 UTC) summary

**Arc closures landed:**

- **W11 + W13 + W16 engine port arc sealed** (Visual QA Round 3, `f75a26a` + `a94c0fe`) — engine functional, initSemanticLens null-ref GONE, 3D canvas renders.
- **A2-7 keyboard fix** (`f75a26a`) — `?` keybinding wired to keyboard help overlay + `e.preventDefault()` on Escape handler (was overwriting to about:blank).
- **Visual QA Round 3 REPORT** (`a94c0fe`, `docs/w15-visual-qa/round3-2026-06-16.md`) — durable in `docs/`.
- **W14 Tier 2 teardown** (`7a0a25e`, `127523e`, `adbc6fe`, `705e9b7`, `76c1748`) — 4 of 6 in-scope kernel files retired.

**W14 Tier 2 final tally:**

| File                              | LOC | Status                             | Commit    |
| --------------------------------- | --- | ---------------------------------- | --------- |
| `js/modules/config.ts`            | 107 | ✅ Retired                         | `7a0a25e` |
| `js/modules/environment.ts`       | 144 | ✅ Retired                         | `127523e` |
| `js/modules/focus-panel-mode.ts`  | 31  | ✅ Retired                         | `adbc6fe` |
| `js/modules/cluster-labels.ts`    | 275 | ✅ Retired                         | `705e9b7` |
| `js/modules/strand-continuity.ts` | 96  | ⚠️ Skipped (API mismatch finding)  | —         |
| `js/modules/legend-ui.ts`         | 308 | 📋 W15 candidate (port-completion) | —         |

Total retired: 557 LOC. 2 findings documented.

**Workers this session:**

- `ocw_6650e9bf` + `ocw_fc1f194d` (Visual QA Round 3) — $0.007
- `ocw_57eaeffe` (W14-T2 Wave 1: config + environment + focus-panel-mode + strand-continuity finding) — $0.0005
- `ocw_fd51de49` (W14-T2 Wave 2: cluster-labels + legend-ui finding) — $0.0005
- `ocw_0c514d28` (A2-5, cancelled) — $0.0003
- `ocw_98b9cef7` (A2-6, cancelled) — $0.0003
- `ocw_db5feb88` (init-semantic-lens fix, no-op) — $0.003
- **Combined**: ~$0.015

**Memory at 14%** (45 entries, 70,764 / 500,000 chars).

### Open W14 findings

#### 1. strand-continuity API mismatch (skipped, needs main-lane decision)

**Kernel** (`js/modules/strand-continuity.ts`): standalone functions — `setStrandContinuityState`, `clearStrandContinuityState`, `setTimer`, `clearTimer`, `disposeTimers`, `getStrandArrivalNote`.

**Canonical** (`src/lib/utils/strand-continuity.ts`): class-based API — `StrandContinuityManager`, `getStrandContinuityManager`, `resetStrandContinuityManager`.

**Bridge**: re-exports kernel's standalone functions to 4 journey-layer consumers.

**Two paths forward**:

- **(a)** Add standalone function wrappers to canonical that delegate to the singleton manager. ~1-2 hour worker, ~$0.003.
- **(b)** Port the 4 journey consumers to use the class API. ~1-2 hour worker, ~$0.003.
- **(c)** File as W16 candidate if other priorities take precedence.

#### 2. legend-ui port-completion (W15 candidate, scoped)

**Kernel** (`js/modules/legend-ui.ts`): 308 LOC, 11 exports.
**Canonical** (`src/lib/journey/legend-ui.ts`): 20 LOC, 1 export (`initLegendEventBusSubscriptions`).
**Gap**: 10 missing exports + 10 live code importers (7 .ts + 3 .svelte).

**Two approaches**:

- **(1)** Port-completion: extend canonical from 20 → ~308 LOC. ~2-3 hours, ~$0.005.
- **(2)** Rewire to `Legend.svelte`: update all 10 live importers. ~1-2 hours, ~$0.003.

Full finding: `docs/w14-tier2/legend-ui-port-completion-2026-06-16.md`.

### Parallel session in flight (do not fight)

The parallel Codex session is mid-refactor on `src/lib/engine/camera-controls.ts`, splitting it into:

- `camera-choreography`
- `camera-controls-restore-bridge`
- `camera-controls-core`

This leaves `src/lib/engine/index.ts` with **23 svelte-check errors** (export block at lines 67-92 lists names that no longer exist in camera-controls). This is **not W14-T2 scope** — will resolve when parallel session lands the camera-controls split. Bridge contract (5/5), vitest (652/652), ts-js-drift clean, build (`npm run build:svelte`) succeeds.

**If svelte-check needs to be green for a worker**: wait for parallel session to land the camera-controls split first, or run svelte-check excluding `src/lib/engine/index.ts` temporarily.

### Recommended next session

1. **W14 Tier 3 recon** (search domain, 8 files, ~3,000 LOC) — biggest W14 arc remaining. Pre-stage a recon worker that maps the 8 files + their importers + the canonical Svelte 5 port coverage. Output: ready-to-fire T3 prompt with explicit per-file scope. ~30-45 min, ~$0.005.
2. **Decide on strand-continuity approach** — main-lane decision. Option (a) or (b) above, or file as W16. (c) is fine if T3 is higher priority.
3. **Legend-ui W15 worker** (if strand-continuity is in W16 and T3 recon lands): dispatch the port-completion OR rewire-to-Legend approach. Decide based on time budget and desired cleanup depth.
4. **`camera-controls.ts` DEATH-BRIDGE final retirement** (W16) — when parallel session lands the split, the 131 LOC `camera-controls.ts` file can be deleted (currently a DEATH-BRIDGE with 20+ consumers).

### Verification baseline (end of this session)

- W14 Tier 2 CLOSED — 4 files retired, 2 findings documented
- Master 0 ahead of origin (pushed)
- Working tree has 33+ uncommitted modifications (parallel session W14-DEATH-BRIDGE mid-flight)
- svelte-check: 23 errors (all in `src/lib/engine/index.ts` from parallel session's mid-refactor, not W14-T2 work)
- vitest: 652/652 ✓
- bridge contract: 5/5 ✓
- ts-js-drift: 78 .ts files clean ✓
- build (`npm run build:svelte`): green ✓

### Doctrine refinements from this session

- **Cross-check audit closures before dispatching workers** — the `next-session-prompt.md` listed A2-4/5/6 as "remaining" but `docs/a2-audit-closure-2026-06-14.md` showed all 8 A2 tickets were shipped. Cancelled 2 workers before they re-implemented shipped work. Lesson: the next-session-prompt is NOT a source of truth for in-flight tickets; audit closures + `git log` are.
- **Always baseline svelte-check on the pre-edit state** before assuming your edit caused new errors.
- **Live steer protocol is fast and cheap** — used 3+ times this session, all landed in <2s.
- **The "1 test straggler" was a false positive** — `tests/semantic-guide-payload-contract.mjs` matched `rg "from.*['\"]\.\./state"` because of `assertNotContains` string literals. Tighter pattern: `rg "from\s+['\"][^'\"]*\.\./state" --type ts --type svelte`.
- **mimo-v2.5 is the productive default** for focused refactors in this repo. $0.001-0.005 per ticket, ~5-30 min wall time.
- **2 workers in parallel works** when scopes are in different `src/lib/` subtrees (Wave 1 = engine + utils, Wave 2 = ui). ~30 min total wall time vs ~60 min sequential. Collision risk was zero.
- **Workers can land commits to files outside their scope** — `adbc6fe` (focus-panel-mode retirement) accidentally absorbed the parallel session's `cluster-labels.ts` kernel deletion. End state correct, but commit message hygiene slightly off. Always check `git show --stat` for each commit to confirm.
- **Parallel session mid-refactors can leave svelte-check broken** — the camera-controls split is in flight, causing 23 svelte-check errors. This is OK if vitest + bridge + drift are still green. Don't try to fix the parallel session's WIP in main lane.

### Open questions

1. **Will the parallel session land the camera-controls split in this session or the next?** If this session, the svelte-check errors will resolve and W14-T3 recon can run. If next session, wait or skip svelte-check in T3 worker.
2. **Should strand-continuity be resolved in W14-T2 follow-up, or filed as W16?** This is a main-lane decision.
3. **Legend-ui approach: port-completion or rewire-to-Legend?** Approach 1 (port-completion) preserves the kernel pattern, approach 2 (rewire) is cleaner long-term. Time and risk trade-off.
4. **What's the W14-T3 batch size?** 8 files / ~3,000 LOC could be 1 big worker or 2-3 smaller waves. Recommend 2 waves: 4 search files + 4 search-adjacent files.
