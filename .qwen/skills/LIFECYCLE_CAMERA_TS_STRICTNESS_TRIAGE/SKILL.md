---
name: LIFECYCLE_CAMERA_TS_STRICTNESS_TRIAGE
description: Read-only triage of a bounded set of guarded TS shadows in a specific domain (lifecycle/camera), producing a prioritized strictness plan with safe batches, blockers, and dependency sequencing.
source: auto-skill
extracted_at: '2026-06-08T19:32:10.843Z'
---

# Lifecycle/Camera TS Strictness Triage

Use when you have a bounded set of `@ts-nocheck` TS shadows in a specific domain (e.g., camera controls, lifecycle modules) and need a prioritized strictness plan with safe implementation batches, per-file blockers, and dependency sequencing.

It does this: read-only audit of the assigned file set, structured triage output identifying safe batches, state/type blockers, and deferred files.

## When to use

- A domain-specific slice of `js/modules/**/*.ts` files has been assigned for strictness evaluation.
- You need to decide which files can be unguarded now vs later, and what prerequisites (interfaces, type fixes) unlock the rest.
- The files have complex coupling to `state.js`, selectors, DOM, or WebGL that requires sequencing.
- You must produce a written report at a specific path without editing any source files.
- **Also use this skill when executing the safe strict-check wave for this domain:** remove `@ts-nocheck` from the confirmed-safe batch, add only the minimal local types needed for `typecheck` + `check:svelte` + `check:ts-progress` green, and write the delegation report.

## Prerequisites

- **Owned file list is explicit.** Know exactly which `.ts` files you may inspect.
- **Read-only mode.** Do not edit source files. You may write only the final report.
- **Tool exposure rule:** Before any analysis, report the exact tools exposed in the current session. If read/search tools are missing, stop and report the harness defect.
- **Use parallel reads.** If 10+ files are in scope, issue parallel `read_file` calls in a single message. Avoid sequential reads if parallel is possible.
- **Cross-reference JS twins.** For each TS shadow, read the sibling `.js` (or relevant JS twin) to understand behavioral parity and real runtime shapes.

## Evidence-gathering sequence

### Step 1: Parallel full reads of all owned files

Issue one batch of parallel reads for every file in the owned set. Do not paginate unless files exceed 300 lines.

Record for each file:
- Header pattern (`// @ts-nocheck` presence)
- Imports (from `.js` vs `.ts`; from `state.js` vs selectors)
- DOM/THREE/state surface area (`document.`, `THREE.`, `state.`, `window.`)
- Export count and function signatures
- `any` cast count (especially `(state.controls as any)`, `(state.camera as any)`)

### Step 2: JS twin comparison

For each owned TS file, identify and read the primary JS twin. Compare:
- Function signatures and default parameter expressions
- Runtime behavior (does the TS shadow skip any logic paths present in JS?)
- State mutation patterns (`withStateMutation` usage)
- Import paths (are they importing from `.js` directly, bypassing TS facades?)

Flag any file as **stale shadow** if JS behavior is not fully represented.

### Step 3: State typing surface audit

Identify all `state.*` properties accessed by owned files. Cross-reference against `types/state.d.ts`:
- Properties typed as `unknown` that are accessed with property chains (e.g., `state.camera.position.set(...)`)
- Properties typed as `number[]` that are accessed with `.x/.y/.z` (runtime shape mismatch)
- Properties missing from `SemanticState` entirely (implicit `any` through module augmentation)

This step identifies the single highest-leverage type additions.

### Step 4: Selector typing audit

Identify all selectors imported by owned files (`from '../state/selectors/...'`). Determine if selector type declarations exist (.d.ts files). If selectors are JS-only, note this as a secondary blocker (implicit `any` values).

### Step 5: Dependency graph within the owned set

Map dependencies between owned files:
- Which files import from which other owned files?
- Which files import from JS-only modules that have no TS counterpart?
- Identify circular dependencies or import cycles.

Use this to define safe batches where files in a batch have no dependencies on each other or on deferred files.

### Step 6: Consumer audit outside owned set

Check if owned files are consumed by:
- Facade/barrel re-exports (e.g., `camera-controls.ts`)
- Svelte stores (`src/lib/stores/*.ts`)
- App shell or lifecycle bridge

