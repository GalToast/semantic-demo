# Subagent Prompt Quality & Task Sizing Audit

**Date:** 2026-06-06
**Scope:** thread-inspector-prompt.md vs map-summary-prompt.md
**Outcome:** ThreadInspector timed out at 600s; MapSummary completed in ~5 min

---

## 1. Side-by-Side Prompt Comparison

| Dimension | ThreadInspector | MapSummary | Winner |
|---|---|---|---|
| **Prompt length** | 27 lines | 27 lines | Tie |
| **Requirements count** | 5 | 5 | Tie |
| **Legacy code to read** | 753 lines (457 + 296) | ~15 lines (re-export stub) | MapSummary |
| **Technology** | WebGL shaders + Three.js lifecycle | SVG + pure DOM | MapSummary |
| **Infrastructure deps** | bridge.ts extension, new store, new types | Existing stores only | MapSummary |
| **Scope ambiguity** | High ("integrate from legacy") | Low ("render SVG path") | MapSummary |
| **Phased structure** | None | None | Tie (both bad) |
| **Success criteria** | Implicit | Implicit | Tie (both bad) |
| **Timeout guidance** | None | None | Tie (both bad) |

**Scoring (1-5, 5=best):**

| Criterion | ThreadInspector | MapSummary |
|---|---|---|
| Scope clarity | 2 | 4 |
| Feasibility within timeout | 1 | 5 |
| Legacy code ratio (read:write) | 0.1:1 (753 lines read for ~107 lines written) | 10:1 (15 lines read for ~258 lines written) |
| Infrastructure overhead | 4 new files touched | 0 new files |
| Deliverable specificity | 2 | 4 |
| **Overall** | **1.6** | **4.4** |

---

## 2. Root Cause Analysis: Why ThreadInspector Failed

### 2.1 The Infrastructure Trap

The ThreadInspector prompt asked for 5 things:
1. WebGL line rendering integration
2. Lifecycle management (dispose on unmount)
3. Store integration (read from Svelte stores)
4. Bridge API usage (syncInspectedStrand/disposeInspectedStrand)
5. Types + build verification

The worker spent its budget on **infrastructure that didn't exist yet**:
- Extended `bridge.ts` with `syncInspectedStrand()` / `disposeInspectedStrand()` (new methods)
- Created `src/lib/stores/engine-bridge.ts` (new store)
- Extended `src/lib/types/state.ts` with `ThreadOverlayDiagnostics`
- Wired `Canvas.svelte` to publish bridge to store
- Verified build passed

By the time infrastructure was ready, the 600s timeout hit. The actual component work — a ~10-line `$effect` hookup — was never started.

**The prompt didn't distinguish between "infrastructure" and "component work."** The worker correctly prioritized infrastructure (you can't wire a component to a bridge that doesn't exist), but the prompt treated all 5 requirements as a single undifferentiated task.

### 2.2 Legacy Code Complexity Asymmetry

| File | Lines | Content |
|---|---|---|
| `thread-inspector.js` | 457 | Full inspection logic, state management, event subscriptions, DOM sync |
| `thread-inspector-webgl.js` | 296 | Three.js geometry, shaders, curve math, buffer management |
| `journey-route-trace.ts` | 248 | WebGL shader material, but MapSummary only needed the trail data model |
| `journey-route-trace.js` | 15 | Just re-exports — stub |

The ThreadInspector worker had to **understand 753 lines of WebGL/Three.js code** to know what to port. The MapSummary worker had to understand **15 lines of re-exports** and infer behavior from the component stub.

### 2.3 Technology Gap

**ThreadInspector** required:
- Three.js `LineSegments` geometry
- Custom `ShaderMaterial` with vertex/fragment shaders
- Curve math (bezier, arc segments)
- Buffer attribute lifecycle (create, update, dispose)
- GPU resource cleanup on component unmount
- Bridge delegation pattern (imperative → Svelte)

**MapSummary** required:
- SVG `<path>` elements (declarative, no lifecycle)
- `$derived` reactive state
- Math for hub-and-spoke layout (cos/sin)
- No GPU, no cleanup, no bridge

WebGL integration is fundamentally harder than SVG because of **resource lifecycle**. A misused SVG path is invisible; a leaked Three.js geometry crashes the GPU.

### 2.4 Scope Ambiguity

ThreadInspector prompt said: *"Integrate the WebGL line rendering from the legacy module"*

