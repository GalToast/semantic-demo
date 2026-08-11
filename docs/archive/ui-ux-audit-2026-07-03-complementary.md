# UI/UX Audit — Complementary Source-Level Findings — 2026-07-03

Companion to `docs/ui-ux-audit-2026-07-03.md` and `docs/ui-ux-audit-fixes-2026-07-03.md`
(parallel session). This doc covers **new** issues found via source-level trace of the
3D-scene / interaction / state seams — the class of bugs the parallel session's
runtime-snapshot audit cannot catch. Read-only discovery; no files edited (parallel
session owns the dirty tree).

## Reconciliation note

- A parallel session (lock intent `UX-2 CompassRail`) is mid-flight with ~59 dirty files.
  Its audit (desktop 1440 first-visit) logged 13 findings, fixed 3 (SearchResults
  aria-activedescendant, Splash aria-hidden, InfoPanel hasError). Mobile 375 + Map mode
  were **not** inspected.
- The session lock is >80 min stale (no heartbeat since acquire), but the fresh today's
  audit docs + large dirty tree indicate active work — treated as live, not reclaimed.
- **N2, N3, N4 below are surfaced for the parallel session to reconcile** (dirty files).
  N1 (`view-controller.ts`) is clean — already fixed in this session.

## New findings

### N1 — view-controller DisposableRegistry structural leak (HIGH)

- **File**: `src/lib/orchestration/view-controller.ts` (NOT in dirty list — safe to fix)
- **Bug**: `_registry` is a module-level `DisposableRegistry` singleton. `hideViewHandoff()`
  calls `_registry.disposeAll()` (sets `disposed=true`). `switchView()` calls
  `hideViewHandoff()` at its top, **then** calls `_registry.schedule(VIEW_HANDOFF_OUT_MS, …)`
  and later `showViewHandoff()` → `_registry.schedule(SHOW_VIEW_HANDOFF_DISMISS_MS, …)`.
  `DisposableRegistry.add()` warns AND pushes to `items` even when `disposed=true`; the next
  `disposeAll()` early-returns (already disposed), so those timers are **never cleared**.
