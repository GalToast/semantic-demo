---
name: STRUCTURED_BUG_SURGERY
description: Targeted multi-bug sweep with verify-first diagnosis, surgical per-issue fixes, evidence-based adversarial review, and cross-layer assurance (CSS selectors, tests, legacy parity, store interactions).
source: auto-skill
extracted_at: '2026-06-06T21:55:08.124Z'
---

# Structured Bug Surgery — Multi-Bug Targeted Sweep

Use this when you have a defined list of HIGH/MEDIUM bugs to fix and need to ensure each change is correct, minimal, and doesn't break adjacent contracts. Not for open-ended exploration — for executing a known fix set with adversarial assurance.

## When to Use

- User hands you a numbered list of bugs from a sweep report or review
- You're asked to resolve multiple known issues in a focused session
- Need to avoid cascading risks: fixing one bug shouldn't break something else
- The bugs span multiple layers (JS, TS, CSS, state machines, bridges)

## The Pipeline

### Phase 1: Verify-Before-Fix (Diagnose First, Act Second)

Never assume the bug description is accurate — the code may have changed since the report was written, or the issue may already be resolved in a different module or layer.

For each bug:

1. **Read the affected file(s) at the exact line range mentioned** — verify the current code matches what the bug report describes.
2. **Check sibling files** — the bug report might mention a JS file, but the real fix might be in a TypeScript sibling, a Svelte store port, or a bridge module.
3. **Grep for the pattern** — if the user says "change `depthWrite: true` to `false`", grep for `depthWrite` across all relevant files. It might already be `false`.
4. **Check for duplicate subscriptions** — if the user says "audit for duplicate event subscriptions," grep for each event name's `subscribe()` count before changing anything.
5. **Categorize each bug:** `NEEDS_FIX` (code is wrong), `ALREADY_FIXED` (code is correct, likely a prior pass resolved it), or `MISDIAGNOSED` (the real issue is elsewhere).

**Why:** Applying fixes that are already in place wastes time and risks introducing new bugs. The user's bug report is a hypothesis, not a diagnosis.

### Phase 2: Surgical Fix (One Intent Per Edit)

Each edit should change exactly one thing. Never bundle unrelated changes.

1. **Set up a todo list** tracking each bug through diagnosis → fix → verification → adversarial review.
2. **Isolate the minimal change:** read the surrounding function/component to understand the fix's scope. Don't fix adjacent issues you discover in passing — note them with `// FROM SURGERY: <finding>` and move on.
3. **Use edit operations** (not full file writes) that target only the specific lines that change. This makes review trivial.
4. **For cross-module fixes (e.g., adding an import + calling a function in a caller):** this is one logical fix but two file edits — still acceptable as one bug's edits.
5. **Never reformat, reindent, or comment-enclose code** as a side effect of a fix. If the fix requires touching multiple lines, keep the replacement block as close to the old block's shape as possible.

### Phase 3: Verification Gate

Run all checks relevant to the changed layer before moving to the next bug:

| Layer | Minimal verification | Extended verification |
|---|---|---|
| **TypeScript/Svelte** | `npm run check` (svelte-check + tsc) | `npm run check:svelte` |
| **Unit tests** | `npm run test:unit` (vitest) | Targeted test file with `vitest run <path>` |
| **JS modules** | `npm run lint` (ESLint) | — |
| **Build** | `npm run build` (bundle) | `npm run build:svelte` |
| **Assembly tests** | `npm run test:fast` | Contract+surface tests |

If any verification step fails:
- **Pause before continuing to the next bug.** A failing check means the fix has a side effect you didn't account for.
- **Read the failure output.** It will tell you exactly which import, type, or test assertion broke.
- **Revert the fix and re-approach** if the failure indicates the fix is wrong (not just a pre-existing failure).

### Phase 4: Adversarial Post-Fix Review

For each applied fix, run through these five checks:

#### 4a. CSS Selector Compatibility
If the fix changes a body `data-` attribute value, a CSS class, or a state machine value:
```
grep -r "data-<attribute>=" --include="*.css" .    # Which CSS selectors exist?
```
Verify every selector matches the new vocabulary. For example, if you change `dataset.semanticDive` from `'true'`/`'false'` to `'active'`/`'inactive'`, confirm no CSS selector expects `'true'` or `'false'`.

#### 4b. Test Contract Assertions
If the fix changes a value that tests assert on:
```
grep -r "semanticDive" --include="*.spec.*" --include="*.mjs" tests/
```
Read each assertion. Verify the new value matches what the test expects.

#### 4c. Cross-Module Interaction
Think about the sequence of store/store updates that happens after your fix:
- If two stores update in sequence, does the parity layer recompute twice?
- If you call `clearSearchResults()` which clears `summary`, do subsequent code paths restore it?
- If you reset `navMode` on `setTrailDepth(0)`, are there callers that pass depth=0 and expect mode to stay unchanged?

#### 4d. Legacy JS Parity
For bugs in a Svelte/TS port, check whether the legacy `.js` file has the same bug:
```
grep -n "pattern" js/modules/<legacy-file>.js
```
If it does, file it as a follow-up finding — don't fix it in the same session unless the user explicitly scoped it.

#### 4e. Edge Case Inventory
List edge cases that are now different:
- What happens when the fix fires during a transition (is the new value stable)?
- What happens when preserveSearch=true (are artifacts properly scoped)?
- What happens when the value is already correct (is the fix idempotent)?

### Phase 5: Synthesis Report

After all bugs are processed, produce a structured summary:

```
## Summary

**npm run check:** 0 errors, X pre-existing warnings (same as baseline)
**npm run test:unit:** Y/Z tests pass (same as baseline)
**npm run lint:** 0 errors

### Fix N — Title — STATUS
- **File:** path
- **What changed:** one-line description
- **Status:** Applied / Already correct / Out of scope
- **Verification:** tests that confirm correctness
- **Adversarial notes:** any edge cases, CSS contract confirmations, or legacy parity notes
```

## What Not to Do

- **Do not fix legacy JS in a Svelte/TS fix sweep.** If a bug exists in both tracks, note it but only fix the track the user specified (usually `src/` for migration projects).
- **Do not reformat code as part of a fix.** If the fix requires a 3-line block to become a 6-line block, replace the exact 3 lines with the new 6 lines — don't reindent the surrounding function.
- **Do not "discover and fix" adjacent bugs.** Document them and move on. Scope creep on a surgical sweep turns it into a refactor, which obscures the proof that each original bug was correctly resolved.
- **Do not skip adversarial review because a fix is "trivial."** The CSS contract check caught a stale `'false'` literal that would have silently broken the parity layer — it seems trivial until it breaks a test at 2 AM.
