---
name: PARALLEL_DIAGNOSTIC_BUGSWEEP
description: Launch multiple parallel diagnose-only subagents across distinct code surfaces (JS, CSS, Svelte, etc.) for open-ended bug discovery, then synthesize findings.
source: auto-skill
extracted_at: '2026-06-07T00:19:03.187Z'
---

# Parallel Diagnostic Bugsweep — Multi-Surface Discovery

Use this when you need an **open-ended exploratory bug sweep** across multiple code surfaces. Launch 3+ parallel diagnose-only (no edits) workers, each targeting a distinct seam, then synthesize their findings.

## When to Use

- The project has multiple active surfaces (JS modules, CSS cascade, Svelte migration, tests) and you want to sweep them simultaneously.
- You need to discover bugs, not fix a known list — use `STRUCTURED_BUG_SURGERY` for the latter.
- The previous sweep is stale or the codebase has changed substantially (refactors, migrations, new features).
- You want to check for regressions after a sequence of commits without running the full test suite.
- The user gives a broad directive like "send subagents on a bugsweep" without a pre-existing bug list.

## When NOT to Use

- **Fixing known bugs:** Use `STRUCTURED_BUG_SURGERY` (serial fix pipeline with adversarial review).
- **Verifying implementation work:** Use `DOUBLE_WORKER_VERIFICATION` (implementation + audit + main-lane git diff).
- **Unicode/encoding/i18n audit:** Use `GLOBAL_PRODUCT_QUALITY_SWEEP`.
- **Single-file or single-surface sweep:** A solo worker reading the file is faster than launching parallel workers.
- **State desync fixes:** Use `STATE_DESYNC_PARITY_SURGERY`.

## The Pattern

### Step 1: Identify Surface Seams

Before launching workers, identify 3–5 distinct code surfaces that can be swept independently. Each surface should:

- Have **minimal file overlap** — workers reading the same files in parallel can race.
- Represent a **real fault boundary** — the bug types in JS lifecycle differ from CSS cascade or Svelte stores.
- Be **independently verifiable** — a JS worker doesn't need CSS output to find JS bugs.

Common seam splits for a Svelte-migration project with legacy JS + CSS:

| Seam | Scope | Typical Bug Types |
|---|---|---|
| **JS Lifecycle & State** | `js/modules/lifecycle*.js`, `state.js`, `app.js`, `journey*.js`, `three-*.js`, `bindings/*.js` | Listener leaks, rAF management, state mutation safety, Proxy integrity, timer races, DOM scaffold drops |
| **CSS & Mobile Visual** | `css/` (especially `mobile_premium__*.css`, `progressive_disclosure.css`, `journey_active.css`) | z-index hygiene, dead selectors, scope leaks, missing state gates, media query gaps, `!important` regressions |
| **Svelte Migration** | `src/` components, stores, engine bridge, types | Type errors, reactive statement loops, store consistency, missing event handlers, Svelte 5 rune issues |
| **Contracts & Tests** | `tests/*.mjs`, `tests/*.spec.*` | Failing assertions, stale selectors, missing DOM elements, visual regression |

### Step 2: Construct Worker Prompts

Each worker gets a prompt with these sections:

1. **Tooling self-report:** "BEGIN by listing ALL tools available to you (Read, Write, Edit, Bash, Glob, Grep, Agent, MCP tools, etc.). If expected tools such as Read, Write, Edit, Bash, Glob, or Grep are missing, STOP and report the missing tool surface before doing any other work."

2. **Explicit role:** "You are a bugsweep subagent. Your task: Diagnose bugs in [SURFACE_NAME], focusing on..."

3. **Specific research questions** for the surface (e.g., "Check the lifecycle.js facade regression described in docs/..." / "Run `npm run check` and capture type errors" / "Verify all z-index values use `var(--z-*)` tokens").

4. **Search scope** — exact globs or directories to constrain the worker.

5. **Deliverable format:** "A concise report of confirmed bugs with:
   - File path and line numbers
   - Severity (HIGH/MEDIUM/LOW)
   - One-sentence description
   - Suggested fix"

6. **Hard boundary:** "Do NOT edit any files. Return findings to the main lane."

7. For MiniMax/privacy-routed workers, include: "If this is routed through Qwen, you operate with full-allow permissions. Use Read, Bash, Grep, Glob, and your available tools to investigate. Report findings only — no file mutations."

### Step 3: Launch Parallel Workers

Dispatch all workers in a single message block using the MCP external-subagent tool:

```typescript
mcp__external-subagents__opencode_worker_start({
  name: "bugsweep-<surface-tag>",
  model: "opencode-go/mimo-v2.5",  // or appropriate model
  cwd: "<project-root>",
  prompt_text: "<full prompt from Step 2>",
  timeout_seconds: 600  // generous timeout for thorough sweep
})
```

Key decisions:
- **All workers get the same model** for consistent output quality.
- **All workers are `diagnose-and-report`** (no write permissions to source files).
- **All workers run in parallel** — they have no dependency on each other.
- **Set a generous timeout** (600s = 10 min) to allow thorough investigation.

### Step 4: Poll and Monitor

Periodically check progress:

1. **Read metadata.json** for each worker — check `status` field (`starting` → `running` → `completed`), `pid`, `stdout_bytes` for progress.
2. **Read stdout.log** — each log line is JSON:
   - `type: "text"` entries show human-readable progress
   - `type: "tool_use"` entries show what tools the worker called
   - Check for signs of stuck workers (long pauses between tool calls, bash errors)
