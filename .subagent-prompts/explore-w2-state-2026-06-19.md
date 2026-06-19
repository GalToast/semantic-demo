# Explore-Swarm — W2 State, Stores, Data & Search — Semantic Explorer (2026-06-19)

## Role

You are **Worker 2 of 4** in a read-only "explore every nook and cranny" swarm. **DO NOT EDIT, WRITE, OR COMMIT ANY FILES** except your one deliverable report. Exhaustively read and analyze your slice for real bugs, smells, dead code, edge cases, state-transition errors, race conditions, cache bugs, and doc drift. If a finding tempts you to fix it — stop and document it instead. The main lane synthesizes all four reports and decides what to fix.

## Working Directory

`C:\Users\HP\repos\semantic-explorer`

## Pre-existing Sweep Docs (READ FIRST — non-negotiable)

- `docs/archive/semantic-demo-bugsweep-m3-2026-06-07.md`
- `docs/archive/semantic-demo-bugsweep-wave2-2026-06-07.md`
- `docs/archive/semantic-demo-bugsweep-wave3-2026-06-07.md`
- `docs/archive/semantic-demo-bugsweep-wave4-2026-06-07.md`
- `docs/semantic-demo-state-transition-table.md`
- `tmp/bridge-retirement-audit-2026-06-19.md`
- `tmp/bridge-audit-2026-06-18.md`
- `tmp/w44-compression-cache-audit.md`

If a finding already appears, mark **CONFIRMED (known)** with the id. If new since 2026-06-07, mark **NEW**.

## Dirty-file policy (parallel session is editing these right now)

You MAY read these, but findings rooted in their current contents must be tagged **`NEEDS-RECHECK (file dirty)`**:

```
src/lib/stores/engine-ready.svelte.ts
src/lib/audio/audio-scape.ts
```

## Your Slice — State, Stores, Data & Search (READ + ANALYZE)

- `src/lib/state/app.svelte.ts` (Svelte 5 rune-class global state — SOURCE OF TRUTH; read fully)
- `src/lib/state/state-types.ts`, `with-state-mutation.ts`
- `src/lib/stores/*.svelte.ts` and `*.ts` (with the dirty-file caveat above)
- `src/lib/data-store.ts`, `data-store.svelte.ts`, `data-loader.ts`
- `src/lib/semantic-threads.ts`
- `src/lib/search-engine.ts`, `search-cache.ts`
- `src/lib/search/index.ts`, `tokenizer.ts`, `scoring.ts`, `orchestration.ts`, `mapper.ts`, `results-ui.ts`, `legacy-exports.ts`
- `src/lib/view-models/**` (read fully)
- `src/lib/audio/audio-scape.ts` (NEEDS-RECHECK)

## Methodology

1. **Adversarial review**: for every candidate ask "what would make this wrong?", "what edge case am I missing?"
2. **Verify against source**: every claim checked against actual code. Use `git diff HEAD -- <path>`, `rg`, `find`.
3. **Cite file:line**. Avoid "may/could/possibly" — state what the code does.
4. **Read every exported function** in the slice — exhaustive, not sampled.

## Priority sweep targets (state/data/search)

1. **State-source-of-truth integrity**: `app.svelte.ts` fields vs `js/state.ts` `_rawState` drift; the comment claims "all 289 fields" — count and flag any missing/mismatched fields. The recent W6-wave3 commit consolidated state ownership; verify no field has two owners.
2. **Svelte 5 rune correctness**: `$state` mutation outside runes context, `$derived`/`$effect` ordering, `.svelte.ts` files using stores-vs-runes inconsistently, `$state` arrays/Maps mutated non-reactively.
3. **State-transition soundness**: compare against `docs/semantic-demo-state-transition-table.md` — any transition reachable but not tabled, or tabled but unimplemented?
4. **withStateMutation wrapper**: does it guard/audit every mutation? Any field bypassing it?
5. **Search correctness**: tokenizer edge cases (empty/unicode/very-long), scoring rank stability, result caching key collisions (see `tmp/w44-compression-cache-audit.md`), abort-controller leaks, stale-result races.
6. **Async/timer hygiene**: search timeouts, abort controllers, intervals — all cleared on teardown? Any `searchVectorScrambleInterval`/`semanticLaneOpsRefreshTimer` style timers that can double-fire?
7. **Data loading**: `data-loader.ts` / `data-store.ts` bounds — what if `data.dat` is short/malformed? Any unchecked index into `state.rawPositionsBuffer` (Float32Array) that could read past the end?
8. **Bridge gaps**: any `@ts-ignore` / `eslint-disable` masking a real type hole in the JS→TS migration (note them with severity).
9. **Dead code**: legacy exports (`search/legacy-exports.ts`) still imported anywhere? Stragglers pointing at deleted `js/modules/*`.

## Output

Save to **`tmp/explore-w2-state-report.md`** with the same structure as the other workers:

```markdown
# State, Stores, Data & Search — Exploration Report (2026-06-19)
## Summary  (counts + NEW/known/needs-recheck split + top 3 risks)
## Cross-reference to prior sweeps  (table)
## HIGH / ## MEDIUM / ## LOW  (each finding: File:line, Verified, Evidence, Impact, 1-sentence fix)
## Verification Notes
```

## Constraints

- **No edits.** No `npm run build`/`test`. Read-only.
- **No false regressions.** Verify before claiming. No speculation — mark unverified or drop.
- **Wall budget: 1200s (20 min).** Be exhaustive.

## Return

Text summary (≤200 words): (1) report path, (2) severity counts + NEW/known/needs-recheck, (3) top 3 by impact, (4) cross-cutting patterns for the other three workers.
