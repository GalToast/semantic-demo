# Wave 11 — Engine Port Plan (2026-06-14)

**Status:** W11-T1 ✅ DONE (commit `9a67a63`). W11-T2 ✅ DONE (commit `da0e283`).
**Companion docs:**
**Companion docs:**
- `docs/wave-10-legacy-audit-2026-06-13.md` — the W1 audit that established the engine-kernel architecture
- `docs/wave-10-legacy-retirement.md` — the Wave 10 retirement record
- `AGENTS.md` "Engine Kernel Architecture" — the W5 doc
- `tmp/wave11-state-port/WORKER-PROMPT.md` — the W11-T1 worker prompt

---

## The strategic question (the user pushed back on file-moving)

> "wait so we're not talking just migrating engine to ts but to svete? Would it work better in svete?"

The narrow framing (move 28,665 LOC of imperative `.ts` from `js/modules/*` to `src/lib/engine/*`) was rejected. The user wants the **broad framing** — actually rewrite the engine in Svelte 5 idioms where it adds value.

**Honest answer to "would it work better in Svelte?":**

| Engine layer | % of LOC | Svelte 5 fit | Why |
|---|---|---|---|
| State + lifecycle + events | ~50% | ✅ Excellent | Eliminates the dual-state mirror (js/state ↔ Svelte stores) |
| Reactive derivations + view modes | ~15% | ✅ Excellent | `journey-compass-state` is literally a pure derivation; becomes `$derived` |
| DOM helpers + renderers | ~10% | 🟡 Mixed | Could become Svelte components (idiomatic) or stay helpers (mechanical) |
| Three.js render loop + scene graph | ~15% | ❌ Imperative only | `mesh.position.set()`, `renderer.render()`, `instanceMatrix.needsUpdate` 60×/sec — runes add overhead |
| WebGL ops + GPU buffer mgmt | ~10% | ❌ Imperative only | No reactivity model fits |

**Conclusion:** ~65% of the engine can be Svelte-native; ~25% must stay imperative; ~10% is mixed (rune class with imperative methods). Runtime perf is identical (imperative render loop preserved); code maintainability wins big on the 65% (less code, automatic reactivity, no bridge).

## The port tickets (10 chunks, sequenced)

| # | Ticket | Scope | Risk | Notes |
|---|---|---|---|---|
| **W11-T1** ✅ | State kernel Svelte 5 class | `src/lib/state/app.svelte.ts` — Svelte 5 class with 289 fields, `withMutation` method, `$derived` for `focusedNode`/`semanticDiveMode` | LOW | DONE. Committed `9a67a63`. Worker model worked. |
| **W11-T2** ✅ | Migrate the smallest bridge file | thread-manager.ts: import, mutation guard, narrowing, dead-code removal. Also fixed `ScenePerformanceDiagnostics` type sync (added 3 missing fields). | LOW | DONE. Committed `da0e283`. Exposed 5 type bugs the `as any` was hiding — all fixed. |
| **W11-T3** ✅ | Migrate a 1-state + 5-wsm bridge file | map-state.ts: import split (type-only `Point` from legacy), 4 `state.withMutation()` calls. | LOW | DONE. Committed `5f8494d`. **CLEANER than W11-T2** — no type bugs surfaced (the structural `as unknown as` cast is valid for the Svelte 5 class). |
| W11-T3 | Migrate Svelte stores to the new state | The 12 Svelte stores (`navigation.svelte.ts`, `filter.svelte.ts`, etc.) currently mirror `js/state`; switch them to read from the Svelte 5 class. The mirror disappears. | MED | Thins the bridge in 12+ places. Tests: `state.test.js` covers the kernel. |
| W11-T4 | Migrate the rest of the bridge | Update the other 11 bridge files (`three-engine.ts` 19 imports, `demo-choreography.ts` 10, etc.) to use the Svelte 5 state class. | MED-HIGH | The `three-engine.ts` 19-import migration is the biggest single chunk; consider splitting per bridge file. |
| W11-T5 | Camera subsystem Svelte 5 port | Port `camera-controls-*` (~11 files) to Svelte 5 rune classes where possible; keep imperative for the choreography animations. | MED | Resolves the choreography split |
| W11-T6 | Focus subsystem Svelte 5 port | Port `focus-pocket`, `focus-stage-renderer`, `focus-anchor-indicator`, `focus-panel-mode` to Svelte 5 rune classes. | MED | `focus-pocket.test.js` exists; good test coverage. |
| W11-T7 | Search subsystem Svelte 5 port | Port `search-state`, `search-results-ui`, `search-panel-adapter`, etc. to Svelte 5. **Resolves the two-source shim problem** flagged in the W1 audit. | MED-HIGH | Critical consolidation move. |
| W11-T8 | Journey subsystem Svelte 5 port | Port `journey-*` (~20 files, 4,634 LOC) to Svelte 5. The largest subsystem. | HIGH | Many domain tests; complex. Consider splitting per file. |
| W11-T9 | Three.js render loop | Port `three-engine.ts:animate()` + 20+ render-loop callees. **Last, because it depends on all subsystems.** | HIGHEST | Render loop must stay imperative; the port is about thinning the surrounding infrastructure, not the loop itself. |
| W11-T10 | Worker + build:legacy retirement | Port `data-worker.js`, retire `app.ts` + `scripts/build-app.mjs` + `package.json:build:legacy` entries + untrack `dist/bundle.js`. Closes the engine-port arc + the deferred T1b from earlier. | MED | Closes the loop on the engine-port arc. |

