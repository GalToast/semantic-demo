# `three-interaction-visuals.ts` Decomposition Plan

> **Source**: `src/lib/engine/three-interaction-visuals.ts` (915 LOC pre-extraction; 656 LOC at HEAD `b23b4ad9` after the Phase-5 cuts landed + `dcf542aa` extracted the micro-demo bridge block into its own file)  
> **Pattern reference**: `docs/three-engine-decomposition-plan.md` (Worker D, three-engine-core.ts)  
> **Status**: Research only — DO NOT implement
>
> **Update (2026-07-13):** `src/lib/engine/three-lens-halos.ts` (the Phase 3 halos
> extraction listed in the inventories below) was **removed** — it was extracted but
> never wired in (0 importers at runtime), making it a dead duplicate of the inline halo
> logic that still lives in `initSemanticLens()` in `three-interaction-visuals.ts`
> (the `state.focusHalo` create / dispose / per-frame path). The other Phase-3
> `three-lens-*` modules (anchor-bloom, filaments, focusgeo, glow-spoke, motes, petals)
> remain because they ARE referenced. Don't re-attempt the abandoned halos extraction.
>
> **Update (2026-07-16):** The `Cluster C — Micro-demo bridge` block (then cited as `L862–915`, with `_demoHighlightNode` / `_demoHighlightBoost` / `_onDemoNodeHighlight` / `_onDemoNamePulse`) was extracted into its own file `src/lib/engine/three-micro-demo-bridge.ts` via commit `dcf542aa` (2026-06-28). As a result, `three-interaction-visuals.ts` shrank from `915 LOC` to `656 LOC` at HEAD, and the per-row `L862–915` / `L872–880` cites in §1 (rows #14), §3, §4 (U6), and §5 of this plan are **historical pre-extraction snapshots** — they no longer match current line numbers. The remaining downstream action against that bridge is its own retirement (inline into the caller), audited separately by Worker B under `tmp/w52-three-micro-demo-bridge-REPORT.md` (RETIRE decision documented; ready to land pending commit on the caller's uncommitted `disposeFocusPocketSizeMesh` edit).

---

## 1. Function Inventory

| #         | Function                                             | Lines   | LOC     | Reads Module State                                                                                                                                                                                                                                                                                                                  | Writes Module State                                                                                                                                                                                                                       | Side Effects                                                                                                        | Purity                |
| --------- | ---------------------------------------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1         | `asSingleMaterial`                                   | 69–75   | 7       | –                                                                                                                                                                                                                                                                                                                                   | –                                                                                                                                                                                                                                         | –                                                                                                                   | ✅ **Pure**           |
| 2         | `asShaderMaterial`                                   | 77–80   | 4       | –                                                                                                                                                                                                                                                                                                                                   | –                                                                                                                                                                                                                                         | –                                                                                                                   | ✅ **Pure**           |
| 3         | `asColorMaterial`                                    | 82–86   | 5       | –                                                                                                                                                                                                                                                                                                                                   | –                                                                                                                                                                                                                                         | –                                                                                                                   | ✅ **Pure**           |
| 4         | `isSemanticDiveActive`                               | 87–93   | 7       | `state.semanticDiveMode`, `state.trailDepth`                                                                                                                                                                                                                                                                                        | –                                                                                                                                                                                                                                         | –                                                                                                                   | ✅ **Data-dependent** |
| 5         | `getSemanticLensNeighborIndices`                     | 100–113 | 14      | `state.points`, `state.semanticNeighborMapByLeadId`, `state.pointIndexByLeadId`, `state.nodePositions`                                                                                                                                                                                                                              | –                                                                                                                                                                                                                                         | –                                                                                                                   | ✅ **Data-dependent** |
| 6         | `updateSelectedNodeMotes`                            | 115–155 | 41      | `state.focusMoteGroup`, `state.focusMotes`                                                                                                                                                                                                                                                                                          | `state.focusMoteGroup.{visible,position,rotation}`, per-mote `material.{opacity,visible}`, `mote.{position,scale}`                                                                                                                        | Three.js mesh mutations                                                                                             | ❌ Impure             |
| 7         | `updateSelectedNodePetals`                           | 156–195 | 40      | `state.focusPetalGroup`, `state.focusPetals`                                                                                                                                                                                                                                                                                        | `state.focusPetalGroup.{visible,position,rotation}`, per-petal `material.{opacity,visible,rotation}`, `petal.{position,scale}`                                                                                                            | Three.js mesh mutations                                                                                             | ❌ Impure             |
| 8         | `updateSelectedNodeFilaments`                        | 196–258 | 63      | `state.focusFilaments`                                                                                                                                                                                                                                                                                                              | `state.focusFilaments.{visible,material.opacity}`, `geometry.attributes.position.array` + `needsUpdate`                                                                                                                                   | Three.js buffer mutations                                                                                           | ❌ Impure             |
| 9         | `disposeInteractionVisuals`                          | 259–275 | 17      | `_onDemoNodeHighlight`, `_onDemoNamePulse`                                                                                                                                                                                                                                                                                          | Same two to null                                                                                                                                                                                                                          | `document.removeEventListener`, calls 3 dispose fns                                                                 | ❌ Impure             |
| 10        | `disposeSemanticLens`                                | 277–334 | 58      | All 12 lens-related state vars                                                                                                                                                                                                                                                                                                      | All 12 to null/empty                                                                                                                                                                                                                      | `scene.remove()`, `disposeObject3D()`, `.dispose()`                                                                 | ❌ Impure             |
| 11        | `initSemanticManifold`                               | 335–401 | 67      | `state.scene`                                                                                                                                                                                                                                                                                                                       | `state.semanticManifold`                                                                                                                                                                                                                  | `new CircleGeometry`, `new ShaderMaterial`, `scene.add()`                                                           | ❌ Impure             |
| 12        | `initSemanticLens`                                   | 402–650 | **249** | `state.scene`, `state.anchorBloomLight`                                                                                                                                                                                                                                                                                             | 12 state vars (`semanticLensGroup`, `semanticLensGlow`, `semanticLensSpokes`, `focusLens`, `anchorBloomLight`, `focusHalo`, `focusCore`, `hoverHalo`, `focusMoteGroup`, `focusMotes`, `focusPetalGroup`, `focusPetals`, `focusFilaments`) | Massive: 13 Three.js geometries, 10 materials, 1 PointLight, 12 `scene.add()` calls, `createFocusAnchorIndicator()` | ❌ **Megafn**         |
| 13        | `updateInteractionVisuals`                           | 651–915 | **264** | `state.pointsMesh`, `state.focusCore`, `state.focusHalo`, `state.hoverHalo`, `state.semanticLensGroup`, `state.semanticLensGlow`, `state.semanticLensSpokes`, `state.focusLens`, `state.anchorBloomLight`, `state.nodePositions`, `state.semanticDiveMode`, `state.focusMoteGroup`, `state.focusPetalGroup`, `state.focusFilaments` | All the above + `material.{opacity,color,scale,position,rotation}`, `geometry.attributes`, `uniforms.*.value`                                                                                                                             | Three.js mesh/material/uniform mutations, `localToWorld()`, `updateFocusAnchorIndicator()`                          | ❌ **Megafn**         |
| —         | Micro-demo bridge (module-scope)                     | 862–915 | 54      | `_demoHighlightNode`, `_demoHighlightBoost`, `_onDemoNodeHighlight`, `_onDemoNamePulse`, `state.pointsMaterial`, `state.nodePositions`                                                                                                                                                                                              | Same 4 module vars                                                                                                                                                                                                                        | `document.addEventListener`, `document.querySelector`, `setTimeout`                                                 | ❌ Impure             |
| **Total** | 12 exports + 1 private helper + 1 module-scope block |         | **915** |                                                                                                                                                                                                                                                                                                                                     |                                                                                                                                                                                                                                           |                                                                                                                     |                       |

### Purity summary

| Category                                          | Functions                                                                            | Total LOC |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- |
| Pure (zero state, no side effects)                | `asSingleMaterial`, `asShaderMaterial`, `asColorMaterial`                            | 16        |
| Deterministic data-dependent (reads `state` only) | `isSemanticDiveActive`, `getSemanticLensNeighborIndices`                             | 21        |
| Per-frame impure (Three.js mutations)             | `updateSelectedNodeMotes`, `updateSelectedNodePetals`, `updateSelectedNodeFilaments` | 144       |
| Lifecycle / teardown                              | `disposeInteractionVisuals`, `disposeSemanticLens`, `initSemanticManifold`           | 142       |
| Megafn (init)                                     | `initSemanticLens`                                                                   | 249       |
| Megafn (per-frame)                                | `updateInteractionVisuals`                                                           | 264       |
| Module-scope side-effect block                    | Micro-demo bridge                                                                    | 54        |

---

## 2. State Dependency Graph

### 2.1 Module-level state (this file)

| Variable                      | Read by                             | Write by                                                     |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| `_demoHighlightNode` (L862)   | Micro-demo handler block (L872–880) | Same block                                                   |
| `_demoHighlightBoost` (L863)  | Micro-demo handler block (L872–880) | Same block                                                   |
| `_onDemoNodeHighlight` (L867) | `disposeInteractionVisuals` (L267)  | Module-scope init (L898), `disposeInteractionVisuals` (L269) |
| `_onDemoNamePulse` (L868)     | `disposeInteractionVisuals` (L272)  | Module-scope init (L900), `disposeInteractionVisuals` (L274) |

### 2.2 External `state` object fields (from `app.svelte`)

| State field                         | Read by                                                                       | Write by               |
| ----------------------------------- | ----------------------------------------------------------------------------- | ---------------------- |
| `state.scene`                       | `initSemanticManifold`, `initSemanticLens`, `disposeSemanticLens`             | —                      |
| `state.pointsMesh`                  | `updateInteractionVisuals` (localToWorld)                                     | —                      |
| `state.points`                      | `getSemanticLensNeighborIndices`                                              | —                      |
| `state.semanticNeighborMapByLeadId` | `getSemanticLensNeighborIndices`                                              | —                      |
| `state.pointIndexByLeadId`          | `getSemanticLensNeighborIndices`                                              | —                      |
| `state.nodePositions`               | `getSemanticLensNeighborIndices`, `updateInteractionVisuals` (×4), micro-demo | —                      |
| `state.semanticDiveMode`            | `isSemanticDiveActive`, `updateInteractionVisuals`                            | —                      |
| `state.trailDepth`                  | `isSemanticDiveActive`                                                        | —                      |
| `state.semanticManifold`            | `disposeSemanticLens`                                                         | `initSemanticManifold` |
| `state.semanticLensGroup`           | `updateInteractionVisuals`, `disposeSemanticLens`                             | `initSemanticLens`     |
| `state.semanticLensGlow`            | `updateInteractionVisuals`, `disposeSemanticLens`                             | `initSemanticLens`     |
| `state.semanticLensSpokes`          | `updateInteractionVisuals`, `disposeSemanticLens`                             | `initSemanticLens`     |
| `state.focusLens`                   | `updateInteractionVisuals`, `disposeSemanticLens`                             | `initSemanticLens`     |
| `state.anchorBloomLight`            | `updateInteractionVisuals`, `disposeSemanticLens`                             | `initSemanticLens`     |
| `state.focusHalo`                   | `updateInteractionVisuals`, `disposeSemanticLens`                             | `initSemanticLens`     |
| `state.focusCore`                   | `updateInteractionVisuals`, `disposeSemanticLens`                             | `initSemanticLens`     |
| `state.hoverHalo`                   | `updateInteractionVisuals`, `disposeSemanticLens`                             | `initSemanticLens`     |
| `state.focusMoteGroup`              | `updateSelectedNodeMotes`, `disposeSemanticLens`                              | `initSemanticLens`     |
| `state.focusMotes`                  | `updateSelectedNodeMotes`, `disposeSemanticLens`                              | `initSemanticLens`     |
| `state.focusPetalGroup`             | `updateSelectedNodePetals`, `disposeSemanticLens`                             | `initSemanticLens`     |
| `state.focusPetals`                 | `updateSelectedNodePetals`, `disposeSemanticLens`                             | `initSemanticLens`     |
| `state.focusFilaments`              | `updateSelectedNodeFilaments`, `disposeSemanticLens`                          | `initSemanticLens`     |
| `state.pointsMaterial`              | Micro-demo block                                                              | —                      |

### 2.3 State coupling clusters

**Cluster A — Per-frame visual targets** (read-only from `state`, write to Three.js objects):

- `state.nodePositions`, `state.semanticDiveMode`, `state.trailDepth`, `state.pointsMesh`
- Read by: `updateInteractionVisuals`, `updateSelectedNodeMotes/Petals/Filaments`, `getSemanticLensNeighborIndices`

**Cluster B — Lens lifecycle** (created in `initSemanticLens`, disposed in `disposeSemanticLens`, updated in `updateInteractionVisuals`):

- 12 state vars: `semanticLensGroup`, `semanticLensGlow`, `semanticLensSpokes`, `focusLens`, `anchorBloomLight`, `focusHalo`, `focusCore`, `hoverHalo`, `focusMoteGroup`, `focusMotes`, `focusPetalGroup`, `focusPetals`, `focusFilaments`

**Cluster C — Micro-demo bridge** (module-level state, event listeners):

- `_demoHighlightNode`, `_demoHighlightBoost`, `_onDemoNodeHighlight`, `_onDemoNamePulse`
- Only the micro-demo block + `disposeInteractionVisuals` touch these

---

## 3. `initSemanticLens()` Concern Breakdown (L402–650, ~249 LOC)

| Concern                             | Lines   | LOC | Description                                                                                                                     |
| ----------------------------------- | ------- | --- | ------------------------------------------------------------------------------------------------------------------------------- |
| **L1 — Pre-flight + dispose guard** | 403–409 | 7   | `state.scene` null check, call `disposeSemanticLens()` for idempotency                                                          |
| **L2 — semanticLensGroup creation** | 410–414 | 5   | `new Group()`, set `visible=false`, `scene.add()`                                                                               |
| **L3 — Lens glow material + mesh**  | 415–447 | 33  | `SphereGeometry`, `ShaderMaterial` with `uTime/uColor/uOpacity/uSignalScore` uniforms, `BackSide` glow shader, `renderOrder=-1` |
| **L4 — Spoke geometry + material**  | 449–484 | 36  | `BufferGeometry` with position+alpha attributes, `LineSegments` with wave-animated shader                                       |
| **L5 — Focus lens (icosahedron)**   | 485–527 | 43  | `IcosahedronGeometry`, `ShaderMaterial` with fresnel + pulse, `AdditiveBlending`, `visible=false`                               |
| **L6 — Anchor bloom light**         | 528–537 | 10  | Guarded `PointLight` cleanup + recreation, `0xfff4ba`, intensity=0                                                              |
| **L7 — Focus anchor indicator**     | 539–542 | 4   | `createFocusAnchorIndicator()` delegation                                                                                       |
| **L8 — Focus halo + core**          | 543–563 | 21  | Two `CircleGeometry` meshes, `MeshBasicMaterial` with `AdditiveBlending`, both `visible=false`                                  |
| **L9 — Hover halo**                 | 564–578 | 15  | `CircleGeometry`, `MeshBasicMaterial`, distinct color `0x8ff8ed`                                                                |
| **L10 — Focus motes**               | 581–609 | 29  | `Group`, 12 `Mesh` objects with `userData` (phase/speed/radius/scale/lift/drift/tilt), shared `CircleGeometry`                  |
| **L11 — Focus petals**              | 610–635 | 26  | `Group`, 8 `Mesh` objects with `userData` (phase/speed/radius/length/thickness/lift/tilt), shared `PlaneGeometry`               |
| **L12 — Focus filaments**           | 636–650 | 15  | `Float32Array`, `BufferGeometry`, `LineBasicMaterial`, `LineSegments`                                                           |

### Concern grouping for extraction

| Group                  | Concerns | LOC | Extraction target               |
| ---------------------- | -------- | --- | ------------------------------- |
| Pre-flight             | L1       | 7   | Inline in orchestrator          |
| Group scaffolding      | L2       | 5   | Inline in orchestrator          |
| Glow + spoke materials | L3, L4   | 69  | `lens-glow-spoke.ts`            |
| Focus lens             | L5       | 43  | `lens-focus.ts`                 |
| Anchor bloom light     | L6       | 10  | `lens-anchor-bloom.ts`          |
| Anchor indicator       | L7       | 4   | Already delegated — keep inline |
| Halo + core + hover    | L8, L9   | 36  | `lens-halos.ts`                 |
| Motes                  | L10      | 29  | `lens-motes.ts`                 |
| Petals                 | L11      | 26  | `lens-petals.ts`                |
| Filaments              | L12      | 15  | `lens-filaments.ts`             |

---

## 4. `updateInteractionVisuals()` Concern Breakdown (L651–915, ~264 LOC)

| Concern                                      | Lines   | LOC | Description                                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | ------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **U0 — Hover halo reset**                    | 667–671 | 5   | Reset `hoverHalo.material.opacity=0`, `visible=false`                                                                                                                                                                                                                                           |
| **U1 — Focus core + halo + aura**            | 672–729 | 58  | Compute `auraTargetOpacity`, `coreTargetOpacity`, `baseScale` from `isInside/isActive`; lerp `focusHalo.{opacity,color,scale,position}` with aura pulse; lerp `focusCore.{opacity,color,scale}` with core pulse; compute `worldPos` via `localToWorld`; delegate to mote/petal/filament updates |
| **U2 — Semantic lens group (glow + spokes)** | 730–800 | 71  | Fade glow in/out, update `uOpacity` + `uSignalScore` uniforms; compute spoke geometry (position+alpha arrays) from neighbor indices; `localToWorld` transforms                                                                                                                                  |
| **U3 — Focus lens (icosahedron)**            | 801–839 | 39  | Lerp `opacity/time/color` uniforms; position at focused node; rotation + pulse scale; `isDiving` variant                                                                                                                                                                                        |
| **U4 — Anchor bloom light**                  | 841–857 | 17  | Lerp `intensity`, position at focused node with `matrixWorld` transform                                                                                                                                                                                                                         |
| **U5 — Focus anchor indicator**              | 859–860 | 2   | `updateFocusAnchorIndicator(now, focusedNode)` delegation                                                                                                                                                                                                                                       |
| **U6 — Micro-demo bridge**                   | 862–915 | 54  | Module-scope: `_demoHighlightNode`, `_demoHighlightBoost`, two event listeners, `setTimeout` DOM mutation                                                                                                                                                                                       |

### Concern grouping for extraction

| Group              | Concerns | LOC | Extraction target                                              |
| ------------------ | -------- | --- | -------------------------------------------------------------- |
| Hover reset        | U0       | 5   | Inline or `update-hover-halo.ts`                               |
| Core + halo + aura | U1       | 58  | `update-focus-core.ts`                                         |
| Lens glow + spokes | U2       | 71  | `update-lens-glow-spokes.ts`                                   |
| Focus lens         | U3       | 39  | `update-focus-lens.ts`                                         |
| Anchor bloom       | U4       | 17  | `update-anchor-bloom.ts`                                       |
| Anchor indicator   | U5       | 2   | Already delegated — keep inline                                |
| Micro-demo         | U6       | 54  | `micro-demo-bridge.ts` (or remove if micro-demo is deprecated) |

---

## 5. Decomposition Proposal

### 5.1 Extraction strategy

Following the three-engine-core template: **pure helpers → parameter-injected helpers → state-coupled helpers → orchestrator slim-down**.

Key difference from three-engine-core: this file's state is **almost entirely external** (lives in `appState`, not module-local). Only 4 module-local vars exist (micro-demo). This means:

- Pure helpers extract with zero signature change.
- State-coupled helpers need **parameter injection of `state`** (or a lens-state sub-object), not a full state-object refactor.
- The mega-functions decompose into **concern-specific update functions** that receive a narrow `LensState` interface.

### 5.2 Proposed file layout

```
src/lib/engine/
├── three-interaction-visuals.ts       (orchestrator, ~80 LOC, down from 915)
├── three-interaction-visuals-state.ts (lens state interface + helpers, ~40 LOC)
├── three-lens-glow-spoke.ts           (L3+L4, ~70 LOC)
├── three-lens-focus.ts                (L5, ~45 LOC)
├── three-lens-anchor-bloom.ts         (L6, ~12 LOC)
├── three-lens-halos.ts                (L8+L9, ~40 LOC)
├── three-lens-motes.ts                (L10, ~30 LOC)
├── three-lens-petals.ts               (L11, ~28 LOC)
├── three-lens-filaments.ts            (L12, ~18 LOC)
├── three-focus-core.ts                (U1, ~60 LOC)
├── three-lens-glow-spoke-update.ts    (U2, ~75 LOC)
├── three-focus-lens-update.ts         (U3, ~42 LOC)
├── three-anchor-bloom-update.ts       (U4, ~20 LOC)
├── three-micro-demo-bridge.ts         (U6, ~55 LOC)
└── three-hover-halo.ts                (U0, ~8 LOC)
```

### 5.3 The `LensState` interface

Most state-coupled functions read/write the same ~12 `state.*` fields. Rather than injecting the entire `appState`, define a narrow interface:

```ts
// three-interaction-visuals-state.ts
export interface LensState {
    scene: Scene | null
    semanticLensGroup: Group | null
    semanticLensGlow: Mesh | null
    semanticLensSpokes: LineSegments | null
    focusLens: Mesh | null
    anchorBloomLight: PointLight | null
    focusHalo: Mesh | null
    focusCore: Mesh | null
    hoverHalo: Mesh | null
    focusMoteGroup: Group | null
    focusMotes: Mesh[]
    focusPetalGroup: Group | null
    focusPetals: Mesh[]
    focusFilaments: LineSegments | null
    semanticManifold: Mesh | null
}

// Helper: build LensState from appState (keeps orchestrator as single source of truth)
export function getLensState(state: AppState): LensState { ... }

// Helper: dispose all LensState objects (extracted from disposeSemanticLens)
export function disposeLensState(lens: LensState, scene: Scene | null): void { ... }
```

This avoids a full state-object refactor (the 12 fields already live in `appState`) while giving each extracted function a narrow, testable interface.

### 5.4 Phased extraction order

#### Phase 0 — `LensState` interface + dispose helper (prerequisite)

**File**: `three-interaction-visuals-state.ts`  
**LOC**: ~40  
**What**: Define `LensState` interface, `getLensState()` helper, `disposeLensState()` (extracted from `disposeSemanticLens`).  
**Why**: All subsequent extractions depend on this interface.  
**Risk**: Medium — `disposeSemanticLens` is 58 LOC of careful null-checking; must preserve exact disposal order.

#### Phase 1 — Pure helpers (zero-risk)

**File**: `three-interaction-visuals.ts` (keep inline, no new file needed)  
**LOC**: 16  
**Extracts**: `asSingleMaterial`, `asShaderMaterial`, `asColorMaterial`  
**Risk**: ✅ Zero — pure functions, no state, no side effects.  
**Test seam**: ✅ Trivially unit-testable with mock `Material` arrays.  
**Decision**: Keep in main file (too small to justify a new file). Could later move to `three-material-helpers.ts` if other files need them.

#### Phase 2 — Data-dependent helpers (near-zero-risk)

**File**: `three-interaction-visuals.ts` (keep inline)  
**LOC**: 21  
**Extracts**: `isSemanticDiveActive`, `getSemanticLensNeighborIndices`  
**Signature change**: `isSemanticDiveActive(state: AppState): boolean`, `getSemanticLensNeighborIndices(state: AppState, focusedNode: number): number[]`  
**Risk**: ✅ Near-zero — only read `state`, no writes, no side effects.  
**Test seam**: ✅ Mock `AppState` with controlled `points/semanticNeighborMapByLeadId/pointIndexByLeadId/nodePositions`.

#### Phase 3 — Init concern extractions (low-risk, mechanical)

| File                         | LOC | Source concerns | Risk                                      |
| ---------------------------- | --- | --------------- | ----------------------------------------- |
| `three-lens-glow-spoke.ts`   | ~70 | L3, L4          | Low — isolated material+geometry creation |
| `three-lens-focus.ts`        | ~45 | L5              | Low — single mesh creation                |
| `three-lens-anchor-bloom.ts` | ~12 | L6              | Low — single light creation               |
| `three-lens-halos.ts`        | ~40 | L8, L9          | Low — 3 mesh creations                    |
| `three-lens-motes.ts`        | ~30 | L10             | Low — group + 12 meshes                   |
| `three-lens-petals.ts`       | ~28 | L11             | Low — group + 8 meshes                    |
| `three-lens-filaments.ts`    | ~18 | L12             | Low — single LineSegments                 |

**Pattern for each**:

```ts
// three-lens-motes.ts (example)
import { Group, Mesh, CircleGeometry, MeshBasicMaterial, AdditiveBlending, DoubleSide } from 'three'
import { SCENE_PALETTE } from '@lib/utils/design-tokens'
import type { LensState } from './three-interaction-visuals-state'

export function createFocusMotes(lens: LensState): void {
    const group = new Group()
    group.visible = false
    // ... (L10 body)
    lens.focusMoteGroup = group
    lens.focusMotes = [...]
}
```

**Extraction approach**: Each concern becomes a `create*` function that mutates the `LensState` object. `initSemanticLens()` becomes a orchestrator that calls each `create*` in order.

**Risk**: ✅ Low — each function creates Three.js objects and assigns to `LensState`. No shared mutable state between functions. Order is preserved by the orchestrator.

#### Phase 4 — Per-frame update extractions (medium-risk, hot path)

| File                              | LOC | Source concerns | Risk                                                           |
| --------------------------------- | --- | --------------- | -------------------------------------------------------------- |
| `three-focus-core.ts`             | ~60 | U1              | Medium — 58 LOC, multiple state reads, `localToWorld`          |
| `three-lens-glow-spoke-update.ts` | ~75 | U2              | Medium — 71 LOC, buffer mutations, `calculateSignalScore` call |
| `three-focus-lens-update.ts`      | ~42 | U3              | Low — 39 LOC, uniform mutations                                |
| `three-anchor-bloom-update.ts`    | ~20 | U4              | Low — 17 LOC, intensity lerp                                   |
| `three-hover-halo.ts`             | ~8  | U0              | Low — 5 LOC, opacity reset                                     |

**Pattern for each**:

```ts
// three-focus-lens-update.ts (example)
import type { LensState } from './three-interaction-visuals-state'
import type { AppState } from '@lib/state/app-svelte'
import { asShaderMaterial } from 'three' // or from material helpers

export function updateFocusLens(lens: LensState, appState: AppState, time: number, focusedNode: number | null): void {
    // ... (U3 body)
}
```

**Signature convention**: Each update function receives `(lens: LensState, appState: AppState, time: number, focusedNode: number | null)`. The `appState` parameter is needed for `nodePositions`, `pointsMesh`, `semanticDiveMode`, etc.

**Risk**: ⚠️ Medium — these are in the per-frame hot path. Function call overhead must be measured. Each function previously ran inline in `updateInteractionVisuals`; now there's an extra call per concern. Mitigation: keep functions small, allow V8 to inline them.

#### Phase 5 — Micro-demo bridge extraction (low-risk, isolated)

**File**: `three-micro-demo-bridge.ts`  
**LOC**: ~55  
**What**: Move the entire module-scope micro-demo block (L862–915) into a self-contained module with `initMicroDemoBridge()` and `disposeMicroDemoBridge()` exports.  
**Why**: Eliminates 4 module-local vars and the IIFE-style side-effect block from the main file.  
**Risk**: ✅ Low — isolated feature, no interaction with lens logic. May be deprecated; check usage before investing.

#### Phase 6 — Orchestrator slim-down

After all extractions, `three-interaction-visuals.ts` becomes:

```ts
// ~80 LOC
export function initSemanticManifold() { ... }  // keep (67 LOC, single concern)
export function initSemanticLens() {
    if (!state.scene) { debugWarn(...); return }
    disposeSemanticLens()
    initSemanticLensGroup(state.scene)
    createSemanticLensGlow(lensState)
    createSemanticLensSpokes(lensState)
    createFocusLens(lensState)
    createAnchorBloomLight(state.scene, lensState)
    createFocusAnchorIndicator()
    createFocusHalos(state.scene, lensState)
    createFocusMotes(state.scene, lensState)
    createFocusPetals(state.scene, lensState)
    createFocusFilaments(state.scene, lensState)
}
export function updateInteractionVisuals(now, hoveredNode, focusedNode) {
    const time = now / 1000
    if (!state.pointsMesh) return
    resetHoverHalo(lensState)
    updateFocusCore(lensState, state, time, focusedNode)
    updateSemanticLensGlowAndSpokes(lensState, state, time, focusedNode)
    updateFocusLens(lensState, state, time, focusedNode)
    updateAnchorBloomLight(lensState, state, time, focusedNode)
    updateFocusAnchorIndicator(now, focusedNode)
}
export function disposeInteractionVisuals() {
    disposeSemanticLens()
    disposeFocusAnchorIndicator()
    disposeHeroAnimation()
    disposeMicroDemoBridge()
}
export function disposeSemanticLens() {
    disposeLensState(lensState, state.scene)
}
```

**Target LOC**: ~80 (down from 915), with all Three.js creation/update logic in sibling files.

---

## 6. Risk Assessment

### 6.1 Zero-risk extractions (pure functions, no state)

| Function           | File        | Risk    | Rationale                         |
| ------------------ | ----------- | ------- | --------------------------------- |
| `asSingleMaterial` | Keep inline | ✅ Zero | Pure, narrows Three.js type union |
| `asShaderMaterial` | Keep inline | ✅ Zero | Pure                              |
| `asColorMaterial`  | Keep inline | ✅ Zero | Pure                              |

### 6.2 Near-zero-risk extractions (data-dependent, read-only)

| Function                         | File        | Risk         | Rationale                       |
| -------------------------------- | ----------- | ------------ | ------------------------------- |
| `isSemanticDiveActive`           | Keep inline | ✅ Near-zero | Reads 2 state fields, no writes |
| `getSemanticLensNeighborIndices` | Keep inline | ✅ Near-zero | Reads 4 state fields, no writes |

### 6.3 Low-risk extractions (isolated Three.js creation)

| Function                     | File                           | Risk   | Rationale                                |
| ---------------------------- | ------------------------------ | ------ | ---------------------------------------- |
| `initSemanticManifold`       | Keep inline                    | ✅ Low | 67 LOC, single concern, already separate |
| Lens glow + spoke creation   | `three-lens-glow-spoke.ts`     | ✅ Low | Isolated material+geometry               |
| Focus lens creation          | `three-lens-focus.ts`          | ✅ Low | Single mesh                              |
| Anchor bloom creation        | `three-lens-anchor-bloom.ts`   | ✅ Low | Single light                             |
| Halo + core + hover creation | `three-lens-halos.ts`          | ✅ Low | 3 meshes, no interdependencies           |
| Mote creation                | `three-lens-motes.ts`          | ✅ Low | Group + 12 meshes                        |
| Petal creation               | `three-lens-petals.ts`         | ✅ Low | Group + 8 meshes                         |
| Filament creation            | `three-lens-filaments.ts`      | ✅ Low | Single LineSegments                      |
| Focus lens update            | `three-focus-lens-update.ts`   | ✅ Low | Uniform mutations only                   |
| Anchor bloom update          | `three-anchor-bloom-update.ts` | ✅ Low | Intensity lerp                           |
| Hover halo reset             | `three-hover-halo.ts`          | ✅ Low | Opacity reset                            |
| Micro-demo bridge            | `three-micro-demo-bridge.ts`   | ✅ Low | Isolated feature                         |

### 6.4 Medium-risk extractions (state-coupled, hot path)

| Function                          | File                                 | Risk      | Rationale                                                                               |
| --------------------------------- | ------------------------------------ | --------- | --------------------------------------------------------------------------------------- |
| `disposeSemanticLens`             | `three-interaction-visuals-state.ts` | ⚠️ Medium | 58 LOC, 12 null assignments + dispose calls; must preserve order                        |
| `updateFocusCore`                 | `three-focus-core.ts`                | ⚠️ Medium | 58 LOC, delegates to 3 sub-updates, `localToWorld`, multiple state reads                |
| `updateSemanticLensGlowAndSpokes` | `three-lens-glow-spoke-update.ts`    | ⚠️ Medium | 71 LOC, buffer mutations, `calculateSignalScore` call, `getSemanticLensNeighborIndices` |

### 6.5 High-risk extractions (design review required)

| Function                                  | File                           | Risk    | Rationale                                                                                                                                                                                      |
| ----------------------------------------- | ------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initSemanticLens` (orchestrator)         | `three-interaction-visuals.ts` | 🔴 High | 249 LOC → orchestrator; must preserve creation order (glow→spokes→lens→light→halos→motes→petals→filaments); `createFocusAnchorIndicator()` delegation; idempotency via `disposeSemanticLens()` |
| `updateInteractionVisuals` (orchestrator) | `three-interaction-visuals.ts` | 🔴 High | 264 LOC → orchestrator; per-frame hot path; 6 concerns with shared `time`/`focusedNode`/`isInside` computations; function call overhead regression risk                                        |

### 6.6 No-go-without-review extractions

| Function                                        | Reason                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `updateInteractionVisuals` sub-concern ordering | U0→U1→U2→U3→U4→U5 has implicit data flow: `worldPos` computed in U1 is consumed by U2/U3/U4; `isInside`/`isDiving` computed independently in each concern. Extracting requires either (a) pre-computing shared values and passing them, or (b) a `FrameContext` struct. Needs design review.             |
| `initSemanticLens` creation order               | L3→L4 (glow before spokes) and L8→L9 (halo before core before hover) have no data dependency, but L10→L11→L12 (motes→petals→filaments) all write to `state.scene`. Order doesn't matter for correctness but **must not be changed** without testing visual regression.                                   |
| `updateSelectedNodeMotes/Petals/Filaments`      | These are called from within U1 (focus core update). Extracting them to separate files requires passing `(worldPos, time, isInside)` — already done. But they're also **performance-sensitive** (12 motes × sin calculations, 8 petals, 18×18 filaments). Function call overhead regression test needed. |

---

## 7. Test Seam Opportunities

### 7.1 Immediately unit-testable (Phase 1–2)

| Function                         | Test approach                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `asSingleMaterial`               | Table: single mat, array of 1, array of many (returns first), empty array (throws)                                                            |
| `asShaderMaterial`               | Table: ShaderMaterial → instance, MeshBasicMaterial → null, array → first element check                                                       |
| `asColorMaterial`                | Table: material with Color → narrowed, material without color → null                                                                          |
| `isSemanticDiveActive`           | Table: `semanticDiveMode=true` → true, `trailDepth=2` → true, both false → false                                                              |
| `getSemanticLensNeighborIndices` | Mock `state.points[focusedNode].lead_id`, mock `semanticNeighborMapByLeadId.get()`, mock `pointIndexByLeadId`; verify filtering + slice(0,12) |

### 7.2 Unit-testable with mock Three.js (Phase 3)

| Function               | Test approach                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `createFocusMotes`     | Mock `scene.add()`, verify `lens.focusMotes.length === 12`, verify `userData` fields |
| `createFocusPetals`    | Verify `lens.focusPetals.length === 8`, verify `side: DoubleSide`                    |
| `createFocusFilaments` | Verify `Float32Array` size = `18 * 19 * 2 * 3`                                       |
| `createFocusLens`      | Verify `material.uniforms.opacity.value === 0`, `visible === false`                  |
| `disposeLensState`     | Mock `disposeObject3D`, verify all 12 fields null after call                         |

### 7.3 Unit-testable with mock state (Phase 4)

| Function                          | Test approach                                                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `updateFocusLens`                 | Mock `LensState` with known `focusLens.material.uniforms`, call with `focusedNode=0`, verify `opacity/time/color` uniforms updated              |
| `updateAnchorBloomLight`          | Mock `LensState` with `anchorBloomLight`, verify `intensity` lerp, verify `position.set` + `applyMatrix4`                                       |
| `updateFocusCore`                 | Mock `LensState` + `AppState`, verify `focusHalo.opacity` lerp, verify `focusCore.scale` pulse, verify `localToWorld` called                    |
| `updateSemanticLensGlowAndSpokes` | Mock `LensState` + `AppState` with 2 neighbors, verify `positions` array has 12 floats (2 points × 3 coords × 2 endpoints), verify `alphas` set |

### 7.4 Integration-testable (Phase 6)

| Function                                  | Test approach                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `initSemanticLens` (orchestrator)         | Mock all `create*` functions, verify call order matches original L2→L12   |
| `updateInteractionVisuals` (orchestrator) | Mock all `update*` functions, verify call order matches original U0→U5    |
| `disposeSemanticLens`                     | Real `LensState` with real Three.js objects, verify all disposed + nulled |
| `disposeInteractionVisuals`               | Verify `disposeMicroDemoBridge()` called + listeners removed              |

### 7.5 Performance-testable (Phase 4)

| Function                          | Test approach                                                        |
| --------------------------------- | -------------------------------------------------------------------- |
| `updateInteractionVisuals` (full) | Benchmark with 8k nodes, measure frame time before/after extraction  |
| `updateFocusCore`                 | Isolated benchmark: 12 motes + 8 petals + 18 filaments × 18 segments |
| `updateSemanticLensGlowAndSpokes` | Benchmark with 12 neighbors (max spoke count)                        |

---

## 8. Summary

| Phase                             | Files created                            | LOC moved      | Net LOC change      | Risk      |
| --------------------------------- | ---------------------------------------- | -------------- | ------------------- | --------- |
| 0 — LensState interface + dispose | 1 (`three-interaction-visuals-state.ts`) | ~40            | +40                 | Medium    |
| 1 — Pure helpers                  | 0 (keep inline)                          | 0              | 0                   | Zero      |
| 2 — Data-dependent helpers        | 0 (keep inline)                          | 0              | 0                   | Near-zero |
| 3 — Init concern creation         | 7 files                                  | ~233           | +233                | Low       |
| 4 — Per-frame update              | 5 files                                  | ~205           | +205                | Medium    |
| 5 — Micro-demo bridge             | 1 (`three-micro-demo-bridge.ts`)         | ~55            | +55                 | Low       |
| 6 — Orchestrator slim             | 0 (rewrite main)                         | −835           | −835                | High      |
| **Total**                         | **14 new files**                         | **~533 moved** | **main: 915 → ~80** |           |

### Recommended execution order

1. **Phase 0** first — `LensState` interface is the foundation for all extractions
2. **Phase 1 + 2** in parallel with Phase 0 review — zero-risk, build momentum
3. **Phase 3** — one file per commit, each with unit test; low risk, high confidence
4. **Phase 4** — one file per commit, each with unit test + perf benchmark
5. **Phase 5** — micro-demo bridge (check if still needed first)
6. **Phase 6** — final orchestrator rewrite after all extractions validated

### Key design decisions needed

1. **`LensState` vs full parameter injection**: Narrow `LensState` interface (recommended) vs passing individual parameters? Narrow interface is cleaner but requires a `getLensState()` adapter from `appState`.
2. **FrameContext struct**: Should `updateInteractionVisuals` sub-functions receive a pre-built `FrameContext` (with pre-computed `time`, `isInside`, `isDiving`, `worldPos`) or individual parameters? `FrameContext` reduces redundant computation but adds struct allocation. Recommendation: **pre-compute shared values once in the orchestrator, pass as a `FrameContext` struct**.
3. **Micro-demo bridge**: Is the micro-demo feature still active? If deprecated, delete rather than extract. If active, extract to `three-micro-demo-bridge.ts`.
4. **Function call overhead**: V8 will inline small functions, but the per-frame hot path (6 function calls vs inline) needs benchmarking. Consider keeping `updateSelectedNodeMotes/Petals/Filaments` inline if regression > 0.1ms.
5. **`initSemanticManifold`**: Already 67 LOC and well-isolated. Keep inline or extract to `three-semantic-manifold.ts`? Recommendation: extract for consistency with the pattern, but lowest priority.
