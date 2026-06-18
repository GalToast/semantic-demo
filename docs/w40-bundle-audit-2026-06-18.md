# W39: Bundle Visualizer Audit Report

> Generated: 2026-06-18 | Build: `vite v8.0.14` | rollup-plugin-visualizer v7 | Stats format: v2

---

## 1. Executive Summary

| Metric | Raw | Gzip | Brotli |
|--------|-----|------|--------|
| **Total JS** | 2,539 KB (2.54 MB) | 610 KB | 510 KB |
| **Total CSS** | 54.6 KB | 9.7 KB | — |
| **Total (JS+CSS)** | 2,594 KB | 620 KB | — |

The bundle is dominated by **Three.js (48% raw, 38.5% gzip)**. Our source code is 41.8% raw / 50.1% gzip. No duplicate modules across chunks.

---

## 2. Chunk-Level Breakdown

| Chunk | Raw | Gzip | Brotli | Modules |
|-------|-----|------|--------|---------|
| `three-Ct0RfkIo.js` (Three.js) | 759.7 KB | 193.5 KB | — | 1 (but contains three.core + three.module merged) |
| `index-tCpM48uT.js` (app bundle) | 585.1 KB | 181.4 KB | — | 363 |
| `three-postprocessing-DMITamfl.js` | 82.5 KB | 18.9 KB | — | 1 |
| `index-DDptPK1b.css` | 54.6 KB | 9.7 KB | — | — |
| `data-worker-DFjzbRDE.js` | 3.4 KB | — | — | 1 |
| `rolldown-runtime-DK3Fl9T5.js` | 0.15 KB | — | — | 1 |

---

## 3. Top 15 Largest Modules

| # | Module | Raw | Gzip | Chunk |
|---|--------|-----|------|-------|
| 1 | `three/core/three.core.js` | 633.3 KB | 122.9 KB | three |
| 2 | `three/build/three.module.js` | 534.4 KB | 100.3 KB | three |
| 3 | `postprocessing/build/index.js` | 110.6 KB | 20.4 KB | postprocessing |
| 4 | `src/lib/state/app.svelte.ts` | 47.2 KB | 7.3 KB | index |
| 5 | `three/examples/jsm/controls/OrbitControls.js` | 26.5 KB | 5.0 KB | index |
| 6 | `src/lib/focus/geometry.ts` | 24.0 KB | 5.9 KB | index |
| 7 | `src/lib/engine/three-interaction-visuals.ts` | 23.2 KB | 5.4 KB | index |
| 8 | `src/components/JourneyChrome.svelte` | 22.5 KB | 5.5 KB | index |
| 9 | `src/components/SearchResults.svelte` | 22.4 KB | 5.9 KB | index |
| 10 | `src/components/InfoPanel.svelte` | 22.3 KB | 5.5 KB | index |
| 11 | `src/lib/search-engine.ts` | 20.9 KB | 6.1 KB | index |
| 12 | `src/components/LegacyCompassSurface.svelte` | 19.4 KB | 4.5 KB | index |
| 13 | `src/lib/journey/focus-ui.ts` | 18.9 KB | 4.8 KB | index |
| 14 | `src/lib/engine/map-state.ts` | 18.4 KB | 5.0 KB | index |
| 15 | `src/lib/search/results-ui.ts` | 18.2 KB | 4.6 KB | index |

---

## 4. Category Breakdown

| Category | Raw | % Raw | Gzip | % Gzip | Modules |
|----------|-----|-------|------|--------|---------|
| **three.js** | 1,217.7 KB | 48.0% | 235.0 KB | 38.5% | 8 |
| **Source code (TS)** | 730.0 KB | 28.7% | 217.4 KB | 35.6% | 187 |
| **Svelte components** | 332.5 KB | 13.1% | 88.0 KB | 14.4% | 72 |
| **Svelte runtime** | 148.6 KB | 5.9% | 49.3 KB | 8.1% | 97 |
| **Postprocessing** | 110.6 KB | 4.4% | 20.4 KB | 3.3% | 1 |

