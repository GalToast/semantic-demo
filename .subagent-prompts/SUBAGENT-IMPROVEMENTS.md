# Subagent Timeout & Policy Audit

**Date:** 2026-06-07
**Trigger:** ThreadInspector worker timeout at 600s despite completing valuable infrastructure

---

## 1. Root Cause Analysis: Why 600s Was Insufficient

### The Infrastructure Trap

The ThreadInspector prompt asked the worker to "complete WebGL line integration." This sounds like a single task, but it decomposed into:

1. **Context reading** (~250s): The worker had to read and understand:
   - `thread-inspector-webgl.js` (296 lines) — complex WebGL shader with GLSL, BufferGeometry lifecycle, pulse math
   - `thread-inspector.js` (457 lines) — state machine, event subscriptions, DOM interaction
   - `ThreadInspector.svelte` (287 lines) — existing partial component
   - `bridge.ts` (1339 lines) — the full bridge pattern to understand how to extend it
   - `state.ts` (346 lines) — to add the `ThreadOverlayDiagnostics` type
   - Total: **~2700 lines of complex code** before writing a single line

2. **Infrastructure creation** (~200s): The worker correctly built prerequisite infrastructure:
   - Added `ThreadOverlayDiagnostics` type to `state.ts`
   - Created `engine-bridge.ts` shared store (26 lines)
   - Extended `bridge.ts` with `syncInspectedStrand()` / `disposeInspectedStrand()`
   - Wired `Canvas.svelte` to publish bridge to store

3. **Actual hookup** (~15 lines, never reached): The final `$effect` in `ThreadInspector.svelte` was the trivial part — but the worker timed out before reaching it.

**The lesson:** "Complete X integration" is a trap when X depends on understanding large legacy codebases. Workers spend 80% of budget on context-gathering and infrastructure, leaving 20% for the actual change.

### Why MapSummary Succeeded

MapSummary completed in ~5 minutes because:
- **No WebGL**: SVG rendering, no shader understanding needed
- **Smaller context**: `journey-route-trace.js` + `journey-neighborhood.js` are ~200 lines each
- **No bridge extension**: SVG doesn't go through the Three.js bridge
- **Clear output**: "Draw SVG path from trail stops" is unambiguous

---

## 2. Recommended Default Timeouts by Task Complexity

| Tier | Timeout | Task Type | Examples |
|------|---------|-----------|----------|
| **T1: Research** | 120-180s | Read-only audit, bug hunt, prompt writing | `threejs-webgl.md`, `thread-inspector-events.md` |
| **T2: Simple feature** | 300s | Single-file change, no WebGL, clear output | MapSummary, SearchBar, WeatherWidget |
| **T3: Infrastructure** | 450s | New store, new type, bridge extension | `engine-bridge.ts` creation, `state.ts` type additions |
| **T4: Integration** | 600s | Component hookup requiring bridge + store + WebGL | ThreadInspector `$effect` (after infra exists) |
| **T5: Complex feature** | 900s | Full feature requiring infra + integration + verification | Complete JourneyChrome port, full thread inspector with WebGL |

**Current default:** 600s (matches T4, but too high for T1/T2 and too low for T5)

**Recommended:** Default to 300s, escalate per-task. Most tasks should fit in T2-T3.

---

## 3. Prompt Structure Changes to Avoid the Infrastructure Trap

### Anti-Pattern: "Complete X Integration"

The current ThreadInspector prompt says:
> "Complete the ThreadInspector.svelte component by adding WebGL line integration"

This invites the worker to read everything, understand everything, and build everything.

### Better Pattern: Phase-Gated Prompts

#### Option A: Split Into Multiple Workers (Recommended for T4/T5)

**Worker 1: Infrastructure (T3, 450s)**
```markdown
# ThreadInspector — Infrastructure Setup

## Task
Create the infrastructure needed for ThreadInspector WebGL integration.
Do NOT touch ThreadInspector.svelte itself.

## Deliverables
1. Add `ThreadOverlayDiagnostics` type to `src/lib/types/state.ts`
2. Create `src/lib/stores/engine-bridge.ts` shared store
3. Add `syncInspectedStrand()` and `disposeInspectedStrand()` to `bridge.ts`

## Files to READ (understand patterns, don't modify)
- `src/lib/engine/bridge.ts` (bridge pattern)
- `src/lib/stores/navigation.ts` (store pattern)
- `src/lib/types/state.ts` (type patterns)

## Files to MODIFY
- `src/lib/types/state.ts` — add type only
- `src/lib/stores/engine-bridge.ts` — create new file
- `src/lib/engine/bridge.ts` — add two methods

## Constraints
- Do NOT read `thread-inspector-webgl.js` or `thread-inspector.js`
- Do NOT modify `ThreadInspector.svelte`
- Keep changes minimal: types, store, two bridge methods
- Verify with `npm run build:svelte` only
```

