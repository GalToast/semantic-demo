---
name: Graphics Performance Audit
description: Deep-dive Three.js/WebGL performance audit covering VRAM lifecycle, GPU bottleneck analysis, memory leak detection, and mobile polish verification. Targets semantic-explorer's instanced mesh layer, mycelium threads, texture management, and Svelte stores.
source: auto-skill
extracted_at: '2026-06-06T23:33:18.870Z'
---

# Graphics Performance Audit — Three.js / WebGL / Mobile GPU

Use this when you need a structured performance deep-dive into a Three.js+WebGL application with Svelte stores, instanced meshes, canvas textures, shader materials, and mobile viewports. Covers four layers: VRAM/texture lifecycle, GPU shader analysis, memory leak detection, and mobile CSS hardening.

## When to Use

- Reviewing or debugging frame-rate drops on mobile GPUs (Adreno, Mali, Apple GPU)
- Investigating VRAM accumulation after repeated view transitions (COUNTY_OVERVIEW, reset, search cycles)
- Pre-release polish sweep for mobile viewport-fit and overscroll-behavior
- Verifying that Svelte stores and legacy `state.js` do not leak across engine init/destroy cycles
- Before shipping a feature that touches texture creation, instanced mesh updates, or shader uniforms

## When NOT to Use

- General bug sweep: use `STRUCTURED_BUG_SURGERY`
- Logic/state audits: use `DEEP_DIVE_LOGIC_AUDIT`
- State desync fixes: use `STATE_DESYNC_PARITY_SURGERY`
- Migration completeness: use `SVELTE_MIGRATION_PARITY_AUDIT`

## The Four-Layer Audit

### Layer 1: Texture / VRAM Lifecycle

Verify that every `CanvasTexture` (or loaded texture) created during the app lifetime is tracked, disposed, and not leaked on view transitions or engine reinitialization.

**Procedure:**

1. **Locate all texture creation sites.** Grep for `CanvasTexture`, `TextureLoader`, `DataTexture`, `CompressedTexture`, and `needsUpdate` across the codebase.

2. **Identify the disposal path for each texture.** For each creation site, answer:
   - Is the texture stored in a tracked array/set (e.g., `_trackedTextures`)?
   - Is `dispose()` called on the texture in a teardown function?
   - Is the disposal function called during EVERY exit path (COUNTY_OVERVIEW, engine deinit, view handoff, filter reset)?

3. **Map the COUNTY_OVERVIEW lifecycle.** Trace the action handler:
   ```
   journey-compass-controller.ts (case COUNT_OVERVIEW)
     → lifecycle-reset.js (resetExplorationFocus)
       → Does it call disposeNodeVisuals()? If NO → VRAM leak.
   ```

4. **Check for cache/reuse.** Textures created in `createPoints()` that are recreated on every init (not cached) waste GPU upload bandwidth:
   ```javascript
   // BAD: new texture every call
   state.focusBeaconTexture = trackTexture(createSporeTexture(THREE));

   // GOOD: module-level singleton
   const _sharedSporeTexture = createSporeTexture(THREE);
   function getSporeTexture() { return _sharedSporeTexture; }
   ```

5. **Verify disposal order.** Textures must be disposed AFTER the renderer/scene detaches them but BEFORE the renderer is disposed. Check `deinit()` → `cancelAnimate()` → `renderer.dispose()` sequencing.

**Pass criteria:** No net GPU memory growth after 20 rapid County Overview cycles (measured via Chrome DevTools Memory → GPU or WebGL `EXT_disjoint_timer_query`).

### Layer 2: GPU Bottleneck — Transparent Layer Overdraw

When two or more transparent geometry layers cover the same screen-space, mobile GPUs pay fragment-shading cost for every pixel of every overlapping triangle — even if the final composite is mostly transparent.

**Procedure:**

1. **Identify all transparent renderable layers.**
   ```
   Layer 1: PointsMaterial (depthWrite: false, NormalBlending) — 8,406 points
   Layer 2: InstancedMesh + MeshPhongMaterial (depthWrite: false, NormalBlending) — 8,406 spore instances
   Layer 3: Mycelium thread lines (AdditiveBlending, ~4,500 segments)
   ```

