# Mimo-v2.5 Deep Bug Sweep Report - Wave 2 (2026-06-07)

## Overview
A coordinated wave of 5 parallel `mimo-v2.5` diagnostic workers performed a deep audit of CSS Layout, Component Logic Duplication, Journey Animation Races, Search API Cache Leaks, and State Proxy Integrity.

---

## 1. CSS & Layout Deep Audit
**Worker:** `bugsweep-css-layout-deep` (ocw_c9942042-...)

| Finding | Severity | File | Description |
|---|---|---|---|
| **Z-Index Token Bypass** | **HIGH** | `css/shell.css` | Multiple hardcoded `z-index` values (100, 1000, 2000) bypassing the `z-layers.css` token system. |
| **Media Query Drift** | MEDIUM | `css/mobile_premium_*.css` | `max-width: 1024px` used in some files while others use `768px`, leading to a "ghost" desktop layout on large tablets. |
| **Reduced Motion Gap** | MEDIUM | `css/animations.css` | Missing `animation: none !important` suppression for critical HUD transitions in `@media (prefers-reduced-motion)`. |
| **Pixel Units** | LOW | `css/layout_base.css` | Hardcoded `240px` sidebar width; should be a CSS variable for consistent theme control. |

---

## 2. Component Logic Duplication
**Worker:** `bugsweep-component-logic-duplication` (ocw_164d5491-...)

| Finding | Severity | File | Description |
|---|---|---|---|
| **Dead Journey Canvas** | **HIGH** | `JourneyCanvas.svelte` | Component is NOT rendered in `App.svelte` and has 85% logic overlap with `Canvas.svelte`. Recommend deletion. |
| **Lifecycle Divergence** | MEDIUM | `Canvas.svelte` | `onLoadingPhase` handling missing 4 edge cases present in the legacy JS engine. |
| **Duplicate Listeners** | MEDIUM | `Canvas.svelte` | Both the component and the legacy `bridge.js` attach `resize` listeners to `window`, causing double-calculates. |

---

## 3. Journey & Animation Races
**Worker:** `bugsweep-journey-animation-races` (ocw_413b78bf-...)

| Finding | Severity | File | Description |
|---|---|---|---|
| **Ghost RAF Loops** | **HIGH** | `js/modules/journey-engine.js` | Transitioning journey phases doesn't explicitly `cancelAnimationFrame` for the previous phase's custom loop. |
| **LookAt Undefined** | **HIGH** | `js/modules/three-engine.js` | Rapid focus switching can call `camera.lookAt()` with `NaN` if the target node hasn't calculated its overview scatter offset. |
| **Dispose Leak** | MEDIUM | `js/modules/camera-controls.js` | `dispose()` doesn't unbind the `pointermove` listener on the canvas element. |

---

## 4. Search API & Cache Leaks
**Worker:** `bugsweep-search-api-cache-leaks` (ocw_7156101e-...)

| Finding | Severity | File | Description |
|---|---|---|---|
| **Zombie Fetch Signals** | **HIGH** | `js/modules/search-state.js` | Missing `AbortController` in search triggers. Rapid typing leads to 10+ concurrent background requests competing for memory. |
| **Persistent Large Objects** | **HIGH** | `js/modules/search-state.js` | Search results are stored in a closure inside `bindSearchResultInteractions`, preventing GC even after the search UI is closed. |
| **Cache TTL Missing** | MEDIUM | `api/supervisor.php` | The `$semantic_dataset` cache in PHP has no expiry mechanism. Needs a filesystem or Redis TTL. |

---

## 5. State Proxy Integrity
**Worker:** `bugsweep-state-proxy-integrity` (ocw_a184758c-...)

| Finding | Severity | File | Description |
|---|---|---|---|
| **Dynamic Prop Bypass** | **HIGH** | `js/state.js` | 5-6 properties added at runtime (e.g., `neighborhoodManifest`) aren't caught by init-time Proxy tracking. |
| **Imperative FocusedNode** | **HIGH** | `js/modules/lifecycle-*.js` | `focusedNode` is being set via side-effects in 3 places instead of going through the central reactor. |
| **TS/JS Interface Drift** | MEDIUM | `types/state.d.ts` | 5 `DerivedFlags` have no JS runtime implementation. |

---

## Synthesis & Next Steps
1. **Immediate Action:** Delete `JourneyCanvas.svelte` and patch `lookAt(NaN)` in the 3D engine.
2. **Resource Management:** Implement `AbortController` in search and `cancelAnimationFrame` in the journey engine.
3. **Architecture:** Refactor `neighborhood` properties to be explicitly declared at init to fix Proxy tracking.
4. **CSS Hygiene:** Audit `shell.css` for z-index token compliance.