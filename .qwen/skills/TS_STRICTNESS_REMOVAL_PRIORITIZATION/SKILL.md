---
name: TS_STRICTNESS_REMOVAL_PRIORITIZATION
description: Audit all // @ts-nocheck TS shadows and identify the safest candidates for strictness removal, defer high-risk files, and flag behavior-incomplete shadows.
source: auto-skill
extracted_at: '2026-06-08T18:10:44.209Z'
---

# TS Strictness Removal Prioritization

Use when a codebase has many `// @ts-nocheck` TS shadows and you need a ranked list of safe `@ts-nocheck` removal candidates, deferrals, and behavior-incomplete files.

It does this: shell-first classification of TS shadows by runtime risk (DOM/WebGL/timer surface area) and structural risk (dependency count, `any` usage, state coupling), then produces a prioritized work queue.

## When to use

- There are N `// @ts-nocheck` files under `js/modules/` and the next migration wave needs a ranked list of safe removal candidates.
- You want to avoid touching high-risk DOM/WebGL/state files while making progress on leaf modules.
- You need to identify behavior-incomplete shadows (noop stubs, deferred-to-Svelte) before attempting strictness removal.
- Verification of which already-strict files (no `@ts-nocheck`) exist for return-reference purposes.

## Prerequisites

- Read-only mode. Do not edit files during the audit.
- You can run shell commands: `npm run check:ts-progress`, `npm run typecheck`, PowerShell `Get-ChildItem`, and targeted greps.

### Tool exposure requirement
Before running anything, report the exact tools exposed in the current session.

## Evidence-gathering sequence (must run in this order)

Run these four in sequence; do not collapse or skip steps.

### Step 0: State surface-lite prerequisite scan (read-only)

Before any strictness removal, verify whether the target files depend on state fields that are still `unknown` in `types/state.d.ts`. Focus on:

- `state.camera`, `state.controls`, `state.renderer` — if still `unknown`, every access site either still carries an `as any` cast or has been triple-cast via a local ad-hoc type. Strictness removal will surface these first.
- `state.nodePositions`, `state.originalPositions`, `state.targetPositions` — verify the declared type matches the runtime shape (`Array<{x:number,y:number,z:number}>`, not `number[]`).
- `state.pointBaseColors`, `state.pointColorStateVersion`, and other typed-state fields accessed with indexed reads under `noUncheckedIndexedAccess`.

If this type layer is unchanged, do not attempt @ts-nocheck removal on files that read those fields; classify them as **type-deferred** rather than "safe now."

Practical rule for this repo: if you are about to remove `@ts-nocheck` from a file and you see `(state.foo as any)` inside it, check whether `state.foo` is still typed as `unknown`; if so, this is signal to update the shared interface first.

### Step 1: Baseline build state

```bash
npm run check:ts-progress 2>&1
npm run typecheck 2>&1
```

Record:
- Total `JS-only` / `TS-only` drift pairs. If non-zero, stop and use `TS_JS_DRIFT_CLOSURE_SLICE` first — strictness removal before drift closure causes regressions.
- Exit code for typecheck. If non-zero, stop and report the error count.
- tsconfig properties relevant to strictness: `strict`, `noImplicitAny`, `noUncheckedIndexedAccess`, `exclude`, and the child `include` set (if `tsconfig.typecheck.json` extends a parent that excludes `js/`, the TS shadow may still be compiled by a separate build entryPoints system — see Step 5 of DRIFT_CONTRACT_SHADOW_AUDIT).

### Step 1.5: Behavior-twin parity check (read-only; must complete before Step 2)

For every candidate `.ts` file, read the sibling `.js` and compare runtime behavior first. A clean typecheck does **not** mean safe to remove `@ts-nocheck`.

Check for:
- Missing preprocessing in TS vs JS (tokenizers, sanitizers, formatters)
- Missing exports, imports, or control-flow branches
- Different default-parameter expressions or fallback values
- Different error-handling paths or edge-case coercion

