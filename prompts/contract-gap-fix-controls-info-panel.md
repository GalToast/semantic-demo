# Subagent task: Fix 12 contract gaps in `controls` and `info-panel-populated`

## Context

The semantic-explorer project is mid Svelte/TS migration. The fast-test pipeline (`npm test`) passes. The visual contract suite has 12 pre-existing fails across 2 surfaces:

- **`controls` surface** (2 fails):
  - `dom:view-toggle` — `.view-toggle` element missing or non-`display !== 'none'`
  - `dom:view-toggle-buttons` — `.view-toggle button` count is wrong

- **`info-panel-populated` surface** (10 fails):
  - `dom:#selected-card` — `#selected-card` element missing
  - `state:#selected-card-populated` — `data-populated` or similar state attr missing on `#selected-card`
  - `dom:#selected-details` — `#selected-details` missing
  - `visibility:#selected-details` — `#selected-details` hidden when it shouldn't be
  - `dom:#selected-name`, `dom:#selected-what`, `dom:#selected-theme`, `dom:#selected-status` — 4 child elements missing
  - `dom:.selected-hero` — `.selected-hero` missing
  - `dom:#selected-role-badge` — `#selected-role-badge` missing

The build is now working (just restored `js/modules/app.ts` from `753583b`).

## Your tools

- Full harness: Read, Write, Edit, Bash, Grep, Glob
- Inherited MCP: everything in the user's normal Qwen config
- Mode: `yolo/full-allow` (don't block on approvals)
- cwd: `C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## Goal

Bring the 12 fails to 0 (or as close as possible) and verify with the contract test.

## Phase 1: Read & Plan (≤90s, HARD STOP)

Read these files:
- `tests/surface-contract-check.mjs` — find the `--surface=controls` and `--surface=info-panel-populated` sections; identify the EXACT selectors and what they assert
- `src/components/Controls.svelte` (if exists) — view toggle rendering
- `src/components/InfoPanel.svelte` — populated info panel
- `src/components/FocusCard.svelte` — might host the selected-card content
- `js/modules/ui-renderers.js` (read-only) — see how legacy renders the selected details
- `js/modules/bridge-registry.js` (does NOT exist — it's deleted) — skip
- `js/modules/journey-selected-card.js` — read-only, for context

**Do NOT read:**
- `dist/bundle.js` (minified, useless)
- `css/mobile_premium_*.css` (off-limits per AGENTS.md)
- `js/state.js` (off-limits)
- `js/modules/app.js` (off-limits)
- `js/modules/lifecycle.js` (off-limits)
- `js/modules/journey.js` (off-limits)
- `js/modules/focus-pocket.js` (off-limits)
- `js/modules/journey-compass-state.js` (off-limits)
- `js/modules/ui-renderers.js` for writing (read-only is fine, do not edit)
- `tests/visual-state-audit.mjs` (different audit)

After reading, output a 3-5 bullet plan:
- For each failing check, which side to fix (Svelte component or contract test)
- If Svelte side, which file and what change
- If contract test, which line and what to update

**Wait for me to confirm the plan** is NOT required. Just start Phase 2 if the plan is clear. If you're uncertain, default to: fix the Svelte side to emit the expected DOM (per AGENTS.md, Svelte is canonical).

## Phase 2: Apply fixes (≤360s)

For each fail:
- Prefer fixing the Svelte side: add missing `id`/`class`/`data-*` attribute or render the missing element
- Each fix should be ≤15 lines
- Do NOT touch off-limits files (see above)
- Do NOT change the visual appearance (only DOM/contract structure)
- Do NOT commit — the main lane coordinates commits

If a check is genuinely wrong (expecting old DOM that no longer makes sense), update the check in `surface-contract-check.mjs`. Comment why.

## Phase 3: Verify (≤120s, HARD STOP)

Run:
```
node tests/surface-contract-check.mjs --surfaces=controls,info-panel-populated --headed
```

Target: 12 fail → 0 fail (or near 0; report which remain and why).

Then run `npm test` to confirm no regression. If `npm test` fails, that's a hard fail — fix it before returning.

## Phase 4: Return (≤30s)

Reply with:
- `git diff --stat` of your changes
- Final pass/fail counts for both surfaces
- For each originally-failing check: pass / fail / "not applicable, removed"
- Risk notes (any near-miss, any test that was changed not just the data)

## Timeout: 600s

If you're behind schedule, prioritize Phase 1 plan output and Phase 3 verification — the actual fix is bounded and we can iterate.

## Verification

Use shell tools to verify. In-process read/glob can return stale data; trust `git diff`, `git show`, and test command output.
