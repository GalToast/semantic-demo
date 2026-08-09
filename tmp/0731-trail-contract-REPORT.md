# 0731 — Trail-Review Overlay Focus Contract → Runnable Vitest Suite

Date: 2026-08-08
Scope: `tests/trail-review-focus-contract.mjs` → `tests/unit-active/trail-review-overlay-contract.test.ts`

## Problem

`tests/trail-review-focus-contract.mjs` was an unrunnable contract test:

1. **Not picked up by vitest** — the include pattern is `tests/unit-active/**/*.{test,spec}.{js,mjs,ts}` (`vitest.config.js`); the .mjs sat at `tests/` root, so its assertions never executed under `npm run test:unit`.
2. **Raw `node` run crashed at the behavioral half** — the 5 static source-inspection tests passed, but the runtime import of `src/lib/stores/lifecycle.ts` threw `ERR_MODULE_NOT_FOUND` for `navigation.svelte` (Node cannot resolve Vite's `.svelte.ts` extension aliases; the file is `navigation.svelte.ts`).
3. **Silent false-green** — the script exited `0` despite the crash (the `process.exit(1)` was only reached on static-assert failure, never on the import throw). R1–R5 (the behavioral contract) never ran.

Verified by executing `node tests/trail-review-focus-contract.mjs` (crash at import, exit 0).

## What was deleted / reused

- **Deleted**: `tests/trail-review-focus-contract.mjs` (`git rm`, same commit). Fully superseded: its 5 static source-inspection assertions (module-level var null-init, `document.activeElement` capture, `.focus()` restore + null-out, `aria-hidden` toggles, `.trail-review-close` query + focus, `.visible` class + `hidden` flag) are implementation-detail checks whose intent is now covered by real behavioral DOM assertions in the new suite.
- **Reused**: the contract itself. Every assertion in the .mjs maps to a test in the new suite (see coverage map below). The .mjs's hand-rolled DOM shim was NOT ported — jsdom provides a real DOM with the same primitives (getElementById/createElement/querySelector/classList/append/insertBefore/focus), which is the established pattern in `tests/unit-active/focus-trap-stack.test.ts`.

## Mocking approach (copied, not invented)

Followed the sibling-store-test patterns exactly:

- **`vi.hoisted()` refs + `vi.mock()` for lifecycle.ts's import graph** — same mock keys as `a3-2-empty-state-renders.test.ts` (which also imports `@lib/stores/lifecycle`) and `search-dispatch.test.ts`:
  - `@lib/stores/navigation.svelte.ts` (navStore, updateNavState, writeNavStateMirror, switchView, currentView, setMyceliumMode)
  - `@lib/state/app.svelte.ts` (legacyState with the exact sub-shapes `applyCompositionState` writes: focusedNode, focusState, navState)
  - `@lib/stores/focus.svelte`, `@lib/stores/search.svelte`, `@lib/stores/journey.svelte`
  - `@lib/orchestration/event-bus` (publish + EVENTS), `@lib/journey/point-color`,
    `@lib/utils/focus-trap-bindings` (registerOpenDialog / unregisterOpenDialog spied), `@lib/orchestration/parity-attrs.svelte.ts`
- **Stores are hand-rolled subscribe/set/update objects** (search-dispatch pattern) so both `svelte/store.get()` (used by `applyCompositionState` on hide) and `searchStore.update(...)` work without loading the real Svelte 5 snapshot machinery.
- **DOM is real jsdom** (focus-trap-stack pattern): the overlay is built as a real element on `document.body`; `document.addEventListener`/`removeEventListener` are `vi.spyOn`'d to assert the one-time Escape wiring. No fragile hand-rolled fakes.
- **afterEach hygiene**: close the overlay if a test left it open (removes the module-level `_trailReviewEscHandler` so tests don't contaminate each other), remove DOM fixtures, `vi.restoreAllMocks()`.

## Coverage map (old assertion → new test)

| .mjs assertion | New test |
|---|---|
| Static: `_trailReviewPreviouslyFocused` null-init + activeElement capture | `hide() removes aria-modal + unregisters + restores focus` (behavioral: focus returns to pre-show element) |
| Static: `.focus()` restore + null-out | same test + double-hide idempotency (old R4) |
| Static: `aria-hidden` 'false'/'true' toggles | `show() also mirrors the legacy .mjs visibility contract` |
| Static: `.trail-review-close` query + focus on open | `show() injects a close button with aria-label… and focuses it` |
| Static: `.visible` class + `hidden` flag | `show() also mirrors the legacy .mjs visibility contract` |
| R1: aria-hidden=false, hidden=false, visible class | same |
| R2: close button receives focus | same (via `document.activeElement`) |
| R3: aria-hidden=true, hidden=true, no visible | same |
| R4: double-hide idempotent | `hide() removes aria-modal + unregisters + restores focus` |
| R5: captures `document.activeElement` (no throw) | same (focus restore assertion makes it observable) |

New coverage beyond the .mjs (the task's contract):
- (a) `.trail-review-content` injected with `h2#trail-review-title` "Walk review" + `.trail-review-guidance` paragraph; `aria-labelledby="trail-review-title"`
- (b) `aria-modal="true"` + `registerOpenDialog('trail-review-overlay')`
- (c) close button `aria-label="Close trail review"`, `type="button"`
- (d) Escape keydown → hide (aria-modal removed, dialog unregistered, focus restored, listener removed)
- (e) hide() removes aria-modal + unregisters + restores focus
- (f) repeated show() registers the Escape keydown listener exactly once and injects content idempotently

## Pass evidence

```
$ npx vitest run tests/unit-active/trail-review-overlay-contract.test.ts
 Test Files  1 passed (1)
      Tests  7 passed (7)          # 2.28s

$ npx svelte-check --workspace src --tsconfig tsconfig.json
svelte-check found 0 errors and 0 warnings

$ npx vitest run tests/unit-active/focus-trap-stack.test.ts
 Test Files  1 passed (1)
      Tests  9 passed (9)          # regression gate
```

## Notes

- The `.mjs` was deleted in the same commit — it was a silent false-green (crashed at runtime import, exited 0, never picked up by vitest). Nothing of its assertion surface was lost; all of it is now behavioral.
- The overlay contract now actually executes under `npm run test:unit` (include pattern `tests/unit-active/**`).
