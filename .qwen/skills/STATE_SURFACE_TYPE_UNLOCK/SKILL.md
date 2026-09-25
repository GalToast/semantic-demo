---
name: STATE_SURFACE_TYPE_UNLOCK
description: Replace broad `unknown`/`any` state surfaces in TS declaration files with narrow runtime-matched interfaces/types, then verify with the project's standard typecheck tier.
source: auto-skill
extracted_at: '2026-06-08T19:45:00.000Z'
---

# State Surface Type Unlock

Use when a strictness wave has a **single, clearly bounded state surface** whose runtime shape is already known, and the blocker is that `types/state.d.ts` keeps it as `unknown`, `any`, or a wrong primitive type (`number[]` for objects, etc.).

It does this: adds minimal exported interfaces that model the *actually used* subset of the runtime surface, updates `SemanticState` fields to those shapes, runs the full verification tier, and writes a delegation report under `tmp/ts-strictness-delegation/`.

## When to use

- `tsconfig.typecheck.json` / `svelte-check` are green, but consumers of `state.*` are still loading broad types because the `.d.ts` boundary is too wide or wrong.
- The prior audit already identified a specific wrong type or missing interface (e.g. `nodePositions: number[]` while runtime stores `{x,y,z}` objects).
- You own the `.d.ts` file plus the report path; you do **not** own the runtime modules that consume the fields.
- The change is declaration-only; no runtime logic should change.

## Prerequisites

- You know the **exact** `types` file to edit (usually `types/state.d.ts`).
- You have a verified baseline: `npm run typecheck`, `npm run check:svelte`, `npm run check:ts-progress` all green before your edit.
- You have the delegation report path assigned (under `tmp/ts-strictness-delegation/`).
- You **may not** touch `js/modules/**`, `src/**`, `dist/**`, or package files.

## Execution sequence

### Step 1: Confirm exposed tools

List the exact tools in this session. If expected read/edit/shell tools are missing, stop and report the harness defect before touching any file.

### Step 2: Baseline snapshot

Run the three verification commands and record:

```bash
npm run typecheck 2>&1
npm run check:svelte 2>&1
npm run check:ts-progress 2>&1
```

All must be green. If not, stop and report pre-existing failures rather than guessing at fix scope.

### Step 3: Verify runtime shape at the source

Before changing any `.d.ts`, confirm the runtime shape:

1. Find the JS/TS file that **writes** the field (e.g. `.push({x,y,z})`, `state.xxx = someObject`).
2. Find files that **read** the field and note the accessed members (`.x/.y/.z`, `.clone()`, `.render()`, `.target`, etc.).
3. Record the gap between the declared type and the runtime shape.

If the runtime is ambiguous, do not invent fields; document the ambiguity in the report and leave the declaration conservative.

### Step 4: Add the narrow inter¬faces

Create one interface per *used runtime surface* — not per third-party class.

Rules:
- Members are **optional** unless always present at assignment time.
- Include only members **actually accessed** by consumers; do not import `THREE.*` into `types/state.d.ts`.
- Do not use `any` on the new interfaces unless the target already uses it and a narrower replacement would force unrelated changes.
- Keep the interfaces **exported** so they can be referenced by future consumers/inline reports/investigations.

Typical additions (adapt to the actual surface):

| Interface | Signals to model |
|---|---|
| `Vector3Like` | `x/y/z: number` + mutators such as `clone/set/copy/add/sub/multiplyScalar/normalize/lerpVectors/distanceTo/length/setLength` |
| `NodePosition` | Plain `{x,y,z}` object for indexed position arrays |
| `CameraLike` | `position: Vector3Like`, optional `fov/aspect/updateProjectionMatrix/lookAt` |
| `ControlsLike` | `target: Vector3Like`, `update()`, `enabled`, plus optional speed/distance members based on actual reads |
| `RendererLike` | `domElement`, `render()`, optional `compile/setSize/setPixelRatio/dispose`, plus a narrow `RendererInfo` |

### Step 5: Update `SemanticState` fields

Change only the fields you have directly verified. Keep surrounding types stable.

