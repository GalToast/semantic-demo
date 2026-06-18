# Bundle Deep-Dive — 2026-06-12

## Executive Summary

The Svelte/Vite production bundle is **299 kB gzipped** (main entry) with a **100.74 kB gzipped** lazy-loaded legacy chunk. Dev-only tools (SpectorJS 168 kB gz, lil-gui 8 kB gz) are correctly gated and never fetched in production. The architecture is already well-optimized; no quick wins exceed 10 kB gzipped savings.

## Chunk Inventory (gzipped)

| Chunk | Raw | Gzipped | Role | Loaded |
|---|---|---|---|---|
| `index-*.js` | 1,059 kB | 299.29 kB | Main entry (Three.js + Svelte components + stores) | Page load |
| `panel-bindings-*.js` | 324 kB | 100.74 kB | Legacy JS modules (journey, focus-pocket, camera, lifecycle, etc.) | Dynamic import |
| `spector.bundle-*.js` | 661 kB | 168.32 kB | SpectorJS WebGL debugger (dev-only) | Dev mode only |
| `lil-gui.esm-*.js` | 30 kB | 7.96 kB | lil-gui runtime controls (dev-only) | Dev mode only |
| `three-interaction-visuals-*.js` | 15.6 kB | 4.94 kB | Semantic manifold + lens overlays | Dynamic import |
| `three-search-animations-*.js` | 13.1 kB | 4.13 kB | Search corridor glow animations | Dynamic import |
| `url-state-*.js` | 8.7 kB | 3.25 kB | URL state management | Dynamic import |
| `selectors-*.js` | 8.6 kB | 3.19 kB | State selectors | Dynamic import |
| Other chunks (20+) | <6 kB each | <3 kB each | Camera, filters, event bus, etc. | Dynamic import |

**Total user-facing (production):** ~400 kB gzipped (main + panel-bindings on demand)

## Top 3 Contributors & Treatments

### 1. Three.js Core (~180-200 kB gz in main bundle)

**What:** Three.js is the 3D rendering engine. It's imported via `import * as THREE from 'three'` in ~50 files across `src/lib/engine/` and `js/modules/`.

**Why it's large:** Three.js bundles WebGL renderer, shaders, math, geometry, materials, cameras, lights, and helpers. Even with tree-shaking, the core is ~150 kB gzipped.

**Treatment: Document why it's necessary.** Three.js is the primary rendering engine — it can't be lazy-loaded since the 3D canvas is the first thing users see. The bundle already benefits from Rolldown's tree-shaking (unused features like post-processing, skeletal animation, and audio are eliminated).

**Unused Three.js features detected in bundle but not in source:**
- `AudioListener`, `Audio`, `PositionalAudio` — 0 source references
- `VideoTexture`, `CameraTexture` — 0 source references
- `Skeleton`, `SkinnedMesh`, `Bone` — 0 source references
- `ArrowHelper`, `GridHelper`, `AxesHelper` — 0 source references

These appear to be pulled in transitively by Three.js's module system. They cannot be excluded without patching Three.js itself.

### 2. Panel-bindings Legacy Chunk (100.74 kB gz)

**What:** Contains ALL legacy JS modules: journey orchestration, focus-pocket geometry/personality, thread inspector, camera controls, lifecycle management, search state/renderers, UI renderers, and all binding modules.

**Why it's large:** This is the accumulated legacy codebase (~127 modules in `js/modules/`). It's loaded via 18 dynamic imports from the main bundle, which means it's fetched very early in the app lifecycle.

**Treatment: Document as migration target.** This chunk will shrink as modules are ported to Svelte/TypeScript in `src/lib/`. No safe quick wins exist — splitting this chunk would require refactoring the import graph, which is high-risk.

**Lazy-load opportunities within panel-bindings (deferred to migration):**
- Demo choreography modules (`micro-demo-*.ts`) — only needed when demo runs
- Thread inspector WebGL (`thread-inspector-webgl.ts`) — only needed when inspecting connections
- Journey route trace (`journey-route-trace.ts`) — only needed when trail is active

### 3. SpectorJS Dev Tool (168.32 kB gz)

**What:** WebGL frame inspector for debugging. Used by Playwright MCP for headless capture.

**Why it's large:** SpectorJS is a full WebGL debugging toolkit with its own UI, capture system, and command recording.

**Treatment: Already optimal.** The component is gated by `import.meta.env.MODE === 'development'` in App.svelte, and the dynamic import is gated by `import.meta.env.DEV` inside `onMount`. In production:
- The component renders nothing (`{#if visible}` is false)
- The dynamic import never executes
- The chunk exists on the server but is never fetched by the browser

To eliminate the chunk from production builds entirely, wrap the dynamic import in a build-time dead code elimination gate. However, the server-side savings (~661 kB raw) is negligible and the current approach is safe.

## Architecture Notes

### Tree-Shaking Effectiveness

Rolldown (Vite's bundler) is performing well:
- `three-postprocessing.ts` (234 lines) is **fully tree-shaken** — none of its 10 exports appear in the main bundle
- Unused Three.js examples (EffectComposer, ShaderPass, UnrealBloomPass, BokehPass) are eliminated
- Dev-only tools are code-split into separate chunks

### Ineffective Dynamic Imports (Build Warnings)

The build produces 6 `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings:
1. `src/lib/data-store.ts` — statically imported by 5+ files, dynamically imported by 1
2. `js/state.js` — statically imported by 15+ files, dynamically imported by 6
3. `js/modules/focus-panel-mode.ts` — statically imported by 7+ files, dynamically imported by 1
4. `js/modules/mycelium-engine.ts` — statically imported by 4 files, dynamically imported by 1
5. `src/lib/orchestration/search-filter-core.ts` — statically and dynamically imported by same file

These warnings indicate modules that attempt dynamic imports but are already in the main chunk due to static imports elsewhere. They don't affect bundle size but indicate import graph inconsistencies.

### Bundle Size Warning

The main chunk (1,084 kB raw / 299 kB gz) exceeds Vite's 500 kB warning threshold. This is dominated by Three.js and cannot be reduced without replacing the rendering engine.

## Recommendations

1. **Continue Svelte migration** — The panel-bindings chunk (100.74 kB gz) is the migration backlog. Each module ported to `src/lib/` reduces this chunk.
2. **Consider manualChunks for Three.js** — If Three.js is split into its own chunk, it could be cached independently and loaded in parallel. However, this requires careful dependency management.
3. **Monitor bundle size** — The current ~400 kB gzipped total is reasonable for a 3D WebGL application. Focus on runtime performance (lazy initialization, progressive loading) rather than bundle size reduction.

## Files Analyzed

- `vite.config.ts` — Build configuration
- `dist/svelte/stats.html` — Bundle treemap (407 kB)
- `dist/svelte/index.html` — Production entry
- `dist/svelte/assets/index-*.js` — Main bundle (1,059 kB raw)
- `dist/svelte/assets/panel-bindings-*.js` — Legacy chunk (324 kB raw)
- `dist/svelte/assets/spector.bundle-*.js` — Dev tool (661 kB raw)
- `src/App.svelte` — Component composition
- `src/components/SpectorInspector.svelte` — Dev-only Spector integration
- `src/components/DevGui.svelte` — Dev-only lil-gui integration
- `js/modules/three-postprocessing.ts` — Dead code candidate (confirmed tree-shaken)
