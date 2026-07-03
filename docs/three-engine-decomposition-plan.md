# `three-engine-core.ts` Decomposition Plan

> **Source**: `src/lib/engine/three-engine-core.ts` (971 LOC)  
> **Pattern reference**: `neighborhood.ts` (938 → 3 modules, commit `300906d9`)  
> **Status**: Design record — Phase 0–5 extractions are live; the per-concern file layout below was a research proposal (actual landing co-located frame-update concerns in `three-engine-frame-updates.ts`).

> **Decomposition log**
>
> - 2026-07-03 — **A5 (node position lerp + focus-pocket breathing)** extracted from `animate()` (L407–436 in the post-Phase-0 core) into `lerpNodesForFrame()` in `three-engine-frame-updates.ts`, co-located with the existing A4/A7/A11/A12/A14 helpers rather than the proposed `three-node-lerp.ts` (the consolidated `three-engine-frame-updates.ts` is the established Phase-4 home). Diverges from the file's read-only-`state`-param pattern: reads `engineState.state` live so the defensive mid-frame `if (!engineState.state) return true` bail still catches teardowns that null the singleton. Call site: `if (lerpNodesForFrame(frameNow)) return`. Verified: build clean (28s), core contract group 11/11, cancel-animate/three-setup-loop/motion-state/focus-pocket-motion/three-setup-init dewindowing + scene-atmosphere/three-visual-polish/residual-window-bridge/js-reduced-motion-guard contracts green, and `three-engine-animate-regression`/`three-engine-core`/`three-engine-frame-updates` unit tests 66/66.

---

## 1. Function Inventory

| # | Function | Lines | LOC | Reads Module State | Writes Module State | Side Effects | Purity |
|---|----------|-------|-----|---------------------|---------------------|--------------|--------|
| 1 | `_loadPostProcessing()` | 54–67 | 14 | `_ppModule`, `_ppLoading` | `_ppModule`, `_ppLoading` | Dynamic import | ❌ Impure |
| 2 | `_ensureModules()` | 162–192 | 31 | (all `_xxx` module refs) | All 17 lazy module vars, `_loaded`, `window.__LEGACY_APP_STATE__` | Window mutation | ❌ Impure |
| 3 | `hasFiniteNodeIndex()` | 211–213 | 3 | – | – | – | ✅ **Pure** |
| 4 | `sceneNeedsContinuousFrame()` | 215–241 | 27 | `_state` (12 fields) | – | – | ✅ **Data-dependent** (reads `_state` only) |
| 5 | `scheduleNextAnimationFrame()` | 242–252 | 11 | `_rafId`, `_idleFrameTimerId` | `_rafId`, `_idleFrameTimerId` | `setTimeout`, `requestAnimationFrame` | ❌ Impure |
| 6 | `updateCameraViewportOffset()` | 254–290 | 37 | `webglContext.camera`, `appState.camera` | camera methods | `document.querySelector/read`, DOM read | ❌ Impure |
| 7 | `_yieldToBrowser()` | 291–294 | 4 | – | – | `setTimeout` | ❌ Impure |
| 8 | `initThreeJS()` | 297–525 | 228 | `_sceneRegistry`, `_circuitBreakerTripped`, all lazy refs | All multi-store refs, `_ppModule`, `_webglContextLost`, `_webglRestoreTimer`, `_sceneRegistry` | Massive: DOM, WebGL, listeners, RAF, dynamic import, window globals | ❌ Megafn |
| 9 | `onWindowResize()` | 527–541 | 15 | `webglContext` | `camera.aspect`, renderer size, postprocessing | `document.getElementById`, renderer resize | ❌ Impure |
| 10 | `pauseRenderLoopTimers()` | 550–564 | 15 | `_rafId`, `_idleFrameTimerId`, `_webglRestoreTimer` | All three cleared | `cancelAnimationFrame`, `clearTimeout` | ❌ Impure |
| 11 | `cancelAnimate()` | 565–645 | 81 | All disposeable refs | All to null, registry cleared | Cancel RAF, dispose registry, DOM removal, renderer.dispose | ❌ Impure |
| 12 | `deinit()` | 647–667 | 21 | `_loaded`, `_state` | `_loaded`, `_state.*` | Disposes 6 sub-systems | ❌ Impure |
| 13 | `applyMapFlatteningLayout()` | 670–672 | 3 | `_mapFlattening` | – | Delegated | ❌ Impure (thunk) |
| 14 | `animate()` | 674–971 | 297 | Everything | Everything | RAF, mutation, WebGL render | ❌ Megafn |
| **Total** | | 14 exports + 4 private | **971** | | | | |

