# three-engine.ts Decomposition Plan

**Status:** Phase 1 complete (committed `2b2384a5`).

---

## Background

`src/lib/engine/three-engine.ts` was 1,415 lines — the monolithic core of the WebGL engine. Phase 1 extracted self-contained functions leaving 1,258 lines. Two heavyweight functions remain and are the targets of Phase 2 and Phase 3.

---

## Phase 1 — ✅ Complete

**Extracted to `src/lib/engine/renderer/`:**

| Function | Module | Complexity |
|---|---|---|
| `detectWebGLSupport()` | `webgl-fallback.ts` | Pure, stateless |
| `showWebGLFallback()` | `webgl-fallback.ts` | DOM + deps injected |
| `smoothDiagnosticValue()` | `renderer-diagnostics.ts` | Pure math |
| `getSceneRenderableDiagnostics()` | `renderer-diagnostics.ts` | Reads `appState` |
| `sampleScenePerformance()` | `renderer-diagnostics.ts` | Writes `appState` |

**Safety net:**

- `tests/unit-active/three-engine-api-contract.test.ts` (26 assertions)
- All consumers import from `./three-engine` via barrel (`index.ts`)
- `getSceneRenderableDiagnostics` re-exported for backward compat

---

## Phase 2 — Extract `initThreeJS()` into `renderer/scene-init.ts`

**Goal:** Remove ~250 lines of scene-setup logic from `three-engine.ts`.

**Extractable units (in order):**

1. **`createScene()`** — Scene, fog, Atmosphere, glow spheres, depth reference sphere
2. **`createCamera(width, height)`** — PerspectiveCamera, position, lookAt
3. **`createRenderer(container)`** — WebGLRenderer config, alpha, tone mapping, canvas setup
4. **`createControls(camera, renderer.domElement)`** — OrbitControls, damping, auto-rotate
5. **`createLights(scene)`** — HemisphereLight + DirectionalLight
6. **`initEnvironment()`** — WebGL event handlers (contextlost, contextrestored, visibilitychange)
7. **`initPostProcessingProxy(renderer, scene, camera)`** — Dynamic PP load (already async)

**Key refactor needed:**

- `initThreeJS()` currently mutates both `webglContext` AND `_state` AND `appState`. The extracted function should return a `{ scene, camera, renderer, controls }` object that `three-engine.ts` assigns to the appropriate stores.
- This makes `scene-init.ts` purely about Three.js setup and completely ignorant of the legacy state system.

**Safety net (before touching code):**

- Write `tests/unit-active/three-engine-init-contract.test.ts` asserting:
  - `initThreeJS()` still exported from `three-engine.ts`
  - Returns `boolean` (or Promise<boolean>)
  - Does not throw when `#canvas-container` missing

**Estimated line reduction:** 250 -> 1,008 lines

---

## Phase 3 — Extract `animate()` into `renderer/render-loop.ts`

**Goal:** Remove ~200 lines from `three-engine.ts`, making the render loop testable and strategy-swappable.

**Why this is the highest value:**

- It runs on every frame (60×/sec)
- It contains animation, physics, rendering, and input handling all mixed together
- Extracting it enables: a reduced-motion loop, a headless loop for tests, a VR loop, etc.

**Extractable units (each becomes a standalone function):**

1. **`updateNodePositions(state, now)`** — Lerp, focus pocket breathing, dirty-bit set
2. **`updateCameraReveal(state, now, revealProgress)`** — Camera lerp for scene reveal
3. **`updateMaterials(state, revealProgress)`** — PointsMaterial, sporeMaterial opacity and uniforms
4. **`updateMyceliumOpacity(state, pulsePhase)`** — Core, wispy, bridge line opacity
5. **`updateHoverEffects(state, hoveredNode)`** — Emissive flash, shader uniforms
6. **`updateOverlays(state, now)`** — Inspected strand, route arrival, search corridor
7. **`renderFrame(renderer, scene, camera)`** — Postprocessing vs vanilla renderer decision

**Key refactor needed:**

- Define a `RenderFrameState` interface that holds only the data `animate()` needs
- `animate()` should receive this state, not reach into `_state` / `webglContext` / `appState` directly
- This is a **breaking change** to internal module coupling; the public API stays identical

**Safety net:**

- The existing `tests/three-scene-playtest.mjs` contract test should still pass
- Add `tests/unit-active/render-loop-contract.test.ts` asserting exported sub-functions exist
- Run `qa:scene-health` before and after

**Estimated line reduction:** 200 -> ~800 lines

---

## After Phase 3

| File | Lines | Purpose |
|---|---|---|
| `three-engine.ts` | ~800 | Thin orchestrator: `init`, `animate`, `cancelAnimate`, `deinit`, `onWindowResize` |
| `renderer/scene-init.ts` | ~250 | Scene, camera, renderer, controls, lights setup |
| `renderer/render-loop.ts` | ~200 | Per-frame updates: nodes, materials, overlays, render |
| `renderer/renderer-diagnostics.ts` | ~100 | Performance metrics |
| `renderer/webgl-fallback.ts` | ~130 | Fallback DOM + detection |

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Legacy `_state` / `appState` dual writes | Phase 2 isolates this into `scene-init.ts` return value; Phase 3 formalizes `RenderFrameState` interface |
| Postprocessing dynamic import | Already async, stays in `three-engine.ts` orchestrator |
| Event handler leaks | Extracted code keeps existing cleanup in `cancelAnimate()` |
| Build size increase | Tree-shaking unchanged; no new dependencies |

---

## When to do what

- **Phase 2** (`initThreeJS` extraction) → Safe for next session. No runtime behavior change, just code motion.
- **Phase 3** (`animate` extraction) → Do **after** a full QA cycle (visual regression, scene health, playthrough). The render loop is the most delicate part of the engine.

---

## Reference

- Commit `2b2384a5` — Phase 1 completion
- `src/lib/engine/three-engine.ts` — current state
- `tests/unit-active/three-engine-api-contract.test.ts` — safety net
