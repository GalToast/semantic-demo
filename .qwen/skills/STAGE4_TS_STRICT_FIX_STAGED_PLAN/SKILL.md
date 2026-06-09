---
name: Stage 4 TS Strict Fix Staged Plan
description: Operational plan for Stage 4 root-slice TS migration strict-fix wave: categorize BOTH-file typecheck errors, apply staged proxy/Three.js/null/narrowing fixes, and avoid revisiting closed exception categories.
source: auto-skill
---

# Stage 4 TS Strict Fix Staged Plan

Use this as an operational memory of the Stage 4 typecheck-fix sequence, as a fallback when Owl Alpha-style subagents die before finishing.

## When to use

- Typechecking the BOTH-file strict set and seeing proxy/Three.js/null-safety/narrowing errors as the dominant clusters.
- Need to pick which fix wave to run next without reopening already-resolved classes.

## Verified Stage 4 order from review

- Proxy typing is the highest-leverage first fix. Each A-file proxy cast removes dozens of low-value TS18046/TS2571 errors.
- Three.js import drift usually comes next; it isolates API-mismatch failures from concrete property errors.
- Null/undefined safety is then the next batch, usually reducing property-access errors without expanding the fix scope.
- Type narrowing and misc come last once the dominant map has stabilized.

## Exception handling

- State Proxy/Both exceptions stay closed in this plan; do not re-open them just because one cluster surfaces.
- If rerunning reveals proxy errors persist, prefer one grouped proxy-cast pass per file instead of per-site edits.

## Output

- One-line diagnostics per exception/class
- Next actions only for unhandled classes