### Purity summary

| Category | Functions | Total LOC |
|----------|-----------|-----------|
| Pure (zero state, no side effects) | `hasFiniteNodeIndex` | 3 |
| Deterministic data-dependent (reads `_state` only) | `sceneNeedsContinuousFrame` | 27 |
| Impure helpers (timers, lazy load) | `_loadPostProcessing`, `scheduleNextAnimationFrame`, `_yieldToBrowser`, `pauseRenderLoopTimers` | 44 |
| Sub-orchestrator (8-15 LOC) | `updateCameraViewportOffset`, `onWindowResize`, `applyMapFlatteningLayout` | 55 |
| Lifecycle + teardown | `initThreeJS`, `cancelAnimate`, `deinit` | 330 |
| Render loop | `animate` | 297 |
| Module bootstrap | `_ensureModules` | 31 |

---

## 2. State Dependency Graph

```
Module-level variable              │ Read by                      │ Write by
─────────────────────────────────────────────────────────────────────────────────────
_ppModule                          │ animate, onWindowResize,      │ _loadPostProcessing
                                   │ cancelAnimate                 │
_ppLoading                         │ _loadPostProcessing            │ _loadPostProcessing
_withStateMutation                 │ animate (×2)                  │ _ensureModules
_viewController                    │ initThreeJS (fallback)        │ _ensureModules
_clusterLabels                     │ animate                       │ _ensureModules
_focusPocket                       │ animate                       │ _ensureModules
_sceneReveal                       │ animate                       │ _ensureModules
_cameraControls                    │ animate, cancelAnimate,       │ _ensureModules
                                   │ deinit                        │
_mapState                          │ initThreeJS (fallback)        │ _ensureModules
_uiFeedback                        │ initThreeJS (contextlost),    │ _ensureModules
                                   │ initThreeJS (fallback)        │
_webglRestore                      │ initThreeJS (contextrestored) │ _ensureModules
_inspectedStrand                   │ animate                       │ _ensureModules
_focusAnchor                       │ cancelAnimate                 │ _ensureModules
_audioScape                        │ deinit                        │ _ensureModules
_eventBindings                     │ deinit                        │ _ensureModules
_loadingUi                         │ deinit                        │ _ensureModules
_threeSearchAnimations             │ animate, deinit               │ _ensureModules
_threeInteractionVisuals           │ initThreeJS, animate, deinit  │ _ensureModules
_mapFlattening                     │ applyMapFlatteningLayout      │ _ensureModules
_myceliumEngine                    │ animate                       │ _ensureModules
_loaded                            │ _ensureModules, deinit        │ _ensureModules, deinit
_rafId                             │ scheduleNextAnimationFrame,   │ scheduleNextAnimationFrame,
                                   │ pauseRenderLoopTimers,        │ pauseRenderLoopTimers,
                                   │ initThreeJS (contextrestored),│ animate (clear)
                                   │ animate (clear)               │
_idleFrameTimerId                  │ scheduleNextAnimationFrame,   │ scheduleNextAnimationFrame,
                                   │ pauseRenderLoopTimers,        │ pauseRenderLoopTimers
                                   │ initThreeJS (visibilitychange)│
_webglContextLost                  │ animate, pauseRenderLoopTimers,│ initThreeJS (contextlost),
                                   │ cancelAnimate                 │ initThreeJS (contextrestored),
                                   │                               │ cancelAnimate
_circuitBreakerTripped             │ initThreeJS, animate,         │ initThreeJS (reset),
                                   │ initThreeJS (contextrestored) │ animate (set on error)
_webglRestoreTimer                 │ pauseRenderLoopTimers         │ initThreeJS (contextrestored),
                                   │                               │ pauseRenderLoopTimers
_lastHoveredNode                   │ animate                       │ animate
_hoverEmissiveFlash                │ animate                       │ animate
_sceneRegistry                     │ initThreeJS, cancelAnimate    │ initThreeJS, cancelAnimate
_mapButtonClickHandler             │ cancelAnimate                 │ initThreeJS (fallback),
                                   │                               │ cancelAnimate
_state                             │ 12+ functions                 │ initThreeJS, cancelAnimate,
                                   │                               │ deinit, animate
```

