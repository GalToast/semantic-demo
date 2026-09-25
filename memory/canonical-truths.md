# Canonical Truths — semantic-explorer

Stable repo invariants. Update only when architecture materially changes.

## Project
3D semantic mycelium visualization for exploring Montgomery County TX business relationships. 8,406-point network rendered via Three.js instanced meshes, driven by UMAP/PCA projection in `[0,1]³` unit-cube space.

## Production shell
Production is the Svelte/Vite shell: `src/index.html` -> `dist/svelte/index.html`.
Deploy scripts publish that built file as both `/semantic-demo/index.html` and
`/semantic-demo/vector-explorer-polished.html`. The repo-root
`vector-explorer-polished.html` is legacy reference only (it previously loaded
`dist/bundle.js`, now gitignored and no longer built). The `js/modules/*.ts`
engine kernel remains active runtime, accessed via `src/lib/engine/bridge.ts`.

## Key file roles
| Path | Role |
|---|---|
| `js/modules/app.js` | Legacy JS reference entry; not the production entry |
| `js/state.js` | Single source of truth for all global state (Proxy-based) |
| `js/modules/lifecycle.js` | App orchestration, view handoff, scene-reveal |
| `js/modules/micro-demo.js` | Sole demo entry point; owns first-visit guard + choreography |
| `js/modules/journey.js` | Thin journey orchestration facade |
| `js/modules/three-engine.js` | WebGL engine: scene, camera, renderer, instanced meshes |
| `js/modules/three-node-manager.js` | Node/spore instancing, texture lifecycle (`_trackedTextures`) |
| `js/modules/three-thread-manager.js` | Mycelium/thread line geometry |
| `js/modules/camera-controls.js` | Camera choreography |
| `js/modules/search-state.js` | Search engine, query tokenization |
| `js/modules/focus-pocket.js` | Focus pocket node layout and animation |
| `js/modules/event-bindings.js` | Thin orchestrator dispatching per-surface `bind*` functions |
| `src/main.ts` | Svelte app mount (Vite root = `src/`) |
| `src/App.svelte` | Root Svelte component; syncs body data-attrs from stores |
| `src/lib/engine/bridge.ts` | Imperative bridge: Svelte → legacy Three.js (~1212L) |

## State machines
- **micro-demo:** `IDLE → GLIDING → ARRIVED → CARD_VISIBLE → PULLBACK → WIDE_VIEW → RETURNING → COMPLETE`; `CANCELLED` branches from any non-terminal phase.
- **journey-compass-state:** Pure derivation function (not FSM). Returns `phase ∈ {map, inside, focus, search, overview}`.

## Storage keys
- `localStorage.moco_mycelium_demo_v1` — lifetime per-browser demo flag
- `sessionStorage.moco_mycelium_demo_session_v1` — per-session demo guard

## CSS architecture
- `css/` split into ordered modules; `semantic-demo.css` is an import manifest.
- `css/mobile_premium__*.css` files loaded directly by the app shell (not via manifest).
- Use `docs/semantic-demo-css-ownership-map.md` and `docs/semantic-demo-mobile-state-ownership.md` to find owning module before editing.
- No `!important` — every instance signals unresolved specificity conflict.

## Durable code invariants
- `withStateMutation()` required for tracked sub-objects (`navState`, `strandContinuityState`, etc.) — `_makeProdProxy` throws in production without it.
- Dead CSS selectors are deleted outright (no TODO comments).
- `initSemanticLens()` disposes before reinit (both `.js` and `.ts` paths must stay in sync).
- Use `seededUnit(index, salt)` — never `Math.random()` in WebGL/geometry code.
- Always pass the raw buffer to `getPointBoundsCenter()`, not just the points array.

## Z-index architecture
All z-index values flow from `src/lib/z-index.ts` → `src/lib/css/z-layers.css` → `src/index.html` inline `<style>`. Use `var(--z-*)` in components — never hardcode.

## Debug flags
- `?demo=force` — re-trigger demo
- `?nodemo=1` — suppress demo
