# Phase 4 — Journey Orchestration Tier TS Port

You are porting a slice of the semantic-explorer JS → TS migration. Read `AGENTS.md` and the relevant sections of `docs/migration-plan.md` (Phase 4) before doing anything.

## YOUR SLICE — 6 files to port from JS to TypeScript

These are all journey-orchestration / focus-UI tier modules. They handle the high-level journey state, thread walks, neighborhood manifest, focus UI rendering, and microcopy. They are PURE derivation / DOM-hydration logic — no Three.js engine code, no canvas hit-testing, no WebGL.

| Legacy JS | New TS |
|---|---|
| `js/modules/journey-thread-model.js` | `src/lib/journey/thread-model.ts` |
| `js/modules/journey-thread-settler.js` | `src/lib/journey/thread-settler.ts` |
| `js/modules/journey-neighborhood.js` | `src/lib/journey/neighborhood.ts` |
| `js/modules/journey-focus-ui.js` | `src/lib/journey/focus-ui.ts` |
| `js/modules/journey-point-color.js` | `src/lib/journey/point-color.ts` |
| `js/modules/journey-text-helpers.js` | `src/lib/journey/text-helpers.ts` |

The migration plan's other Phase 4 files (canvas-*, focus-pocket, micro-demo-*) are a different worker's slice — DO NOT TOUCH THEM.

## STEP 1 — Verify the slice is intact

Before porting, run these checks. If any fail, STOP and report.

```bash
cd "C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer"
```

1. **All 6 JS files exist** with non-trivial content:
   - `git ls-files js/modules/journey-thread-model.js js/modules/journey-thread-settler.js js/modules/journey-neighborhood.js js/modules/journey-focus-ui.js js/modules/journey-point-color.js js/modules/journey-text-helpers.js` — should list all 6.
   - For each, `wc -l` should be > 30 lines (i.e. real modules, not stubs).
2. **No TS shadow already exists** for any of these 6 (we don't want to overwrite another worker's work):
   - `git ls-files src/lib/journey/thread-model.ts src/lib/journey/thread-settler.ts src/lib/journey/neighborhood.ts src/lib/journey/focus-ui.ts src/lib/journey/point-color.ts src/lib/journey/text-helpers.ts` — should be EMPTY.