### State coupling clusters

**Cluster A — Render-loop bookkeeping** (only `animate` + `scheduleNextAnimationFrame` + `pauseRenderLoopTimers`):

- `_rafId`, `_idleFrameTimerId`, `_circuitBreakerTripped`, `_webglContextLost`, `_lastHoveredNode`, `_hoverEmissiveFlash`

**Cluster B — Lifecycle / teardown** (`initThreeJS`, `cancelAnimate`, `deinit`):

- `_sceneRegistry`, `_mapButtonClickHandler`, `_webglRestoreTimer`, `_loaded`, all lazy module refs

**Cluster C — Module bootstrap** (`_ensureModules` only):

- All 17 lazy module refs + `_loaded` + `window.__LEGACY_APP_STATE__`

**Cluster D — Frame-time visual state** (`animate` only):

- `_lastHoveredNode`, `_hoverEmissiveFlash`

---

## 3. `initThreeJS()` Concern Breakdown (L297–525, 228 LOC)

| Concern | Lines | LOC | Description |
|---------|-------|-----|-------------|
| **C1 — Pre-flight** | 298–305 | 8 | `_ensureModules()`, `cancelAnimate()`, reset `_circuitBreakerTripped` |
| **C2 — Scene build + fallback** | 307–320 | 14 | `buildThreeScene()`, on failure: `showWebGLFallback()` + early return |
| **C3 — Multi-store handle registration** | 322–345 | 24 | Write scene/camera/renderer/controls/hemiLight/dirLight into `webglContext`, `appState`, `legacyState`, `_state` (×4 each) |
| **C4 — DisposableRegistry bootstrap** | 347–350 | 4 | Dispose old registry, create new `DisposableRegistry` |
| **C5 — WebGL context-lost listener** | 351–358 | 8 | Register `webglcontextlost` → set flag, pause timers, toast |
| **C6 — WebGL context-restored listener** | 359–375 | 17 | Register `webglcontextrestored` → setTimeout → `_webglRestore`, restart loop |
| **C7 — Visibility-change listener** | 376–388 | 13 | Register `visibilitychange` → restart loop if all guards pass |
| **C8 — Reduced-motion gate** | 390–396 | 7 | Check `prefers-reduced-motion`, disable autoRotate, update button |
| **C9 — Controls autoRotate config** | 398–402 | 5 | Set `controls.autoRotate` + `autoRotateSpeed` |
| **C10 — Controls start/end listeners** | 403–411 | 9 | Register `start`/`end` on controls → camera-assist release/resume |
| **C11 — Yield + createPoints** | 413–433 | 21 | `_yieldToBrowser()`, `createPointsPort()`, sync to `appState` + `_state` |
| **C12 — Yield + createMycelium** | 435–451 | 17 | `_yieldToBrowser()`, `createMyceliumPort()`, sync to `appState` + `legacyState` + `_state` |
| **C13 — Yield + material compile + visuals** | 453–459 | 7 | `_yieldToBrowser()`, `compilePointMaterialForReadinessPort()`, init lens/manifold, `updateCameraViewportOffset()` |
| **C14 — Yield + start render loop** | 461–468 | 8 | `_yieldToBrowser()`, `animate()` |
| **C15 — Postprocessing load** | 470–503 | 34 | If not mobile: `_loadPostProcessing().then(init)`. If mobile: set `body.dataset.postprocessing = 'skipped'` |
| **C16 — Dev-only Spector bridge** | 497–523 | 27 | `import.meta.env.DEV` → expose `window.__semanticEngine` handle |