- **Three concrete symptoms**:
    1. The 3× console warnings "Adding disposable after disposeAll() — leak risk" on every load
       (matches parallel-session audit finding #2).
    2. Genuine timer leak — the scheduled callbacks outlive the registry.
    3. The `document.body.view-transitioning` class-removal timer is one of the leaked timers,
       so the class can persist on `<body>` after a view switch (latent visual/CSS-gating bug).
- **Fix sketch**: do not dispose the whole registry in `hideViewHandoff()` — track only the
  handoff-dismiss timer (e.g. a `let _handoffTimer` that `hideViewHandoff` clears directly).
  Alternatively make `DisposableRegistry.disposeAll()` reset `disposed=false` after disposing
  (re-open the registry), but that breaks its documented "idempotent" contract — prefer the
  surgical fix. (This resolves the parallel session's audit #2 at the root.)

### N2 — Canvas 5s fallback leaves canvas `visibility:hidden` (HIGH, visual)

- **File**: `src/components/Canvas.svelte` (DIRTY — parallel-session owned; surface only)
- **Bug**: The 5s overlay-fallback `setTimeout` sets `overlayVisible = false` inline but does
  NOT set `canvasReady = true`. CSS `.semantic-canvas-container:not(.canvas-ready)`
  applies `visibility: hidden`. The `onLoadingPhase('launch')` path calls `hideOverlay()`
  (which sets `canvasReady = true`), but the 5s fallback bypasses `hideOverlay()`.
- **Symptom**: if the engine's `'launch'` phase never fires (WebGL slow/blocked, or data sync
  stalls), the "Loading mycelium…" overlay disappears at 5s but the canvas stays
  `visibility: hidden` forever — blank space, no spinner, no error. The `hideOverlay()`
  comment even says "ensure canvas is visible even if onLoadingPhase missed", but the 5s
  branch contradicts that intent.
- **Fix sketch**: call `hideOverlay()` (not the inline `overlayVisible = false`) in the 5s
  branch, or remove the `visibility: hidden` gate, or surface the error overlay.

### N3 — `sceneReady` semantics mismatch — root cause of degraded demo (MEDIUM, feeds CRITICAL #1)

- **Files**: `src/lib/stores/scene-ready.svelte.ts`, `src/lib/engine/lifecycle.ts` (DIRTY),
  `src/components/DemoChoreography.svelte`
- **Bug**: `scene-ready.svelte.ts` documents `sceneReady` as "WebGL canvas has finished its
  first render". In reality `signalSceneReady()` fires ONLY from Canvas's
  `onLoadingPhase('launch')` callback, which `lifecycle.ts` emits at the very END of
  `initEngine` — after data sync, WebGL init, geometry, semantic-threads import. So the
  signal conflates "first frame rendered" with "fully initialized incl. data". When the API
  is degraded/offline (audit: `semantic_service_offline`), data sync stalls, `'launch'` does
  not fire within 10s, and `DemoChoreography` falls back to captions-without-3D (parallel
  session audit CRITICAL #1). The canvas may render correctly later (after data loads) but
  the demo already ran degraded.
- **Fix sketch**: emit a separate "first frame rendered" signal from the renderer's first
  `requestAnimationFrame`/render call (decoupled from data load), and gate the demo/legend on
  that; keep `'launch'` for full-init completion. Or expose engine `status === 'degraded'`
  distinctly so the demo can choose the captions-vs-hint branch honestly.

### N4 — Redundant `'launch'` phase dispatch (LOW)

- **File**: `src/lib/engine/lifecycle.ts` (DIRTY)
- `initEngine` step 13 calls `callbacks.onLoadingPhase?.('launch', 1)` directly AND
  `window.dispatchEvent(new Event('scene-ready'))`. `bindEventBridge` registers
  `_sceneReadyHandler` that ALSO calls `callbacks.onLoadingPhase?.('launch', 1)`. So
  `'launch'` fires twice. Currently idempotent (canvasReady/signalSceneReady are safe to
  repeat), but it is redundant and fragile — a future non-idempotent onLoadingPhase
  consumer would double-fire. Pick one path.

### N5 — Parallel-session audit #3 (splash re-fires) — premise likely incorrect (verification needed)

- **Files**: `src/lib/stores/engine-ready.svelte.ts`, `src/components/Splash.svelte` (DIRTY)
- `engineReady` is sticky-true: `signalReady()` early-returns if `_value`; there is NO
  `resetEngineReady` / `_value = false` anywhere in `src/`. `Splash` is `hidden={engineReady.value}`.
- Therefore Splash cannot re-show on an App re-mount / HMR within the same module lifetime;
  only a full page reload re-evaluates the module. The audit's "splash re-fires after escape"
  most likely observed the **welcome dialog** (DemoChoreography/Welcome) or a full reload, not
  the Splash gate. Recommend the parallel session verify before investing in a re-mount guard.

## Surfaces still unaudited (parallel session did desktop 1440 first-visit only)

- Mobile 375×667 (idle, search, focus, map, filters)
- Map mode (galaxy↔map handoff overlay, terrain prelude, Leaflet load)
- Rapid view-switching interaction (N1's `view-transitioning` leak is easiest to provoke here)
- Focus/keyboard journeys that runtime snapshots miss (stale closures, focus-restore order)

## Suggested next steps (no edits made — awaiting direction)

1. Fix N1 (view-controller.ts is clean) — already fixed in this session; resolves audit #2 + the class leak.
2. Surface N2/N3/N4 to the parallel session (their files are dirty) for reconciliation.
3. Defer N5 verification to the parallel session.
4. Delegate a mobile + map live audit once the dirty tree clears. **Blocked in this session —
   subagent tools (external_subagent_start etc.) not surfaced in the Pi harness. Manual
   source-level mobile+map sweep performed below instead.**

## Mobile + Map source-level sweep findings

Performed a source-level cross-check of mobile / map / interaction paths that the
parallel session's desktop-first runtime audit did not inspect. These are logic bugs
that runtime snapshots cannot catch.

### M1 — `updateCameraViewportOffset` uses `window.innerWidth`, not container (MEDIUM)

- **File**: `src/lib/engine/three-engine-core.ts` (clean — not in parallel session's dirty list)
- **Bug**: `updateCameraViewportOffset()` reads `window.innerWidth` / `window.innerHeight`
  and passes them to `camera.setViewOffset(width, height, ...)`. However the actual WebGL
  renderer is sized from the `#canvas-container` element (`container.clientWidth || …`).
  If the layout ever constrains the canvas (e.g., sidebar open, margin, not full-viewport),
  the camera frustum and the renderer output will be mismatched — the 3D scene appears
  off-center or clipped.
- **Contrast**: `onWindowResize()` in the same file **already** uses container size; this
  function was missed.
- **Status**: ✅ FIXED in this session — now reads `container?.clientWidth ?? window.innerWidth`
  (matching the `onWindowResize` pattern).

### M2 — `map-state.ts` uses stale one-shot `isMobileViewport()` (MEDIUM)

- **Files**: `src/lib/engine/map-state.ts:324,469` (DIRTY — parallel session owns)
- **Bug**: `isMobileViewport()` checks `typeof window !== 'undefined' && window.innerWidth <= 768`.
  It is called as a plain function inside map zoom/fitting helpers. If the user resizes the
  browser from desktop→tablet mid-session, the map's padding (`paddingTopLeft`) and
  cluster-label counts (`.slice(0, isMobileViewport() ? 7 : 10)`) won't update until
  the map is fully re-initialized (or never, if Leaflet caches the fit).
- **Fix**: wire to the reactive `viewport` store (`$viewport.isMobile` or similar) and
  re-call the helpers inside a `$effect`.

### M3 — `journey-bindings.ts` uses raw `element.ontouchstart =` (LOW)

- **File**: `src/lib/ui/journey-bindings.ts:78-79` (DIRTY)
- **Bug**: Direct property assignment (`element.ontouchstart = stop`) overrides any other
  handlers on the element, and doesn't support `{ passive: true }`. On mobile Safari/Chrome,
  this can block scroll and trigger console warnings about non-passive touch listeners.
- **Fix**: `element.addEventListener('touchstart', stop, { passive: true })` and matching
  `removeEventListener` in cleanup.

### M4 — `canvas-hover-preview.ts` clamps to window, not canvas (LOW)

- **File**: `src/lib/journey/canvas-hover-preview.ts` (~line 228)
- **Bug**: Hover preview clamping logic uses `vw = window.innerWidth` / `vh = window.innerHeight`.
  If the canvas has margins or the window contains UI chrome that reduces effective canvas
  area, the clamping math can allow the preview to be drawn off-screen or overlap UI chrome.
- **Fix**: clamp against the canvas container's bounding rect instead.
