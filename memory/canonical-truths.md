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
| `src/lib/orchestration/toast.ts` | Canonical toast path: writes to a Svelte store; Toast.svelte renders the DOM. The DOM-direct `showExperienceToast` in `src/lib/ui/ui-feedback.ts` was retired 2026-06-30. |
| `src/lib/navigation/mode-affordances.ts` | Canonical selection-lock rule (`isModeLocked`, `SELECTION_DEPENDENT_MODES`). Consumed by Header chip rail, CompassRail, and `mode-bindings.ts`. Single source of truth for "is this mode usable without a focused business?" |
| `src/lib/components/header/mode-constants.ts` | Header mode labels, icons, descriptions (shared by Header.svelte and the contract tests). |
| `src/lib/components/header/mode-nav.ts` | `selectMode` — the canonical mode-switch entry point. Encapsulates lock check + URL sync + navState update. Use from any UI surface that switches modes. |
| `src/lib/components/header/header.css` | Extracted Header visual contract (chrome, mode chips, help dialog, mobile breakpoint). Imported into Header.svelte via `@import '@lib/components/header/header.css'`. |
| `src/components/CompassRail.svelte` | 6-phase compass rail. Reuses `selectMode` from `mode-nav.ts` for the lock + URL-sync guarantee. |

## State machines

- **micro-demo:** `IDLE → GLIDING → ARRIVED → CARD_VISIBLE → PULLBACK → WIDE_VIEW → RETURNING → COMPLETE`; `CANCELLED` branches from any non-terminal phase.
- **journey-compass-state:** Pure derivation function (not FSM). Returns `phase ∈ {map, inside, trail, focus, search, overview}`. Order: `overview → search → focus → trail → inside → map`. `trail` was added 2026-06-30 (PR-D6) to surface the trail phase consistently with the Header chip rail.

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
- `getPointBoundsCenter()` requires a non-null `Float32Array` buffer (TypeScript-enforced); passing only the points array is a compile error.
- **Mode switching:** call `selectMode(modeId, source)` from `@lib/components/header/mode-nav`. Don't call `updateUrlState` / `setJourneyPhase` / `updateNavState` directly from a UI surface — `selectMode` is the single entry point that wires all three (lock check, URL sync, navState write).
- **Selection lock:** check `isModeLocked(modeId, hasSelection)` from `@lib/navigation/mode-affordances` before showing a mode as active. The set `SELECTION_DEPENDENT_MODES = {trail, focus, inside}` is the canonical list.
- **Toast:** import `showExperienceToast` from `@lib/orchestration/toast` (Svelte store). The DOM-direct implementation in `@lib/ui/ui-feedback` was retired 2026-06-30 because Svelte re-renders could wipe manual `textContent`/`classList` mutations.
- **Window globals:** `__APP_STATE__`, `__TEST_STATE__`, `__LEGACY_APP_STATE__` are the live set (mirrored by the test-compat proxy in `main.ts`). `__semanticState` and `state` were retired 2026-06-30 (PR-D8) — they were declared in `window.d.ts` but never assigned anywhere.

## Z-index architecture

All z-index values flow from `src/lib/z-index.ts` → `src/lib/css/z-layers.css` → `src/index.html` inline `<style>`. Use `var(--z-*)` in components — never hardcode.

## Debug flags

- `?demo=force` — re-trigger demo
- `?nodemo=1` — suppress demo