### Concern grouping for extraction

| Group | Concerns | LOC | Extraction target |
|-------|----------|-----|-------------------|
| Pre-flight | C1 | 8 | Inline in orchestrator |
| Scene bootstrap | C2 | 14 | `three-scene-bootstrap.ts` |
| Multi-store sync | C3 | 24 | `three-store-sync.ts` |
| Listener registration | C4–C10 | 45 | `three-listener-registration.ts` |
| Geometry/material init | C11–C13 | 45 | `three-geometry-init.ts` |
| Render loop kickoff | C14 | 8 | Inline in orchestrator |
| Postprocessing | C15 | 34 | Already lazy — keep inline or `three-pp-init.ts` |
| Dev bridge | C16 | 27 | `three-dev-bridge.ts` (DEV-only) |

---

## 4. `animate()` Concern Breakdown (L674–971, 297 LOC)

| Concern | Lines | LOC | Description |
|---------|-------|-----|-------------|
| **A1 — Frame bookkeeping + gate checks** | 675–700 | 26 | Clear `_rafId`, check circuit breaker / context-lost / hidden / renderer-state / currentView |
| **A2 — Frame interval + perf diag** | 701–711 | 11 | Compute `sceneFrameMs`, write `lastFrameAt` via `_withStateMutation` |
| **A3 — Camera update** | 713–718 | 6 | `updateAutoRotateSoftResume`, `focusCameraAssistIsActive`, `controls.update()` |
| **A4 — Reveal progression** | 720–723 | 4 | `getSceneRevealProgress`, compute eased `pointsRevealProgress` + `cameraRevealProgress` |
| **A5 — Node position lerp** ✅ | 724–757 | 34 | Lerp `nodePositions → targetPositions`, `setNodeSporeInstanceMatrixPort`, focus-pocket breathing, mark `myceliumDirty`. **Extracted 2026-07-03 → `lerpNodesForFrame()` in `three-engine-frame-updates.ts`** (see decomposition log). |
| **A6 — Camera reveal lerp** | 759–782 | 24 | `lerpVectors` for scene-reveal camera path, clear reveal state at completion |
| **A7 — Points material update** | 784–801 | 18 | Compute opacity/size scales from focus/semantic-dive state, update shader uniforms |
| **A8 — Fog density** | 803–807 | 5 | Scale `FogExp2.density` by reveal progress |
| **A9 — Reference sphere wireframe** | 809–818 | 10 | Sin-curve opacity boost during reveal |
| **A10 — Spore material opacity** | 820–828 | 9 | Lerp `nodeSporeMaterial.opacity` toward target |
| **A11 — Hover emissive flash** | 830–853 | 24 | Track hover transitions, decay `_hoverEmissiveFlash`, set `emissiveIntensity` |
| **A12 — Mycelium visibility + pulse** | 855–861 | 7 | `shouldRenderThreads`, compute `pulseIncrement` from weather wind speed |
| **A13 — Thread opacity update** | 863–891 | 29 | Compute per-layer (core/wispy/bridge) opacity from `getThreadPulseOpacityPort` |
| **A14 — Points shader hover boost** | 893–906 | 14 | Lerp `uHoverBoost`, set `uHoverNodePos` uniform |
| **A15 — Interaction/search/overlay updates** | 908–925 | 18 | `updateInteractionVisuals`, `updateCorridorNodeGlow`, `updateSearchCorridorAnimation`, overlay frames |
| **A16 — Mycelium thread update** | 927–935 | 9 | `updateMyceliumThreads` if continuous + threads visible |
| **A17 — Camera assist + cluster labels** | 936–941 | 6 | `applySemanticCentroidCamera`, `updateClusterLabels` |
| **A18 — Renderer.render call** | 943–957 | 15 | Try `renderPostProcessing`, fall back to `renderer.render`, write perf diag |
| **A19 — Perf sampling** | 959–963 | 5 | `sampleScenePerformance(sceneFrameMs, {updateMs, renderMs}, _state)` |
| **A20 — Error boundary** | 964–971 | 8 | Catch → `debugError` + `_circuitBreakerTripped = true` |

