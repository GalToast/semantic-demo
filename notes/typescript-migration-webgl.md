# TypeScript Migration: WebGL/Three.js Module Reconciliation

## Summary

Reconciled all 7 `.ts` WebGL/Three modules against their `.js` runtime counterparts.
Removed `@ts-nocheck` from **all 6 remaining files** across two serial slices:

- **Slice 1 (prior worker):** three-thread-manager.ts, three-node-manager.ts, three-search-animations.ts
- **Slice 2 (this worker):** mycelium-engine.ts, three-engine.ts, three-interaction-visuals.ts

All 7 WebGL TS modules are now fully type-checked with zero `@ts-nocheck` remaining.

## Wave 16 Resolutions (2026-06-05)

Three follow-up workers in this session resolved 2 of the 3 "Drift Still Present" items and began item #5 (runtime module conversion):

### Resolution 1: three-engine drift port (commit `4d108e9`)

Ported the 5 items where `three-engine.js` had outpaced `three-engine.ts`:

- `SCENE_PERF_EMA_DECAY` constant — single source of truth near the top of the file
- `sampleScenePerformance` function — new `ScenePerformanceTimings` interface types the parameter
- `bindWebGLContextResilience` function — typed against `THREE.WebGLRenderer` and `HTMLElement`
- `showWebGLFallback` reconciled to match the `.js` behavior
- `cancelAnimate` reconciled to match the `.js` behavior
- `animate()` now calls `sampleScenePerformance()` instead of inline diagnostics
- `smoothDiagnosticValue` re-typed: `(current: number, next: number, sampleCount: number): number`

**Follow-up not in this commit** (out of scope to keep the diff small): `bindWebGLContextResilience` is ported and available, but `initThreeJS` (lines 333-349) still has its own inline `webglcontextlost`/`webglcontextrestored` handlers. The fully-aligned version replaces those inline handlers with a `bindWebGLContextResilience(state.renderer)` call — a 1-line swap once `initThreeJS` is next touched.

### Resolution 2: CONFIG vs state.COLORS canonicalization (no commit needed)

The `.ts` files were already canonicalized before this wave. Verified via `grep -rn "state\.COLORS" js/modules/`:

- All `.ts` files: zero `state.COLORS` reads
- 7 `.js` files still read `state.COLORS` (three-engine.js, mycelium-engine.js, three-node-manager.js counterparts, plus map-state.js, cluster-ui-accent.js, legend-ui.js comment)

Per the design decision (the JS is legacy runtime that will be replaced during the full JS→TS migration), the JS-side `state.COLORS` reads are not in scope for the canonicalization. The drift is closed in the .ts; the .js side is deferred to item #5.

### Resolution 3: First runtime module conversion (commit `5ff8a5e`)

`js/modules/utils/timer-utils.js` → `timer-utils.ts` (88→95 lines, +25/-18 for types).

- `TrackedTimer` interface
- `Map<string, TrackedTimer>` typed registry
- 5 typed function signatures
- Generic `debounceRAF<T>(fn: (...args: T[]) => void): (...args: T[]) => void` signature
- No ambient declaration changes needed (used standard DOM lib + `ReturnType<typeof setTimeout>`)
- Bundle delta: +7 bytes (within variance)

Pattern established for the remaining runtime modules: inline types, no `as any` casts, no ambient declarations unless required. See "Runtime Module Conversion Progress" below.

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

**Resolutions (2026-06-05):** items 2 and 3 below are RESOLVED.

### ~~2. Code Evolution: three-engine.js Outpaced three-engine.ts~~ ✅ RESOLVED (`4d108e9`)

All 5 drift items ported. `initThreeJS` call-site replacement is the only remaining
follow-up; documented in the "Wave 16 Resolutions" section above.

### ~~3. Import Difference: CONFIG vs state.COLORS~~ ✅ RESOLVED (no commit needed)

All `.ts` files use `import { CONFIG } from './config.js'`. The 7 `.js` files still
using `state.COLORS` are deferred to the JS→TS runtime migration (item #5 below).

## Runtime Module Conversion Progress (item #5)

Tracking the gradual conversion of the remaining runtime `.js` modules to `.ts`:

| File | Status | Commit | Notes |
|---|---|---|---|
| `js/modules/utils/timer-utils.js` → `.ts` | ✅ done | `5ff8a5e` | 88→95 lines, +25/-18 types. Pattern established. |
| Other utils (`colors.js`, `time.js`, `viewport.js`, `dom-builder.js`, `geo-data.js`, `ui-presentation.js`) | pending | — | Smallest leaves; candidates for the next conversion slice |
| `js/modules/environment.js` (~155 lines) | pending | — | Has tests; medium complexity |
| `js/modules/focus-panel-mode.js` (~17 lines) | pending | — | Too small to establish pattern, save for batch |
| `js/modules/cluster-filter.js` (~225 lines) | pending — manual | — | Canonical for `applyStoryPrompt`; was just deduped in `a5d427d`. Defer until Wave 17+ to avoid churn. |
| `js/modules/three-engine.js` | pending — large | — | 600+ lines, deeply integrated; needs its own slice with broad test coverage |
| `js/modules/camera-controls.js`, `focus-pocket.js`, `webgl-context.js` | pending | — | Larger runtime modules; lower priority — type the utility layer first |

## Verification Results

Wave 15 (initial migration, 2 slices):
- `npm run typecheck` : PASS (0 errors, 0 warnings)
- `npm run build` : PASS (560.3kb bundle)
- `git diff --check` : PASS (no whitespace errors)
- `Select-String -Path js/modules/*.ts -Pattern '@ts-nocheck'` : 0 matches (all cleared)

Wave 16 (follow-up, this session):
- `npx tsc --noEmit -p tsconfig.typecheck.json` : PASS (0 errors)
- `npm run build` : PASS (561.0kb bundle, +7 bytes from baseline — within variance)
- All 5 new `bindWebGLContextResilience` / `sampleScenePerformance` / etc. types
  validated against the ambient `three-ambient.d.ts` declarations
- `grep -rn "state\.COLORS" js/modules/` : 0 `.ts` hits, 7 `.js` hits (expected)

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

Remaining work, in roughly increasing risk order:

1. **`initThreeJS` call-site replacement** (carryover from `4d108e9`): replace the
   inline `webglcontextlost`/`webglcontextrestored` handlers (lines 333-349) with
   a single `bindWebGLContextResilience(state.renderer)` call. ~15-line diff.
   No type changes; pure call-site cleanup. **Do this first** — small, isolated,
   and it completes the resolution of item 2.

2. **Continue runtime module conversion** (item #5, in progress). The
   `utils/*` leaves are the safest next targets: small, isolated, no consumers
   that need re-typing. See "Runtime Module Conversion Progress" for the priority
   ordering. A 3-worker parallel slice (one worker per ~3 files) is realistic.

3. **State access alignment** (item #1, still open). Architectural decision
   needed: canonical pattern is `webglContext` (current TS), `state` (current JS),
   or `selectors` (the new selector layer from Wave 14). Once chosen, mechanical
   updates across the .ts files. **Don't touch until the design call is made.**

4. **`@types/three` install** (item #4). Add as a devDependency, delete
   `three-ambient.d.ts`, let the real types take over. Risk: surfaces new type
   errors in the .ts modules that the ambient stub was hiding. **Do this AFTER
   #2 finishes** so any new errors land in a focused commit, not mixed with the
   runtime conversion work.

5. **`three-engine.js` to `.ts` conversion** (item #5, deferred). 600+ lines,
   deeply integrated. Needs its own slice with broad test coverage. **Not
   ready for parallel workers** — too large and too coupled.
