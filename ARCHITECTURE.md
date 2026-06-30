# Semantic Explorer — Architecture

The Semantic Explorer is a browser-based WebGL/DOM application that visualizes 8,406 local business records in a semantic space. It is a Svelte 5 single-page app with a Three.js engine kernel, a typed Svelte state class, and a worker that parses precomputed semantic-thread artifacts at boot.

This document describes the **current** architecture, refreshed 2026-06-29 to retire references to the legacy `js/modules/*` runtime that was removed during the W47/W48 migration arc. For migration history see `docs/migration-plan.md`; for engine-area writes see `docs/engine-boundary-refactor-plan.md`; for state-class typing see `docs/typing-contract.md`.

---

## Top-Level Layout

```
semantic-explorer/
├── index.html                    Repo-root preview front-door (NOT the app shell).
├── case-study.html               Narrative portfolio wrapper; mirrors the app shell.
├── docs/                         Living design + engineering documentation.
│   ├── migration-plan.md         Source of truth on migration state.
│   ├── typing-contract.md        Source of truth on `as any` budget.
│   ├── engine-boundary-refactor-plan.md  Engine boundary tightening plan (W48).
│   ├── surface-style-matrix.md   Per-surface CSS ownership.
│   ├── state-transition-table.md Phase machine contract.
│   ├── design-tokens.md          Token vocabulary.
│   └── archive/                  Frozen historical references (do not edit).
├── css/                          Modular CSS, loaded through `semantic-demo.css`.
├── src/                          Single-page Svelte + Three.js application.
│   ├── main.ts                   Vite entry; initializes URL/demo flags + mounts App.
│   ├── App.svelte                Root composition; body parity attrs; lazy child mounts.
│   ├── components/               39 Svelte component files (UI surface + dev tooling).
│   └── lib/                      All engineering modules (engine, state, stores, …).
├── public/                       Static assets (fonts, icons).
├── types/                        Shared TS declaration files.
├── tests/                        430 test files (spec.js + .contract.mjs + .test.ts).
├── deploy.sh / deploy.ps1        Standalone deploy scripts (uncoupled 2026-06-19).
└── dist/svelte/                  Build output: the production app shell.
```

---

## One App Shell

The production app shell is `dist/svelte/index.html`, built from `src/main.ts` by Vite. Deploy publishes this shell to the live routes (`/semantic-demo/index.html` and `/semantic-demo/vector-explorer-polished.html`). `src/App.svelte` is the root composition that mounts the body parity attrs and the lazy-loaded surface components.

The repo-root `index.html` is a routing/front-door page only. It may link into the explorer but must never include canvas DOM, `dist/svelte/`, `semantic-demo.css`, or the Semantic API behavior. Run `npm run build && npm run check:shell` before deploy or shell-level edits. The deploy scripts build first, then call this guard before uploading.

---

## Runtime Modules

### Entry & Composition

- **`src/main.ts`** — Vite entry. Initializes URL state, reads `?demo=force` flags, and mounts the Svelte app.
- **`src/App.svelte`** — Root component. Imports ~30 modules, declares 7 `createLazyComponent()` handles (Canvas, InfoPanel, MapView, FocusPocket, ThreadInspector, DemoChoreography, FocusCard, WeatherWidget) and mounts each via `$effect` once preconditions resolve. Wraps the whole tree in App boot logic plus the body-attribute parity bridge (`useParityAttrs`) and the Svelte viewport store. Dev-only components (`DevGui`, `DevTelemetry`, `DevToolsMount`, `SpectorInspector`) go behind `import.meta.env.DEV` so they stay out of prod builds.
- **`src/components/Canvas.svelte`** — Owns WebGL canvas lifecycle (mount → engine.init → render → dispose).
- **`src/components/AppBoot.svelte`** — Boot sequence wrapper that coordinates initial state hydration.

### State and Stores (`src/lib/state/`, `src/lib/stores/`)

