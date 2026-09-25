# Window Global Allowlist

Date: 2026-05-28

This policy turns `window.* =` assignments into an explicit ratchet. It does not
block known legacy globals yet; it prevents new globals from appearing without a
classification and an owner.

The enforcement contract is [tests/window-global-allowlist-contract.mjs](../tests/window-global-allowlist-contract.mjs).

## Categories

| Category | Meaning | Current merge rule |
|---|---|---|
| `live-product` | Runtime bridges still used by app modules, third-party setup, or compatibility paths. | Allowed, but prefer imported adapters for new work. |
| `debug-probe` | DevTools, Playwright, or visual-audit inspection surfaces. | Allowed while tests/tools depend on them; future work should gate them. |
| `migration-debt` | Legacy globals with no desired long-term ownership. | Allowed only because they already exist; do not add more. |

Any unclassified direct assignment, such as `window.someNewBridge = ...`, fails
the contract. Classify it in both the contract and this doc before merging, or
avoid the global entirely.

## `__APP_ACTIONS__` Namespace

Classification: `live-product`.
Introduced: 2026-05-28. Replaces one-off window bridges as the single classified compatibility entry point for app action access.

**Owner:** `js/modules/app.js`

**Purpose:** Consolidates one-off `window.*` action bridges into a single explicitly classified namespace. It is the compatibility owner for Playwright specs, visual-audit helpers, manual DevTools probing, and external callers still crossing the app boundary through `window`. Retired migration-debt bare globals like `window.focusOnNode` and `window.setTrailFromSeed` now route through `window.__APP_ACTIONS__`.

## Micro-Demo Globals

Classification: `live-product`.

**Owner:** `js/modules/micro-demo.js`

**Purpose:** Replaces the retired `window.demoController` namespace. These two globals are the only remaining surface for first-visit demo eligibility and cancellation now that the dedicated controller module is gone.

| Global | Notes |
|---|---|
| `window.isMicroDemoRunning` | Boolean check; replaces `window.demoController.isRunning` for test/dev probes. |
| `window.cancelMicroDemo` | Cancel an in-progress micro-demo with a reason; replaces `window.demoController.cancel`. |

**Namespace contract:**

| Key | Source | Notes |
|---|---|---|
| `search` | `search-state.js` | Search entry point for test specs |
| `clearSearch` | `search-state.js` | Search reset for test specs |
| `switchView` | `view-controller.js` | Classified view handoff for test/dev harnesses that need map/galaxy transitions |
| `focusOnNode` | `camera-controls.js` | Primary focus navigation action |
| `setTrailFromSeed` | `journey.js` | Seeded trail setup for route/focus tests |
| `setTrailDepth` | `lifecycle.js` | Trail depth control |
| `setSemanticDiveMode` | `lifecycle.js` | Dive mode toggle |
| `returnToOverview` | `lifecycle.js` | Overview reset |
| `resetExplorationFocus` | `lifecycle.js` | Exploration state reset |
| `refreshCompositionState` | `lifecycle.js` | Composition refresh |
| `traverseNeighbor` | `journey.js` | Prev/next focus-stage traversal |
| `inspectThreadNeighbor` | `journey.js` | Thread preview/relationship inspector |
| `pinThreadNeighbor` | `journey.js` | Pin a relationship for comparison |
| `unpinThreadInspection` | `journey.js` | Clear pinned relationship state |
| `clearThreadInspection` | `journey.js` | Clear preview/pin/follow inspector state |
| `walkThreadNeighbor` | `journey.js` | Follow a semantic connection to the next focused stop |

Migration: `window.focusOnNode` and `window.setTrailFromSeed` are retired as bare globals. The namespace is the intended target for test/dev harness calls.

## Debug-Probe Globals

Classification: `debug-probe`. These are devtools, Playwright, or visual-audit inspection surfaces.

