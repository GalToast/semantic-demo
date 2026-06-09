# Subagent task: Fix 10 contract gaps in `info-panel-populated` surface

## Context

The `info-panel-populated` surface in `tests/surface-contract-check.mjs` has 10 failing checks:
- `dom:#selected-card` — `#selected-card` element missing
- `state:#selected-card-populated` — populated state attr missing on `#selected-card`
- `dom:#selected-details` — `#selected-details` missing
- `visibility:#selected-details` — `#selected-details` is hidden when it shouldn't be
- `dom:#selected-name` — child element missing
- `dom:#selected-what` — child element missing
- `dom:#selected-theme` — child element missing
- `dom:#selected-status` — child element missing
- `dom:.selected-hero` — `.selected-hero` missing
- `dom:#selected-role-badge` — `#selected-role-badge` missing

Test passes via: `node tests/surface-contract-check.mjs --surfaces=info-panel-populated --headed`. Currently: 3 pass / 10 fail.

The Svelte InfoPanel component (`src/components/InfoPanel.svelte`) is single-track per AGENTS.md. The contract test was written for the legacy JS renderers in `js/modules/journey-selected-card.js`. After the Svelte migration, the DOM diverged.

## Goal

Fix the 10 fails. End state: 0 fail (or as close as possible — if 1-2 are unavoidable due to architectural mismatch, document them).

## Phase 1: Read & Plan (≤120s, HARD STOP)

Read:
- `tests/surface-contract-check.mjs` — find the `--surface=info-panel-populated` block. Show me lines defining each failing check and what they assert.
- `src/components/InfoPanel.svelte` — current Svelte implementation, what it renders
- `src/components/FocusCard.svelte` — might be related (the focused business card)
- `js/modules/journey-selected-card.js` — legacy renderer (READ-ONLY, for context)
- `js/modules/ui-renderers.js` — legacy renderers (READ-ONLY, for context)
- `vector-explorer-polished.html` — check if `#selected-card` / `#selected-details` / etc. exist in the static HTML

**Do NOT read:**
- `dist/bundle.js` (minified)
- `css/mobile_premium_*.css` (off-limits per AGENTS.md)
- `js/state.js` (off-limits)
- `js/modules/app.js` (off-limits)
- `js/modules/lifecycle.js` (off-limits)
- `js/modules/journey.js` (off-limits)
- `js/modules/focus-pocket.js` (off-limits)
- `js/modules/journey-compass-state.js` (off-limits)
- `tests/visual-state-audit.mjs` (different audit)
- Anything in `dist/`

Output a per-check plan. For each of the 10 fails, decide:
- **Fix the Svelte side**: which file, what attribute/element to add
- **Fix the contract check**: which line, why the check is wrong
- **Skip with comment**: which check is fundamentally outdated, no longer makes sense

Default to fixing the Svelte side (per AGENTS.md, Svelte is canonical).

## Phase 2: Apply fixes (≤300s)

- For each fail being fixed, ≤15 lines per fix
- Do NOT touch off-limits files
- Do NOT change visual appearance (only DOM/contract structure)
- Do NOT commit
- If you remove a check that's fundamentally outdated, comment in the source why

## Phase 3: Verify (≤90s, HARD STOP)

Run:
```
node tests/surface-contract-check.mjs --surfaces=info-panel-populated --headed
```

Target: ≤2 fail remaining (with documented reasons).

Then:
```
npm test
```

Must still pass.

## Phase 4: Return (≤30s)

Reply with:
- `git diff --stat` of your changes
- Final info-panel-populated pass/fail counts
- For each originally-failing check: pass / fail / "removed, [reason]"
- Risk notes (any test that was changed not just data, any near-miss)

## Timeout: 600s

If behind schedule, prioritize Phase 1 plan and Phase 3 verification.

## Tools & verification

- Full harness (Read, Write, Edit, Bash, Grep, Glob)
- Mode: yolo/full-allow
- cwd: `C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`
- In-process read/glob can return stale data. Verify with shell: `git diff`, `findstr`, `dir`.

## Model: `opencode-go/deepseek-v4-flash`