3. **`src/lib/journey/` directory exists** and has the existing ported files (text-helpers, point-color, journey-selected-card, etc.) — `dir src\lib\journey` should show 10+ files.
4. **The bridge is ready** — `src/lib/engine/bridge.ts` should exist (it's 1212 lines per AGENTS.md).

## STEP 2 — Port the 6 files

For each file:

1. **Read the entire JS source** with `read_file`. Understand every export, every helper, every JSDoc comment.
2. **Read the existing TS port** of a sibling module in `src/lib/journey/` (e.g., `text-helpers.ts` already exists as a port — use it as a style template).
3. **Create the new TS file** at the target path. Conventions:
   - Use `import type` for type-only imports (`verbatimModuleSyntax` is on)
   - Use `@lib/...` alias style for cross-slice imports (e.g., `@lib/utils/dom-formatters`, `@lib/journey/relationship-roles`)
   - Use `@legacy/...` for legacy JS modules that the TS port must call (e.g., `@legacy/modules/journey-canvas-interaction.js`) — check `tsconfig.json` for the actual alias
   - **Wrap every mutation of `state.navState`, `state.strandContinuityState`, or other `TRACKED_SUB_KEYS` in `withStateMutation()`** — the production Proxy will throw without it. Look at how `src/lib/semantic-threads.ts` does this for a working pattern.
   - For DOM-hydration functions, keep the JSDoc and signatures matching the JS; add explicit `void` return types where the function only does side effects
   - If the JS file has `// @ts-nocheck` or any kind of loose types, port to STRICT TypeScript — no `any`, use `unknown` and narrow
4. **Preserve exports exactly** — every named export the JS file has must appear in the TS file with the same name. The drift contract `tests/ts-js-drift-contract.mjs` will compare export surfaces; mismatches fail.
5. **Use `seededUnit()` from `@lib/utils/seeded-random` instead of `Math.random()`** for any geometry/variation code. GLSL-portable deterministic PRNG.
6. **For `journey-thread-settler.ts`** specifically: this is where the race-condition bug lives. Use `StrandContinuityManager.setTimer()` from `@lib/utils/strand-continuity` (already ported in Phase 0) for the dual-timer-pool — it unifies onto a single Map-based `_timers` and prevents stale-callback races. Look at how `thread-inspector.ts` does it.

## STEP 3 — Verify

1. `npm run typecheck` — must pass with 0 errors. (The pre-existing TS5042 error is a separate concern; if you see it, note it but don't fix.)
2. `node tests/ts-js-drift-contract.mjs --strict` — must report 0 drift pairs. If new drift appears, fix it before reporting.
3. For each ported file, find any unit test in `tests/unit/` that targets it (grep for the filename). If a test exists, run `npx vitest run <test-file>` and confirm it passes.
4. `git diff --stat` — should show exactly 6 new files in `src/lib/journey/` (and possibly 0 changes elsewhere, unless the JS source needed to be edited for the port — which it should NOT).

## STEP 4 — Report

```markdown
## Phase 4 / Journey Orchestration — Report

### Slice verification
- All 6 JS files present: Y/N (with line counts)
- No pre-existing TS shadows: Y/N
- Bridge ready: Y/N

### Ports completed (6 expected)
- `src/lib/journey/thread-model.ts`: <line count> lines, exports <list>
- `src/lib/journey/thread-settler.ts`: <line count> lines, exports <list>
- `src/lib/journey/neighborhood.ts`: <line count> lines, exports <list>
- `src/lib/journey/focus-ui.ts`: <line count> lines, exports <list>
- `src/lib/journey/point-color.ts`: <line count> lines, exports <list>
- `src/lib/journey/text-helpers.ts`: <line count> lines, exports <list>

### Bug fixes applied
- thread-settler race: Y/N (used StrandContinuityManager.setTimer)
- Other fixes: <list>

### Verification
- `npm run typecheck`: PASS/FAIL
- `ts-js-drift-contract.mjs --strict`: 0 drift pairs / N drift
- `git diff --stat`: <output>
- Any test files affected: <list with pass/fail>

### Cross-seam findings (do NOT fix, just report)
- Anything in your slice that depends on a file outside your slice: <list with file:line>
- Anything in your slice that looks wrong but you didn't fix: <list with file:line>
- Any drift you noticed between TS and JS in the OTHER 6 files: <list with file:line>
```

## WHAT TO SKIP

- **DO NOT touch** the 6 files in the other worker's slice (`journey-canvas-*.js`, `focus-pocket.js`, `micro-demo*.js`, `thread-inspector.js`). If you find bugs there, return them as cross-seam findings.
- **DO NOT touch** the off-limits write surface: `js/modules/app.js`, `js/modules/lifecycle.js`, `js/state.js`, `js/modules/journey.js`, `js/modules/focus-pocket.js`, `js/modules/journey-compass-state.js`, `js/modules/ui-renderers.js`, `deploy.sh`, `deploy.ps1`. If you find bugs there, return them as cross-seam findings.
- **DO NOT touch** any `src/components/*.svelte` — component wiring is a separate pass after this port.
- **DO NOT touch** the existing TS port of `text-helpers.ts` (it's already ported) — only the OTHER 5 files.
- **DO NOT touch** any file in `dist/` — those are build artifacts.
- **DO NOT regenerate cache busters** — that's `npm run refresh:cache`, separate from this port.
- **DO NOT run `npm run qa:visual` or Playwright** — too long-running for a port task.

## TIMING

T4 task (integration). Aim for <15 minutes. If you're past 12 minutes and haven't finished 4 of 6 files, STOP and report what's done. Better to ship a clean partial than a rushed full pass.

## TOOL HARNESS

You have full read/write/edit/bash access. Use `read_file` for source files, `edit` and `write_file` for the new TS files, `run_shell_command` (cmd.exe) for verification commands. Use `git ls-files`, `git diff`, `git grep` for source verification. Use `git diff --stat` (not in-process `read_file` for diffs — the in-process tool can return stale data).
