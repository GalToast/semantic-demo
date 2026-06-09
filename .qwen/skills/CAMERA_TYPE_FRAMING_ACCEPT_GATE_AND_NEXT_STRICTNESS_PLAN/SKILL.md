---
name: CAMERA_TYPE_FRAMING_ACCEPT_GATE_AND_NEXT_STRICTNESS_PLAN
description: Read-only acceptance review of peer/subagent TS type-framing edits plus a follow-up strictness patch plan for the next WebGL seam.
source: auto-skill
extracted_at: '2026-06-09T00:52:12.561Z'
---

# Camera Type-Framing Accept Gate + Next Strictness Plan

Use when you must evaluate whether peer/subagent TypeScript type broadened a global/shared state surface acceptably or over-broadly, and then identify the immediate downstream strictness seam for WebGL/Three.

It does this: bounded read-only cross-file audit of type-surface changes, verification with focused typecheck commands, accept/reject with exact risks, and a narrow next-strictness patch plan for the next leaf module.

## When to use

- A worker narrowed shared state types in `types/*.d.ts` plus domain TS shadows; main lane has not accepted yet.
- You must decide if the broadened types are accurate, over-broad, or should be refactored into smaller shared types.
- The next strictness UI/WebGL seam is already known or suspected (e.g., replacing `const state = _state as any` in a leaf module).
- You need a written report at a specific path without editing any source files.

## Prerequisites

- **Scope is explicit.** Know exactly which files may be inspected and which are off-limits.
- **Read-only mode.** Do not edit source files. Write only the final report.
- **Tool exposure rule:** Before any analysis, report the exact tools exposed in this session. If any are missing, report the harness defect and stop.
- **Respect memory guidance.** Before claiming a file is orphan/unreferenced/over-broad, verify with source checks (grep/shell). Claims from prior agents are not ground truth.

## Evidence-gathering sequence

### Step 1: Tool and ownership check

Report the tools exposed. Restate the ownership boundary from the task prompt so future reads stay in-scope.

### Step 2: Read changed type surfaces first

Start with `types/*.d.ts` before reading any TS shadow. Identify:
- New interface additions vs replacements
- Fields changed from `unknown`/`number[]`/`string` to a structured type
- Fields that were *incorrect* before and are now correct
- New `@ts-nocheck` presence anywhere in scope

### Step 3: Compare JS/TS semantic parity

For each TS shadow, read its JS twin to confirm parity of:
- imports
- exported function names/signatures
- runtime logic branches
- TODO TODOs or omitted logic paths

Flag any file as drift/stale if JS behavior is not represented.

### Step 4: Run focused verification commands only

Prefer commands that cover just the seams you changed:
- typecheck: `npm run typecheck` or the narrower tsconfig command if provided
- ts-progress: `npm run check:ts-progress`
Avoid full browser/contract suites unless explicitly requested.

### Step 5: Assess seam breadth and divergence risks

For each changed type seam:
- Is it accurately describing runtime or over-broad?
- Does it introduce a duplicate type that already exists in another file?
- Does it break existing typed consumers?
- Did it fix a latent wrong-type (e.g., `number[]` used as `.x/.y/.z` object)?
- Is the change necessary for downstream strictness progress?

Map every distinct seam in scope:
1. Global/shared state type changes in `types/*.d.ts`
2. Local type overrides in TS shadows versus shared ambient types
3. Bridges like `camera-framing-utils.ts` still using `any`

### Step 6: Identify the strictness seam to follow

From the current `as any` escapes in WebGL/Three leaf modules (especially `three-interaction-visuals.ts`), identify:
- Whether the module is truly leaf (imported by app shell/orchestrator only)
- The exact `as any` escape location
- Imports needed for a stricter typed alias
- Verification commands a follow-up worker should run
- Blast radius and likely side effects

## Shared-type abstraction pattern (implementation guidance)

When a pass consolidates duplicate local camera/choreography interfaces across already-strict sibling TS shadows, use this minimal pattern instead of broad new global types.

### Step 6a: Create a minimal shared types file

Create a sibling file scoped to the domain (example: `camera-controls-choreography-types.ts`). Export only the narrow interfaces actually shared across the renamed modules:
- `ChoreographyCamera`
- `ChoreographyControls`
- `ChoreographyPersonality`

Keep the file small. Do not pull in unrelated state shapes here.

### Step 6b: Migrate local interfaces to shared imports

In each sibling module:
- Remove the local duplicate interface.
- Replace with imports from the shared types file.
- Where a subtype must stay assignable to a base `Record<string, unknown>` state field, add `[key: string]: unknown` to the shared interface rather than importing the broad helper parameter type.

### Step 6c: Simplify double-casts only where justified

For selectors that return `any` (untyped JS barrel returning `state.X`):
- Replace `as unknown as T` with `as T` on the direct return path.
- Keep longer double-casts that bridge two incompatible high-level state shapes (for example, `SemanticState` → `FocusCameraState` when the override changes a nested subtype).

### Step 6d: Clean up unused imports

If a module no longer references a parameter type from a math/helper file after switching to the shared personality type, remove it to avoid dead type references.

## Output contract

Write a markdown report to the specified path with these sections:

### Routing/tool sanity
List the exact tools exposed and the model/route in use if relevant.

### Edit inventory
For each changed/new file:
- **File:** path
- **Pattern:** modified vs untracked
- **Semantic parity with JS twin:** green/yellow/red
- **New design surface:** interfaces/types added or renamed

### Accept/reject recommendation with exact risks
One of: **ACCEPT**, **ACCEPT WITH FOLLOW-UP**, or **REJECT**.
Under risks, enumerate exact failure modes, affected consumers, and whether typecheck green is sufficient.

### Triple-seam / type-divergence audit
Call out overlapping type surfaces (duplicate interfaces, `any` bridges still in place, narrowed subclass types versus shared ambient types). This is the main reason a follow-up refactor is needed.

### Verification results
All commands run, their exit codes, and any caveats from staleness-aware checks.

### Guard removal decision
State whether `@ts-nocheck` was removed, deferred, or not applicable, with the exact rationale.

### Remaining risks / follow-up
Enumerate residual risks, remaining double-casts, and what the next worker/edit lane should target.

## Anti-patterns to avoid

| Anti-pattern | Why it fails | Correct behavior |
|---|---|---|
| Pass an accept/reject based only on typecheck green | Typecheck green can mask over-broad or duplicate types | Inspect interfaces for duplication and accuracy first |
| Treat in-process reads as fresh after a worker edit | Stale reads can silently mis-triage | Verify with shell commands when needed; cross-check JS/TS twins before claiming drift absent |
| Skip JS twin comparison | Type green ≠ runtime parity | Always compare to the JS source before approving |
| Create a new "broad" type to escape a narrow seam | Defeats the strictness purpose | Keep shared types narrow; refactor duplicate locals into shared interfaces |
| Propose removing shared state types before consumer readiness | Breaks the whole migration tree | Identify leaf modules first and define blast radius |

## Related skills

- `LIFECYCLE_CAMERA_TS_STRICTNESS_TRIAGE` — domain-scoped triage of `@ts-nocheck` camera/lifecycle shadows
- `WEBGL_STRICTNESS_BLOCKER_MAP` — classifies WebGL/Three blockers and safe candidates
- `TS_JS_DRIFT_CLOSURE_SLICE` — identify and close TS/JS drift pairs before acceptance
- `DRIFT_CONTRACT_SHADOW_AUDIT` — classifies .ts shadows by recovery origin and drift status
