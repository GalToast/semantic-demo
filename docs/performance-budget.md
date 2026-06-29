# Performance Budget

> Living document — last updated 2026-06-18 (W43 perf verification).
> Source data: `docs/w40-bundle-audit-2026-06-18.md`.

This document defines hard performance ceilings for the Semantic Explorer. All PRs that affect bundle size, render performance, or GPU usage must be checked against these budgets.

---

## 1. Bundle Size Budget

| Metric | Current (measured) | Live ceiling (script) | Slack |
|--------|---------|--------|---------|
| **Total JS (raw)** | 1,398.44 KB (1.40 MB) | 2,500 KB (2.5 MB) | 1,101 KB (44%) |
| **Total JS (gzip)** | 398.63 KB | 650 KB | 251 KB (39%) |
| **Total CSS (raw)** | 63.49 KB | 65 KB | 1.5 KB (2%) |
| **Total CSS (gzip)** | 15.06 KB | 16 KB | -0.9 KB (6%) |

### Budget Rationale

- **Live ceiling (2.5 MB JS raw / 650 KB JS gzip)**: Enforced by `node scripts/check-bundle-size.mjs` in CI. Exceeding this is a regression.
- **Current headroom**: 44% slack on JS raw, 39% on JS gzip — generous margin. CSS raw at 2% slack (tight after 13-surface matrix growth).
- **CSS ceiling (65 KB raw / 16 KB gzip)**: Raised 2026-06-29 from 60/12 to account for the full surface-matrix complexity (13 states × desktop + mobile). Monitor.

### Proposed Next-Ceiling (requires script + CI update)

Once the current ceiling has proven stable, consider tightening to:

| Metric | Proposed ceiling | Rationale |
|--------|-----------------|-----------|
| JS raw | ≤ 1,500 KB | 500 KB above current actual; accounts for growth |
| JS gzip | ≤ 400 KB | 62 KB above current actual |

These are **not live** — the script still enforces 2,500 / 650 / 65 / 16.

### Key Offenders

| Module | Raw | % of Bundle | Action |
|--------|-----|-------------|--------|
| Three.js | 561.88 KB | 46.1% | Reduced via selective imports (W41); monitor |
| Postprocessing | 80.55 KB | 6.6% | Already tree-shaken; monitor |
| App source (TS + Svelte) | 549.87 KB | 45.1% | Lazy-load mode-specific components |
| Lazy-loaded chunks | 23.92 KB | 2.0% | SearchResults + JourneyChrome (code-split) |

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

### Three.js Selective Import Conversion (W41 — COMPLETE)

| Status | Detail |
|--------|--------|
| **Complete** | W41 commit `fc0c4bc` converted namespace imports to selective imports |
| **Savings achieved** | ~1,319 KB raw reduction (52% of original 2,539 KB) |
| **Current state** | Three.js chunk: 561.88 KB (down from 759.7 KB) |
| **Post-conversion actual** | 1,219.73 KB total JS (51% under 2,500 KB ceiling) |

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

| Component | Raw | Gzip | Status |
|-----------|-----|------|--------|
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

*This budget is a living document. Update it as the architecture evolves.*
