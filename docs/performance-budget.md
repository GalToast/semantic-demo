# Performance Budget

> Living document — last updated 2026-09-01 (fresh bundle baseline + paint-metrics gate).
> Source data: `docs/w40-bundle-audit-2026-06-18.md`.

This document defines hard performance ceilings for the Semantic Explorer. All PRs that affect bundle size, render performance, or GPU usage must be checked against these budgets.

Bundle policy values are defined once in `scripts/bundle-budget.mjs`. CI applies
two explicit protections to the same build: `check-bundle-size.mjs` enforces the
hard raw/gzip ceilings, while `qa-budget.mjs` compares the stamped JS trend
baseline and also checks the shared JS raw ceiling. A pass from one check never
overrides a failure from the other; the output identifies which policy failed.

---

## 1. Bundle Size Budget

| Metric                 | Current (measured 2026-09-01) | Live ceiling (script) | Slack        |
| ---------------------- | ----------------------------- | --------------------- | ------------ |
| **Total JS (raw)**     | 1,869.90 KB                   | 1,902 KB              | 32.1 KB (2%) |
| **Total JS (gzip)**    | 555.34 KB                     | 566 KB                | 10.7 KB (2%) |
| **CSS initial (raw)**  | 58.26 KB                      | 59.5 KB               | 1.24 KB (2%) |
| **CSS initial (gzip)** | 10.80 KB                      | 11.1 KB               | 0.30 KB (3%) |

### Budget Rationale

- **2026-08-30 freeze policy**: the 2026-08-23 audit found the gate green only
  because ceilings (2500/650/65/16) had drifted far above actuals — a gate that
  cannot fail. Ceilings were re-frozen at measured fresh-build actuals +2%
  drift in `scripts/check-bundle-size.mjs`. **Ratchet DOWN freely; raising a
  ceiling requires a measured re-baseline (fresh `npm run build` actuals) + a
  commit naming the cause — never raise a ceiling just to green a failing
  gate.** Run-to-run gzip variance is ~0.2 KB; 2% headroom absorbs it.
- **2026-09-01 trend baseline**: a fresh rebuild measured 1,869.90 KB raw JS,
  555.34 KB gzip JS, 58.26 KB initial CSS, and 10.80 KB initial CSS gzip.
  `docs/budget-baseline-2026-09-01.json` records the current build era and its
  +159.0 KB delta from the 2026-08-24 stamp. The baseline was intentionally
  stamped from the active dirty worktree; review that delta before accepting
  further growth.
- **CSS budget measured on initial-load only (2026-08-18)**: `scripts/check-bundle-size.mjs` now counts only stylesheets linked from the built `index.html` (entry `index-*.css` + `ErrorState-*.css`) against the CSS ceiling; lazy chunks (InfoPanel, JourneyChrome, FocusCard, Placeholder2D, MapView, Canvas — deferred to first-interaction via `createLazyComponent`) are excluded because they are NOT fetched on initial paint, matching the "code-split / lazy-load mode-specific components" intent below. Full `assets/` totals still print for reference.
- **2026-08-18 chunking win**: converted the four heaviest static imports in `src/App.svelte` (InfoPanel 14.4 KB, JourneyChrome 13.2 KB, Placeholder2D 9.7 KB, FocusCard 7.6 KB CSS) to lazy handles with `ensure(true)` eager-loading for contract tests + idle prewarm. Entry CSS dropped 86.7 KB → 57.6 KB (−33%); initial-load CSS is now 58.34 KB raw / ~11 KB gzip — **both under the 65/16 budget since the split**.
- **CSS ceiling history**: the older 65 KB initial raw / 16 KB initial gzip
  ceiling was raised 2026-06-29 for the full surface matrix and re-baselined
  on 2026-08-18. The live ceiling is now the tighter 59.5/11.1 KB freeze above;
  the 2026-09-01 build retains only 1.24/0.30 KB of slack. Monitor closely.

