# TypeScript Migration: WebGL/Three.js Module Reconciliation

## Summary

Reconciled all 7 `.ts` WebGL/Three modules against their `.js` runtime counterparts.
Removed `@ts-nocheck` from **all 6 remaining files** across two serial slices:

- **Slice 1 (prior worker):** three-thread-manager.ts, three-node-manager.ts, three-search-animations.ts
- **Slice 2 (this worker):** mycelium-engine.ts, three-engine.ts, three-interaction-visuals.ts

All 7 WebGL TS modules are now fully type-checked with zero `@ts-nocheck` remaining.

## Files Changed (Slice 2)

| File | Type | Change |
|---|---|---|
| `types/three-ambient.d.ts` | Declaration | Added OrbitControls ambient module, EventDispatcher class, PerspectiveCamera.lookAt(x,y,z) overload |
| `js/modules/mycelium-engine.ts` | Migration | Removed `@ts-nocheck`, added EdgePair/NeighborLike interfaces, typed all callback params, typed array literals, added non-null assertions |
| `js/modules/three-engine.ts` | Migration | Removed `@ts-nocheck`, typed module-level vars, cast WebGL context to WebGLRenderingContext, typed error/catch blocks, typed callback params, removed unused frameTime arg from updateMyceliumThreads call |
| `js/modules/three-interaction-visuals.ts` | Migration | Removed `@ts-nocheck`, typed filter type guard, non-null assertions on webglContext.scene, cast CustomEvent, cast HTMLElement for style access, fixed calculateSignalScore call arity drift |

## Files Changed (Slice 1 — prior worker, preserved)

| File | Type | Change |
|---|---|---|
| `types/three-ambient.d.ts` | Declaration | Added Euler.x/y/z, Object3D.frustumCulled, Material.uniforms/color, BufferAttribute.array, LineBasicMaterial.color, MeshBasicMaterial.map |
| `js/modules/three-thread-manager.ts` | Migration | Removed `@ts-nocheck`, added explicit callback param types, edgeSets guard |
| `js/modules/three-node-manager.ts` | Migration | Removed `@ts-nocheck`, added 7 type fixes |
| `js/modules/three-search-animations.ts` | Migration | Removed `@ts-nocheck`, added Record<string,any> type + 5 callback param types |

## TS/JS Drift Resolved (Slice 2)

- **Implicit any arrays**: 6 `EdgePair[]` typed array literals in mycelium-engine.ts
- **Implicit any callbacks**: 12 callback parameters explicitly typed across all 3 files
- **WebGL context narrowing**: `canvas.getContext()` cast to `WebGLRenderingContext | null` to resolve `getExtension`/`getParameter` errors
- **Error type narrowing**: catch blocks cast to `(error as Error)` for `.message` access
- **DOM type narrowing**: `querySelector` cast to `HTMLElement | null` for `.style` access
- **CustomEvent typing**: `e.detail` access via `(e as CustomEvent)` cast in addEventListener
- **Function arity drift**: `calculateSignalScore(state, focusIdx)` → `calculateSignalScore(state.points[focusIdx])` (JS signature takes 1 arg)
- **Unused argument**: `updateMyceliumThreads(frameNow)` → `updateMyceliumThreads()` (function takes 0 args)
- **Window augmentation**: `window.THREE` access via `(window as any).THREE` cast
- **Timer types**: `_rafId` typed as `number | null`, `_webglRestoreTimer` typed as `number | null`
- **Type guard narrowing**: `.filter()` callback uses `index is number` predicate type

## Drift Still Present (Requires Runtime JS Changes)

### 1. Architectural Drift: State Access Pattern

TS modules reference `webglContext` for Three.js scene objects. JS modules reference
`state` directly. This is a deliberate design difference between migration assets and
runtime code — not a bug.

**Affected files:** `three-engine.ts`, `three-interaction-visuals.ts`, `mycelium-engine.ts`

### 2. Code Evolution: three-engine.js Outpaced three-engine.ts

The JS `three-engine.js` contains functions not ported to TS (`sampleScenePerformance`,
`bindWebGLContextResilience`, `SCENE_PERF_EMA_DECAY`, different `showWebGLFallback`
and `cancelAnimate` patterns).

**Fix requires:** Port JS implementations into TS, or delete TS and write fresh.

### 3. Import Difference: CONFIG vs state.COLORS

`mycelium-engine.ts` imports `CONFIG` from `./config.js`. The JS versions use
`state.COLORS`. This is a cosmetic difference that doesn't affect type safety.

## Verification Results

- `npm run typecheck` : PASS (0 errors, 0 warnings)
- `npm run build` : PASS (560.3kb bundle)
- `git diff --check` : PASS (no whitespace errors)
- `Select-String -Path js/modules/*.ts -Pattern '@ts-nocheck'` : 0 matches (all cleared)

## @ts-nocheck Status

| File | Status |
|---|---|
| `js/modules/three-thread-manager.ts` | ✅ Cleared (Slice 1) |
| `js/modules/three-node-manager.ts` | ✅ Cleared (Slice 1) |
| `js/modules/three-search-animations.ts` | ✅ Cleared (Slice 1) |
| `js/modules/mycelium-engine.ts` | ✅ Cleared (Slice 2) |
| `js/modules/three-engine.ts` | ✅ Cleared (Slice 2) |
| `js/modules/three-interaction-visuals.ts` | ✅ Cleared (Slice 2) |

## Next Serial Slice Recommendations

1. **State access alignment**: Decide on canonical state access pattern (webglContext
   vs state vs selectors). Once chosen, update all TS files mechanically.

2. **three-engine.ts code evolution**: Port `sampleScenePerformance`,
   `bindWebGLContextResilience`, `SCENE_PERF_EMA_DECAY` from JS to TS, or
   delete TS and write fresh from JS as source.

3. **CONFIG import resolution**: For `mycelium-engine.ts` and `three-node-manager.ts`,
   either import CONFIG in the JS runtime or export COLORS from config.js.

4. **@types/three**: Install `@types/three` and delete `three-ambient.d.ts` to get
   full Three.js type coverage.

5. **Non-TS runtime modules**: The remaining JS-only modules (webgl-context.js,
   camera-controls.js, focus-pocket.js, etc.) are not yet typed. When the
   migration advances to runtime modules, they can be renamed to .ts incrementally.
