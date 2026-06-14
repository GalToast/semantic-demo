# Wave 10 — Side-effect-import audit (2026-06-14)

**Status:** Closed. Master is green.
**Triggered by:** `f230a3b fix(engine-bridge): drop 2 INEFFECTIVE_DYNAMIC_IMPORT warnings (Wave 10A)` deleted `js/modules/semantic-guide-ui.ts` but left a stale `import './semantic-guide-ui.js';` in `js/modules/ui-renderers.ts:14`. The worker's verification claim ("0 errors, 130/130 tests pass") was wrong: 1 svelte-check error, 2 unit-test failures. Fixed in `4ced377 fix(ui-renderers): drop dangling side-effect import after Wave 10A file retirement`.

---

## What this audit checks

A **side-effect import** is the pattern

```ts
import './X.js';
```

— an import with no symbol binding, whose only purpose is to trigger top-level statements in `X.js` (or its `.ts` fallback) at module load time. These are invisible to consumer-surface BFS that walks by `from 'X'` symbol import, because the `from` keyword is absent.

For each side-effect import in the legacy tree, verify:

1. The `.js` shim file exists, **or** a `.ts` file with the same basename exists (Vite resolves `.js → .ts` fallback)
2. If only the `.ts` fallback is available, the import is **fragile** — the next retirement of that `.ts` will break it
3. The legacy module that contains the side-effect import is itself reachable from a real entry point, so the side-effect actually runs

## The full inventory at HEAD (`4ced377`)

| # | File | Line | Import | Target file | Status |
|---|---|---|---|---|---|
| 1 | `js/modules/ui-renderers.ts` | 13 | `import './weather-ui.js';` | `js/modules/weather-ui.ts` ✓ | **Keep.** Real side effect: top-level `weatherStateStore.subscribe(...)` and `compositionStore.subscribe(...)` auto-wire the weather UI to state. `ui-renderers.ts` is reachable via `data-loader.ts`, `event-bindings.ts`, `journey.ts`, `journey-selected-card.ts`, `search-results-ui.ts`. |
| 2 | `js/modules/app.ts` | 11 | `import './tooltip.js';` | `js/modules/tooltip.ts` ✓ | **Keep.** Reachable via `build:legacy` entry. Tooltip side effects (hover listeners) load on app boot. |
| 3 | `js/modules/app.ts` | 33 | `import './pathfinding.js';` | `js/modules/pathfinding.ts` ✓ | **Keep.** Same as #2; `build:legacy` lane only. |

## What was removed

| File | Line | Import | Reason |
|---|---|---|---|
| `js/modules/ui-renderers.ts` | 14 (was) | `import './semantic-guide-ui.js';` | `f230a3b` deleted `js/modules/semantic-guide-ui.ts`; no `.js` shim was ever created, so the import was always resolving via Vite `.js → .ts` fallback. With the `.ts` gone, the import is definitively broken. Replaced with a 3-line comment explaining the Svelte track owns the equivalent wiring via `view-controller.ts` + body data-attribute bridge. |

## Detection patterns

Future Wave 10+ retirements should run this **before** deleting any legacy `.ts` file:

```bash
# Find all side-effect-only imports in the legacy tree
rg "^import ['\"]\.{1,2}/[^'\"]*['\"];?\s*$" js/modules/

# For each, verify the .js resolution target is alive
# (either as a real .js shim, or as a .ts via Vite fallback)
for imp in <basename>; do
  test -f "js/modules/${imp}.js" && echo "$imp: shim OK" && continue
  test -f "js/modules/${imp}.ts" && echo "$imp: .ts fallback OK (fragile)" && continue
  echo "$imp: BROKEN — will fail svelte-check + tests"
done
```

Add the pattern to the audit-CI sweep, or as a Wave-10 pre-retirement check.

## Why this audit pattern is durable

The 4-signal rule from `AGENTS.md` "JS/TS Coexistence" is a **lower bound** on liveness — it answers "might this file be live?" not "is this file live?". Side-effect imports sit **between** the two questions:

- The 4-signal rule says nothing about side-effect imports because they don't bind a symbol
- The static-import BFS says nothing because there's no `from` keyword
- The only audit is the regex above, plus checking that the resolution target still exists

The worker's `f230a3b` slipped on this because the verification command (`npm run test:unit`) was a sample, not an exhaustive check. svelte-check is a separate gate that catches this exact edge case. **Both gates are needed; neither is sufficient on its own.**

## Related

- Memory entry (insight, Wave 10 edge case) — durable lesson on side-effect imports
- Commit `4ced377` — the fix
- Commit `f230a3b` — the broken commit (will be referenced by future regression tests)
