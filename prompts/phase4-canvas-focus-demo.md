# Phase 4 — Canvas + Focus + Demo Tier TS Port

You are porting a slice of the semantic-explorer JS → TS migration. Read `AGENTS.md` and the relevant sections of `docs/migration-plan.md` (Phase 4) before doing anything.

## YOUR SLICE — 9 files to port from JS to TypeScript

This slice combines the Three.js/canvas interaction tier, the focus pocket constellation, and the micro-demo choreography. These are the parts of Phase 4 that need WebGL/engine knowledge, raycaster work, and state-machine code.

| Legacy JS | New TS |
|---|---|
| `js/modules/journey-canvas-interaction.js` | `src/lib/journey/canvas-interaction.ts` |
| `js/modules/journey-canvas-hit-test.js` | `src/lib/journey/canvas-hit-test.ts` |
| `js/modules/journey-canvas-hover.js` | `src/lib/journey/canvas-hover.ts` |
| `js/modules/journey-canvas-node-picking.js` | `src/lib/journey/canvas-node-picking.ts` |
| `js/modules/focus-pocket.js` | `src/lib/focus/pocket.ts` |
| `js/modules/micro-demo.js` | `src/lib/demo/choreography.ts` |
| `js/modules/micro-demo-guards.js` | `src/lib/demo/guards.ts` |
| `js/modules/micro-demo-camera.js` | `src/lib/demo/camera.ts` |
| `js/modules/micro-demo-ui.js` | `src/lib/demo/ui.ts` |

The migration plan's other Phase 4 files (thread-model, thread-settler, neighborhood, focus-ui, point-color, text-helpers) are a different worker's slice — DO NOT TOUCH THEM.

**NOTE:** `js/modules/focus-pocket.js` and `js/modules/journey-canvas-interaction.js` are listed as **off-limits write surface** in AGENTS.md, but the migration plan explicitly queues them for TS port. You have explicit lead approval to port them (this prompt IS the approval). Once ported, the TS file is canonical and the JS shadow can be deleted in Phase 3 retirement.

## STEP 1 — Verify the slice is intact

```bash
cd "C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer"
```

1. **All 9 JS files exist**:
   ```bash
   git ls-files js/modules/journey-canvas-interaction.js js/modules/journey-canvas-hit-test.js \
     js/modules/journey-canvas-hover.js js/modules/journey-canvas-node-picking.js \
     js/modules/focus-pocket.js js/modules/micro-demo.js js/modules/micro-demo-guards.js \
     js/modules/micro-demo-camera.js js/modules/micro-demo-ui.js
   ```
   Should list all 9. For each, `wc -l` should be > 30 lines.

2. **No TS shadow already exists** for any of these 9:
   ```bash
   git ls-files src/lib/journey/canvas-interaction.ts src/lib/journey/canvas-hit-test.ts \
     src/lib/journey/canvas-hover.ts src/lib/journey/canvas-node-picking.ts \
     src/lib/focus/pocket.ts src/lib/demo/choreography.ts src/lib/demo/guards.ts \
     src/lib/demo/camera.ts src/lib/demo/ui.ts
   ```
   Should be EMPTY.

3. **Reference files exist**:
   - `src/lib/utils/strand-continuity.ts` — Map-based `_timers` for race-condition fix
   - `src/lib/utils/seeded-random.ts` — `seededUnit()` for deterministic geometry
   - `src/lib/engine/bridge.ts` — engine bridge (1212 lines per AGENTS.md)
   - `src/components/FocusPocket.svelte` — consumer for `focus/pocket.ts` (117 lines, already ported per AGENTS.md)

4. **Don't blindly trust recent commit messages** — the user mentioned "focus-pocket.js:202 missing return (per the constellation sweep, was fixed in separate commit)" — verify by reading lines 195-210 of `js/modules/focus-pocket.js`. If the fix is still there, do NOT re-apply it. If it's missing, apply it as part of the port.

## STEP 2 — Port the 9 files

For each file:

1. **Read the entire JS source** with `read_file`. Understand every export, every helper, every JSDoc comment.
2. **Read the existing TS port of a sibling** for style reference:
   - For canvas-* files: look at `src/lib/journey/text-helpers.ts` or `src/lib/journey/point-color.ts` (already ported)
   - For focus/pocket.ts: look at `src/lib/journey/text-helpers.ts` for state-write patterns
   - For demo/*: look at `src/lib/journey/text-helpers.ts` for the withStateMutation pattern
3. **Create the new TS file** at the target path. Conventions:
   - `import type` for type-only imports (`verbatimModuleSyntax` is on)
   - `@lib/...` alias style for cross-slice imports
   - `@legacy/...` for legacy JS modules the TS port must call (verify alias in `tsconfig.json`)
   - **Wrap every mutation of `state.navState`, `state.strandContinuityState`, or other `TRACKED_SUB_KEYS` in `withStateMutation()`** — the production Proxy will throw without it. Look at how `src/lib/semantic-threads.ts` does this for a working pattern.
   - For DOM-hydration functions, keep the JSDoc and signatures matching the JS; add explicit `void` return types where the function only does side effects
   - If the JS file has `// @ts-nocheck` or any kind of loose types, port to STRICT TypeScript — no `any`, use `unknown` and narrow
4. **Preserve exports exactly** — every named export the JS file has must appear in the TS file with the same name. The drift contract `tests/ts-js-drift-contract.mjs` will compare export surfaces; mismatches fail.
5. **Use `seededUnit()` from `@lib/utils/seeded-random` instead of `Math.random()`** for any geometry/variation code. GLSL-portable deterministic PRNG.
6. **For `focus/pocket.ts`** specifically: this is the constellation-sweep slice. There was a missing `return` at `js/modules/focus-pocket.js:202` per the bugsweep — verify whether it's still missing, and if so, preserve the fix in the port. Use `StrandContinuityManager.setTimer()` from `@lib/utils/strand-continuity` for any timer work.
7. **For `demo/choreography.ts`** specifically: this is the micro-demo state machine. The skip-guard race (Bug #5) lives here. Replace the retry-loop + `SESSION_STORAGE_KEY` pattern with a synchronous `get(demoPhase)` store read in the port. The `demoState` store is the canonical home for demo state (12 stores exist per AGENTS.md).
8. **For canvas-* files**: these are pure raycaster / pointer-event logic with no state mutation. The TS port should be straightforward — just type the inputs (THREE.Raycaster, pointer events, node index) and outputs. Use `THREE.Raycaster`, `THREE.Vector2`, `THREE.Vector3` types from the `three` package.

## STEP 3 — Verify

1. `npm run typecheck` — must pass with 0 errors. (The pre-existing TS5042 error is a separate concern; if you see it, note it but don't fix.)
2. `node tests/ts-js-drift-contract.mjs --strict` — must report 0 drift pairs.
3. For each ported file, find any unit test in `tests/unit/` that targets it. Run `npx vitest run <test-file>` and confirm it passes. If a test fails AND the failure is in your ported code (not pre-existing), fix it.
4. `git diff --stat` — should show exactly 9 new files in `src/lib/journey/`, `src/lib/focus/`, or `src/lib/demo/`.

## STEP 4 — Report

```markdown
## Phase 4 / Canvas + Focus + Demo — Report

### Slice verification
- All 9 JS files present: Y/N (with line counts)
- No pre-existing TS shadows: Y/N
- focus-pocket.js:202 status: present/absent/preserved
- Bridge ready: Y/N

### Ports completed (9 expected)
- `src/lib/journey/canvas-interaction.ts`: <line count> lines
- `src/lib/journey/canvas-hit-test.ts`: <line count> lines
- `src/lib/journey/canvas-hover.ts`: <line count> lines
- `src/lib/journey/canvas-node-picking.ts`: <line count> lines
- `src/lib/focus/pocket.ts`: <line count> lines
- `src/lib/demo/choreography.ts`: <line count> lines
- `src/lib/demo/guards.ts`: <line count> lines
- `src/lib/demo/camera.ts`: <line count> lines
- `src/lib/demo/ui.ts`: <line count> lines

### Bug fixes applied
- focus-pocket.js:202 missing return: Y/N/A (applied/already present/N/A)
- micro-demo skip-guard race: Y/N
- Other fixes: <list>

### Verification
- `npm run typecheck`: PASS/FAIL
- `ts-js-drift-contract.mjs --strict`: 0 drift pairs / N drift
- `git diff --stat`: <output>
- Any test files affected: <list with pass/fail>

### Cross-seam findings (do NOT fix, just report)
- Anything in your slice that depends on a file outside your slice (especially the 6 files in the OTHER worker's slice): <list with file:line>
- Anything in your slice that looks wrong but you didn't fix: <list with file:line>
- Any drift you noticed between TS and JS in the OTHER 6 files: <list with file:line>
```

## WHAT TO SKIP

- **DO NOT touch** the 6 files in the other worker's slice (`journey-thread-*`, `journey-neighborhood`, `journey-focus-ui`, `journey-point-color`, `journey-text-helpers`). If you find bugs there, return them as cross-seam findings.
- **DO NOT touch** the off-limits write surface BEYOND your slice: `js/modules/app.js`, `js/modules/lifecycle.js`, `js/state.js`, `js/modules/journey.js`, `js/modules/journey-compass-state.js`, `js/modules/ui-renderers.js`, `deploy.sh`, `deploy.ps1`. If you find bugs there, return them as cross-seam findings.
- **DO NOT touch** any `src/components/*.svelte` — component wiring is a separate pass after this port.
- **DO NOT delete the JS shadow files** — Phase 3 retirement is a separate, coordinated step.
- **DO NOT touch** any file in `dist/` — those are build artifacts.
- **DO NOT regenerate cache busters** — that's `npm run refresh:cache`, separate from this port.
- **DO NOT run `npm run qa:visual` or Playwright** — too long-running for a port task.

## TIMING

T5 task (complex multi-file). Aim for <20 minutes. If you're past 15 minutes and haven't finished 5 of 9 files, STOP and report what's done. Better to ship a clean partial than a rushed full pass.

## TOOL HARNESS

You have full read/write/edit/bash access. Use `read_file` for source files, `edit` and `write_file` for the new TS files, `run_shell_command` (cmd.exe) for verification commands. Use `git ls-files`, `git diff`, `git grep` for source verification. Use `git diff --stat` (not in-process `read_file` for diffs — the in-process tool can return stale data).
