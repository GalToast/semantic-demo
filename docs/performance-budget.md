# Performance Budget

> Living document — last updated 2026-06-18 (W38 Charter Closeout).
> Source data: `docs/w40-bundle-audit-2026-06-18.md`.

This document defines hard performance ceilings for the Semantic Explorer. All PRs that affect bundle size, render performance, or GPU usage must be checked against these budgets.

---

## 1. Bundle Size Budget

| Metric | Current | Target | Ceiling |
|--------|---------|--------|---------|
| **Total JS (raw)** | 2,539 KB (2.54 MB) | < 2,000 KB (< 2.0 MB) | 2,500 KB (2.5 MB) |
| **Total JS (gzip)** | 610 KB | < 500 KB | 650 KB |
| **Total CSS (raw)** | 54.6 KB | < 50 KB | 60 KB |
| **Total CSS (gzip)** | 9.7 KB | < 9 KB | 12 KB |

### Budget Rationale

- **Ceiling (2.5 MB raw)**: Current state. Exceeding this is a regression.
- **Target (2.0 MB raw)**: Achievable after Three.js selective import conversion (W39/40). Estimated 400–600 KB reduction from eliminating unused Three.js exports.
- **gzip ceiling (650 KB)**: Accounts for Three.js compressibility; JS compresses ~4:1.

### Key Offenders

| Module | Raw | % of Bundle | Action |
|--------|-----|-------------|--------|
| Three.js (core + module) | 1,168 KB | 46% | Selective imports → tree-shake unused 250+ exports |
| Postprocessing | 111 KB | 4.4% | Already tree-shaken; monitor |
| Svelte runtime | 149 KB | 5.9% | Fixed cost; no action |
| App source (TS + Svelte) | 1,063 KB | 42% | Lazy-load mode-specific components |

---

## 2. Web Performance Budget (Core Web Vitals)

| Metric | Mobile | Desktop | Notes |
|--------|--------|---------|-------|
| **LCP** (Largest Contentful Paint) | < 2.5 s | < 1.5 s | 3D canvas first meaningful frame |
| **CLS** (Cumulative Layout Shift) | < 0.1 | < 0.1 | Panel overlays must not shift layout |
| **INP** (Interaction to Next Paint) | < 200 ms | < 200 ms | Search, focus, and filter interactions |
| **TTFB** (Time to First Byte) | < 600 ms | < 600 ms | CDN + edge caching |

### Measurement

- Run Lighthouse via `npx lighthouse http://127.0.0.1:8795/vector-explorer-polished.html --output=json` after `npm run serve`.
- Core Web Vitals can also be sampled via Chrome DevTools Performance panel.
- Budget failures should be filed as bugs with `perf-budget` label.

---

## 3. WebGL / GPU Budget

| Metric | Budget | Current | Notes |
|--------|--------|---------|-------|
| **Frame rate** | ≥ 60 fps on mid-tier mobile | 60 fps (desktop) | Target: Pixel 7 / iPhone 13 class |
| **Draw calls / frame** | < 200 | ~150 (est.) | InstancedMesh for node rendering |
| **Texture GPU memory** | < 50 MB | ~30 MB (est.) | Canvas textures + postprocessing |
| **Node count** | 8,406 | 8,406 | Fixed dataset; no growth expected |

### GPU Profiling

- Use Chrome DevTools → Performance → GPU column for draw call counts.
- Three.js `renderer.info` exposes `programs`, `geometries`, `textures` counts.
- For mobile profiling, use Android GPU Inspector or Xcode GPU Profiler.

---

## 4. Migration Status

### Three.js Selective Import Conversion (W39/40)

| Status | Detail |
|--------|--------|
| **In progress** | 37 files use `import * as THREE from 'three'` (namespace import) |
| **2 files converted** | `src/lib/utils/three-textures.ts`, `src/lib/engine/three-postprocessing.ts` |
| **Expected savings** | ~400–600 KB raw (16–24% of total bundle) |
| **Post-conversion target** | < 2.0 MB raw total |

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

### Lazy-Load Candidates (Post-Selective-Import)

| Component | Raw | Gzip | Rationale |
|-----------|-----|------|-----------|
| `SearchResults.svelte` | 22.4 KB | 5.9 KB | Only visible during search |
| `JourneyChrome.svelte` | 22.5 KB | 5.5 KB | Only in journey/thread mode |
| `InfoPanel.svelte` | 22.3 KB | 5.5 KB | Only when node selected |
| `search-engine.ts` | 20.9 KB | 6.1 KB | Only after first search |

Potential additional deferral: ~88 KB raw / ~23 KB gzip.

---

## 5. Enforcement

1. **CI Gate**: Bundle size check against ceiling (2.5 MB raw) should be added to CI.
2. **PR Review**: Any PR that adds >10 KB raw must justify the addition.
3. **Quarterly Review**: Re-audit bundle with `npx vite build --mode analyze` and update this document.
4. **Regression Protocol**: If ceiling is exceeded, file a `P1-perf-regression` issue and block release.

---

*This budget is a living document. Update it as the architecture evolves.*