| Global | Owner | Notes |
|---|---|---|
| `window.__APP_STATE__` | `js/modules/bridge-registry.js` | **Primary app state hook.** Preferred neutral state surface for runtime inspection. |
| `window.withStateMutation` | `js/state.js` | **State mutation gate.** Allows testing/DevTools to bypass the critical keys mutation lock. |
| `window.__TEST_STATE__` | `js/modules/bridge-registry.js` | **Legacy test bridge fallback.** Preserved for existing Playwright tests. Migrate consumers to `__APP_STATE__`. |
| `window.__initTimings` | `js/modules/app.js` | **Init timing diagnostics.** Exposes the boot-phase timing object for DevTools/perf inspection. |
| `window._getSelectedBusinessRoleLabel` | `js/modules/bridge-registry.js` | Compatibility/debug helper for selected-business role labels while older UI/test callers migrate to module/action access. |
| `window._ti` | `js/modules/thread-inspector.js` | **Debug-probe inspection namespace.** 17 thread-inspection functions. Not a product API. |
| `window.__semanticCanvasThreadProbe` | — | Debug probe. **Retired from journey.js shim 2026-05-28.** |
| `window.__semanticFocusCueProbe` | — | Debug probe (exposed via journey-webgl.js). |
| `window.__semanticJourneyProbe` | — | Debug probe. **Retired 2026-05-28.** |
| `window.__semanticThreadInspectorProbe` | — | Debug probe. **Retired from journey.js shim 2026-05-28.** |

## Migration-Debt Globals

Classification: `migration-debt`. These exist but have no desired long-term owner.

| Global | Owner | Notes |
|---|---|---|
| _none_ | — | Migration-debt bare globals are currently retired. |

## `_ti` Debug-Probe Planned Contract

**Owner:** `js/modules/thread-inspector.js`
**Classification:** `debug-probe`
**Current status:** Gate-on/gate-off — `window.__DEBUG_PROBES__` guards the assignment in thread-inspector.js. Source contracts are gate-aware.

`window._ti` is a diagnostic namespace exposing 17 thread-inspection functions from `thread-inspector.js`. It is not a product runtime bridge. The migration plan moves `_ti` from always-on to gate-on while preserving contract assertions.

### Tools currently exposed via `window._ti`

| Function | Consumer |
|---|---|
| `getSemanticThreadCandidates` | `visual-state-audit.mjs` |
| `getGeometricThreadCandidates` | `visual-state-audit.mjs` |
| `getThreadCandidatesForIndex` | `visual-state-audit.mjs` |
| `setStrandContinuityState` | `visual-state-audit.mjs` |
| `clearStrandContinuityState` | `visual-state-audit.mjs` |
| `getStrandArrivalNote` | `visual-state-audit.mjs` |
| `getThreadInspectionState` | `visual-state-audit.mjs` |
| `renderThreadInspection` | `visual-state-audit.mjs` |
| `inspectThreadNeighbor` | `visual-state-audit.mjs` |
| `pinThreadNeighbor` | `visual-state-audit.mjs` |
| `unpinThreadInspection` | `visual-state-audit.mjs` |
| `scheduleCanvasThreadInspectionClear` | `visual-state-audit.mjs` |
| `clearThreadInspection` | `visual-state-audit.mjs` |
| `exploreThreadNeighbor` | `thread-inspector-dewindowing-contract.mjs` (diagnostic assertion) |

### Migration steps

1. ✅ ~~Establish `window.__DEBUG_PROBES__` gate~~ — documented in this doc (step 1 complete).
2. ✅ **Gate `window._ti` assignment** — `if (typeof window.__DEBUG_PROBES__ !== 'undefined' ? window.__DEBUG_PROBES__ : true) { window._ti = { ... }; }` in thread-inspector.js (step 2 complete).
   - Gate-off: `_ti` is not created; no bare window function exports escape thread-inspector.js.
   - Gate-on (default): all 17 thread-inspection functions available for diagnostics.
   - `_ti` uses the same `window.__DEBUG_PROBES__` default-on guard pattern.

