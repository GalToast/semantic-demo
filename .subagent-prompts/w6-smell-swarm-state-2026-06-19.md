# W6 Smell-Swarm — State/Data Slice — Semantic Explorer (2026-06-19)

## Role

You are **Worker 2 of 3** in a coordinated bugsweep swarm. **DO NOT EDIT ANY SOURCE FILES.** Your job is to read, analyze, and report smells/bugs/tech-debt in your assigned slice. If you find a fix-worthy issue, document it with file:line; do not patch it. The main lane will synthesize all three reports and decide what to fix.

You are part of a "thorough accounting" pass: main lane wants a clear net-new vs. already-known split across the engine, state/data, and UI/chrome seams.

## Working Directory

`C:\Users\HP\repos\semantic-explorer`

## Pre-existing Sweep Docs (READ FIRST — non-negotiable)

- `docs/archive/semantic-demo-bugsweep-m3-2026-06-07.md`
- `docs/archive/semantic-demo-bugsweep-wave2-2026-06-07.md`
- `docs/archive/semantic-demo-bugsweep-wave3-2026-06-07.md`
- `docs/archive/semantic-demo-bugsweep-wave4-2026-06-07.md`
- `tmp/bridge-retirement-audit-2026-06-19.md` (most recent W5/W6 work)
- `tmp/bridge-audit-2026-06-18.md`
- `AGENTS.md` (repo-local rules)

If a finding is already in one of these, mark it **CONFIRMED (known)** with the original finding id. If it is new since 2026-06-07, mark it **NEW**.

## Your Slice — State, Stores, Data, Search

### Primary files (READ + ANALYZE)

- `src/lib/state/app.svelte.ts` (Svelte 5 global state — source of truth)
- `src/lib/state/state-types.ts`
- `src/lib/stores/*.ts` (with the OFF-LIMITS exception below)
- `src/lib/data-store.ts`
- `src/lib/data-loader.ts`
- `src/lib/semantic-threads.ts`
- `src/lib/search-engine.ts`
- `src/lib/search/index.ts`
- `src/lib/search/tokenizer.ts`
- `src/lib/search/scoring.ts`
- `src/lib/search/orchestration.ts`
- `src/lib/view-models/**` (read fully)
- `src/lib/types/**` (read fully)
- `src/lib/orchestration/parity-attrs.svelte.ts` (READ ONLY — do not analyze diff; another session owns it)
- `src/lib/orchestration/app-init.ts` (shared with engine worker — focus on state init paths only)
- `src/lib/orchestration/lifecycle.ts` (shared with engine worker — focus on state teardown only)
- `js/state.js` (legacy state-writer — find any remaining direct DOM/state writes)
- `js/modules/app.js` (legacy app wiring)
- `js/modules/lifecycle.js` (legacy lifecycle)
- `js/modules/journey.js`, `js/modules/journey-compass-state.js`, `js/modules/focus-pocket.js`, `js/modules/ui-renderers.js` (legacy state writers still in active use)

### Off-limits (DO NOT OPEN OR ANALYZE IN DETAIL)

```
M src/components/Canvas.svelte
M src/components/Filters.svelte
M src/lib/orchestration/parity-attrs.svelte.ts
M src/lib/stores/lifecycle.ts          (parallel session owns)
M tests/cluster-filter-city-filter-side-effect-contract.mjs
M tests/cluster-filter-contract.mjs
M tests/cluster-filter-dewindowing-contract.mjs
M tests/composition-state-invariant-contract.mjs
M tests/journey-thread-inspector-contract.mjs
M tests/lifecycle-composition-contract.mjs
M tests/step-inside-state-sync-contract.mjs
M tests/surface-contract-check.mjs
M tests/thread-inspector-dewindowing-contract.mjs
M tests/verify-svelte-migration.mjs
M vite.config.ts
?? tmp_check_dive.mjs, tmp_check_dive2.mjs, tmp_check_dive3.mjs, tmp_check_search.mjs, tmp_lc_diag.mjs
```

## Methodology

1. **Adversarial review**: for every candidate finding, ask "what would make this wrong?", "what edge case am I missing?", "what does the evidence NOT support?"
2. **Verify against source**: every claim about what a function/file does MUST be checked against the actual source.
3. **Cite file:line** for every claim. Avoid "may", "could", "possibly" — state what the code does.
4. **Use shell tools for verification** (`git diff HEAD`, `find`, `rg`). In-process reads may return stale data.

