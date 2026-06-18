# Nav State Ownership Map

**Date:** 2026-06-17
**Status:** Living document — updated as ownership changes
**Audience:** Anyone modifying `src/lib/stores/navigation.svelte.ts`, `src/lib/state/app.svelte.ts`, or the parity-attrs layer

## Architecture Overview

The semantic explorer has a **dual-store** nav state design:

1. **Svelte writable** (`_navWritable`) at `src/lib/stores/navigation.svelte.ts:157`
    - The canonical reader-side reactive store
    - Consumed by Svelte components via `navStore()` getter
    - Drives `parity-attrs.svelte.ts` parity derivation

2. **Svelte 5 class** (`appState.navState`) at `src/lib/state/app.svelte.ts:157`
    - Legacy object, mutated via `appState.withMutation(() => Object.assign(...))`
    - Read by `journeyStore.phase` (via `withJourneyNotify`/`_readJourneyFromAppState`)
    - Read by `compass-state.ts`, `camera-choreography/*.ts`, etc.

The dual-store exists because:

- The Svelte track (cursor.ts → dispatchNavTransition → `_navWritable.update`) is the canonical Svelte 5 writer
- The legacy track (engine kernel in `js/modules/`) was the canonical writer before the Svelte migration
- Both must stay in sync via **mirror discipline**

## Mirror Discipline

`writeNavStateMirror(patch: Partial<NavState>)` at `src/lib/stores/navigation.svelte.ts:395-403` is the canonical helper:

```ts
export function writeNavStateMirror(patch: Partial<NavState>): void {
    appState.withMutation(() => {
        Object.assign(appState.navState, patch)
    })
    _navWritable.update((s) => ({ ...s, ...patch }))
}
```

Every `appState.navState.X = ...` write SHOULD go through this helper (or one of the `_XxxWritable.update()` callbacks inside `dispatchNavTransition`). Direct mutations outside the helper are flagged by `scripts/ci-check-nav-mirror-pattern.mjs` (run via `npm run lint:nav-mirror`).

**Known exception:** The FOCUS_NODE branch in `dispatchNavTransition` (`src/lib/stores/navigation.svelte.ts:418-465`) is allowlisted in `scripts/ci-check-nav-mirror-pattern.allowlist.json` because it has a special pattern that combines `appState.withMutation()` with `_navWritable.update()` inline to preserve the canonical Svelte-track writer pattern.

## Field Ownership Table

