# Three.js Bundle Dedup — Known Issue (2026-06-12)

## Summary

The production bundle contains both `three.core.js` (~648 KB rendered, ~126 KB gzip) and `three.module.js` (~547 KB rendered, ~103 KB gzip). Deduplicating these would save ~103 KB gzip, but no working approach has been found.

## Root Cause

`three.module.js` (the default `three` import target) is a re-export shim that also defines unique body content:

- **Line 6:** `import { ~300 names } from './three.core.js'`
- **Line 7:** `export { ~300 more names } from './three.core.js'`
- **Line 728:** `const UniformsLib = { ... }` — used by `LineMaterial` in `three/examples/jsm/lines/`
- **Line 955:** `const ShaderLib = { ... }` — used by multiple three.js internals
- **Bottom:** `__THREE_DEVTOOLS__` side-effect dispatch + `window.__THREE__` warning

Because `three.core.js` does NOT export `ShaderLib` or `UniformsLib`, any alias that redirects `'three'` → `three.core.js` breaks with `MISSING_EXPORT` errors at build time.

## Approaches Tried

| Approach | Result | Notes |
|---|---|---|
| `resolve.alias { 'three': 'three/build/three.core.js' }` | ❌ `MISSING_EXPORT` | ShaderLib/UniformsLib not in core |
| `resolve.dedupe: ['three']` | ❌ No effect | Vite's optimizeDeps ignores dedupe |
| `optimizeDeps.exclude: ['three']` | ❌ No effect | Pre-bundling is not the cause |
| Custom Vite plugin to merge chunks | ⚠️ Not attempted | High risk of breaking module semantics |

## Community Context

- **Upstream issue:** mrdoob/three.js#29156 — "Provide a WebGPU build that re-exports from three"
- **Discourse thread:** `import from 'three/tsl'` — same root cause (module graph fragmentation)
- **Status:** Acknowledged upstream, no fix timeline

## Recommendation

1. **Do not attempt dedup via Vite aliases** — it will break ShaderLib/UniformsLib consumers
2. **Monitor upstream** — when mrdoob/three.js#29156 resolves, the module graph may simplify
3. **Consider manual tree-shaking** — if `ShaderLib` and `UniformsLib` are not needed at runtime (they're used by `LineMaterial` and post-processing passes), a custom build could exclude them
4. **103 KB gzip is the ceiling** — this is the maximum savings if dedup were possible

## Artifacts

- Worker A (implementer) logs: `tmp/dedup-wave-paid/ocw_f739b67a-*/stdout.log`
- Worker B (QA + alternatives) logs: `tmp/dedup-wave-paid/ocw_dcca5cc1-*/stdout.log`
- Worker diagnostic scripts: `scripts/inspect-three*.mjs`, `scripts/parse-stats*.mjs` (untracked)
