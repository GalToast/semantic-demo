# Mimo-v2.5 Hybrid Bug Sweep Report - Wave 4 (2026-06-07)

## Overview
A high-precision hybrid wave was executed using 4 `mimo-v2.5` implementation workers and 1 `nemotron-ultra` (DeepSeek fallback) architectural worker. The sweep identified critical structural weaknesses, deep-level implementation bugs, and massive amounts of redundant code.

---

## 1. Architectural Stress Test
**Worker:** `bugsweep-architectural-stress-test` (DeepSeek-v4-Flash)

| Finding | Severity | Description |
|---|---|---|
| **Rune Incompleteness** | 🔴 **CRITICAL** | All 12 Svelte stores still use Svelte 4 `writable()`. This forces `parity-attrs.ts` into a "subscribe + JSON-stringify" anti-pattern for 10 stores. |
| **god-module Bridge** | **HIGH** | `bridge.ts` is a 1259-line god module that violates the "thin adapter" principle. Recommend splitting into 5 domain-specific adapters. |
| **Data Sync Polling** | **HIGH** | `syncDataToLegacyState()` uses a 15-second polling loop, creating fragile timing coupling between systems. |
| **Phase Ordering Risk** | MEDIUM | The current plan ports heavy Three.js modules (P2) before lighter UI logic (P4). Inverting this would shed 40% of the bridge footprint earlier. |

---

## 2. Granular Implementation Detail
**Workers:** `mimo-v2.5` (4 parallel)

### Concurrency & Async
- **Zombie Render Loop:** `three-engine.js:689` `animate()` loop has NO error protection. A single WebGL exception permanently freezes the UI with no recovery.
- **Cache Stampede:** `waitForSemanticSearchCache()` lacks file-based advisory locking (`flock`), risking corruption during concurrent writes.

### Data Structure & Schema Drift
- **Pagination Overwrite:** The search cache uses `trimmedQuery` as the ONLY key. Paginated results (offset > 0) overwrite the first page in the cache.
- **Sentinel Silence:** `data-loader.ts:136` uses an `as number` cast to hide `null` values; Float32Array silently coerces these to `0`, causing nodes to snap to the origin without warning.

### Tech Debt & Redundancy
- **Massive Dead Code:** ~145 `.ts` shadow files co-located in `js/modules/` are never imported and represent 15,000+ lines of dead code.
- **Util Triplication:** `seededUnit` has 5 different implementations across the project, including a variadic version with a different signature in `focus-pocket-geometry.js`.
- **Barrel Bloat:** `src/lib/stores/index.ts` re-exports 160+ symbols, but components only consume 3 of them.

---

## Synthesis & Next Steps
1. **Infrastructure:** Delete all `.ts` shadow files in `js/modules/` immediately to clean the workspace.
2. **Resilience:** Wrap `animate()` and `render()` in `try/catch` with a circuit breaker.
3. **Core Sync:** Implement `AbortController` and paginated keys in the search cache.
4. **Architecture:** Begin converting `writable()` stores to `.svelte.ts` rune-based stores to eliminate the sync-serialization overhead.
5. **Deduplication:** Consolidate the 5 versions of `seededUnit` into a single canonical module.