2. **Check for redundant opacity.** If two layers cover the same visual purpose at overview (e.g., point cloud dots + spore spheres), they compete for fill-rate:
   ```javascript
   // In three-engine.js animate():
   state.pointsMesh.visible = isOverview ? false : true;  // Suppress points when spores carry the overview
   // OR
   state.pointsMaterial.opacity = isOverview ? 0.02 : 0.32;  // Near-zero
   ```

3. **Profile fragment shader complexity.**
   - For `PointsMaterial` with custom `onBeforeCompile`: count uniforms, `varying` variables, and `smoothstep`/`mix` operations in the fragment shader.
   - For `MeshPhongMaterial`: Phong lighting is expensive per-fragment on mobile.
   - Consider `MeshBasicMaterial` for overview (no lighting) and `MeshPhongMaterial` only in focus mode.

4. **Check `depthWrite: false` on transparent materials.**
   - `false` means no early-Z rejection → every pixel renders through every layer.
   - Mitigation: minimize screen coverage of transparent layers, or sort transparent objects front-to-back.

5. **Check AdditiveBlending usage.** Thread lines use `THREE.AdditiveBlending` — every overlapping line adds to the framebuffer, potentially washing out on high-density mobile screens.

**Pass criteria:** Frame time ≤ 16ms (60 fps) on mid-range mobile GPU (Adreno 640, Mali-G72) with all layers active at overview.

### Layer 3: Memory Leak — Zombie Objects & Store Persistence

Three.js groups, meshes, geometries, and materials that are not explicitly disposed after removal from the scene become "zombies" — they consume GPU/CPU memory but are unreachable through the scene graph.

**Procedure:**

1. **Audit Object3D disposal for every group.**
   Create a table of every group/mesh created and its disposal site:

   | Object | Created In | Disposed In | Leaks? |
   |--------|------------|-------------|--------|
   | `myceliumGroup` | `createMycelium()` | `disposeMycelium()` → `disposeObject3D()` | - |
   | `searchCorridorGroup` | `triggerSearchCorridorAnimation()` | `disposeSearchCorridorAnimation()` | - |
   | `pointsMesh` + `nodeSporeMesh` | `createPoints()` | `disposeNodeVisuals()` | - |

2. **Verify every disposal call is reached on ALL teardown paths:**
   - `deinit()` (full app teardown)
   - `cancelAnimate()` (RAF loop cancellation)
   - `disposeMycelium()` (thread-specific)
   - `disposeNodeVisuals()` (node-specific)
   - `disposeInteractionVisuals()` (lens/manifold specific)
   - `disposeFocusAnchorIndicator()` (focus anchor specific)
   - `disposeHeroAnimation()` (search glow timers)
   - `disposeSearchCorridorAnimation()` (corridor geometry)

3. **Check Svelte store persistence across engine init/destroy.**
   Svelte `writable` stores are module-level singletons — they survive `destroy()` calls:
   ```typescript
   // In bridge.ts destroy():
   // If stores are not explicitly reset, stale state bleeds into the next lifecycle
   navStore.set(INITIAL_NAV_STATE);
   focusStore.set(INITIAL_FOCUS_STATE);
   searchStore.set(INITIAL_SEARCH_STATE);
   journeyStore.set(INITIAL_JOURNEY_STATE);
   ```

4. **Check global Proxy state (`state.js`).**
   The `state` Proxy is a module-level singleton — `CRITICAL_KEYS` and `TRACKED_SUB_KEYS` never reset after deinit:
   ```javascript
   // In engine teardown, explicitly null out:
   state.focusedNode = null;
   state.hoverHighlightIndex = -1;
   state.searchGlowIndices.clear();
   state.searchGlowActive = false;
   state.trailDepth = 0;
   state.semanticDiveMode = false;
   ```

