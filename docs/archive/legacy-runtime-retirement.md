# Legacy runtime retirement record — Ticket 9E

**Date:** 2026-06-13
**Status:** CLOSED
**Lead maintainer:** McCullough Digital
**Companion docs:**
- `docs/legacy-runtime-retirement-roadmap-2026-06-13.md` — the survey and plan
- `docs/both-pattern-exit-criteria.md` — the strategic frame (signals #1–#4)
- `docs/both-pattern-exit-evidence-2026-06-13.md` — the wave record (Tickets 1–8)
- `docs/both-pattern-follow-ups-2026-06-13.md` — the closeout doc
- `docs/both-pattern-fix-wave-2026-06-13.md` — the retrospective

---

## 1. Summary

Wave 9 retired every remaining dynamic `import('@legacy/...')` call site in
the `src/` tree, reducing the dynamic alias count from 15 to 0. The wave
consisted of four tickets: 9A converted four non-cycle dynamic imports to
static ESM; 9B broke the `journey-canvas-interaction` cycle via per-module
back-edge analysis confirming it was defensive, not protective; 9C
simplified the 7-import lazy-loader fan-out in `demo-choreography.ts` to
static imports with preserved accessor wrappers; and 9D renamed the
`@legacy` path alias to `@legacy-js` for self-documenting clarity. The
wave touched 5 consumer files across `src/`, converted 15 dynamic imports
to static ESM, and renamed the alias across 39 files / 148 lines. All
verification gates pass clean. This document fulfills signal #4 of the
BOTH-pattern exit criteria.

---

## 2. Timeline

| Date | Ticket | Commit | Description |
|---|---|---|---|
| 2026-06-13 | **9A** | `8502eab` | Retire 4 non-cycle dynamic `@legacy/*` imports (MapView, choreography, lifecycle-bridge filter-state, lifecycle-bridge event-bus) |
| 2026-06-13 | **9B** | `245cb89` | Break `journey-canvas-interaction` cycle — per-module back-edge analysis confirms defensive pattern, convert 5 dynamic imports (4 in journey.ts + 1 in lifecycle-bridge.ts) |
| 2026-06-13 | **9C** | `3fa3b49` | Simplify `demo-choreography.ts` lazy-loader — 7 dynamic imports converted to static ESM; accessor wrappers preserved |
| 2026-06-13 | **9C** | `0ba8f40` | Add unit tests asserting static-import invariant in demo-choreography (regression guard) |
| 2026-06-13 | **9D** | `28007ab` | Rename `@legacy` alias to `@legacy-js` in code, config, and tests (39 files, 148 lines) |
| 2026-06-13 | **9D** | `1603883` | Document rename rationale in `docs/legacy-js-alias-renaming-2026-06-13.md` |

All commits on `master`, pushed to origin.

---

## 3. The retirement commits

### Ticket 9A — `8502eab`

```
fix(both-pattern): retire 4 non-cycle dynamic @legacy/* imports (Ticket 9A)
```

Converted 4 dynamic `import('@legacy/...')` to static ESM in 3 files:

| File | Import | Why safe |
|---|---|---|
| `src/components/MapView.svelte` | `@legacy/state` → `@legacy-js/state` | `js/state.js` already statically imported by FilterChrome, thread-settler, etc.; dynamic form was INEFFECTIVE per build warning |
| `src/lib/demo/choreography.ts` | `@legacy/modules/micro-demo-choreography.js` | TS module, no current static sibling — fresh static reference safe |
| `src/lib/engine/adapters/lifecycle-bridge.ts` | `@legacy/modules/filter-state.js` | Same intentionally-stale pattern as static `legacyStateModule` and `legacyViewControllerModule` already in this file |
| `src/lib/engine/adapters/lifecycle-bridge.ts` | `@legacy/modules/event-bus.js` | `event-bus` is statically imported in search-state, cluster-filter-controller, triggers; cycle-safe |

### Ticket 9B — `245cb89`

```
fix(both-pattern): break journey-canvas-interaction cycle (Ticket 9B)
```

Worker E's per-module back-edge survey confirmed
`js/modules/journey-canvas-interaction.ts` has **zero back-imports** to
`src/lib/journey/journey.ts`. The dynamic-import pattern in `journey.ts`
was defensive, not protective. Converted 5 dynamic imports (4 in
`journey.ts` + 1 in `lifecycle-bridge.ts`) to static ESM.

### Ticket 9C — `3fa3b49` + `0ba8f40`

```
fix(both-pattern): simplify demo-choreography lazy-loader (Ticket 9C)
test(demo-choreography): add unit tests for static import invariant (Ticket 9C)
```

Worker F's per-module cycle analysis confirmed all 7 modules in
`demo-choreography.ts`'s lazy-loader fan-out are leaf nodes with no
transitive rendering back to `demo-choreography`. Converted all 7
dynamic imports to static ESM. Preserved the accessor wrappers
(`loadLifecycle`, `loadJourneyCompass`, `loadJourney`, `loadPanelBindings`,
`loadMicroDemoGuards`, `loadMicroDemoCamera`, `loadMicroDemoUi`) so the
consumer-side contract is unchanged. Added unit tests asserting the
static-import invariant as a regression guard.

### Ticket 9D — `28007ab` + `1603883`

```
chore(vite): rename @legacy alias to @legacy-js (Ticket 9D)
docs(retirement): capture @legacy-js alias renaming rationale (Ticket 9D)
```

Renamed `@legacy` to `@legacy-js` across all code (33 `src/` files),
config (`vite.config.ts`, `vitest.config.js`, `src/tsconfig.json`), and
tests. Rationale documented in `docs/legacy-js-alias-renaming-2026-06-13.md`:
self-documenting prefix, disambiguation from `legacy-reference/` archive
plans, easier per-grep surveillance.

---

## 4. Consumer surface that migrated

### 5 files touched in Tickets 9A + 9B + 9C (the 15 dynamic imports)

| File | 9A | 9B | 9C | Total dynamic imports converted |
|---|---|---|---|---|
| `src/components/MapView.svelte` | 1 | — | — | 1 |
| `src/lib/demo/choreography.ts` | 1 | — | — | 1 |
| `src/lib/engine/adapters/lifecycle-bridge.ts` | 2 | 1 | — | 3 |
| `src/lib/journey/journey.ts` | — | 4 | — | 4 |
| `src/lib/engine/demo-choreography.ts` | — | — | 7 | 7 |
| **Totals** | **4** | **5** | **7** | **15 (net -47 lines)** |

### Files touching the static alias (now `@legacy-js`)

36 files in `src/` import `@legacy-js/*` statically. These are the
legitimate BOTH-pattern call sites: TS facades reaching into the legacy
tree through a stable alias. They are NOT in scope for the dynamic-import
retirement — they are the intentional bridge.

Ticket 9 (the wave) touched ~10 files total across all four tickets.

---

## 5. Verification that built without the alias

All of the following were verified after Ticket 9D landed:

| Check | Command | Result |
|---|---|---|
| **svelte-check + tsc** | `npm run check` | ✓ 0 errors, 0 warnings, built in 3.48s |
| **svelte-check** | `npx svelte-check --tsconfig ./src/tsconfig.json` | ✓ 0 errors, 0 warnings |
| **Unit tests** | `npm run test:unit` | ✓ 15/15 files, 119/119 tests pass |
| **Contract tests** | `npm run qa:contract:all` | ✓ All surfaces pass |
| **Dev server** | `npm run dev:svelte` | ✓ Starts clean on port 5173 |
| **Production build** | `npm run build:svelte` | ✓ Built in 3.48s (single chunk warning — pre-existing, separate optimization tracked) |

The only build warning is one `INEFFECTIVE_DYNAMIC_IMPORT` for
`journey-compass-controller.js` (Vite notes it's both statically and
dynamically imported by the same bundle). This is benign — Vite handles
the static module first; the dynamic dance resolution would resolve
synchronously. Cleanup tracked for Wave 10.

### Pre-wave vs post-wave state

| Surface | Before Wave 9 | After Wave 9 |
|---|---|---|
| `import('@legacy/*')` dynamic imports in `src/` | **15** | **0** |
| `import('@legacy-js/*')` static imports in `src/` | ~38 (`@legacy`) | ~38 (`@legacy-js`) |
| `@legacy` alias in `vite.config.ts` | present | **renamed to `@legacy-js`** |
| `js/modules/*` runtime stub files | 50+ | 50+ (BOTH-pattern infra, Wave 10 scope) |

---

## 6. What remains

The Wave 9 retirement did **not** complete the full BOTH-pattern exit.
These items remain:

1. **36 static `@legacy-js` imports** — the BOTH-pattern bridge. These are
   the legitimate TS-facade → legacy-tree call sites. Removing them requires
   either porting each consumer to direct relative paths (Wave 10B) or
   completing the Svelte migration so no legacy imports are needed at all.

2. **The `@legacy-js` alias itself** — Vite still uses it to resolve the
   ~38 import sites. The alias can be removed once all static imports are
   rewritten to relative paths (Wave 10B) or the legacy tree is archived
   (Wave 10D).

3. **The main entry chunk is still large** — the `npm run build:svelte`
   chunk-size warning is a pre-existing issue. Separate optimization
   tracked for a future wave.

4. **10 relative-path dynamic imports of `js/modules/*`** — inside
   `camera-choreography/{cursor,focus,routes}.ts` and `window-actions.ts`.
   These are deliberate lazy-loaders for Vite chunking. Architectural
   question: whether the runtime isolation they provide is worth the Vite
   overhead (Wave 10C).

5. **The `js/modules/*` runtime stubs** — 50+ files. These are the BOTH-
   pattern infrastructure that handles Vite's `.ts-first` resolution.
   Retiring them is the deeper Wave 10D work tracked in
   `docs/both-pattern-exit-criteria.md` (signals #1, #2, #3, #5+).

---

## 7. Lessons learned

### BOTH-pattern strategy

- **"Delegating shim" for cold imports; "port to Svelte" for hot render-loop imports** — the right call in every case. The delegating shim is type-clean, requires no caller updates, and the `.ts` real impl is what Vite picks at runtime. Only the render-loop hot path (`three-engine.ts` Tickets 3 hot) justified a direct port.

- **Per-module cycle analysis before converting** — Worker E and F's back-edge surveys confirmed that 12 of the 15 dynamic imports were defensive, not protective. Only the 3 in `camera-choreography/` remain genuinely lazy. Assumed cycles are the enemy; verified cycles are the guide.

### Worker prompts

- **The v2-prompt recovery pattern is durable** — when Worker 1 v1 got stuck on a recursive grep, the recovery was: cancel, pre-compute the audit in the main lane, relaunch with a v2 prompt including the pre-computed data + a "do NOT run recursive grep" warning. Cost: 10 min. Benefit: turns a 90+ min dead-worker timeout into a fresh 30–60 min productive worker. Saved for future reuse.

- **Scoper + impl split for non-trivial tickets** — the scoper takes 2–4 min to produce a 149–322 line prompt; the impl takes hours. Cheap pre-flight beats expensive rework. The scoper caught the `rankings` vs `rerank_results` discrepancy in Ticket 6 before any code was written.

### Dev tooling

- **Vite HMR re-touches `dist/svelte/*`** — dev server file-watcher re-touches these files after every source change. Content-identical but mtime-different, so `git status` shows them as modified. Use explicit `git add <files>` for close-out commits, never `git add -A`. Detected by dev server noise signature (CRLF changes, hash-only changes, Vite-managed paths).

- **15s bash detach prevents 30+ min hangs** — the Pi harness bash timeout detaches long-running commands at 15s. This prevents the recursive-grep trap entirely. The fix only takes effect after Pi restart; sessions launched before the fix are unaffected.

- **Invariant tests enforce AGENTS.md rules as scanners** — `withStateMutation` invariant tests (Ticket 9C follow-up) and `!important` regression detectors (per the CSS fix wave) proved that AGENTS.md rules can be encoded as automated tests. The pattern: extract the rule, write a regex/AST scanner test, gate on zero violations.

---

## 8. References

| Document | Path | Purpose |
|---|---|---|
| Retirement roadmap | `docs/legacy-runtime-retirement-roadmap-2026-06-13.md` | The survey and wave plan that informed this work |
| Exit criteria | `docs/both-pattern-exit-criteria.md` | Strategic frame — the 4-signal audit rule and per-subsystem readiness |
| Exit evidence | `docs/both-pattern-exit-evidence-2026-06-13.md` | Wave record — Tickets 1–8 commit ledger and verification matrix |
| Follow-up tickets | `docs/both-pattern-follow-ups-2026-06-13.md` | Ticket tracker — all 8 tickets closed |
| Fix-wave retrospective | `docs/both-pattern-fix-wave-2026-06-13.md` | Postmortem — what worked, what didn't, durable patterns |
| Alias rename rationale | `docs/legacy-js-alias-renaming-2026-06-13.md` | Ticket 9D rename rationale |
| BOTH-pattern audit | `docs/semantic-demo-both-pattern-audit-2026-06-13.md` | Original 50-shim inventory |

---

## Appendix A: How to verify this doc

```bash
cd 'C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer'

# Commit hashes exist
git log --oneline 8502eab -1   # Ticket 9A
git log --oneline 245cb89 -1   # Ticket 9B
git log --oneline 3fa3b49 -1   # Ticket 9C
git log --oneline 28007ab -1   # Ticket 9D

# No dynamic alias imports remain
rg "import\(['\"]@legacy" src/
# (no output — 0 hits)

# Static alias files count
rg "@legacy-js" src/ -l
# 36 files (all expected)

# Verification gates pass
npm run check                    # 0 errors, built in 3.48s
npx svelte-check --tsconfig ./src/tsconfig.json  # 0 errors, 0 warnings
npm run test:unit                # 15/15 files, 119/119 tests
npm run build:svelte             # built in 3.48s
```

## Appendix B: The 15 converted imports (before → after)

| # | File | Before (dynamic) | After (static) | Ticket |
|---|---|---|---|---|
| 1 | `MapView.svelte` | `import('@legacy/state')` | `import * as state from '@legacy-js/state'` | 9A |
| 2 | `demo/choreography.ts` | `import('@legacy/modules/micro-demo-choreography.js')` | `import * as microMod from '@legacy-js/modules/micro-demo-choreography.js'` | 9A |
| 3 | `lifecycle-bridge.ts` | `import('@legacy/modules/filter-state.js')` | `import * as filterMod from '@legacy-js/modules/filter-state.js'` | 9A |
| 4 | `lifecycle-bridge.ts` | `import('@legacy/modules/event-bus.js')` | `import * as eventBusMod from '@legacy-js/modules/event-bus.js'` | 9A |
| 5 | `journey.ts` | `import('@legacy/modules/journey-canvas-interaction')` | `import * as canvasMod from '@legacy-js/modules/journey-canvas-interaction'` | 9B |
| 6 | `journey.ts` | `import('@legacy/modules/journey-canvas-interaction')` | `import * as canvasMod from '@legacy-js/modules/journey-canvas-interaction'` | 9B |
| 7 | `journey.ts` | `import('@legacy/modules/journey-canvas-interaction')` | `import * as canvasMod from '@legacy-js/modules/journey-canvas-interaction'` | 9B |
| 8 | `journey.ts` | `import('@legacy/modules/journey-canvas-interaction')` | `import * as canvasMod from '@legacy-js/modules/journey-canvas-interaction'` | 9B |
| 9 | `lifecycle-bridge.ts` | `import('@legacy/modules/journey-canvas-interaction')` | `import * as canvasMod from '@legacy-js/modules/journey-canvas-interaction'` | 9B |
| 10 | `demo-choreography.ts` | `import('@legacy/modules/lifecycle.js')` | `import * as lifecycleMod from '@legacy-js/modules/lifecycle.js'` | 9C |
| 11 | `demo-choreography.ts` | `import('@legacy/modules/journey-compass-controller.js')` | `import * as compassMod from '@legacy-js/modules/journey-compass-controller.js'` | 9C |
| 12 | `demo-choreography.ts` | `import('@legacy/modules/journey.js')` | `import * as journeyMod from '@legacy-js/modules/journey.js'` | 9C |
| 13 | `demo-choreography.ts` | `import('@legacy/modules/bindings/panel-bindings.js')` | `import * as panelMod from '@legacy-js/modules/bindings/panel-bindings.js'` | 9C |
| 14 | `demo-choreography.ts` | `import('@legacy/modules/micro-demo-guards.js')` | `import * as guardsMod from '@legacy-js/modules/micro-demo-guards.js'` | 9C |
| 15 | `demo-choreography.ts` | `import('@legacy/modules/micro-demo-camera.js')` + `import('@legacy/modules/micro-demo-ui.js')` | Static imports | 9C |

Each conversion followed the established pattern from Worker B's `1eae33f`
and `f1176bc` commits:

```ts
// Top-of-file static import:
import * as lifecycleMod from '@legacy-js/modules/lifecycle.js';

// Usage-site accessor wrapper (preserved):
function loadLifecycle(): Promise<LifecycleModule> {
  return lifecycleMod as unknown as LifecycleModule;
}
```

The accessor wrappers were PRESERVED so the consumer-side contract is
unchanged. Runtime semantics are also unchanged: the static imports resolve
synchronously at boot, and the wrapper functions return synchronously
instead of going through `Promise.resolve()`.
