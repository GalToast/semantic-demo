# Performance Budget

> Living document — last updated 2026-08-07 (renderer diagnostics and restore hardening).
> Source data: `docs/w40-bundle-audit-2026-06-18.md`.

This document defines hard performance ceilings for the Semantic Explorer. All PRs that affect bundle size, render performance, or GPU usage must be checked against these budgets.

---

## 1. Bundle Size Budget

| Metric                 | Current (measured) | Live ceiling (script) | Slack         |
| ---------------------- | ------------------ | --------------------- | ------------- |
| **Total JS (raw)**     | 1,687.76 KB        | 2,500 KB (2.5 MB)     | 812 KB (32%)  |
| **Total JS (gzip)**    | 496.06 KB          | 650 KB                | 154 KB (24%)  |
| **CSS initial (raw)**  | 58.34 KB           | 65 KB                 | 6.66 KB (10%) |
| **CSS initial (gzip)** | 10.60 KB           | 16 KB                 | 5.40 KB (34%) |

### Budget Rationale

- **Live ceiling (2.5 MB JS raw / 650 KB JS gzip)**: Enforced by `node scripts/check-bundle-size.mjs` in CI. Exceeding this is a regression.
- **CSS budget measured on initial-load only (2026-08-18)**: `scripts/check-bundle-size.mjs` now counts only stylesheets linked from the built `index.html` (entry `index-*.css` + `ErrorState-*.css`) against the CSS ceiling; lazy chunks (InfoPanel, JourneyChrome, FocusCard, Placeholder2D, MapView, Canvas — deferred to first-interaction via `createLazyComponent`) are excluded because they are NOT fetched on initial paint, matching the "code-split / lazy-load mode-specific components" intent below. Full `assets/` totals still print for reference.
- **2026-08-18 chunking win**: converted the four heaviest static imports in `src/App.svelte` (InfoPanel 14.4 KB, JourneyChrome 13.2 KB, Placeholder2D 9.7 KB, FocusCard 7.6 KB CSS) to lazy handles with `ensure(true)` eager-loading for contract tests + idle prewarm. Entry CSS dropped 86.7 KB → 57.6 KB (−33%); initial-load CSS is now 58.34 KB raw / ~11 KB gzip — **both under the 65/16 budget since the split**.
- **CSS ceiling (65 KB initial raw / 16 KB initial gzip)**: Raised 2026-06-29 from 60/12 to account for the full surface-matrix complexity (13 states × desktop + mobile); re-baselined to initial-load measurement on 2026-08-18 when per-route lazy CSS chunking landed (entry dropped 86.7 → 58.3 KB). Monitor.

### Proposed Next-Ceiling (requires script + CI update)

Once the current ceiling has proven stable, consider tightening to:

| Metric  | Proposed ceiling | Rationale                                        |
| ------- | ---------------- | ------------------------------------------------ |
| JS raw  | ≤ 1,500 KB       | 500 KB above current actual; accounts for growth |
| JS gzip | ≤ 400 KB         | 62 KB above current actual                       |

These are **not live** — the script still enforces 2,500 / 650 / 65 / 16.

### Key Offenders

| Module                   | Raw       | % of Bundle | Action                                       |
| ------------------------ | --------- | ----------- | -------------------------------------------- |
| Three.js                 | 561.88 KB | 46.1%       | Reduced via selective imports (W41); monitor |
| Postprocessing           | 80.55 KB  | 6.6%        | Already tree-shaken; monitor                 |
| App source (TS + Svelte) | 549.87 KB | 45.1%       | Lazy-load mode-specific components           |
| Lazy-loaded chunks       | 23.92 KB  | 2.0%        | SearchResults + JourneyChrome (code-split)   |

---

## 2. Web Performance Budget (Core Web Vitals)

| Metric                              | Mobile   | Desktop  | Notes                                  |
| ----------------------------------- | -------- | -------- | -------------------------------------- |
| **LCP** (Largest Contentful Paint)  | < 2.5 s  | < 1.5 s  | 3D canvas first meaningful frame       |
| **CLS** (Cumulative Layout Shift)   | < 0.1    | < 0.1    | Panel overlays must not shift layout   |
| **INP** (Interaction to Next Paint) | < 200 ms | < 200 ms | Search, focus, and filter interactions |
| **TTFB** (Time to First Byte)       | < 600 ms | < 600 ms | CDN + edge caching                     |

