---
name: MOBILE_CRITICAL_LAYOUT_ROOT_CAUSE_PATCH_PLAN
description: Non-edit tract of a mobile visual/layout regression from contract tests through ownership docs into the CSS cascade to produce root-cause statements, specificity rationale, and candidate patch hunks.
source: auto-skill
extracted_at: '2026-06-09T15:45:07.177Z'
---

# Mobile Critical Layout Root Cause + Patch Plan

## When to use
- A contract/regression test flags mobile geometry failures: overlap, clipping, wrong height, missing flush, or overflow.
- You must diagnose without editing files.
- You should deliver: root cause(s), selector/load order reasoning, candidate patch hunks, and verification commands.

## Procedure

### 1. Lock the failure surfaces
List the exact failing checks from the test files.
- Note the chosen viewport and surface states the tests exercise.
- Note the probe selectors and conditions (`overlap > 1200`, `flush`, `height <= 72`, etc.).

### 2. Trace the DOM anchors
Find the backing HTML elements by id/class in the app shell.
- Confirm whether the element has both id and class rules competing for it.
- Confirm hidden/display toggles that can collapse geometry and falsify probe values.

### 3. Read the ownership map and cascade docs first
Use `docs/semantic-demo-css-ownership-map.md` to identify:
- canonical owner for each failing surface,
- whether the rule set is loaded early, late, or tail-loaded last,
- known off-limits files that should not receive new geometry rules.

### 4. Map all competing rules by selector and source order
For each failing element/property:
- grep the full `css/` tree for the selector/property.
- collect the candidate cascade winners: specificity tie -> source order wins; higher specificity wins regardless of order.
- call out concrete `body[data-panel-surface='...']`, `@media` gates, and attribute selectors the test state does or does not set.

### 5. State the exact root cause
For each failure:
- which single rule or rule-group makes the element render outside spec,
- why the test viewport/state activates that rule,
- how specificity and load order make it authoritative.
Be explicit: give the selector as you expect the engine to read it, the file path, and the line range.

### 6. Define the smallest patch hunks
Prefer one small neutral change over multiple larger edits:
- prefer adjusting a property that already exists at the same selector,
- prefer adding a state-scoped selector whose source order lets it win,
- avoid `!important` unless the repo already uses it for that seam.
Write hunks in prose or unified diff. Keep them no-edit safe: do not execute changes.

### 7. Provide verification commands
Include the exact playwright/npm commands for each failure, plus a combined contract sweep if the tests cover them.

## Output Contract
Return exactly:
1. Exact root cause for `#focus-stage` bottom flush.
2. Exact root cause for the idle 896x414 compass/info-panel overlap.
3. Why the short-landscape compass height is ~76.3px and the smallest workable change to cap it at <=72px, with selector specificity and load order noted.
4. Candidate patch hunks in prose or unified diff.
5. Verification commands.

Additional constraints:
- No source edits.
- No subagents.
- Cite file and approximate line ranges so a fix agent can land the change directly.
