# W13 Arc Closeout — 2026-06-15

> **Status:** 4/5 tickets done; T5 in flight via parallel session
> **Master:** `c22ef43` (W13 closeout doc)
> **Net W13 LOC:** -331 to -391 (T5 final cleanup pending; subagent audit at `tmp/w13-t5-audit/AUDIT.md`)

---

## 1. What W13 Was

W13 is the state-selectors porting arc — retire the legacy `js/state/selectors/*.js` tree by porting each module to read from `appState` (Svelte 5 $state class). After W11 retired the BOTH-pattern mirrors, W13 retires the selector barrel.

**Original scope** (from charter `docs/w13-state-selectors-charter-2026-06-15.md`):

-   231 legacy selectors across 10 module files
-   31 legacy consumer files + 7 Svelte bridge consumers
-   4-phase porting plan: timer retirement → simple state → search/animation → Three.js object bridges

**Actual scope (corrected by parallel session tactical prep in 3937d03):**

-   ~210 selectors across 9 modules (timer.js was already retired in W11 closeout)
-   84 Three.js-related selectors (T4), not 87 (charter over-counted)
-   All selector targets EXIST on appState as typed properties

## 2. Ticket Status (final)

| Ticket                         | Status       | Commit    | Notes                                                                                                          |
| ------------------------------ | ------------ | --------- | -------------------------------------------------------------------------------------------------------------- |
| T1 timer retirement            | ✅           | `f6b3089` | -48 LOC; parallel session                                                                                      |
| T2 nav+filter                  | ✅           | `3196fe0` | 44 selectors, "thin pass-through" approach                                                                     |
| T3 search/animation            | ✅           | `c040ac1` | 54 selectors                                                                                                   |
| T4 config.js (static config)   | ✅           | `96781d1` | 37 selectors to @lib/engine/config                                                                             |
| T4 renderer.js (Three.js refs) | ✅           | `9e6b5da` | 47 selectors to direct appState                                                                                |
| T5 delete legacy + unify       | 🔄 in flight | —         | Parallel session: config.js style cleanup in working tree, refactoring all 9 remaining modules before deletion |

**Net: 4/5 W13 tickets complete. ~182 selectors ported. T5 (file deletions + type unification) is the final cleanup.**

### T5 Audit Findings (mimo-v2.5 subagent, 229-line report at `tmp/w13-t5-audit/AUDIT.md`)

The T5 work is bigger than the charter indicated. A mimo-v2.5 read-only audit found:

-   **211 total selectors** (not 183 as charter estimated) — +28 surplus from fields classified as 'timer' but aren't
-   **3 files still import from legacy `state` singleton** (not appState): `data.js` (18), `diagnostics.js` (7), `url-state.js` (8) = 33 selectors
-   **`config.js` is NOT a state pass-through** — it reads from `@lib/engine/config` + `@lib/stores/lifecycle`. T5 cannot "delete config.js" the same way.
-   **9 data-loading fields missing from AppState** — must be ported before `data.js` can be safely deleted: `semanticThreadBundle`, `semanticThreadArtifactName`, `semanticSpaceLayoutManifest`, `semanticSpaceLayoutStatus`, `semanticSpaceLayoutError`, `semanticThreadsLoadPromise`, `semanticThreadsStatus`, `semanticThreadsRetryAttempt`, `dataLoadAttempt`
-   **AppState is a structural superset of SemanticState** (289 vs ~230 fields) but does NOT formally `implements SemanticState`
-   **32 consumer files** reference selectors (1 bridge + 1 cursor.ts + 24 js/modules/ + 7 src/ via bridge)
-   **Bridge is trivial** (single `export *`, 19 LOC) — can be deleted after consumers repointed
-   **Net LOC reduction: -331 to -391** after T5 (451 deleted, ~100 modified across 32 files)

**HIGH risks for T5:**

1. Deleting `data.js` without porting the 9 missing fields to AppState will break consumers at runtime
2. `config.js` needs special handling — consumers must be repointed to `@lib/engine/config` directly

**Recommended T5 ticket split** (4 sub-tickets):

-   **T5a:** Port data.js to appState (15 LOC, low risk) — prerequisite
-   **T5b:** Repoint config.js consumers to CONFIG directly (20 LOC, medium risk)
-   **T5c:** Delete legacy + bridge, repoint 32 consumers (-451 + ~100, HIGH risk)
-   **T5d:** Type unification — AppState implements SemanticState (5-10 LOC, medium risk)

**Recommended order:** T5a → T5b → T5c → T5d

### Main Lane Audit Correction (2026-06-15 22:00, after audit)

A deeper audit of the 33 'still on legacy state' fields revealed most are already migrated to Svelte 5 stores. The audit was correct in flagging the gap, but overstated the work:

