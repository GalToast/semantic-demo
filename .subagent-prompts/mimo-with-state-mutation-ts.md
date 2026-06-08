# Mimo Subagent B — Extract `withStateMutation` to TypeScript

## Role
You are a **fix-and-verify** subagent. Create a new TS module and re-wire the existing JS consumer. Use source verification before each change. Stay inside your scope.

## Working Directory
`C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## Source of Truth
Read `tmp/m3-advisor-ts-migration-2026-06-07.md` Step 2 for the rationale and verification notes. The advisor verified the source locations.

## Scope (you MAY touch)
- New file: `src/lib/state/with-state-mutation.ts` (create)
- `js/state.js:432-461` (replace the function body and key sets with a re-export shim)
- `src/lib/types/state.ts:283` (add the `CRITICAL_KEYS` and `TRACKED_SUB_KEYS` typed tuples if helpful)
- `state-mutators.js` and `state-mutators.ts` (verify the import still works; if there's a `.ts` shadow, it will need updating to import from the new location — this is the `state-mutators` module that's already wrapped, so just verify the import path)

## OUT OF SCOPE (do NOT touch)
- All other files
- `tsconfig.json` (the typecheck-only include list can be reviewed but not edited in this pass)
- `vite.config.ts` (don't add aliases)
- Any other state-mutator / state-writer files (`semantic-threads.js`, `filter-state.js`, `url-state.js`, etc.) — they keep using the JS shim

## What to SKIP
- Don't extract the entire `state.js` (597 lines) — just the `withStateMutation` function and key sets.
- Don't rewrite the proxy set trap (`state.js:530-531`).
- Don't refactor the existing call sites in `state-mutators.js` — they should keep working via the shim.

## Task

### What to extract from `js/state.js`

The function at `js/state.js:432-450`:
```js
export function withStateMutation(fn) {
    if (!_isMutating) {
        // ...existing implementation
    }
}
```

And the key sets at `js/state.js:452-461`:
```js
const CRITICAL_KEYS = new Set([...]);
const TRACKED_SUB_KEYS = new Set([...]);
```

Read these carefully first to understand the implementation.

### Create `src/lib/state/with-state-mutation.ts`

Create a new file with:
1. **The function** (copy the body from `js/state.js:432-450`)
2. **The key sets** as `as const` tuples for type safety:
   ```ts
   export const CRITICAL_KEYS = ['currentView', 'navState', ...] as const;
   export type CriticalKey = typeof CRITICAL_KEYS[number];
   
   export const TRACKED_SUB_KEYS = ['semanticLaneState', ...] as const;
   export type TrackedSubKey = typeof TRACKED_SUB_KEYS[number];
   
   const CRITICAL_KEYS_SET = new Set<string>(CRITICAL_KEYS);
   const TRACKED_SUB_KEYS_SET = new Set<string>(TRACKED_SUB_KEYS);
   ```
3. **The function** (typed):
   ```ts
   export function withStateMutation(fn: () => void): void {
       if (!_isMutating) {
           // same body as JS, but with typed key checks
       }
   }
   ```
4. **Re-export any internal state needed** (e.g., `_isMutating` if it's a module-level flag — this is a wrinkle; check the original code)

### Update `js/state.js:432-461`

Replace the function and key sets with a re-export shim:
```js
// Re-export from the TypeScript module for backwards compat.
export { withStateMutation, CRITICAL_KEYS, TRACKED_SUB_KEYS } from '../src/lib/state/with-state-mutation.ts';
```

Note: the path `../src/lib/state/with-state-mutation.ts` may need adjustment based on the actual relative path from `js/state.js` to `src/lib/state/`. Verify with `dir` or a build check.

### Update `state-mutators.js` and `state-mutators.ts` (if they exist)

These already import `withStateMutation` from `../state.js`. After the re-export shim, they should still work without changes. Verify by reading both files.

### Verify

1. `npm run typecheck` should pass (or at least not regress)
2. `npm run check:shell` should pass
3. The proxy set trap at `state.js:530-531` should still work — the keys are now typed but the runtime behavior is identical

## Time Budget
- 5 min read source
- 15 min create new TS module
- 5 min update shim
- 5 min verify (typecheck + smoke)
- 30 min total

## Output
Save to `tmp/mimo-with-state-mutation-ts-report.md`:

```markdown
# withStateMutation TS Extraction Report

## Summary
- New file: `src/lib/state/with-state-mutation.ts` (N lines)
- Modified: `js/state.js` (line range, M lines changed)
- Typecheck: PASS/FAIL
- Smoke: PASS/FAIL

## File contents
<show key snippets of the new TS module>

## Shim path
<path used in js/state.js re-export, verified>

## Verification
- [ ] typecheck pass
- [ ] check:shell pass
- [ ] state-mutators.js still works
- [ ] state-mutators.ts (if exists) still works

## Surprises / blockers
<list any>
```

## Constraints
- **Smallest change.** Don't refactor the function body.
- **No edits to other state writers** (`semantic-threads.js`, `filter-state.js`, etc.) — they keep using the JS shim.
- **No false claims.** Verify typecheck and smoke.

## Return
≤100 words: file created, lines changed, verification results, any blockers.
