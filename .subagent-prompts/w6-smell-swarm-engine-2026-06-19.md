# W6 Smell-Swarm — Engine Slice — Semantic Explorer (2026-06-19)

## Role

You are **Worker 1 of 3** in a coordinated bugsweep swarm. **DO NOT EDIT ANY SOURCE FILES.** Your job is to read, analyze, and report smells/bugs/tech-debt in your assigned slice. If you find a fix-worthy issue, document it with file:line; do not patch it. The main lane will synthesize all three reports and decide what to fix.

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

If a finding is already in one of these, mark it **CONFIRMED (known)** with the original finding id. If it is new since 2026-06-07, mark it **NEW**.

## Your Slice — Engine & 3D Lifecycle

### Primary files (READ + ANALYZE)

- `src/lib/engine/three-engine.ts`
- `src/lib/engine/node-manager.ts`
- `src/lib/engine/mycelium-engine.ts`
- `src/lib/engine/three-thread-manager.ts`
- `src/lib/engine/resource-tracker.ts`
- `src/lib/focus/pocket.ts`
- `src/lib/focus/geometry.ts`
- `src/lib/focus/stage-renderer.ts`
- `src/lib/orchestration/app-init.ts`
- `src/lib/orchestration/lifecycle.ts`
- `src/lib/orchestration/view-controller.ts`
- `src/lib/orchestration/event-bus.ts`
- `src/components/Canvas.svelte` (READ ONLY — do not analyze diff; another session owns it)
- `js/workers/data-worker.ts` (active runtime)
- `js/workers/data-worker-url-bridge.ts`
- `js/engine-bootstrap.js` (legacy entry; identify if still wired)

### Off-limits (DO NOT OPEN OR ANALYZE IN DETAIL)

```
M src/components/Canvas.svelte
M src/components/Filters.svelte
M src/lib/orchestration/parity-attrs.svelte.ts
M src/lib/stores/lifecycle.ts
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
2. **Verify against source**: every claim about what a function/file does MUST be checked against the actual source. If you claim `dispose()` releases N textures, count them. **Do not propagate cascading findings without source verification.**
3. **Cite file:line** for every claim. Avoid "may", "could", "possibly" — state what the code does.
4. **Use shell tools for verification** (`git diff HEAD`, `find`, `rg`). In-process reads may return stale data.

## What to Sweep (engine-specific priority)

1. **Resource leaks**: un-disposed textures, geometries, materials, render targets, RAF handles, ResizeObservers, EventListeners on the canvas/window/document.
2. **Three.js lifecycle**: double-init, double-dispose, mount-then-unmount races, RAF requestAnimationFrame handle leaks, requestVideoFrameCallback leaks.
3. **Worker thread leaks**: `data-worker.ts` / `three-thread-manager.ts` postMessage references that survive disposal, transfer-list leaks.
4. **rAF / timer hygiene**: timer pools, setTimeout/setInterval inside geometry, debounced operations that survive HMR, focus-stage debouncers.
5. **Disposal symmetry**: every `init*` should pair with a `dispose*`; `resource-tracker.ts` registrations without unregisters.
6. **Determinism**: any `Math.random()` in geometry/WebGL code (must use `seededUnit()`); any non-deterministic ordering of Float32Array writes.
7. **Focus-pocket stage renderer**: `stage-renderer.ts` overlays, z-index, and stacking-context correctness vs. CSS.
8. **App-init / lifecycle ordering**: are init/dispose calls symmetric? Are there early-return paths that skip cleanup?
9. **Event-bus subscriptions**: leaks when modules unmount; subscriptions without `off()` pairs.
10. **Off-limits touch check**: are any of the off-limits files in your slice? If so, hand them off to main lane — do not analyze.

## Output

Save your findings to **`tmp/smell-engine-2026-06-19.md`** with this structure:

```markdown
# Engine & 3D Lifecycle Smells — 2026-06-19

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
- **No false regressions.** A function that disposes 4 textures is not "missing 1" just because the docstring lists 5. Check the actual code.
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
