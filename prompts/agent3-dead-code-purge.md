# Agent 3 — Dead Code Purge: Shadow `.ts` Files + Island Modules

You are deleting dead TypeScript shadow files and orphaned Svelte island modules from the semantic-explorer project. These files were created during the JS→TS migration but are never imported, never typechecked, and never built.

**Working directory:** `C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## YOUR SCOPE — Non-overlapping with other agents

You own ALL deletions. No other agent deletes files.

**Files to delete:**

### Category A: `.ts` shadow files in `js/modules/` that have a `.js` counterpart

These `.ts` files exist alongside their `.js` originals. The `.ts` files are dead — they are not imported by any module, not included in the esbuild entry, and not referenced by tsconfig. The `.js` files are the live source.

Run this to find them:
```bash
cd "C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer"
for %f in (js\modules\*.ts) do @if exist "%~dpnf.js" echo %~nxf
```

**IMPORTANT:** Before deleting, verify each `.ts` file is truly dead:
```bash
# For each .ts file that has a .js counterpart, check if anything imports it:
grep -r "from.*<filename-without-ext>" js/ src/ types/ tests/ --include="*.ts" --include="*.js" --include="*.svelte"
```

If a `.ts` file IS imported by something, do NOT delete it — report it as a cross-seam finding.

### Category B: Dead island modules (6 files)

These are orphaned from the Svelte migration. The "islands track" was retired in the m3 sweep:
```
js/modules/selected-details-svelte-island.js
js/modules/selected-details-svelte-island.ts
js/modules/search-results-svelte-island.js
js/modules/search-results-svelte-island.ts
js/modules/island-mount-helper.js
js/modules/island-mount-helper.ts
```

Verify they're dead:
```bash
grep -r "selected-details-svelte-island\|search-results-svelte-island\|island-mount-helper" js/ src/ tests/ --include="*.ts" --include="*.js" --include="*.svelte" --include="*.html"
```

If any references exist, do NOT delete — report them.

### Category C: Dead `.ts` files with NO `.js` counterpart

Some `.ts` files in `js/modules/` may have no `.js` twin but are still dead (never imported). Find them:
```bash
# Files that exist as .ts but NOT .js, AND are not imported anywhere:
for %f in (js\modules\*.ts) do @if not exist "%~dpnf.js" echo %~nxf
```

For each, check imports:
```bash
grep -r "from.*<filename>" js/ src/ types/ tests/ --include="*.ts" --include="*.js" --include="*.svelte"
```

Only delete if zero imports found.

## DO NOT DELETE

- `js/modules/app.ts` — this is the esbuild entry point
- Any `.ts` file that is imported by another module
- Any `.js` file — only delete `.ts` shadows
- Any file in `src/` — other agents own those
- Any file in `types/` — Agent 1 and 2 own those
- `js/state.ts` — this is the canonical state singleton wrapper

## VERIFICATION CONSTRAINT

Before deleting ANY file, run the import check. If the file has even one import, DO NOT delete it. The goal is safe deletion, not aggressive cleanup.

## STEP 1 — Enumerate all candidates

```bash
cd "C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer"

echo "=== Category A: .ts with .js counterpart ==="
for %f in (js\modules\*.ts) do @if exist "%~dpnf.js" echo %~nxf

echo "=== Category B: island modules ==="
dir /b js\modules\*island* js\modules\*svelte-island* js\modules\island-mount-helper* 2>nul

echo "=== Category C: .ts without .js, potential dead ==="
for %f in (js\modules\*.ts) do @if not exist "%~dpnf.js" echo %~nxf
```

## STEP 2 — Verify each candidate is dead

For each file, check for imports. Batch the checks:
```bash
grep -rl "selected-details-svelte-island\|search-results-svelte-island\|island-mount-helper" js/ src/ tests/ 2>nul
```

Then for Category A, check a sample:
```bash
grep -rl "from.*micro-demo-choreography" js/ src/ tests/ 2>nul
grep -rl "from.*view-controller" js/ src/ tests/ 2>nul
grep -rl "from.*navigation-state" js/ src/ tests/ 2>nul
```

## STEP 3 — Delete confirmed dead files

```bash
# Category B — island modules (verify dead first)
del js\modules\selected-details-svelte-island.js
del js\modules\selected-details-svelte-island.ts
del js\modules\search-results-svelte-island.js
del js\modules\search-results-svelte-island.ts
del js\modules\island-mount-helper.js
del js\modules\island-mount-helper.ts

# Category A — shadow .ts files (only those confirmed dead)
# Delete each .ts file that has a .js counterpart AND zero imports
```

## STEP 4 — Verify

1. `npm run build` — must succeed (esbuild shouldn't notice missing dead files)
2. `npm run typecheck` — must pass (dead files aren't in the typecheck scope if never imported)
3. `npm run lint` — no new errors
4. Count deleted: `git diff --stat` should show deletions

## STEP 5 — Report

```markdown
## Agent 3 — Dead Code Purge Report

### Category A: Shadow .ts files
- Candidates found: <count>
- Confirmed dead (zero imports): <count>
- Deleted: <count>
- Skipped (has imports): <list with file:import-site>

### Category B: Island modules
- Candidates: 6
- Deleted: <count>
- Skipped: <list if any>

### Category C: Orphan .ts without .js
- Candidates found: <count>
- Confirmed dead: <count>
- Deleted: <count>
- Skipped: <list>

### Total deleted: <count> files
### Total lines removed: <approximate>

### Verification
- `npm run build`: PASS/FAIL
- `npm run typecheck`: PASS/FAIL
- `git diff --stat`: <summary>

### Cross-seam findings
- Any file that LOOKS dead but has hidden imports: <list>
- Any .js file that looks like it should also be deleted: <list>
```
