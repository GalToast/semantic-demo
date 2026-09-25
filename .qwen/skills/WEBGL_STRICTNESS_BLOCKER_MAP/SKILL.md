---
name: WEBGL_STRICTNESS_BLOCKER_MAP
description: Triage and targeted fix of guarded TypeScript WebGL/Three/thread shadow modules to map strictness blockers or resolve a single file’s strictness errors with narrow local types.
source: auto-skill
extracted_at: '2026-06-08T19:16:24.559Z'
---

# WebGL Strictness Blocker Map

Use when a TS migration wave needs a read-only triage of `@ts-nocheck`-guarded WebGL/Three files to identify which can be strictened now, what prerequisite type definitions must land first, and what latent type bugs would surface if `as any` escapes are removed naively.

It also supports a **fix-execution mode** for a single assigned file whose strictness blockers are already known: fix only that file using narrow local types, preserve runtime behavior/imports/exports, verify with the project’s strictness checks, and report exact changes/risks.

It does this: inspects the guarded files and their type declarations, classifies blockers by category (missing Three types, runtime state field types, DOM/Event types, cleanup/disposal types, unchecked indexed access), ranks safe candidates, and writes a single blocker-map report. In fix mode, it applies the smallest type surface needed to clear the file’s strictness errors and does not chase errors outside the assigned file.

## When to use

- A migration wave needs to understand strictness readiness for WebGL/Three/thread TS shadows before executing `@ts-nocheck` removal.
- There are latent type bugs (e.g., `SemanticState.nodePositions: number[]` but runtime stores `Array<{x,y,z}>`) that would crash consumers if `as any` is removed without fixing the interface first.
- You need to identify small safe files that can be strictened as a "tightening demonstration" without touching high-risk runtime surfaces.
- A single high-signal file is already scoped and needs an executable strictness-fix pass with verification and handoff notes.

## Modes

| Mode | Trigger | Outcome |
|---|---|---|
| `triage` | “map blockers / identify safe candidates / list prerequisites” | blocker-map report only; no source edits |
| `fix` | “own this file end-to-end / resolve strictness errors” | minimal source edits in the assigned file + triage-style report with verification + unchanged JS parity restored if no runtime bug |

## Prerequisites

- All target files start with `// @ts-nocheck`.
- Identify whether the run is `triage` or `fix` before editing.
- In `triage` mode: you may read source files and type declarations (`types/*.d.ts`), but may not edit source files.
- In `fix` mode: edit only the assigned file unless a prerequisite type declaration must change to preserve runtime behavior.
- You may write exactly one report file under `tmp/<run-id>-webgl-strictness/` (fix mode) or the configured triage report path.
- All relevant tools (`read_file`, `grep_search`, `glob`, `write_file`, `run_shell_command`) are exposed. If read/search tools are missing, halt and report the harness defect before proceeding.

## Blocker taxonomy

Classify every blocker into exactly one of these categories:

| Category | Examples |
|---|---|
| **Missing Three types** | `any` cast on `THREE.*` constructors, `THREE.ShaderMaterial`, buffer attributes typed as `any[]`, missing `WebGLInfo`, `OrbitControls` event map types |
| **Runtime state field types** | `state.nodePositions: number[]` but runtime stores objects; `state.pointBaseColors: unknown` but runtime stores `Float32Array`; fields missing from `SemanticState` entirely (`overviewBounds`, `anchorBloomLight`) |
| **DOM/Event types** | `document.createElement`, `window.addEventListener`, `canvas.getContext`, `setTimeout` return type mismatches (NodeJS.Timeout vs number), non-null assertions on canvas contexts |
| **Cleanup/disposal types** | `disposeObject3D` called on `THREE.Group` without geometry/material guarantees; texture dispose loops that assume `THREE.Texture.dispose()` exists |
| **Unchecked indexed access** | `state.pointBaseColors[colorOffset]` under `noUncheckedIndexedAccess` with no `??` fallback; `Array[index]` access without `Number.isFinite` guard typed as safe |
| **State-lite surface gaps** | `state.camera`/`state.controls`/`state.renderer` are still `unknown`, forcing generic ad-hoc local-like interfaces (`AppStateLike`, inline DOM types) instead of shared `CameraLike`/`ControlsLike`/`RendererLike` definitions |

## Evidence-gathering sequence

### Step 1: Inventory all `@ts-nocheck` files in the target slice

Run a glob or grep across the owned paths. Record each file's path, line count, and risk signals: `document.`, `THREE.`, `setTimeout/requestAnimationFrame`, `addEventListener`, `state.` references. Do not trust prior counts; re-inventory from current filesystem.

### Step 2: Read the type declarations that consume these files

For every file that imports from `types/*.d.ts`, read the relevant declaration. Common ownership:
- `types/state.d.ts` — `SemanticState`, `NavState`, `Point`, `InspectedStrandDiagnostics`, etc.
- `types/three-engine.d.ts` — `WebGLContextState`, `PointData`, `Diagnostics`
- `state/selectors/index.ts` — return types for all `get*` selectors

