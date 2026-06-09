# Subagent task: Fix contract gaps in `controls` and `filters` surfaces

## Context

The semantic-explorer project is mid Svelte/TS migration. The fast-test pipeline (`npm test`) passes, but the visual contract suite has 15 pre-existing fails across 3 surfaces. This task addresses the 5 fails in `controls` (2) and `filters` (3).

The build is now working (just restored `app.ts` from `753583b`). All your edits will be verifiable.

## Goal

Fix the 5 failing contract checks in:
- `controls` surface: 2 fails (likely `dom:view-toggle`, `dom:view-toggle-buttons`)
- `filters` surface: 3 fails (likely `dom:filter-chips`, `dom:city-filter-select`, `dom:filter-clear-btn`)

## Phase 1: Read & Plan (≤90s)

Read these files to understand the failing checks and the actual DOM:
- `tests/surface-contract-check.mjs` — find the failing `controls` and `filters` checks (look for the `--surface=controls` and `--surface=filters` paths)
- `src/components/` — list the Svelte components (`.svelte` files) to find the controls and filter renderers
- `js/modules/filter-chrome-island.js` — the filter island JS
- `js/modules/bindings/view-bindings.js` (if exists) — view toggle wiring

**Do NOT read:**
- `dist/bundle.js` (minified, not useful)
- `node_modules/`
- The legacy `js/state.js` (off-limits per AGENTS.md)
- The `css/mobile_premium_*.css` files (off-limits per AGENTS.md)
- The `tests/visual-state-audit.mjs` (different audit, different checks)

Before any edit, write a 1-2 sentence plan: for each failing check, will you fix the Svelte side (add the missing data-attr / DOM element) or update the contract test (if the check is wrong)? Post the plan before Phase 2.

## Phase 2: Apply the fixes (≤360s)

For each of the 5 failing checks:
- If the Svelte side is missing the selector: add the minimum needed (a `data-*` attribute, an element, a class)
- If the contract check is wrong (expecting old DOM that no longer applies): update the check

**Constraints:**
- Do NOT touch the off-limits surface (AGENTS.md): `css/mobile_premium_*.css`, `js/state.js`, `js/modules/app.js`, `js/modules/lifecycle.js`, etc.
- Do NOT change the visual appearance (CSS) — fix the DOM/contract only
- Do NOT add new Svelte components — fix existing ones
- Each fix should be ≤10 lines
- Do NOT commit (the main lane coordinates commits)

## Phase 3: Verify (≤120s)

Run:
- `npm test` — must pass (the fast pipeline)
- `npm run qa:contract:controls` — must show 0 fails on controls
- `npm run qa:contract:filters` — must show 0 fails on filters

If any fails, iterate. Do not declare success until all 3 commands pass cleanly.

## Phase 4: Return

Reply with:
- Changed files list (output of `git diff --stat` after your edits)
- Which checks now pass (5/5 expected)
- Risk notes (anything you noticed that could break elsewhere)
- If you couldn't fix all 5, which you couldn't and why

## Timeout: 600s

If you're behind schedule, prioritize Phase 1 (read & plan) so I can take over.

## Tools

You have full harness access. Use shell tools to verify (`git diff`, `dir`, `findstr`).