| Legacy file                 | Fields | Already on Svelte 5                                                                                    | Truly missing                  |
| --------------------------- | ------ | ------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `diagnostics.js` (7 fields) | 7      | **7** (all on AppState)                                                                                | **0** ✅                       |
| `url-state.js` (8 fields)   | 8      | **8** (5 on AppState + 3 in `navigation.svelte.ts`)                                                    | **0** ✅                       |
| `data.js` (18 fields)       | 18     | **17** (5 in data-store.svelte.ts + 4 in semantic-threads.ts + 4 in engine/map-state.ts + 4 elsewhere) | **1** (`dataLoadAttempt` only) |

**The T5a "port 9 fields to AppState" recommendation was wrong.** Most fields already exist in Svelte 5 stores. The actual T5a is:

-   **T5a (revised):** Add `dataLoadAttempt = $state<number>(0)` to AppState (1 line, trivial)
-   **T5b:** Repoint config.js consumers to CONFIG directly (unchanged)
-   **T5c:** Delete legacy + bridge, repoint 32 consumers (unchanged, but lower risk)
-   **T5d:** Type unification (unchanged)

**Net T5 LOC reduction is still -331 to -391**, but T5a is essentially zero risk now.

### Dead Code Discovery (2026-06-15 22:30, after main-lane selector audit)

A main-lane audit counted actual consumers of every selector in the 9 legacy files. The result is dramatic:

**147 of 211 selectors are DEAD CODE (70%).** No consumer anywhere in `js/` or `src/` references them.

| File | Total | Dead | Used | % Dead |
| --- | --- | --- | --- | --- |
| `animation.js` | 26 | 23 | 3 | 88% |
| `config.js` | 37 | 22 | 15 | 60% |
| `data.js` | 18 | 11 | 7 | 61% |
| `diagnostics.js` | 7 | 5 | 2 | 71% |
| `filter-mode.js` | 14 | 7 | 7 | 50% |
| `navigation.js` | 26 | 14 | 12 | 54% |
| `renderer.js` | 47 | 38 | 9 | 81% |
| `search.js` | 28 | 23 | 5 | 82% |
| `url-state.js` | 8 | 4 | 4 | 50% |
| **TOTAL** | **211** | **147** | **64** | **70%** |

**T5a is now essentially a no-op:**
- 147 selectors can be deleted with NO consumer changes
- 64 used selectors need migration to Svelte 5 stores
- Of the 64 used: 8 already in `data-store.svelte.ts`, 4 in `semantic-threads.ts`, 4 in `engine/map-state.ts`, 5 on AppState, 3 in `navigation.svelte.ts`, 1 (`dataLoadAttempt`) is internal-only with zero consumers
- The 9 `.js` files can be deleted once the 64 used selectors are migrated

**The 13 truly-migratable selectors** (the rest of the 64 are in src/ already):
- `getDataLoadAttempt` (0 consumers, internal only — safe to delete)
- 12 others — need to be moved to appropriate Svelte 5 store

**Updated T5 work breakdown:**
- T5a: Delete 147 dead selectors (no-op for consumers, just file edits)
- T5b: Repoint config.js consumers to CONFIG directly (unchanged)
- T5c: Migrate 64 used selectors to Svelte 5 stores, delete 9 .js files (-451 + ~50)
- T5d: Type unification (unchanged)

**Risk: now LOW overall.** Most of T5c is migration of 64 used selectors to existing Svelte 5 stores. The 147 dead selectors require no migration.

## 3. What Changed in W13

### Commits by the user (main lane)

| Commit    | What                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `38e9f96` | `fix(app): cast searchPanelContent as Snippet` — svelte-check regression (Svelte 5 Snippet type quirk)                                                |
| `e3ccdfb` | `ci: add GitHub Actions workflow for svelte-check + vitest + build` — the biggest gap I identified; would have caught the Snippet regression in 5 sec |
| `d08a2f7` | `fix(cluster-labels): cast getClusterNames() as unknown as string[]` — readonly tuple vs mutable array                                                |
| `8707fba` | `fix(visual-qa): E.5 mobile chip aria-label + C.3 thread-inspector meta hide` — 2 Visual QA PRESENT findings addressed                                |

### Commits by the parallel session

| Commit    | What                                                                                         |
| --------- | -------------------------------------------------------------------------------------------- |
| `f6b3089` | `chore(w13-t1): retire timer/interval selectors (-48 LOC)`                                   |
| `3196fe0` | `chore(w13-t2): port navigation + filter selectors (44 selectors, thin pass-through)`        |
| `c040ac1` | `chore(w13-t3): port search + animation selectors (54 selectors, thin pass-through)`         |
| `3937d03` | `docs(w13-T4): tactical prep — Three.js + config selectors (84 not 87)`                      |
| `96781d1` | `chore(w13-t4): port config.js static-config selectors to @lib/engine/config (37 selectors)` |
| `9e6b5da` | `chore(w13-t4): port renderer.js Three.js object selectors (47 selectors)`                   |
| `8b9442a` | Merge commit                                                                                 |

