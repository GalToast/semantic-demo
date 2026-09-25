---
name: SURFACE_CONTRACT_SELECTOR_DRIFT_FIX
description: Diagnose and repair surface contract failures caused by stale DOM selectors in contract tests that no longer match the production shell, applying minimal selector-compatibility fixes before considering source changes.
source: auto-skill
extracted_at: '2026-06-09T07:39:23.23Z'
---

# Surface Contract Selector Drift Fix

## When to use

- A named surface contract (`npm run qa:contract:<surface>`) fails with missing-DOM messages like `dom:...`, `dom:map-trail-strip`, `dom:trail-review-overlay`, etc.
- The failure stack points at `querySelector`/`querySelectorAll` returning null/0 while the test author expected the element to exist.
- You are in an implementation lane and are allowed to edit the surface’s contract test or target component, but not deploy scripts or unrelated TS migration files.
- The user or task brief states the production shell path, e.g. `vector-explorer-polished.html -> dist/bundle.js -> ... -> App.svelte`, and explicitly warns that the separate `src/` preview app is not the production shell for this contract.

## First principles

1. **Production DOM is the source of truth for the contract.** Do not “fix” the production shell by inventing new IDs/classes unless the brief requires it. The smallest correct patch for a selector-drift failure is to update the contract test’s selectors so they match the DOM the user is already shipping.
2. **Test selectors are a compatibility surface.** They should accept current production IDs, classes, and fallback aliases, not the other way around.
3. **Environment hygiene is part of verification.** If the local dev server is returning API JSON instead of static HTML for the production shell URL, fix the server/router conflict first so the contract runner is actually exercising the page the user cares about.

## Procedure

### 1. Read the failing assertion function

- In `tests/surface-contract-check.mjs`, locate the `assert_<surface>(page, ctx)` function and the `VIEWPORTS['<surface>']` entry.
- Identify every `querySelector` / `querySelectorAll` used for the reported missing DOM.
- Note the exact fail messages so you can keep them accurate after patching.

### 2. Inspect the production shell DOM

- Read `vector-explorer-polished.html` (or the user-stated production shell) and grep for the expected IDs/classes.
- Do not assume the separate Svelte `src/` preview app is the contract target; the brief may explicitly designate the polished HTML shell.
- Record the real selectors (e.g. `#map-trail-strip` vs the test’s `#map-trail`).

### 3. Verify the dev server is serving the right content

- `curl -s http://127.0.0.1:<port>/<production-shell>` should return HTML `<!DOCTYPE html>`.
- If it returns API JSON (often from a `api.php` route collision), stop an overlapping server process on that port (e.g. `taskkill /PID <php-pid> /F`) and re-verify the Python static server is serving the HTML.
- Do not treat this as part of the patch; it is a pre-verification environment cleanup.

### 4. Apply minimal selector-override edits to the contract test

For each stale selector:

| Stale query selector pattern | Preferred fix |
|---|---|
| Test queries `#map-trail` but shell has `#map-trail-strip` | Use `#map-trail-strip, #map-trail, .map-summary` so the test accepts the current ID plus legacy / alias fallbacks |
| Test queries `.map-stops` but shell has `#trail-controls` | Use `#trail-controls, .map-stops` |
| Test queries `.map-title` but shell has `.map-strip-title` | Use `.map-strip-title, #trail-context, .map-title` |
| Test counts `.map-stop` but shell exposes no `.map-stop` elements in static DOM | Count `#trail-controls .focus-stage-action-btn` as route-dot equivalents, because those buttons are the actual static controls |
| Test queries `.search-result` after QA recovery but the production shell now renders `.search-result-item` inside `#search-results` | Query `.search-result-item, .search-result` and inspect `#search-results .search-result-listitem` children before declaring missing DOM, because the production shell can expose result rows without the older generic class |

- Do **not** touch CSS unless a live geometry failure (overlap, clipping, blocking viewport) is confirmed. For missing-DOM contract failures, selector adjustments in the test are sufficient.
- Update error strings so they reference the actual production ID/class (e.g. `missing #map-trail-strip` instead of `missing #map-trail`).

### 5. Re-run the exact contract test

- `npm run qa:contract:<surface> -- --headless`
- Confirm pass/fail count and inspect the JSON summary for exceptions.
- If failures remain: inspect which checks still fail, determine if the remaining gaps are environment issues (server routing, session guards), shell-state mismatches (elements present but hidden), or new regressions introduced elsewhere.

### 6. Handoff summary requirements

Return:
- **Summary** of root cause (environment + selector drift types)
- **Files changed** with line-level evidence
- **Verification result** with exact pass/fail counts
- **Risks or unresolved issues** (e.g. a button referenced in the test does not exist in the production shell, or a preview app is not the production shell)

## Anti-patterns to avoid

| Anti-pattern | Why it fails | Correct behavior |
|---|---|---|
| "The test is right, the DOM is wrong; add the missing ID/class to the shell." | The shell is what ships. Adding new DOM for a test couples production to a flaky test surface. | Update the test to accept the existing production DOM. |
| Skipping server verification and trusting the first test run output | A wrong server can return API JSON for the HTML URL, making every DOM assertion return `null` or `0` | Always `curl` the production shell URL before patching anything. |
| Editing CSS/layout for missing-DOM failures | Missing DOM cannot be fixed by display rules | Verify element presence first; only touch CSS when geometry is the actual failure. |
| Treating the `src/` preview app as the contract target when the brief says otherwise | The user’s domain separation is load-bearing in staged migrations | Stay inside the designated production shell and owned files. |
| Forgetting to update error messages after selector changes | Failed-check reports lie, and future debugging will blame the wrong ID | Keep error strings aligned with the new selectors. |
| "The contract is failing, so I should add the Svelte-only nodes/mutations to legacy DOM." | The legacy shell owns the production runtime; Svelte-only elements are liable to appear empty, hidden, transit-only, or duplicative in legacy, and can widen blast radius during migration. | Prefer updating contract selectors; only add legacy DOM when the user explicitly wants production features. If a selector points at Svelte-only markup, separate contract surfaces by runtime target. |

## Selector audit reflex

Before changing anything, classify each failing selector:

1. **Missing static element** — the element is absent from `vector-explorer-polished.html`.
2. **Hidden by view-state** — the element exists in the HTML but `hidden`/data attributes/state derivation keeps it from being visible in the tested surface.
3. **Svelte-only marker** — the selector exists only in `src/` and not in the production shell the contract runner loads.
4. **Bundle-only behavior** — static creation plus bundle runtime mutation/cleanup; test timing may matter.
5. **Missing activation target** — the test clicks a control that does not ship at all (e.g. `#btn-focus-path` is referenced by CSS but exists in neither legacy HTML nor Svelte output). Treat this as an activation-coverage gap first; prefer updating the contract activation selector to an existing production control, and only add the control if the UX is load-bearing.

Most selector drift resolves with 1–5, not with new DOM.

## Example conclusion slot (mirror the result you returned)

- **URL under test:** `http://127.0.0.1:<port>/vector-explorer-polished.html`
- **Test result:** `<N> pass / 0 fail`
- **Environment note:** `<optional server cleanup note>`
- **Next suspicious seam:** `<optional follow-up>`
