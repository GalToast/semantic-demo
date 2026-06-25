# Typing Contract — Semantic Explorer

**Date:** 2026-06-24
**Scope:** All `src/**/*.ts` and `src/**/*.svelte` files
**Purpose:** Prevent the gradual re-introduction of `as any` casts that signal "I didn't want to figure out the types."

---

## The Rule

Every `as any` must have a comment explaining why it cannot be typed properly. New `as any` casts without a justification comment are treated as unreviewed technical debt — fix on sight.

**Exception categories that are allowed with a comment:**

1. **Engine bridge** — `appState` fields typed as `any` because the engine surface mutates at runtime (three.js objects, WebGL buffers, etc.).
2. **Third-party library** — Library type declarations are wrong or missing; link to the upstream issue.
3. **Svelte 5 rune interop** — Temporary cast during migration from stores to `$state` / `$derived`; must have a ticket reference.
4. **JSON deserialization** — Runtime data from `fetch()` where a schema validator is used (e.g., `zod`) but the validated type still needs a cast.

**Not valid:**

- "The types are annoying" — no.
- "It works" — not a reason.
- "I'll fix it later" without a ticket — no.

---

## Current Budget

| Metric                                       | Value  | Date              |
| -------------------------------------------- | ------ | ----------------- |
| `as any` / `: any` / `any[]` / `<any>` count | **58** | 2026-06-25        |
| Files affected                               | **43** | 2026-06-25        |
| Thread-inspector-webgl budget                | **8**  | contract enforced |

---

## Enforcement

### 1. Global Budget Test (`tests/unit-active/as-any-budget.test.ts`)

- Counts every `as any`, `: any`, `<any>`, `any[]` in `src/`
- Fails if the count increases above the baseline
- Run with `npm run test:unit`

### 2. File-Specific Contract Tests

For files with a documented budget (like `thread-inspector-webgl.ts` with 8), add a dedicated test:

```ts
// tests/unit-active/thread-inspector-webgl-typing-contract.test.ts
it('uses <=8 any occurrences', () => {
    expect(countAnyOccurrences(src)).toBeLessThanOrEqual(8)
})
```

### 3. CI Gate

- `npm run test` blocks merge if the global budget test fails
- No new file-specific contract test can be added without a matching docs update

---

## Hall of Fame (files that got tightened)

| File                         | Before | After | Notes                                                                    |
| ---------------------------- | ------ | ----- | ------------------------------------------------------------------------ |
| `thread-inspector-webgl.ts`  | 35     | 8     | Engine bridge casts kept; Three.js boundary typed                        |
| `three-search-animations.ts` | 16     | 1     | Shader uniform narrowing                                                 |
| `three-engine.ts`            | 23     | 1     | All module-bridge casts replaced with `typeof import(...)` (B-4a series) |
| `focus-pocket.ts`            | 19     | 1     | Cross-file tightening; dead `syncRuntimeState` removed (B-1..B-3c)       |

## Global Budget History

| Date       | Count | Delta | Reason                                                                                                                   |
| ---------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| 2026-06-19 | 575   | —     | Initial baseline (W47-A start)                                                                                           |
| 2026-06-19 | 477   | -98   | W47-A bulk-remove across neighborhood/thread-settler/focus-ui                                                            |
| 2026-06-19 | 470   | -7    | node-manager.ts 5 surgical edits (W47-T1)                                                                                |
| 2026-06-25 | 58    | -412  | W48 mega-session: B-3 (focus-pocket), B-4a (three-engine), W48-T1/T2 owner refactors, bulk `as any` removal in 25+ files |

The 2026-06-25 sync (470 → 58) locks in 5 sessions of type-tightening work that had not been reflected in the budget baseline. Net reduction: **90%** of `as any` occurrences removed since the W47-A start.

---

## How to Fix an `as any`

1. **Check if the upstream type is wrong** — Add a `// @ts-expect-error` with a comment instead of `as any`.
2. **Check if you can narrow** — `as unknown as ConcreteType` is better than `as any` because it forces at least one explicit step.
3. **Check if an interface exists** — `appState as unknown as { inspectedStrandDiagnostics: Diagnostics }` is better than `as any`.
4. **Check if the cast is even needed** — Sometimes `as any` was added because a function return type was wrong, not the caller.

---

## Related Docs

- `docs/performance-budget.md` — performance metrics (separate concern, same "budget" pattern)
- `docs/semantic-demo-state-transition-table.md` — state typing (which eliminates some `as any`)
- `docs/window-global-allowlist.md` — the `window` extension surface that sometimes needs `as any`