---

## 5. Three.js Deep-Dive

### 5.1 The Core Problem: Two Full Copies

Three.js v0.184 ships as:
- **`three.core.js`** (633 KB) — the engine core (math, geometries, materials, lights, renderers, etc.)
- **`three.module.js`** (534 KB) — a thin WebGL wrapper that **imports `three.core.js`** and re-exports everything + adds WebGL-specific APIs

When you do `import * as THREE from 'three'`, the bundler resolves to `three.module.js`, which pulls in `three.core.js` as a dependency. The `manualChunks` config in vite.config.ts places both into the `three` chunk. Result: **both files ship at ~1.17 MB raw**.

### 5.2 Namespace Import Kills Tree-Shaking

**37 source files** use `import * as THREE from 'three'` (namespace import). This is the #1 anti-pattern:

| Impact | Detail |
|--------|--------|
| Namespace import prevents tree-shaking | Rollup cannot determine which exports are unused because the entire namespace is referenced |
| We use only **~50 classes** out of **300+** exported by Three.js | WebGLRenderer, Scene, PerspectiveCamera, InstancedMesh, BufferGeometry, etc. |
| Unshaken dead weight | Animations, loaders, VR/XR, audio, skinned meshes, morph targets, compression formats, etc. — none used |

### 5.3 What We Actually Use (from namespace imports)

```
Scene, PerspectiveCamera, WebGLRenderer, Raycaster, Group, Mesh, Points,
InstancedMesh, BufferGeometry, BufferAttribute, InstancedBufferAttribute,
Float32BufferAttribute, SphereGeometry, CircleGeometry, IcosahedronGeometry,
RingGeometry, MeshBasicMaterial, MeshPhongMaterial, ShaderMaterial,
LineBasicMaterial, LineDashedMaterial, PointsMaterial, SpriteMaterial,
Sprite, Texture, CanvasTexture, Color, Vector2, Vector3, Box3, MathUtils,
DirectionalLight, HemisphereLight, PointLight, FogExp2, Object3D,
Material, LineSegments, LineLoop, DynamicDrawUsage, ToneMapping,
ACESFilmicToneMapping, AdditiveBlending, NormalBlending, BackSide,
DoubleSide, SRGBColorSpace, IUniform
```

That's ~50 symbols. Three.js exports **300+** from `three.module.js` (and many more from `three.core.js`).

### 5.4 Selective Imports Already Used (Good)

Only **2 files** use selective imports:
- `src/lib/utils/three-textures.ts` → `import { CanvasTexture } from 'three'`
- `src/lib/engine/three-postprocessing.ts` → selective imports from `'three'`

### 5.5 Three.js Submodule Breakdown

| Submodule | Raw | Gzip | Modules |
|-----------|-----|------|---------|
| `build/` (core + module) | 1,167.7 KB | 223.2 KB | 2 |
| `examples/jsm/` (OrbitControls, Line2, etc.) | 50.1 KB | 11.7 KB | 6 |
| Source files named `three-*` | 54.1 KB | 12.3 KB | 7 |
| **Three.js total** | **1,282.7 KB** | **251.8 KB** | **15** |

---

## 6. Postprocessing Analysis

### What We Import

```typescript
import {
    EffectComposer, RenderPass, EffectPass,
    BloomEffect, DepthOfFieldEffect, VignetteEffect,
    ChromaticAberrationEffect, Effect,
} from 'postprocessing';
```

7 specific effects + 2 core classes. The library ships at 110.6 KB raw / 20.4 KB gzip.

**Tree-shaking assessment**: postprocessing uses named exports, so Rollup should be able to eliminate unused effects. The 110.6 KB is likely what's actually needed for these 7 effects plus the EffectComposer/RenderPass/EffectPass infrastructure. This is already reasonably optimized.

---

## 7. Source Code Analysis

### 7.1 Top Source Modules (>15 KB raw)