## What to Sweep (state/data-specific priority)

1. **Svelte 5 state-class correctness**: `app.svelte.ts` field declarations, `$state` vs. `$derived` boundaries, mutation paths through `withStateMutation()` or equivalent, and any direct field writes that bypass the mutation helper. Per the most recent CHANGELOG there's a wave of `!==` → `===` conversions in reactive contexts; verify they're done consistently and not creating new equality bugs.
2. **Bridge retirement audit follow-up**: `tmp/bridge-retirement-audit-2026-06-19.md` and the recent commit `282e7df refactor(bridges): retire wave 2 — 5 candidates` retired 5 bridges. Audit: (a) any remaining `toStore()`-bridged stores that could be migrated to writable + notify wrappers per the `tostore-migration-pattern` skill; (b) any remaining dual-track drifts where a `src/lib/stores/*.ts` and `js/modules/*.js` both own the same logical state.
3. **Proxy / reactivity traps**: Svelte 5 proxy traps that lose identity; `Map`/`Set` mutations that don't trigger reactivity; array methods (`push`, `splice`) inside `$derived` or non-mutation contexts.
4. **State proxy & withStateMutation gaps**: every `TRACKED_SUB_KEYS` write that bypasses `withStateMutation()` (per the m3 sweep).
5. **Search pipeline**: tokenizer/scoring determinism; `search-engine.ts` re-index correctness; index invalidation on data changes; race between `data-loader.ts` and `search-engine.ts` initialization.
6. **Data loader races**: 8,406-point mycelium data, AbortController usage, transfer-list usage in worker postMessage.
7. **Event-bus subscriptions**: leaks when stores/modules unmount; subscriptions without `off()` pairs.
8. **Legacy JS state writers still in active use**: any `js/state.js` / `js/modules/*.js` write path that mutates shared state without going through the canonical src/ state class. List them with file:line and whether they should migrate to TS.
9. **Contract test failures**: known pre-existing failures (`thread-inspector`, `field-node`, `search-no-results`, `compass-rail`, `focus-pocket`, `info-panel-empty`, `mode-grid`). Are these real or stale? Are they on the off-limits list (don't re-run) or elsewhere (report)?
10. **i18n / hardcoded strings**: any new user-facing string added without i18n registration (per Global PQ Sweep 2026-06-06).
11. **Off-limits touch check**: are any of the off-limits files in your slice? If so, hand them off to main lane — do not analyze.

## Output

Save your findings to **`tmp/smell-state-2026-06-19.md`** with this structure:

```markdown
# State & Data Smells — 2026-06-19

## Summary

- Total findings: N (X HIGH, Y MEDIUM, Z LOW)
- Net-new (not in prior sweeps): N
- Confirmations of prior findings: M
- Top 3 risks: ...

## Cross-reference to prior sweeps

| Finding | Prior sweep ref  | Status                    |
| ------- | ---------------- | ------------------------- |
| ...     | m3-2026-06-07 H2 | CONFIRMED (still present) |
| ...     | (none)           | NEW                       |

## HIGH

### H1: <title>

- File: <path>:<line>
- Verified against source: <function/line range>
- Evidence: <quote or describe>
- Impact: <user-facing or architectural>
- Suggested fix (1 sentence, do not apply)

## MEDIUM

...

## LOW

...

## Verification Notes

- Files actually opened: ...
- Findings rejected after source check: ...
- Open questions for main lane: ...
```

## Constraints

- **No edits.** If a finding tempts you to "just fix it", stop. Document and return.
- **No false regressions.** A function that creates 4 elements is not "missing 1 element" just because the docstring lists 5. Check the actual code.
- **No speculation.** If you cannot verify a claim against source, drop it or mark it "unverified".
- **Do not duplicate** prior wave docs unless you have _new_ evidence.
- **Do not open or modify** anything in the off-limits list above.
- **Do not run `npm run build` or `npm test`** — you are read-only. If you need to verify a build, report it to main lane instead.
- **Wall budget: 3600s (1 hour).** Use the time to be thorough; do not race.

## Return

Return a short text summary (≤200 words) with:

1. Path to your findings doc
2. Total count by severity, with net-new vs. known split
3. Top 3 issues by impact
4. Any patterns or cross-cutting concerns that the other two workers should know about
