# McCullough Cloud: Semantic Demo Architecture

The Semantic Explorer is a highly polished, browser-based WebGL/DOM application that visualizes 8,406 local business records in a semantic space. It relies on a carefully orchestrated architecture separating the data layer, WebGL visualization, and DOM-based UI state.

## Directory Structure
```
ops/remote-staging/mccullough.cloud/public_html/semantic-demo/
├── vector-explorer-polished.html # The primary layout and DOM structure
├── index.html                    # Front door only; not an app shell
├── case-study.html               # The narrative wrapper and portfolio presentation
├── semantic-demo.css             # Import sheet only; loads the CSS modules
├── vector-explorer-pandora.css   # Separate Pandora experiment stylesheet
├── css/                          # Extracted CSS modules loaded through semantic-demo.css
├── js/
│   ├── state.js                  # Centralized, mutable global state store
│   ├── utils.js                  # Pure utility functions (formatting, normalization)
│   └── modules/                  # Modularized application logic
```

## One App Shell Contract

`vector-explorer-polished.html` is the single canonical app shell. It owns the live explorer DOM, the app CSS links, and `dist/bundle.js`. `semantic-demo.css` is the import sheet for cache-busted modules under `css/`; `vector-explorer-pandora.css` is a separate top-level stylesheet linked by the shell. Both top-level stylesheets and the `css/` module directory are part of the deploy payload.

`index.html` is not an app shell. It is a routing/front-door page for `/semantic-demo/` and may link to the explorer, but it must not include canvas DOM, `dist/bundle.js`, `semantic-demo.css`, or Semantic API behavior.

Run `npm run build` and `npm run check:shell` before deploy or shell-level edits. The deploy scripts build first, then call this guard before uploading.

## JavaScript Modules (The Frontend Engine)

The frontend is broken down into distinct modules to handle the complexity of synchronizing a Three.js scene with a reactive DOM overlay.

*   **`app.js`**: The main entry point. Coordinates initialization (`init()`), handles global error recovery, and binds all exposed module functions to the `window` object for HTML inline handler compatibility.
*   **`three-setup.js`**: The core WebGL engine. Manages the Three.js scene, camera, renderer, custom shaders (including the score-reactive thread inspector and semantic lens), and the high-density instanced meshes for business nodes.
*   **`camera-controls.js`**: Advanced camera choreography. Handles smooth transitions (`animateCameraToNode`), the "Sonic Boom" map prelude (`animateCameraToTerrainPrelude`), auto-rotation, and orbit slack.
*   **`journey.js`**: The "Business Logic" of exploration. Manages the state of the user's semantic trail, calculates nearest semantic neighbors, and updates the `journey-compass` UI to reflect the current phase of exploration.
*   **`lifecycle.js`**: Application state machine. Controls the loading overlay, view switching (Galaxy vs. Map), the "Semantic Guide" synthesis card, and polls the `/api.php` for semantic lane health.
*   **`search-state.js`**: The search engine. Handles query tokenization, filters the dataset, manages the `search-results` DOM, and orchestrates the `search-trail-cue` narrative framing.
*   **`semantic-threads.js`**: Artifact loading. Fetches and processes the pre-calculated semantic relationships (threads) from the backend data pipeline.
*   **`thread-inspector.js`**: Visualizing connections. Renders the pulsing, score-reactive WebGL lines between nodes when exploring semantic neighborhoods.
*   **`url-state.js`**: Routing. Synchronizes the application state (view, active search, filters, selected node) with the browser's URL query parameters for shareability.
*   **`data-loader.js`**: Initial payload fetching. Responsible for downloading the core business corpus and coordinate maps.
*   **`event-bindings.js`**: Centralized DOM event listeners to keep the HTML clean and manage user interactions cleanly.

## Key Architecture Patterns

1.  **State Synchronization:** The `state.js` object holds all mutable data. Modules mutate this state and then trigger UI updates (e.g., `updateExplorationUi()`, `refreshCompositionState()`) to sync the DOM and WebGL layers.
2.  **Dataset-Driven CSS:** The application heavily relies on `document.body.dataset` attributes (e.g., `data-active-view`, `data-graph-context`, `data-semantic-dive`) to trigger complex CSS animations and layout shifts without requiring heavy JavaScript DOM manipulation.
3.  **Graceful Degradation:** If the live Semantic API fails, `lifecycle.js` automatically catches the failure and falls back to deterministic local artifacts, keeping the visual demo alive for users.
4.  **Handoffs:** The transition between the 3D 'Galaxy' view and the 2D 'Map' view is managed through a carefully choreographed sequence (`switchView` -> `animateCameraToTerrainPrelude`) to maintain spatial context.
