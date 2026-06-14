# Svelte-Bridge Import Contract

**Status:** Active. Established 2026-06-14.
**Ticket:** S7 (Svelte-bridge import contract)
**Verified by:** `tests/unit-active/svelte-bridge-import-contract.test.ts`

## Why this contract exists

After Wave 10 retirement (`7fc7b9d`), the engine kernel architecture is:

| Layer | Path | Role |
|---|---|---|
| Svelte UI | `src/components/*`, `src/lib/components/*` | Reactive UI shell |
| Svelte bridge | `src/lib/engine/*` | Imperative wrapper around the engine kernel |
| Engine kernel | `js/modules/*`, `js/state.ts`, `js/state/*` | Three.js + imperative state |
| Archived shadows | `legacy-reference/js-both-shadows-2026-06-13/*` | Reference only |

The bridge (`src/lib/engine/*`) is the **only** sanctioned import path between the
Svelte UI and the engine kernel. Direct imports from `src/lib/<other>/*` into
`js/` bypass the bridge and create circular coupling that breaks the engine
port (Wave 11+).

## The rule

**`src/lib/<NOT engine>/*` MUST NOT import from `js/`.**

The only exception is `src/lib/engine/*`, which IS the bridge. All other
directories in `src/lib/` (orchestration, journey, ui, demo, focus, state,
semantic-threads, etc.) must call into the engine via `@lib/engine/*`
re-exports or via Svelte stores / events.

### Why this matters

1. **Engine port path:** Wave 11+ is migrating the engine kernel to Svelte 5
   rune-class state. When the port lands, files that import directly from
   `js/` will silently break or pin to the wrong state shape.

2. **Test stability:** Direct imports couple test setup to the legacy state
   shape. Bridge imports go through a stable wrapper contract that tests
   can mock at one seam.

3. **Bundle clarity:** 1.5 MB main bundle (2026-06-14) gets worse with each
   direct import that drags the engine kernel into a Svelte component. The
   bridge pre-aggregates the engine surface.

4. **Lint invariant:** A worker adding a new direct import is a regression.
   The invariant test fails the build on that.

## Inventory of direct imports (as of 2026-06-14)

27 src/ files import from `js/` outside the bridge. Total: **63 anti-pattern
import paths**. Of these, 60 are in `src/lib/<other>/*` and 3 are in
`src/components/*`. Migration is not required immediately (the engine port
is a multi-week arc), but new code MUST NOT add to this list. The invariant
test fails the build on any new anti-pattern.

### Legitimate bridge (11 files, in `src/lib/engine/*`)

```
src/lib/engine/demo-choreography.ts
src/lib/engine/camera-controls.ts
src/lib/engine/map-state.ts
src/lib/engine/node-manager.ts
src/lib/engine/camera-choreography/cursor.ts
src/lib/engine/camera-choreography/routes.ts
src/lib/engine/camera-choreography/focus.ts
src/lib/engine/adapters/lifecycle-bridge.ts
src/lib/engine/scene-reveal.ts
src/lib/engine/three-postprocessing.ts
src/lib/engine/three-engine.ts
```

These wrap engine functions for Svelte consumption. ALLOWED.

### Anti-pattern direct imports (27 files, 63 import paths)

Files in `src/lib/<other>/*` and `src/components/*` that import from `js/`
directly (bypassing the bridge). The full list is in the invariant test's
console output — it's regenerated on every run.

Top offenders by import count:
- `src/lib/journey/journey.ts` — 16 imports
- `src/lib/orchestration/window-actions.ts` — 6 imports
- `src/lib/journey/semantic-guide.ts` — 5 imports
- `src/lib/journey/focus-pocket.ts` — 4 imports
- `src/lib/journey/semantic-dive.ts` — 4 imports
- `src/lib/ui/ui-feedback.ts` — 3 imports
- 22 other files with 1-2 imports each

**63 anti-pattern import paths total.** Migration is not required
immediately (the engine port is a multi-week arc), but new code MUST NOT
add to this list. The invariant test fails the build on any new
anti-pattern. Existing entries have a one-time pass to consolidate,
documented in `docs/wave-11-ux-audit-closure-2026-06-14.md`.

## How to fix an anti-pattern import

For a file in `src/lib/<other>/*` that imports from `js/`:

1. **Identify the consumed symbol** — what function / value / type?
2. **Find or create the bridge** — usually `src/lib/engine/<thing>.ts` already
   wraps it. If not, create a thin re-export there.
3. **Rewrite the import** to `@lib/engine/<thing>` (preferred) or to a Svelte
   store / event.
4. **Run the test suite** — the bridge import contract test should still pass
   and the consuming code should behave identically.

## Workers: how to honor this contract

Before adding a new `import ... from '..../js/...'` to a file outside
`src/lib/engine/*`:

1. Run `rg "from ['\"](\.\./)+js/" src/lib/<your-dir>/ -l` to see existing
   anti-patterns (if any).
2. Decide: is the bridge missing? If yes, **add to the bridge first**, then
   import from the bridge.
3. If the bridge is intentionally unavailable (e.g. test fixture, build
   script), document the exception in the file header AND in this doc.
4. The invariant test will fail otherwise.

## Out of scope

- `js/` itself (the engine kernel) is allowed to import freely within `js/`.
- `legacy-reference/js-both-shadows-2026-06-13/*` is archived reference, not
  in the active graph; not subject to this contract.
- `tests/` is not subject to this contract — tests can import fixtures.

## See also

- `docs/wave-10-legacy-audit-2026-06-13.md` — the audit that established
  the engine-kernel architecture
- `docs/wave-10-legacy-retirement.md` — the Wave 10 retirement record
- `docs/wave-11-ux-audit-closure-2026-06-14.md` — Wave 11 port plan and
  bridge consolidation roadmap
- `AGENTS.md` "Engine Kernel Architecture" section — the W5 doc