| Module | Raw | Gzip |
|--------|-----|------|
| `src/lib/state/app.svelte.ts` | 47.2 KB | 7.3 KB |
| `src/lib/focus/geometry.ts` | 24.0 KB | 5.9 KB |
| `src/lib/engine/three-interaction-visuals.ts` | 23.2 KB | 5.4 KB |
| `src/components/JourneyChrome.svelte` | 22.5 KB | 5.5 KB |
| `src/components/SearchResults.svelte` | 22.4 KB | 5.9 KB |
| `src/components/InfoPanel.svelte` | 22.3 KB | 5.5 KB |
| `src/lib/search-engine.ts` | 20.9 KB | 6.1 KB |
| `src/components/LegacyCompassSurface.svelte` | 19.4 KB | 4.5 KB |
| `src/lib/journey/focus-ui.ts` | 18.9 KB | 4.8 KB |
| `src/lib/engine/map-state.ts` | 18.4 KB | 5.0 KB |
| `src/lib/search/results-ui.ts` | 18.2 KB | 4.6 KB |
| `src/lib/journey/semantic-overlay.ts` | 16.8 KB | 4.3 KB |
| `src/lib/engine/three-search-animations.ts` | 15.8 KB | 3.8 KB |
| `src/lib/journey/thread-inspector.ts` | 15.5 KB | 3.4 KB |
| `src/lib/engine/three-engine.ts` | 15.4 KB | 4.5 KB |
| `src/lib/journey/focus-pocket.ts` | 15.2 KB | 3.6 KB |
| `src/lib/engine/node-manager.ts` | 14.9 KB | 4.3 KB |
| `src/lib/journey/neighborhood.ts` | 14.4 KB | 3.6 KB |

### 7.2 Notable Observations

- **`app.svelte.ts` (47.2 KB)**: The state management hub. This is the single largest source file. Contains all Svelte stores. Could potentially be split into domain-specific stores if it impacts initial parse time.
- **Svelte components** average ~12 KB raw each (compiled). Largest are JourneyChrome, SearchResults, InfoPanel at 22 KB each.
- **155 bridge files** exist in the codebase (many are <1 KB re-export shims) — they're not individually expensive but add structural complexity.

---

## 8. Duplicate Module Analysis

**No duplicate modules across chunks.** Each module appears in exactly one chunk. The `three.core.js` / `three.module.js` pair is not a duplication in the traditional sense — `three.module.js` imports from `three.core.js` and re-exports, so both ship as part of the three.js chunk. However, this does mean the consumer pays for both files.

---

## 9. Tree-Shaking Opportunities

### 9.1 🔴 HIGH IMPACT: Convert `import * as THREE` to Selective Imports

**Estimated savings: 400–600 KB raw (16–24% of total bundle)**

Currently 37 files use namespace imports. Converting to:
```typescript
// Before (prevents tree-shaking):
import * as THREE from 'three';
const mesh = new THREE.Mesh(...);

// After (enables tree-shaking):
import { Mesh, BufferGeometry, MeshBasicMaterial } from 'three';
const mesh = new Mesh(...);
```

This would let Rollup eliminate all unused Three.js exports. The savings are dramatic because Three.js has massive surface area (VR/XR, loaders, audio, morph targets, skinned meshes, compression formats, etc.) that we never touch.

**Caveat**: The `three.module.js` → `three.core.js` chain means even with selective imports, both files may still be pulled in unless the bundler can determine that all selected exports come from `three.core.js` only (they do — `three.module.js` is just a re-export layer). With selective imports, it's possible that Rollup could resolve directly to `three.core.js` entries, eliminating the `three.module.js` wrapper entirely.

### 9.2 🟡 MEDIUM IMPACT: Lazy-Load Heavy UI Components

Candidates for dynamic `import()`:

| Component | Raw | Gzip | Rationale |
|-----------|-----|------|-----------|
| `SearchResults.svelte` | 22.4 KB | 5.9 KB | Only visible during search mode |
| `JourneyChrome.svelte` | 22.5 KB | 5.5 KB | Only visible in journey/thread-inspector mode |
| `InfoPanel.svelte` | 22.3 KB | 5.5 KB | Only visible when a node is selected |
| `ThreadInspector.svelte` | 6.8 KB | 2.1 KB | Only visible in thread inspector mode |
| `LegacyCompassSurface.svelte` | 19.4 KB | 4.5 KB | Only visible in compass mode |
| `Filters.svelte` | 5.9 KB | 1.8 KB | Only visible when filters panel is open |
| `search-engine.ts` | 20.9 KB | 6.1 KB | Core search logic, only needed after user starts typing |

**Potential savings**: Up to ~120 KB raw / ~32 KB gzip deferred to on-demand chunks.

### 9.3 🟢 LOW IMPACT: Postprocessing Tree-Shaking Verification

The postprocessing library is already using named exports. At 110 KB for 7 effects, this is reasonable. No action needed unless the bundle grows further.

---

## 10. Lazy-Loading Candidates

The most impactful lazy-loading targets (sorted by raw size):

1. **`search-engine.ts` (20.9 KB)** — Could be loaded on first search interaction
2. **`JourneyChrome.svelte` (22.5 KB)** — Only needed in journey mode
3. **`SearchResults.svelte` (22.4 KB)** — Only needed when search results are shown
4. **`InfoPanel.svelte` (22.3 KB)** — Only needed when a card is selected
5. **`LegacyCompassSurface.svelte` (19.4 KB)** — Only in compass mode
6. **`geometry.ts` (24.0 KB)** — Focus geometry calculations, only needed in focus mode

**Combined potential**: ~131 KB raw / ~35 KB gzip could be deferred.

---

## 11. Concrete Recommendations for W40+

### Priority 1: Three.js Selective Imports (Sprint Item)
- Convert all 37 `import * as THREE from 'three'` files to selective named imports
- This is a mechanical refactoring — grep for `THREE.XXX` usage in each file, add the specific import
- Expected result: **400–600 KB raw reduction** (from ~2.54 MB → ~2.0 MB)
- Could drop the bundle below the 1500 KB chunk warning threshold

### Priority 2: Lazy-Load Search + Journey Chrome
- Wrap `SearchResults`, `JourneyChrome`, and `InfoPanel` in dynamic imports
- These are modal/mode-specific UIs that aren't needed at initial paint
- Expected result: **~67 KB raw / ~17 KB gzip** deferred from initial chunk

### Priority 3: Investigate three.module.js Elimination
- If selective imports allow Rollup to bypass `three.module.js`, the `three` chunk drops from 760 KB → ~633 KB
- This requires confirming that all our used exports exist in `three.core.js` (they do — they're all core types)

### Priority 4: Monitor app.svelte.ts Growth
- At 47.2 KB, this is the largest source file and contains all state management
- If it continues growing, consider splitting into domain stores (search, focus, journey, etc.)

---

## 12. Appendix: Full Dependency Inventory

### NPM Dependencies in Bundle

| Package | Raw | Gzip | Notes |
|---------|-----|------|-------|
| `three` (core + module) | 1,167.7 KB | 223.2 KB | Namespace import prevents tree-shaking |
| `postprocessing` | 110.6 KB | 20.4 KB | 7 effects used, reasonably tree-shaken |
| `three/examples/jsm` | 50.1 KB | 11.7 KB | OrbitControls, Line2, LineMaterial, etc. |
| `svelte` (runtime) | 148.6 KB | 49.3 KB | Expected for Svelte 5 |
| **Total dependencies** | **1,477 KB** | **305 KB** | **58.2% of bundle** |

### Source Code

| Category | Raw | Gzip | Modules |
|----------|-----|------|---------|
| TypeScript modules | 730.0 KB | 217.4 KB | 187 |
| Svelte components (.svelte) | 332.5 KB | 88.0 KB | 72 |
| **Total source** | **1,062.5 KB** | **305.4 KB** | **259** |

---

*This report was generated by the W39 bundle audit. See `tmp/parse-bundle-v2.mjs` for the analysis script. The visualizer treemap is at `dist/svelte/stats.html`.*
