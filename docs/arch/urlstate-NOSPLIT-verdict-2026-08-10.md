# url-state.ts Split-or-Not — Re-Review (2026-08-09)

**Reviewer:** independent architecture pass (k3). Re-examines `tmp/god-files-split-plan.md`
(2026-08-08, verdict NO-SPLIT) after the file grew 1,138 → **1,155 lines** and absorbed
3 more feature commits (filter serialization, nav-surface encode, share record= links).

## Verdict: NOSPLIT — the 2026-08-08 cohesion verdict still holds, with fresh evidence

The file is **one state-restore orchestration unit** with an intrinsic shared protocol.
No new seam has appeared since the prior plan. The pure-helper layer the prior plan
imagined was **already extracted** into `url-params.ts` in an earlier session — what
remains in url-state.ts is the stateful core, and line count alone remains a non-signal.

**One micro-extraction IS warranted** (was recommended-but-not-executed in the prior
plan): move the 3 remaining pure helpers to `url-params.ts`. ~45 lines, zero cycle risk,
real test-graph win. Details below.

---

## 1. Export inventory

### Public exports (8 + 2 interfaces)

| Export | Kind | Direct consumers (src/) | Via `lifecycle.ts` re-export | Purity |
|---|---|---|---|---|
| `applyUrlState` | async restore orchestrator | 2 (`app-init.ts`, `global-bindings.ts`) + tests | — | **stateful** (navStore, appState, search/focus/filter stores, event-bus, dynamic import of `@lib/focus/pocket`) |
| `updateUrlState` | sync serializer + pushState | 11 (Header, CompassRail, MapView, global-shortcuts, triggers, cluster-filter-controller, compass-controller, …) | yes → 16 more files | **stateful** (reads navStore + DOM input, writes window.history, reads getFilterState) |
| `registerUrlStateEventListeners` | lifecycle registrar (4 event subs) | 1 (`main.ts`) | — | **stateful** (event-bus subscribe; module-load auto-invoke side effect) |
| `copyCurrentViewLink` | async clipboard share-link | 1 (`Controls.svelte`) | yes → 16 more files | **stateful** (navStore, appState.points, clipboard, toast) |
| `getRequestedUrlDepth` | pure parse+clamp | **0 src**, 1 test (`camera-url-state-constants-contract.test.ts`) | — | **PURE** (URLSearchParams → number) |
| `clearExplorationFocusSelection` | state reset | via lifecycle only | yes | **stateful** (navStore mirror, setFocusedNode, appState, selected-card) |
| `resetStateBeforeUrlRestore` | state reset | via lifecycle only | yes | **stateful** (clearSearch, focusStore, journeyStore, DOM input) |
| `UrlStateOptions` / `UpdateUrlStateOptions` | option interfaces | 0 external | — | pure types |

### Internal helpers (16, not exported)

| Helper | Purity | Notes |
|---|---|---|
| `URL_STATE_KEYS` | **pure** | const key list |
| `hasRestorableUrlState` | **pure** | used by `applyUrlState` |
| `waitForSearchSettle` | pure-ish | 100ms poll loop, no stores |
| `_isRestoreStale` | stateful | reads `navStore.urlStateRestoreToken` |
| `_activeRestoreController` | stateful | module-level AbortController (in-flight restore killer) |
| `_restoreFiltersFromParams` | stateful | filter store + syncFilterControls + applyFilters |
| `_restoreClusterFilter` | stateful | cluster filter owner |
| `preserveDomForcedFocusSearchSurface` | stateful | navStore mirror + journey phase |
| `_validateAnchorIndex` | stateful | **mutates** navStore, window.history, toast |
| `_restoreFocusStateForAnchor` | stateful | navStore mirror + event publish |
| `_frameCameraOnAnchor` | stateful | engine camera + semantic overlay + point-color, poll/retry |
| `_applyFocusPocketForAnchor` | stateful | dynamic import `@lib/focus/pocket` |
| `_setupDeferredNeighborRefire` | stateful | subscribes `semanticNeighborMap` |
| `_restoreAnchorFromParams` | stateful | compose of the above |
| `_restoreSearchFromParams` | stateful | search store, piggyback lease, mobile sheet, DOM input, error settle |
| `_showToast` | trivial | 1-line wrapper |

**Count: 2 pure-ish exports of 8** (`getRequestedUrlDepth` only; the interfaces are types).
**4 of 16 internal helpers are pure.**

---

## 2. Analyzed seams

### Seam A — pure params/parse layer → **ALREADY EXTRACTED**
`url-params.ts` (34 lines) already holds the pure DOM/URL reads (`getSearchParams`,
`getLocationHref`, `getLocationPathname`, `isDomForcedFocusSearchSurface`). The prior
plan's "params.ts" split target exists. **Remaining pure residue in url-state.ts**:
`getRequestedUrlDepth` (exported, test-only), `hasRestorableUrlState` (internal),
`URL_STATE_KEYS` (internal) — ~45 lines, 4% of file.