This is ambiguous:
- Port all 296 lines of `thread-inspector-webgl.js`? (No — too much)
- Port the curve math and re-implement with bridge calls? (Maybe)
- Just call `bridge.syncInspectedStrand()` and let the bridge handle it? (Yes — but the bridge didn't exist yet)

The worker had to **figure out the architecture** before it could implement. That's a planning task + implementation task in one.

---

## 3. Revised Prompt Template

```markdown
# [ComponentName].svelte — [One-Line Description]

## Objective
[Clear, specific deliverable. One sentence.]

## Phase 1: Read & Plan (estimate: X min)
Read these files and return a plan before writing any code:
1. [Legacy file 1] — [what to look for]
2. [Legacy file 2] — [what to look for]
3. [Target component] — current state
4. [Reference component] — pattern to follow

**Plan must include:**
- Which legacy functions map to which bridge/store calls
- What new infrastructure is needed (if any)
- What can be skipped (legacy code that doesn't apply to the Svelte version)
- Estimated lines of code for the final component

**Stop here and return the plan.** The main lane will review before Phase 2.

## Phase 2: Infrastructure (estimate: X min)
[Only if Phase 1 identified missing infrastructure]

Extend these files:
- `src/lib/engine/bridge.ts` — add [specific method names] delegating to [legacy module]
- `src/lib/types/[file].ts` — add [specific type names]
- `src/lib/stores/[file].ts` — [if new store needed]

**Verify:** `npm run build:svelte` passes after each file edit.

## Phase 3: Component Implementation (estimate: X min)
Complete `src/components/[Component].svelte`:

1. **Imports:** [specific stores, bridge methods, types]
2. **Reactivity:** [specific $derived / $effect patterns]
3. **Template:** [specific DOM structure]
4. **Cleanup:** [specific disposal pattern]

**Do NOT:**
- Import Three.js directly
- Use `any` type
- Hardcode z-index (use `var(--z-*)`)
- Create new files unless the plan specified them

## Phase 4: Verify (estimate: X min)
1. `npm run build:svelte` — must pass
2. `npm run check` — must pass (or document expected legacy errors)
3. Return: changed files list, lines added/removed, any risks

## Time Budget
- Total: [X] minutes
- If behind schedule: complete Phase 3 with minimal Phase 2 infrastructure
  (skip type additions, skip extra bridge methods, use `as any` temporarily)
- Hard stop: return changed files + what's incomplete at timeout
```

---

## 4. Task Scope vs Timeout Budget Guidelines

### 4.1 Complexity Tiers

| Tier | Description | Examples | Recommended Timeout |
|---|---|---|---|
| **T1: Read-only** | Research, audit, report | Bug hunt, code review, prompt audit | 300s (5 min) |
| **T2: Simple write** | Single file, existing patterns | SVG component, CSS fix, store addition | 600s (10 min) |
| **T3: Infrastructure** | Multiple files, new patterns | Bridge extension, new store + types, build config | 900s (15 min) |
| **T4: Integration** | WebGL/Three.js, cross-module wiring | Thread inspector, semantic overlay, camera choreography | 1200s (20 min) OR split |

### 4.2 The 70% Rule

**If the prompt requires reading >200 lines of legacy code to understand the task, the worker will spend >70% of its budget on reading/planning, not writing.**

Mitigation options:
1. **Pre-digest the legacy code** — include a "Legacy Behavior Summary" in the prompt with the specific functions, parameters, and return values the worker needs
2. **Split into read + write workers** — Worker A reads and returns a plan; Worker B implements from the plan
3. **Reduce read scope** — point to specific line ranges, not entire files

### 4.3 The Infrastructure Tax

Any task that requires **creating new files** (stores, types, bridge methods) adds ~3-5 min of infrastructure overhead before the actual component work begins. Account for this:

| Infrastructure Needed | Estimated Overhead |
|---|---|
| New type definition | 1-2 min |
| New store | 2-3 min |
| Bridge method extension | 3-5 min |
| Canvas.svelte wiring | 2-3 min |
| **Total if all needed** | **8-13 min** |

For a 600s timeout, infrastructure can consume 50%+ of the budget.

---

## 5. When to Split vs One Longer Worker

### 5.1 Split When:

1. **Legacy code is >300 lines and contains WebGL/shader logic** — the reader needs focused attention separate from the writer
2. **Infrastructure doesn't exist yet** — Phase 1 (infra) and Phase 3 (component) are independent tasks
3. **The task has a natural checkpoint** — "return a plan" is a clean handoff point
4. **Multiple workers can write to different files without conflict** — e.g., one extends bridge.ts, another writes the component

### 5.2 Don't Split When:

1. **The task is <200 lines total** — split overhead exceeds the benefit
2. **The component depends on infrastructure that doesn't exist** — Worker B can't start until Worker A finishes, so just give Worker A more time
3. **The legacy code is simple** (<50 lines, no WebGL) — one worker can read + write in a single pass
4. **The task is research-only** — no implementation, just analysis

### 5.3 The ThreadInspector Should Have Been Split:

**Worker A (Infrastructure, 600s):**
- Read `thread-inspector-webgl.js` lines 1-100 (function signatures only)
- Extend `bridge.ts` with `syncInspectedStrand()` / `disposeInspectedStrand()`
- Create `src/lib/stores/engine-bridge.ts`
- Add `ThreadOverlayDiagnostics` type
- Verify build passes

**Worker B (Component, 600s):**
- Read the existing `ThreadInspector.svelte` (107 lines) + bridge.ts (just the new methods)
- Add the `$effect` block for WebGL overlay sync
- Wire event handlers
- Verify build passes

This splits along the **infrastructure/component boundary** and ensures each worker has a clear, completable deliverable.

---

## 6. Prompt Anti-Patterns Identified

### 6.1 The "Everything At Once" List
**Bad:** "Do X, Y, Z, and also A, B, C"
**Good:** "Phase 1: A. Phase 2: B. Phase 3: C. Stop after each phase."

### 6.2 The Vague Integration Target
**Bad:** "Integrate the WebGL line rendering from the legacy module"
**Good:** "Call `bridge.syncInspectedStrand()` in a `$effect` block, passing the inspected index and focused index. See `Canvas.svelte` lines 45-60 for the bridge delegation pattern."

### 6.3 Missing Success Criteria
**Bad:** "Ensure build passes"
**Good:** "Run `npm run build:svelte`. If it fails, fix the errors. If it passes, run `npm run check` and document any legacy-only errors (these are expected)."

### 6.4 No "What to Skip" Guidance
**Bad:** [no guidance]
**Good:** "Skip: (1) the shader math from thread-inspector-webgl.js — the bridge handles this, (2) the DOM sync logic — the component uses Svelte reactivity, not imperative DOM updates"

### 6.5 No Timeout Contingency
**Bad:** [no guidance]
**Good:** "If you're behind schedule after 10 minutes: complete the component with placeholder values for any missing infrastructure, document what's incomplete, and return."

---

## 7. Revised Prompt: ThreadInspector (Re-Split Version)

### Worker A: ThreadInspector Infrastructure

```markdown
# ThreadInspector Infrastructure — Bridge + Store + Types

## Objective
Extend the engine bridge, create a shared store, and add types needed for
ThreadInspector WebGL overlay sync. This is infrastructure only — the
component itself will be completed by a follow-up worker.

## Phase 1: Read (5 min)
Read these files:
1. `src/lib/engine/bridge.ts` — understand the existing method pattern (lines 49-80 show interface contracts)
2. `src/components/Canvas.svelte` — see how bridge is created and published to store
3. `src/lib/types/state.ts` — see existing type patterns

**Return:** A brief plan listing the exact methods, types, and store shape you'll add.

## Phase 2: Implement (10 min)
1. Add to `src/lib/types/state.ts`:
   - `ThreadOverlayDiagnostics` interface (active, index, focusedIndex, surface)

2. Extend `src/lib/engine/bridge.ts`:
   - Add `syncInspectedStrand(diag: ThreadOverlayDiagnostics, opts: { surface: string }): void`
   - Add `disposeInspectedStrand(): void`
   - Both delegate to `thread-inspector-webgl.js` exports (import dynamically)

3. Create `src/lib/stores/engine-bridge.ts`:
   - Simple writable store holding `EngineBridge | null`
   - Export `getEngineBridge()` helper

4. Update `src/components/Canvas.svelte`:
   - On bridge creation, publish to engine-bridge store
   - On destroy, clear the store

## Phase 3: Verify (3 min)
Run `npm run build:svelte` and `npm run check`. Fix any errors.

## Time Budget: 18 min total
If behind: skip type additions, use inline types. Document what's incomplete.
```

### Worker B: ThreadInspector Component

```markdown
# ThreadInspector.svelte — WebGL Overlay Sync

## Objective
Add a `$effect` block to ThreadInspector.svelte that syncs the inspected
strand WebGL overlay via the engine bridge. The infrastructure (bridge
methods, store, types) is already in place.

## Prerequisites
Worker A has extended bridge.ts with:
- `syncInspectedStrand(diag, opts)` — draws pulsing lines between nodes
- `disposeInspectedStrand()` — cleans up WebGL resources
- `src/lib/stores/engine-bridge.ts` — holds the bridge instance

## Phase 1: Read (3 min)
1. `src/components/ThreadInspector.svelte` — current component (287 lines, mostly done)
2. `src/components/FocusPocket.svelte` lines 22-40 — reference for `$effect` + bridge pattern
3. `src/lib/stores/engine-bridge.ts` — the store to read from

## Phase 2: Implement (5 min)
Add to ThreadInspector.svelte `<script>` block:

```svelte
<script lang="ts">
  // ... existing code ...
  import { getEngineBridge } from '@lib/stores/engine-bridge';

  // Add this $effect after the existing `showMap` derived:
  $effect(() => {
    const bridge = getEngineBridge();
    if (!bridge || !descriptor.active) return;
    bridge.syncInspectedStrand(
      {
        active: descriptor.active,
        index: descriptor.inspectedIndex,
        focusedIndex: $focusStore.threadInspector.pinnedIndex ?? $navState.focusedIndex
      },
      { surface: descriptor.source }
    );
    return () => {
      bridge?.disposeInspectedStrand();
    };
  });
</script>
```

## Phase 3: Verify (2 min)
Run `npm run build:svelte`. The component should build cleanly.

## Time Budget: 10 min total
```

---

## 8. Key Takeaways

1. **Prompts need phases.** A flat list of requirements becomes a pile of work with no prioritization. Phases create natural checkpoints and enable timeout contingency.

2. **Legacy code ratio predicts failure.** If the worker must read >200 lines of complex legacy code (WebGL, shaders, state machines) to understand what to write, budget 70%+ of the timeout for reading/planning.

3. **Infrastructure is a hidden cost.** Creating new files (stores, types, bridge methods) adds 8-13 min before any component work. Account for this explicitly.

4. **"Integrate from legacy" is not a specification.** It's a direction. The prompt must say *which* legacy functions, *how* they map to bridge calls, and *what can be skipped*.

5. **Split on the infrastructure/component boundary.** If the task needs new infrastructure that doesn't exist yet, make infrastructure Worker A and component Worker B. Each gets a completable deliverable.

6. **Include a "what to skip" section.** Workers waste time trying to understand code they don't need. Explicitly listing what to skip (e.g., "skip the shader math — the bridge handles it") saves 5-10 min of reading.

7. **Timeout contingency is mandatory.** Every prompt should say: "If behind schedule after X minutes, complete what you can, document what's incomplete, and return."

---

## 9. Updated Prompt Template (Final)

```markdown
# [ComponentName].svelte — [One-Line Description]

## Objective
[Specific deliverable. One sentence. What will exist when this is done?]

## Complexity Tier: [T1/T2/T3/T4]
Estimated time: [X] min | Timeout: [Y] min | Split: [yes/no]

## Phase 1: Read & Plan (X min)
Read these files:
1. [File] — [what to extract, line ranges if helpful]
2. [File] — [what to extract]
3. [Reference component] — pattern to follow

**Return a plan before writing code.** Include:
- Legacy functions → bridge/store mapping
- New infrastructure needed (if any)
- What to SKIP (code that doesn't apply)
- Estimated LoC for final component

## Phase 2: Infrastructure (X min) [only if needed]
Extend these files:
- [File] — [specific additions]

**Verify after each edit:** `npm run build:svelte`

## Phase 3: Component (X min)
Implement `[Component].svelte`:
- Imports: [specific]
- Reactivity: [specific pattern]
- Template: [structure]
- Cleanup: [disposal]

**Do NOT:** import Three.js, use `any`, hardcode z-index

## Phase 4: Verify (X min)
1. `npm run build:svelte` — pass
2. `npm run check` — pass or document expected errors
3. Return: changed files, LoC delta, risks

## Time Budget
- Total: [X] min
- Contingency at 75%: complete Phase 3 with placeholders, document gaps
- Hard stop: return what you have, state what's incomplete

## Success Criteria
- [ ] Component renders with correct data
- [ ] No `any` types
- [ ] Build passes
- [ ] No Three.js imports in component
```
