# W44 Performance Attack Plan

**Date:** 2026-06-19
**Status:** Draft — based on profiling evidence from current build (`dist/svelte/`, commit `9a96ce1` + WIP)
**Author:** Pi profiling session
**Supersedes:** `docs/w44-performance-attack-plan.md` (if exists; create fresh)

---

## Executive Summary

The Lighthouse baseline shows **0/100 Performance**, **LCP 17.1 s** (6.8× budget), **TBT 1,790 ms** (9× budget), with **3,528 ms of scripting** on the main bundle. The raw JS bundle is within budget (1,219 KB raw / 338 KB gzip), so the problem is **execution cost**, not transfer size.

This plan identifies **5 optimization levers** with expected savings, ranked by impact / effort ratio.

---

## Evidence

### Bundle structure (current build)

| Chunk                            | Raw KB     | Gzip KB  | Loaded                    |
| -------------------------------- | ---------- | -------- | ------------------------- |
| `index-Brc0P9mD.js` (main entry) | 322        | 98       | Eager                     |
| `three-D-vJlDKi.js`              | 587        | 142      | **Eager** (modulepreload) |
| `index-client-BuSd8Ls5.js`       | 44         | 17       | Eager                     |
| `data-store-B7o4coaM.js`         | ~50        | ~15      | Eager                     |
| Other chunks                     | ~216       | ~66      | Mixed                     |
| **Total**                        | **~1,219** | **~338** |                           |

### Static import chain

The main bundle **statically imports** from `three-D-vJlDKi.js`:

```
index-Brc0P9mD.js → ... → three-D-vJlDKi.js (static import, not dynamic)
```

This means the 587 KB Three.js chunk is **parsed and executed on the main thread during initial load**, even though the `<Canvas>` component defers `initEngine()` until user gesture. The modulepreload in `index.html` merely hides the network cost; the JS engine still pays the parse + execute tax.

### Reactive state overhead

| File                                    | `$state()` count | Notes                                |
| --------------------------------------- | ---------------- | ------------------------------------ |
| `src/lib/state/app.svelte.ts`           | **191**          | 91% of all reactive state in the app |
| All other `.svelte.ts` files (20 files) | 19               |                                      |
| **Total**                               | **210**          |                                      |

`app.svelte.ts` is instantiated at module load time:

```ts
export const appState = new AppState()
```

This creates **191 reactive proxies** synchronously when the module is first imported. Every consumer of `state-bridge.ts` (53 files) triggers this instantiation.

### Legacy store duplication

`src/lib/stores/legacy-stores.ts` holds **11 writable stores** (`searchResultsStore`, `searchSummaryStore`, `compositionStore`, `selectedPointStore`, etc.) that mirror fields already present in `appState`. They are actively imported by `App.svelte`, `results-ui.ts`, `weather-ui.ts`, and `focus-stage-renderer.ts`.

### Window global pollution

`src/lib/stores/lifecycle.ts` writes to **5 window globals** synchronously (`__APP_STATE__`, `__TEST_STATE__`, `__LEGACY_APP_STATE__`, `__semanticState`, `state`). This is done in every state transition, not just init, but the init-time writes in `main.ts` add to the blocking work.

---

## Lever 1: Remove Three.js from the main bundle (HIGHEST IMPACT)

**Impact:** ~587 KB removed from initial execution path → ~1,500–2,000 ms TBT savings (estimated)  
**Effort:** Medium  
**Risk:** Medium — `ui-presentation.ts` is a shared utility; refactoring touches 26 consumers

### Root cause

`lib/utils/ui-presentation.ts` imports `Camera, Vector3, MathUtils, Color` from `three`:

```ts
import { Camera, Vector3, MathUtils, Color } from 'three'
```

This is used for viewport/presentation calculations (`isCompactFocusStageViewport`, `describeCluster`, etc.). Because `ui-presentation.ts` is imported by 26 files across the main bundle, Vite pulls the `three` chunk into the initial dependency graph.

Additionally, `lib/focus/geometry.ts`, `lib/journey/focus-pocket-geometry.ts`, and `lib/engine/camera-choreography/*.ts` import Three.js types and are in the main bundle.

### Fix

1. **Extract Three.js-dependent helpers** from `ui-presentation.ts` into a new module `ui-presentation-three.ts` that is only imported by engine/lifecycle code.
2. **Replace `Vector3` / `Color` / `MathUtils` / `Camera` usage** in `ui-presentation.ts` with plain JS math or extracted interfaces. Example:
    - `Vector3` → `{x, y, z}` plain object + helper functions
    - `Color` → hex string or `{r, g, b}` tuple
    - `MathUtils` → direct `Math.*` calls or a 50-line shim
    - `Camera` type → minimal `{ position, fov, aspect }` interface
