# Semantic Explorer — Resilience Plan

## Generated 2026-06-23

**Goal:** Address the 5 weakest areas identified in the fragility audit before they become production incidents.

**Estimated Duration:** 6-8 work sessions  
**Risk Level:** High (3D engine) → Medium (search, weather) → Low (state, data loader)  
**Commits Expected:** 15-25

---

## Phase 1: Weather Cleanup (Low Risk, Quick Wins) ⏱ 1-2 sessions

**Goal:** Close W46-D4 technical debt. 4 TODOs remain in `src/lib/stores/weather.svelte.ts`.

### Tasks

1. **Audit all weather consumers** — Find every file that imports `weather.svelte.ts` or uses legacy `WeatherData` / `WeatherCondition` / `updateWeather()`
2. **Remove legacy adapter branch** (line 60) — Delete the `if (!client)` fallback that writes through legacy state
3. **Retire legacy weather writer** (line 104) — Remove `weatherState.write()` calls from non-weather code
4. **Delete legacy enum mapping** (line 251) — Remove `legacyConditionToCode()` once all consumers use the new `WeatherCondition` enum
5. **Remove legacy route** (line 269) — Delete the non-canonical `updateWeather()` path
6. **Write regression contract** — Ensure `weather-widget-render-contract.mjs` still passes after each deletion

### Success Criteria

- `grep -r "TODO.*W46-D4" src/` returns 0 matches
- `npm run qa:weather-widget` passes
- `npx vitest run` still passes (no broken consumers)
- Console warning on `weatherState.write()` → eliminate entirely

### Risk Mitigation

- Each deletion is a separate commit so rollback is easy
- Run the weather contract test after each commit
- Keep `weather.svelte.ts` barrel exports stable so external consumers don't break

---

## Phase 2: Search System Defensive Hardening (Medium Risk) ⏱ 2-3 sessions

**Goal:** Prevent silent failures, focus-stealing regressions, and main-thread blocking.

### Tasks

1. **Add search health telemetry** — Track API vs fallback vs zero-results rates (console in dev, beacon in prod)
2. **Extract local-index logic** — Move the 8,406-record local fallback from `search-engine.ts` into `src/lib/search/local-index.ts` with a Web Worker wrapper
3. **Add timeout guards** — API calls must timeout after 3s; local index must yield after 100ms (chunked iteration)
4. **Audit focus-stealing surfaces** — Ensure `SearchResults.svelte` never calls `.focus()` inside a reactive `$effect` or `tick()` without user intent
5. **Add "no results" UX state** — If both API and local index fail, show a clear message instead of empty list

### Success Criteria

- Search results appear in < 300ms for cached queries, < 3s for new queries
- Zero "focus stolen mid-typing" regressions in `qa:contract` tests
- No main-thread blocking > 50ms during local search
- `npm run qa:contract` passes for `search-chrome` and `search-error` surfaces

### Risk Mitigation

- Extract the local index to a new file first (commit), then add Web Worker (separate commit)
- Benchmark before/after with `console.time`
- Keep the existing API contract intact; this is internal refactoring

---

## Phase 3: 3D Engine Modularization (High Risk) ⏱ 3-4 sessions

**Goal:** Break the 1,134-line monolith into testable, platform-safe modules. This is the highest-impact and highest-risk change.

### Current Architecture Problem

- `three-engine.ts` handles: WebGL context, renderer, camera, scene, controls, animation loop, resize, postprocessing, mobile fallbacks, resource disposal
- 35 imports, 25 exports — everything depends on everything
- A crash here = blank screen = user bounce

### Target Architecture

```
src/lib/engine/
├── three-engine.ts          (<= 200 lines: bootstrap + orchestration only)
├── renderer/
│   ├── context.ts           (WebGL context + fallback detection)
│   ├── lifecycle.ts         (init/deinit/dispose)
│   ├── loop.ts              (animate/cancel + frame budget)
│   ├── resize.ts            (viewport + DPR changes)
│   └── postprocessing.ts    (already exists, but needs dynamic import wrapper)
├── camera/
│   ├── camera.ts            (PerspectiveCamera + OrbitControls)
│   └── viewport.ts          (offset + mobile DPR adjustments)
├── scene/
│   ├── scene.ts             (Scene + Fog + background)
│   └── atmosphere.ts        (FogExp2 + lighting)
└── diagnostics/
    ├── telemetry.ts         (GPU info, frame time, memory estimate)
    └── health-check.ts      (isWebGLAvailable, isPerformanceOK)
```

### Tasks

1. **Add engine telemetry** (no refactor) — Log `renderer.info`, GPU memory estimate, frame time to console in dev mode. Commit.
2. **Extract `renderer/lifecycle.ts`** — Move `initThreeJS`, `deinit`, `disposeObject3D` calls. Commit.
3. **Extract `renderer/loop.ts`** — Move `animate`, `cancelAnimate`, frame timing. Commit.
4. **Extract `camera/camera.ts`** — Move `PerspectiveCamera`, `OrbitControls`, `updateCameraViewportOffset`. Commit.
5. **Extract `renderer/resize.ts`** — Move `onWindowResize`, DPR logic. Commit.
6. **Extract `scene/scene.ts`** — Move `Scene`, `FogExp2`, `buildThreeScene`. Commit.
7. **Add runtime health checks** — Before initializing WebGL, check GPU tier. If low-tier + mobile, skip postprocessing entirely and reduce point count. Commit.
8. **Add mobile resource budget** — Cap point count at 4,000 on low-end devices (vs 8,406). Commit.
9. **Add graceful degradation tests** — Ensure `placeholder2d` still renders when WebGL fails. Commit.

