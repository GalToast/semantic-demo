# Mistral Subagent 1 — Dead Code Deletion + AGENTS.md Sync

## Role
You are a **fix-and-verify** subagent. You will edit/delete specific files within your scope and verify each change. Stay inside your scope — do not touch anything not listed.

## Working Directory
`C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## Source of Truth
Read `docs/semantic-demo-bugsweep-m3-2026-06-07.md` sections **H2** (dead `.ts` shadows) and **H3** (dead islands) for full evidence. The worker's findings are verified against source — trust them.

## Scope (you MAY touch)
1. `js/modules/**/*.ts` — 145 dead shadow files
2. `js/modules/selected-details-svelte-island.{ts,js}`
3. `js/modules/search-results-svelte-island.{ts,js}`
4. `js/modules/island-mount-helper.{ts,js}`
5. `AGENTS.md` — one specific edit (Task 3)

## OUT OF SCOPE (do NOT touch)
- All other JS/TS source files
- All CSS files (off-limits per AGENTS.md)
- `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`
- `deploy.sh`, `deploy.ps1`
- `docs/semantic-demo-bugsweep-*.md` files (the findings doc is canonical)
- TS migration queue files: `js/modules/app.js`, `js/state.js`, `js/modules/lifecycle.js`, `js/modules/journey.js`, `js/modules/focus-pocket.js`, `js/modules/journey-compass-state.js`, `js/modules/ui-renderers.js`
- All other `.svelte` and `.ts` files outside the scope above

## What to SKIP
- Don't re-read the full findings doc. Read only sections H2, H3, and the "Rejected" table if you encounter pushback.
- Don't run the full test suite. Run `npm run check:shell` (or `npm run build`) only as a final smoke check.
- Don't review the CSS diffs in the working tree — that's a different finding.
- Don't fix any of the MEDIUM/LOW findings. Other subagents handle those.

## Tasks

### Task 1 — Delete 145 dead `.ts` shadow files in `js/modules/`
For each `.ts` file under `js/modules/`:
1. Verify it has a sibling `.js` (use `dir /B` on the directory)
2. Verify zero live references: `findstr /S /N "<module-name-without-ext>" js\**\*.js src\**\*.svelte src\**\*.ts src\App.svelte 2>nul`
3. If both checks pass, `git rm <path>`
4. If a `.ts` has no `.js` sibling OR has any live reference, **skip it and report it** — do not delete

Track counts: `deletions_attempted`, `deletions_succeeded`, `skipped_with_reason`.

### Task 2 — Delete 6 dead island files
- `js/modules/selected-details-svelte-island.{ts,js}`
- `js/modules/search-results-svelte-island.{ts,js}`
- `js/modules/island-mount-helper.{ts,js}`
- Verify zero references: `findstr /S /N "selected-details-svelte-island\|search-results-svelte-island\|island-mount" js\**\*.js src\**\*.svelte src\**\*.ts src\App.svelte src\index.html 2>nul`
- `git rm` each

### Task 3 — Update AGENTS.md
Find the line: "InfoPanel in BOTH tracks (72L island vs 767L src/) — needs dedup" (or similar)
Replace with a truthful statement. The islands are 100% orphan, so the "BOTH tracks" claim is stale. Suggested replacement:
```
- **Architecture state:** InfoPanel is single-track (src/ only — 767L). The legacy islands (`selected-details-svelte-island.{ts,js}`, `search-results-svelte-island.{ts,js}`, `island-mount-helper.{ts,js}`) are 100% orphan (zero live references) and were deleted in the m3 sweep on 2026-06-07.
```

## Time Budget
- 18 min total
- 5 min for verification commands
- 8 min for deletions (145 × ~3s each via git rm)
- 3 min for AGENTS.md edit + smoke test
- 2 min buffer

If you fall behind: prioritize Task 1 (biggest impact), then Task 2, then Task 3. Do not exceed 20 min.

## Methodology
1. **Verify before deleting** — every file must be confirmed dead via two-source check
2. **Use shell tools** (`git ls-files`, `findstr`, `git rm`, `dir /B`)
3. **One deletion at a time** if the file count is high — avoid bulk commands that hide errors
4. **Final smoke**: `npm run check:shell` to confirm no syntax errors

## Output
Save your report to `tmp/m3-subagent1-deletions-report.md` with:
- Files deleted (count + first 10 paths)
- Files skipped (path + reason)
- AGENTS.md diff
- Smoke test result (PASS/FAIL)
- Total time elapsed

## Return
≤120 words: deletions count, skips with reasons, AGENTS.md change, smoke test result, any blockers.