### Reduction Targets (not live)

Once the current ceiling has proven stable, consider pursuing these reduction
targets (they are not valid ceilings yet):

| Metric  | Reduction target | Distance from current actual                   |
| ------- | ---------------- | ------------------------------------------------ |
| JS raw  | ≤ 1,500 KB       | 369.9 KB below current actual; requires work    |
| JS gzip | ≤ 400 KB         | 155.3 KB below current actual; requires work    |

These are **not live** — the script enforces the 2026-08-30 freeze (1902 / 566 / 59.5 / 11.1). Do not change the live ceiling to these values until a measured reduction plan lands.

### Key Offenders

| Module / chunk           | Raw       | % of Bundle | Action                                       |
| ------------------------ | --------- | ----------- | -------------------------------------------- |
| `three.module-*.js`      | 716.75 KB | 38.3%       | Largest single chunk; split or reduce imports |
| `search.svelte-*.js`     | 129.23 KB | 6.9%        | Keep search off the bare/mobile cold path     |
| `mycelium-build-worker-*.js` | 123.79 KB | 6.6%    | Measure worker bootstrap and defer where safe |
| `three-engine-core-*.js` | 113.20 KB | 6.1%        | Audit engine-only imports and lazy boundaries |
| `three-postprocessing-*.js` | 79.73 KB | 4.3%      | Keep deferred; profile shader/effect necessity |

---

## 2. Web Performance Budget (Core Web Vitals)

| Metric                              | Mobile   | Desktop  | Notes                                  |
| ----------------------------------- | -------- | -------- | -------------------------------------- |
| **LCP** (Largest Contentful Paint)  | < 2.5 s  | < 1.5 s  | 3D canvas first meaningful frame       |
| **CLS** (Cumulative Layout Shift)   | < 0.1    | < 0.1    | Panel overlays must not shift layout   |
| **INP** (Interaction to Next Paint) | < 200 ms | < 200 ms | Search, focus, and filter interactions |
| **TTFB** (Time to First Byte)       | < 600 ms | < 600 ms | CDN + edge caching                     |

### Measurement

**Enforced gate:** `SEMANTIC_USE_D3D11=1 npm run qa:paint-budget` — measures
LCP / FCP / CLS / TTFB of the built app in headed Chromium and fails on drift
from `docs/paint-metrics-baseline-2026-08-30.json`. Two protocols exist because
first-paint is bimodal on this box: `cold` (default; catches catastrophic +
bundle regressions; LCP budget 7780ms) and `--warm` (fresh context after a
warm-up nav; catches perf-code drift; LCP budget 2800ms).

**Honest status vs the targets above (2026-08-30):** warm-protocol LCP is
~2.4s — at the desktop target boundary. Cold-protocol LCP is ~6.8s (consistent
with the 2026-08-23 ~6.7s measurement) — far from target and recorded debt,
not a gate green. Lighthouse can still be run manually via
`npx lighthouse http://127.0.0.1:8798/dist/svelte/index.html --output=json`
for lab scoring, but the gate above is the enforced signal.
Budget failures should be filed as bugs with `perf-budget` label.

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
| **Current state**          | Three.js chunk: 716.75 KB (38.3% of the 2026-09-01 build)            |
| **Current total**          | 1,869.90 KB raw JS / 555.34 KB gzip JS                                |

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

1. **CI Gates**: `node scripts/check-bundle-size.mjs` enforces the live raw/gzip ceilings above; `node scripts/qa-budget.mjs` enforces the stamped trend budget plus the shared JS raw ceiling.
2. **PR Review**: Any PR that adds >10 KB raw must justify the addition.
3. **Quarterly Review**: Re-audit bundle with `npx vite build --mode analyze` and update this document.
4. **Regression Protocol**: If ceiling is exceeded, file a `P1-perf-regression` issue and block release.

---

_This budget is a living document. Update it as the architecture evolves._