## The end state

After all 10 tickets:

- **Engine kernel in Svelte 5 idioms** (state, lifecycle, derivations, DOM helpers as Svelte components) — 65% of LOC
- **Engine kernel imperative** (render loop, WebGL ops) — 25% of LOC, unchanged
- **Mixed** (focus pocket, camera, micro-demo) — 10% of LOC, rune classes with imperative methods
- **Bridge thinned** to direct re-exports / one-line calls (no parameter-passing boilerplate)
- **`@legacy-js/*` alias fully retired** (no callers)
- **`app.ts` + `scripts/build-app.mjs` + `dist/bundle.js` retired** (build:legacy lane gone)
- **Single source of truth for state** (no more `js/state.ts` ↔ Svelte-store mirror)
- **Net LOC delta:** -8,000 to -12,000 (idiomatic Svelte 5 is shorter)

## Risks the user should know about

1. **Two-source shim on `search-state` and `filter-state`** — they re-export from BOTH a local `.ts` and `src/lib/*.ts`. W7 resolves this. Don't try to migrate search consumers before W7 lands.
2. **Render loop is monolithic** (753 LOC, 27 internal imports). W9 is the last; integration tests (Playwright + visual QA) are the only safety net. Per-frame perf must remain identical.
3. **Worker kernel** (`data-worker.js`) is a real `.js` — no `.ts` sibling. W10 ports it = converts JS → TS in the Svelte track.
4. **Side-effect imports** (per the Wave 10 lesson) must be audited BEFORE porting any legacy file. The new `audit/wave-10-side-effect-imports-2026-06-14.md` document has the pattern; reuse it.
5. **BOTH-pattern audit gap (M3 history)** — never blanket-delete; use the new 5-keep / 3-delete rule from AGENTS.md.

## Verification gates (per ticket)

Every ticket must pass:
- `npm run check` (svelte-check 0 errors)
- `npm run test:unit` (no regression in test count or pass rate)
- `npm run build` (clean)
- `git status -sb` (only the intended files changed)
- For visual changes: headed Playwright screenshot review (per `visual-qa-critique` skill)

## Architectural memory

- **Memory entry**: "semantic-explorer Wave 11 — Engine port plan" (in `memory` store, project-scope). Cross-session durable.
- **Plan script**: `tmp/wave11-port-plan.cjs` — re-runnable dependency analysis. Re-run after any major commit to keep the dependency map current.
- **Worker prompt**: `tmp/wave11-state-port/WORKER-PROMPT.md` — template for future mechanical port tickets.

## Worker tracking

- W11-T1 worker: `ocw_6cc02569-5c2e-4bd1-82b1-923d9403624e` (mimo-v2.5, yolo, 90 min timeout, live_steer) — DONE in 4 min
- W11-T2: done by main lane (3-line scope was below worker overhead threshold)
- Pattern: for W11-T3+, the parallel-workers are doing related work (relationship-roles migration = Ticket 4 of a separate workstream). Coordinate to avoid stomping.

## W11-T2 lessons learned (saved to project memory)

1. **The shim pattern is mandatory** — every `*.svelte.ts` Svelte 5 module needs a `*.ts` shim that does `export * from './foo.svelte.ts';`. The TypeScript `*.svelte` module declaration only knows about default exports. The W11-T1 worker missed this; I added `src/lib/state/app.ts` as part of W11-T2.
2. **`@lib/*` aliasing + explicit `.ts` extension is the safe import path** — bypasses the `*.svelte` declaration entirely.
3. **The legacy `as any` was load-bearing** — it hid 5 real type bugs. The Svelte 5 typed class exposed them: dead `currentMode` fallback, missing `myceliumCoreSegments`/`Wispy`/`Bridge` fields (in BOTH `js/state.ts` AND `webgl.ts`), noUncheckedIndexedAccess narrowing needed, etc.
4. **Type duplication is a Wave 11 hazard** — `ScenePerformanceDiagnostics` exists in both `js/state.ts` and `webgl.ts`. They drift. A Wave 11 follow-up should unify (Svelte 5 class imports from `@lib/types/webgl`).
5. **The migration is reversion-prone** — I lost my W11-T2 work once because a parallel worker stomped on the same file. Lesson: commit incrementally. The fix is to run svelte-check IMMEDIATELY after the import change, before any other edits.
6. **The mutation guard migration** is `state.withMutation(() => {...})` (class method), not a top-level `withStateMutation` import. Encapsulation in the class.

## Next ticket — W11-T3 (candidates)

The pattern for W11-T3 is: pick the next bridge file, migrate it, fix the type bugs it exposes. Candidates:
- `node-manager.ts` (1 import) — manages Three.js instanced meshes; reads node positions
- `thread-manager.ts` already migrated
- `three-postprocessing.ts` — actually a re-export shim, not a bridge
- `camera-controls.ts` (3 imports) — small enough for the pattern to scale

Alternative: migrate the Svelte stores (12 of them) to read from the new state class. The mirror disappears. This is W11-T3 in my original plan but the Svelte store migration is a different shape of work.
