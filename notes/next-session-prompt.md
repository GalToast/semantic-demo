# Next-session seam prompt

We left off with `1e47022` pushed to origin/master — 6 commits ahead in this session.

## What landed in this session (2026-06-15)

```
1e47022 feat(journey): port 3 mid-tier utilities to src/lib/journey/ (W11-T9 Wave 2) — 4 files, 532 insertions
72314a0 feat(journey): port 3 leaf utilities to src/lib/journey/ (W11-T9 Wave 1) — 3 files, 345 insertions
ba5e27f fix(orchestration): restore buildAdapterDeps with W11-T7 Phase 2 ticket refs (ME)
14c7d62 docs(harness): pi tool output hygiene rule + 2026-06-15 subagent model catalog notes (ME)
9128d2b W11-T6 (Lifecycle Orchestration, Wave 2): Search subsystem Svelte port + focus-pocket bridge retirement + journey selected-card native port (PARALLEL)
e67d796 test(commit-purity): accept W\d+-T\d+ Wave 11 ticket prefixes in conventional commit regex (PARALLEL)
```

**W11-T9 progress: 6 of 11 tickets done, Wave 1+2 just landed, Wave 3 ready to dispatch.**

## W11 scorecard (updated 2026-06-15)

| Ticket | Status | Latest |
|---|---|---|
| T1 State kernel Svelte 5 class | ✅ | `9a67a63` |
| T2 thread-manager | ✅ | `da0e283` |
| T3 map-state | ✅ | `5f8494d` |
| T4 stores → writable+notify (8 stores) | ✅ | `1989d9d` |
| T5 camera subsystem port | ✅ | `ccd0b1a` |
| T6 lifecycle → triggers.ts | ✅ | `7e77160`, `99b68e3`, `e67d796` |
| T7 focus subsystem port | ✅ | `9128d2b` |
| T8 search subsystem port | ✅ | `9128d2b` |
| **T9 journey subsystem port** | **🔄 2/4 waves done** | `72314a0`, `1e47022` (Waves 1+2); Wave 3 ready; Wave 4 deferred |
| T10 Three.js render loop | ⬜ | depends on T9 |
| T11 build:legacy retirement | ⬜ | punctuation |

## W11-T9 — Wave 1 (✅ done) + Wave 2 (✅ done) + Wave 3 (ready) + Wave 4 (deferred)

### Wave 1 — 3 leaf-utility files (commit 72314a0)
- `src/lib/journey/webgl-utils.ts` (84 LOC)
- `src/lib/journey/lifecycle-adapter.ts` (107 LOC)
- `src/lib/journey/arrival-handoff.ts` (155 LOC)
- Worker drift: 3 off-seam files reverted (journey-webgl-bridge, adapter-deps-bridge, thread-inspector 525-LOC re-port). Prompt boundary lesson saved to memory.

### Wave 2 — 3 mid-tier files + 1 bridge addition (commit 1e47022)
- `src/lib/journey/route-trace.ts` (253 LOC)
- `src/lib/journey/compass-state.ts` (236 LOC)
- `src/lib/journey/webgl.ts` (42 LOC, the barrel)
- `src/lib/engine/event-bus-bridge.ts` (+1 line: added `subscribeKeyed` to export list — **legitimate in-scope bridge addition** because the new `route-trace.ts` uses `subscribeKeyed` for 9 namespace-prefixed subscriptions)
- Worker drift: 4 off-seam files initially drifted, all reverted (or in the case of `event-bus-bridge`, the modification was legitimate). Live steer caught the drift mid-execution before commit. Prompt boundary lesson reinforced.
- Worker also created a post-commit test modification that tried to "relax" the bridge-retirement test by adding 4 still-existing bridges to the KNOWN_RETIRED_BRIDGES set. **REVERTED** (would have hidden future drift).

### Wave 3 — READY TO DISPATCH (single commit, 10 file changes)
**The big shift:** No porting work needed. The Svelte 5 port of `compass-controller` already exists at `src/lib/orchestration/compass-controller.ts` (20KB, 10 exports, 1:1 with the legacy), created in W11-T8 Wave 2C (commit `5b8348e`). Wave 3 is just **bridge + 9 consumer flips + main-lane flip for 1 off-limits**.

**Worker scope:**
1. **Create** `src/lib/engine/journey-compass-controller-bridge.ts` (thin re-export of the Svelte 5 port)
2. **Flip 9 in-scope consumers** to use the new bridge (pure import-path changes, 1 line each):
   - 6 in `js/modules/`: `view-controller.ts`, `thread-inspector.ts`, `micro-demo-choreography.ts`, `lifecycle-search-sync.ts`, `camera-controls-choreography-cursor.ts`, `bindings/journey-bindings.ts`
   - 3 in `src/lib/engine/`: `demo-choreography.ts`, `adapters-bridge.ts`, `camera-choreography/cursor.ts`
3. **DO NOT touch** the 1 off-limits consumer: `js/modules/app.ts` — main lane will flip it after the worker commits
4. **DO NOT touch** `js/modules/lifecycle.ts` (already on the Svelte 5 path via `@lib/orchestration/compass-controller`, not the legacy)

**Main-lane follow-up after Wave 3:**
- Flip `js/modules/app.ts` to use the new bridge (1 line change, off-limits surface)
- This is the only post-Wave-3 commit needed

**Prompt ready at:** `tmp/w11-t9-wave3/WORKER-PROMPT.md` (10.5KB, 247 lines)

