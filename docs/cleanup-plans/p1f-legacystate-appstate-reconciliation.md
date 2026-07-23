# P1-F — `legacyState` → `appState` Reconciliation Plan

**Status:** **DONE (2026-07-23, HEAD `31c027e5`)** — landed by main lane after the parallel
session's partial work.

**What changed in this pass:**

- Removed the `LegacyState` interface and re-export chain
  (`src/lib/state/types/engine-types.ts`, `src/lib/state/state-types.ts`,
  `src/lib/state/types/index.ts`, `src/lib/state/legacy-state.ts`).
- Removed the `LegacyState` import/re-export from `three-engine-core.ts`.
- Retyped `Pick<LegacyState, …>` function parameters in
  `three-engine-frame-updates.ts` to `Pick<AppState, …>` (and JSDoc updates).
- Retyped `legacyState` sinks in `three-store-sync.ts` to `Pick<AppState, …>`.
- Removed `getLegacyAppState()` / `Record<string, unknown>` cast from
  `lifecycle.ts` and passed `appState` directly to `attachLegacyState()` and
  `__THREE_APP__`.
- Changed `semantic-threads.ts` `attachLegacyState` to accept `AppState` and
  `_state` to `AppState`.
- Kept the runtime `legacyState = appState` alias in `app.svelte.ts` (only the
  type backing changed).

**Verification:** `npm run typecheck`, `npm run build`, `npm run lint`, and
`npm run test:unit` all pass. See `tmp/p1f-engine-migration-report.md` for the
full report.

**Historical note:** The earlier plan below documents the original `LegacyState`
flat-field mapping and the `forceAnimate` decision that was resolved in a prior
commit (`252cccd2`).

---

**Original status block:**

_In-flight (2026-07-22, HEAD `840411fb`) — partially landed by a parallel session:_

- **Mechanical cast removal — DONE.** The unsafe `as unknown as LegacyState` cast was deleted; `legacyState` is now `export const legacyState = appState` (typed `AppState`, see `src/lib/state/app.svelte.ts:791-793`). All access is now type-checked.
- **Behavior-sensitive engine remaps — IN-FLIGHT.** A parallel session was actively editing `src/lib/engine/three-engine-core.ts` mid-refactor on 2026-07-22. Remaining engine sites still typed against `LegacyState`: `three-engine-core.ts:25` `import type { LegacyState }`; `three-engine-frame-updates.ts:14` same import + `Pick<LegacyState, …>` function params at `:131` / `:197` / `:293` (`focusedNode` / `semanticDiveMode` / `trailDepth` / `hoverHighlightIndex` / `nodePositions` selector picks); `three-engine-helpers.ts:24` reads `state.forceAnimate` (still flat); `three-engine-core.ts:503` reads `engineState.state?.forceAnimate` top-level.
- **Remaining work:** retype the engine function params `LegacyState → AppState` + remap the flat reads to nested `focusState`/`navState`. **Decide the `forceAnimate` default** — `AppState` exposes no top-level `forceAnimate` (add a backed default field, mirroring the `engineState.focusPocket` bridge already used at `frame-updates.ts:261`, OR map flat-read call-sites to a `false` default). Re-verify with a runtime render-loop smoke test (engine-owner sign-off still required).

**Original branch idea:** `p1f/legacystate-to-appstate`.
**Why deferred from the remediation pass:** the migration is a _behavior-sensitive_
interface reconciliation, not a mechanical deletion. Executing it blindly at the
tail of a remediation session risks breaking the render loop.

## Goal

Remove the unsafe `as unknown as LegacyState` cast in
`src/lib/state/app.svelte.ts`:

```ts
// current (loose escape hatch)
export const legacyState = appState as unknown as LegacyState
// target
export const legacyState = appState // legacyState becomes AppState-typed
```

…and make `legacyState` / `engineState.state` properly typed as `AppState` so every
access is type-checked.

## Blocker: `LegacyState` flattens `appState` (structural mismatch)

`LegacyState` (defined in `src/lib/state/legacy-state.ts`) exposes a **flat** shape.
`AppState` (`src/lib/state/app.svelte.ts`) stores the same domain data in **nested
sub-aggregates**. The flat fields are NOT top-level on `AppState`. Confirmed mapping:

| `LegacyState` field        | Real location on `appState`                         | Notes                                                                              |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `focusPocketMotionByIndex` | `appState.focusState.pocketMotionByIndex`           | name differs (`pocketMotionByIndex`, a `Map`)                                      |
| `selectedPoint`            | `appState.focusState.selectedPoint`                 | nested                                                                             |
| `nodesAreSettling`         | `appState.focusState.nodesAreSettling`              | nested                                                                             |
| `inspectedThreadIndex`     | `appState.focusState.inspectedThreadIndex`          | nested                                                                             |
| `pinnedThreadIndex`        | `appState.focusState.pinnedThreadIndex`             | nested                                                                             |
| `autoRotate`               | `appState.navState.autoRotate`                      | nested (no top-level)                                                              |
| `autoRotateSuspended`      | `appState.navState.autoRotateSuspended`             | nested (no top-level)                                                              |
| `sceneRevealActive`        | `appState.sceneRevealActive` (top-level, l.573)     | top-level exists                                                                   |
| `myceliumDirty`            | `appState.myceliumDirty` (top-level, l.229)         | top-level                                                                          |
| `routeTraceLines`          | `appState.routeTraceLines` (top-level, l.384)       | top-level                                                                          |
| `autoRotateResumeDueAt`    | `appState.autoRotateResumeDueAt` (top-level, l.571) | top-level                                                                          |
| `weather`                  | `appState.weather` (`WeatherData \| null`, l.256)   | top-level; shape differs (see below)                                               |
| `pulsePhase`               | `appState.pulsePhase` (top-level, l.264)            | top-level                                                                          |
| `hoverHighlightIndex`      | `appState.hoverHighlightIndex` (top-level, l.269)   | top-level                                                                          |
| `forceAnimate`             | **does not exist on `appState`**                    | only declared in `engine-types.ts:463`; no writer; reads currently get `undefined` |

