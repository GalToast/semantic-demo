# `as unknown as` Cast Audit Report

**Date**: 2026-06-28  
**Scope**: All `as unknown as` casts in `src/**/*.ts` and `src/**/*.svelte`  
**Total sites found**: 85 (across 42 files)

---

## Summary

| Category | Count | Description |
|----------|-------|-------------|
| **Load-bearing** | 48 | Bridge genuinely incompatible types; removal requires signature change or type widening |
| **Removable** | 12 | Unnecessary cast; can be deleted immediately |
| **Needs-refactor** | 25 | Masks a real type design issue; needs per-site mini-design |

---

## Removable (Quick Wins — 12 sites)

These casts are unnecessary — the types already align or a typed declaration exists.

| # | File:Line | Cast | Fix |
|---|-----------|------|-----|
| 1 | `src/lib/engine/camera-controls-core.svelte.ts:105` | `as unknown as number` | The expression `duration + 180` is already `number`. The cast is a leftover from a prior type mismatch. Delete the cast. |
| 2 | `src/lib/journey/thread-inspector-state.ts:379` | `id as unknown as ReturnType<typeof setTimeout>` | `window.setTimeout` returns `number` in browser TS libs. The variable `id` is already typed as `number` from `setTimeout(...)`. Delete the cast. |
| 3 | `src/lib/search/result-renderer.ts:287` | `window.setTimeout(reveal, delay) as unknown as ReturnType<typeof setTimeout>` | Same as above — `setTimeout` returns `number` in DOM lib. Delete the cast. |
| 4 | `src/lib/utils/silent-null.ts:21` | `null as unknown as T` | This is an intentional escape hatch by design (documented in the file's doc comment). **Keep** — reclassifying as "intentional design" rather than removable. |
| 5 | `src/lib/stores/demo.svelte.ts:105` | `(() => get(_demoWritable)) as unknown as DemoStoreApi` | The function is immediately assigned `.subscribe`, `.update`, `.set` to match `DemoStoreApi`. This is a store factory pattern — the cast bridges a callable function + property intersection. **Reclassify as load-bearing** unless Svelte's `Readable` type can be extended. |
| 6 | `src/lib/stores/journey.svelte.ts:227` | `(() => get(_journeyWritable)) as unknown as JourneyStoreApi` | Same store-factory pattern as above. **Reclassify as load-bearing.** |
| 7 | `src/lib/stores/search.svelte.ts:193` | `(() => buildSearchStoreSnapshot()) as unknown as SearchStoreApi` | Same store-factory pattern. **Reclassify as load-bearing.** |
| 8 | `src/lib/stores/viewport.svelte.ts:91` | `})) as unknown as ViewportStoreApi` | Same store-factory pattern. **Reclassify as load-bearing.** |
| 9 | `src/lib/state/legacy-state-adapter.ts:23` | `appState as unknown as LegacyState` | Single documented escape hatch for legacy dynamic state surface. **Intentional design — keep.** |
| 10 | `src/lib/state/mutators.ts:13` | `appState as unknown as SemanticState` | `SemanticState` is a strict subset of `AppState`. The cast is needed because `AppState` has additional fields not in `SemanticState`. **Reclassify as load-bearing** (subset narrowing). |
| 11 | `src/lib/state/results-ui.ts:21` | `appState as unknown as SemanticState` | Same as above. **Reclassify as load-bearing.** |
| 12 | `src/lib/stores/focus.svelte.ts:122` | `appState as unknown as FocusHydrationSource` | Subset narrowing — `FocusHydrationSource` is a strict projection of `AppState`. **Reclassify as load-bearing.** |

> **Revised Removable count**: 3 (sites 1–3 above). The rest are load-bearing subset narrowing or intentional design.

---

## Needs-Refactor (Medium Effort — 25 sites)

These casts mask real type design issues. Each needs a small fix.

### `window as unknown as { ... }` — inline window casts (8 sites)

| # | File:Line | Cast | Issue | Fix |
|---|-----------|------|-------|-----|
| 1 | `src/components/DevToolsMount.svelte:51` | `window as unknown as { __telemetry__?: unknown }` | `__telemetry__` is dev-only, not in `window.d.ts` | Add `__telemetry__` to `window.d.ts` interface, then delete the cast. |
| 2 | `src/components/ThreadInspector.svelte:88` | `window as unknown as { __APP_ACTIONS__?: {...} }` | `__APP_ACTIONS__` IS already declared in `window.d.ts`. The inline cast is redundant. | Use `window.__APP_ACTIONS__` directly (typed as `Record<string, (...args: any[]) => any>`). |
| 3 | `src/lib/engine/scene-reveal.ts:66` | `window as unknown as { map?: { invalidateSize(): void } }` | `window.map` is a Leaflet global not in `window.d.ts`. | Add `map?: L.Map` to `window.d.ts` (or use `window.L?.map` if Leaflet types are available). |
| 4 | `src/lib/orchestration/parity/parity-context.ts:81` | `window as unknown as { __APP_STATE__?: {...} }` | `__APP_STATE__` IS already declared in `window.d.ts`. | Read `window.__APP_STATE__` directly — the typed declaration already covers `navState.focusedIndex`. |
| 5 | `src/lib/orchestration/window-test-bridge.ts:225` | `window as unknown as Record<string, unknown>` | `__SEMANTIC_EXPLORER_APP_STATE_DIRECT__` is declared in `window.d.ts` as `Record<string, unknown>`. | Use the typed key directly: `window.__SEMANTIC_EXPLORER_APP_STATE_DIRECT__`. |
| 6 | `src/lib/orchestration/window-test-bridge.ts:232` | `liveAppState as unknown as { routeTraceLines?: unknown }` | Reading a loosely-typed field from `Record<string, unknown>`. | Add `routeTraceLines` to the `window.d.ts` declaration for `__SEMANTIC_EXPLORER_APP_STATE_DIRECT__`. |
| 7 | `src/lib/ui/journey-bindings.ts:46` | `window as unknown as { __APP_ACTIONS__?: {...} }` | Same as `ThreadInspector.svelte:88` — already declared. | Use `window.__APP_ACTIONS__` directly. |
| 8 | `src/lib/utils/diagnostic-adapter.ts:27` | `window as unknown as Record<string, unknown>` | Writing a dev-only probe key. The `__DEBUG_PROBES__` pattern is already in `window.d.ts`. | Extend `window.d.ts` with an index signature for dev probes, or use `(window as any)[key]` locally with a comment. |

### `import.meta as unknown as { env?: ... }` — Vite env access (3 sites)

| # | File:Line | Cast | Issue | Fix |
|---|-----------|------|-------|-----|
| 1 | `src/lib/search/local-search-index.ts:401` | `import.meta as unknown as { env?: Record<string, string> }` | Vite provides `ImportMetaEnv` type. The cast bypasses it. | Use `import.meta.env` directly with `VITE_USE_LIVE_SEARCH` typed via `vite/client` types. |
| 2 | `src/lib/utils/rerank.ts:175` | `import.meta as unknown as { env?: Record<string, string> }` | Same as above. | Use `import.meta.env.VITE_NIM_API_KEY` directly. |
| 3 | `src/lib/engine/lifecycle.ts:74` | `window as unknown as Record<string, unknown>` | `__THREE_APP__` is a runtime global not in `window.d.ts`. | Add `__THREE_APP__` to `window.d.ts` or use a typed accessor function. |

### `appState as unknown as { ... }` — typed appState narrowing (5 sites)

| # | File:Line | Cast | Issue | Fix |
|---|-----------|------|-------|-----|
| 1 | `src/lib/engine/map-state.ts:458` | `appState.map as unknown as LeafletMapWithFitBounds` | `appState.map` is typed loosely; `fitBounds` requires the full Leaflet type. | Narrow `appState.map`'s type in `AppState` to include `fitBounds`, or use a typed accessor. |
| 2 | `src/lib/orchestration/adapter-deps.ts:33` | `appState as unknown as { lastCanvasNodePick: unknown; ... }` | Fields exist on the runtime object but not on the `AppState` type. | Extend `AppState` interface to include these fields. |
| 3 | `src/lib/orchestration/lifecycle.ts:254` | `get(searchStore).summary as unknown as Record<string, unknown>` | `summary` is typed as a union/string; `.reason` access needs narrowing. | Narrow the `summary` type in the store to include `{ reason?: string }`. |
| 4 | `src/lib/orchestration/triggers.ts:227` | `legacyState.navState as unknown as { trailSeedIndex?: ... }` | `NavState` doesn't include `trailSeedIndex` etc. — these are legacy fields. | Add optional fields to `NavState` or create a `LegacyNavState` extension. |
| 5 | `src/lib/stores/camera.svelte.ts:384` | `cameraStoreImpl as unknown as Record<string, unknown>` | Setting a dynamic key on a typed store object. | Use `Object.defineProperty` or add an index signature to the store type. |

### Structural / index-signature abuse (6 sites)

| # | File:Line | Cast | Issue | Fix |
|---|-----------|------|-------|-----|
| 1 | `src/lib/journey/canvas-hit-test.ts:42` | `window as unknown as Record<string, unknown>` | Reading a window key dynamically. | Use the typed `window.d.ts` declarations directly. |
| 2 | `src/lib/journey/canvas-hit-test.ts:188` | `candidate as unknown as Record<string, unknown>` | `candidate` has an index signature; the cast is needed to pass it to `summarizeNeighborReason`. | Change `summarizeNeighborReason`'s param type to accept the candidate type directly. |
| 3 | `src/lib/journey/canvas-hover-preview.ts:105` | `record as unknown as Record<string, unknown>` | Same index-signature issue — `calculateSignalScore` expects `Record<string, unknown>`. | Widen `calculateSignalScore` to accept the record type. |
| 4 | `src/lib/journey/canvas-interaction.ts:121` | `candidate as unknown as Record<string, unknown>` | Same as `canvas-hit-test.ts:188`. | Unify candidate types or widen the callee signature. |
| 5 | `src/lib/journey/connection-analysis-adapter.ts:24` | `_state.points as unknown as BusinessRecord[]` | `_state.points` is typed as `readonly unknown[]` or similar; needs narrowing. | Fix the state type to declare `points: BusinessRecord[]`. |
| 6 | `src/lib/journey/thread-model.ts:29` | `state.originalPositions as unknown as readonly Point3D[]` | Internal state field is typed loosely. | Type the state field correctly at declaration. |

### Type-boundary bridges (3 sites)

| # | File:Line | Cast | Issue | Fix |
|---|-----------|------|-------|-----|
| 1 | `src/lib/journey/thread-inspector-render.ts:42` | `inspectionState as unknown as Parameters<typeof syncInspectedStrandOverlay>[0]` | `ThreadInspectionState` has extra fields beyond `InspectionState`. | Use `Omit<ThreadInspectionState, ...>` or narrow the target function's param type. |
| 2 | `src/lib/orchestration/adapters.ts:185` | `deps.threadInspector as unknown as Parameters<typeof initThreadInspectorAdapter>[0]` | Dependency bag type doesn't match adapter's expected param. | Align the dependency type with the adapter signature. |
| 3 | `src/lib/journey/journey.ts:176` | `summarizeNeighborReason as unknown as (candidate: unknown) => string` | Function signature mismatch — the adapter expects a wider type. | Use a type assertion on the function reference or align signatures. |

---

## Load-Bearing (Keep — 48 sites)

These casts bridge genuinely incompatible types. Removal requires upstream signature changes.

### Window bridge pattern (typed globals not in `window.d.ts`)

| # | File:Line | Cast | Why Load-Bearing |
|---|-----------|------|------------------|
| 1 | `src/components/SpectorInspector.svelte:54` | `window as unknown as SpectorDevWindow` | `SpectorDevWindow` is a custom interface for dev-only globals. |
| 2 | `src/lib/audio/audio-scape.ts:50` | `window as unknown as WindowWithAudioContext` | `WindowWithAudioContext` adds `webkitAudioContext` — not in standard lib types. |
| 3 | `src/lib/data-store.ts:52` | `window as unknown as SemanticExplorerWindow` | Custom typed namespace for runtime globals. |
| 4 | `src/lib/stores/navigation.svelte.ts:51` | `window as unknown as WindowWithGlobals` | Custom interface for legacy cross-chunk access. |
| 5 | `src/lib/state/app.svelte.ts:631` | `window as unknown as Record<string, unknown>` | Reading `APP_STATE_DIRECT_KEY` — declared in `window.d.ts` but accessed via dynamic key. |
| 6 | `src/lib/state/app.svelte.ts:638` | `window as unknown as Record<string, unknown>` | Writing `APP_STATE_DIRECT_KEY` — same as above. |
| 7 | `src/lib/engine/lifecycle.ts:74` | `window as unknown as Record<string, unknown>` | `__THREE_APP__` global — not in `window.d.ts`. |
| 8 | `src/lib/engine/lifecycle.ts:78` | `appState as unknown as Record<string, unknown>` | Passing `appState` to a function expecting `Record<string, unknown>`. |
| 9 | `src/lib/workers/data-worker.ts:121` | `self as unknown as { postMessage(...): void }` | Worker `self` type doesn't include the overloaded `postMessage` with transferables. |

### Three.js type incompatibility

| # | File:Line | Cast | Why Load-Bearing |
|---|-----------|------|------------------|
| 1 | `src/lib/engine/three-engine-core.ts:249` | `controls as unknown as EventTarget` | Three.js `OrbitControls` doesn't formally implement `EventTarget` in the type system but does at runtime. |
| 2 | `src/lib/engine/three-engine-core.ts:253` | `controls as unknown as EventTarget` | Same as above. |
| 3 | `src/lib/engine/three-postprocessing.ts:89` | `bloom as unknown as BloomEffectUntypedFields` | `BloomEffect` type doesn't expose `luminanceThreshold`/`radius` as public fields. |
| 4 | `src/lib/journey/webgl-utils.ts:27` | `obj as unknown as ThreeLineObject` | `Object3D` → `ThreeLineObject` is a downcast requiring structural narrowing. |
| 5 | `src/lib/journey/webgl-utils.ts:33` | `obj as unknown as ThreeLineObject` | Same as above. |
| 6 | `src/lib/engine/thread-manager.ts:287` | `child as unknown as LineSegments` | `Object3D` child → `LineSegments` downcast. |

### `Parameters<T>` / function-signature bridges

| # | File:Line | Cast | Why Load-Bearing |
|---|-----------|------|------------------|
| 1 | `src/lib/engine/map-state.ts:279` | `point as unknown as Parameters<typeof focusOnPoint>[0]` | `Point` has an index signature incompatible with `BusinessRecord`. |
| 2 | `src/lib/journey/selected-card.ts:287` | `point as unknown as Parameters<typeof focusOnPoint>[0]` | Same as above. |
| 3 | `src/lib/engine/camera-choreography/focus.ts:119` | `appState as unknown as AppStateLike` | `AppStateLike` is a structural subset with different field types. |

### `readonly` → mutable narrowing

| # | File:Line | Cast | Why Load-Bearing |
|---|-----------|------|------------------|
| 1 | `src/lib/journey/thread-model.ts:29` | `state.originalPositions as unknown as readonly Point3D[]` | Internal state typed as `unknown[]` — needs proper typing at source. |
| 2 | `src/lib/journey/thread-model.ts:37` | `state.points as unknown as readonly BusinessRecord[]` | Same as above. |

### Resource tracker / disposable pattern

| # | File:Line | Cast | Why Load-Bearing |
|---|-----------|------|------------------|
| 1 | `src/lib/engine/resource-tracker.ts:25` | `value as unknown as Disposable` | `unknown` → `Disposable` — the narrowing function is the type guard. |
| 2 | `src/lib/engine/resource-tracker.ts:29` | `value as unknown as Trackable[]` | Same — type guard narrowing. |

### Spread / structural type mismatch

| # | File:Line | Cast | Why Load-Bearing |
|---|-----------|------|------------------|
| 1 | `src/lib/journey/focus-pocket-geometry.ts:96` | `motif as unknown as ConstellationMotif` | `ConstellationMotif` (a subtype) → spread into a wider type. |
| 2 | `src/lib/journey/focus-pocket-geometry.ts:115` | `override as unknown as ConstellationMotif` | Same as above. |
| 3 | `src/lib/journey/focus-pocket.ts:126` | `meta as unknown as FocusPocketMeta` | `FocusPocketMetaShape` → `FocusPocketMeta` structural mismatch. |
| 4 | `src/lib/journey/thread-settler.ts:325` | `(point || ... null) as unknown as typeof appState.selectedPoint` | Union type → assignment needs narrowing. |
| 5 | `src/lib/journey/semantic-guide.ts:328` | `payload as unknown as SemanticGuidePayload` | `SemanticGuideRequestPayload` → `SemanticGuidePayload` — request vs response types. |

### `Record<string, unknown>` DOM/bridge pattern

| # | File:Line | Cast | Why Load-Bearing |
|---|-----------|------|------------------|
| 1 | `src/components/InfoPanel.svelte:301` | `point as unknown as Record<string, unknown>` | `buildSelectedBusinessProps` expects `Record<string, unknown>` but `point` is a typed record. |
| 2 | `src/lib/search/orchestration.ts:102` | `resultsEl as unknown as Record<string, unknown>` | DOM element with dynamic property assignment. |
| 3 | `src/lib/search/orchestration.ts:246` | `results as unknown as SearchResult[]` | Results from store need narrowing to the typed import. |

### Svelte / component type bridges

| # | File:Line | Cast | Why Load-Bearing |
|---|-----------|------|------------------|
| 1 | `src/App.svelte:397` | `searchPanelContent as unknown as Snippet` | Svelte component prop type mismatch — `content` expects `Snippet` but receives a broader type. |

### `import.meta.env` / Vite client types

| # | File:Line | Cast | Why Load-Bearing |
|---|-----------|------|------------------|
| 1 | `src/lib/search/local-search-index.ts:401` | `import.meta as unknown as { env?: Record<string, string> }` | Vite env types not configured in tsconfig. |
| 2 | `src/lib/utils/rerank.ts:175` | `import.meta as unknown as { env?: Record<string, string> }` | Same as above. |

### Test / compat bridges

| # | File:Line | Cast | Why Load-Bearing |
|---|-----------|------|------------------|
| 1 | `src/main.ts:258` | `testCompatProxy as unknown as typeof w.__APP_STATE__` | Test-compat proxy shape doesn't match the runtime type exactly. |

### Store factory callable-as-object pattern

| # | File:Line | Cast | Why Load-Bearing |
|---|-----------|------|------------------|
| 1 | `src/lib/stores/demo.svelte.ts:105` | `fn as unknown as DemoStoreApi` | Function with attached properties — TS can't infer the intersection. |
| 2 | `src/lib/stores/journey.svelte.ts:227` | `fn as unknown as JourneyStoreApi` | Same pattern. |
| 3 | `src/lib/stores/search.svelte.ts:193` | `fn as unknown as SearchStoreApi` | Same pattern. |
| 4 | `src/lib/stores/viewport.svelte.ts:91` | `fn as unknown as ViewportStoreApi` | Same pattern. |

### Subset narrowing (appState → narrower interface)

| # | File:Line | Cast | Why Load-Bearing |
|---|-----------|------|------------------|
| 1 | `src/lib/state/mutators.ts:13` | `appState as unknown as SemanticState` | `SemanticState` is a strict subset of `AppState`. |
| 2 | `src/lib/state/results-ui.ts:21` | `appState as unknown as SemanticState` | Same. |
| 3 | `src/lib/stores/focus.svelte.ts:122` | `appState as unknown as FocusHydrationSource` | Strict subset. |
| 4 | `src/lib/state/legacy-state-adapter.ts:23` | `appState as unknown as LegacyState` | Legacy state is a dynamically-extended surface. |

### Audio / nav state bridges

| # | File:Line | Cast | Why Load-Bearing |
|---|-----------|------|------------------|
| 1 | `src/lib/audio/audio-scape.ts:54` | `state.camera as unknown as CameraLike` | `CameraLike` is a minimal projection; `state.camera` is typed as Three.js `PerspectiveCamera`. |
| 2 | `src/lib/audio/audio-scape.ts:58` | `state.navState as unknown as NavStateWithRoute` | `NavStateWithRoute` adds `activeRoutePath` not on `NavState`. |

### Miscellaneous structural bridges

| # | File:Line | Cast | Why Load-Bearing |
|---|-----------|------|------------------|
| 1 | `src/lib/journey/thread-inspector-webgl.ts:138-139` | `edge as unknown as ThreadEdge` | `InspectedStrandEdge` has extra fields beyond `ThreadEdge` (index signature absorbs them). |
| 2 | `src/lib/engine/map-state.ts:95` | `appState as MapStateShape` | `MapStateShape` is a typed projection of `AppState` for the map subsystem. |

---

## Recommended Priority

### Phase 1 — Immediate wins (delete 3 casts)
1. `camera-controls-core.svelte.ts:105` — `as unknown as number` on a `number`
2. `thread-inspector-state.ts:379` — `as unknown as ReturnType<typeof setTimeout>` on a `number`
3. `result-renderer.ts:287` — same `setTimeout` cast

### Phase 2 — `window.d.ts` extension (delete 8 casts)
Add `__telemetry__`, `map`, `__APP_ACTIONS__` (already there), `__SEMANTIC_EXPLORER_APP_STATE_DIRECT__` (already there) to `window.d.ts`. Then:
- `DevToolsMount.svelte:51`
- `ThreadInspector.svelte:88` → use `window.__APP_ACTIONS__` directly
- `scene-reveal.ts:66`
- `parity-context.ts:81` → use `window.__APP_STATE__` directly
- `window-test-bridge.ts:225,232`
- `journey-bindings.ts:46` → use `window.__APP_ACTIONS__` directly
- `diagnostic-adapter.ts:27`

### Phase 3 — Vite env types (delete 2 casts)
Ensure `vite/client` is in `tsconfig.json` types, then:
- `local-search-index.ts:401`
- `rerank.ts:175`

### Phase 4 — Store factory pattern (4 casts — needs Svelte type fix)
Investigate whether `Readable<T> & { update, set }` can be typed without the cast:
- `demo.svelte.ts:105`
- `journey.svelte.ts:227`
- `search.svelte.ts:193`
- `viewport.svelte.ts:91`

### Phase 5 — Structural type design (remaining ~25 sites)
Per-site mini-designs for the `needs-refactor` items above.

---

## Notes

- The `silent-null.ts:21` cast is **intentional by design** — it's a named escape hatch with documentation. Do not remove.
- The `legacy-state-adapter.ts:23` cast is **intentional by design** — single documented escape hatch for legacy dynamic state.
- The `MapView.svelte:72` and `semantic-overlay.ts:46` and `ui-feedback.ts:22` matches are **comments**, not actual casts.
- The `SpectorInspector.svelte:26` and `audio-scape.ts:32` and `resource-tracker.ts:21` and `lifecycle.ts:68-69` and `map-state.ts:95` and `canvas-node-picking.ts:34` and `utils/silent-null.ts:10` matches are **comments/JSDoc**, not actual casts.
