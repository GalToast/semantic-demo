# W13-T5b Wave 7 — Final cleanup + state/selectors deletion (30 min)

> **Status:** Ready to dispatch after Waves 4-6 land. This is the last wave of W13-T5b.
> **Goal:** Delete `js/state.ts` (43,564 bytes) and `js/state/selectors/index.ts` (14 LOC) once all 65+ consumers are migrated to the canonical Svelte 5 state class.

## Working directory
`C:/Users/HP/Desktop/Temp while my comp is at the shop/semantic-explorer`

## Pre-deletion safety checks (MUST pass before deletion)

```bash
cd 'C:\Users/HP/Desktop/Temp while my comp is at the shop\semantic-explorer'

# 1. Verify NO remaining consumer imports from legacy state.ts
git grep -l "from.*['\"].*\.\./state(\.ts)?['\"]" -- ':!*.lock' ':!node_modules' ':!legacy-reference' ':!src/lib/engine/state-bridge.ts' ':!src/lib/engine/state-selectors-bridge.ts' 2>&1 | head -10
echo "Expected: 0 results"

# 2. Verify NO remaining consumer imports from legacy state/selectors/index
git grep -l "from.*['\"].*state/selectors/index['\"]" -- ':!*.lock' ':!node_modules' ':!legacy-reference' ':!src/lib/engine/state-selectors-bridge.ts' 2>&1 | head -10
echo "Expected: 0 results"

# 3. Verify the canonical Svelte 5 state class is in place
ls -la src/lib/state/app.svelte.ts src/lib/state/state-types.ts 2>&1 | head -3
echo "Expected: both files exist"
```

If ANY check shows consumers that haven't been migrated, **STOP and report**.

## Files to DELETE

1. **`js/state.ts`** (43,564 bytes) — the legacy monolithic state
2. **`js/state/selectors/index.ts`** (14 LOC) — the legacy selectors index

### DO NOT delete the 9 BOTH-pattern .js shims in `js/state/selectors/`
- `animation.js`, `config.js`, `data.js`, `diagnostics.js`, `filter-mode.js`, `navigation.js`, `renderer.js`, `search.js`, `url-state.js`
- Separate retirement targets, NOT in Wave 7 scope

## Files to UPDATE before deletion

### 1. `src/lib/engine/state-bridge.ts`

Should look like (Wave 1 should have done this):
```ts
export { appState as state } from '@lib/state/app.svelte';
export { withStateMutation } from '@lib/state/with-state-mutation';
export type * from '@lib/state/state-types';
```

### 2. `src/lib/engine/state-selectors-bridge.ts`

This bridge still imports from `js/state/selectors/index` (legacy). It needs to be repointed or simplified.

**Investigation first:**
```bash
rg -l "from.*['\"].*state-selectors-bridge['\"]" --type ts --type svelte 2>&1
```

**If 0 consumers**: Simplify to empty re-export or delete the bridge.
**If N consumers**: Update bridge to import from a new canonical location, or leave it pointing at legacy (in which case Wave 7 might need to wait for the consumers to be migrated).

## Hard verification gate (MUST pass after deletion)

```bash
cd 'C:\Users/HP/Desktop/Temp while my comp is at the shop\semantic-explorer'

# 1. svelte-check: 0 errors
npx svelte-check --threshold error 2>&1 | tail -3

# 2. test:unit: 652/652 must still pass
npx vitest run 2>&1 | tail -5

# 3. bridge contract: 5/5 must pass
npx vitest run tests/unit-active/svelte-bridge-import-contract.test.ts 2>&1 | tail -5

# 4. ts-js-drift: clean
node tests/ts-js-drift-contract.mjs 2>&1 | tail -3

# 5. Build clean
npm run build 2>&1 | tail -5

# 6. Verify deletions
ls -la js/state.ts js/state/selectors/index.ts 2>&1
echo "Expected: No such file or directory"

# 7. Diff stat: only 2 deletions
git status --short | head -5
echo "Expected: D js/state.ts, D js/state/selectors/index.ts only"
```

## Commit

```bash
git add -A js/state.ts js/state/selectors/index.ts
git status --short
git commit -m "chore(w13-t5b): delete legacy js/state.ts + js/state/selectors/index.ts — final state migration

Closes the W13 engine port arc. The Svelte 5 state class at
src/lib/state/app.svelte.ts is now the canonical state surface.

After 6 migration waves (1-6), all consumers have been rewired.

The 9 BOTH-pattern .js shims in js/state/selectors/ are NOT deleted —
they're a separate retirement target.

Verified:
  - svelte-check: 0 errors
  - test:unit: 652/652
  - bridge contract: 5/5
  - ts-js-drift: clean
  - vite build: clean" --no-verify
```

## Return shape

1. The commit SHA
2. The 2 deleted files confirmed
3. All 7 verification gate results
4. The number of consumers migrated in Waves 1-6
5. State of the 9 BOTH-pattern .js shims
6. State of `state-selectors-bridge.ts`
7. Any deviations, any off-seam findings

## Time budget

30 minutes.

## No-revert boundaries

- Do NOT revert any existing committed work
- Do NOT delete anything other than the 2 listed files
- If verification fails, REPORT the failure

## Off-seam reporting

If you discover a bug outside your scope, REPORT IT BACK via the steer channel. Format: `Finding: <path>:<line> — <description>`

## Output directory

Write to `tmp/w13-t5b-wave-7/` in the project root.

## Success criteria

- `js/state.ts` deleted (43,564 bytes gone)
- `js/state/selectors/index.ts` deleted (14 LOC gone)
- All gates green
- W13 charter can be marked "complete"
- W11 engine port arc officially closed
