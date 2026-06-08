# Mimo-v2.5 Comprehensive Bug Sweep Report (2026-06-07)

## Overview
A wave of 4 parallel `mimo-v2.5` diagnostic workers was launched to audit the JS Runtime, TS Leaf Ports, WebGL Visuals, and Svelte/CSS migration layers. The sweep identified 22 actionable findings across all surfaces.

---

## 1. Visual & WebGL Accuracy
**Worker:** `bugsweep-visual-webgl` (ocw_a08ceb5d-...)

| Finding | Severity | File | Description |
|---|---|---|---|
| **Thread Depth Artifacts** | **HIGH** | `three-thread-manager.js:45` | `AdditiveBlending` with `depthWrite: true` causing depth order artifacts. Fix: Switch to `NormalBlending`. |
| **Dead Code Removal** | MEDIUM | `three-thread-manager.js` | `getThreadOpacityEnvelope()` is dead. |
| **Atmosphere Threshold** | MEDIUM | `three-engine.js:376` | Threshold too low (0.10). Fix: Bump to 0.13 for visibility. |
| **County Ref Sphere** | MEDIUM | `three-engine.js:388` | Too subtle (0.015). Fix: Bump to 0.03 or remove. |

---

## 2. TS Leaf Port Parity
**Worker:** `bugsweep-ts-leaf-parity` (ocw_2d06a3ba-...)

| Finding | Severity | File | Description |
|---|---|---|---|
| **Unicode Regression** | **HIGH** | `src/lib/utils/geo-data.ts:136` | ASCII regex `/[a-z0-9]+/g` drops accented characters. |
| **Missing Sentinels** | **HIGH** | `src/lib/engine/utils/data-mapper.ts:9` | Local `cleanOptionalValue` missing 5 of 6 canonical sentinels (unknown, n/a, etc.). |
| **StopWord Drift** | MEDIUM | `src/lib/utils/geo-data.ts:135` | Default `stopWords` is empty Set; canonical uses `SEARCH_STOP_WORDS`. |
| **Segmentation Gap** | MEDIUM | `src/lib/utils/geo-data.ts:135` | Missing `Intl.Segmenter` word segmentation. |
| **Triple Divergence** | LOW | `src/**` | Three different `tokenizeSearchText` implementations drifting apart. |

---

## 3. JS Runtime & State Mutation
**Worker:** `bugsweep-js-runtime-re-sweep` (ocw_f4475d24-...)

| Finding | Severity | File | Description |
|---|---|---|---|
| **FocusedNode Bypass** | MEDIUM | `js/state.js:542` | Derived setter bypasses production proxy traps. |
| **Filter Reassignment** | MEDIUM | `js/modules/filter-state.js` | Wholesale `activeFilters` reassignment without `withStateMutation()`. |
| **Filter Prop Writes** | LOW | `js/modules/filter-state.js:80` | Bare sub-property writes in `restoreActiveFiltersFromUrl()`. |
| **Orbit Slack Reassign** | LOW | `js/modules/camera-orbit-slack.js` | Wholesale `focusOrbitSlackState` reassignment bypass. |
| **Route State Reassign** | LOW | `js/modules/camera-controls-core.js:88` | Wholesale `routeExplorationState` reassignment bypass. |
| **Terrain Handoff** | LOW | `js/modules/map-state.js:447` | Wholesale `terrainHandoffState` reassignment bypass. |

---

## 4. Svelte & CSS Discovery
**Worker:** `bugsweep-svelte-css-discovery` (ocw_9eb19155-...)

| Finding | Severity | File | Description |
|---|---|---|---|
| **Svelte Rune Error** | **HIGH** | `ThreadInspector.svelte` | `$derived(() => ...)` misused; should be `$derived.by(() => ...)`. |
| **Dead Biofield CSS** | **HIGH** | `css/*.css` | ~200+ lines of dead `.biofield-*` rules and animations. |
| **Z-Index Drift** | MEDIUM | `index.html` / `z-layers.css` | Token mismatch between shell types. |
| **Misleading Fallback** | MEDIUM | `Filters.svelte:174` | `--z-controls` fallback is 50, but token is 800. |
| **Duplicate Canvas** | LOW | `Canvas.svelte` | High logic overlap with `JourneyCanvas.svelte`. Potential dead code. |

---

## Next Steps
1. **High Priority Fixes:** Execute fixes for `Thread Depth`, `Unicode Regression`, `Missing Sentinels`, and `Svelte Rune Error`.
2. **CSS Cleanup:** Prune dead `biofield-*` rules.
3. **State Discipline:** Patch the Proxy bypasses in `state.js` and `filter-state.js`.
4. **Token Sync:** Harmonize z-index tokens across all definitions.