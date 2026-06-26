# W44 Phase 4 Scoping — 2026-06-25

**Author:** post-W44-quick-wins session
**Status:** scoping doc, ready to break into tickets
**Goal:** Mobile performance score 65 → 85+ (target). Desktop already at 94.

## Current state (2026-06-25 recheck)

| Asset | Wire size | Status |
|---|---|---|
| `data.dat` (8,406 points) | 1,760 KB | uncompressed (already gzipped on disk) |
| `three-D5X0Mtcg.js` | 140 KB transferred / 574 KB resource | brotli active, **always loaded** |
| `webgl-FXMVSqqC.js` | (in main entry) | **always loaded**; imports three.js |
| `index-DkqdfCeA.js` | 91 KB transferred / 305 KB resource | brotli active, main entry |
| `three-postprocessing-*.js` | (not in top 10) | **already code-split** via dynamic import |
| `mobile_premium__focus-dive.css` | 10 KB transferred / 77 KB resource | brotli active |
| All CSS combined | ~50 KB | brotli active |

## Root cause: three.js loads on mobile cold start

Lighthouse mobile trace shows `three-D5X0Mtcg.js` (574 KB raw / 140 KB brotli) loaded at **0 ms** on cold start. This is unexpected — there's already a gesture gate that skips auto-fire on `renderKind === 'placeholder2d'`. So why does three.js load?

### The static-import chain

1. `index-DkqdfCeA.js` (main entry, 305 KB) imports:
2. `webgl-FXMVSqqC.js` (12 KB, focus-semantic overlay rendering)
3. `webgl.js` statically imports:
4. `three-D5X0Mtcg.js` (574 KB) — **at module load time, regardless of whether the engine runs**

`webgl.js` contains the WebGL overlay rendering functions (`refreshFocusSemanticOverlay`, `initRouteTraceSubscriptions`, `updateFocusSemanticOverlayPositions`, etc.) that depend on three.js's `Vector3`, `BufferGeometry`, `Line2`, `Color` types. These are static imports, not dynamic — so even on mobile, where the user never sees a canvas, three.js downloads + parses + initializes its WebGL subsystem.

The `Canvas.svelte` lazy mount + `engineReady.value` gate is the right pattern, but it only delays **initialization** of three.js — the **download and parse** still happen because `webgl.js` is reachable from `index-DkqdfCeA.js`'s static import graph.

### Why this matters for mobile

Mobile Lighthouse trace at 0ms:
- `index-DkqdfCeA.js` (305 KB → 91 KB brotli)
- `webgl-FXMVSqqC.js` (12 KB)
- `three-D5X0Mtcg.js` (574 KB → 140 KB brotli) ← **the unused code**

Mobile FCP/LCP is 4.59s / 5.25s today. The 574 KB three.js parse alone takes ~700ms on a mid-tier mobile CPU. **On mobile, the user is staring at the static Placeholder2D SVG while their browser parses a 3D engine they may never use.**

## Recommended fix: extract webgl.js overlay rendering behind a dynamic import

The `webgl-FXMVSqqC.js` chunk should NOT be in the main entry graph on mobile. The functions it exports are only called when:
1. A business is focused (route traces, arrival handoffs)
2. A semantic thread is active (focus semantic lines)
3. The user enters the neighborhood view

These are all **post-engagement events** that happen well after first paint. The natural fix: make `webgl.js` a dynamic import, loaded only when one of these events fires.

### Concrete steps

1. **Audit `webgl.js`'s consumers.** Find every file that imports from `@lib/engine/webgl` or `webgl-fxmvsqc`. Currently `webgl.js` exports:
   - `buildArrivalHandoffOverlay`, `disposeArrivalHandoffOverlay`, `removeArrivalHandoffOverlay`, `updateArrivalHandoffOverlay`, `syncArrivalHandoffOverlay` (route arrival overlays)
   - `initRouteTraceSubscriptions`, `refreshRouteTraceOverlay`, `updateRouteTraceOverlayPositions`, `removeRouteTraceOverlay`, `resetRouteTraceDiagnostics` (route trace overlays)
   - `refreshFocusSemanticOverlay`, `updateFocusSemanticOverlayPositions`, `removeFocusSemanticOverlay`, `resetFocusThreadDiagnostics` (focus semantic lines)
   - `getSemanticFocusCueProbeSnapshot` (diagnostic)
   - `setRouteChoreographyPhase` (route choreography)

2. **Convert these exports to dynamic-import-able functions.** Replace `import { refreshFocusSemanticOverlay } from '.../webgl'` with `const { refreshFocusSemanticOverlay } = await import('.../webgl')` inside the function body. Rollup will code-split `webgl.js` into its own chunk (already the case) and the main entry won't pull it in.

3. **Trigger the dynamic import on first use.** E.g., when `navState.threadSource === 'semantic'` and the user focuses a node, the orchestrator calls `await ensureWebglLoaded()` once and caches the module reference.

4. **Test that mobile cold load skips `webgl.js` and `three.js`.** Add a Playwright test that loads the page on mobile viewport and asserts `three-D5X0Mtcg.js` is NOT in the network log until the user taps the Placeholder2D CTA.

