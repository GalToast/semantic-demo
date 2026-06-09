---
name: SUBAGENT_DELEGATION_GUIDE
description: Tiered subagent dispatch with phased prompts, timeout calibration, and infra-vs-hookup split decisions to avoid the "infrastructure trap" where workers spend budget on setup and run out before the actual change.
source: auto-skill
extracted_at: '2026-06-07T01:44:17.527Z'
---

# Subagent Delegation Guide

Use this when dispatching external workers for implementation or audit tasks. The goal is to avoid the "infrastructure trap," recognize runaway or stuck reruns, verify results with reliable signals, and pick the right model/tier for the slice.

## When to Use

- Dispatching external workers/subagents for implementation tasks (not read-only research)
- The task requires reading legacy code to understand patterns before writing
- The task involves WebGL, Three.js, or complex cross-module wiring
- The task should be parallelized or isolated from the main lane
- You're setting a timeout and want to calibrate it to the task

## When NOT to Use

- Planning, scoping, or read-only research that doesn't produce artifacts
- A direct in-house fix is faster, safer, or already well-understood
- A prior worker got stuck or silently failed and you haven't changed approach yet

## Model and Tool Selection

Prefer the simplest supported model that fits the job. The supported external worker IDs are validated at dispatch time; use the exact ID from the router's allowed list, not a guessed slug. For higher reasoning or long-context audit tasks, use a model with stronger reasoning; for simple edits, use the lightest reliable worker.

### Launch-arg gotcha: `mode` maps to `--approval-mode`, and `readonly` is rejected

`external_subagent_start.mode` is serialized as `--approval-mode <value>` to the qwen-code CLI. The CLI only accepts `plan | default | auto-edit | auto | yolo`. Passing `readonly` produces a CLI argument-validation failure that prints the help text before the session-id line, which looks like a "missing session-id" error. Symptoms:
- All dispatches fail within ~1–2 seconds.
- stderr shows `--approval-mode` followed by a long help/output block.
- The `--session-id` flag is actually present in the args array correctly.

Fix: omit `mode` entirely, or pass `mode: "yolo"` (the documented default). Do not pass `mode: "readonly"` expecting a no-write guarantee — enforce read-only in the prompt text instead.

### Verified model IDs (as of 2026-06-09)

| Model ID | Behavior |
|---|---|
| `mimo-v2.5-free` | Free OpenCode worker that has completed both audits and edits in this session. Slower than paid passthrough, but reliable for read/write tasks. |
| `opencode-go/mimo-v2.5` | Paid passthrough worker. May fail at the provider API layer before any prompt executes if the backend sends unsupported fields such as `reasoning_effort='max'`. Treat as unstable for edit workflows until confirmed otherwise. |
| `opencode-go/deepseek-v4-flash` | Paid passthrough worker. In this session it did not successfully maintain a live worker process after launch (`pid_alive: false`). Treat as unreliable on the current router. |
| `z-ai/glm-5.1` | Spawns successfully, but may enter deep research loops or struggle with whitespace-sensitive `edit` calls. Check for `pid_alive: false` immediately; if it fails to spawn, switch models rather than retrying. |
| `nvidia/nemotron-3-ultra-550b-a55b` | Listed in the router's allowed set, but spawning has yielded `pid_alive: false` across multiple provider prefixes. Treat as an unreliable dispatch target on the current Qwen backend until a successful worker run with real output is confirmed. |
| `nex-agi/nex-n2-pro:free` | Spawns successfully (`pid_alive=true`), but can enter a silent stall mid-task with no new stdout/stderr for several minutes after a tool call. If stdout_bytes and last_log_at are unchanged across two polls >60s apart, treat as a run failure rather than "still thinking." Cancel and fall back to in-house execution or switch model. |

### Spawn-failure protocol

If a subagent returns `pid_alive: false` immediately after launch:
1. Do not retry the same model unchanged.
2. Pick a different model from the verified-working list.
3. If spawning fails twice in one task family, fall back to direct in-house execution and note the failure pattern for this session.

## Verification Is a Tooling Problem, Not a Worker Problem

Workers' reported success is not the truth source. The main lane's in-process read/glob tools can return stale data and make successful edits look missing.

Use shell tools to verify worker output:
- `git diff`
- `dir` / `ls`
- `grep` / `findstr`
- build/test commands (`npm run build`, `npm run check`, `npm run test`)

Treat `read_file` and `glob` results as suspect if a worker just reported success. Verify before claiming "silent failure."