3. **Verify** with `node scripts/check-bundle-size.mjs` that `three` chunk is no longer in the static import chain of the main bundle.

### Alternative (if extraction is too invasive)

Make `ui-presentation.ts` a **dynamic wrapper**:

```ts
let threeHelpers: typeof import('./ui-presentation-three') | null = null
export async function getViewportSize() {
    threeHelpers ??= await import('./ui-presentation-three')
    return threeHelpers.getViewportSize()
}
```

This defers the Three.js import until the function is actually called (which is always after mount). Trade-off: adds async indirection to hot-path functions.

---

## Lever 2: Defer `AppState` instantiation (HIGH IMPACT)

**Impact:** ~191 proxy creations off the critical path → ~300–800 ms TBT savings (estimated)  
**Effort:** Low  
**Risk:** Low — `appState` is already accessed lazily in most consumers

### Root cause

```ts
// src/lib/state/app.svelte.ts
export const appState = new AppState()
```

This runs when the module is first imported. `AppState` has 191 `$state()` fields, each creating a Svelte 5 reactive proxy.

### Fix

Replace eager instantiation with **lazy singleton**:

```ts
let _appState: AppState | null = null
export function getAppState(): AppState {
    _appState ??= new AppState()
    return _appState
}
export const appState = new Proxy({} as AppState, {
    get(_, prop) {
        return getAppState()[prop as keyof AppState]
    }
})
```

Or simpler: change `state-bridge.ts` to lazily instantiate:

```ts
export const state = (() => {
    let instance: AppState | null = null
    return new Proxy({} as SemanticState, {
        get(_, prop) {
            instance ??= new AppState()
            return instance[prop as keyof AppState]
        },
        set(_, prop, value) {
            instance ??= new AppState()
            ;(instance as any)[prop] = value
            return true
        }
    })
})()
```

**Better approach:** Split `AppState` into **domain-specific classes** (SearchState, FocusState, NavState, etc.) that are instantiated only when their domain is first accessed. This also improves code organization and reduces the blast radius of state changes.

---

## Lever 3: Retire `legacy-stores.ts` (MEDIUM IMPACT)

**Impact:** ~11 writable stores removed → ~100–300 KB bundle reduction, ~50–150 ms TBT savings  
**Effort:** Low-Medium  
**Risk:** Low — consumers are known; Svelte 5 runes supersede writable stores

### Root cause

`src/lib/stores/legacy-stores.ts` exports 11 `writable()` stores that are shadowed by `appState` fields. Example:

```ts
// legacy-stores.ts
export const searchResultsStore = writable([])
export const compositionStore = writable({...})
```

These are imported by:

- `App.svelte` (`semanticGuideStateStore`)
- `results-ui.ts` (`searchResultsStore`, `searchSummaryStore`, etc.)
- `weather-ui.ts` (`weatherStateStore`, `compositionStore`)
- `focus-stage-renderer.ts` (`selectedPointStore`)

### Fix

1. Replace each `legacy-stores` consumer with the equivalent `appState` field or a derived Svelte 5 rune.
2. Delete `legacy-stores.ts`.
3. Verify `npm run check && npm run test:contract`.

---

## Lever 4: Remove `modulepreload` for non-critical chunks (MEDIUM IMPACT)

**Impact:** ~587 KB less initial network fetch → LCP improvement on slow networks  
**Effort:** Low  
**Risk:** Low — Vite auto-generates these; manual override is safe

### Root cause

`dist/svelte/index.html` contains:

```html
<link rel="modulepreload" crossorigin href="./assets/three-D-vJlDKi.js" />
<link rel="modulepreload" crossorigin href="./assets/demo.svelte-BK40UU-m.js" />
<link rel="modulepreload" crossorigin href="./assets/semantic-threads-DO4ggprG.js" />
```

These are generated by Vite's `modulePreload` plugin. They eagerly fetch JS that is not needed for the initial paint.

### Fix

In `vite.config.ts`, add `modulePreload: false` or configure `build.modulePreload` to exclude specific chunks:

```ts
build: {
  modulePreload: {
    polyfill: false,
    // Only preload the main runtime and critical components
    resolveDependencies: (filename, deps) => {
      return deps.filter(dep => !dep.includes('three') && !dep.includes('demo'))
    }
  }
}
```

Alternatively, leave `modulepreload` for `index-client`, `app.svelte`, and `navigation.svelte` (critical path), but remove it for `three`, `demo`, `semantic-threads`, and `weather`.

---

