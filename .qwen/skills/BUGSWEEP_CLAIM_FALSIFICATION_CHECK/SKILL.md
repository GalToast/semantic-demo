---
name: Bugsweep Claim Falsification Check
description: Before dispatching fix workers from a bugsweep report, adversarially verify every claim against actual source code — what if the bugsweep itself is wrong?
source: auto-skill
extracted_at: '2026-06-07T00:29:26.654Z'
---

# Bugsweep Claim Falsification Check

Use this when you have a bugsweep, audit report, or regression analysis with specific claims about what code does — and you need to verify those claims against the **actual source code** before dispatching fixes. Bugsweep reports are hypotheses, not ground truth. Premises can be wrong, element sources can be misidentified, and "missing" features may actually exist in a different module.

## When to Use

- A bugsweep report claims specific DOM elements are "missing" or "dropped" — verify what actually creates them.
- An audit claims a function "should" do X — verify its actual implementation before changing it.
- A regression analysis says "commit A broke X" — check whether X was ever supported by that path.
- A worker or subagent report makes high-level claims ("lifecycle.js dropped DOM scaffold init") that would require significant rework if true.
- Any time fixing the claimed bug would require changing multiple files or a core architectural layer.

## When NOT to Use

- The bugsweep provides exact file:line references and the fix is obvious (use STRUCTURED_BUG_SURGERY directly).
- The bugsweep/audit was done by a human whose domain knowledge you trust (you can skip adversarial verification but should still spot-check).
- The issue is a simple value change on a known line (no premise to verify).

## The Falsification Pattern

### Step 1: Extract the Verifiable Claims

From the bugsweep report, pull out every **assertion** that can be checked against source code. Not recommendations or opinions — specific claims like:

> "`ensureFocusStageAuxiliaryDom()` creates `#focus-stage`, `#thread-inspector`, `.compass-rail`, `#mode-chips`"

vs. the actual code. Write these out as a table:

| Claim | What to check | Source of truth |
|---|---|---|
| `ensureFocusStageAuxiliaryDom()` creates `#selected-card` | grep / read the function body | `focus-stage-dom.js:201-226` |
| "5 missing init calls" | grep for `createElement` with each ID | All JS modules |
| Elements are "not in the HTML shell" | grep for `id="selected-card"` in HTML | `vector-explorer-polished.html` |

### Step 2: Trace Each Claim to Its Truth Anchor

For each claim, identify the **definitive check**:

| Claim Type | Verification Method | Example |
|---|---|---|
| "Function X creates element Y" | Read function body, grep for `createElement.*Y` or `innerHTML.*Y` | `ensureFocusStageAuxiliaryDom()` → read lines 201-226 |
| "Element X is missing from the DOM" | Grep HTML shell + all Svelte components + all JS `createElement` calls | `grep -r "id=selected-card"` across all file types |
| "Init call X was dropped" | Grep for the function call in the init sequence | `grep "ensureFocusStageAuxiliaryDom" app.ts lifecycle*.js` |
| "Module X was refactored and lost Y" | Diff the exported surface of the old and new module | `grep "^export" old.js` vs `grep "^export" new.ts` |
| "X surfaces are broken" | Check each surface's DOM dependencies exist | Run contract tests, then debug specific failures |

### Step 3: Check the Actual Element Sources

When a bugsweep claims DOM elements are "missing" or "not created," trace ownership across three sources:

1. **Static HTML** — `vector-explorer-polished.html` or `index.html`. Check whether elements are present in the shell.
   ```bash
   grep 'id="element-name"' *.html
   ```

2. **Svelte components** — `src/components/*.svelte`. Check whether elements are rendered by the Svelte track.
   ```bash
   grep -rn 'id="element-name"' src/components/ src/lib/
   ```

3. **JS-created** — `js/modules/*.js` and `*.ts`. Check `createElement` or `innerHTML`.
   ```bash
   grep -rn 'createElement.*element-name\|id.*=.*element-name' js/modules/
   ```

**Critical insight:** If the element exists in sources 1 or 2, the bugsweep's claim that a JS function "should" create it is **wrong by premise**. The element is correctly owned by another layer.

### Step 4: Hypothesize the Falsification

Run through these adversarial questions for the entire claim:

- **"If this claim were wrong, what would be the simplest alternative explanation?"** e.g., "The elements aren't missing — they were always rendered by Svelte components, not created by that JS function."
- **"What would the code look like if the function had never created those elements?"** If the function never had `createElement` calls for those IDs, the claim that they were "dropped" is false.
- **"Could the report have misidentified which module owns this?"** e.g., A `lifecycle.js` regression report blames lifecycle.js, but the actual ownership is in `app.ts`.
- **"Is there a simpler explanation for the observed test failures?"** e.g., "The 65 contract failures could be pre-existing (not caused by this refactor) or caused by a different change."

### Step 5: Verify Against Tests (When Possible)

If the bugsweep claims specific test failures:
1. Run the tests yourself from the main lane — don't trust the report's failure summary.
2. Check whether the failures existed BEFORE the alleged root cause (via `git stash` or checking a pre-refactor commit).
3. Check whether the tests use selectors or elements that were never created by the function the report blames.

### Step 6: Categorize Each Claim

| Verdict | Meaning | Action |
|---|---|---|
| **CONFIRMED** | The claim matches what the code actually does | Dispatch a fix following the claim |
| **FALSE_PREMISE** | The claim is about what the code SHOULD do, but the code was never written that way | Update the bugsweep report, do not fix |
| **MISATTRIBUTED** | The claim is correct about a symptom but wrong about the cause | Re-route the investigation to the correct module |
| **ALREADY_FIXED** | The claim was correct at report time but the code has changed since | Verify in current HEAD, mark resolved |
| **UNABLE_TO_VERIFY** | The claim is too vague to check against code | Request clarification |

### Step 7: Update the Bugsweep Document

After verification, update the original bugsweep report with corrected findings. Use explicit language:

> "Status: INVALID / DEBUNKED — the original claim stated that `ensureFocusStageAuxiliaryDom()` creates elements it does NOT create. Verification of the actual function shows..."

Include:
- What the report claimed
- What the actual code does
- Where the elements actually come from (so future readers don't rediscover the same false premise)

## Output Format

```
## Claim Verification Results

| # | Claim | Verdict | Evidence | Action |
|---|---|---|---|---|
| 1 | "Function X creates Y" | FALSE_PREMISE | read function body → no createElement for Y | Update report, no fix needed |
| 2 | "Elements missing from shell" | CONFIRMED | grep HTML → not found | Route to Svelte component |
| ...

### Key Correction
The report assumed all DOM elements must be created by a single JS function. In a Svelte-migration project, many elements are Svelte-rendered. The "missing" init calls were never needed.

### Follow-up
- Update the bugsweep doc with corrected status
- Verify no actual regressions exist from the refactor
```

## Common False Premises

Watch for these recurring patterns in bugsweep reports:

| False Premise | Why It's Wrong | How to Detect |
|---|---|---|
| "A single JS function creates all DOM elements" | Svelte migration splits creation across HTML shell, Svelte components, and legacy JS | grep each ID across all file types |
| "lifecycle.js is the only init path" | `app.ts` orchestrates the full init, lifecycle.js is one participant | Read `app.ts init()` sequence |
| "Refactoring a module drops functionality" | Unless exports changed and callers weren't updated, the functionality still exists | `git diff` the refactored module's export surface |
| "Missing DOM elements cause all test failures" | Tests may fail for unrelated reasons (stale selectors, timing, pre-existing breakage) | Run tests independently against a known-good commit |
| "The refactored files are the ONLY ones that changed" | Other changes in the same commit may affect behavior | `git show --stat` to see all modified files in the suspect commit |
| "File X is orphan/dead code" | Import search can be spoofed by extensions and dynamic/delayed loading (`import()`), relative paths, or effect-only modules. A missing module can break startup; a false negative can break build or runtime | Exhaustively search for the filename across source, templates, and styles, then confirm the build still works before deleting |

## Why This Matters

Bugsweep reports are written by workers who may:
- **Misread function bodies** (seeing what they expect, not what's there)
- **Confuse Svelte-rendered elements** with JS-created ones
- **Attribute symptoms to the wrong root cause** (blaming the refactor when the issue is pre-existing)
- **Use stale source** (the code changed between when the sweep started and when it read the file)

Verifying claims before dispatching fixes saves days of wasted work, prevents touching code that was never broken, and keeps the fix wave focused on actual bugs.

## Adjacent Skills

- **STRUCTURED_BUG_SURGERY** — Use AFTER claim verification, for the verified bugs. Its Phase 1 (Verify-Before-Fix) covers per-bug spot-checking.
- **PARALLEL_DIAGNOSTIC_BUGSWEEP** — Produces the bugsweep reports that this skill verifies.
- **DOUBLE_WORKER_VERIFICATION** — For verifying implementation worker claims against on-disk state.
