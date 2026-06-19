# Explore-Swarm — W1 Engine & 3D Lifecycle — Semantic Explorer (2026-06-19)

## Role

You are **Worker 1 of 4** in a read-only "explore every nook and cranny" swarm. **DO NOT EDIT, WRITE, OR COMMIT ANY FILES** except your one deliverable report. Your job is to exhaustively read and analyze your assigned slice, surfacing real bugs, smells, dead code, edge cases, resource leaks, determinism issues, lifecycle races, and doc drift. If a finding tempts you to fix it — stop and document it instead. The main lane synthesizes all four reports and decides what to fix.

## Working Directory

`C:\Users\HP\repos\semantic-explorer`

## Pre-existing Sweep Docs (READ FIRST — non-negotiable)

- `docs/archive/semantic-demo-bugsweep-m3-2026-06-07.md`
- `docs/archive/semantic-demo-bugsweep-wave2-2026-06-07.md`
- `docs/archive/semantic-demo-bugsweep-wave3-2026-06-07.md`
- `docs/archive/semantic-demo-bugsweep-wave4-2026-06-07.md`
- `tmp/bridge-retirement-audit-2026-06-19.md` (most recent W5/W6 work)
- `tmp/bridge-audit-2026-06-18.md`

If a finding already appears in one of these, mark it **CONFIRMED (known)** with the original id. If it is new since 2026-06-07, mark it **NEW**.

## Dirty-file policy (a parallel session is editing these right now)

These files are modified in the working tree. You MAY read them, but **any finding rooted in their current contents must be tagged `NEEDS-RECHECK (file dirty)`** — the parallel session may be mid-edit, so the finding could be stale:

```
src/components/Canvas.svelte
src/lib/orchestration/parity-attrs.svelte.ts
```

(`Canvas.svelte` is owned by Worker W3; reference it for engine-mount wiring but do NOT deep-analyze its internals.)

## Your Slice — Engine & 3D Lifecycle (READ + ANALYZE)

- `src/lib/engine/three-engine.ts`
- `src/lib/engine/node-manager.ts`
- `src/lib/engine/mycelium-engine.ts`
- `src/lib/engine/three-thread-manager.ts`
- `src/lib/engine/resource-tracker.ts`
- `src/lib/engine/config.ts`, `webgl-context.ts`, `state-bridge.ts`, `map-state.ts`, `search-state-bridge.ts`
- `src/lib/focus/pocket.ts`, `geometry.ts`, `stage-renderer.ts`
- `src/lib/orchestration/app-init.ts`, `lifecycle.ts`, `view-controller.ts`, `event-bus.ts`, `triggers.ts`, `parity-attrs.svelte.ts` (NEEDS-RECHECK)
- `js/workers/data-worker.ts` (active runtime)
- `js/workers/data-worker-url-bridge.ts`
- `js/engine-bootstrap.js` (legacy entry — identify if still wired / dead)

## Methodology

1. **Adversarial review**: for every candidate finding ask "what would make this wrong?", "what edge case am I missing?", "what does the evidence NOT support?"
2. **Verify against source**: every claim about what a function/file does MUST be checked against actual source. If you claim `dispose()` releases N textures, count them. Do not propagate cascading findings without source verification. Use `git diff HEAD -- <path>`, `rg`, `find` to verify.
3. **Cite file:line** for every claim. Avoid "may/could/possibly" — state what the code does.
4. **Read every function** in the slice — "every nook and cranny" means exhaustive, not sampled.

## Priority sweep targets (engine)

1. Resource leaks: un-disposed textures, geometries, materials, render targets, RAF handles, ResizeObservers, listeners on canvas/window/document.
2. Three.js lifecycle: double-init, double-dispose, mount/unmount races, RAF handle leaks.
3. Worker thread leaks: `data-worker.ts` / `three-thread-manager.ts` postMessage refs that survive disposal, transfer-list leaks.
4. rAF/timer hygiene: timer pools, setTimeout/setInterval in geometry, debounced ops that survive HMR, focus-stage debouncers.
5. Disposal symmetry: every `init*` pairs with a `dispose*`; `resource-tracker.ts` registrations without unregisters.
6. Determinism: any `Math.random()` in geometry/WebGL (must use `seededUnit()`); non-deterministic Float32Array write ordering.
7. The `getPointBoundsCenter(state.points, rawPositionsBuffer)` invariant — confirm the raw buffer is always passed (AGENTS.md flags this as critical).
8. Event-bus subscriptions: leaks on unmount; subscriptions without `off()` pairs (see `triggers.ts` TOOLTIP_HIDE_REQUESTED no-op — is it actually dead now?).
9. App-init/lifecycle ordering: symmetric init/dispose? early-return paths that skip cleanup?
10. Dead code: `engine-bootstrap.js` and any bridge still pointing at deleted `js/modules/*` (recent commit `0dddabc` repointed 47 tests away from deleted paths — check for stragglers).

## Output

Save findings to **`tmp/explore-w1-engine-report.md`** with this structure:

```markdown
# Engine & 3D Lifecycle — Exploration Report (2026-06-19)

## Summary
- Total findings: N (H HIGH, M MEDIUM, L LOW)
- Net-new: N | Confirmations: M | NEEDS-RECHECK (dirty): K
- Top 3 risks: ...

## Cross-reference to prior sweeps
| Finding | Prior ref | Status |
| --- | --- | --- |
| ... | m3-2026-06-07 H2 | CONFIRMED (still present) |
| ... | (none) | NEW |

## HIGH
### H1: <title>
- File: <path>:<line>
- Verified against source: <function/line range>
- Evidence: <quote or describe>
- Impact: <user-facing or architectural>
- Suggested fix (1 sentence, do not apply)

## MEDIUM / ## LOW  (same shape)

## Verification Notes
- Files actually opened: ...
- Findings rejected after source check: ...
- Open questions for main lane: ...
```

## Constraints

- **No edits.** No `npm run build`/`npm test` (you are read-only). If you need a build verified, report it to main lane.
- **No false regressions.** A function disposing 4 textures is not "missing 1" because a docstring lists 5. Check the actual code.
- **No speculation.** If you cannot verify a claim against source, drop it or mark "unverified".
- **Wall budget: 1200s (20 min).** Be exhaustive; do not race.

## Return

Return a text summary (≤200 words): (1) report path, (2) counts by severity + NEW/known/needs-recheck split, (3) top 3 issues by impact, (4) cross-cutting patterns the other three workers should know about.
