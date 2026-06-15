# Next-session seam prompt

## Current state (2026-06-15 evening, post-W12 + W13-T1)

**Branch:** `master` tracking `origin/master` (0 ahead, 0 behind)
**Working tree:** 15 files modified by parallel session's W11-T7 + W13-T2 batch — DO NOT touch, let them commit first.
**Master HEAD:** `4bc5766` (last commit in this session was T9 partial progress doc)

### W12 scorecard (final)

| Ticket | Status | Commit | Net LOC |
|---|---|---|---|
| T1 parity-attrs delete | ✅ | `5af8052` | -472 |
| T2 webgl-bridge porting | ✅ (parallel) | `43a95fa` | +403 |
| T3 lifecycle stub deletes | ✅ | `ff56ca6` | -86 |
| T4 window-actions audit | ✅ NO-OP | `ff56ca6` | 0 |
| T5 phase 1 event-bus redirects | ✅ | `4b81e7b` | 0 |
| T5 phase 2 shim deletes | ✅ (parallel) | `43a95fa` | -22 |
| T6 adapter-deps cross-layer → bridge | ✅ | `ff56ca6` | -29 |
| T7 triggers dedup | ✅ | `267c2f1` | -1 |
| T8 adapters.ts type tightening | ✅ | `ed419b2` | +32 |
| T9 fix/* branch cleanup | ✅ DONE | `145b10f`, `4bc5766`, `d31e9cc` | (worktrees removed) |
| T5 phase 2 via parallel | ✅ | `45597aa` | semantic-overlay + shims |
| W12 charter | ✅ | `8524e29`, `e83b766` | doc |
| W12 closeout | ✅ | `908ca9c`, `43a95fa`, `106d474`, `4bc5766` | doc |
| W13 charter (231 selectors) | ✅ | `59d0471` | doc |
| W13-T1 timer retirement | ✅ (parallel) | `f6b3089` | -48 |
| Visual QA closeout (B- → B) | ✅ | `52d8d22` | doc |
| Bridge consumer count script | ✅ | `e10458d` | tool |
| Commit-purity test update | ✅ | `9bda15d` | test |

**Net W12 cleanup: -255 LOC across 7 source commits + 6 docs/audits.**

### What remains for W12 closeout

- ✅ **T9 final 2 branches** — COMPLETED in `d31e9cc` (parallel session). All 4 branches removed, all 4 worktrees cleaned up. W12 is now fully closed.

### W13 scorecard (in progress)

| Ticket | Status | Effort | Notes |
|---|---|---|---|
| T1 Timer retirement | ✅ | -48 LOC | parallel session commit `f6b3089` |
| T2 Nav+Filter | 🔄 IN FLIGHT | 3-4h, M risk | parallel session doing in next commit |
| T3 Search+Animation | TODO | 3-4h, M risk | 17 consumers to update |
| T4 Three.js Bridges | TODO | 6-8h, H risk | 87 selectors, dispatch to subagent |
| T5 Delete legacy + unify types | TODO | 2-3h, M risk | Final cleanup, after T1-T4 |

W13 charter at `docs/w13-state-selectors-charter-2026-06-15.md` — comprehensive 5-ticket plan with porting order.

### Recommended next session (T0: clean state check)

1. **Verify parallel session's W11-T7 + W13-T2 batch landed** — check `git log --oneline origin/master..HEAD`, should see ~15-20 new commits. Confirm `svelte-check 0/0` and `npm run test:unit 652+/652+ pass`.

2. ~~**T9 final cleanup** (5 min)~~ — ✅ DONE in `d31e9cc` by parallel session. All 4 branches + worktrees removed.

3. **Memory consolidation** (5 min, BLOCKED this session) — see `tmp/memory-triage/AUDIT.md`. The memory tool's `old_text` matching has a quirk (long text + HTML-comment-trailing duplicates don't match). Try a different approach:
   - For each duplicate pair, use `replace` to add a unique marker to ONE copy, then `remove` that one.
   - OR: just use `replace` to consolidate the canonical version with a small suffix like `(see global for full content)`.

4. **Start W13-T3 (Search + Animation Selectors)** (3-4h, M risk) — 17 consumers, can be done in main lane.

5. **Add CI** (30 min, one-shot subagent) — `.github/workflows/ci.yml` with `svelte-check + vitest + build` on PR. Biggest gap I identified this session.

6. **Optional Visual QA follow-ups** (2h):
   - C.3: static meta placeholders (`<number> segments · 0 braids · <number> endpoints` shown with defaults)
   - E.5: mobile mode chip icons (show icons only, no labels)
   - Cross-cutting: glass-morphism composition (4 surfaces use same `rgba(7,16,24,0.92) + blur(12px)`)

### Doctrine refinements from this session

- **Subagent audit caught my main-lane mistake.** T6 inline vs bridge reversal saved 27 LOC and aligned with 12+ existing bridge files. Default to dispatching audit work, even when the main lane has a strong initial opinion.
- **"Once decided, do NOT re-verify"** — explicitly prompt this for git-archaeology and selector-classification tasks. Prevents the 30-min reasoning loops.
- **MCP server is a bottleneck** — sustained load causes timeouts. Test with a 60s `echo hi` dispatch before committing to a real task.
- **Synthesis from stdout is acceptable fallback** — when a worker completes but doesn't write the file, the main lane can synthesize from thinking output (did this for T4+T5 audit when the nemotron worker got stuck).
- **Stale worktrees block T9** — the parallel session's 2 remaining worktrees have 11 + 1 uncommitted items. A clear "Worktree Coordination" section in AGENTS.md would prevent this in future.

### Open questions for next session

1. **Should W13-T4 (Three.js bridges, 6-8h, H risk) be a subagent dispatch or in-lane?** The charter recommends in-lane for most of W13, but T4's Three.js frame-budget risk argues for a subagent with frame profiling. Decision pending T2/T3 completion.

2. **Memory consolidation approach** — the audit is on disk but the tool's matching quirk blocked this session. Try `replace`-then-`remove` next session, OR just `replace` the canonical entry with a consolidated version and let the duplicates age out naturally.

3. **6 remote `safe-snapshot-local-20260612-*` branches** on origin — all 0 ahead of master. Could be `git push origin --delete`-cleaned, but they're archaeology. Defer until user explicitly wants them removed.

4. **W13-T5 (delete legacy + unify types)** is the final cleanup. After T1-T4 done, the `js/state/selectors/*.ts` and `js/state.ts` legacy tree should be deletable. Big LOC win (estimated 1,500-2,000 LOC).

### Verification baseline (end of this session)

- svelte-check: 0/0
- test:unit: 652/652 (verified 2x)
- build:svelte: 3.86s, no errors
- git: 0 ahead, 0 behind origin/master
- 2 worktrees remaining (seamfix-gpt, semantic-explorer-canvastdz)
- 3 local fix/* branches remaining (2 worktrees, all 0 ahead of master)
- 6 remote safe-snapshot branches (all 0 ahead, defer cleanup)
- Memory: 99% (audit on disk, blocked on tool quirk)