Common fields for this unlock step:
- `camera: CameraLike` (was `unknown`)
- `controls: ControlsLike` (was `unknown`)
- `renderer: RendererLike` (was `unknown`)
- `nodePositions / targetPositions / originalPositions: NodePosition[]` (was `number[]` or `unknown[]`)
- Missing numeric counters/fallbacks on diagnostic/interfaces that are written but not declared

Do **not** broaden other fields in the same diff. Kinetic change only.

### Step 6: Verification tier

Run the standard three-command tier and **compare against baseline exactly**.

Pass criteria:
- `typecheck`: same exit code, no new errors.
- `check:svelte`: same result; new diagnostics are regressions.
- `check:ts-progress`: 0 drift pairs, coverage unchanged or improved.

If a command fails:
1. Classify the failure as **caused by your declaration change** or **pre-existing / unrelated**.
2. If in-scope, make the minimal fix needed.
3. If out-of-scope, record the exact pre-existing failure in the report and stop.

### Step 7: Adversarial pass

Before declaring success, answer three questions:
- What would make this wrong? (e.g. did we read the writer or only consumers?)
- What edge cases are missing? (sparse arrays, optional chaining, overloads)
- What simpler explanation exists? (is a broader type already sufficient?)

This is mandatory per repo guidance; never ship the first answer.

### Step 8: Write the delegation report

Create or update one report file under `tmp/ts-strictness-delegation/`. Use this shape:

```
# <Title> Report

## Summary
...

## Files changed
...

## Verification result
| Command | Result |
|---|---|
| `npm run typecheck` | ... |
| `npm run check:svelte` | ... |
| `npm run check:ts-progress` | ... |

## Risks / unresolved issues
...
```

The report should be tight and factual — include file paths, field names, and exact shapes discovered.

## Output contract

### Files changed
- `types/state.d.ts`
- `tmp/ts-strictness-delegation/<report-name>.md`

### Verification result
- Each command: PASS / FAIL and delta-vs-baseline summary.

### Risks / unresolved issues
- List only concrete risks with the affected file path and exact remediation.

## Common patterns observed

| Pattern | Fix location | Example |
|---|---|---|
| `nodePositions[index].x` on `number[]` | `types/state.d.ts` → `NodePosition[]` | Runtime stores `{x,y,z}` |
| `state.camera.position.set(...)` on `unknown` | `types/state.d.ts` → `CameraLike` | Add narrow camera interface |
| `renderer.info.memory.textures` on `unknown` | `types/state.d.ts` → nested `RendererInfo*` | Narrow renderer info rather than `any` |
| Diagnostic field written but undeclared | `types/state.d.ts` → add optional property | Prevent implicit `any` |
| Primitive typed as object runtime shape | `types/state.d.ts` — type is `string`, `number[]`, or `null`, but runtime stores object | Correct field to `Record<string, unknown>` or narrow interface |
| `interface extends Base['prop']` | `An interface can only extend an identifier/qualified-name with optional type arguments` | Use `extends BaseInterface` (identifier) directly; do not index-extend |
| Position arrays may have sparse holes | Document in report; keep `NodePosition[]` rather than modeling sparse types unless TS shadows need it | Runtime guards exist at write sites |

## Anti-patterns

| Anti-pattern | What goes wrong | Correct behavior |
|---|---|---|
| Invent Three.js types via `import * as THREE` | Pulls concrete types into ambient state declarations | Use narrow literal inter¬faces in `types/state.d.ts`; use `typeof THREE` only in shader/engine-layer code |
| Add `[key: string]: any` to "fix" errors | Hides future regressions | Fix the specific missing member or widen to a concrete mapped type |
| Change fields outside the verified surface | Blast radius creeps into unowned modules | Edit only the surface that was the stated blocker |
| Skip adversary pass | Runtime shape assumptions persist | Answer the three adversarial questions before closing the turn |
| Touch source modules to "make types fit" | Out-of-scope; violates ownership | Repair the type boundary, not the producer |

## Related skills

- `LIFECYCLE_CAMERA_TS_STRICTNESS_TRIAGE` — domain triage that identifies the specific `state.*` blockers this skill then unlocks.
- `WEBGL_STRICTNESS_BLOCKER_MAP` — categorized WebGL/Three blocker inventory; this skill is the execution step for listed state-surface prerequisites.
- `TS_STRICTNESS_LEAF_REMOVAL_PASS` — execute strictness removal on leaf files once the shared type unlock is green.