- **`src/lib/state/app.svelte.ts`** — **Single source of truth.** Svelte 5 state class. All `$state<...>` declarations for the entire app; consumers read/mutate via `appState` directly. ~733 LOC. Engine-surface fields that mutate at runtime (Three.js objects, WebGL buffers) use `unknown` or `as unknown as` casts; the budget is enforced at 5 occurrences across 43 files (per `docs/typing-contract.md`).
- **`src/lib/state/state-types.ts`** — Type vocabulary: `NavState`, `ActiveFilters`, `ViewName`, `Point[]`, `DemoPhase`, `SearchSummary`, etc. 930 LOC. May be broken up into per-domain type files in a future refactor.
- **`src/lib/state/legacy-state.{ts,adapter.ts}`** — **Compat shims** (kept deliberately). `legacy-state.ts` exports 6 shared state readers (current ownership lives with `three-engine-{core,state,store-sync,helpers,frame-updates}.ts`). `legacy-state-adapter.ts` (23 LOC) typenarrows `legacyState.*` reads via `unknown` so consumers don't have to do `appState as any`. 9 importers each. Both are durable compat seams, **not** part of the bridge-retirement arc — see `docs/migration-plan.md` § "Compat shims".
- **`src/lib/state/{create-state-mirror,mutators,with-state-mutation,state-validation,session.svelte}.ts`** — Mirror discipline, mutator helpers, validation, persistence.
- **`src/lib/stores/*.svelte.ts`** — 16 typed Svelte 5 store modules (focus, navigation, viewport, search, keyboard, engine-ready, scene-ready, demo, legend, lifecycle, journey, etc.). Stores prefer narrow typed views over the global state class; each module exports `getX()` / `setX(...)` companions for the parity-mirror contract (`tests/unit-active/as-any-budget.test.ts` enforces budget; `parity-attrs.svelte.ts` enforces attribute discipline).

### Engine Kernel (`src/lib/engine/`)

- **`src/lib/engine/three-engine.ts`** — Render loop, scene lifecycle, GPU resource tracking. RAF + resource disposal. **Off-limits write surface** per `docs/migration-plan.md` § "High-Risk Surfaces". Disposal audit required for any material/texture change.
- **`src/lib/engine/three-engine-core.ts`** — Scene graph, instanced mesh updates, point manager.
- **`src/lib/engine/three-engine-state.ts`, `three-store-sync.ts`, `three-engine-helpers.ts`, `three-engine-frame-updates.ts`, `three-engine-init-helpers.ts`, `three-engine-mycelium.ts`, `three-engine-search.ts`, `three-engine-timers.ts`** — Cross-cutting engine concerns decomposed from the original monolithic engine file.
- **`src/lib/engine/three-{search-animations,interaction-visuals,postprocessing,pp-init,lens-*}.ts`** — Visual effects (search-result animations, postprocessing pipeline, lens stack: anchor-bloom, filaments, focusgeo, glow-spoke, halos, motes, petals).
- **`src/lib/engine/three-listener-registration.ts`** — Pointer/click/wheel listener fan-out (lifecycle-managed).
- **`src/lib/engine/{camera-controls.ts, camera-controls-core.ts, camera-controls-core.svelte.ts, camera-controls-restore.svelte.ts, camera-controls.ts, camera-choreography/*, }`** — Camera orbit, framing, restore, transition choreography.
- **`src/lib/engine/{node-manager, thread-manager, map-state, resource-tracker, scene-reveal, mycelium-engine}.ts`** — Per-frame-data buffer managers, thread/mycelium index management.
- **`src/lib/engine/{lifecycle, config, webgl-context, renderer/*}.ts`** — Engine lifecycle, configuration, WebGL context handling, palette renderer.

### Journey and Focus Layer (`src/lib/journey/`, `src/lib/focus/`)

