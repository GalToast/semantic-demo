---
name: TS_JS_DRIFT_CLOSURE_SLICE
description: Close TS/JS drift pairs in an owned migration slice by matching JS exports, then remove @ts-nocheck where safe; verify with drift contract, typecheck, and related checks.
source: auto-skill
extracted_at: '2026-06-08T17:44:37.896Z'
---

# TS/JS Drift Closure Slice

## When to use

- A `check:ts-progress` (or `ts-js-drift-contract.mjs --progress`) run shows `JS-only` export drift in a specific ownership slice (e.g., `camera-controls` shows `JS-only: cancelFocusCameraAnimation`).
- The user or task requests closing drift pairs (not broad strictification) and optionally removing `// @ts-nocheck` where safe.
- The slice has a JS source of truth and a TS shadow that should mirror its public surface.

## Trigger

- Task explicitly names a list of `js/modules/*.ts` files to edit and cites drift strings from the progress report.
- The agent reports: "X drift pairs closed, Y @ts-nocheck removed" as the success criterion.

## Procedure

### Step 1: Baseline capture

1. Run `npm run check:ts-progress` and capture the drift list.
2. Filter to the owned slice. Identify `JS-only` (TS missing export/function) and `TS-only` gaps.
3. Record baseline count for success criteria.

### Step 2: Identify JS source of truth

For each `JS-only` drift item:
1. `findstr /N "<export-name>"` in the corresponding `.js` file to confirm the function/export exists.
2. Read the surrounding JS code to understand signatures and runtime behavior (defaults, return values, side effects).
3. Note any helper functions the public API depends on (e.g., `ensureDiveButton` calls `appendDiveButton`).

**Also inspect behavioral/non-export drift** — `check:ts-progress` surface may hide implementation drift that shows up when comparing the `.ts` and `.js` files directly. Common patterns:
- **Missing imports**: logger utilities (`debugWarn`), deterministic randomness (`seededUnit`), store modules
- **State mutation timing**: JS may use inline proxy writes while TS should route through `withStateMutation()` for `navState` / tracked sub-objects
- **Timer/cancellation tracking**: JS may track `setTimeout` handles and cancellation flags to prevent stale closure leaks; TS may omit these guards
- **Default-value drift**: constants like `INITIAL_SHOW` or `searchVisibleCountStore` defaults may diverge between TS and JS
- **Export completeness**: JS exports a helper like `cancelLoadingHide` while the TS shadow omits it entirely

### Step 3: Add missing TS surface

For each missing export/function:

**Re-export gaps (facade modules)**
- Add the missing export to the TS facade matching the JS re-export pattern.

**Function gaps (implementation modules)**
- Port the function signature and body from JS to TS.
- Match runtime behavior exactly; do not refactor logic.
- Use `(module as any)` or explicit casts only where the TS module graph cannot yet provide types; prefer proper types where trivial.
- If the function depends on a helper that is also missing, add the helper too.

**Behavioral gaps (non-export surface)**
- Add missing imports that JS already uses (loggers, seeded-random, store modules).
- Wire timer/cancellation state identically to JS to prevent runtime closure leaks.
- Match constant values exactly; do not assume `INITIAL_SHOW = 5` in TS is equivalent to `10` in JS when both are visible defaults.
- Ensure tracked mutable sub-objects uphold `withStateMutation()` invariants where required by `state.js`.

**Pattern example: `cancelFocusCameraAnimation` closure**
- `js/modules/camera-controls-choreography.js` re-exports `cancelFocusCameraAnimation` from `camera-controls-choreography-focus.js`.
- `js/modules/camera-controls.ts` calls `choreography.cancelFocusCameraAnimation()`.
- Fix by: (a) adding `cancelFocusCameraAnimation` to the `camera-controls-choreography.ts` re-export list, (b) adding `export function cancelFocusCameraAnimation()` to `camera-controls.ts`.

### Step 4: Remove `@ts-nocheck` incrementally

1. Remove `// @ts-nocheck` from one edited file.
2. Run `npx tsc --noEmit` and filter errors to that file: `npx tsc --noEmit 2>&1 | findstr "error TS" | findstr "<filename>"`.
3. If zero new errors introduced, keep it off; if new errors, restore `@ts-nocheck` and continue.
4. Repeat for each edited file.

**When to keep `@ts-nocheck`**: if the file still relies on untyped proxy surfaces, legacy `window` globals (e.g., `window.L`), or JS-projection patterns without type shims available in the current module graph.

### Step 5: Verification

Run in order, record pass/fail:

1. **Drift contract progress**: `npm run check:ts-progress` — confirm owned-slice drift pairs reduced.
2. **Typecheck**: `npx tsc --noEmit` — confirm no regressions.
3. **Svelte check** (only if src/ is involved): `npm run check:svelte`.

### Step 6: Report

Return:
- Drift pair closure summary (before count, after count, which pairs closed).
- Behavioral drift resolved (imports added, timer/cancellation alignments, constant/default parity, state-mutation wrappers).
- `@ts-nocheck` removals (file:line, verification result) or note that removals were deferred pending stricter typing.
- Verification command outputs (or summaries).
- Any remaining drift beyond ownership scope.
- Risks/unresolved items (pre-existing errors, @ts-nocheck remaining in other owned files).