This determines whether strictness removal in an owned file unblocks downstream TS ports.

## Analysis output contract

Write a markdown report to the specified path with these sections:

### Tools exposed
List the exact tools available in this session. If any are missing, note the harness defect.

### Recommended safe implementation batch
A numbered list of 3–6 files that can be processed immediately, ordered by effort (smallest first). For each file:
- **File**: `path/to/file.ts` (L lines)
- **Why safe**: Specific risk signals (no DOM/WebGL/Timers, already typed, leaf consumer)
- **Effort**: S / M / L
- **Pre-flight**: One check before starting (e.g., fix `Object.freeze` + `as const` pattern)

### Per-file blockers/fixes
For every file in the owned set:
1. **State typing blockers**: What `state.*` properties need typing or interface definitions?
2. **Import blockers**: Does the file import from JS-only modules? List them.
3. **Structural blockers**: Does the file use patterns that fail strictness (e.g., `as any` on every property access, `Object.freeze(...) as const`)?
4. **Local fix vs broad blocker**: Can this be fixed in-file, or does it require a change to `types/state.d.ts` or a new type file?

For each blocker, give the exact local fix.

### Files that should stay guarded
List files that should remain `@ts-nocheck` until specific conditions are met:
- **Prerequisites**: What must be done first?
- **Why**: Specific coupling or complexity signals.
- **Risk if forced**: What breaks if unguarded too early?

### Critical unguarding paths
Identify the specific interface or type additions that unlock the most files. For example:
- "Adding `CameraLike` interface to `types/state.d.ts` unblocks 6 of 11 files"
- "Fixing `nodePositions: number[]` → `Array<{x:number;y:number;z:number}>` unblocks 4 files"

This is the highest-leverage information for the implementation wave.

### Risks
List risks with file paths and exact remediation:
1. **Risk name** — file path, why it's a risk, how it manifests, remediation

### Verification
State that this was a read-only triage. No source files were edited.

### Report path
State the exact path where this report was written.

## Common blocking patterns to identify

| Pattern | Likely checker error | Fix location |
|---|---|---|
| `(state.controls as any).autoRotate` | `unknown` has no property `autoRotate` | `types/state.d.ts` — `ControlsLike` interface |
| `state.nodePositions[index].x` on `number[]` | `Property 'x' does not exist on type 'number'` | `types/state.d.ts` — fix array element type |
| `state.focusPocketMeta.viewportProfile` on `unknown` | `Object is of type 'unknown'` | `types/state.d.ts` — `FocusPocketMeta` interface |
| `document.getElementById('x')?.classList` | `Object is possibly 'null'` | In-file null guard or `!` assertion |
| `new THREE.Vector3()` | Missing type imports or `node_modules` not in scope | Verify `three` types are in `tsconfig.json` |
| `Object.freeze({...}) as const` | `The type 'readonly [number, number, number]' is 'const'` | Drop `as const` or drop `Object.freeze` |

## Anti-patterns to avoid

| Anti-pattern | Why it fails | Correct behavior |
|---|---|---|
| Recommend removing `@ts-nocheck` from files with > 10 `any` casts on `state.*` | Type system will explode; revert adds churn | Require interface definitions first |
| Skip JS twin comparison | Type green ≠ runtime parity | Always read the sibling JS before classifying |
| Treat `any` from JS imports as acceptable | Hides real type mismatches; deferred files stay deferred longer | Note but don't block; flag selectors as secondary |
| Order batches by line count alone | Dependency ordering matters more than file size | Order by dependency depth, then line count |
| Propose broad `[key: string]: any` on state interfaces | Masks the real problem; future callsites still get `any` | Narrow interfaces for the properties actually accessed |

## Related skills

- `TS_STRICTNESS_REMOVAL_PRIORITIZATION` — full-tree audit of all `@ts-nocheck` files, not domain-scoped
- `TS_STRICTNESS_LEAF_REMOVAL_PASS` — execution of strictness removal on a confirmed leaf-safe batch
- `TS_JS_DRIFT_CLOSURE_SLICE` — if TS/JS drift pairs are non-zero before strictness work
- `DRIFT_CONTRACT_SHADOW_AUDIT` — classifies .ts shadows by recovery origin and drift status
