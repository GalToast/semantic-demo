# TypeScript Runtime Sibling Inventory - 2026-06-08

## Initial Finding

The prior claim that every legacy runtime module had a TypeScript sibling was true in project history, but it is not true in the current working tree.

Current tool output:

| Check | Current result |
|---|---:|
| `npm run check:ts-progress` total runtime modules | 151 |
| TS-only native runtime modules | 0 |
| Dual JS+TS shadow modules | 3 |
| JS-only runtime modules | 148 |
| Runtime TS coverage | 2.0% |
| `app.js` entry imports with TS siblings | 0 / 43 |

Current tracked TS runtime siblings:

| Path | Status |
|---|---|
| `js/modules/app.ts` | tracked |
| `js/modules/journey-route-trace.ts` | untracked |
| `js/modules/journey-semantic-overlay.ts` | untracked |

## Recovery Applied

The runtime sibling set was recovered in-place without a broad checkout/reset.

| Recovery check | Result |
|---|---:|
| Historical TS siblings restored from newest containing git blob | 140 |
| Existing TS siblings preserved | 3 |
| No-history TS siblings created from current JS source | 8 |
| Runtime modules with JS+TS shadows after recovery | 151 / 151 |
| Runtime TS coverage after recovery | 100.0% |
| `app.js` entry imports with TS siblings after recovery | 43 / 43 |

The 8 no-history siblings were created from current JS source:

- `js/modules/camera-controls-choreography-cursor.ts`
- `js/modules/camera-controls-choreography-focus.ts`
- `js/modules/camera-controls-choreography-routes.ts`
- `js/modules/lifecycle-modes.ts`
- `js/modules/lifecycle-reset.ts`
- `js/modules/lifecycle-search-sync.ts`
- `js/modules/micro-demo-choreography.ts`
- `js/modules/role-label.ts`

After the strictness follow-up sweep, 61 recovered `js/modules/**/*.ts` shadows remain marked with `// @ts-nocheck`; 90 shadows now strict-check without that guard. This keeps the unreconciled inventory available to the migration tooling without causing Svelte's strict checker to treat every legacy shadow as native strict TypeScript before each file is reconciled.

Post-recovery verification:

- `npm run check:ts-progress` — 100.0% TS coverage; entry ready `YES`; 1 drift pair remains (`camera-controls-choreography-cursor` JS-only import surface).
- `npm run ts-readiness` — 151 TS files, 0 JS-only files, entry ready `YES`.
- `npm run typecheck` — passed.
- `npm run check:svelte` — passed with 0 errors and 0 warnings after focused `src/lib` type-shape cleanup.
- `npm run build:svelte` — passed; existing large-chunk and ineffective-dynamic-import warnings remain.

## What Happened

The TypeScript sibling wave existed, then was removed by later commits.

| Commit | Evidence |
|---|---|
| `753583b` (`chore(stabilization): finalize multi-wave migration and bug sweeps`) | `git ls-tree -r --name-only 753583b js/modules | rg "\.ts$"` returns 145 TS files under `js/modules/`. |
| `32b1151` (`fix(js): type safety and nullish coalescing in journey overlays`) | Deleted 133 `js/modules/**/*.ts` files. |
| `bd86917` (`chore(cleanup): delete orphan islands, dead .ts shadows, one-shot fix scripts; land migration WIP`) | Deleted 12 more `js/modules/**/*.ts` files, including `app.ts`, `event-bus.ts`, `idb-service.ts`, `journey-canvas-interaction.ts`, `keyboard-help.ts`, `loading-ui.ts`, `pathfinding.ts`, `search-tokenizer.ts`, `tooltip.ts`, and `utils/geo-data.ts`. |

So the current "barely started" result from `ts-readiness` is measuring the present filesystem correctly. The stale part is `docs/ts-migration-readiness.md`, which still describes the older all-siblings-present state.

## Interpretation

There are two separate migration tracks:

| Track | Current state |
|---|---|
| `src/` Svelte/TypeScript app track | Far along: Svelte components, stores, orchestration, engine bridge, and typed utility modules exist under `src/`. |
| `js/modules/*.js` runtime TS sibling track | Regressed: nearly all TypeScript shadow siblings were deleted after they existed. |

This is why different agents are disagreeing. Agents reading `src/` and AGENTS.md report the migration as nearly complete. Agents running `npm run ts-readiness` or counting `js/modules/**/*.ts` report the sibling conversion as mostly absent.

## Remaining Recovery Work

1. Reconcile the 23 reported TS/JS drift pairs.
   - **2026-06-08 update (app/micro-demo slice):** Reduced to 12 drift pairs. Closed drift in `app-svelte-island.ts` (added `diagnostic-adapter` import), `micro-demo-camera.ts` (added `cancelOverviewCameraAnimation` export + RAF tracking), and `micro-demo.ts` (replaced `Math.random()` shuffle with `seededUnit`-based Fisher-Yates, added `utils/seeded-random` import). Removed `// @ts-nocheck` from 4 files that remain strict-ready: `app-svelte-island.ts`, `micro-demo-camera.ts`, `micro-demo-guards.ts`, `micro-demo-ui.ts`. `micro-demo-choreography.ts` was later returned to `@ts-nocheck` after focused verification showed it was not strict-ready. All pass `typecheck`, `check:svelte`, and `check:ts-progress`.
   - **2026-06-08 update (camera/focus slice):** Closed drift in `camera-controls.ts`, `camera-controls-choreography.ts`, and `focus-stage-dom.ts`. Restored missing camera cancel and dive-button exports, then removed `// @ts-nocheck` from those 3 files once strict typecheck stayed clean.
   - **2026-06-08 update (search/loading/ui slice):** Closed drift in the owned search/loading/ui shadows, including `map-state.ts`, `url-state.ts`, `weather-ui.ts`, `loading-ui.ts`, `search-state.ts`, and related UI render paths. `search-results-ui.ts` later received the dedicated internal parity pass noted below.
   - **2026-06-08 update (lifecycle/semantic/thread slice):** Reduced to 9 drift pairs. Closed drift in `lifecycle.ts` (aligned imports with JS facade: added `lifecycle-modes`, `lifecycle-reset`, `lifecycle-search-sync` re-exports; removed stale `utils/timer-utils` import), `semantic-dive-ui.ts` (switched `getNextWalkCandidateForIndex` import from `journey-neighborhood` to `journey-lifecycle-adapter`; added `ensureDiveButton` import/call; aligned `semanticDive` inactive state and `inert` property access), `thread-inspector.ts` (removed `diagnostic-adapter` import/call; replaced raw `window.setTimeout` with `setTimer`/`disposeTimers`/`clearTimer` from strand-continuity; added missing `_dblclickListener`/`_keydownListener` cleanup). Removed `// @ts-nocheck` from 2 fully-typed files: `thread-inspector-adapter.ts`, `journey-webgl-utils.ts`. All pass `typecheck` (0 errors), `check:svelte` (0 errors), and `check:ts-progress` (9 drift pairs).
   - **2026-06-08 update (seeded-random drift slice):** Closed drift in `journey-compass-state.ts` (added `utils/seeded-random` import; replaced bare `Math.random()` idle pick with `seededUnit(pointsLength, 42)` + `_cachedIdleIndex`/`_cachedIdlePointsLength` cache, matching JS twin) and `journey-selected-card.ts` (added `utils/seeded-random` import; replaced `Math.random()` in `generateVectorLine` with `seededUnit(lineIdx * 6 + j, 'vector')`, matching JS twin). Both files retain `@ts-nocheck` due to other structural drift. Verified via `typecheck`, `check:svelte`, `check:ts-progress`.
   - **2026-06-08 update (audio/idb/search slice):** Reduced to **0 drift pairs**. Closed drift in `audio-scape.ts` (added `_audioRafId` RAF-tracking variable + `disposeAudio()` export matching JS), `idb-service.ts` (removed TS-only `TRANSACTION_TIMEOUT_MS` export — JS has no equivalent), `three-search-animations.ts` (added `seededUnit` import from `utils/seeded-random.js`; added `_heroRafId`, `_anchorGlowIndex`, `_anchorGlowRemaining`, `_anchorGlowLastFrame` state + `_corridorGlowTimers` Set + `ANCHOR_GLOW_PERSIST_MS`/`ANCHOR_GLOW_PERSIST_INTENSITY` constants; aligned `_corridorGlowNodes` from Map to plain object; added `disposeHeroAnimation()` export; aligned `triggerSearchHeroMoment` with RAF tracking + anchor glow arm; aligned `updateCorridorNodeGlow` with persistent anchor glow decay; aligned `triggerSearchCorridorAnimation` to use `state.scene` + `vDrawProgress` varying; aligned `buildCorridorLineGeometry` segment count/attribute naming; replaced `Math.random()` with `seededUnit()` in `buildCorridorParticleTrail`). The stale IDB timeout test assertion against the removed TS-only export was deleted; the test now verifies timeout behavior directly. Main-lane verification passes `typecheck`, `check:svelte`, `check:ts-progress`, and targeted `idb-service-timeout` Vitest.
