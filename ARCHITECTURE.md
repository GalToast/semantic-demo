# McCullough Cloud: Semantic Demo Architecture

The Semantic Explorer is a highly polished, browser-based WebGL/DOM application that visualizes 8,406 local business records in a semantic space. It relies on a carefully orchestrated architecture separating the data layer, WebGL visualization, and DOM-based UI state.

## Directory Structure
```
semantic-demo/
├── index.html                    # Built Svelte/Vite production shell
├── vector-explorer-polished.html # Back-compat URL; deployed from the same Svelte build output
├── case-study.html               # The narrative wrapper and portfolio presentation
├── semantic-demo.css             # Import sheet only; loads the CSS modules
├── vector-explorer-pandora.css   # Separate Pandora experiment stylesheet
├── css/                          # Extracted CSS modules loaded through semantic-demo.css
├── assets/                       # Vite content-hashed JS/CSS chunks
├── css/                          # Copied CSS modules loaded by the built shell
├── data.dat*                     # Semantic corpus artifacts
└── semantic_threads*.dat         # Semantic relationship artifacts
```

## One App Shell Contract

The production app shell is `src/index.html`, built by Vite to `dist/svelte/index.html`. Deploy publishes that built shell to both live routes:

- `/semantic-demo/index.html`
- `/semantic-demo/vector-explorer-polished.html`

The repo-root `vector-explorer-polished.html` is a legacy reference/rollback shell only. It still loads `dist/bundle.js` by design, but it is not the production runtime entry and should not be used for production QA. `semantic-demo.css` is the import sheet for cache-busted modules under `css/`; `vector-explorer-pandora.css` is a separate top-level stylesheet linked by the Svelte shell. Both top-level stylesheets and the `css/` module directory are part of the deploy payload.

The repo-root `index.html` is not an app shell. It is a routing/front-door page for the repository preview and may link to the explorer, but it must not include canvas DOM, `dist/bundle.js`, `semantic-demo.css`, or Semantic API behavior.

Run `npm run build` and `npm run check:shell` before deploy or shell-level edits. The deploy scripts build first, then call this guard before uploading.

## Runtime Modules (Svelte Shell + Legacy Engine Bridge)

The production runtime starts in `src/main.ts`, mounts `src/App.svelte`, and composes typed Svelte components under `src/components/`. The Svelte app owns the app shell, body `data-*` synchronization, and DOM surface rendering. The legacy `js/modules/` tree remains the imperative engine/business-logic layer during migration and is reached through bridge/adapters, not through `dist/bundle.js` in production.

*   **`src/main.ts`**: Vite entry; initializes URL/demo flags and mounts the Svelte app.
*   **`src/App.svelte`**: Root Svelte composition; syncs body state attributes and renders the app surfaces.
*   **`src/lib/stores/`**: Typed Svelte stores replacing `state.js` slices for UI state.
*   **`src/lib/engine/bridge.ts`**: Imperative bridge to the legacy Three.js/data modules.
*   **`src/components/Canvas.svelte`**: Owns WebGL canvas lifecycle through the bridge.
*   **`js/modules/three-engine.js`**: Core WebGL engine used behind the bridge.
*   **`js/modules/camera-controls.js`**: Camera choreography, transitions, auto-rotation, and orbit slack.
*   **`js/modules/journey*.js` / `*.ts`**: Exploration/trail business logic while the migration continues.
*   **`js/modules/search-state.js`**: Search engine and result derivation backing Svelte search surfaces.
*   **`js/modules/semantic-threads.js`**: Artifact loading for pre-calculated semantic relationships.

## Key Architecture Patterns

1.  **State Synchronization:** The `state.js` object holds all mutable data. Modules mutate this state and then trigger UI updates (e.g., `updateExplorationUi()`, `refreshCompositionState()`) to sync the DOM and WebGL layers.
2.  **Dataset-Driven CSS:** The application heavily relies on `document.body.dataset` attributes (e.g., `data-active-view`, `data-graph-context`, `data-semantic-dive`) to trigger complex CSS animations and layout shifts without requiring heavy JavaScript DOM manipulation.
3.  **Graceful Degradation:** If the live Semantic API fails, `lifecycle.js` automatically catches the failure and falls back to deterministic local artifacts, keeping the visual demo alive for users.
4.  **Handoffs:** The transition between the 3D 'Galaxy' view and the 2D 'Map' view is managed through a carefully choreographed sequence (`switchView` -> `animateCameraToTerrainPrelude`) to maintain spatial context.

## Two Patterns for Module Communication

The app uses two communication mechanisms. Both are intentional; do not "unify" them by deleting one in favor of the other.

- **Event bus (`js/modules/event-bus.js`)** — for cross-cutting notifications where one module publishes an event and many subscribers react. The pattern is `publish(EVENTS.X, payload)` from the producer, and `subscribe(EVENTS.X, handler)` or `subscribeKeyed(...)` from the consumer. The key contract: an event has a stable `EVENTS.X` name and a documented payload shape; subscribers must tolerate the event firing from multiple call sites. Used for: URL sync, search state changes, focus transitions, semantic lane state, tooltip/composition updates.

- **Adapters (`*-adapter.js`)** — for breaking module-to-module circular dependencies. Each adapter holds module-private closure state for dependency functions, injected at app init via `init*Adapter(deps)`. Consumers import the adapter module and call `adapter.foo()` (or destructured `adapter_foo()`); the adapter delegates to the injected implementation with a safe no-op fallback. Used for: thread-inspector ↔ journey, cluster-filter ↔ search/url-state, search-panel ↔ lifecycle, etc. The key contract: a cycle that can't be broken by direct import goes through an adapter.

The `docs/semantic-demo-dewindowing-inventory.md` documents which window globals have been retired; the 6 corresponding adapters were deleted (2026-05) because they only existed to wrap those globals. The 10 remaining adapters are unrelated to dewindowing — they serve the cycle-breaking role above.