### Concern grouping for extraction

| Group | Concerns | LOC | Extraction target |
|-------|----------|-----|-------------------|
| Frame gates | A1 | 26 | Inline in orchestrator |
| Perf bookkeeping | A2, A19 | 16 | `three-perf-bookkeeping.ts` |
| Camera | A3, A6, A17 | 36 | `three-camera-update.ts` |
| Reveal | A4, A8, A9 | 19 | `three-reveal-progression.ts` |
| Node lerp + pocket | A5 | 34 | `three-node-lerp.ts` |
| Material updates | A7, A10, A13, A14 | 71 | `three-material-updates.ts` |
| Hover flash | A11 | 24 | `three-hover-flash.ts` |
| Mycelium | A12, A16 | 16 | `three-mycelium-update.ts` |
| Interactions/overlays | A15 | 18 | `three-interaction-update.ts` |
| Render call | A18 | 15 | Inline in orchestrator |
| Error boundary | A20 | 8 | Inline in orchestrator |

---

## 5. Decomposition Proposal

### 5.1 Extraction strategy (following `neighborhood.ts` template)

The `neighborhood.ts` pattern is: **helpers → manifest → orchestrator**. We apply the same:

1. **Pure helpers** → sibling `three-engine-*.ts` files (no signature change)
2. **State-coupled helpers** → sibling files using **parameter injection** (state passed as args)
3. **Sub-orchestrators** → sibling files using a **state-object pattern** (shared state moves to a new `three-engine-state.ts` module)
4. **Orchestrator** → slimmed `three-engine-core.ts` that imports and calls the above

### 5.2 Proposed file layout

```
src/lib/engine/
├── three-engine-core.ts          (orchestrator, ~120 LOC, down from 971)
├── three-engine-state.ts         (state-object pattern, ~60 LOC)
├── three-engine-helpers.ts       (pure functions, ~35 LOC)
├── three-scene-bootstrap.ts      (C2, ~20 LOC)
├── three-store-sync.ts           (C3, ~30 LOC)
├── three-listener-registration.ts (C4–C10, ~55 LOC)
├── three-geometry-init.ts        (C11–C13, ~55 LOC)
├── three-pp-init.ts              (C15, ~40 LOC)
├── three-dev-bridge.ts           (C16, ~30 LOC)
├── three-perf-bookkeeping.ts     (A2+A19, ~20 LOC)
├── three-camera-update.ts        (A3+A6+A17, ~45 LOC)
├── three-reveal-progression.ts   (A4+A8+A9, ~25 LOC)
├── three-node-lerp.ts            (A5, ~40 LOC)
├── three-material-updates.ts     (A7+A10+A13+A14, ~80 LOC)
├── three-hover-flash.ts          (A11, ~30 LOC)
├── three-mycelium-update.ts      (A12+A16, ~20 LOC)
└── three-interaction-update.ts   (A15, ~25 LOC)
```

### 5.3 Phased extraction order

#### Phase 0 — State object extraction (prerequisite for all state-coupled extractions)

**File**: `three-engine-state.ts`  
**LOC**: ~60  
**What**: Move all module-level mutable state into a single `ThreeEngineState` object (class or frozen interface + mutable instance). Export a singleton `engineState` that all modules import.  
**Why**: Eliminates the "17 lazy refs + 11 bookkeeping vars" problem. All downstream extractions become parameter-injection or state-object lookups.  
**Risk**: Medium — requires updating every function that currently reads/writes `_xxx` vars. Mechanical but pervasive.

```ts
// three-engine-state.ts (proposed shape)
export interface ThreeEngineState {
    // Lazy module cache
    ppModule: PostProcessingModule | null
    ppLoading: Promise<PostProcessingModule> | null
    withStateMutation: WithStateMutationFn | null
    viewController: ViewControllerModule | null
    // ... (all 17 lazy refs)
    loaded: boolean

    // Render-loop bookkeeping
    rafId: number | null
    idleFrameTimerId: number | null
    webglContextLost: boolean
    circuitBreakerTripped: boolean
    webglRestoreTimer: number | null
    lastHoveredNode: number | null
    hoverEmissiveFlash: number
    sceneRegistry: DisposableRegistry | null
    mapButtonClickHandler: ((event: MouseEvent) => void) | null
}

export const engineState: ThreeEngineState = { /* all null/false */ }
```

