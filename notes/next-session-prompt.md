# Next-session seam prompt

We left off with `cc16c3f` pushed — all 5 seams from the previous prompt are closed:

- ✅ svelte-check: 0 errors, 0 warnings (was 5 in legacy + 13 in src/)
- ✅ svelte-parity-attrs.test.ts: 19/19 passing (was 15/19)
- ✅ W11-T4 (focus + journey store migration to `writable + notify`): done in `4f5aba4`
- ✅ 4 missing engine bridge files committed: `camera-controls-core-bridge.ts`, `camera-controls-restore-bridge.ts`, `focus-pocket-bridge.ts`, `window-actions-bridge.ts`
- ✅ 3 legacy `js/modules/` fixes: `SearchSummary` props, `createSporeTexture` arity, `Point[]` vs `GeoPoint[]`
- ✅ Working tree: clean except `dist/svelte/*` deletions (BOTH-pattern retirement, build artifacts — not source) and `notes/next-session-prompt.md`

## What was in cc16c3f

`fix(w11+t3+t4): focus/journey store migration back-compat + legacy 5-error closure`

19 files: 15 modified + 4 new bridges. Back-compat aliases for callers of pre-migration store APIs (e.g. `setCurrentView = switchView`, `searchStore()` instead of `searchStore.results`).

## What I intentionally did NOT commit (reverted or deleted)

- `src/lib/engine/camera-choreography/cursor.ts` and `focus.ts` — used `@lib/engine/camera-controls-core` port (separately scoped W11-T5)
- `src/components/SearchResults.svelte` — added `tabindex="-1"` (unrelated UI fix)
- `css/mobile_premium__surfaces.css` and `css/strands.css` — A3-6 changes ("hide compass steps in idle") — not W11 work, separate ticket
- `dist/svelte/*` deletions — build artifacts from Vite, not source
- All zero-byte scratch files (`1`, `semantic-explorer@1.0.0`, `svelte-check`)
- Browser console logs (`console-5173.txt`, `console-after-fix.txt`, `console-reload.txt`)
- `rg_out.txt` (rg search output)
- `src/lib/engine/camera-framing-utils-bridge.ts` and `src/lib/engine/camera-controls-core.ts` — restored then deleted because no consumers after the cursor/focus reverts
- `tests/unit-active/camera-choreography-focus-bridge-import.test.ts` — depends on the deleted bridge files

## ✅ Resolved since last prompt

**Worker completed W11-T4 second wave.** The "in flight" worker that I flagged at the end of the previous session committed its work as `8c3483d refactor(w11-t4): migrate remaining 5 stores from toStore to writable + notify` covering:

- `src/lib/stores/filter.svelte.ts` (4 stores: filterVersion, filterColorVersion, activeClusterFilter, filterState)
- `src/lib/stores/viewport.svelte.ts`
- `src/lib/stores/demo.svelte.ts`
- `src/lib/stores/engine-bridge.svelte.ts`
- `src/lib/stores/legend.svelte.ts`

The worker also created a project skill: `~/.pi/agent/projects-memory/semantic-explorer/skills/tostore-migration-pattern/` to document the writable+withNotify wrapper convention. Worth a look for the next migration.

Verified after the worker's commit: svelte-check 0 errors / 0 warnings, 19/19 parity-attrs passing, 8/8 A3-1 passing. All 8 stores that used toStore are now migrated.

## Next seams (in order)

1. **A3-6 CSS — RESOLVED, NOT A SEAM**
   - **Audit verdict was correct** (verified by subagent `ocw_a9f3b16f-0ef0-47d0-bba2-c6876cb8799f` on 2026-06-14): A3-6 was correctly closed as an "audit misread" in commit `9672497`. The "5 journey-step tooltips" the audit described are actually the CompassRail navigation rail, which is always-visible UI by design — not stale hints.
   - The uncommitted A3-6 CSS changes from earlier sessions no longer exist in the working tree (reverted in a prior cleanup). The audit's "No fix required" verdict held.
   - **No action needed.** Don't commit anything for A3-6.

2. **W11-T5 camera-controls-core port — DONE in `ccd0b1a`**
   - Worker ported 10 camera files (cursor, focus, routes, framing-utils, controls-core, controls-restore, controls) from `js/modules/` to `src/lib/engine/`. Substantial diff: 1105 insertions, 861 deletions across 7 files.
   - Approach: incremental (ported deps use `@lib/`, unported deps keep relative paths to `js/modules/`). Removed lazy-loading infrastructure throughout.
   - 3 workers dispatched in parallel (cursor+focus, routes+framing, core+restore) — no write overlap, all completed clean.
   - Companion regression test for A3-2 fix committed in `1d5fa87` (4 new tests; vitest 371→375 passing).

3. **`dist/svelte/*` — NOT A SEAM (was misframed)**
   - The 141M lives in `dist/svelte/assets/` which is already gitignored (`dist/svelte/assets/`, `dist/svelte/.git/`, `dist/svelte/stats.html` are all in `.gitignore`).
   - The 34 remaining tracked files (138.6 MB of CSS + dat + json) are the **deployable artifact** that `deploy.sh` pushes to production. They SHOULD be tracked.
   - The only "noise" the build creates: after `npm run build`, dist/svelte/css/* gets re-copied from `css/`. If you touched source CSS recently, the dist copies show as modified. Fix: `git checkout HEAD -- dist/svelte/` after each verification build.
   - **No action needed.** The gitignore is already set up correctly.

4. **Wider test sweep beyond the active unit suite**
   - `npm run test` runs shell + cache + CSS ownership checks (not just vitest)
   - `npm run qa:contract:all` and `npm run qa:surface:all` for broader contract/visual coverage
   - `npm run build` confirmed clean on 2026-06-14 after W11-T5 (build clean, 0 errors)
   - vitest: 375/375 passing

## Subagent decision policy (saved 2026-06-14)

See `~/.pi/agent/memory/` (target=memory, category=convention): "Subagent decision policy". The short version:

- **Dispatch subagents** for: tasks >30 min with no urgent blocker, parallelizable independent subtasks, long-running verification the main lane doesn't need to block on, sustained focus on one arc >1 hr, audit/verification work that benefits from a second perspective, high-risk seam work.
- **Do inline** for: <2 min tasks, tightly coupled follow-ups, mid-task user decisions, single tool calls, explicit user request to handle inline.
- **For this project specifically:** W11-T5, A3 audit cross-checks, dist/svelte cleanup = subagent tasks. Single-file diagnostics, single commands like `npm run build` = inline.
- **Default model:** mimo-v2.5 paid, yolo mode, mcp_profile="default".

## Key context (still relevant)

- Bash auto-detaches at 15s for long commands — use `background: true` and poll with `pi_background_jobs`
- DO NOT touch: `src/lib/orchestration/parity-attrs.svelte.ts`, `parity-attrs.ts`, `routes.ts`
- Branch: `master` tracking `origin/master`
- Latest commit: `1d5fa87` (A3-2 regression test) — branch pushed to origin/master
- svelte-check: 0 errors / 0 warnings
- vitest: 375/375 passing (was 371; +4 from the A3-2 test)
- npm run build: clean after W11-T5 port
- W11-T5 (camera subsystem) complete in `ccd0b1a`
- Another worker is mid-flight on a new W11 engine port (data-worker-url-bridge + src/lib/{demo,journey,semantic-threads}.ts) — let it land
- **No remaining seams.** The original 5-step plan is closed; A3-6 is a non-issue; W11-T4 + W11-T5 are done; dist/svelte is correctly handled.