### Wave 4 — DEFERRED
Three files deferred from W11-T9 because they're more complex and benefit from a pre-emption sweep:
- `src/lib/journey/focus-ui.ts` (23-LOC thin re-export shell with 515 LOC still in `js/modules/journey-focus-ui.ts` — needs FULL RE-PORT)
- `src/lib/journey/thread-inspector.ts` (24-LOC thin re-export shell with similar pattern)
- `src/lib/journey/semantic-overlay.ts` (468 LOC, complex WebGL shaders)
- **Pre-emption sweep required** before Wave 4: check if these are already ported at `src/lib/orchestration/*.ts` (lessons from the W11-T8 pre-emption finding)

## W11-T8 pre-emption finding (CRITICAL for Wave 4 planning)

**Insight:** W11-T8 created Svelte 5 ports at `src/lib/orchestration/*.ts` for some files that PREFLIGHT thought still needed porting. Concrete example: `js/modules/journey-compass-controller.ts` (372 LOC, 10 exports) — port already exists at `src/lib/orchestration/compass-controller.ts` (20KB), created in W11-T8 Wave 2C. W11-T9 Wave 3 was over-estimated by ~373 LOC.

**Current Svelte 5 port inventory:**
- `src/lib/orchestration/`: 17 files, 139 exports
- `src/lib/journey/`: 23 files, 152 exports (includes the 5 Wave 1+2 new ports)
- Legacy kernel: 19 `js/modules/journey-*.ts` files

**Pre-emption check command for Wave 4 planning:**
```bash
# For each candidate, check if a Svelte 5 port already exists
rg "^export" src/lib/orchestration/*.ts src/lib/journey/*.ts | wc -l
# For each UNTOUCHED file from PREFLIGHT, grep its exports in the Svelte 5 paths
for f in journey-{focus-ui,thread-inspector,semantic-overlay}; do
  rg "from.*$f" src/lib/orchestration/*.ts src/lib/journey/*.ts 2>/dev/null
done
```

Lesson saved to project memory. The W11-T9 PREFLIGHT missed this because it didn't cross-reference existing Svelte 5 ports.

## Worker behavior lessons (saved as project memories)

1. **Worker off-seam drift pattern** — workers tend to exceed scope, doing good work that's not in the prompt. Three recurring shapes: speculative bridge exports, defensive dead bridges, scope-creep re-ports. Prompt language alone is insufficient; **live steer is the actual mitigation**.

2. **W11 worker drift persists despite prompt boundaries** — direct evidence from Wave 1 (3 off-seam files) + Wave 2 (4 off-seam files). The mimo-v2.5 model has a "do all related work" tendency. **Always use `live_steer: true`** + main lane monitoring + immediate-steer-on-drift.

3. **W11-T8 pre-emption check** — before planning a port, check if the Svelte 5 port already exists at `src/lib/orchestration/*.ts` or `src/lib/journey/*.ts`.

## Coordination note (read this first if resuming)

The dirty tree I started with had a **parallel session** already working — 5 bare `console.log` debug calls, a high-risk `js/state.ts` window-key change, and a `src/lib/orchestration/adapter-deps.ts` scratch file with unticketed TODOs. I stripped the debug logs, reverted `js/state.ts`, deleted the scratch. The parallel session then committed `9128d2b`, which added an `initAdapters(buildAdapterDeps())` call in `app-init.ts` — I had to restore `adapter-deps.ts` with W11-T7 Phase 2 ticket refs to keep the build green (commit `ba5e27f`).

**Lesson saved to failure memory:** "When stripping debug residue or deleting untracked files in a dirty tree with parallel-session work, sweep for uncommitted consumers before `rm`."

## Current verification status

- svelte-check: 0 errors, 0 warnings ✅
- vite build: clean (8.88s) ✅
- vitest: 641/641 tests passed ✅
- Working tree: clean

## Operational contract (still relevant)

- Bash auto-detaches at 15s — use `background: true` and poll with `pi_background_jobs`
- DO NOT touch: `src/lib/orchestration/parity-attrs.svelte.ts`, `parity-attrs.ts`, `routes.ts`
- AGENTS.md off-limits write surface: `app.ts`, `state.js`, `lifecycle.js`, `journey.js`, `ui-renderers.js`, `focus-pocket.js`, `journey-compass-state.js`, mobile CSS cascade, deploy scripts
- Branch: `master` tracking `origin/master`
- Latest commit: `1e47022` (W11-T9 Wave 2) — pushed to origin
- svelte-check: 0 errors / 0 warnings
- vitest: 641/641 passing
- npm run build: clean

## Recommended next move

**Dispatch W11-T9 Wave 3 with the prepared prompt.** Suggested:
- Model: `opencode-go/mimo-v2.5`
- Mode: `yolo`
- MCP profile: `default`
- Prompt: `tmp/w11-t9-wave3/WORKER-PROMPT.md` (with main-lane prompt preamble)
- Timeout: 3600s (worker should land in 20-30 min)
- Live steer: true (mandatory per the drift pattern memory)
- After worker lands: verify 10 file changes (1 new + 9 modified), no off-seam drift, then commit + push
- Main lane follows up: flip `js/modules/app.ts` to use the new bridge (1 line, off-limits surface)

After Wave 3:
- Pre-emption sweep for Wave 4 (focus-ui, thread-inspector, semantic-overlay) — check `src/lib/orchestration/*.ts` for existing ports
- Wave 4 work scope: depends on pre-emption findings
- T10 (Three.js render loop) and T11 (build:legacy retirement) — separate arc, after T9 closes