#### Phase 1 — Pure helpers (zero-risk)

**File**: `three-engine-helpers.ts`  
**LOC**: ~35  
**Extracts**: `hasFiniteNodeIndex`, `sceneNeedsContinuousFrame` (with `_state` → parameter injection)  
**Signature change**: `sceneNeedsContinuousFrame(now: number, state: LegacyState): boolean`  
**Risk**: ✅ Zero — pure functions, no state, no side effects  
**Test seam**: ✅ Both become trivially unit-testable with mock `LegacyState`

#### Phase 2 — Impure helpers (low-risk, mechanical)

**File**: `three-engine-timers.ts`  
**LOC**: ~25  
**Extracts**: `_yieldToBrowser`, `scheduleNextAnimationFrame`, `pauseRenderLoopTimers`  
**Signature change**: Accept `engineState` as first parameter  
**Risk**: ✅ Low — only touch RAF/timer bookkeeping, no business logic  
**Test seam**: ✅ Inject mock `engineState` + mock `window`

#### Phase 3 — Sub-orchestrators (medium-risk, state-object pattern)

| File | LOC | Source concerns | Risk |
|------|-----|-----------------|------|
| `three-scene-bootstrap.ts` | ~20 | C2 | Low — single call + fallback |
| `three-store-sync.ts` | ~30 | C3 | Medium — 4-way store sync, needs careful testing |
| `three-listener-registration.ts` | ~55 | C4–C10 | Medium — 5 listener registrations, needs integration test |
| `three-geometry-init.ts` | ~55 | C11–C13 | Medium — yield + create + sync pattern |
| `three-pp-init.ts` | ~40 | C15 | Low — already lazy, just move |
| `three-dev-bridge.ts` | ~30 | C16 | Low — DEV-only, tree-shaken |

**Pattern for each**:

```ts
// three-scene-bootstrap.ts (example)
export async function bootstrapScene(
    container: HTMLElement,
    width: number,
    height: number,
    state: ThreeEngineState
): Promise<SceneBootstrapResult> { ... }
```

#### Phase 4 — Render-loop decomposition (high-risk, needs design review)

| File | LOC | Source concerns | Risk |
|------|-----|-----------------|------|
| `three-perf-bookkeeping.ts` | ~20 | A2, A19 | Low |
| `three-camera-update.ts` | ~45 | A3, A6, A17 | Medium |
| `three-reveal-progression.ts` | ~25 | A4, A8, A9 | Low |
| `three-node-lerp.ts` | ~40 | A5 | High — coupled to focus-pocket + instance-matrix |
| `three-material-updates.ts` | ~80 | A7, A10, A13, A14 | Medium |
| `three-hover-flash.ts` | ~30 | A11 | Low |
| `three-mycelium-update.ts` | ~20 | A12, A16 | Low |
| `three-interaction-update.ts` | ~25 | A15 | Low |

**Pattern for each**:

```ts
// three-hover-flash.ts (example — low risk)
export function updateHoverEmissiveFlash(
    state: ThreeEngineState,
    hoveredNode: number,
    nodeSporeMaterial: MeshPhongMaterial | null,
    deltaTime: number
): void { ... }
```

#### Phase 5 — Orchestrator slim-down

After all extractions, `three-engine-core.ts` becomes:

- Imports from all sibling modules
- `initThreeJS()` → calls `bootstrapScene()`, `syncMultiStore()`, `registerListeners()`, `initGeometry()`, `initPostprocessing()`, `initDevBridge()`, then `animate()`
- `animate()` → calls `updateCamera()`, `updateReveal()`, `lerpNodes()`, `updateMaterials()`, `updateHoverFlash()`, `updateMycelium()`, `updateInteractions()`, `renderFrame()`, `recordPerf()`
- `cancelAnimate()` / `deinit()` → call into `three-engine-state.ts` for cleanup
- Re-exports all public API for barrel compatibility

