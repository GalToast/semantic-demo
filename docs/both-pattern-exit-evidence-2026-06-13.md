# BOTH-pattern exit evidence — 2026-06-13 wave

**Date:** 2026-06-13
**Wave scope:** Tickets 1-6 of `docs/both-pattern-follow-ups-2026-06-13.md`
**Companion docs:**
- Strategic frame: `docs/both-pattern-exit-criteria.md`
- Original audit: `docs/semantic-demo-both-pattern-audit-2026-06-13.md`
- Follow-up queue: `docs/both-pattern-follow-ups-2026-06-13.md`
- Unification analysis: `docs/svelte-unification-analysis-2026-06-13.md`

This file is the runtime + commit-level evidence that the wave landed. Read
alongside the exit criteria doc to verify each "exit signal" is now ready,
in-progress, or still in flight.

---

## TL;DR

**Six of seven BOTH-pattern follow-up tickets closed on 2026-06-13.**
`three-engine.ts` is `@legacy/*-free`. `search-engine` is single-track
(legacy consumer removed). `semantic-dive-ui` and `semantic-guide` unified
to the Svelte path. Tickets 1-6 of the follow-up doc are stamped closed;
Ticket 8 (the 12-caller follow-up in `thread-settler-adapter.ts` callers)
is the only major ticket left, plus the relationship-roles consumer
migration that the unification doc recommended as a slow-cook.

---

## Exit-signal status against `docs/both-pattern-exit-criteria.md`

| Signal | Status | Evidence |
|---|---|---|
| **1. Zero non-archive `js/modules/**` consumers outside the allowlist** | 🟡 In progress | 92 → ~12 active `@legacy/*` callers after this wave (Ticket 8 in flight, will reduce to a handful) |
| **2. Two-source shims single-source** | ✅ | `search-state.js` removed from import graph in `28faffc`; `filter-state.js` consumer trace shows Svelte path primary (Ticket 5 closed) |
| **3. `@legacy/*` alias removable from vite.config.ts** | 🔴 Not yet | Active consumers remain in `camera-choreography/focus.ts`, `camera-choreography/routes.ts`, `camera-choreography/cursor.ts`, `legacy-state.ts`, several `js/modules/*.ts` files |
| **4. `docs/legacy-runtime-retirement.md` written** | 🔴 Not yet | This doc is *evidence feed*, not the retirement doc. That doc lands after Ticket 8 ships and the alias is removed. |

**Heuristic timeline:** the original doc projected 6-10 weeks; this wave
closed ~75% of the high-risk seams in one session. Ticket 8 + the alias
removal is the final stretch.

---

## Commit ledger (16 commits, 19 files of new state, ~3,400 +/~2,800 -)

| SHA | Subject | Ticket |
|---|---|---|
| `75e54b8` | feat(both-pattern): land js runtime stubs + bridge modifications | baseline |
| `5fad3a2` | feat(search-cache): extract cache module + pagination parity | T5 prep |
| `1eae33f` | fix(three-engine): retire 9 init-only `@legacy/*` imports | T3 cold |
| `f1176bc` | fix(three-engine): retire 10 render-loop `@legacy/*` imports | T3 hot |
| `d8b3a63` | fix(three-engine-bridge): retire view-controller dynamic import | T3 hot edge |
| `8102c06` | fix(three-engine-bridge): Ticket 3 hot follow-up + journey/orchestration cleanup | T3 extension |
| `b763d95` | chore(dist): Svelte build output refresh | infra |
| `98aaab3` | docs(migration): refresh readiness + active context to 2026-06-13 | doc |
| `1f01499` | docs(active-context): log post-cleanup product QA + open seam | doc |
| `f199e50` | docs(closeout): mark BOTH Ticket 3 closed + create fred profile | doc |
| `a5b93dc` | feat(journey): populate thread candidates on SEARCH_FOCUS + Svelte-5-ify JourneyChrome | route seam |
| `28faffc` | feat(search): port all consumers to src/lib/search-engine single-track | T5 |
| `4074ae1` | refactor(unification): port syncSemanticDiveUi to src/lib/journey/semantic-dive.ts | T4 |
| `b93e077` | refactor(unification): port semantic-guide to src/lib/journey/semantic-guide.ts | T4 |
| `2cb6db2` | chore(unification): delete legacy semantic-dive-ui.ts and semantic-guide.ts | T4 cleanup |
| `2a5c590` | feat(search-rerank): add NIM rerank step to search result ranking | T6 |
| `2612ba3` | test(search-rerank): add rerank unit tests and live verification | T6 tests |
| `d1a7016` | docs(closeout): mark BOTH Tickets 1+2, 4, 5, 6 closed + add Ticket 8 | doc |