3. ✅ **Gate `window._ti` assignment with default-on** — refined guard to `typeof window.__DEBUG_PROBES__ !== 'undefined' ? window.__DEBUG_PROBES__ : true` so gate-on is the default in dev/test environments where __DEBUG_PROBES__ is often unset.
   - Source contracts are gate-aware and pass regardless of whether the gate is on or off.

4. **Verify contract** — run `node tests/thread-inspector-dewindowing-contract.mjs tests/journey-window-surface-contract.mjs tests/journey-thread-inspector-contract.mjs` with gate both on and off; both must pass.

5. **Update `visual-state-audit.mjs`** — update runtime callers (`window._ti?.getThreadCandidatesForIndex`, etc.) to guard on `window.__DEBUG_PROBES__` being enabled before accessing `_ti` functions. When the gate is off, the audit must degrade gracefully (log and skip, not throw).

6. **Migrate consumers** — for each `_ti` consumer in `visual-state-audit.mjs`, evaluate whether the capability is a debug-probe concern or a product concern. If product, migrate to a named module import. If truly debug-only, keep behind the gate.

7. **Remove `_ti`** — only after step 6 proves no product consumers remain and contracts pass in gate-off mode.

### Acceptance checks

| Check | Condition |
|---|---|
| Gate-off clean | `window._ti` is `undefined` with `__DEBUG_PROBES__=false`; no console errors in visual audit |
| Contract gate-on | `thread-inspector-dewindowing-contract.mjs` passes with `__DEBUG_PROBES__=true` |
| Contract gate-off | `thread-inspector-dewindowing-contract.mjs` passes with `__DEBUG_PROBES__=false` |
| No bare window assignments | `thread-inspector.js` makes no `window.fn = ...` assignments outside the `_ti` block |
| Visual audit degrades gracefully | `visual-state-audit.mjs` skips `_ti`-backed paths when gate is off without throwing |

### Out of scope here

- `visual-state-audit.mjs` updates — handled in tests PR
- Contract file updates — handled in tests PR (steps 3-4 complete per this rewrite)

Do not mark `_ti` as ready for removal. Step 7 is gated on all prior steps completing.

## Debug Probe Retirement Order

The debug probe audit in `tmp/debug-probes-gating-audit/report.md` found that
several probes are test or DevTools surfaces rather than product dependencies.
Retire them in this order:

1. Add a shared debug-probe gate, for example `window.__DEBUG_PROBES__` plus
   localhost/test defaults.
2. Gate `_ti` and `__semantic*Probe`
   surfaces behind that gate.
3. Update tests that intentionally need probes to enable the gate before module
   import.
4. Remove probes with no test or source consumers after the contracts prove it.

Do not remove `_ti` or `__semanticFocusCueProbe` opportunistically. Existing
contracts and visual QA still consume them.

## State Exposure Retirement

The state migration audit in `tmp/window-state-migration-audit/report.md` found
no `js/` readers of `window.state`; the dependency is test-harness related.

**2026-05-27 — `window.state` retired.** Neutral replacements established:

- `window.__APP_STATE__` — the preferred neutral state hook
- `window.__TEST_STATE__` — preserved for existing Playwright tests

Next: migrate Playwright helpers/specs from `window.__TEST_STATE__` to `__APP_STATE__`
then retire `window.__TEST_STATE__` once all consumers use the replacement.

## Retired Globals

