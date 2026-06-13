# BOTH-pattern fix-wave retrospective — 2026-06-13

**Status:** Closed (all 6 tickets landed; 1 follow-up ticket ready to fire)
**Scope:** Tickets 1+2, 3, 4, 5, 6 from `docs/both-pattern-follow-ups-2026-06-13.md`
**Result:** 21 commits on master, all pushed to origin, BOTH queue essentially empty

This is a postmortem of the 2026-06-13 fix-wave. Future migrations can use this as a playbook for the same shape of work (large audit + many-ticket follow-up + parallel worker delegation).

---

## What shipped

### Commit delta (21 commits, `abd2a08..c854811`)

| # | Hash | Subject | Source |
|---|---|---|---|
| 1 | `d1a7016` | docs(closeout): mark BOTH Tickets 1+2, 4, 5, 6 closed + add Ticket 8 | main lane |
| 2 | `2612ba3` | test(search-rerank): add rerank unit tests and live verification (Ticket 6) | worker |
| 3 | `2a5c590` | feat(search-rerank): add NIM rerank step to search result ranking (Ticket 6) | worker |
| 4 | `2cb6db2` | chore(unification): delete legacy semantic-dive-ui.ts and semantic-guide.ts (Ticket 4) | worker |
| 5 | `b93e077` | refactor(unification): port semantic-guide to src/lib/journey/semantic-guide.ts (Ticket 4) | worker |
| 6 | `4074ae1` | refactor(unification): port syncSemanticDiveUi to src/lib/journey/semantic-dive.ts (Ticket 4) | worker |
| 7 | `28faffc` | feat(search): port all consumers to src/lib/search-engine single-track (Ticket 5) | worker |
| 8 | `a5b93dc` | feat(journey): populate thread candidates on SEARCH_FOCUS + Svelte-5-ify JourneyChrome | Fred hand |
| 9 | `f199e50` | docs(closeout): mark BOTH Ticket 3 closed + create fred profile | main lane |
| 10 | `1f01499` | docs(active-context): log post-cleanup product QA + open seam | Fred hand |
| 11 | `8102c06` | fix(three-engine-bridge): Ticket 3 hot follow-up + journey/orchestration cleanup | main lane |
| 12 | `b763d95` | chore(dist): Svelte build output refresh after token freeze + chrome specificity | main lane |
| 13 | `98aaab3` | docs(migration): refresh readiness + active context to 2026-06-13 | main lane |
| 14 | `d8b3a63` | fix(three-engine-bridge): retire @legacy/modules/view-controller dynamic import | main lane |
| 15 | `f1176bc` | fix(three-engine): retire 10 render-loop @legacy/* imports (Ticket 3 hot) | main lane |
| 16 | `1eae33f` | fix(three-engine): retire 9 init-only @legacy/* imports in dynamic import block (Ticket 3 cold) | main lane |
| 17 | `5fad3a2` | feat(search-cache): extract cache module + pagination parity for Svelte single-track | main lane |
| 18 | `75e54b8` | feat(both-pattern): land js runtime stubs + bridge modifications for full Svelte/ts @legacy/* coverage | main lane |
| 19 | `c5a04a3` | fix(both-pattern): port 4 LIVE stub-mis-wires + delete 15 dead stubs (Parts A+C) | prior session (Ticket 1+2 atomic) |
| 20 | `1befce2` | fix(legacy): wrap state mutations in withStateMutation + retire additional @legacy/* imports | main lane (cleanup wave 1) |
| 21 | `00cfb5c` | fix(components): dynamic engine bridge + semantic-dive route + URL state sync | main lane (cleanup wave 2) |
| 22 | `c854811` | docs: post-cleanup design + active-context + profile refresh | main lane (cleanup wave 3) |

### Tickets closed

| Ticket | Title | Commits | Worker |
|---|---|---|---|
| 1+2 | Port 4 LIVE stub-mis-wires + delete 16 dead stubs | `c5a04a3` | prior session |
| 3 | Retire 19 `@legacy/*` imports in `three-engine.ts:238-256` | `1eae33f`, `f1176bc`, `d8b3a63`, `8102c06` | main lane + 1 wave 2 commit |
| 4 | Svelte-unification analysis for 3 dual-impl functions | `4074ae1`, `b93e077`, `2cb6db2` | scoper + impl worker |
| 5 | search-engine single-track migration | `28faffc` | impl worker |
| 6 | Search-rerank feature (NIM integration) | `2a5c590`, `2612ba3` | impl worker |
| — | Cleanup wave (withStateMutation, additional retirements) | `1befce2`, `00cfb5c`, `c854811` | main lane |
| 8 (new) | 12-caller follow-up in `thread-settler-adapter.ts` | not yet | prompt ready |

---

## What worked

### 1. The delegating-shim pattern for BOTH-pattern ports

The 4 functions in Ticket 1 (`syncFocusStage`, `updateSelectedBusiness`, `updateTraversalUi`, `clearThreadInspection`) and the 2 functions in Ticket 8 (`traverseNeighbor`, `previewInsideNextThread`) were all implemented as **delegating re-exports** from `@legacy/modules/*` (option (b) from the original ticket scope), preserving the BOTH chain:

```
js/modules/X.js shim → re-exports from src/lib/journey/X.ts → re-exports from @legacy/modules/X (the .ts real impl, picked by Vite's .ts-first resolution)
```

This is the lowest-risk port strategy: it preserves the BOTH pattern, requires no caller updates, and the `.ts` real impl is what Vite picks at runtime. Strategy (a) — port the real impl into `src/lib/` and update all callers — was considered for the render-loop hot path (`updateTraversalUi`) but rejected because the delegating shim is type-clean and there's no perf cost for a single-function call.

**Lesson:** When porting BOTH-pattern shims, default to (b) delegating re-export. Only consider (a) for render-loop hot paths where you've measured a perf cost, and even then, the shim is usually fast enough.

### 2. The scoper + impl worker split

For Tickets 4 and 6, the work was split into 2 workers:
- **Scoper** (`ocw_15827352` for Ticket 4, `ocw_fd54949a` for Ticket 6): read the design doc, write a concrete worker prompt to disk, return a 3-line summary + cross-seam findings
- **Impl worker**: receive the prompt, implement, verify, commit

The scoper takes 2-4 minutes and produces a 149-322 line prompt. The impl worker takes hours but has a clear, scoped contract. This split:
- Keeps the main lane from writing 322-line prompts (mental overhead)
- Lets the scoper catch design-doc gaps before any code is written (scoper 6 caught the `rankings` vs `rerank_results` discrepancy)
- Provides a "ready to fire" prompt that any future session can launch without re-scoping

**Lesson:** For tickets with non-trivial design docs, the scoper + impl split is worth the 2-4 min cost of the scoper. The scoper is cheap; the impl is expensive. Cheap pre-flight beats expensive rework.

### 3. The v2-prompt recovery pattern

When Worker 1 v1 (Ticket 1+2) got stuck for 35+ min on a recursive `grep -r "syncFocusStage" .` piped through 3 `grep -v` filters (Windows NTFS, 100K+ files), the recovery was:
1. Read the worker's stdout to see the stuck command
2. Compute the audit data in the main lane with scoped `rg`
3. Cancel the worker
4. Relaunch with a v2 prompt that included the pre-computed audit + a "do NOT run recursive grep" warning + a worktree-state note
5. New worker (`ocw_9e4d0593`) launched, found that the prior attempt had already completed the work in `c5a04a3`, ran thorough verification, produced a high-quality final report

**Lesson:** When a worker is stuck on a slow bash command, the v2-prompt recovery pattern (cancel + relaunch with pre-computed audit + warning + worktree-state note) is a clean rescue. Cost: 10 min to write the v2 prompt. Benefit: turns a 90+ min dead-worker timeout into a fresh 30-60 min productive worker.

### 4. The delegating-shim pattern matched across waves

Tickets 1, 4, 5, and 8 all used the same delegating-shim strategy. The pattern was documented in the Ticket 8 worker prompt and would apply to any future BOTH-pattern port. This consistency made the worker prompts interchangeable and the verification rubrics reusable.

### 5. The 15s bash detach fix (Fred's contribution)

Fred fixed bash to detach at 15s during the wave. This would have prevented the Worker 1 hang entirely if it had been in effect earlier. (The fix only takes effect after Pi restart; the current session was launched before the fix.) Captured as `project:semantic-explorer:bash-detach-handling` skill.

---

## What didn't work

### 1. Recursive grep from the worktree root

Worker 1 v1 ran `grep -r "syncFocusStage" --include="*.ts" --include="*.js" .` from the worktree root. The initial grep scans `node_modules`, `dist`, `.git` before the `grep -v` filters exclude them. On Windows NTFS, this takes 30+ min and appears hung.

**Fix:** The v2 prompt for Worker 1 explicitly warned against this. Captured as a recommendation in the new Ticket 8 prompt ("Use scoped `rg <fn> js/modules src/lib` or `ast_grep_search`"). The 15s detach fix will also prevent the next instance of this pattern.

### 2. Dev server noise polluting worktree status

The Svelte/Vite dev server (PID 24132 on port 5173) re-touches `dist/svelte/*` and other files via HMR after every save. The re-touches are content-identical but mtime-different, so `git status` shows them as modified. This made the close-out commit verification harder — the worktree had 20+ "modifications" that were just dev server noise.

**Fix:** Captured as `project:semantic-explorer:dev-server-drift-handling` skill. Rule: for close-out commits, use explicit `git add <files>`, never `git add -A`. Detect dev server noise by its signature (CRLF changes, hash-only changes, Vite-managed paths).

### 3. Worker commits included `dist/svelte/*` modifications

Several workers (Ticket 5, 6) included `dist/svelte/*` in their commits because the dev server had re-touched the files between the worker's edit and the worker's commit. This means each worker's commit "broke" within seconds of landing (the file would re-appear as modified).

**Fix:** Captured in the dev-server-drift skill. Rule: worker commits that include `dist/svelte/*` re-touches are not "real" modifications; the source-file change is the real work. Future workers should `git checkout -- dist/svelte/index.html` before committing to drop the dev-server re-touch.

### 4. The v1 worker (Ticket 1+2) did useful work before getting stuck

The Worker 1 v1's work was partially complete before the recursive-grep hang. The work landed in commit `c5a04a3` (a prior session). The v2 worker (`ocw_9e4d0593`) found this and produced a thorough final report. **Net: no work was lost.** But the 35-min hang was wasted time.

**Fix:** The v2-prompt recovery pattern handles this. For future workers, the v1 prompt should pre-warn against the slow-bash trap and recommend scoped rg / ast_grep_search from the start.

### 5. The Ticket 6 design doc had a `rerank_results` vs `rankings` field-name discrepancy

The Ticket 6 design doc code sketch used `rerank_results` as the response field, but the actual NIM proof doc showed `rankings` (or `data.rankings`). The Ticket 6 scoper caught this; the Ticket 6 impl worker verified the live NIM call confirmed `rankings` is correct.

**Fix:** Future design docs should include the actual response shape from the upstream API, not a sketch.

---

## Lessons for the next migration

1. **Default to delegating-shim for BOTH-pattern ports.** Type-clean, no caller updates, preserves the BOTH chain.

2. **Scoper + impl split for non-trivial tickets.** Cheap pre-flight catches design-doc gaps.

3. **Pre-compute audits in the main lane before launching audit workers.** Saves worker time and avoids the slow-bash trap.

4. **Use `git add <files>` explicitly for close-out commits.** Never `git add -A`. Detects dev server noise.

5. **Test bash commands with explicit timeouts in the main lane.** With the 15s detach fix in effect (post-restart), the main lane can be confident that long bash commands will detach cleanly.

6. **Worker prompts should include a worktree-state note** when relaunching after a v1 attempt. Saves the v2 worker from re-discovering partial state.

7. **Cross-seam findings from workers are gold.** Worker 1+2 v2's 12-caller cross-seam finding became Ticket 8. The 5 worker prompts for Tickets 4, 5, 6, 8 all became ready-to-fire assets.

8. **Push tickets close as a unit.** The wave shipped 5 tickets as a coordinated stack. Pushing mid-wave would have split the review diff and unblocked no one.

---

## Durable artifacts saved during the wave

### Files
- `tmp/commit-messages-2026-06-13/worker-ticket-{1-2, 1-2-v2, 4, 5, 6, 8}-prompt.txt` — 6 ready-to-fire worker prompts
- `tmp/commit-messages-2026-06-13/{02,03,05,06,07,08,09,10,11}-*.txt` — 9 commit message drafts
- `notes/fred-profile.md` — Fred's collaboration profile
- `docs/both-pattern-follow-ups-2026-06-13.md` — ticket tracker (now shows 5 closed, 1 ready, 1 optional)
- `docs/svelte-unification-analysis-2026-06-13.md` — Ticket 4 design doc (with completion table)
- `docs/ts-migration-readiness.md`, `memory/active-context.md` — refreshed to 2026-06-13

### Memories
- Bash 15s detach behavior (with restart caveat)
- v2-prompt recovery pattern
- 2026-06-13 session summary (commits, worker prompts, BOTH queue state, next-session entry)

### Skills
- `project:semantic-explorer:bash-detach-handling` — 15s timeout behavior, anti-patterns
- `project:semantic-explorer:dev-server-drift-handling` — Vite HMR noise detection, `git add` discipline

### Profile
- `notes/fred-profile.md` — collaboration preferences, communication patterns, tooling preferences, "things to NOT do" list, worker routing evidence

---

## BOTH queue net state at wave close

| Ticket | State | Commit(s) |
|---|---|---|
| 1+2 stub ports | ✅ CLOSED | `c5a04a3` |
| 3 @legacy/* retirements | ✅ CLOSED | `1eae33f`, `f1176bc`, `d8b3a63`, `8102c06` |
| 4 Svelte unification | ✅ CLOSED | `4074ae1`, `b93e077`, `2cb6db2` |
| 5 search-engine single-track | ✅ CLOSED | `28faffc` |
| 6 search-rerank | ✅ CLOSED | `2a5c590`, `2612ba3` |
| 7 lost subagent lanes | ⚪ SKIP (10 min, optional) | — |
| **8 12-caller follow-up** | 🔵 **NEW, ready to fire** | prompt at `tmp/commit-messages-2026-06-13/worker-ticket-8-prompt.txt` |

Once Ticket 8 lands, the BOTH-pattern follow-up queue is essentially empty.