### Seam B — event-subscription lifecycle → **separable but not worth it**
`registerUrlStateEventListeners` + module-load auto-invoke + main.ts teardown depends
only on `updateUrlState` + `EVENTS`. Clean boundary (~40 lines). BUT the module-load
auto-registration is a load-order side effect with an explicit "preserve prior
registration timing" contract for importers/tests; moving it risks the exact class of
load-order bugs this file has been hardened against. 3.5% of file, low value.

### Seam C — anchor/focus restore pipeline (~230 lines) → **single-caller, protocol-bound**
`_restoreAnchorFromParams` family (`_validateAnchorIndex`, `_restoreFocusStateForAnchor`,
`_frameCameraOnAnchor`, `_applyFocusPocketForAnchor`, `_setupDeferredNeighborRefire`).
Token + signal already passed explicitly, but every helper reads/writes the same store
set and only `applyUrlState` calls it. Extraction = mechanical move, zero reuse gain.

### Seam D — search restore (~200 lines) → **same story**
`_restoreSearchFromParams` + `waitForSearchSettle`: single caller, shares the restore
token protocol, couples search store + piggyback lease (`startSearch`) + mobile sheet +
DOM input + error settle (`setSearchError`).

### Seam E — reset family → **integral to applyUrlState**
`clearExplorationFocusSelection` + `resetStateBeforeUrlRestore` are invoked first thing
in `applyUrlState` and are re-exported through `lifecycle.ts` — they are de-facto public
API of two modules already.

### The intrinsic cohesion
The file IS one protocol: **`navStore.urlStateRestoreToken`** (bumped per
`applyUrlState`) + **module-local `_activeRestoreController`** (aborts the prior
in-flight restore) + **`_isRestoreStale` checks at every await point**. Every async
restore path (anchor, search, deferred neighbor refire, camera frame) participates.
6 stateful exports share ~20 store/engine imports. Splitting seams C/D forces the
protocol into a shared module or into every call site — the prior plan's "giant shared
context module" failure mode, unchanged.

### Churn check (weighs against splitting)
`git log` — last 3 commits are feature work in this file:
- `68e785bf` 2026-08-09 share record= links (wave-10 fleet)
- `33fa5052` 2026-08-07 filter serialization into URL
- `02b3e464` 2026-08-07 encode+restore nav surface

Actively edited by the parallel fleet right now. A mechanical 700-line move would land
on top of a moving target (dist/ rebuild races, session-lock/switchboard coordination
per AGENTS.md). Behavior is pinned by **12 unit-test files + 6 spec/contract files**
(url-state-mock-harness, race-abort, deferred-refire, bridge-contract, …) — a big move
risks exactly the 30s-e2e-timeout / spurious-error-card regression class those tests
exist to catch, for zero functional gain.

---

## 3. Recommendation (decisive)

### NOSPLIT for the file as a whole — but execute the prior plan's micro-extraction:

**Module map:**
- **`src/lib/orchestration/url-params.ts`** (grows 34 → ~80 lines) — add:
  `getRequestedUrlDepth`, `hasRestorableUrlState`, `URL_STATE_KEYS`.
  All pure, no new imports; `url-state.ts` already imports this module (no cycle).
- **`src/lib/orchestration/url-state.ts`** — import those 3 from `url-params.ts`;
  **re-export `getRequestedUrlDepth`** (`export { getRequestedUrlDepth } from './url-params'`)
  so the contract test keeps working untouched. Optionally update the test to import
  from `url-params` directly.

**Why this is the correct seam:** `camera-url-state-constants-contract.test.ts` currently
imports `url-state` just for one pure function — dragging the full 15-module store
closure (search/focus/filter/event-bus/dynamic-import) into its test graph. Moving the
pure helpers to `url-params.ts` gives tests a store-light import path and makes the
pure/stateful boundary exact: url-params = parse/read, url-state = apply/sync.

**First-commit plan (if executed):**
1. Add 3 helpers to `url-params.ts` (pure copy, no logic change).
2. `url-state.ts`: delete the 3 definitions, import from `url-params`, re-export
   `getRequestedUrlDepth` for back-compat.
3. Run `npx tsc --noEmit` + `npm run test:unit` (url-state suites: mock-harness,
   race-abort, constants-contract, deferred-refire) + `npm run qa:contract`.
4. ~45 lines removed from the big file; zero behavior delta; 1-line commit.

### What would change the NO-SPLIT verdict (measurements, not vibes)
1. **A second entry point consuming the restore pipeline** (session-restore path, a
   second app shell, or a non-URL restore trigger) → extract Seams C+D into
   `url-restore.ts` with a `restoreFromParams(params, token, signal)` entry.
2. **File exceeds ~1,600 lines** with the growth landing in *pure* params/format logic
   that belongs in `url-params.ts` (i.e., the pure/stateful ratio shifts back toward
   50/50). Today it's ~4/96.
3. **≥3 consumers** of the pure helpers that don't need the store closure (today: 1 test).
4. **Restore token moves out of url-state's control** (e.g., a navStore-owned
   controller module) — then Seams C/D extract without protocol-passing friction.
5. **Two consecutive waves adding >200 lines each** without section consolidation, in a
   window where the fleet is NOT actively editing the file (churn quiesces).