| Global | Retired | Replacement |
|---|---|---|
| `window.state` | 2026-05-27 | `window.__APP_STATE__` |
| `window.recenterFocusedNode` | 2026-05-27 | Direct `recenterFocusedNode` imports from `event-bindings.js` |
| `window._cam` | 2026-05-28 | Direct named imports from `camera-controls.js` |
| `window.focusOnPoint` | 2026-05-28 | Direct `focusOnPoint` imports from `lifecycle.js` |
| `window.updateJourneyCompass` | 2026-05-28 | Direct `updateJourneyCompass` imports/adapters |
| `window._findSemanticPath` | 2026-05-27 | Direct `findSemanticPath` module import |
| `window.syncRuntimeState` | 2026-05-28 | Direct `syncRuntimeState` import from `camera-controls.js` — still a named export |
| `window.getRuntimeStateSnapshot` | 2026-05-28 | Direct `getRuntimeStateSnapshot` import from `camera-controls.js` — still a named export |
| `window.syncOrbitAutoRotate` | 2026-05-28 | Direct `syncOrbitAutoRotate` import from `camera-controls.js` — still a named export |
| `window.setRouteExplorationState` | 2026-05-28 | Direct `setRouteExplorationState` import from `camera-controls.js` — still a named export |
| `window.clearRouteExploration` | 2026-05-28 | Direct `clearRouteExploration` import from `camera-controls.js` — still a named export |
| `window.markRouteExploration` | 2026-05-28 | Direct `markRouteExploration` import from `camera-controls.js` — still a named export |
| `window.shouldMarkRouteExploration` | 2026-05-28 | Direct `shouldMarkRouteExploration` import from `camera-controls.js` — still a named export |
| `window._fp` | 2026-05-28 | Retired by removing focus-pocket debug namespace after no module/runtime consumers were found. |
| `window.clearMobileRouteFieldPeek` | 2026-05-28 | Direct search-state ownership and event-bus requests; retired `composition-adapter.js` and `search-lifecycle-adapter.js` must not be restored |
| `window.getBoundedNeighborhoodWalkCandidate` | 2026-05-28 | Internal journey.js calls only |
| `window.isBoundedNeighborhoodActive` | 2026-05-28 | Internal journey.js calls only |
| `window.primeBoundedSemanticNeighborhoodForTraversal` | 2026-05-28 | Internal journey.js calls only |
| `window.ensureBoundedNeighborhoodFromActivePocket` | 2026-05-28 | Internal journey.js calls only |
| `window.getNeighborhoodRouteIndices` | 2026-05-28 | Internal journey.js calls only |
| `window.getNeighborhoodCandidateForIndex` | 2026-05-28 | Internal journey.js calls only |
| `window.buildNeighborhoodManifest` | 2026-05-28 | Internal journey.js calls only |
| `window.getSemanticNeighborRecordBetween` | 2026-05-28 | Internal journey.js calls only |
| `window.initClusterLabels` | 2026-05-28 | Direct `initClusterLabels` import from `cluster-labels.js` |
| `window.updateClusterLabels` | 2026-05-28 | Direct `updateClusterLabels` import from `cluster-labels.js` |
| `window.zoomMap` | 2026-05-28 | Direct `zoomMap` import from `map-state.js` |
| `window._previouslyFocusedInfoPanel` | 2026-05-28 | Module-scoped `_previouslyFocusedInfoPanel` in `event-bindings.js` closure |
| `window._previouslyFocusedLegend` | 2026-05-28 | Module-scoped `_previouslyFocusedLegend` in `legend-ui.js` via `setPreviouslyFocusedLegend()`/`getPreviouslyFocusedLegend()` |
| `window.updateLegendGuideState` | 2026-05-28 | Direct `updateLegendGuideState` imports from `legend-ui.js` |
| `window.__semanticJourneyProbe` | 2026-05-28 | Retired unused journey compass debug probe; `installSemanticJourneyProbe()` now returns presentation state |
| `window.setTrailFromSeed` | 2026-05-28 | Direct imports and `window.__APP_ACTIONS__.setTrailFromSeed` for test/dev harnesses |
| `window.demoController` | 2026-06-01 | Module retired. Tests use `window.isMicroDemoRunning` and `window.cancelMicroDemo` from `micro-demo.js`. |

## Running The Ratchet

```bash
node tests/window-global-allowlist-contract.mjs
```

Expected output includes counts for `live-product`, `debug-probe`, and
`migration-debt` (currently `0`). The important failure mode is an `unknown` assignment.
