# W14 Handoff — Legacy Kernel Retirement Arc

**Date:** 2026-06-15
**Master:** 91eeafe (post-W13 closeout, dead code discovery)
**Status:** W13 4/5 done; T5 in flight; W14 ready to start when T5 closes

---

## 1. Why W14 Exists

W11 retired the BOTH-pattern (.js shadows).
W13 retires legacy state selectors in `js/state/selectors/*.js`.
**W14 retires the legacy engine kernel in `js/modules/*.ts`** — 123 files, 26,156 LOC.

The `.ts` files in `js/modules/*.ts` are the active runtime. They must be REPLACED (port to `src/lib/`), not just removed.

## 2. Full Plan

See `docs/w14-legacy-kernel-retirement-charter-2026-06-15.md` (canonical) for the full plan.

**Quick reference:**
- 10 tickets, 4 waves
- ~12,000-15,000 LOC realistic target
- 3-4 weeks of work

```
WAVE 1 (Quick Wins, ~4,600 LOC)         # T1, T2, T10
WAVE 2 (Core Engine, ~7,400 LOC)        # T3, T8, T7
WAVE 3 (Heavy Lifting, ~5,600 LOC)     # T4, T9, T5
WAVE 4 (Capstone, ~1,200 LOC)           # T6 (state.ts interfaces)
```

**Dependencies:** T1 → T2 → T3 → T4 → T5 → T6 (linear chain)
T7, T8, T9 branch from T3. T10 parallel after T1+T3+T9.

## 3. Where to Start

**Start with T1: Tier-1 Quick Delete (15 files, 1,661 LOC).**

The 15 files are listed in the W14 charter Section "Ticket 1". Each has a confirmed src/ counterpart, ≤3 importers, and the deletion is mechanical (delete js/, update 1-3 imports).

**Pre-flight check (already done):** Tier-1 audit at `tmp/w14-tier1-verify/REPORT.md` (in flight via mimo-v2.5 subagent).

**Why T1 first:** lowest risk, fastest win, sets the pattern for Tier-2.

## 4. Key Files to Read First

Before starting T1, read these to understand the context:

1. `docs/w14-legacy-kernel-retirement-charter-2026-06-15.md` — full plan
2. `docs/w13-arc-closeout-2026-06-15.md` — W13 lessons (especially T5 corrections)
3. `AGENTS.md` — repo conventions, subagent doctrine, worktree coordination
4. `tmp/w14-tier1-verify/REPORT.md` — per-file Tier-1 analysis (when complete)
5. `tmp/w14-charter/CHARTER.md` — original W14 charter evidence (read-only)

## 5. Critical Invariants (from W12/W13)

These are MISTAKES that bit us before. Don't repeat them:

1. **Never blanket-delete `js/modules/*.ts` files.** They are the active runtime. W11's "M3 bugsweep" wrongly called 145 .ts files "dead shadows" — use the 4-signal audit before any future "dead code" sweep.

2. **Verify before merging.** Never merge an orphan without `npx svelte-check` + `npm run test:unit` on both branches. The 0.0001% edge cases (e.g., readonly tuple vs mutable array) are easy to miss.

3. **The Svelte 5 Snippet type quirk.** When passing snippets across module boundaries, you need `as unknown as Snippet` (double-cast via unknown). Same pattern works for any unique-symbol-bearing type.

4. **Use the bridge pattern, not inline.** The 46 bridge files in `src/lib/engine/*-bridge.ts` provide a safe strangler-fig seam. When porting a `js/modules/X.ts` to `src/lib/.../X.ts`, keep the bridge file as a re-export until all consumers migrate, then delete the bridge.

5. **Parallel session serial gate.** Before any non-trivial `git commit` or `git push`, run `git log --since="3 hours ago" --oneline` and `git status --short`. If 5+ unseen commits exist or working tree has untracked changes you didn't create, queue work and DO NOT commit.

## 6. T5 (W13) Status as of 91eeafe

W13-T5 is the cleanup of legacy selectors. The T5 audit found:

- **9 .js files** to delete (currently 9 still on disk: animation, config, data, diagnostics, filter-mode, navigation, renderer, search, url-state)
- **211 total selectors**, 147 DEAD (70%), 64 used
- **Of the 64 used: 12 need real migration**, 5 are on AppState, 8 in `data-store.svelte.ts`, 4 in `semantic-threads.ts`, 4 in `engine/map-state.ts`, 3 in `navigation.svelte.ts`
- **T5a is essentially no-op:** delete 147 dead selectors, no consumer changes
- **T5c is much smaller than expected:** migrate 12 used selectors, delete 9 .js files

**T5 risk: LOW overall.** 88% of `animation.js` and 82% of `search.js` and `renderer.js` are dead code.

**W14 should wait for T5 to fully close** before starting T1, because:
- T1's Tier-1 file deletions don't conflict with T5 (different file groups)
- BUT the parallel session that does T5 might also be working on T1 candidates
- Cleanest: T5 first (clear working tree), then T1 (fresh start)

## 7. Subagent Doctrine (codified in AGENTS.md)

For W14, default to decomposition:
- **In-lane:** quick file reads, 1-line edits, coordination, user-input-needing work
- **Subagent:** T1 (Tier-1 verification) ✅ already dispatched, T6 (state.ts interface migration, 1200 LOC), T9 (WebGL/Three.js, needs visual QA)

Each T1 deletion candidate should be its own subagent dispatch if the parallel-session pattern is dominant. Otherwise, do T1 in main lane.

## 8. CI in Place

`.github/workflows/ci.yml` (added in W12) runs on every push to master:
- svelte-check (0 errors / 0 warnings expected)
- vitest (652 tests expected)
- build:svelte
- bridge references check
- legacy TS budget

Any W14 work will be caught by CI before merge.

## 9. Open Questions

From the W14 charter's open questions section:

1. **Visual QA budget:** WebGL/three.js porting (T4, T9) requires visual regression testing. Per-ticket subagent or batch at wave boundaries?

2. **state.ts interface migration strategy (T6):** Standalone ticket or fold into domain port?

3. **app.ts (T5, 452 LOC, 106 src refs):** Atomic or split into smaller pieces?

4. **Subagent delegation:** Parallel or serial for safety?

These are decisions for when W14 actually starts.

## 10. Next Session Recommendations

1. **Verify W13-T5 fully closed.** Check master for the T5 commit (or wait for parallel session to push).
2. **If T5 closed:** start T1 (Tier-1 Quick Delete). Dispatch T1 subagent for verification (in flight now) and follow-up subagents per file.
3. **If T5 not closed:** wait. Don't fight the wave. Maybe help with the remaining T5a/T5c work in main lane.
4. **W14 charter is in master.** Anyone can start T1 work without re-planning.

---

*This handoff captures the W14 starting state. The full plan is in `docs/w14-legacy-kernel-retirement-charter-2026-06-15.md`.*