- **`src/lib/journey/journey.ts`** — Journey orchestration layer: thread walk, neighbor timers, trail seed, route index. **Off-limits write surface**; touch only with explicit lead approval.
- **`src/lib/journey/focus-pocket.ts`, `focus-pocket-geometry.ts`, `focus-pocket-personality.ts`** — Focus-pocket data structures and Three.js geometry. (`getPointBoundsCenter` was historically cited here but actually lives in `src/lib/engine/node-manager.ts:202` — its `positionBuffer` parameter is now a TypeScript-enforced required `Float32Array`; passing only points would be a compile error.)
- **`src/lib/journey/{focus-ui, focus-anchor-indicator, focus-stage-dom, selected-card, semantic-overlay, semantic-dive, semantic-guide, semantic-guide-payload, semantic-guide-payload-adapter, route-trace, route-arrival-overlay-adapter, search-trail-cue-renderer, neighborhood, neighborhood-manifest, neighborhood-helpers, point-color, text-helpers}.ts`** — Journey UI and rendering helpers.
- **`src/lib/journey/{thread-inspector, thread-inspector-{state,render,adapter}, thread-settler-adapter}.ts`** — Thread inspector UI; near off-limits; coordinate before edit.
- **`src/lib/journey/{connection-analysis, connection-analysis-adapter, inspected-strand-overlay-adapter, lifecycle-adapter, compass-state, canvas-{hover, hit-test, interaction, hover-preview, node-picking}, legend-ui}.ts`** — Adapter cycle-breakers (see "Two Patterns" below).
- **`src/lib/focus/`** — Focus-card domain modules separate from journey orchestration.

### Orchestration (`src/lib/orchestration/`)

- **`src/lib/orchestration/app-init.ts`** — App initialization orchestrator replacing the legacy `js/modules/app.ts`. Sequence-sensitive (10-step init). Touch only after a visual regression pass.
- **`src/lib/orchestration/lifecycle.ts`** — App orchestration, view handoff, window bindings, scene-reveal logic. 425 lines. Many no-op stubs for the legacy bridge compat path; **do not remove stubs until the adapter retirement phase** coordinated parity-attr discipline allows.
- **`src/lib/orchestration/{url-state, view-controller, compass-controller, semantic-lane, parity-attrs.svelte, parity/parity-context, parity/parity-resolvers, adapters, adapter-deps, window-actions, cluster-filter-controller, triggers, responsive-renderer, event-bus}.ts(.svelte.ts)`** — Body URL sync, view controller, journey compass, parity (body dataset bridge), cycle-breaking adapters, event bus, triggers.
- **`src/lib/orchestration/{focus-pocket, focus-pocket-geometry, legacy-state-adapter, three-engine-state, three-micro-demo-bridge}.ts`** — Engine-aware orchestration helpers and compat seams.

### Worker (`src/lib/workers/`)

- **`src/lib/workers/data-worker.ts`** — Worker runtime: parses precomputed semantic-thread artifacts (`semantic_threads*.dat`) on a dedicated thread.
- **`src/lib/workers/data-worker-url.ts`** — Centralizes the Vite `?worker&url` import boundary. Other modules import this URL constant rather than re-doing the URL import themselves.

### Search (`src/lib/search/`, `src/lib/search-engine.ts`, `src/lib/search-cache.ts`)

API search + local fallback + tokenization + reranking + caching. Graceful degradation: if the live Semantic API fails, the search pipeline falls back to deterministic local artifacts (lifecycle.ts coordinates this).

### Utilities (`src/lib/utils/`)

`seeded-random`, `diagnostics`, `design-tokens` (CSS mirrors in JS), `DOM helpers`, `math`, `WebGL restore`, `relationship roles`, `lazy-component.svelte`, `timers` (recent centralization), `debug`, plus common type helpers. `seededUnit` from `@lib/utils/seeded-random` is the canonical random helper for any position-dependent geometry (the W7-B Pair 2 prep preserved the unit-cube invariant through this re-export).

### Data

- **`src/lib/data-store.ts`** — Business records + semantic thread accessors. ~21 KB.
- **`src/lib/data-store.svelte.ts`** — Svelte 5 reactive wrapper around the data store.
- **`src/lib/data-loader.ts`** — Boot-time data pipeline; main-thread fallback path when the worker isn't initialized. ~23 KB.
- **`src/lib/semantic-threads.ts`** — Semantic-thread artifact accessors. ~28 KB. Lives at `src/lib/` root pending a future rename to `src/lib/engine/semantic-threads.ts` (Step 3 cleanup plan).

---

## Key Architecture Patterns

### 1. State Synchronization

The single source of truth is `appState` in `src/lib/state/app.svelte.ts`. Svelte 5 runes handle UI mirroring; engine-side concerns write through `withStateMutation(...)` from `src/lib/state/with-state-mutation.ts`. Body-attribute parity (e.g., `data-active-view`, `data-graph-context`, `data-semantic-dive`) is **separately** synchronized through `parity-attrs.svelte.ts`, which is the only module authorized to write to `document.body.dataset` for parity-bridged attrs. Components read parity through `useParityAttrs()` in `src/lib/ui/use-parity-attrs.svelte`.