### Success Criteria

- `three-engine.ts` < 250 lines (from 1,134)
- All existing exports remain available (backward compat)
- `npm run build` passes
- `npm run qa:scene-health` passes
- `npm run qa:contract` passes for all surfaces
- Mobile 3D scene loads without crash on simulated low-end device
- No console errors in any browser

### Risk Mitigation

- **Never delete the old file first.** Create new modules, update imports, then delete old code.
- Each extraction is its own commit with a clear rollback path.
- Run `qa:scene-health` and `qa:contract` after every extraction.
- Test on actual mobile device (or Playwright mobile emulation) before merging.
- Keep the `buildThreeScene` import stable — it is used by the scene module.

---

## Phase 4: Global State Safeguards (Low-Medium Risk) ⏱ 1 session

**Goal:** Reduce blast radius of `app.svelte.ts` bugs.

### Tasks

1. **Add state mutation guards** — Wrap critical `$state` properties with validation functions that throw in dev mode on invalid values (e.g., `currentView` must be in the allowed set)
2. **Add state change logging** — In dev mode, log every state transition with before/after values (useful for debugging focus-stealing, race conditions)
3. **Document the state contract** — Add a comment block at the top of `app.svelte.ts` listing every property, its type, valid values, and which surfaces depend on it

### Success Criteria

- Invalid state assignments throw in dev mode with a clear error
- State transitions are traceable in dev console
- `npx vitest run` still passes
- No performance regression (guard checks must be cheap)

---

## Phase 5: Data Loader Resilience (Low-Medium Risk) ⏱ 1 session

**Goal:** Prevent app startup failure if data is unavailable.

### Tasks

1. **Add retry logic** — If `data.dat.gz` fails to load, retry 2x with exponential backoff before showing error
2. **Add offline detection** — If navigator.onLine is false, show a cached-data indicator or offline warning
3. **Add loading progress** — For slow connections, show a progress bar (currently the app just hangs if data is large)
4. **Add data validation** — After loading, verify the data structure is valid (expected keys, array lengths) before passing to consumers

### Success Criteria

- App loads successfully even if first data fetch fails (retries within 5s)
- Offline mode shows a clear UX state
- `data.dat.gz` corruption is detected and reported, not silently propagated
- `npm run qa:contract` passes for `loading-overlay` surface

---

## Phase 6: Integration & Regression (Ongoing) ⏱ 1 session

### Tasks

1. Run full test suite: `npm run check:ownership && npm run qa:contract && npm run qa:scene-health && npm run qa:weather-widget && npm run qa:product-playthrough`
2. Run a11y audit: `npm run audit:a11y`
3. Run build: `npm run build` and verify dist output is clean
4. Run visual QA: `npm run qa:visual` (capture screenshots)
5. Test on mobile emulation: `npm run qa:contract:mobile-critical`
6. Check for new TODOs: `grep -r "TODO\|FIXME\|HACK" src/`
7. Update `AGENTS.md` if any invariants changed

---

## Execution Order

| Phase                    | Duration     | Risk    | Dependencies               |
| ------------------------ | ------------ | ------- | -------------------------- |
| 1: Weather cleanup       | 1-2 sessions | Low     | None                       |
| 4: State safeguards      | 1 session    | Low     | None                       |
| 5: Data loader           | 1 session    | Low-Med | None                       |
| 2: Search hardening      | 2-3 sessions | Medium  | Phase 1 (for dev velocity) |
| 3: Engine modularization | 3-4 sessions | High    | All prior phases           |
| 6: Integration           | 1 session    | Low     | All prior phases           |

**Recommended order:** 1 → 4 → 5 → 2 → 3 → 6

Why: Close quick wins first (weather, state, data loader) to build confidence and clean the codebase. Tackle the big refactor (engine) only when the foundation is solid and tests are green.

---

## Key Invariants to Preserve

- `state.rawPositionsBuffer` must remain `[0,1]^3` unit cube
- `getPointBoundsCenter(points, positionBuffer)` must receive raw position buffer
- `src/lib/state/app.svelte.ts` is the Svelte 5 global state source of truth
- `js/workers/data-worker.ts` is active runtime
- `body.dataset.renderKind` is set once at init and updated by `engineReady.signalReady()`
- All CSS ownership contracts (`check:ownership`) must pass
- No new z-index values without updating `src/lib/z-index.ts`

---

## Rollback Strategy

If any phase introduces a regression:

1. `git revert <commit-hash>` for the offending commit
2. Run `npm run qa:contract` to verify revert fixed the issue
3. Re-approach the task with a smaller scope

---

## Verification Commands

```bash
# After every commit:
npm run lint
npm run build
npx vitest run
npm run qa:weather-widget
npm run qa:contract -- --surfaces=desktop-idle,search-chrome,info-panel-populated
npm run qa:scene-health
npm run audit:a11y
```