### Measurement

- Run Lighthouse via `npx lighthouse http://127.0.0.1:8795/ --output=json` after `npm run serve` (PHP CLI serves `index.html` and executes `/api.php`).
- Core Web Vitals can also be sampled via Chrome DevTools Performance panel.
- Budget failures should be filed as bugs with `perf-budget` label.

### Tap→Canvas Init-Chain Budget (INP campaign 2026-08/09)

The splash-CTA tap → first 3D canvas gap is budgeted separately from CWV.
Instrumentation: `__ENGINE_INIT_TRACE__` breadcrumbs + `performance`
`engine-init-*` marks (merged by `tmp/init-trace-probe.mjs`, which is
self-contained — inline server, no external dependency).

| phase (from gpu-start)                   | budget  | measured (throttled 4x)                                                    |
| ---------------------------------------- | ------- | -------------------------------------------------------------------------- |
| scene build (buildThreeSceneOrFallback)  | ≤ 250ms | 174–229ms ✓                                                                |
| createPoints (8,406 pts + matrices)      | ≤ 400ms | 394–624ms ⚠                                                                |
| createMycelium boot (geometric, chunked) | ≤ 400ms | 332–906ms ⚠ scan median 448ms; yields every 800pts keep tasks under budget |
| bindings + semantic attach + ready       | ≤ 100ms | ~100ms ✓                                                                   |

- **Landed**: LOD-first mycelium build (`aa7cf281`, segmentsPerPair 4 →
  idle-upgrade to 10) — quantification pending a quiet-window run.
- **Attribution correction (2026-08-26)**: the old "751–1807ms" window was
  NOT tessellation and NOT the discovery worker — fine-grained marks proved
  it is `buildGeometricMyceliumEdges`' 27-bucket neighbor scan (the boot
  scene always built on the geometric fallback because the 40MB threads
  artifact lands ~20s AFTER mycelium). Boot is ~15.7k segments; the
  ~176k-segment semantic contract arrives via the rebuild below.
- **Landed**: semantic upgrade chain (`7e360bc8` rebuild when the neighbor
  map arrives → `57fb9a32` atomic swap keeps old filaments visible during
  the rebuild → `2f340601` 300ms cross-fade). Certified end-to-end: marks
  `mycelium-semantic-rebuild` (+19.8s) → discovery → rebuild done (+25.8s);
  segments 15,670 → 176,200 (core 110,860 + bridge 65,340).
- **Landed**: geometric scan opt (`e43da739`) — squared distance, integer
  pair keys, `Set<number>`, chunked `yieldToBrowser` every 800 points.
  Scan median 881ms → 448ms under load (quiet-window rerun pending).
- **Landed**: pp-chunk eval deferred off the interaction window
  (`0c19e272`) and WebGL graph prewarm at CTA-visible (`0cca993d`).

Measurement honesty rules (learned the hard way):

1. Always 4x CPU throttle + 150ms latency — unthrottled numbers are not
   comparable to the bar (and nightly lane activity adds ±50% noise).
2. Gate the gesture on CTA _visibility_, not a fixed timer.
3. Worker fetches are invisible to main-thread resource timing — read
   `dataLoadState.status` instead.
4. N ≥ 3 per arm, compare medians; single runs have proven meaningless.

---

## 3. WebGL / GPU Budget

| Metric                                   | Budget                      | Current          | Notes                                                                                                                         |
| ---------------------------------------- | --------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Frame rate**                           | ≥ 60 fps on mid-tier mobile | 60 fps (desktop) | Target: Pixel 7 / iPhone 13 class                                                                                             |
| **Draw calls / frame**                   | < 200                       | ~150 (est.)      | InstancedMesh for node rendering                                                                                              |
| **Triangles / frame**                    | < 5.0M                      | ~3.9M (measured) | 16×15 instanced spore geometry plus mycelium threads                                                                          |
| **Texture GPU memory**                   | < 50 MB                     | ~30 MB (est.)    | Canvas textures + postprocessing                                                                                              |
| **Node count**                           | 8,406                       | 8,406            | Fixed dataset; no growth expected                                                                                             |
| **Thread CPU (updateMyceliumThreads)**   | —                           | runtime sampled  | `scenePerformanceDiagnostics.lastThreadUpdateMs` records the last dirty rebuild and its dirty-node/pair counts                |
| **Overlay CPU (focus semantic overlay)** | —                           | runtime sampled  | `focusFrameDiagnostics.lastOverlayMs` records synchronous buffer writes; averages/maxima are visible in the diagnostics state |

