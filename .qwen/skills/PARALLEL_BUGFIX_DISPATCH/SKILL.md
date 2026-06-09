---
name: Parallel Bugfix Dispatch
description: Coordinate two parallel external subagent workers to fix distinct bug sets in JS/TS/CSS, with scoped prompts, falsification-first verification, and explicit non-goals to avoid scope drift.
source: auto-skill
extracted_at: '2026-06-08T15:43:25.482Z'
---

# Parallel Bugfix Dispatch

Use when you have 2 scoped, low-to-medium complexity bug sets that can run in parallel and a clear reason to split them into separate workers. Covers prompt design, verification, and when to use double-worker verification versus a single surgical pass.

## When to Use

- You have **2 independent fix categories** (e.g., nondeterminism invariant fixes vs dead-code cleanup) that do not depend on each other.
- Each category is a **single-file or small-list change** with obvious acceptance criteria.
- You want **verification in parallel** — two workers, then main-lane git diff checks before reporting.
- The user explicitly asks for parallel workers.

## When NOT to Use

- Fixes are not independent (one bug depends on another fix).
- The change touches off-limits high-risk surfaces (`app.js`, `lifecycle.js`, `state.js`, deploy scripts) without explicit approval.
- The bugs are claimed but not verified yet — run `BUGSWEEP_CLAIM_FALSIFICATION_CHECK` first.
- The task is complex or multi-module — use `STRUCTURED_BUG_SURGERY` instead.

## Precondition Checklist

Before launching workers, verify:

1. **Claims are real.** Run a falsification check or use existing verified state. Do not dispatch workers on stale bugsweep claims.
2. **Scope is isolated.** Each worker should have an explicit file list and an explicit "Do NOT touch" list.
3. **Non-goals are stated.** List what is out of scope so workers do not unbundle extra refactors.
4. **Acceptance is defined.** Each worker knows exactly how to verify its own fix.

## Worker Scoping Pattern

### Worker A — Category 1 (Implementation)
Mechanical replacements across a small set of files.

**Required prompt content:**
- Role: "You are a FIX worker."
- Tooling self-report: list required tools, stop if missing.
- Exact file paths and line interventions needed.
- Explicit non-goals: do not reformat, do not refactor adjacent code, do not touch files not listed.
- Non-goals for this repo: do not touch `AGENTS.md`-listed off-limits files unless explicitly approved.
- Verification command(s) to run after edits.

### Worker B — Category 2 (Implementation)
Independent category with isolated file list.

Same structure as Worker A, different file list and fix pattern.

## The Half-Shift Principle

If you dispatch 2 workers and only 1 category can be completed safely in the current working tree state, treat one worker as a "continuing" lane and one as a "completing" lane:

- **Completing lane:** make the small targeted changes already verified safe.
- **Continuing lane:** audit before changing; if unsafe, return a gap report instead of risky edits.

## Main-Lane Verification After Workers

**Do not trust worker reports alone.** Run:

1. `git diff --stat` — confirm only expected files changed.
2. `git diff -- <files>` — read the actual patches.
3. Targeted grep for the pattern you asked them to fix — confirm present/absent as expected.

If a worker claims success but the diff is empty, assume a no-op or stale citation, not a successful silent edit.

## Repo-Specific Rules

- Use `mcp__external-subagents__external_subagent_start` or `mcp__external-subagents__opencode_worker_start`.
- Prefer `model: opencode-go/mimo-v2.5` for implementation work.
- Use `mode: "yolo"` so detached workers do not block on approvals.
- Keep timeouts tight for small-scope tasks; this is not a justification for unbounded workers.

## Example Prompt Skeleton

```text
You are a FIX worker. Scope: replace 12 instances of Math.random() in 3 files with seededUnit() calls per AGENTS.md determinism invariant.

Files:
- js/modules/weather-ui.js (8 replacements: drop/snow/lightning)
- js/modules/journey-selected-card.js (1 replacement: vector line)
- js/modules/audio-scape.js (2 replacements: frequency)

Acceptance:
- findstr /N "Math.random" on the 3 files returns 0 matches
- npm run build succeeds
- No edits outside the listed files

Do NOT:
- Touch CSS, ts files, stores, or bridge modules
- Refactor unrelated code
- Change non-visual randomness unless explicitly listed
```

## Output Format

After verification, summarize:

| Worker | Category | Files Changed | Status | Evidence |
|---|---|---|---|---|
| A | ... | ... | Completed / No-op / Blocked | git diff summary |
| B | ... | ... | Completed / No-op / Blocked | grep/build proof |

Followed by the actual delta from main-lane verification, not worker self-reports.