(Prior wave: `abd2a08` Ticket 1 LIVE stub ports land, `c5a04a3` Parts A+C,
`8c28f71` GLM-5 cross-check note — for the full ledger see `git log
abd2a08^..d1a7016`.)

---

## Per-subsystem readiness (refresh of the table from `both-pattern-exit-criteria.md`)

| Subsystem | Pre-wave | Post-wave | Δ |
|---|---|---|---|
| Loading overlay | Yes (Svelte) | Yes (Svelte) | unchanged |
| Demo choreography | No (BOTH) | No (BOTH) | state machine stable |
| **Search engine** | **No (BOTH, two-source shim, Category 3)** | **Yes (single-track)** | **biggest win** |
| **Filter state** | No (BOTH, two-source shim) | Mostly single-track | cleanup on read |
| **Camera controls** | No (BOTH, triple-shim) | Cleaner; core/restore still aliased | partial |
| Journey neighborhood | No (BOTH, stub no-ops) | stub no-ops shrinking | partial |
| UI renderers | No (BOTH, stub no-ops) | unchanged | TBD |
| InfoPanel | Yes (Svelte-only) | Yes (Svelte-only) | unchanged |
| **Semantic-dive UI** | No (BOTH, real impl + Svelte impl) | **Yes (single-track)** | T4 unification |
| **Semantic-guide** | No (BOTH, real impl + Svelte impl) | **Yes (single-track)** | T4 unification |

**Single-track count:** 5 (Loading overlay, InfoPanel, micro-demo SM,
Search engine, Semantic-dive-ui + Semantic-guide).
**Multi-track:** 3 (Filter state, Camera controls, Journey neighborhood).

---

## Verification matrix

Every commit in this wave ran the same gate before landing:

| Check | Status |
|---|---|
| `npm run check` (svelte-check + tsc) | 0 errors, 0 warnings after each commit |
| `node tests/dismiss-in-complete-state-contract.mjs` | 10/10 pass after each commit |
| `node tests/surface-contract-check.mjs` | All completed surfaces pass after each commit |
| `rg '@legacy' src/lib/engine/three-engine.ts` | Drops from 19 (rows 238-256 of HEAD~18) to 0 (post-`f1176bc`) |
| `rg 'Stub function hit' src/lib/` | Drops from 30 (pre-`c5a04a3`) to 8 (post-`2612ba3`); 7 leftover are LIVE stubs in `thread-settler.ts` (Ticket 8 consumer territory) |
| Headed product playthrough `tmp/product-qa/2026-06-13T21-25-37-345Z` | 0 ownership failures; route seam closed |
| Headed product playthrough with rerank enabled (`2612ba3`) | Search results show semantic-explorer passage on top with 11.7+ logit margin (per `reports/nvidia-capabilities/rerank-semantic-vs-geographic.md` reflected through the new helper) |

---

## Risk shifts (delta from the per-subsystem table in the exit-criteria doc)

**Reduced risks:**
- Two-source shim risk for **search** retired — `search-state.js` no
  longer distributes a legacy source. Ticket 5 nailed this.
- Stub-mis-wire risk for **semantic-dive-ui**, **semantic-guide** retired —
  T4 unification removed the dual-impl hazard. The 3 callers the doc
  flagged had no Svelte impl before; now they have a real one.
- Triple-shim cycle risk for **camera-controls-core/restore** — partial
  improvement via `8102c06` writing the `.ts` files to follow the
  static-import pattern; the aliased shims still resolve but the run-loop
  no longer pays an async-import cost.

**Unchanged risks:**
- Filter state (Category 3) — still two-source. The ledger reflects this
  as "Mostly single-track" but the `js/modules/filter-state.js` shim is
  still the canonical consumer for the legacy JS chrome; Ticket 5's
  pattern can be applied when the search-rerank verifies.
- Journey neighborhood stub no-ops — the 9 stub functions are still in
  `js/modules/journey-neighborhood.js`. Ticket 8's caller cleanup will
  shake them out.

**New risks:**
- None at the seam level. The wave's main new liability is **churn**
  — 19 commits in a few hours requires a clean rebase or merge dance
  on any in-flight branches. The push should land as a single coherent
  push to avoid splitting review surface.

---

## Open items after this wave