3. **Watch for common failures:**
   - `rg: unrecognized flag --include` — the worker tried a ripgrep flag that doesn't exist on Windows
   - `head: The term 'head' is not recognized` — the worker used a Unix command on PowerShell
   - Workers on Windows need `Select-Object -First N` instead of `head -N`
   - `find . -name` instead of PowerShell `Get-ChildItem` patterns

### Step 5: Check Early Results

Read the last few `type: "text"` entries from each worker's stdout to see what they've found mid-sweep. This lets you:
- Detect if a worker is off-track before it finishes
- Report interim findings to the user
- Decide if you need to launch an additional worker on a seam the current set missed

### Step 6: Synthesize Findings

When all workers complete (or after a reasonable wait), produce a synthesis report:

```
## Bugsweep Synthesis — 2026-06-06

### Seam A: [Name] — Worker ID
| Finding | Severity | File:Line | Fix Sketch |
|---|---|---|---|

### Seam B: [Name] — Worker ID
...

### Cross-Seam Patterns
[Any finding that spans multiple surfaces — e.g., a store change in Svelte that needs CSS updates]

### Open Items
[Things intentionally left unswept]
```

**Critical check:** If a worker returned "no findings" for a seam where you expected bugs, verify yourself — the worker may have skipped the key file or misread the code.

## Extension: BUGSWEEP-TO-FIX Coordination

After a parallel bugsweep completes, the natural next move is to dispatch parallel fix workers. This section covers the coordination pattern.

**Pre-flight check:** After the bugsweep synthesis, run each finding through a quick adversary check:
- "Is this still present?" — the worker may have read stale code if files changed during the sweep.
- "Is the fix accurately scoped?" — narrow findings are easier to assign to a worker than open-ended refactors.
- "Are any findings already resolved?" — prior workers may have hotfixed since the sweep started.

### Step 7: Dispatch Parallel Fix Workers

Launch `mcp__external-subagents__opencode_worker_start` workers with edit permissions. Group items by surface domain:

| Fix Worker ID | Surface | Typical Items |
|---|---|---|
| `fix-svelte-high-severity` | Svelte stores + components | Compass split-brain, legend disconnect, a11y |
| `fix-css-cleanup` | CSS files (mobile_premium__*.css, etc.) | Dead selectors, malformed comments, duplicate attrs |
| `investigate-js-lifecycle` | JS lifecycle module | Init regression diagnosis (diagnose-only relaunch) |

**Fix worker prompt structure:**

1. **Tooling self-report** — same as bugsweep pattern (list tools, stop if missing).
2. **Explicit fix role** — "You are a fix subagent. Fix the following bugs..."
3. **Per-bug instructions** — for each bug: file path, exact lines, what's wrong, what the fix should be, and any verification steps.
4. **Hard boundary** — "Do NOT edit files outside this scope. Return changed file paths and line ranges."

**Important:** Fix workers run in parallel across different files, but if two workers target the same file they will conflict. Verify seam isolation before dispatching.

**Timeout consideration:** CSS fix workers can use 300s (5 min, simpler surface). Svelte + JS workers may need 600s (10 min) for compilation and testing.

### Step 8: Spot-Check Results

After fix workers complete, verify each change:

```
read_file at the exact line ranges changed to confirm the edit
check for: correct syntax, no orphaned code, proper indentation
```

Create a spot-check table:

| File | Expected Change | Actual | Status |
|---|---|---|---|
| `src/...` | Remove standalone writable | ✅ Gone | ✅ |
| `css/...` | Remove .help-box selector | ✅ Removed | ✅ |

### Step 9: Update Todo List

Track the fix wave with a todo list:

```
todo_write(todos=[{id, content, status, severity}, ...])
```

Mark items from the bugsweep as `in_progress` when fix workers launch, then `completed` when spot-checked.

### Step 10: Synthesize Final Status

When all fix workers complete:

```
## Fix Wave Results

| Worker | Status | Files Changed |
|---|---|---|
| fix-svelte-high-severity | ✅ Done | 3 files (compass, CompassRail, Legend) |
| fix-css-cleanup | ✅ Done | 3 files (time_weather, progressive_disclosure, chrome) |
| investigate-js-lifecycle | 🔄 Partial | (if timed out, note what was found vs. still open) |
```

Note any **remaining issues** that are still open (workers that timed out, items left out of scope, pre-existing contract test failures).

## Adjacent Skills

- **STRUCTURED_BUG_SURGERY** — Use AFTER the bugsweep findings are synthesized, when fixing each bug individually with adversarial review (main lane does fixes, not workers).
- **BUGSWEEP-TO-FIX EXTENSION** (this section) — Use when you want the bugsweep to feed directly into parallel fix workers, skipping per-item adversarial review in favor of batch spot-checking.
- **DOUBLE_WORKER_VERIFICATION** — For verifying implementation work, not discovery. Different prompt structure (implementation + audit + main-lane git diff).
- **PROJECT_STATUS_READ** — Use BEFORE this pattern when you need a snapshot of project state to decide what seams to sweep.
- **STATE_DESYNC_PARITY_SURGERY** — Specialized fix pattern for Svelte/JS dual-track desync issues discovered during the sweep.