**Target LOC**: ~120 (down from 971)

---

## 6. Risk Assessment

### 6.1 Zero-risk extractions (pure functions, no state)

| Function | File | Risk | Rationale |
|----------|------|------|-----------|
| `hasFiniteNodeIndex` | `three-engine-helpers.ts` | ✅ Zero | Pure, no state, no side effects |
| `_yieldToBrowser` | `three-engine-timers.ts` | ✅ Zero | Only `setTimeout`, no state |
| `applyMapFlatteningLayout` | Already a thunk | ✅ Zero | Delegated, no direct state |

### 6.2 Low-risk extractions (mechanical, single concern)

| Function | File | Risk | Rationale |
|----------|------|------|-----------|
| `_loadPostProcessing` | `three-pp-init.ts` | ✅ Low | Already lazy-loaded, isolated |
| `scheduleNextAnimationFrame` | `three-engine-timers.ts` | ✅ Low | Only touches `_rafId`/`_idleFrameTimerId` |
| `pauseRenderLoopTimers` | `three-engine-timers.ts` | ✅ Low | Only clears timers |
| `onWindowResize` | `three-engine-core.ts` (keep) | ✅ Low | 15 LOC, single concern |
| `updateCameraViewportOffset` | `three-camera-update.ts` | ✅ Low | DOM read + camera write, isolated |
| Dev bridge (C16) | `three-dev-bridge.ts` | ✅ Low | DEV-only, tree-shaken |

### 6.3 Medium-risk extractions (state-coupled, need state-object pattern)

| Function | File | Risk | Rationale |
|----------|------|------|-----------|
| `_ensureModules` | `three-engine-state.ts` | ⚠️ Medium | Writes 17 refs + window global — needs atomic init |
| Multi-store sync (C3) | `three-store-sync.ts` | ⚠️ Medium | 4-way sync, order-dependent |
| Listener registration (C4–C10) | `three-listener-registration.ts` | ⚠️ Medium | 5 listeners, registry lifecycle |
| Geometry init (C11–C13) | `three-geometry-init.ts` | ⚠️ Medium | Yield + create + sync pattern |
| `cancelAnimate` | `three-engine-state.ts` | ⚠️ Medium | 81 LOC, disposes 6+ subsystems |
| `deinit` | `three-engine-state.ts` | ⚠️ Medium | Calls 6 dispose methods + resets `_loaded` |
| `sceneNeedsContinuousFrame` | `three-engine-helpers.ts` | ⚠️ Medium | Reads 12 `_state` fields — needs parameter injection |
| Camera update (A3, A6, A17) | `three-camera-update.ts` | ⚠️ Medium | Coupled to controls + reveal state |
| Material updates (A7, A10, A13, A14) | `three-material-updates.ts` | ⚠️ Medium | 80 LOC, many state reads |
| Interactions/overlays (A15) | `three-interaction-update.ts` | ⚠️ Medium | 6 sub-system calls |

### 6.4 High-risk extractions (design review required)

| Function | File | Risk | Rationale |
|----------|------|------|-----------|
| `initThreeJS` (orchestrator) | `three-engine-core.ts` | 🔴 High | 228 LOC mega-fn, 16 concerns, order-dependent |
| `animate` (render loop) | `three-engine-core.ts` | 🔴 High | 297 LOC, 20 concerns, perf-critical, error boundary |
| Node lerp + focus pocket (A5) | `three-node-lerp.ts` | 🔴 High | Coupled to `_state.nodePositions`, `_state.targetPositions`, focus-pocket breathing, instance-matrix upload — perf-critical |
| Store sync (C3) | `three-store-sync.ts` | 🔴 High | 4-way sync (`webglContext`, `appState`, `legacyState`, `_state`) — order matters, no atomic batch |

### 6.5 No-go-without-review extractions

| Function | Reason |
|----------|--------|
| `animate()` state-shape | The render loop's state shape is deeply coupled to `_state` (12+ fields read per frame). Extracting sub-concerns requires either (a) passing the entire `_state` object, or (b) creating a `FrameContext` struct. Both need design review. |
| `initThreeJS()` ordering | The yield-then-create pattern (C11→C12→C13) is order-dependent for main-thread responsiveness. Reordering during extraction could regress init performance. |
| Focus-pocket breathing (A5) | Already identified as a perf-sensitive path (W15-T1). Extraction must not add function-call overhead in the hot loop. |