### GPU Profiling

- Use Chrome DevTools → Performance → GPU column for draw call counts.
- Three.js `renderer.info` exposes `programs`, `geometries`, `textures` counts.
- For mobile profiling, use Android GPU Inspector or Xcode GPU Profiler.

### Runtime Renderer Diagnostics

The engine records the two previously unmeasured CPU seams without allocating
per frame: dirty mycelium rebuild time/counts and focus semantic overlay buffer
update time/edge counts. These values are diagnostic observations, not new
render gates; use the existing render-skip counters and the reduced-motion
WebGL diagnostic for pass/fail verification.

WebGL context restoration uses a bounded two-retry backoff (1s, then 3s) with a
15s watchdog per attempt. Manual re-initialization and teardown invalidate the
restore generation, so late callbacks cannot resurrect a disposed scene. A
watchdog escalation marks the engine degraded and offers an honest reload
recovery message; a late successful init reconciles the engine back to ready.

Cold startup is intentionally two-phase: the engine publishes lifecycle
readiness and the `launch` loading phase before `startRenderLoop()` schedules
the first GPU frame. This prevents a cold shader compile from tripping the
startup safety valve before the Svelte chrome is mounted. Browser journey runs
on Chromium's default headless renderer may still report `GPU stall due to
ReadPixels` and take materially longer than a physical GPU; use
`SEMANTIC_USE_D3D11=1` for a hardware-path comparison before treating that as
an app-level interaction regression.

---

## 4. Migration Status

### Three.js Selective Import Conversion (W41 — COMPLETE)

| Status                     | Detail                                                                |
| -------------------------- | --------------------------------------------------------------------- |
| **Complete**               | W41 commit `fc0c4bc` converted namespace imports to selective imports |
| **Savings achieved**       | ~1,319 KB raw reduction (52% of original 2,539 KB)                    |
| **Current state**          | Three.js chunk: 561.88 KB (down from 759.7 KB)                        |
| **Post-conversion actual** | 1,219.73 KB total JS (51% under 2,500 KB ceiling)                     |

### How Namespace Imports Kill Tree-Shaking

```typescript
// ❌ Namespace import — Rollup cannot eliminate unused exports
import * as THREE from 'three';
const mesh = new THREE.Mesh(...);

// ✅ Selective import — Rollup eliminates everything not imported
import { Mesh, BufferGeometry, MeshBasicMaterial } from 'three';
const mesh = new Mesh(...);
```

Three.js exports 300+ symbols. We use ~50. The other 250+ (VR/XR, loaders, audio, morph targets, skinned meshes, compression formats) ship as dead weight.

### Lazy-Load Candidates (Implemented in W43)

| Component              | Raw      | Gzip    | Status        |
| ---------------------- | -------- | ------- | ------------- |
| `SearchResults.svelte` | 12.40 KB | 4.63 KB | ✅ Code-split |
| `JourneyChrome.svelte` | 11.52 KB | 4.20 KB | ✅ Code-split |

Potential additional deferral: ~23 KB raw / ~9 KB gzip (remaining non-split components).

---

## 5. Enforcement

1. **CI Gate**: Bundle size check against ceiling (2,500 KB JS raw / 650 KB JS gzip) is live via `node scripts/check-bundle-size.mjs`.
2. **PR Review**: Any PR that adds >10 KB raw must justify the addition.
3. **Quarterly Review**: Re-audit bundle with `npx vite build --mode analyze` and update this document.
4. **Regression Protocol**: If ceiling is exceeded, file a `P1-perf-regression` issue and block release.

---

_This budget is a living document. Update it as the architecture evolves._
