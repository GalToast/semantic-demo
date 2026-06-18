# Wave 10 Legacy Retirement Record — Ticket W3

**Date:** 2026-06-13
**Status:** PARTIALLY CLOSED — BOTH-pattern shadows retired; engine kernel remains active
**Companion docs:**
- `docs/wave-10-legacy-audit-2026-06-13.md` — the W1 audit that found 50 vestigial BOTH-pattern shadows
- `legacy-reference/js-both-shadows-2026-06-13/README.md` — the archive record
- `docs/legacy-runtime-retirement.md` — the Wave 9 retirement record (BOTH alias retirement)

---

## 1. Summary

Wave 10 was originally framed as "the legacy runtime retirement" — the final close-out of the `js/` directory after the Svelte UI migration (S6) and the BOTH alias retirement (9D-Option-B). The W1 audit revealed that the framing was wrong: `js/` is the **active Three.js engine kernel**, not legacy runtime.

The actual Wave 10 work was narrower: retire the **BOTH-pattern `.js` shadows** that were vestigial within the engine kernel. The `.ts` files in `js/modules/*` are the canonical implementations; the `.js` siblings were thin re-exports kept around for old bundler resolution. Wave 10 retired those 50 shadows via archive.

---

## 2. What Wave 10 Retired

**50 BOTH-pattern `.js` shadow files**, moved to `legacy-reference/js-both-shadows-2026-06-13/` (via `git mv` for history preservation):

| Subdirectory | Count | Example files |
|---|---|---|
| `modules/` (top-level) | 46 | audio-scape, camera-controls, cluster-labels, event-bus, filter-state, focus-pocket, journey.*, lifecycle, loading-ui, map-state, mycelium-engine, scene-reveal, tooltip, ui-feedback, view-controller |
| `modules/utils/` | 1 | geo-data |
| `modules/bindings/` | 1 | panel-bindings |
| `state/selectors/` | 1 | index |
| (top-level) | 1 | state.js |
| (README + arch) | 1 | README.md (new) |
| **Total** | **51** | |

Each `.js` was a thin re-export like `export * from './X.ts'`. The `.ts` sibling is the canonical implementation.

---

## 3. What Wave 10 Did NOT Retire

The `js/` directory is NOT empty after Wave 10. It still contains:

### The engine kernel (active, not legacy)

- `js/modules/*.ts` — **125+ Three.js engine files** (the kernel)
  - Scene, camera, shaders, instanced meshes
  - Thread geometry, mycelium layout
  - Focus pocket layout + personality
  - Journey system (walk, focus, neighborhood)
  - Search system (tokenizer, scoring, results)
  - Weather widget integration
  - Micro-demo choreography
- `js/state.ts` + `js/state/` — **the state kernel** (parallel to the Svelte stores; the bridge reads from both)
- `js/workers/` — **the worker kernel** (e.g., `data-worker.js` for the search service worker)
- 11 remaining `.js` files in `js/` — **real `.js` implementations without `.ts` siblings** (e.g., `js/state/selectors/animation.js`, `js/workers/data-worker.js`). These are not BOTH shadows.

### The bridge (active, can be thinned)

- `src/lib/engine/bridge.ts` + 13 supporting files — the imperative bridge that wraps the kernel for the Svelte UI

### What the bridge looks like today

| Pattern | Files |
|---|---|
| **NATIVE Svelte** (no js/ imports) | 12 of 14 in `src/lib/engine/*.ts` |
| **Bridge with 1-3 js/ imports** | `node-manager.ts`, `thread-manager.ts`, `three-postprocessing.ts` |
| **Bridge with 4-19 js/ imports** | `three-engine.ts` (19), `demo-choreography.ts` (10), `adapters/lifecycle-bridge.ts` (6), `map-state.ts` (4), `scene-reveal.ts` (3), `camera-controls.ts` (3), `camera-choreography/{cursor,focus,routes}.ts` (5,5,4) |

The bridge is the **imperative seam** between the Svelte UI layer (reactive) and the engine kernel (imperative + WebGL-bound). It's intentional architecture, not stale coupling.

---

## 4. Why This Reframing Matters

The original "Wave 10: legacy runtime retirement" framing was wrong. Calling the engine kernel "legacy" implied it should be replaced. The W1 audit proved otherwise: the engine is the working system that the Svelte UI calls into. **Replacing it is a rewrite, not a retirement.**

The reframed Wave 10 is much smaller:
- The BOTH-pattern shadows were the only vestigial part
- Retiring them didn't change the architecture
- The engine kernel remains the active runtime
- The Svelte UI continues to wrap it via the bridge

Future "engine port" work (if desired) is a **separate multi-week arc** that ports the `.ts` files from `js/modules/*` into `src/lib/engine/*` and thins the bridge. That's not Wave 10's scope.

---

## 5. Verification

| Gate | Result | Notes |
|---|---|---|
| `npm run test:unit` | 18/18 files, 130/130 tests | 0 regressions |
| `svelte-check` | 0 errors, 0 warnings | clean |
| `npm run check` | clean | |
| `rg "\\.js'\" src/lib/ tests/"` | 0 matches for archived files | All explicit `.js` imports updated to extensionless |
| `find js -name "*.js"` | 11 (real impls, not BOTH shadows) | Down from 61 (50 archived + 11 retained) |

---

## 6. The 5 Invariant Tests (still in place)

| Test | Status | What it guards |
|---|---|---|
| `with-state-mutation-invariant.test.ts` | 0 violations | All mutations to CRITICAL/TRACKED keys wrapped in `withStateMutation` |
| `css-important-invariant.test.ts` | baseline 7 | No new `!important` uses beyond approved baseline |
| `commit-purity-invariant.test.ts` | 4/4 | Commit title prefix matches file class |
| `todo-without-ticket-invariant.test.ts` | 0 baseline | No TODO without ticket ref |
| `both-bridge-shape-invariant.test.ts` | 0 matches | No `@legacy` / `@legacy-js` in live code |

---

## 7. Tickets Closed in Wave 10

| Ticket | Status | Commit |
|---|---|---|
| W1 — Legacy runtime audit | DONE | `3df8336` |
| W2 — Retire BOTH-pattern `.js` shadows | DONE | `7fc7b9d` |
| W3 — Wave 10 retirement record (this doc) | DONE | (this commit) |
| W4 — Thin the bridge (rewrite `node-manager.ts`, `thread-manager.ts`, `three-postprocessing.ts` as pure Svelte) | DEFERRED | (future arc — multi-week engine port, not Wave 10 scope) |
| W5 — Update AGENTS.md to document engine-as-kernel architecture | NEXT | |
| W6 — Final close-out commit + active-context refresh | NEXT | |

---

## 8. What Comes After Wave 10

The natural next arc is **product features** (the migration infrastructure is done). Specific candidates:
- New visual diagnostic features (visual QA tooling)
- Main chunk split (performance)
- relationship-roles finalization (now unblocked by S6)
- CORS production proxy for rerank (production-readiness)

The engine port (W4 deferred) is a separate, longer arc that could happen in parallel with product work.

---

**Wave 10 closes the BOTH-pattern retirement. The migration infrastructure is complete. The engine kernel is the active runtime. The Svelte UI wraps it. Future work is product features on a stable foundation.**