---

## 7. Test Seam Opportunities

### 7.1 Immediately unit-testable (Phase 1)

| Function | Test approach |
|----------|---------------|
| `hasFiniteNodeIndex` | Table-driven: `NaN`, `-1`, `0`, `3.14`, `Infinity`, `'foo'` |
| `sceneNeedsContinuousFrame` | Mock `LegacyState` with each flag toggled, assert continuous vs. idle |

### 7.2 Unit-testable with mock state (Phase 2–3)

| Function | Test approach |
|----------|---------------|
| `scheduleNextAnimationFrame` | Mock `window.requestAnimationFrame`, inject `engineState`, verify `_rafId` set |
| `pauseRenderLoopTimers` | Mock `window.cancelAnimationFrame`, inject `engineState`, verify cleared |
| `updateCameraViewportOffset` | Mock `document.querySelector`, `camera.setViewOffset`, verify offset math |
| `bootstrapScene` | Mock `buildThreeScene`, verify fallback path + success path |
| `syncMultiStore` | Mock `webglContext`, `appState`, `legacyState`, verify all 4 stores written |

### 7.3 Integration-testable (Phase 4)

| Function | Test approach |
|----------|---------------|
| `initThreeJS` (orchestrator) | Full mock of all sub-orchestrators, verify call order + yield interleaving |
| `animate` (orchestrator) | Mock all `three-*-update.ts` functions, verify call order + error boundary |
| `cancelAnimate` | Real `DisposableRegistry`, verify all listeners removed + renderer disposed |
| `deinit` | Mock all dispose methods, verify all called + `_loaded` reset |

### 7.4 Performance-testable (Phase 4)

| Function | Test approach |
|----------|---------------|
| `animate` sub-concerns | Benchmark each extracted function in isolation (e.g., `lerpNodes` with 8k nodes) |
| `sceneNeedsContinuousFrame` | Micro-benchmark with worst-case state (all flags true) |

---

## 8. Summary

| Phase | Files created | LOC moved | Net LOC change | Risk |
|-------|---------------|-----------|----------------|------|
| 0 — State object | 1 (`three-engine-state.ts`) | ~60 | +60 (new file) | Medium |
| 1 — Pure helpers | 1 (`three-engine-helpers.ts`) | ~35 | +35 | Zero |
| 2 — Impure helpers | 1 (`three-engine-timers.ts`) | ~25 | +25 | Low |
| 3 — Sub-orchestrators | 6 files | ~230 | +230 | Medium |
| 4 — Render loop | 8 files | ~295 | +295 | High |
| 5 — Orchestrator slim | 0 (rewrite core) | −851 | −851 | High |
| **Total** | **17 new files** | **~645 moved** | **core: 971 → ~120** | |

### Recommended execution order

1. **Phase 0** first — state object is the foundation
2. **Phase 1** in parallel with Phase 0 review — zero-risk, builds momentum
3. **Phase 2** — mechanical, low-risk
4. **Phase 3** — one file per commit, each with integration test
5. **Phase 4** — design review first, then one concern per commit
6. **Phase 5** — final orchestrator rewrite after all extractions validated

### Key design decisions needed

1. **State object pattern**: Singleton `engineState` vs. parameter injection? (Recommendation: singleton for render-loop perf, parameter injection for pure helpers)
2. **FrameContext struct**: Should `animate()` sub-functions receive a pre-built `FrameContext` or individual parameters? (Recommendation: `FrameContext` for A5/A7/A13 which need many fields)
3. **DEV-only code**: Keep `three-dev-bridge.ts` DEV-gated or always import? (Recommendation: keep `import.meta.env.DEV` guard, tree-shaken)
4. **Yield interleaving**: Preserve exact yield points in `three-geometry-init.ts` — do not reorder
5. **Error boundary**: Keep the try/catch circuit-breaker in the orchestrator, not in sub-functions
