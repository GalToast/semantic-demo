# Next-session seam prompt

## Current state (2026-06-15, post-W11 arc)

**Branch:** `master` tracking `origin/master`
**Working tree:** 8 files modified by parallel session (a11y + focus-pocket work) — DO NOT commit until parallel session quiesces.

### W11 scorecard (updated 2026-06-15)

| Ticket | Status | Commits |
|---|---|---|
| T1 State kernel Svelte 5 | ✅ | `9a67a63` |
| T2 thread-manager | ✅ | `da0e283` |
| T3 map-state | ✅ | `5f8494d` |
| T4 stores → writable+notify | ✅ | `1989d9d` |
| T5 camera subsystem | ✅ | `ccd0b1a` |
| T6 lifecycle → triggers | ✅ | `7e77160`, `99b68e3`, `e67d796` |
| T7 focus subsystem | ✅ | `9128d2b` |
| T8 search subsystem | ✅ | `9128d2b` |
| T9 journey subsystem | ✅ DONE | 4 waves, see `docs/w11-arc-closeout-2026-06-15.md` |
| T10 render loop thinnability | 🔄 Prep done | See `docs/w11-t10-thinnability-strategy.md` |
| T11 build:legacy retirement | ✅ DONE | data-worker port (`70d0b5e`), build:legacy removed (`22d4833`), dist/bundle.js gitignored (`e9f9d49`) |

### What remains to close W11

- **T10 Wave 10a** (state reads in animate() — 15-20 LOC mechanical, LOW risk)
- **T10 Wave 10b** (state writes in animate() — 5-10 LOC, MEDIUM risk, needs profiling)
- **T10 Wave 10c** (optional, per-frame callee state I/O — 30-50 LOC, HIGH risk)
- After T10: W11 arc CLOSED

### Recommended next session

1. **Wait for parallel session to quiesce** (8 dirty-tree files from a11y + focus-pocket work)
2. **T10 Wave 10a** — mechanical state.X → appState.X reads in animate(). Single-file change: `js/modules/three-engine.ts`. ~20 min worker.
3. **T10 Wave 10b** — withStateMutation removal. Same file. Profile before/after.
4. **Post-W12 arc planning** (see next section)

## Post-W12 arc: recommended seams

After W11 closes, the next strategic seams are:

1. **Bridge file retirement audit** — Run `scripts/check-bridge-references.mjs`. For each `src/lib/engine/*-bridge.ts` with 0 `js/` imports, either in-line the re-export or delete. Then run `npm run check:bridges` to verify.

2. **CSS mobile cascade ownership** — Audit `css/mobile_premium__*.css` for dead rules. The Svelte components have scoped styles that may have superseded some global CSS. For each mobile_premium rule, check: does it still affect live computed geometry? If no, delete.

3. **Visual QA backlog** — 4 deferred interaction states (focus, trail, journey) from the v1.32 bugsweep. Use headed Playwright + agent-browser skill to drive interactions and capture screenshots.

4. **!important cleanup pass** — `docs/semantic-demo-css-ownership-next-pass.md` lists outstanding !important declarations. Audit each: can it be resolved with scoped styles + specificity?

5. **Legacy reference directory decision** — `legacy-reference/js-both-shadows-2026-06-13/` has 50 archived .js files. Not referenced by build. Decide: keep as frozen reference, move outside repo, or git rm.

6. **50 legacy ts errors** — `svelte-check` reports 50 errors in `js/modules/*.ts`. These are real type errors in the engine kernel. Create a `npm run check:legacy-budget` that fails if the count exceeds a threshold, creating a one-way ratchet.

## Worker lessons (carry forward)

- **Live steer is the actual mitigation for worker off-seam drift**. Prompt language is insufficient.
- **Pre-emption sweep is mandatory** before planning any port. Check `src/lib/orchestration/*.ts` and `src/lib/journey/*.ts` for existing Svelte 5 ports.
- **Test anti-pattern**: don't relax tests to make them pass, unless the test was tied to old code that legitimately changed.
- **Followup session gotcha**: the new session doesn't fully inherit context. Kill original worker PID before followup dispatch.

## Verification status

- svelte-check: 0 errors in `src/` code (50 errors in legacy `js/modules/*.ts`)
- vitest: 641/641 tests passing
- npm run build: clean
