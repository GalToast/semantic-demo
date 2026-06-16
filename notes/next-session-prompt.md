# Next-session seam prompt

## Current state (2026-06-16 10:10, post-W13-Wave-7 + post-initSemanticLens-fix)

**Branch:** `master` tracking `origin/master`
**Master HEAD:** `92e66c7 chore(w13-t5b): delete legacy js/state.ts — final state migration` (+ 1 prep commit `095f46b`)
**Working tree:** ~33 files modified (parallel session mid-update on test contract files after the BOTH-pattern retirement; not in our scope)

### This session (2026-06-16, 09:30–10:10 UTC) summary

**Parallel Codex session landed:**

- `095f46b fix(w13-t5b-prep): route dead island state.js imports through canonical bridge + declare Window.L` — BOTH-pattern rewires (2 svelte files: `FilterChrome.svelte`, `SearchResultsList.svelte` migrated `../../state.js` → `@lib/engine/state-bridge`) + Leaflet `L?: unknown;` type declaration in `src/app.d.ts`. Cleared 22 pre-existing svelte-check errors.
- `92e66c7 chore(w13-t5b): delete legacy js/state.ts — final state migration` — Wave 7. W13 engine port arc OFFICIALLY CLOSED.

**Main lane (this session):**

- **A2 audit cross-check** — discovered A2-5 (`f8b5640` + `a6d3182`) and A2-6 (`b5160c1`) were ALREADY SHIPPED via the 2026-06-14 audit closure. Cancelled 2 mimo-v2.5 workers (ocw_0c514d28, ocw_98b9cef7) before they re-implemented shipped work. ~$0.0007 sunk cost. Live steer protocol worked.
- **W13-T5b Wave 7 readiness check** — confirmed 0 actual consumers of `js/state.ts` (the 1 straggler `tests/semantic-guide-payload-contract.mjs` was a string-literal false positive in `assertNotContains` calls). Wave 7 was ready, parallel session landed it.
- **Wave 7 attempt aborted** — tried to land `D js/state.ts` in main lane 30s too early (before parallel session's BOTH-pattern rewires committed). svelte-check showed 22 pre-existing Leaflet errors which I misattributed to my deletion. Restored cleanly via `git restore --staged js/state.ts && git restore js/state.ts`.
- **initSemanticLens null-ref fix worker dispatched** — `ocw_db5feb88-6119-4593-966e-a463bd13f67b` (mimo-v2.5, 5400s timeout, yolo, default MCP, live_steer). Targeting `js/modules/three-interaction-visuals.ts` (initSemanticLens) + `js/modules/journey-route-trace.ts:185` (sibling). Worker found the normal initThreeJS path is correct (scene set before lens init), so the bug is in a second call site or after `cancelAnimate` nulls the scene. Still investigating at session end. ~$0.003 spent.
- **Visual QA Round 3 prompt pre-staged** — `tmp/w15-visual-qa/round3-prompt.md` ready to fire the moment the init-semantic-lens fix lands.

### Final state at `92e66c7`

| Gate              | Status (theoretical)                       | Verified?                  |
| ----------------- | ------------------------------------------ | -------------------------- |
| svelte-check      | ✅ 0 errors (after Leaflet `L?: unknown;`) | ⏳ not yet run post-Wave-7 |
| test:unit         | ✅ 652/652 (pre-conditions)                | ⏳ not yet run post-Wave-7 |
| bridge contract   | ✅ 5/5                                     | ⏳ not yet run             |
| ts-js-drift       | ✅ clean (no regression)                   | ⏳ not yet run             |
| vite build        | ✅ clean                                   | ⏳ not yet run             |
| Visual QA Round 3 | ⏳ waiting on init-semantic-lens fix       | in worker flight           |

**File counts (W11+W13+W16 complete):**

- `js/state.ts` (43,564 bytes) — **DELETED** in `92e66c7`
- `js/state/selectors/` — **DELETED** in `930876f` (W17)
- `js/modules/app.ts` — **DELETED** in `1ee480b`
- `js/modules/camera-controls.ts` (131 LOC) — **DEATH-BRIDGE**, last legacy camera file
- `src/lib/state/app.svelte.ts` (19,339 bytes) — canonical Svelte 5 state class
- `src/lib/state/state-types.ts` (21,511 bytes) — canonical types
- `src/lib/state/with-state-mutation.ts` (2,308 bytes) — canonical mutation guard
- `src/lib/engine/state-bridge.ts` — re-exports `appState as state` for 65+ consumers

### What's in flight right now

1. **Worker `ocw_db5feb88`** (init-semantic-lens-fix) — mimo-v2.5, $0.003 spent, investigating root cause of the null-ref bug. Output target: `tmp/init-semantic-lens-fix/ocw_db5feb88-6119-4593-966e-a463bd13f67b/`.
2. **Parallel session** updating 33 test contract files to match the new BOTH-pattern retirement + state.ts deletion shape. May commit as a single wave any moment.
3. **Visual QA Round 3 prompt** pre-staged at `tmp/w15-visual-qa/round3-prompt.md`, ready to fire the moment the init-semantic-lens fix lands.

### Recommended next session

1. **Verify init-semantic-lens fix landed** — check if `ocw_db5feb88` completed and pushed. If yes, run `git log --since='2 hours ago' --oneline` to find the fix commit. If still in flight, continue polling.
2. **Run full verification sweep on the post-closure tree** — svelte-check + vitest + bridge contract + ts-js-drift + build. This is the real W13 closure validation (the W13 closeout doc was a _paper_ closure; this is the _runtime_ closure).
3. **Dispatch Visual QA Round 3 worker** using the pre-staged prompt at `tmp/w15-visual-qa/round3-prompt.md`. ~30-45 min, ~$0.005, mimo-v2.5.
4. **W14 Tier-1 quick delete** (per `docs/w14-legacy-kernel-retirement-charter-2026-06-15.md` Ticket 1) — 15 files, 1,661 LOC, LOW risk. Wait for Visual QA Round 3 to be green before dispatching. The W14 charter is the next big arc; Wave 1 is the lowest-risk subset.
5. **Delete `js/modules/camera-controls.ts` DEATH-BRIDGE** (131 LOC) — last legacy camera file. 20+ consumers import from it transparently. The DEATH-BRIDGE works but is a real legacy file. Future wave can rewire all 20+ consumers and delete it.

### Verification baseline (end of this session)

- W13 engine port arc OFFICIALLY CLOSED (`92e66c7`)
- Master 0 ahead, 0 behind origin
- Working tree has 33 uncommitted test file modifications (parallel session's W14-T1 test contract updates; not in our scope)
- Memory at 12% (added 4 durable entries this session: A2 audit cross-check lesson, Wave 7 attempt, parallel session W14-T1+Wave 7 landing, init-semantic-lens worker dispatch)

### Doctrine refinements from this session

- **Cross-check audit closures before dispatching workers** — the `notes/next-session-prompt.md` listed A2-4/5/6 as "remaining" but `docs/a2-audit-closure-2026-06-14.md` showed all 8 A2 tickets were shipped. I almost dispatched 2 workers to re-implement shipped work. Lesson: the next-session-prompt is NOT a source of truth for in-flight tickets; audit closures + `git log` are.
- **Always baseline svelte-check on the pre-edit state** before assuming your edit caused new errors. I saw 22 errors after my `D js/state.ts` and assumed I caused them; the parallel session was already mid-fix on the Leaflet `L` global. Restoring my edit + re-checking is the right discipline.
- **Live steer protocol is fast and cheap** — used it 3 times this session to update workers on context changes (W14-T1 working tree, then Wave 7 landing, then test contract churn). All steers landed in <2s, no worker drift.
- **The "1 test straggler" was a false positive** — `tests/semantic-guide-payload-contract.mjs` matched `rg "from.*['\"]\.\./state"` because of `assertNotContains(srcCode, "import { state } from '../state.ts'")` — the strings are in test assertions, not real imports. Tighter readiness grep pattern: `rg "from\s+['\"][^'\"]*\.\./state" --type ts --type svelte` (drop the loose `.mjs`).
- **mimo-v2.5 is the productive default** for focused refactors in this repo. $0.001-0.005 per ticket, ~5-15 min wall time, clean tool use, can be cancelled cheaply if off-seam.

### Open questions

1. **Will the parallel session commit their 33 test file updates as a single wave or trickle them in?** If trickle, every `git status` will show different working tree state. If wave, the next-session-prompt will be more accurate.
2. **Will the init-semantic-lens worker find the second call site?** If yes, expect a 5-15 min commit + push. If not, the worker may revert and report no-op.
3. **Should the `js/modules/camera-controls.ts` DEATH-BRIDGE (131 LOC) be deleted?** It's the last legacy file. 20+ consumers still import from it transparently. Deleting it would require rewiring all 20+ consumers. W14-Tier-1 + W14-Tier-2 are the natural place to do this.
4. **What is the W14 Tier-1 + Tier-2 batch size?** The charter says 15 + 8 = 23 files / ~2,431 LOC. Could be one big worker or split into 2-3 smaller waves. Recommend splitting: 15 Tier-1 in one wave, 8 Tier-2 in the next.