### Critical finding

At runtime today, `legacyState = appState`. So `legacyState.autoRotate`,
`legacyState.focusPocketMotionByIndex`, `legacyState.nodesAreSettling`,
`legacyState.selectedPoint`, `legacyState.forceAnimate` **all read `undefined`**
(the cast hides the missing top-level fields). The engine functions consuming these
(`sceneNeedsContinuousFrame`, the `three-engine-core.ts` frame-loop sites) are
therefore operating on `undefined` for these flattened fields — the bridge was never
a faithful mapping. **The migration must decide intended behavior**, not just add
fields.

## Cascade errors observed (revert point)

Removing the cast + retyping `engineState.state: AppState | null` produced 6 errors:

1. `three-engine-frame-updates.ts:264` — `engineState.state.focusPocketMotionByIndex`
   (missing; → `focusState.pocketMotionByIndex`)
2. `three-engine-core.ts:445` — `engineState.state?.forceAnimate` (missing; see below)
3. `three-engine-core.ts:452` — `sceneNeedsContinuousFrame(frameNow, engineState.state)`
   param `LegacyState | null` ← `AppState`
4. `three-engine-core.ts:477` — `lerpCameraForReveal(..., engineState.state)` +
   `updatePointsMaterial(..., engineState.state)` params `LegacyState`
5. `three-engine-core.ts:519` — `updateMyceliumPulse(state)` where
   `state: Pick<LegacyState,'pulsePhase'> & { weather?: { wind_speed_10m? } }`
6. `window-actions.ts:126` — `w.__APP_STATE__ ??= modules.state` (AppState vs
   `Record<string, unknown>` global)

### Safe, mechanical parts (apply first, no behavior change)

- `src/lib/state/app.svelte.ts`: `export class AppState` (add `export`); drop the
  `as unknown as LegacyState` cast; remove `import type { LegacyState }`.
- `src/lib/engine/three-engine-state.ts`: `state: AppState | null`; import `AppState`;
  `__LEGACY_APP_STATE__?: AppState`.
- `src/window.d.ts`: `__LEGACY_APP_STATE__?: AppState`; import type `AppState`.
- `src/lib/orchestration/window-actions.ts`: `LegacyActionModules.state?: AppState`.

These retype the legacy _bags_ to `AppState` and resolve errors 6 + the
"AppState not exported" error. They do NOT touch engine field reads.

### Behavior-sensitive parts (require remap + owner sign-off)

- **Functions whose params are `LegacyState`** → change to `AppState` and remap the
  flattened field reads inside their bodies:
    - `sceneNeedsContinuousFrame` (`three-engine-helpers.ts:14`) — reads
      `focusPocketMotionByIndex`, `autoRotate`, `autoRotateSuspended`,
      `autoRotateResumeDueAt`, `routeTraceLines`, `forceAnimate`, `sceneRevealActive`,
      `nodesAreSettling`, `myceliumDirty`, `searchState?.searchGlowActive`,
      `hoverHighlightIndex`, `focusedNode`, `inspectedThreadIndex`, `pinnedThreadIndex`.
    - `lerpCameraForReveal` / `updatePointsMaterial` (`three-engine-frame-updates.ts:92/301`).
    - `updateMyceliumPulse` (`three-engine-frame-updates.ts:170`) — param
      `Pick<LegacyState,'pulsePhase'> & { weather?: { wind_speed_10m? } }`; body reads
      `state.weather.wind_speed_10m`. Reconcile `weather` shape (AppState.weather is
      `WeatherData`; confirm `WeatherData.wind_speed_10m` exists, else map).
- **`forceAnimate`**: no backing on `appState`. Either (a) add a backed
  `forceAnimate = $state<boolean>(false)` field + wire its writer, or (b) map the
  read to a safe default (`false`) preserving the `state.forceAnimate ||` fallthrough.
  **Decision needed from engine owner** — current runtime value is always `undefined`.
- **Access-site remaps** (`three-engine-core.ts:445`, `three-engine-frame-updates.ts:264`):
  `engineState.state?.forceAnimate` → intended source; `engineState.state.focusPocketMotionByIndex`
  → `engineState.state?.focusState.pocketMotionByIndex`.

## Verification gates (must all pass before merge)

- `npm run check` → 0 errors.
- `npm run lint` → 0 errors on changed files.
- `npm run test:unit` + `npm run test:contract` → green.
- **Runtime render-loop smoke test** (headless WebGL): confirm the
  `requestAnimationFrame` loop still schedules/deschedules correctly — the
  `sceneNeedsContinuousFrame` decision now uses real (non-`undefined`) nested fields,
  so frame cadence may change. A visual/journey check on `desktop-idle` +
  `focus-pocket` surfaces is required, not just type-check.
- `npm run qa:journey:headless` for any focus/trail surface touched.

## Risk

Highest-risk item in the remediation plan (flagged lower-confidence). Touching the
render-loop field reads can change frame scheduling and focus-pocket motion. Must be
its own PR with engine-owner review + runtime verification, separate from the
dead-code removal (P0) that already landed on `master`.