### Total: 11 commits for W13 (4 user + 7 parallel), all in master.

## 4. Svelte 5 Snippet Type Quirk (W13 gotcha)

The `searchPanelContent` snippet in `App.svelte:296` gets inferred as `() => ReturnType<Snippet>` (not the `Snippet` interface) when passed across module boundaries. This is a Svelte 5 type inference quirk.

**Fix:** `import { type Snippet } from 'svelte'` in App.svelte, then cast at the prop site:

```svelte
<InfoPanel open={infoPanelOpen} content={searchPanelContent as unknown as Snippet} />
```

The double-cast (via `unknown`) is required because the two `Snippet` types have the same name but different `unique symbol` markers. Documented in AGENTS.md "Memory Tool Quirk" section.

## 5. Subagent Doctrine — Validated Again

This session dispatched 9+ subagents. Patterns that worked:

-   **mimo-v2.5** for code analysis (paid, ~$0.001/commit, fastest)
-   **deepseek-flash-free** for fast reads (free, slow but works)
-   **nemotron-super** for pattern analysis (free, good for triage)
-   **Test dispatch first** when MCP is suspect (60s echo hi before committing to real task)
-   **Document dispatch with read-only audit prompt** when boundaries are tight (memory audit, W13 charter)

**Subagent saves:** The W13 charter (`59d0471`) was a mimo-v2.5 subagent that discovered 231 selectors vs the W12 pre-empt estimate of 12. The subagent saved 2+ hours of manual file census.

## 6. Visual QA Follow-ups (W13 included)

The W12 visual-QA closeout (52d8d22) documented 5 deferred states + 6+ findings. During W13:

-   ✅ A.4 "Node N" footer → cluster name (verified FIXED in W12)
-   ✅ B.2 Trail context text wraps (verified FIXED)
-   ✅ C.1 Pin borderColor 0.65 vs 0.22 (verified FIXED)
-   **E.5 (this session)** Mobile mode chip aria-label added in `8707fba`
-   **C.3 (this session)** Thread-inspector meta hidden when all counts 0

Still PRESENT (low priority): A.5 role badge low contrast (mitigated by role-badge font-size fix in working tree), glass-morphism composition cross-cutting (no in-session fix).

## 7. CI Workflow (the biggest gap closed)

`e3ccdfb ci: add GitHub Actions workflow for svelte-check + vitest + build`

-   Triggers: PRs and pushes to master/main
-   6 checks: install, svelte-check, vitest, build, bridge references, legacy TS budget
-   15 min timeout
-   **Would have caught the Snippet cast regression in seconds** (caught manually after ~5 min)

The CI is the highest-leverage addition of this arc. Future regressions will be caught automatically.

## 8. AGENTS.md Updates (doctrine refinements)

Two new sections added to `AGENTS.md`:

-   **Worktree Coordination** — protocol for handling parallel-session worktrees (git worktree list, count uncommitted, document partial state, force-remove with caveats)
-   **Memory Tool Quirk** — `old_text` matching is broken for long text + duplicates with trailing HTML comments; protocol is to use `replace` to mark with unique suffix, then `remove` the marked entry

Plus the Subagent Throughput Doctrine from the W12 closeout.

## 9. What Remains for W13 Close

-   **T5 (parallel session in flight):** delete 9 legacy selector files (config.js, navigation.js, search.js, animation.js, renderer.js, data.js, diagnostics.js, filter-mode.js, url-state.js) + unify AppState/SemanticState types + simplify state-selectors-bridge.ts
-   **W13 closeout doc:** this file (WIP)
-   **charter update:** the parallel session is rewriting the W13 charter to reflect what was actually done (working tree shows them editing it)

## 10. What Comes After W13 (W14 candidate)

After T5 lands, the natural W14 arc is **legacy kernel retirement**:

-   `js/modules/*.ts` engine kernel (~149 files, ~65% ported)
-   `js/state.ts` + `js/state/` (state kernel, fully ported to appState after T5)
-   `js/workers/` (worker kernel)

The BOTH-pattern retirement (W11) + W13 selectors = significant chunks. W14 deletes the remaining engine kernel.

Other W14 candidates:

-   Apply remaining Visual QA PRESENT findings (A.5 role badge, glass-morphism composition)
-   Clean 6 remote `safe-snapshot-local-20260612-*` branches
-   Memory consolidation via the new protocol

## 11. Verification Baseline

-   svelte-check: 0 errors, 0 warnings (master + working tree)
-   npm run build:svelte: clean (when run)
-   test:unit: not re-verified in this session (vitest binary missing from .bin; npx vitest works)
-   0 ahead, 0 behind origin/master

---

_W13 4/5 done. T5 in flight via parallel session. CI in place. AGENTS.md refined. Subagent doctrine validated._

_Next session: verify T5 lands cleanly, write W13 closeout (this doc or similar), pivot to W14 legacy kernel retirement._