## Do Not Blindly Resubmit Unchanged Work

If a subagent reruns without edits or output, treat that as a signal to change one of:
- model/tier
- prompt width (split narrower)
- prompt shape (phased or smaller slice)
- fallback to direct in-house execution

Repeating the same dispatch unchanged is rarely productive.

## Complexity Tiers

| Tier | Timeout | Type | Examples |
|------|---------|------|----------|
| **T1: Research** | 180s | Read-only audit, bug hunt, prompt writing | Code review, report generation |
| **T2: Simple feature** | 300s | Single-file change, no WebGL, clear output | SVG component, CSS fix, store addition |
| **T3: Infrastructure** | 450s | New stores, types, bridge extensions (no component) | Create `engine-bridge.ts`, extend `bridge.ts` |
| **T4: Integration** | 600s | Component hookup requiring bridge + store + WebGL | ThreadInspector `$effect`, semantic overlay wiring |
| **T5: Complex feature** | 900s (or split) | Full feature requiring infra + integration + WebGL | Complete journey port, camera choreography |

## Prompt Structure: The 4-Phase Template

### Phase 1: Read & Plan
- List EXACT files to read (with line ranges if helpful)
- Require a brief plan before writing
- Explicitly say what to **SKIP** (legacy code the worker doesn't need)

### Phase 2: Infrastructure (only if needed)
- Create types, stores, bridge methods
- Verify after each edit: `npm run build:svelte`
- Keep the worker away from the target component

### Phase 3: Component Implementation
- Wire up the component using existing infrastructure
- Tight scope: imports, reactivity ($effect/$derived), template, cleanup
- Explicit "Do NOT" list: no Three.js imports, no `any`, no hardcoded z-index

### Phase 4: Verify
- `npm run build:svelte` and `npm run check` must pass
- Return changed files list + risk notes

## When to Split Into Two Workers

### Split if ALL of these are true:
1. Task requires reading **>200 lines of complex legacy code** (WebGL, shaders, state machines)
2. **Infrastructure doesn't exist yet** (new store, types, bridge methods needed)
3. Infra and component work touch **different files**

### Otherwise use one worker:
- Simple task (<200 lines total)
- No infrastructure needed
- Read-only research
- Single-file change

### Split Protocol

**Worker A (Infrastructure):**
1. Read target files and legacy code (shader math, bridge patterns)
2. Create types, stores, bridge extensions
3. Do NOT touch the target component
4. Verify build passes

**Worker B (Hookup):**
1. Read only the infrastructure Worker A created (NOT the legacy WebGL code)
2. Wire the component with $effect + bridge calls
3. Verify build passes
4. Owns the final acceptance

## Stuck or Runaway Worker Protocol

Use this when a worker reports success but verification is empty, or when it loops without producing a report.

1. Cancel the worker if it is still running and unproductive.
2. Verify the cancellation path for the exact launch tool; some launch wrappers need `mcp__external-subagents__external_subagent_cancel` rather than generic task stops.
3. Re-evaluate the slice:
   - Is the task too large for one worker?
   - Is the prompt too vague?
   - Is direct in-house execution faster now?
4. Rescue path: keep the timeout short, verify with shell tools, and prefer direct edits for small recoverable slices.

## Prompt Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| "Do X, Y, Z all at once" | Split into Phase 1/2/3/4 |
| "Integrate from legacy" (vague) | Name exact functions + mapping |
| No skip guidance | Add "Do NOT read:" section |
| No timeout backup | Add contingency section |
| Flat requirement list | Prioritize: infra first, component second |

## Artifact Example: ThreadInspector Split

### Worker A (T3, 450s)
Create `engine-bridge.ts` store, extend `bridge.ts` with `syncInspectedStrand()`/`disposeInspectedStrand()`, add `ThreadOverlayDiagnostics` type. Do NOT touch ThreadInspector.svelte.

### Worker B (T4, 300s)
Import `getEngineBridge` in ThreadInspector.svelte. Add a 10-line `$effect` calling `bridge.syncInspectedStrand()`. Do NOT read any WebGL shader code.

## Always Include

1. **Explicit timeout** matching the task tier (not default)
2. **"What to SKIP"** section listing code the worker doesn't need
3. **Phase gates** that stop and return between phases for complex tasks
4. **Timeout contingency** so the worker degrades gracefully instead of crashing
5. **Verification method** — shell diff/build, not only worker-reported success
