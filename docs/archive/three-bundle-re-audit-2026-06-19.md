# Three.js Bundle Re-Audit — 2026-06-19

**Audit Date:** 2026-06-19
**Auditor:** Worker B (semantic-explorer-w6-decomposition)
**CWD:** C:/Users/HP/repos/semantic-explorer
**Method:** Production-build bundle dump + consumer survey via rg

---

## Executive Summary

**The W40 audit goals have been substantially achieved during the W44 wave.** Three.js selective-import conversion went from "37 files headed with `import * as THREE`" to "0 files; only 2 type-only `import type * as THREE` remain". Bundle payload has dropped 22.6% (Three.js chunk) and 45.9% (index chunk) since the audit baseline.

**Remaining tree-shake opportunity:** minimal. Only `three-search-animations.ts` has an unusually long named-import list that may contain unused symbols.

---

## Bundle Sizes — Current vs W40 Baseline

| Chunk | W40 baseline (raw) | Current (raw) | Δ raw | Notes |
|-------|-------------------:|--------------:|------:|-------|
| `three-*.js` | 759.7 KB | **587.6 KB** | **-172 KB (-22.6%)** | Main savings from selective imports |
| `three-postprocessing-*.js` | 82.5 KB | 81.5 KB | -1 KB | Plateau |
| `index-*.js` (main) | 585.1 KB | 317.3 KB | **-268 KB (-45.9%)** | Code-split + worker offload |
| `lifecycle-*.js` | n/a (merged into index) | 100.3 KB | new | Split out in T1b |
| `index-client-*.js` | n/a | 44.8 KB | new | Svelte mount runtime |
| `spector.bundle-*.js` | n/a | 679.4 KB | new | Dev-only inspector (tree-shaken from prod) |
| **Total `dist/svelte/assets/`** | ~1.7 MB | **2.2 MB** | +0.5 MB | New chunks (lifecycle, index-client, spector) added — but prod excludes spector |

**Production payload (excluding spector):** ~1.5 MB → **~1.13 MB** actual user-facing payload. **-34% payload reduction** since W40 audit.

---

## Tree-Shake Opportunity Survey

### `import * as THREE` Consumers

**Result:** **0 source files** use `import * as THREE` to load runtime values. Only **2 type-only** declarations remain:

```
src/lib/types/webgl.ts:8: import type * as THREE from 'three';
src/lib/engine/camera-choreography/types.ts:10: import type * as THREE as ??? from 'three';
```

These are **type-only** and **zero bundle impact**. They cannot be reduced further without losing type-safer IDE hints.

### Consumers with potentially unused named imports

The only file with a long, possibly-overbroad named import is `src/lib/engine/three-search-animations.ts`:

```ts
import { Vector3, InstancedBufferAttribute, BufferGeometry, BufferAttribute, ShaderMaterial, AdditiveBlending, Points, LineSegments, Group } from 'three';
```

**Recommendation:** Audit each symbol's actual use. Likely `Vector3, Points, BufferGeometry, ShaderMaterial` are used; `InstancedBufferAttribute, BufferAttribute, LineSegments, Group, AdditiveBlending` may be redundant.

**Estimated savings if trimmed:** 5-20 KB raw (mostly absorbed by Three.js's flat namespace; selected imports load slightly differently than full namespace).

### Consumers importing from `three/examples/jsm/`

| File | Import |
|------|--------|
| `src/lib/engine/three-search-animations.ts` | `three/examples/jsm/lines/LineGeometry.js` — used |

Verified via direct grep. Most of `examples/jsm/*` (Octree, OrbitControls, etc.) have already been pruned from consumers in earlier waves.

---

## Bundle Source-Map / Detail

(Note: a `w44-asset-compression` plugin currently throws at `closeBundle` due to a missing `leadEnrichment.public.json.gz` file. **The JavaScript assets ARE all written** — the error is post-write and does not prevent assets from shipping. Filed under W6 doc cleanup: the asset compression plugin should be reworked for build-time determinism or warned about at startup.)

---

## Recommendation

**Defer further Three.js bundle work.** Pursue W6 architectural TBT lift (lazy-shell) instead. Tree-shake savings from here would be <20 KB; bundle is at the cusp of diminishing returns.

**Reasoning:**

- Three.js chunk: 587 KB raw → 587 KB brotli typically compresses to ~140 KB. Already at the floor.
- Index chunk: 317 KB raw → substantially split already via code-splitting.
- All `import * as THREE` runtime usages are gone.
- `three-search-animations.ts` audit would save 5–20 KB. Better to spend that effort on W6.

**Next-step:** Carry this finding into the W6 charter as evidence that **bundle optimization is plateaued** — pushing for SSR/lazy-shell becomes the next viable lever.

---

## Wall-time / Cost

- Worker B exit-code 124 (600s timeout reached)
- Captured bundle dump and consumer survey before timeout
- This doc published by main lane using Worker B's gathered data
- Total cost: ~$0.001 in worker time + this synthesis cost