If JS behavior is not fully represented in TS, classify the file as **stale shadow** instead of safe candidate. Do not use `@ts-nocheck` removal status as evidence that the behaviors match.

### Step 2: Inventory `// @ts-nocheck` files

```powershell
Get-ChildItem -Path 'js\modules' -Filter '*.ts' -Recurse |
  ForEach-Object { $content = Get-Content $_.FullName -Raw; if ($content -match '//\s*@ts-nocheck') { ... } }
```

For each file, record: path, line count, and presence of `document.`, `THREE.`, `setTimeout`/`requestAnimationFrame`, `addEventListener`, `Proxy`/`Reflect`, and `state.` references.

Also list the already-strict files (no `@ts-nocheck`) — use as behavioral reference.

### Step 3: Behavioral signal scan

```powershell
Get-ChildItem -Path 'js\modules' -Filter '*.ts' -Recurse |
  ForEach-Object { $first = (Get-Content $_.FullName -First 1); if ($first -match '//\s*@ts-nocheck') { ... } }
```

Scan each `@ts-nocheck` file for:
- `TODO|FIXME|HACK|XXX|STUB|stub|placeholder` in comments
- `{ }` empty function bodies (use regex `function\s+\w+\([^)]*\)\s*\{\s*\}`)
- Function bodies that are only a comment, `return null`, or `return undefined`
- `Object.freeze(...)` paired with `as const` (known tsconfig incompatibility)
- `any` count (regex `\bany\b`) — high `any` count predicts strictness breakage

### Step 4: Dependency-count scan

```powershell
Get-ChildItem -Path 'js\modules' -Filter '*.ts' -Recurse |
  ForEach-Object { $content = Get-Content $_.FullName -Raw; ... }
```

For each `@ts-nocheck` file:
- Count `import` statements
- Count `export` statements  
- Check whether `role-label.ts` or similar is already strict (signal that the file is well-typed despite the nocheck)
- Files with 0 imports are strongest candidates (no transitive breakage risk)

Optional:
- TS/JS line ratio: compare line counts of `.ts` vs `.js` sibling. Low ratios (< 80%) usually mean the TS shadow was captured from an older JS state; high-value candidates are files where `.ts` is within ±5% of `.js`.
- `Object.freeze(...) as const` count: files with this pattern need a one-line fix before strictness can proceed.

### Step 5: Risk tier classification

Assign each file to one of three tiers using the evidence above.

| Tier | Characteristics | Action |
|---|---|---|
| **A: Leaf-safe** | ≤ 50 lines, 0–1 imports, no DOM/WebGL/Timers/Listeners, zero or low `any`, already has typed params | Remove `@ts-nocheck` immediately |
| **B: Module-safe** | ≤ 150 lines, ≤ 5 imports, no broad DOM/WebGL, 0–2 `any`, state-coupling is via established `withStateMutation()` pattern | Remove after light typing pass |
| **C: High-risk** | > 150 lines, DOM + WebGL + Timers, many imports, > 20 `any`, deep `state.js` coupling, todo/empty-body/stub markers | Defer |

Also tag as **ORPHAN-CANDIDATE** if the file is a `.ts` shadow where the `.js` sibling was recently deleted (post-m3 / m4 sweep). These need orphan verification before any action.

## Analysis output contract

Return the following sections verbatim. Do not omit sections.

### Top 20 strictness candidates with rationale

Rank by tier first (A before B), then line count (smaller before larger). For each candidate:

```
N. path/to/file.ts (L lines) — Tier A/B
Why safe: [reason citing specific risk signals]
Pre-flight: [one check before removal, e.g. fix Object.freeze + as const]
```

### 5 high-risk files to defer

List the top 5 by blast radius. For each:

```
N. path/to/file.ts (L lines)
Signals: [lists active warning signals]
Why defer: [reason, citing specific coupling or `any` count]
```

### Behavior-incomplete TS shadows (zero drift but functionally hollow)

Files that have `@ts-nocheck`, exist as TS shadows, but have empty/noop/comment-only bodies or explicit "delegates to Svelte" headers. For each:

```
- path/to/file.ts — pattern (empty body, no-op export, Svelte delegate)
- Notes: [whether callers are ported, orphan status, etc.]
```

Include a section called **Orphan-integrity caveat** if any of the following were recently deleted and the `.ts` shadows remain:
- `island-mount-helper.js`
- `search-results-svelte-island.js` / `selected-details-svelte-island.js` / `filter-chrome-island.js` / `search-chrome-island.js`

This caveat must cite the `feedback_orphan_file_claims.md` warning: before treating a file as dead, verify with `git grep` for the exact filename across static `import`, dynamic `import()`, `*.html`, and `*.css`.

### Recommended next worker wave

Specify 1–2 parallel workers with exact file scopes:

- Use "Wave A / Worker A1 / A2 / Worker B1" naming
- Each worker has: file list, risk tier, verification command sequence, expected common failure

## Verification contract per removal

After removing `// @ts-nocheck` from any file:

1. `npm run typecheck -- --force` or `npx tsc --noEmit -p tsconfig.typecheck.json`
2. `npm run check:ts-progress` (must stay at 0 drift pairs; drift pairs mean DRIFT_CLOSE first)
3. Optional sanity check: grep the file for `Object.freeze(...).as const` or other known tsconfig-breaking patterns before declaring success

## Anti-patterns to avoid

| Anti-pattern | Why it fails | Correct behavior |
|---|---|---|
| Remove `@ts-nocheck` from files with > 20 `any` or DOM+WebGL surface | Typecheck will explode; revert adds churn | Defer until types are ported or `any` localized |
| Trust prior report counts for `@ts-nocheck` | Commit changes file counts | Re-run PowerShell inventory from current filesystem |
| Skip orphan verification for post-sweep `.ts` shadows | M3/m4 sweeps deleted `.js` siblings; remaining `.ts` may be invisible to build | `git grep` exact filename + build before/after test |
| Treat `tsconfig.json` `exclude: ["js"]` as proof of deadness | `tsconfig.typecheck.json` include overrides parent `exclude`; build entryPoints may still compile .ts | Read actual build entryPoints in `scripts/build-app.mjs` |
| Remove `@ts-nocheck` before drift is 0 | `check:ts-progress` pairs are a precondition; drift masks true type errors | Use `TS_JS_DRIFT_CLOSURE_SLICE` first if drift > 0 |

## Related skills (use in order)

1. `DRIFT_CONTRACT_SHADOW_AUDIT` — if you encounter stale/recovered shadows or need to classify by recovery origin
2. `TS_JS_DRIFT_CLOSURE_SLICE` — if drift pairs are non-zero before strictness removal
3. `SVELTE_TS_BUILD_READINESS_SCAN` — if `npm run build:svelte` fails after removal and you need root-cause grouping
4. `DEAD_FILE_CLEANUP_VERIFICATION` — if orphan `@ts-nocheck` shadows need deletion rather than stricting

## Current verified state (2026-06-08 strictness verifier run)

Latest full-tree inventory from shell scan of `js/modules/**/*.ts` (excluding `components/`):

- Total `.ts` files: 151
- Files starting with `// @ts-nocheck` on line 1: 119
- Strict files (no `// @ts-nocheck` on line 1): 32
- `npx tsc --noEmit -p tsconfig.typecheck.json` result at this count: 0 errors

Relevance: the 0-error typecheck is *not* evidence that the codebase is fully strictable; it is evidence that `@ts-nocheck` is doing its job on 119 files. The strictness frontier is the 119 remaining candidates.

### WebGL/Three strictness blocker findings (2026-06-08)

A read-only triage of the 10 guarded WebGL/Three files (`webgl-context.ts`, `three-engine.ts`, `three-node-manager.ts`, `three-thread-manager.ts`, `three-interaction-visuals.ts`, `three-search-animations.ts`, `thread-inspector-webgl.ts`, `thread-inspector.ts`, `mycelium-engine.ts`, `utils/three-textures.ts`, `journey-webgl.ts`) produced a blocker map (`tmp/ts-strictness-delegation/webgl-three-report.md`). Key findings:

- **`nodePositions`, `targetPositions`, `originalPositions`** are typed as `number[]` in `types/state.d.ts` but runtime stores `Array<{x:number,y:number,z:number}>`. Removing `as any` from consumers without fixing this first is a latent type bug that would surface as property-access errors on `number`.
- **`WebGLContextState`** has `[key: string]: any` index signature that masks ~16 missing field declarations. Removing `@ts-nocheck` from consumers without widening the interface would surface missing property errors (desirable, but requires expansion first).
- **8 of 10 files** use `const state = _state as any` — the universal escape hatch because `SemanticState.d.ts` declares most WebGL fields as `unknown`.
- **Simpler files are safe candidates now**: `webgl-context.ts` (pure data object, 60 LOC) and `three-textures.ts` (pure functions, no state, 120 LOC) can be strictened without touching any other file.

### Safest next candidates (light-touch first)

From the verifier’s shell-scored list, Tier-A-style candidates include:

**WebGL-safe tier (new):**
- `js/modules/webgl-context.ts` — 60 LOC, pure data object. Add missing 16 fields to `WebGLContextState`, remove index signature `[key: string]: any`, then remove `@ts-nocheck`.
- `js/modules/utils/three-textures.ts` — 120 LOC, pure functions, no state/DOM beyond canvas creation. Type `THREE` namespace parameter and return `THREE.CanvasTexture` instead of `any`.

**Established Tier-A candidates:**
- `js/modules/scene-events.ts` — 8 lines, 0 imports, 0 runtime-risk signals
- `js/modules/inspected-strand-overlay-adapter.ts` — 15 lines, 0 imports
- `js/modules/bindings/search-bindings.ts` — 23 lines, 0 imports
- `js/modules/route-arrival-overlay-adapter.ts` — 30 lines, 0 imports
- `js/modules/utils/data-schema.ts` — 36 lines, 0 imports
- `js/modules/relationship-roles.ts` — 66 lines, already has `Readonly<Record<…>>`, `Object.freeze`, and a full interface; the directive is pure overhead
- `js/modules/journey-text-helpers.ts` — 29 lines, 1 import, no state/DOM/Three
- `js/modules/search-tokenizer.ts` — 89 lines, already extensively typed

Validation rule: remove `// @ts-nocheck` from one file, run `npx tsc --noEmit -p tsconfig.typecheck.json`, then decide whether to keep the change. Do not assume the heuristic list makes a file pass; the actual gate is the typecheck output.

### Riskiest deferred tier

Highest-blast-radius files to leave in `@ts-nocheck` until later:

- `js/modules/three-engine.ts`
- `js/modules/app.ts`
- `js/modules/three-interaction-visuals.ts`
- `js/modules/three-search-animations.ts`
- `js/modules/three-node-manager.ts`

All score high on state/THREE/DOM/WebGL signal count and on import complexity. Earlier strictness waves already removed `@ts-nocheck` from the other 6 engine files (`three-thread-manager.ts`, `mycelium-engine.ts`, etc.), so the remaining set is the harder residue.

### Worker edit risk pattern to watch

During strictness-related periods, avoid assuming a worker improved TS quality by line count or by producing a large `src/lib/**/*.ts` diff. From the 2026-06-08 verifier run:

- `src/lib/focus/pocket.ts` changed from 332 to 491 lines and re-exported 15 functions from new geometry/personality modules while switching the module from store reads to `@legacy/state.js` writes.
- `src/lib/stores/lifecycle.ts` added 342 lines by replacing stubs with cross-store logic plus event-bus publishes.
- `src/lib/journey/canvas-{hit-test,interaction,node-picking,hover}.ts` collectively added ~1000 lines of interdependent pointer-event logic.

These are not strictness-removal patterns; they are stub-to-real ports. They should be kept separate from strictness work in scope, commit ordering, and review.