5. **Check event bus subscription cleanup.**
   Every `subscribe()` must return an unsub function that is called in the teardown:
   ```typescript
   let _eventUnsubs: Array<() => void> = [];
   _eventUnsubs.push(bus.subscribe(eventName, callback));
   // ... in destroy():
   for (const unsub of _eventUnsubs) { try { unsub(); } catch (_) {} }
   ```

**Pass criteria:** Heap snapshot after engine destroy shows zero retained Three.js objects (no `BufferGeometry`, `Material`, `Texture`, `Group` instances from the session).

### Layer 4: Mobile Polish — Viewport & Overscroll

Safari on iOS uses `viewport-fit=cover` to let the app extend behind the notch. Without it, the notch area shows a white/black bar. `overscroll-behavior` prevents pull-to-refresh or swipe-back gestures from competing with the 3D canvas.

**Procedure:**

1. **Grep for `viewport-fit` in every entry HTML file:**
   ```
   src/index.html, dist/svelte/index.html, vector-explorer-polished.html, index.html
   ```
   All must contain `viewport-fit=cover` in the `<meta name="viewport">` tag.

2. **Check for `overscroll-behavior: none` on the canvas container.** The 3D canvas must reject scroll chaining:
   ```css
   #canvas-container {
     overscroll-behavior: none;
   }
   ```

3. **Check scrollable panels for `overscroll-behavior: contain`.** Bottom-sheet panels (search, info, filters) should allow internal scrolling without leaking to the page:
   ```css
   .search-results.active,
   .rail-section[open] {
     overscroll-behavior: contain;
   }
   ```

4. **Verify `safe-area-inset-*` usage.** Elements positioned near screen edges should use `env(safe-area-inset-top, 0px)` and `env(safe-area-inset-bottom, 0px)` in their `top`/`bottom`/`padding` values.

5. **Check every HTML file.** Some entry points may be missed during migration:
   - `src/index.html` (Svelte dev) — checked
   - `dist/svelte/index.html` (Svelte prod) — checked
   - `vector-explorer-polished.html` (legacy app shell) — checked
   - `index.html` (redirect/entry) — checked
   - `walkthrough-r6/index.html` (walkthrough) — **may be missed**

**Pass criteria:** All entry HTML files have viewport-fit=cover. Canvas has overscroll-behavior: none. Scrollable panels have overscroll-behavior: contain.

## Consolidated Findings Template

Use this template to collate findings across all four layers:

```
| # | Issue | Severity | Component | Effort | Verification |
|---|-------|----------|-----------|--------|--------------|
| 1 | <brief title> | 🔴 HIGH / 🟡 MED / 🟢 LOW | <file paths> | <est. hours> | <test method> |
...
```

## Verification Protocols

### VRAM Cycle Test
```javascript
// Chrome DevTools Console:
async function vramCycle() {
  for (let i = 0; i < 20; i++) {
    dispatchEvent(new CustomEvent('journey-action', { detail: { action: 'county-overview' } }));
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('Complete. Check GPU memory in DevTools → Memory → GPU.');
}
```
**Pass:** GPU memory stable ±5 MB after 20 cycles.

### Mobile GPU Profile
```
In Chrome DevTools → Performance → GPU
Record 10s at overview (no interaction)
```
**Pass:** Median frame ≤ 16ms on iPhone 15 / Pixel 7 at overview.

### Store Isolation Test
```typescript
// 1. Set store state
navStore.update(s => ({ ...s, focusedIndex: 42, trailDepth: 2 }));
// 2. Destroy engine
bridge.destroy();
// 3. Re-init engine
await bridge.init(canvas);
// 4. Verify clean
console.assert(get(navStore).focusedIndex === null, 'focusedIndex leaked');
console.assert(get(focusStore).semanticDiveMode === false, 'semanticDiveMode leaked');
```
**Pass:** All assertions pass after destroy → init cycle.

## Adjacent Skills

- `STRUCTURED_BUG_SURGERY` — For implementing the fixes identified by this audit
- `DEEP_DIVE_LOGIC_AUDIT` — For race condition and state machine analysis
- `STATE_DESYNC_PARITY_SURGERY` — For fixing Svelte ↔ legacy state desyncs