**Worker 2: Hookup (T4, 300s)**
```markdown
# ThreadInspector — WebGL $effect Hookup

## Task
Add a single `$effect` block to ThreadInspector.svelte that calls
`bridge.syncInspectedStrand()` when inspection state changes.

## Prerequisites (already done by Worker 1)
- `engine-bridge.ts` store exists with `getEngineBridge()`
- `bridge.ts` has `syncInspectedStrand(state, options)` method
- `Canvas.svelte` publishes bridge to store

## Deliverables
Add to `src/components/ThreadInspector.svelte`:
1. Import `getEngineBridge` from `@lib/stores/engine-bridge`
2. Add `$effect` that calls `bridge.syncInspectedStrand(...)` on state change
3. Return cleanup that calls `bridge.disposeInspectedStrand()`

## Reference (copy pattern from)
- `src/components/JourneyCanvas.svelte` lines 59-67 (similar $effect)

## Constraints
- Do NOT read or modify any Three.js files
- Do NOT extend bridge.ts or create new stores
- Target: ~15 lines of code in ThreadInspector.svelte only
```

#### Option B: Single Worker With Explicit Phases (T4, 600s)

```markdown
# ThreadInspector — Complete WebGL Integration

## Phase 1: Read (Budget: 120s)
Read ONLY these files. Do NOT write anything yet.
- `src/components/ThreadInspector.svelte` (current state)
- `src/lib/engine/bridge.ts` (bridge pattern, lines 1-100)
- `src/lib/stores/engine-bridge.ts` (shared store)
- `src/lib/journey/thread-inspector.ts` (inspection state)

Stop after reading. Report what you understand.

## Phase 2: Infrastructure (Budget: 180s)
If infrastructure is missing, create it:
- `ThreadOverlayDiagnostics` type in `state.ts`
- `engine-bridge.ts` shared store
- Bridge methods in `bridge.ts`

## Phase 3: Hookup (Budget: 150s)
Add the `$effect` to ThreadInspector.svelte.

## Phase 4: Verify (Budget: 150s)
Run `npm run build:svelte` and `npm run check`.

## HARD LIMITS
- Do NOT read `thread-inspector-webgl.js` (296 lines of shader code)
- Do NOT read `thread-inspector.js` (457 lines of state management)
- These files are NOT needed for the Svelte hookup
```

---

## 4. Should We Split Complex Tasks Into "Infra" + "Hookup" Phases?

**Yes, for T4/T5 tasks.** Here's the decision matrix:

| Condition | Split? | Reason |
|-----------|--------|--------|
| Task requires reading >500 lines of legacy code | Yes | Context-gathering dominates budget |
| Task touches both `bridge.ts` AND a component | Yes | Infrastructure and hookup are separable |
| Task requires understanding WebGL/shader code | Yes | Shader comprehension is expensive |
| Task is a simple component from scratch | No | No legacy context needed |
| Task is a single-file change (<50 lines) | No | Splitting adds coordination overhead |

### Split Protocol

1. **Worker 1 (Infra):** Creates types, stores, bridge extensions. Explicitly told NOT to touch the target component.
2. **Worker 2 (Hookup):** Uses the infrastructure to wire up the component. Explicitly told NOT to read legacy WebGL files.
3. **Verification:** Either worker can run `npm run build:svelte`, but Worker 2 owns the final check.

### Coordination

- Worker 1 commits its changes before Worker 2 starts
- Worker 2's prompt includes the exact method signatures Worker 1 created
- If Worker 1 fails, Worker 2's prompt is void (don't start it)

---

## 5. Tool/Config Changes Needed

### 5.1. Worker Metadata in `.qwen/worker-logs/`

