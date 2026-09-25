---
name: TS_STRICTNESS_LEAF_REMOVAL_PASS
description: Execute a bounded strictness removal pass on leaf-safe TS shadow modules: remove @ts-nocheck, add only the minimal types needed for green checks, and verify across the project’s typecheck commands.
source: auto-skill
extracted_at: '2026-06-08T18:34:05.282Z'
---

# TS Strictness Leaf Removal Pass

Use when you have already audited strictness candidates and now need to execute a scoped removal pass on a confirmed leaf-safe set of TS shadow files.

It does this: removes `// @ts-nocheck` from the given files, adds the smallest possible type fix that makes checks green, then re-runs the full verification tier to confirm the pass did not introduce regressions outside ownership.

## When to use

- An audit (e.g. `TS_STRICTNESS_REMOVAL_PRIORITIZATION`) produced a ranked, ready-to-execute list of Tier A/B candidates.
- You own or are explicitly assigned a bounded slice of `js/modules/**/*.ts` leaf files for a strictness wave.
- Verification must include the project’s combined strictness gate (`typecheck`, `check:svelte`, `check:ts-progress`) rather than only unit checks.

## Prerequisites

- Clear file ownership: know exactly which files you may touch, and a halt rule if any file turns out not to be leaf-safe.
- All required tools are present: `read_file`, `edit`, `run_shell_command`, `grep`, `glob`.
- The project’s strictness config is known: `tsconfig.typecheck.json` include set and any override such as `noUncheckedIndexedAccess`.
- A verified baseline exists before changes: run `typecheck`, then `check:svelte`, then `check:ts-progress` once before touching files so you can distinguish pre-existing errors from newly introduced ones.

## Frontmatter rule for new skills created by this pass

Always include `source: auto-skill` in the YAML frontmatter so future review agents can safely update this skill without touching user-authored skills.

## Execution sequence

### Step 1: Safety baseline from past attempts

Before any edit, read prior `check:svelte` output (or run it) and note which svelte-check errors are already present in files outside your ownership. Do not treat these as new failures in Step 8.

### Step 2: Read current `@ts-nocheck` block

For every target file:
1. Read the first ~20 lines.
2. Confirm the file begins with `// @ts-nocheck`.
3. Note any runtime-risk surfaces already visible in the header: `document.`, `window.`, `THREE.`, `setTimeout`, `addEventListener`, `requestAnimationFrame`, `import { state }`, `new THREE.`.

### Step 3: Ownership gate

If a file you meant to include has:
- a `js/state.js` import path other than `../../state.js`,
- direct `window` or `document` access beyond simple feature probes,
- `THREE.*` new expressions or WebGL shader construction,
- `.bind(`, `.call(`, or `apply(` on unknowns,

…skip it and record why. Do not broaden scope mid-pass.

### Step 4: Strip `// @ts-nocheck`

Use precise edits removing only the first line containing the directive. Do not reformat, delete comments, or collapse imports. Keep behavior identical.

### Step 5: First optional per-file change set

After stripping, inspect for the most common categories of extra needed types, in this priority order:

1. Multiline object literals assigned to `Record<string, T>` need an explicit key intersection (`Record<string, T> & { overview: T; ... }`).
2. Indexed access with `noUncheckedIndexedAccess` on `Record<string, T>` returns `T | undefined`; unify with `??` when a fallback is guaranteed present, or narrow the type first.
3. Arrow/function params inferred as `unknown` from SDK callback signatures (e.g. `THREE.Color` constructors, shader callback shapes) should get local minimal interfaces.
4. Switch from `||` to `??` if the left-hand side is `0`, `''`, or `false` but the type system treats it as a possibly undefined fallback path.

Do not add types that change runtime behavior (e.g. coercing numbers to strings, changing truthiness tests).

### Step 6: Verification tier 1 — target-file typecheck

Run the project’s direct typecheck:

```bash
npm run typecheck 2>&1
```

This is the strongest signal because it compiles only the `js/modules/**/*.ts` files you just changed. If it fails: stop, inspect errors, and either apply minimal type fixes or restore the directive on the offending file plus a note explaining why.

### Step 7: Verification tier 2 — Svelte workspace

Run the Svelte workspace check:

```bash
npm run check:svelte 2>&1
```

Distinguish as:
- **New error in an owned file**: fix or restore directive on that file.
- **Pre-existing error in an unowned file**: cite and do not touch.
- **New error in an unowned file that was clean before Step 1**: stop the pass, report, do not blame-steam.

### Step 8: Verification tier 3 — TS/JS drift progress

```bash
npm run check:ts-progress 2>&1
```

This must remain green (0 drift pairs, TS coverage unchanged or improved). If drift appears or coverage regresses, halt and treat as a build-entrypoint issue, not a strictness issue.

### Step 9: Record the changed files only if strictly needed