| Field                         | Type                              | Canonical Writer                                                     | Mirror Helper                                                   | Canonical Readers                                                                                       | Notes                                                                                                                                                                                |
| ----------------------------- | --------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mode`                        | `NavMode`                         | `dispatchNavTransition FOCUS_NODE` branch (navigation.svelte.ts:445) | `writeNavStateMirror` (FOCUS_NODE branch direct + many helpers) | `parity-attrs.svelte.ts:journeyPhase`, `journey.svelte.ts:_readJourneyFromAppState`, `compass-state.ts` | **Was the W15 parity-attrs gap root cause** (commit 42aa09b stopped mirroring legacy mode/surface in syncSvelteNavFromLegacy; commit 37636fe made FOCUS_NODE branch mirror directly) |
| `surface`                     | `PanelSurface`                    | `dispatchNavTransition FOCUS_NODE` branch (navigation.svelte.ts:451) | `writeNavStateMirror`                                           | `parity-attrs.svelte.ts:panelSurface`, `parity-attrs.svelte.ts:panelSurfaceMode`                        | Same W15 fix                                                                                                                                                                         |
| `focusedIndex`                | `number \| null`                  | `dispatchNavTransition FOCUS_NODE` branch (navigation.svelte.ts:441) | `writeNavStateMirror`                                           | `cursor.ts:focusOnNode`, `parity-attrs.svelte.ts:focusedNode`, `compass-state.ts`                       | Initial value: `null`                                                                                                                                                                |
| `previousSurface`             | `PanelSurface`                    | `dispatchNavTransition` (some branches)                              | `writeNavStateMirror`                                           | `cursor.ts:surface` derivation                                                                          | Initial value: `'idle'`                                                                                                                                                              |
| `trailSeedIndex`              | `number \| null`                  | `dispatchNavTransition ENTER_TRAIL`                                  | `writeNavStateMirror`                                           | `cursor.ts:orbit-slack.ts`                                                                              |                                                                                                                                                                                      |
| `trailNeighborIndices`        | `number[]`                        | `thread-settler.ts:walkThreadNeighbor`                               | `writeNavStateMirror`                                           | `orbit-slack.ts`, `compass-state.ts`                                                                    |                                                                                                                                                                                      |
| `trailCursor`                 | `number`                          | `thread-settler.ts`                                                  | `writeNavStateMirror`                                           | `cursor.ts:focusOnNode`                                                                                 | Initial value: `-1`                                                                                                                                                                  |
| `trailDepth`                  | `number`                          | `cursor.ts:focusOnNode`, `thread-settler.ts`                         | `writeNavStateMirror`                                           | `parity-attrs.svelte.ts:trailDepth`, `compass-state.ts`                                                 | Initial value: `0`                                                                                                                                                                   |
| `walkHistoryIndices`          | `number[]`                        | `thread-settler.ts:walkThreadNeighbor`                               | `writeNavStateMirror`                                           | `compass-state.ts`                                                                                      |                                                                                                                                                                                      |
| `lastTraversalReason`         | `string \| null`                  | `thread-settler.ts:walkThreadNeighbor`                               | `writeNavStateMirror`                                           | `compass-state.ts`, `ui-renderers.ts`                                                                   |                                                                                                                                                                                      |
| `threadCandidates`            | `ThreadCandidate[]`               | `thread-settler.ts`                                                  | `writeNavStateMirror`                                           | `thread-inspector.ts:inspectThreadNeighbor`                                                             |                                                                                                                                                                                      |
| `threadReasonByIndex`         | `Map<number, string>`             | `thread-settler.ts`                                                  | `writeNavStateMirror`                                           | `thread-inspector.ts`                                                                                   |                                                                                                                                                                                      |
| `threadSource`                | `string`                          | `thread-settler.ts`                                                  | `writeNavStateMirror`                                           | `parity-attrs.svelte.ts:threadSource`, `thread-inspector.ts`                                            | Initial value: `''`                                                                                                                                                                  |
| `focusPocketIndices`          | `number[]`                        | `pocket.ts`, `focus-pocket.ts`                                       | `writeFocusPocketMirror` (via `withFocusNotify`)                | `compass-state.ts`, `parity-attrs.svelte.ts`                                                            | Migrated to use `writeFocusPocketMirror` (W15+ follow-up). Note: `appState.navState.focusPocketIndices` field name maps to `pocketNodes` in `FocusStoreState`.                       |
| `focusPocketRoleByIndex`      | `Map<number, string>`             | `pocket.ts`, `focus-pocket.ts`                                       | `writeFocusPocketMirror` (via `withFocusNotify`)                | `compass-state.ts`                                                                                      | Same as focusPocketIndices. `setFocusPocketRoleForIndex` is exempt — does partial `.set()` on a Map inside `appState.withMutation` (already an allowed context).                     |
| `focusPocketMeta`             | `FocusPocketMeta \| null`         | `pocket.ts:setFocusPocketMeta`                                       | `writeFocusPocketMirror` (via `withFocusNotify`)                | `camera-choreography/focus.ts:viewportProfile`                                                          | Migrated to use `writeFocusPocketMirror` (W15+ follow-up). Field name in `FocusStoreState` is `pocketMeta`.                                                                          |
| `focusPocketAnimationFrameId` | `number \| null`                  | `pocket.ts`                                                          | (rare)                                                          | `cursor.ts`                                                                                             |                                                                                                                                                                                      |
| `focusFramingMeta`            | `FocusFramingMeta \| null`        | `cursor.ts`                                                          | direct write                                                    | `camera-choreography/focus.ts`                                                                          |                                                                                                                                                                                      |
| `currentPersonality`          | `ChoreographyPersonality \| null` | `cursor.ts`                                                          | direct write                                                    | `routes.ts`, `nF()` (applySemanticCentroidCamera)                                                       |                                                                                                                                                                                      |
| `neighborhoodIndices`         | `number[]`                        | `thread-settler.ts:walkThreadNeighbor`                               | `writeNavStateMirror`                                           | `cursor.ts:focusOnNode`                                                                                 |                                                                                                                                                                                      |
| `explorationHistoryIndices`   | `number[]`                        | `thread-settler.ts:walkThreadNeighbor`                               | `writeNavStateMirror`                                           | `compass-state.ts`                                                                                      |                                                                                                                                                                                      |
| `currentView`                 | `'galaxy' \| 'map'`               | `view-controller.ts`                                                 | direct write                                                    | `parity-attrs.svelte.ts:view`, `cursor.ts`                                                              |                                                                                                                                                                                      |
| `myceliumMode`                | `MyceliumMode`                    | `view-controller.ts`                                                 | direct write                                                    | `parity-attrs.svelte.ts:myceliumMode`                                                                   | Initial value: `'dormant'`                                                                                                                                                           |
| `autoRotate`                  | `boolean`                         | `view-controller.ts`                                                 | direct write                                                    | `cursor.ts`                                                                                             | Initial value: `true`                                                                                                                                                                |
| `autoRotateSuspended`         | `boolean`                         | `camera-controls-core.svelte.ts`                                     | direct write                                                    | `cursor.ts`                                                                                             | Initial value: `false`                                                                                                                                                               |
| `trailDepthFromExploration`   | `number`                          | `lifecycle.ts`                                                       | direct write                                                    | `parity-attrs.svelte.ts`                                                                                | Initial value: `0`                                                                                                                                                                   |
| `sceneRevealActive`           | `boolean`                         | `lifecycle.ts`                                                       | direct write                                                    | `parity-attrs.svelte.ts:sceneReady`                                                                     | Initial value: `false`                                                                                                                                                               |
| `sceneRevealStartedAt`        | `number`                          | `lifecycle.ts`                                                       | direct write                                                    | (analytics only)                                                                                        | Initial value: `0`                                                                                                                                                                   |
| `loadingPhaseKey`             | `string`                          | `lifecycle.ts`                                                       | direct write                                                    | `parity-attrs.svelte.ts:loadingPhase`                                                                   | Initial value: `'records'`                                                                                                                                                           |
| `applyingUrlState`            | `boolean`                         | `url-state.ts`                                                       | direct write                                                    | (internal flag)                                                                                         | Initial value: `false`                                                                                                                                                               |
| `restoringBrowserHistory`     | `boolean`                         | `url-state.ts`                                                       | direct write                                                    | (internal flag)                                                                                         | Initial value: `false`                                                                                                                                                               |
| `activeStoryPrompt`           | `StoryPromptKey \| null`          | `triggers.ts:SEARCH_FOCUS_REQUESTED`                                 | `writeNavStateMirror`                                           | `ui-renderers.ts`                                                                                       |                                                                                                                                                                                      |
| `strandContinuityState`       | `StrandContinuityState`           | `thread-settler.ts`                                                  | inline + `withStateMutation`                                    | `parity-attrs.svelte.ts:strandJourney*`                                                                 | Initial value: `{phase: 'idle', ...}`                                                                                                                                                |

## Recent Ownership Changes (Timeline)

- **2026-06-17 W15 fix** (commit `42aa09b`): Stopped mirroring legacy `mode`/`surface` in `syncSvelteNavFromLegacy` (`src/lib/orchestration/window-actions.ts:175`). The legacy fields were never updated by the Svelte track, so the mirror was clobbering correct Svelte-track values with stale legacy data.
- **2026-06-17 W15 follow-up** (commit `37636fe`): `dispatchNavTransition FOCUS_NODE` branch now mirrors `mode`/`surface`/`focusedIndex`/`activeStoryPrompt` from `_navWritable` to `appState.navState`. This ensures `journeyStore.phase` (which reads `appState.navState.mode`) reflects the focus state immediately after a focus click.
- **2026-06-17 W15 follow-up** (commit `83a0220`): `src/components/Canvas.svelte:onNodePicked` now reads `navStore().surface` and preserves it when re-dispatching `FOCUS_NODE`. Prevents the canvas CAMERA_NODE_FOCUSED → lifecycle-bridge → onNodePicked chain from clobbering `'focus-search'` back to `'focus'`.
- **2026-06-17 parity-attrs fix** (commit `56c8316` — based on `db9eb8d` W22): `parity-attrs.svelte.ts:journeyPhase` derivation now trusts `_hasFocus && _hasSearchIntent` derivation BEFORE the `journey.phase` fallback. The previous `if (explicit && explicit !== 'idle') return explicit` short-circuit was returning `'overview'` even when the user was clearly in a focused state.
- **2026-06-17 store-parity** (commits `fc2d5fd`, `aed8bd8`, `99cb0f6`): Closed 5 HIGH store-parity gaps. Added `writeNavStateMirror` helper. Closed GAP-1 (demo), GAP-2 (thread-settler), GAP-3 (focus-pocket, 2 files), GAP-4 (thread-inspector), GAP-5 (url-state). All 5 gaps used to write only to `appState.navState` and bypass `_navWritable`.
- **2026-06-17 W15+** (commit `ca65525`): `cursor.ts:focusOnNode` forwards `surface: 'focus-search' | 'focus'` based on `options.fromSearchResult`. Previously, `dispatchNavTransition FOCUS_NODE` default `surface: 'focus'` was clobbering `'focus-search'` set by `SEARCH_FOCUS_REQUESTED` subscriber.
- **2026-06-17 W15+ follow-up** (Lane BC mimo-v2.5): Added `writeFocusPocketMirror` helper to `src/lib/stores/focus.svelte.ts`. Migrated 12 direct focus-pocket writes (6 in `src/lib/focus/pocket.ts` + 6 in `src/lib/journey/focus-pocket.ts`) to use the new helper. Extended `scripts/ci-check-nav-mirror-pattern.mjs` to recognize `writeFocusPocketMirror` and `_focusWritable.update`/`withFocusNotify` as allowed contexts. CI check now covers both nav-state fields AND focus-pocket fields.
- **2026-06-17 W15+ follow-up** (Lane A owl-alpha + in-lane fixup): Wrote 21 vitest cases for `ci-check-nav-mirror-pattern.mjs` in `tests/scripts/ci-check-nav-mirror-pattern.test.mjs`. Worker timed out on a syntax error; main lane fixed and verified 21/21 tests pass. Documented two known minor limitations: (a) the regex doesn't match `+=` compound assignment (false negative on rare pattern), (b) the 30-line context window for `isInsideAllowedContext` means mutations >30 lines after the allowed context header will be flagged (no real-world case exists in the codebase).

## Helper Functions Reference

- `writeNavStateMirror(patch: Partial<NavState>)` — `src/lib/stores/navigation.svelte.ts:395-403`. The canonical batch helper for navState fields. Writes to both stores.
- `writeFocusPocketMirror(patch: Partial<Pick<FocusStoreState, 'pocketNodes' | 'pocketMeta' | 'pocketRoleByIndex'>>)` — `src/lib/stores/focus.svelte.ts` (added 2026-06-17 W15+ follow-up). The canonical batch helper for focus-pocket fields. Thin wrapper around `withFocusNotify` — bumps the focus writable + syncs to `appState.navState.focusPocket*` via the existing bridge.
- `withStateMutation(fn: () => void)` — `src/lib/utils/state-bridge.ts`. Wraps legacy mutations (used for `_makeProdProxy` invariant in production).
- `withJourneyNotify`, `withFocusNotify`, `withSearchNotify` — same bridge, for the journey/focus/search stores respectively.
- `dispatchNavTransition(action, payload)` — `src/lib/stores/navigation.svelte.ts:407+`. The core orchestrator. Each branch (FOCUS_NODE, RETURN_OVERVIEW, ENTER_TRAIL, etc.) updates `_navWritable` and (in most branches) calls `appState.withMutation(...)` to mirror to the legacy class.
- `installParityAttributeSync()` — `src/lib/orchestration/parity-attrs.svelte.ts:402+`. Subscribes to `_navWritable` and writes `body.dataset.*` via `applyParityAttributes(map)`.
- `applyParityAttributes(map)` — `src/lib/orchestration/parity-attrs.svelte.ts:341`. Writes 18 body data-attrs from the computed map.
- `computeParityAttributes()` — `src/lib/orchestration/parity-attrs.svelte.ts:380+`. The derivation that reads `_navWritable` + other stores and produces the parity-attr map.
- `syncSvelteNavFromLegacy()` — `src/lib/orchestration/window-actions.ts:175`. The mirror from legacy to Svelte track. After W15 fix (`42aa09b`), no longer mirrors `mode`/`surface` (only `focusedIndex` and trail bookkeeping).
- `updateJourneyCompass()` (now `ZP()` in bundle) — `src/lib/orchestration/compass-controller.ts:227+`. Was writing `data-journey-phase` from `journey.phase` (legacy state); now commented out (parity-attrs owns body data-attrs).
- `updateExplorationUi()` — `src/lib/engine/camera-choreography/cursor.ts:139`. Refreshes `body.dataset.*` after focus/traversal events.

## CI Enforcement

`scripts/ci-check-nav-mirror-pattern.mjs` (224 lines) flags direct `appState.navState.X = ...` writes outside the canonical patterns:

```bash
npm run lint:nav-mirror
# [nav-mirror-check] ✓ No direct navState mutations outside canonical helpers.
```

The allowlist at `scripts/ci-check-nav-mirror-pattern.allowlist.json` permits the `FOCUS_NODE` branch in `navigation.svelte.ts:418-465` because it uses inline `appState.withMutation(...)` + `_navWritable.update(...)` rather than `writeNavStateMirror`.

## Known Issues / Future Work

- **`currentView`, `myceliumMode`, `autoRotate`, `autoRotateSuspended`** are written directly to `appState.navState.X = ...` without `_navWritable` mirroring. This is fine because the Svelte track doesn't read them reactively (they're read in imperative code paths). But if any future Svelte component needs to react to these, they'll need to be added to the mirror.
- **focusStore mirror for `focusPocketIndices` / `focusPocketRoleByIndex` / `focusPocketMeta`** uses `writeFocusPocketMirror` (added 2026-06-17 W15+ follow-up, see [Helper Functions Reference](#helper-functions-reference)). The pattern is consistent (`withFocusNotify` style).
- **The pre-bundled `dist/svelte/assets/panel-bindings-*.js`** no longer exists in the new build (consolidated into `index-C2x4Ful_.js` / `index-BxniA3vw.js`). The W15 deeper parity-attrs gap is now fully resolved at both the dev (5175) and preview (4174) levels. See `docs/production-preview-parity-baseline-2026-06-17.md` for the full body data-attr baseline captured against the production preview.

## Test Coverage

The parity layer has direct unit test coverage:

- **`tests/unit-active/parity-attrs-derivation.test.ts`** — 84 vitest cases covering all IIFE derivations inside `computeParityAttributes()` (journeyPhase, graphContext, panelSurfaceMode, panelSurfaceDetail, focusedNode, searchStatus, etc.). Includes the W15 regression test: `focusedIndex=522 + search.summary + journey.phase=overview → journeyPhase='focus-search'` (would have caught the W15 deeper gap at the unit level).
- **`tests/integration/w15-body-attr-live-probe.spec.js`** — Playwright integration test that runs against a Vite dev server or production preview. Covers 4 primary body data-attr states (idle, search, focus-search, focus) with auto-retry, configurable timeout, console error capture, and exported mock fetch helpers. Remaining states (trail, inside, semantic-dive, returning) documented as TODO.
- **`tests/integration/visual-state-snapshots.spec.js`** — Playwright visual snapshot test capturing baseline screenshots for the 4 primary body data-attr states (`idle-overview.png`, `search-mode.png`, `focus-search.png`, `focus-programmatic.png`). Uses `toHaveScreenshot()` for pixel-diff regression detection. Update baselines with `UPDATE_SNAPSHOTS=true`. Snapshots stored relative to the test file.
- **`scripts/ci-check-nav-mirror-pattern.mjs` + `tests/scripts/ci-check-nav-mirror-pattern.test.mjs`** — CI lint check + 21 vitest cases ensuring no direct nav-state mutations outside canonical mirror helpers.

## Related Documents

- `docs/svelte-5-strict-mode-cookbook.md` — Svelte 5 `!==` → `===` compiler bug cookbook
- `docs/production-preview-parity-baseline-2026-06-17.md` — Production preview parity baseline
- `notes/w15-parity-attrs-second-look-2026-06-17.md` — W15 closeout
- `notes/legacy-mirror-audit-2026-06-17.md` — Mirror discipline audit

## Field-by-field write frequency (from integration test)

After 1 search-result focus click:

- `mode` — written 1× (FOCUS_NODE branch)
- `surface` — written 1× (FOCUS_NODE branch)
- `focusedIndex` — written 2× (FOCUS_NODE branch + thread-settler mirror)
- `trailDepth` — written 1× (cursor.ts:updateExplorationUi)
- `walkHistoryIndices` — written 1× (cursor.ts:updateExplorationUi)
- `lastTraversalReason` — written 1× (cursor.ts:updateExplorationUi)
- `panelSurfaceMode`, `journeyPhase`, `panelSurface` — written by `applyParityAttributes` only (no navState change)