The current log format is useful but lacks:
- **Task tier** (T1-T5) — needed for timeout recommendations
- **Prompt file** — which prompt was used
- **Phase tracking** — which phase the worker was in when it timed out
- **Context size** — total lines of code read

**Recommendation:** Add structured metadata to worker start:

```json
{
  "type": "worker_attempt_spawned",
  "metadata": {
    "prompt_file": ".subagent-prompts/thread-inspector-prompt.md",
    "task_tier": "T4",
    "estimated_context_lines": 2700,
    "deliverables_count": 5
  }
}
```

### 5.2. Timeout Override Per Task

The `external-subagents_opencode_worker_start` tool has `timeout_seconds` parameter. Currently defaults to 600s.

**Recommendation:** Add a `task_tier` parameter that maps to recommended timeouts:

| Tier | Default Timeout |
|------|----------------|
| T1 | 180s |
| T2 | 300s |
| T3 | 450s |
| T4 | 600s |
| T5 | 900s |

### 5.3. Prompt Template Library

Create `.subagent-prompts/templates/` with tier-specific templates:

```
templates/
├── t1-research.md          # Read-only, diagnose-only
├── t2-simple-feature.md    # Single-file, no WebGL
├── t3-infrastructure.md    # Types, stores, bridge extensions
├── t4-integration.md       # Component hookup with bridge
├── t5-complex-feature.md   # Full feature with infra + integration
└── split-infra.md          # Phase 1 of split pattern
└── split-hookup.md         # Phase 2 of split pattern
```

### 5.4. Context Budget Warnings

Add a prompt section that explicitly limits context reading:

```markdown
## Context Budget
- Maximum files to read: 4
- Maximum total lines: 500
- If you need to read more, STOP and report what's missing
- Do NOT read legacy WebGL/shader files unless explicitly listed
```

### 5.5. "Read-Then-Report" Gate

For T4+ tasks, require the worker to report understanding before writing:

```markdown
## Phase Gate
After reading all listed files, output a JSON summary:
{
  "files_read": [...],
  "understood_patterns": [...],
  "planned_changes": [...],
  "risks": [...]
}
Wait for approval before proceeding to Phase 2.
```

This prevents workers from diving into infrastructure before confirming scope.

---

## 6. Summary of Recommendations

| # | Recommendation | Impact | Effort |
|---|---------------|--------|--------|
| 1 | Split T4/T5 tasks into infra + hookup workers | High | Medium |
| 2 | Add task tier to prompt templates | High | Low |
| 3 | Add context budget limits to prompts | High | Low |
| 4 | Default timeout to 300s, escalate per-tier | Medium | Low |
| 5 | Create prompt template library | Medium | Medium |
| 6 | Add "read-then-report" gate for complex tasks | Medium | Low |
| 7 | Add worker metadata (prompt file, tier, context size) | Low | Medium |
| 8 | Create `engine-bridge.ts` as standard infra pattern | Low | Already done |

---

## 7. Immediate Action Items

1. **Rewrite `thread-inspector-prompt.md`** using the split pattern (infra + hookup)
2. **Create `templates/` directory** with tier-specific prompt templates
3. **Update AGENTS.md** with subagent delegation best practices
4. **Add context budget section** to all existing prompts
5. **Test the split pattern** on the remaining ThreadInspector hookup

---

## Appendix: Worker Timeline Reconstruction

Based on the bugsweep-svelte worker log and ThreadInspector task:

| Phase | Duration | Activity | Budget Used |
|-------|----------|----------|-------------|
| Spawn | ~2s | Worker startup, tool enumeration | 0.3% |
| Context | ~30s | Read AGENTS.md, glob files, list directories | 5% |
| Verify | ~20s | Run `npm run check` | 3.3% |
| Audit | ~60s | Read 8+ source files, grep patterns | 10% |
| Infrastructure | ~200s | Types, store, bridge extension, Canvas wiring | 33% |
| Hookup | never | The actual `$effect` in ThreadInspector.svelte | — |
| **Total** | **~312s** | **Before timeout at 600s** | **52%** |

The worker had ~288s remaining but had consumed its context budget on infrastructure. A split approach would have:
- Worker 1 (infra): 450s budget, completes infrastructure
- Worker 2 (hookup): 300s budget, completes the 15-line change

Total: 750s across two workers vs 600s wasted on one worker that couldn't finish.
