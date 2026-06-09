# Subagent task: Fix 2 contract gaps in `controls` surface

## Context

The `controls` surface in `tests/surface-contract-check.mjs` has 2 failing checks:
- `dom:view-toggle` — the `.view-toggle` element is missing or not rendered (`display !== 'none'`)
- `dom:view-toggle-buttons` — the `.view-toggle button` count is wrong (likely 0)

The test passes `node tests/surface-contract-check.mjs --surfaces=controls --headed`. Currently: 8 pass / 2 fail.

## Goal

Fix both fails. End state: 0 fail on `controls`.

## Phase 1: Read & Plan (≤60s, HARD STOP)

Read:
- `tests/surface-contract-check.mjs` — find the `--surface=controls` block. Show me which lines define the failing checks and what they assert.
- `src/components/Controls.svelte` (if exists) — controls rendering
- `src/components/Header.svelte` (might contain the view toggle)
- `js/modules/bindings/view-bindings.js` — view toggle JS wiring
- `js/modules/journey-compass-controller.js` — might call switchView
- `vector-explorer-polished.html` — look for `.view-toggle` in the static HTML (might be entirely JS-rendered)

**Do NOT read:**
- `dist/bundle.js` (minified)
- `css/mobile_premium_*.css` (off-limits)
- `js/state.js` (off-limits)
- `js/modules/app.js` (off-limits)
- `js/modules/lifecycle.js` (off-limits)
- `js/modules/journey.js` (off-limits)
- `js/modules/focus-pocket.js` (off-limits)
- `js/modules/journey-compass-state.js` (off-limits)
- `js/modules/ui-renderers.js` for writing (read OK)
- `tests/visual-state-audit.mjs` (different audit)

Output a 2-3 bullet plan: for each fail, which side to fix and what change. Default to fixing the Svelte/JS side to emit the expected DOM (per AGENTS.md, Svelte is canonical).

## Phase 2: Apply fixes (≤180s)

- For each fail, fix the smallest surface that satisfies the contract
- Each fix ≤10 lines
- Do NOT touch off-limits files
- Do NOT change visual appearance (only DOM/contract structure)
- Do NOT commit — main lane coordinates commits

If the contract check itself is wrong (e.g., expects an old selector that no longer makes sense), update the check. Comment why.

## Phase 3: Verify (≤60s, HARD STOP)

Run:
```
node tests/surface-contract-check.mjs --surfaces=controls --headed
```

Target: 0 fail on `controls`.

Then:
```
npm test
```

Must still pass. If it doesn't, fix the regression before returning.

## Phase 4: Return (≤30s)

Reply with:
- `git diff --stat` of your changes
- Final controls pass/fail counts
- For each originally-failing check: pass / fail / "removed"
- Risk notes

## Timeout: 300s

If behind schedule, prioritize Phase 1 plan and Phase 3 verification.

## Tools & verification

- Full harness (Read, Write, Edit, Bash, Grep, Glob)
- Mode: yolo/full-allow
- cwd: `C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`
- In-process read/glob can return stale data. Verify with shell: `git diff`, `findstr`, `dir`.

## Model: `opencode-go/mimo-v2.5`