2. Remove `// @ts-nocheck` one module at a time as each recovered shadow is made strict.
   - **2026-06-08 update (initial strictness slice):** 10 recovered shadows strict-checked without `// @ts-nocheck`: `app-svelte-island.ts`, `camera-controls-choreography.ts`, `camera-controls.ts`, `focus-stage-dom.ts`, `journey-webgl-utils.ts`, `micro-demo-camera.ts`, `micro-demo-guards.ts`, `micro-demo-ui.ts`, `micro-demo.ts`, and `thread-inspector-adapter.ts`. `micro-demo-choreography.ts` was returned to `@ts-nocheck` after `check:svelte` proved it is not strict-ready yet.
   - **2026-06-08 update (leaf/services strictness slice):** 32 recovered shadows now strict-check without `// @ts-nocheck`; 119 remain guarded. Added strict coverage for leaf utilities (`config.ts`, `design-tokens.ts`, `diagnostic-adapter.ts`, `environment.ts`, `event-bus.ts`, `chrome-timing.ts`, `utils/dom-builder.ts`, `utils/dom-formatters.ts`, `utils/focus-trap.ts`, `utils/geo-data.ts`, `utils/math-easing.ts`, `utils/seeded-random.ts`, `utils/timer-utils.ts`, `utils/ui-presentation.ts`) and service/UI helpers (`audio-scape.ts`, `idb-service.ts`, `resource-tracker.ts`, `role-label.ts`, `tooltip.ts`, `ui-feedback.ts`, `weather-ui.ts`, `weather.ts`). `loading-ui.ts`, `map-state.ts`, and `keyboard-help.ts` remain guarded until upstream state/module typing improves. Verified with `check:ts-progress`, `typecheck`, `check:svelte`, `lint`, `build`, and `build:svelte`.
   - **2026-06-08 update (pure/adapters strictness slice):** 37 recovered shadows now strict-check without `// @ts-nocheck`; 114 remain guarded. Added strict coverage for `semantic-search-mock-catalog.ts`, `view-models/search-results-view-model.ts`, `webgl-restore-adapter.ts`, `route-arrival-overlay-adapter.ts`, and `state-mutators.ts`. `search-tokenizer.ts` remains guarded because its TS shadow is missing the JS preprocessing pipeline (`Intl.Segmenter`, quote/ampersand/slash/hyphen normalization). `url-state.ts` remains guarded because `UrlStateOptions` is missing the live `deferred` option and strict Svelte checks expose broader call-site typing. Verified with `check:ts-progress`, `typecheck`, `check:svelte`, `lint`, `build`, and `build:svelte`.
   - **2026-06-08 update (focused repair slice):** 39 recovered shadows now strict-check without `// @ts-nocheck`; 112 remain guarded. Added strict coverage for `search-tokenizer.ts` by porting the JS preprocessing pipeline (`Intl.Segmenter`, quote stripping, ampersand/slash/hyphen/at/hash normalization, whitespace collapse) and for `url-state.ts` by typing the live `deferred` URL-restore option, deferred URL-state fields, history calls, weak selector boundaries, and event-bus payload reads. Also added the `_deferredUrlState` and `_deferredUrlStateHandler` runtime fields to `types/state.d.ts`. Verified with `check:ts-progress`, `typecheck`, `check:svelte`, `lint`, `build`, `build:svelte`, and the two tokenizer unit/parity suites.
   - **2026-06-08 update (search-results/state strictness slice):** 42 recovered shadows now strict-check without `// @ts-nocheck`; 109 remain guarded. Added strict coverage for `search-results-ui.ts` by restoring the legacy DOM rendering pipeline in the TS sibling while keeping Svelte store synchronization, for `loading-ui.ts` by typing the runtime-derived focused-node handoff, and for `keyboard-help.ts` after focused verification showed it passes both checker paths. `map-state.ts` was intentionally returned to `@ts-nocheck` because `check:svelte` exposed 65 structural state/DOM/Leaflet typing errors outside this slice. Verified with `typecheck`, `check:svelte`, `check:ts-progress`, `lint`, `build`, and `build:svelte`.
   - **2026-06-08 update (bindings/adapters strictness slice):** 59 recovered shadows now strict-check without `// @ts-nocheck`; 92 remain guarded. Added strict coverage for all 13 `js/modules/bindings/*.ts` files plus `scene-events.ts`, `inspected-strand-overlay-adapter.ts`, `exploration-mode.ts`, and `focus-panel-mode.ts`. Fixed the only strict-path issue by narrowing `document.activeElement` to `HTMLElement` before passing it into the legend focus helper. Added targeted DOM coverage for `search-results-ui.ts` covering deduped legacy rows, the show-more expansion path, and stale-row clearing. Verified with `typecheck`, `check:svelte`, `check:ts-progress`, targeted Vitest, `lint`, `build`, and `build:svelte`.
   - **2026-06-08 update (helper/adapter strictness slice):** 75 recovered shadows now strict-check without `// @ts-nocheck`; 76 remain guarded. Added strict coverage for `journey-text-helpers.ts`, `utils/data-schema.ts`, `utils/data-mapper.ts`, `relationship-roles.ts`, `semantic-guide-payload.ts`, `semantic-guide-payload-adapter.ts`, `connection-analysis-adapter.ts`, `cluster-ui-accent.ts`, `cluster-list-delegate.ts`, `search-trail-cue-renderer.ts`, `pathfinding.ts`, `search-filter-core.ts`, `search-panel-adapter.ts`, `map-flattening-layout.ts`, `focus-pocket-personality.ts`, and `journey-point-color.ts`. Local fixes covered no-unchecked indexed access in relationship role copy and thread lens copy, typed semantic guide search-summary payloads, narrow legacy-state adapter casts, and optional personality defaults. Verified with `typecheck`, `check:svelte`, `check:ts-progress`, targeted Vitest, `lint`, `build`, and `build:svelte`.
   - **2026-06-08 update (external-subagent wrapper strictness slice):** 80 recovered shadows now strict-check without `// @ts-nocheck`; 71 remain guarded. External-subagent worker removed guards from `island-mount-helper.ts`, `search-chrome-island.ts`, `filter-chrome-island.ts`, `ui-renderers.ts`, and `scene-reveal.ts`. Main-lane verification rejected the worker's initial `check:svelte` baseline claim, fixed `ui-renderers.ts` with explicit renderer-module function dispatch, and fixed `scene-reveal.ts` with the established legacy-state adapter cast. External read-only reports were also written to `tmp/ts-strictness-delegation/lifecycle-camera-report.md` and `tmp/ts-strictness-delegation/webgl-three-report.md`; they identify `camera-math-utils.ts`, `camera-framing-utils.ts`, `lifecycle-search-sync.ts`, `lifecycle-modes.ts`, `webgl-context.ts`, and `utils/three-textures.ts` as the next lowest-risk candidates, with `CameraLike`/`ControlsLike` and positioned-node state typing as the next unlocks. Verified with `typecheck`, `check:svelte`, `check:ts-progress`, targeted Vitest, `lint`, `build`, and `build:svelte`.
   - **2026-06-08 update (delegated camera/webgl strictness slice):** 86 recovered shadows now strict-check without `// @ts-nocheck`; 65 remain guarded. External-subagent workers removed guards from `camera-math-utils.ts`, `camera-framing-utils.ts`, `lifecycle-search-sync.ts`, `lifecycle-modes.ts`, `webgl-context.ts`, and `utils/three-textures.ts`. The lifecycle worker added local typings for `ModeOptions`, `PointLike`, stricter event callbacks, and self-contained state access in `lifecycle-search-sync.ts` because `check:svelte` does not load the `types/state.d.ts` module augmentation. The WebGL worker added narrow missing fields to `WebGLContextState` in `types/three-engine.d.ts` and typed `three-textures.ts` with `typeof import('three')` plus `CanvasTexture` returns while intentionally retaining the legacy `[key: string]: any` escape hatch until WebGL consumers are strictened. The read-only type-unlock audit was written to `tmp/ts-strictness-delegation/state-type-unlock-report.md`; it verifies that `nodePositions`, `targetPositions`, and `originalPositions` are runtime `{x,y,z}` arrays despite current `number[]` typing and proposes minimal `CameraLike`/`ControlsLike`/`RendererLike` unlocks. Verified with `typecheck`, `check:svelte`, `check:ts-progress`, targeted Vitest, `lint`, `build`, and `build:svelte`.
   - **2026-06-08 update (camera type-unlock strictness slice):** 89 recovered shadows now strict-check without `// @ts-nocheck`; 62 remain guarded. External-subagent workers handled the shared type-unlock and initial camera-core/restore edits, then the main lane canceled the still-running workers before overlapping edits and finished verification/fixes locally. Added exported `Vector3Like`, `NodePosition`, `CameraLike`, `ControlsLike`, `RendererInfoMemory`, `RendererInfo`, and `RendererLike` to `types/state.d.ts`; narrowed `SemanticState.camera`, `renderer`, `controls`, `nodePositions`, `targetPositions`, and `originalPositions`; and added missing `drawCalls`/`triangles` diagnostics fields. Removed guards from `camera-controls-core.ts`, `camera-controls-restore.ts`, and `camera-orbit-slack.ts`, using the established self-contained typed-state alias pattern because `check:svelte` resolves `../state.js` through the Svelte workspace instead of the ambient state declarations. Verified with `typecheck`, `check:svelte`, `check:ts-progress`, `camera-auto-rotate-settle-contract.mjs`, `camera-controls-motion-contract.mjs`, `lint`, `build`, and `build:svelte`.
   - **2026-06-08 update (camera cursor strictness slice):** 90 recovered shadows now strict-check without `// @ts-nocheck`; 61 remain guarded. Mimo worker removed the guard from `camera-controls-choreography-cursor.ts`; main-lane verification rejected its initial broad success claim, restored failed guard removals in `camera-controls-choreography-focus.ts` and `camera-controls-choreography-routes.ts`, then fixed cursor-specific strict errors with `Point[]` and `HTMLDetailsElement` casts. `camera-controls-choreography-focus.ts` and `camera-controls-choreography-routes.ts` remain guarded. Verified with `typecheck`, `check:svelte`, `check:ts-progress`, `camera-controls-motion-contract.mjs`, `lint`, and `build`.
3. Update `docs/ts-migration-readiness.md` so it matches the live tool output again.
4. Start retiring compatibility JS only after the corresponding TS shadow is drift-clean and strict-checking.

## Useful Commands

```powershell
npm run ts-readiness
npm run check:ts-progress
git ls-tree -r --name-only 753583b js/modules | rg "\.ts$"
git log --all --diff-filter=D --summary -- js/modules/*.ts js/modules/**/*.ts
```