Per your project’s `AGENTS.md`, durable learnings go to `docs/ts-runtime-sibling-inventory-2026-06-08.md` or `memory/MEMORY.md` only when the pass added new knowledge about what patterns reliably work. A plain “14 files, 0 errors” noise update is not useful.

### Step 10: Final output contract

Return, verbatim, in this shape:

```
Summary
Files changed
Files where @ts-nocheck was removed
Verification results
Risks/unresolved issues
Follow-up candidates (next wave)
```

Describe each risk with a file path and exact remediation, not a vague statement like “some files still have issues.”

## Common minimal fixes observed in this pass

| Pattern | Minimal fix |
|---|---|
| `profiles[state] || profiles.overview` with `Record<string, PresentationProfile>` under `noUncheckedIndexedAccess` | Change object to `Record<string, PresentationProfile> & { knownKey1: T; ... }` and use `??` for fallback |
| Multiline constant frozen objects already typed away by inference | No change needed; remove directive only |
| `((window as any)['X'])` monosemantic probes | Add `unknown` intermediaries instead of a broad `any` annotation only if the file needs further cleanup |
| Timer fields typed with browser-required `number | null` | Preferred over `ReturnType<typeof setTimeout>` when `tsconfig.json` includes `"types": ["node"]`, which resolves timers to `NodeJS.Timeout` and conflicts with DOM-style `window.clearTimeout(number)` assignments |
| `state.points` inferred as `never[]` from JS `[]` initialization | Introduce a local minimal point interface (e.g. `AudioPoint`) and cast `state.points as AudioPoint[]` at the read sites inside the leaf module |
| Optional method on a local vector interface used with optional chaining | Add the method as optional (`distanceTo?(v)`), then call via `current.distanceTo?.(target) ?? 0` to satisfy strict null checks without cast |
| `state.prop` missing from the `.d.ts` state interface | Use `(state as Record<string, unknown>).prop` for writes/reads instead of waiting on upstream state typing |
| `null as Record<string, unknown>` rejected by strict null checks | Route through `unknown` first: `expr as unknown as Record<string, unknown>` |
| `svelte-check` reports `focusedNode` / derived-state missing while `typecheck` is green | `typecheck` uses `tsconfig.typecheck.json` which includes `types/**/*.d.ts`; `svelte-check` uses `tsconfig.json` which excludes it. The svelte tsconfig infers `state` from `js/state.js` directly and drops module-augmented properties. Fix by adding `const s = state as unknown as SemanticState` or restore guard if the file has many such mismatches. Do NOT change tsconfig.json per repo rules. |

## Behavior-first parity verification (learned 2026-06-08)

When a TS shadow has been desynced long enough to drop whole runtime behaviors, treat the JS file as the behavioral source of truth and run a diff-by-feature before stripping `@ts-nocheck`. Known parity traps:

- **Legacy-shell rendering**: modules like `search-results-ui` render rows into `#search-results` for the served shell that never mounts Svelte. Missing the entire pipeline (`clearLegacySearchResultsDom`, `buildCountLine`, `buildResultButton`, `renderLegacySearchResultsDom`, `handleLegacyShowMoreClick`, `_lastLegacyRender`) causes invisible UI regression even though the Svelte stores update correctly.
- **Event binding guards**: JS uses sentinel flags such as `resultsEl._legacyShowMoreBound = true` to avoid duplicate listeners. The TS shadow must preserve these; otherwise double-binding occurs after multiple renders.
- **DOM-side metadata writes**: writes like `resultsEl.dataset.legacyResultsSource = 'legacy'` drive CSS selectors and contract tests. Dropping them is a silent regression.

**Safe graduation sequence**: do a JS→TS behavioral diff first (exports, DOM IDs/classes/attributes, event wiring, pagination, empty/error states, selection markers, body/state side effects), port missing runtime logic with narrow local types, then strip `@ts-nocheck` and run the full tier. Do not strip the directive before parity is verified — type green-ness alone does not prove runtime parity.

## Common minimal fixes observed in this pass