Identify mismatches between declared types and actual runtime usage.

### Step 3: Classify each file's blockers

For each target file, enumerate blockers by category from the taxonomy above. Do not count `as any` occurrences without explaining what they escape and what type is missing.

Also identify:
- **Universal escape hatches**: `const state = _state as any` or `(window as any)` patterns that appear in multiple files.
- **Index signature escape hatches**: `[key: string]: any` on interfaces like `WebGLContextState`.
- **Wrong-type traps**: Fields declared with incorrect types that would produce *wrong* behavior if strict, not just compile errors (e.g., `number[]` for objects — accessing `.x` at runtime would return `undefined`).

### Step 4: Rank safe candidates

A file is **safe now** if:
- It has ≤ 2 blocker categories.
- The blockers are purely in adjacent type declarations (not in the file itself).
- Fixing the declarations does not require changing any other `.ts` file's runtime logic.
- The file has ≤ 1 import, no `state.` mutation, and no `document.` / `window.` side effects beyond simple probes.

Rank candidates by:
1. Fewest blockers.
2. Smallest blast radius (fewest downstream consumers that would be affected by type changes).
3. Pure-function > pure-data-object > orchestrator > state-mutator.

### Step 5: Identify prerequisite type definitions

List every type declaration change that would unblock at least one safe candidate. For each prerequisite, specify:
- Which file needs the change (`types/state.d.ts`, `types/three-engine.d.ts`, `state/selectors/index.ts`, etc.).
- What new fields/types/interfaces are needed.
- Whether removing the prerequisite-first change would be load-bearing (i.e., other files depend on it).

### Step 6: Flag latent type bugs

Explicitly call out any `as any` escape that hides a **wrong type** rather than a **missing type**:
- `nodePositions: number[]` — runtime stores `{x,y,z}` objects. Accessing `pos.x` where `pos: number` would return `undefined`, not a type error.
- `pointBaseColors: unknown` — runtime stores `Float32Array`. Indexed access without casting would fail at compile.
- Missing fields in `SemanticState` — files write `state.anchorBloomLight = ...` but it's not in the interface. With strict mode, these would be compile errors (good) but some consumers might fail to compile.

## Output contract

Return these sections verbatim.

### Tools exposed
List the read/search/write tools present in this session. If any expected tool is missing, stop and report the harness defect before proceeding.

### Blocker map by file
For each file:

```
#### `path/to/file.ts` (N lines) — RISK_RANK
| Blocker | Detail |
|---------|--------|
| Category | Description of the specific type gap |
| ... | ... |
```

Risk rank: `SAFE` / `MEDIUM` / `HIGH` / `TRIVIAL` (re-export only).

### Safe next candidates
A ranked table:

| Rank | File | Why safe | Prerequisite |
|------|------|----------|--------------|
| 1 | `webgl-context.ts` | Pure data object, zero runtime logic | Add missing fields to `WebGLContextState`; keep `[key: string]: any` until consumers are strictened |
| 2 | `three-textures.ts` | Pure functions, no state mutation | Type `THREE` namespace and return `THREE.CanvasTexture` |

### Prerequisite type definitions needed
Enumerate each needed type change:

```ts
// In types/state.d.ts
interface SemanticState {
  nodePositions: Array<{x:number, y:number, z:number}>; // was number[]
  scene: THREE.Scene | null; // was unknown
  camera: THREE.PerspectiveCamera | null;
  ...
}
```

### Latent type bugs
Explicit callouts of wrong types that would break at runtime if `as any` were removed without fixing the declaration:

- `SemanticState.nodePositions: number[]` — runtime stores position objects

### Report path
State the absolute path where the report was written (e.g., `tmp/ts-strictness-delegation/webgl-three-report.md`).

## Anti-patterns to avoid

| Anti-pattern | Why it fails | Correct behavior |
|---|---|---|
| Reporting vague "many errors" without categorizing | Next worker cannot triage | Every blocker must map to one taxonomy category |
| Removing `@ts-nocheck` during triage | Triage is read-only | Write the report, do not edit source |
| Trusting type declarations over runtime facts | Declarations can be wrong | Cross-check `SemanticState` against actual `state.nodePositions.push({x,y,z})` usage |
| Missing the wrong-type trap | `as any` hides both missing and wrong types | Explicitly separate "missing type" from "wrong type" in the blocker map |
| Including files outside the assigned ownership | Scope creep | Halt and record as adjacent seam |

## Related skills

- `TS_STRICTNESS_REMOVAL_PRIORITIZATION` — use after this triage to rank all candidates project-wide
- `TS_STRICTNESS_LEAF_REMOVAL_PASS` — use after this triage to execute on safe candidates
- `DRIFT_CONTRACT_SHADOW_AUDIT` — use if you discover stale/recovered shadows during the blocker scan