### 2. Dataset-Driven CSS

`document.body.dataset` attributes (`data-active-view`, `data-graph-context`, `data-semantic-dive`, `data-journey-phase`, `data-loaded`, `data-demo-active`, etc.) drive the entire CSS animation/layer system without per-element JS. CSS modules under `css/` (24 files, ~16 KB raw / ~10 KB gzip split between desktop and `mobile_premium__*` mobile families) read these dataset attributes directly. The `mobile_premium__*` family is governed by the archived CSS authority map at `docs/archive/semantic-demo-css-authority-map.md` (do not edit the mobile family without consulting it).

### 3. Graceful Degradation

If the live Semantic API fails, `src/lib/orchestration/lifecycle.ts` catches the failure and falls back to deterministic local artifacts, keeping the visual demo alive. The data flow goes: worker parses `semantic_threads*.dat` → `data-store.svelte.ts` exposes typed accessors → `appState` reads from the store → Svelte components react. The fallback path keeps the worker main-thread fallback in `data-loader.ts` so even a worker init failure doesn't break the app.

### 4. Handoffs

The transition between 3D `galaxy` and 2D `map` view is choreographed by `view-controller.ts` (with helpers in `lifecycle.ts`). The view-mode dataset attribute (`data-active-view`) is owned by `parity-attrs.svelte.ts`, which runs a `MutationObserver` to detect external writes and sync them into the runtime. Camera choreography lives in `src/lib/engine/camera-choreography/*`.

---

## Two Patterns for Module Communication

The app uses two communication mechanisms. Both are intentional; do not "unify" them by deleting one.

- **Event bus (`src/lib/orchestration/event-bus.ts`)** — for cross-cutting notifications where one module publishes an event and many subscribers react. The pattern is `publish(EVENTS.X, payload)` from the producer, `subscribe(EVENTS.X, handler)` or `subscribeKeyed(...)` from the consumer. Migrating toward typed payloads via `src/lib/types/events.ts` (`replaces the stringly-typed event-bus with compile-time checked payloads`). Used for: URL sync, search state changes, focus transitions, semantic lane state, tooltip/composition updates.

- **Adapters (`src/lib/journey/*-adapter.ts`, `src/lib/orchestration/adapters.ts`)** — for breaking module-to-module circular dependencies. Each adapter holds module-private closure state for dependency functions, injected at app init via `init*Adapter(deps)` or via the `adapter-deps.ts` wiring. Consumers import the adapter module and call `adapter.foo()` (or destructured `adapter_foo()`); the adapter delegates to the injected implementation with a safe no-op fallback. The current production adapter inventory is 7 journey adapters (`connection-analysis-adapter`, `inspected-strand-overlay-adapter`, `lifecycle-adapter`, `route-arrival-overlay-adapter`, `semantic-guide-payload-adapter`, `thread-inspector-adapter`, `thread-settler-adapter`) plus one orchestration-side (`src/lib/orchestration/adapters.ts`). The cycle each adapter breaks is documented in the adapter's header comment.

The `docs/legacy-reference/` archive contains snapshots of the legacy dewindowing adapters that were retired by 2026-05. The current 8–10 adapters are unrelated to dewindowing — they serve the cycle-breaking role above.

---

## Forward References

For the layered details:

- **Runtime state machine** — `docs/semantic-demo-state-transition-table.md` (next-pass rewrite needed; current doc still cites pre-W47 line numbers).
- **Per-surface CSS ownership** — `docs/semantic-demo-surface-style-matrix.md` and the archived authority map at `docs/archive/semantic-demo-css-authority-map.md`.
- **State typing budget** — `docs/typing-contract.md`.
- **Engine writes & state-class tightening** — `docs/engine-boundary-refactor-plan.md`.
- **Migration arc** — `docs/migration-plan.md` (refreshed 2026-06-29).
- **Session coordination / parallel sessions** — `docs/session-coordination.md`.

---

_Last refreshed 2026-06-29 as part of the docs-rot sweep. Maintained alongside the lifecycle of `src/lib/state/app.svelte.ts` and the engine-boundary refactor plan._