| Pattern | Minimal fix |
|---|---|
| `profiles[state] || profiles.overview` with `Record<string, PresentationProfile>` under `noUncheckedIndexedAccess` | Change object to `Record<string, PresentationProfile> & { knownKey1: T; ... }` and use `??` for fallback |
| Multiline constant frozen objects already typed away by inference | No change needed; remove directive only |
| `((window as any)['X'])` monosemantic probes | Add `unknown` intermediaries instead of a broad `any` annotation only if the file needs further cleanup |
| Timer fields typed with browser-required `number \| null` | Preferred over `ReturnType<typeof setTimeout>` when `tsconfig.json` includes `"types": ["node"]`, which resolves timers to `NodeJS.Timeout` and conflicts with DOM-style `window.clearTimeout(number)` assignments |
| `state.points` inferred as `never[]` from JS `[]` initialization | Introduce a local minimal point interface (e.g. `AudioPoint`) and cast `state.points as AudioPoint[]` at the read sites inside the leaf module |
| Optional method on a local vector interface used with optional chaining | Add the method as optional (`distanceTo?(v)`), then call via `current.distanceTo?.(target) ?? 0` to satisfy strict null checks without cast |
| `state.prop` missing from the `.d.ts` state interface | Use `(state as Record<string, unknown>).prop` for writes/reads instead of waiting on upstream state typing |
| `null as Record<string, unknown>` rejected by strict null checks | Route through `unknown` first: `expr as unknown as Record<string, unknown>` |
| `svelte-check` reports `focusedNode` / derived-state missing while `typecheck` is green | `typecheck` uses `tsconfig.typecheck.json` which includes `types/**/*.d.ts`; `svelte-check` uses `tsconfig.json` which excludes it. The svelte tsconfig infers `state` from `js/state.js` directly and drops module-augmented properties. Fix by adding `const s = state as unknown as SemanticState` or restore guard if the file has many such mismatches. Do NOT change tsconfig.json per repo rules. |
| Legacy DOM `datasets` typed as bare `string` when DOM types expose `DOMStringMap` | Widening a sentinel property to `string | undefined` satisfies strictness and matches runtime behavior without changing DOM structure. |
| `new THREE.CanvasTexture(canvas)` inside a leaf helper that receives `THREE` as `any` | Replace the parameter type with `typeof import('three')` and return `CanvasTexture` (or other precise Three.js types). Remove the module-level `/* eslint-disable @typescript-eslint/no-explicit-any */`. |
| `WebGLContextState` object literal missing many fields from the interface | Add only the fields actually initialized in the leaf object; do **not** remove the `[key: string]: any` index signature during the same pass. Defer removal until downstream consumers are strictened and all dynamic accesses are statically typed. |
| `controls: any | null` where OrbitControls is consumed | Broad `any` typing is acceptable in a leaf module when the corresponding `OrbitControls` type import path is outside ownership; fix it in a follow-up wave that reaches the consumer. |

## Anti-patterns to avoid

| Anti-pattern | Correct behavior |
|---|---|
| Reformatting unrelated code while stripping the directive | Edit only the `// @ts-nocheck` line |
| Broadening work beyond the assigned slice because a nearby file "looks easy" | Stop, record as an adjacent seam candidate, and continue |
| Restoring `@ts-nocheck` after a single type failure and continuing to other files | Fix or mark-and-stop; do not leave mixed state across the wave |
| Re-running only `typecheck` because the direct TS set is small | Always run the full three-tier suite; Svelte feedback and TS/JS drift are independent risk surfaces |
| Treating any new `check:svelte` error in an unrelated file as acceptable noise | Stop the pass and report; scope drift is a signal, not a duff |
| Assuming `tsc --noEmit` green means runtime parity | `tsc` validates types, not emitted behavior; a TS shadow can compile while diverging from JS under the same inputs. Verify parity with a JS-vs-TS behavioral diff before graduation. |

## Pattern added 2026-06-08 — narrow leaf strictification with `SemanticState`

Verified on `js/modules/camera-controls-choreography-cursor.ts`:
- Keep runtime behavior identical; add only local types.
- Import `SemanticState` with `import type { SemanticState } from '../../types/state.js'`.
- Create a local cast `const _s = state as unknown as SemanticState`;
  this matches the existing pattern in `js/modules/camera-controls-core.ts` and satisfies `svelte-check` without changing runtime behavior.
- Use local narrow interfaces for function options (e.g. `FocusNodeOptions`) instead of broad `any`.
- For `HTMLElement` dynamic properties already used elsewhere, define a narrow local intersection type and cast once:
  `type OnboardingHint = HTMLElement & { _dismissedThisSession?: boolean; _autoHideTimer?: ReturnType<typeof setTimeout> | null }`.
- Preserve dynamic browser APIs as needed: `document.getElementById`, `clearTimeout`, `setTimeout`, `HTMLElement.open`, and `dataset.*` are acceptable browser-side accesses in a leaf camera choreography module.
- Continue using `Number.isFinite(...)` guards and early `return false` paths unchanged.

## Verification contract added 2026-06-08

For leaf strictification, run all four checks:
1. `npm run typecheck` (TS project typecheck).
2. `npm run check:svelte` (Svelte workspace typecheck).
3. `npm run check:ts-progress` via `node tests/ts-js-drift-contract.mjs --progress` (TS vs JS drift gauge).
4. Project-specific runtime contract, here `node tests/camera-controls-motion-contract.mjs`.

Headed/Playwright specs (e.g. `tests/canvas-hit-test-interaction.spec.js`) must be reported as **not run** with the reason (requires headed browser), not executed with `node`.

If JS-only imports remain after pass, record the JS-only import list from the drift contract and treat it as expected for modules still blocked by neighboring `@ts-nocheck` files.