## Anti-patterns

- Removing `@ts-nocheck` from files you did not edit — only touch files needed for drift closure.
- Broad strictification beyond the slice — goal is drift reduction, not eliminating all `@ts-nocheck` in the repo.
- Editing .js runtime files — use them as source of truth only.
- Touching CSS, dist, package, lifecycle/search/semantic TS files outside ownership.
- Assuming `npm run check:ts-progress` output is stale; re-run after every batch of edits.
- Trusting `read_file`/`glob` to reflect changes immediately after edit/write calls; use shell tools (`git status`, `findstr`, `git diff`) instead.

## Slice-tested lessons (2026-06-08)

**TS-only imports are often intentional when JS is a wrapper.** When `app.js` is a compatibility wrapper re-exporting `init` from `app.ts`, the `app.ts` entry is the real runtime owner. TS-only imports present only in the TS entry may be intentionally live in the real entry and only missing from the JS wrapper for drift-contract tracking. Don't close these by deleting imports from TS; close them by adding the matching bare imports to the JS wrapper.

**Closing imports often surfaces real behavioral gaps, not just type-checking debt.** The drift contract can list import mismatches that are technically TS/JS parity issues, but the same comparison reveals when the TS shadow is silently behind on runtime behavior (for example `deinit()` stubs). Fix both — imports and the behavioral mismatch — together so the surface parity actually holds at runtime.

**Logging utilities diverge silently between TS and JS.** `debugWarn` versus `console.warn`/`console.error` is a common hidden drift because both paths still produce output. Search JS for actual call sites, not just imports, to catch these before they ship.

**Tight strictness blocks blanket removal.** `tsconfig.typecheck.json` sets `strict`, `noImplicitAny`, and `noUncheckedIndexedAccess`. A file can only lose `@ts-nocheck` when every parameter and property accession is typed. Removing it from files that still have untyped params will fail the build immediately — keep it and revert.

**Typed files give fast @ts-nocheck wins.** Start with files that already have full parameter types (e.g. adapter boundaries, utility modules). These pass strict instantly and contribute to the "drift-closed + strict" success criterion without any additional typing work.

**Facade vs. monolith drift needs structural match, not import patches.** When JS refactored a TS monolith into a thin facade over sub-modules, the TS shadow reproduced the monolith pattern. The fix is to restructure imports and re-exports to mirror the JS surface, not just add a few missing imports.

**Behavioral drift often hides in timer/cancellation logic.** Export parity catches only public API gaps. Timer tracking, cleanup guards, and state-mutation timing may diverge silently. Port the exact timer primitives (`setTimer`/`disposeTimers`/`clearTimer` from `strand-continuity`, not raw `window.setTimeout`) to preserve runtime invariants.

**Verification: trust shell over in-process tools.** Subagent or main-lane `read_file`/`glob` can return cached/stale data after a write. Confirm with `git diff HEAD`, `findstr`, or `git status` — those reflect the real filesystem state.

## Failure modes and recovery

- **Typecheck explodes after removing @ts-nocheck:** restore `@ts-nocheck`, keep the JS-parity fix, and report the file as "needs follow-up type port."
- **Drift count doesn't change:** the TS facade may import from another TS module that still has `@ts-nocheck` and missing exports; trace the import chain.
- **check:svelte regresses:** confirm errors are in your edited files, not pre-existing; revert if needed.
- **Seeded-random drift is silent until runtime:** JS twins may use `seededUnit(...)` while TS shadows use `Math.random()`. That won't fail typecheck, but it breaks determinism and visual regression tests. Mirror the exact 2-arg `seededUnit(index, salt)` call unless you've verified the local variant matches JS semantics.

**Drift is not only missing exports — it is also missing state and wrong containers.** A TS shadow can typecheck cleanly while still drifting at runtime if it uses:
- A `Map` where JS uses a plain object with numeric keys and `null` sentinels.
- Fire-and-forget `requestAnimationFrame(...)` where JS tracks the handle in `_xxxRafId`.
- `Math.random()` where JS uses `seededUnit(index, salt)` for determinism.
- `webglContext.scene` where JS uses `state.scene`.
- Missing constants like `ANCHOR_GLOW_PERSIST_MS` that drive runtime behavior.

Compare the *private state block* and every helper body, not just the exported function signatures.

**TS-only exports can create downstream test drift.** Removing a TS-only export to match the JS runtime surface may break tests that import the TS shadow directly (e.g., `tests/unit/idb-service-timeout.test.js` importing `TRANSACTION_TIMEOUT_MS`). If scope forbids touching tests, record the risk explicitly and surface it in the handoff; do not silently leave tests broken.

**Separate pre-existing `check:svelte` noise from target-slice regressions.** When `check:svelte` reports errors, grep the file paths against your owned slice. Errors in files outside the target drift set are pre-existing and should not block a clean drift-closure report.