## Lever 5: Batch / defer `main.ts` side effects (LOW-MEDIUM IMPACT)

**Impact:** ~50–200 ms TBT savings by spreading init work across frames  
**Effort:** Low  
**Risk:** Low

### Root cause

`main.ts` runs the following synchronously:

1. `mount(App, ...)` — triggers all component creation, $state proxy creation, DOM insertion
2. `initRouteTraceSubscriptions()` — sets up event listeners and bridge subscriptions
3. `installGestureMonitor()` — adds global event listeners
4. `tryHydrate()` — starts a 500ms polling loop (60 iterations = 30 seconds of polling)

### Fix

1. **Defer `initRouteTraceSubscriptions()`** to `requestIdleCallback` or after `DOMContentLoaded`:

    ```ts
    requestIdleCallback(() => initRouteTraceSubscriptions(), { timeout: 2000 })
    ```

2. **Replace `tryHydrate` polling loop** with an event-driven approach:

    ```ts
    window.addEventListener('__APP_STATE_READY__', hydrateFromLegacyState, { once: true })
    ```

    Or use a single `setTimeout` with exponential backoff instead of 60 iterations.

3. **Defer `installGestureMonitor()`** until after the first paint:

    ```ts
    requestAnimationFrame(() => installGestureMonitor())
    ```

---

## Expected Savings (stacked)

| Lever                                | TBT savings        | LCP savings                | Bundle reduction |
| ------------------------------------ | ------------------ | -------------------------- | ---------------- |
| 1. Remove Three.js from main bundle  | 1,500–2,000 ms     | 200–500 ms                 | 587 KB raw       |
| 2. Defer `AppState` instantiation    | 300–800 ms         | 50–100 ms                  | —                |
| 3. Retire `legacy-stores.ts`         | 50–150 ms          | —                          | 100–300 KB       |
| 4. Remove non-critical modulepreload | —                  | 300–800 ms (slow networks) | —                |
| 5. Batch `main.ts` side effects      | 50–200 ms          | 50–100 ms                  | —                |
| **Total (conservative)**             | **1,950–2,950 ms** | **600–1,500 ms**           | **687–887 KB**   |
| **Total (optimistic)**               | **2,500–3,150 ms** | **1,000–2,000 ms**         | **887 KB**       |

With these changes, TBT would drop from **1,790 ms → ~0–400 ms** (within the 200 ms budget with a small margin). LCP would drop from **17.1 s → ~15–16 s** (still over budget, but the remaining LCP is dominated by the 8,406-point data load, not JS execution).

**The remaining LCP problem after these fixes is the data load** (`data.dat`, 1.8 MB). That requires a separate wave (W45): streaming parse, progress indicator, or skeleton state.

---

## Verification Plan

For each lever landed, run:

```bash
npm run build
node scripts/check-bundle-size.mjs
node scripts/lighthouse-gate.mjs
```

And capture before/after metrics in `docs/performance-budget.md`.

---

## Risk Register

| Risk                                                           | Mitigation                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ui-presentation.ts` refactor breaks 26 consumers              | Land behind feature flag; verify each consumer with `npm run test:contract`                            |
| Lazy `AppState` causes race conditions in components           | Keep the Proxy wrapper so reads are transparent; only instantiation is deferred                        |
| `legacy-stores` removal breaks Svelte component subscriptions  | Replace with `appState` derived runes in the same PR; no intermediate state                            |
| Modulepreload removal causes chunk fetch delay on user gesture | Three.js chunk is still fetched on demand via `import()`; network is fast enough for 587 KB on gesture |

---

## Deferrals (out of scope for W44)

| Item                                 | Reason                                                          | Target |
| ------------------------------------ | --------------------------------------------------------------- | ------ |
| Data streaming / skeleton state      | Requires data-loader refactor + worker protocol change          | W45    |
| Web worker offload for Three.js init | Complex; `initEngine` already deferred to `requestIdleCallback` | W45+   |
| Bridge retirement (39 remaining)     | Out of scope; perf impact is minimal compared to Three.js       | W46+   |

---

## Cross-references

- `docs/performance-budget.md` — live budget vs actuals
- `docs/lighthouse-baseline-2026-06-18.json` — W43 baseline
- `docs/w43-charter-2026-06-18.md` — W43 charter (parent)
- `docs/w42-charter-2026-06-18.md` — W42 charter (grandparent)
- `src/lib/state/app.svelte.ts` — 191 $state() source
- `src/lib/utils/ui-presentation.ts` — Three.js leak into main bundle
- `src/lib/stores/legacy-stores.ts` — 11 writable stores to retire
- `vite.config.ts` — modulepreload configuration