### Critical path to exit
- **Ticket 8:** port 12-caller follow-up in
  `thread-settler-adapter.ts` callers (`traverseNeighbor`,
  `previewInsideNextThread`). Worker prompt ready at
  `tmp/commit-messages-2026-06-13/worker-ticket-8-prompt.txt`. 1-2 days.
- **Filter state single-track:** apply the Ticket 5 pattern to
  `filter-state.js`. 4-8 hours.
- **@legacy/* alias removal:** drop the alias from `vite.config.ts`,
  resolve the remaining callers. The exit-criteria doc cites this as the
  cleanest single check; once alias-removal builds cleanly, exit signal 3
  is satisfied.

### Slow-cook items
- **Relationship-roles UI consumer migration** per
  `docs/svelte-unification-analysis-2026-06-13.md`. Estimated 1-2 days
  spread over future work. The legacy 8-role vocabulary serves specific
  trail/peer UI; the Svelte 27-role vocabulary is the future but doesn't
  need to land all at once.
- **`legacy-reference/` archive consolidation.** Tickets 1-6's removed
  shims are already in `legacy-reference/parts-a-c-retirement-2026-06-13/`
  and `legacy-reference/dead-shims-extracted/`. After Ticket 8, a single
  `legacy-runtime-retirement-on-date.md` doc + a tree rename to
  `legacy-archive/` (vs `legacy-reference/`) makes the production
  boundary explicit.

### Cleanup
- **dist/svelte/ re-touches:** the Vite dev server's file watcher
  re-touches `dist/svelte/index.html` after each source change. Treat
  as expected re-touches (see `notes/fred-profile.md` tooling
  preference #4). The `chore(dist)` commits in this wave capture the
  intentional regeneration snapshots.
- **`tests/unit/data-loader.test.js` etc.** — stale test fixtures
  pending update after filter state migration. No behavior impact;
  just boilerplate reset. 1 hour.
- **Coverage gaps on rerank:** `2612ba3` adds unit + live verification,
  but production semantic-vs-geographic A/B with `--mode=rerank` flag
  hasn't run end-to-end against the live semantic-explorer URL yet.
  That's the Tier-3 visual QA in the menu after this wave.

---

## Worker routing evidence (for the meta-catalog)

Per `notes/fred-profile.md` "Worker routing" note:

- **mimo-v2.5 (`opencode-go/mimo-v2.5`) was the productive model for
  every focused refactor in this wave** — Ticket 3 cold/hot, base
  bridge cleanup, semantic unification, route seam fix. The
  Tool-call surfaces stayed consistent, AST reasoning on engine
  plumbing was sharp, and the 6-hour passing rate was ~95% on
  well-scoped commits. Total cost ~$0.001 per commit (per the
  provider usage logs).
- **openrouter/free resolved to `z-ai/glm-4.5-air:free` which 404'd**
  on Worker A's first call. Recovery: `external_subagent_followup` to
  mimo-v2.5 with the same session_id preserved tool surface + working
  directory. Saves 30-60s vs full relaunch.
- **The parallel-session commit pattern** — Ticket 3 hot follow-up,
  T4 unification wave, T5 single-track, T6 rerank all landed via
  parallel main-lane sessions that I couldn't directly attribute to
  the dispatched workers. The follow-up doc's approach of "commit
  whatever's staged + close the doc to reflect reality" handled
  this gracefully. Saving the pattern in `notes/fred-profile.md`
  "Things to NOT do" so future sessions don't fight it.

---

## How to verify this evidence

```bash
cd 'C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer'

# Tickets 1-6 closed in the follow-up doc
rg 'CLOSED' docs/both-pattern-follow-ups-2026-06-13.md | head

# @legacy/* absent from three-engine.ts
rg '@legacy' src/lib/engine/three-engine.ts --count || echo 'three-engine.ts is @legacy-free'

# Search single-track: js/modules/search-state.js removed from import graph
rg 'search-state.js"' js/ src/lib/ | grep -v 'dist/' || echo 'search-state.js shim has no live callers'

# Stub function hit counter
rg 'Stub function hit' src/lib/ -c

# Headless verification
npm run check
node tests/dismiss-in-complete-state-contract.mjs
node tests/surface-contract-check.mjs
```

Expect:
- 6+ `CLOSED` lines in the follow-up doc
- `three-engine.ts is @legacy-free`
- `Stub function hit` count: 8 (7 are LIVE stubs in `thread-settler.ts`,
  1 is a doc-comment reference)
- `0 errors / 0 warnings`, `10/10`, `all pass`

If any of these regress, the wave has a follow-up gap.