### Expected impact

| Metric | Before | After (estimated) | Δ |
|---|---|---|---|
| Mobile transferred bytes | 3602 KB | ~2900 KB | **-700 KB** (mostly three.js) |
| Mobile FCP | 4.59s | 2.5-3.0s | **-1.5 to -2.0s** |
| Mobile LCP | 5.25s | 3.0-3.5s | **-2.0s** |
| Mobile performance score | 65 | **75-80** | +10-15 |

### Risk

**Medium.** `webgl.js` is currently used by 8+ orchestration modules. The conversion to dynamic imports is mechanical but touches several files. The main risks:
1. **Circular imports.** If `webgl.js` itself imports from a module that imports from `webgl.js`, the dynamic import will fail. Rollup handles this gracefully but needs verification.
2. **Race conditions.** If two modules call `ensureWebglLoaded()` simultaneously, they should get the same module reference (Promise deduplication needed).
3. **Test environment.** Headless Playwright might exercise paths that don't normally trigger webgl.js (e.g., focus a node programmatically). The test must wait for the dynamic import to complete before asserting state.

### Why this is the right Phase 4 target (vs alternatives)

- **Option: split `data.dat` into spatial chunks** (1.7 MB). Bigger architectural change. Saves the same ~700 KB but requires reworking `pointIndexByLeadId`, search engine, focus pocket. Better suited for W45/W46.
- **Option: defer `initThreeJS` further** (already in `requestIdleCallback`). Diminishing returns — parse cost is the bottleneck, not init ordering.
- **Option: replace three.js with selective sub-packages.** Comment in vite.config.ts (lines 474-478) notes this was attempted and didn't work due to webgpu build's `import './three.core.js'` duplicate. Low leverage, high risk.

The dynamic-import refactor of `webgl.js` is the **single biggest Phase 4 lever** because it removes three.js from the mobile critical path without changing the desktop behavior.

## Open questions

1. **Is there a real-world mobile user who taps the Placeholder2D CTA but never focuses a business?** If yes, they still pay the three.js download cost. The fallback is to keep three.js off the mobile critical path permanently (a Phase 5 "touch-first 2D renderer" project).
2. **What about `route-trace-Czlcvuap.js` and `route-arrival-overlay-adapter`?** They also import three.js. Are they reachable from the static graph too?
3. **Does `Canvas.svelte` already gate the three.js initialization?** Yes (line 142-186 of Canvas.svelte — `defer` prop). But the *download* still happens via `webgl.js`. Even though Canvas.svelte doesn't initialize three.js, the JS is parsed.
4. **Should we also defer the `data.dat` parse on mobile?** Same pattern — don't load the dataset until first interaction. But this is a Phase 5 conversation.

## Recommended commit plan (Phase 4)

1. **`refactor(engine): dynamic-import webgl overlay module`** — convert `webgl.js` exports to lazy-load on first call. Add `ensureWebglLoaded()` helper that returns a cached promise.
2. **`refactor(orchestration): call ensureWebglLoaded() before overlay renders`** — update each orchestration module that uses webgl.js to await the lazy import. Mechanical refactor.
3. **`chore(build): verify three.js chunk has no static mobile consumers`** — run `npx vite build && npm run check:css-minified` and inspect `index-DkqdfCeA.js`'s imports to confirm `three-D5X0Mtcg.js` is NOT transitively reachable from the main entry.
4. **`test(perf): mobile cold load skips three.js`** — Playwright test on mobile viewport, assert no three.js requests until CTA tap.
5. **`docs(perf): W44 Phase 4 results doc`** — Lighthouse recheck before/after, document the win.

### Estimated effort

- Steps 1-2: 3-4 hours (mechanical refactor across 8+ files)
- Step 3: 30 minutes (verification)
- Step 4: 1-2 hours (Playwright test + debugging)
- Step 5: 30 minutes (Lighthouse recheck + doc)

**Total: 5-7 hours, one focused session.**

## Files to inspect before starting

- `src/lib/engine/webgl.ts` (or wherever the overlay rendering lives — search for `webgl-` chunk name)
- `src/lib/orchestration/route-arrival-overlay-adapter.ts`
- `src/lib/journey/route-trace.ts`
- `src/lib/journey/thread-inspector-webgl.ts`
- `src/lib/orchestration/cluster-filter-controller.ts` (may use webgl)
- `vite.config.ts` `manualChunks` config — likely needs an entry to force `webgl` into its own chunk

## References

- Lighthouse mobile recheck: `docs/lighthouse-recheck-mobile-after-w44-v2.json`
- Lighthouse desktop recheck: `docs/lighthouse-recheck-desktop-after-w44-v2.json`
- W44 quick-wins commits: `afc824e3`, `693f9bf3`, `8dba6284`, `1a359676`
- Three.js manualChunks config: `vite.config.ts:546-549`
- Canvas.svelte `defer` prop: `src/components/Canvas.svelte:20,142-186`
- Engine lifecycle: `src/lib/engine/lifecycle.ts:182-225`
- Gesture gate: `src/lib/orchestration/wait-for-gesture.ts:65-67`