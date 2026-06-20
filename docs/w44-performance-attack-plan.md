# W44 Performance Attack Plan

> **Target:** LCP <2.5s, TBT <200ms, Perf score ≥90
> **Baseline:** W43-B measured state (§1)

---

## 1. Current Measured State (W43-B Baseline)

| Metric            | Value                              | Budget  | Status        |
| ----------------- | ---------------------------------- | ------- | ------------- |
| Performance score | 33–35                              | ≥90     | 🔴            |
| LCP               | 17.0–17.3 s                        | <2.5 s  | 🔴 6.8× over  |
| TBT               | 1,470 ms (best) / 4,110 ms (worst) | <200 ms | 🔴 7–20× over |
| FCP               | 1.3–1.4 s                          | —       | 🟡 borderline |
| CLS               | 0.01                               | <0.1    | 🟢 excellent  |
| Speed Index       | 2.9–3.0 s                          | —       | 🟡 borderline |

**Bundle:** ~1,219 KB raw JS / ~338 KB gzip (within 2,500/650 KB ceilings — W41 selective imports landed).
**Main thread:** 4.9 s total; 3.6 s script evaluation dominates (72%).
**Boot-up time:** `index-DAW2pTKT.js` alone = 3,528 ms scripting (per `bootup-time` audit).
**Source:** Measured via `docs/lighthouse-approach-a.json` and `docs/lighthouse-approach-b.json` (parallel session, 2026-06-18).

### TBT Variance Mystery

TBT varies 2.8× between runs (1,470 ms vs 4,110 ms) while LCP stays stable at ~17 s. This suggests the bottleneck is **non-deterministic main-thread blocking** — likely GC pauses, conditional Three.js codepaths, or browser JIT variance — not raw parse/compile time.

---

## 2. Optimization Levers

| #   | Lever                                                           | Expected Savings (ROM)                   | Key Assumption                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Deferred Three.js init**                                      | **-1,500 to -2,500 ms TBT**, -5–10 s LCP | Scene/camera/renderer init currently blocks first paint. Deferring via `requestIdleCallback` or post-FCP hook moves ~2–3 s of GPU setup off critical path. LCP improves because the 3D canvas placeholder paints first. |
| 2   | **Source-map stripping + minification tightening**              | **-50–100 ms parse**, marginal TBT       | Verify Vite `terser` compress options are maxed; confirm zero source maps in production. The 585 KB main bundle could shrink 50–100 KB with aggressive mangling.                                                        |
| 3   | **Web-worker data offload**                                     | **-200–400 ms TBT**                      | Semantic thread parsing (8,406 nodes × relationship walks) runs on main thread during init. `data-worker.ts` already exists — wire the parsing through it to move CPU off main thread.                                  |
| 4   | **Code-split remaining islands** (focus pocket, postprocessing) | **-50–150 ms TBT**, -80 KB raw parse     | Focus-stage components and postprocessing effects (80.55 KB) load unconditionally. Splitting behind user intent removes them from initial parse.                                                                        |
| 5   | **Conditional postprocessing gate**                             | **-100–200 ms TBT**                      | Postprocessing (80.55 KB / 6.6% of bundle) activates unconditionally. Gating behind a "visual quality" toggle or desktop-only check removes init cost on mobile.                                                        |

### Cumulative Projection

All levers: **-1,850 to -3,350 ms TBT**, **-5–10 s LCP**. From best-case TBT (1,470 ms), could reach **<600 ms TBT** — still over 200 ms budget but a 3× improvement. Remaining gap likely requires architectural changes (SSR, WASM compute, or full lazy-load behind a loading screen).

---

## 3. Prioritized Execution Order

### Phase 1: Deferred Three.js Init — cheapest, highest reward

**Why first:** `bootup-time` audit shows 3,528 ms scripting in the main bundle; Three.js scene setup is the dominant cost. Deferring renderer/camera/scene init until after first paint is a config-level change (no API breaks) with the largest single-shot TBT and LCP reduction. This directly targets the 17 s LCP — the canvas doesn't need to paint the 3D scene synchronously.

**Approach:** Move `three-engine.ts` init to a `requestIdleCallback` or post-FCP hook. Show a static placeholder (CSS gradient or SVG) until the 3D scene is ready.

### Phase 2: Source-Map Stripping + Minification Tightening

**Why second:** Near-zero risk, pure build-config change. Verify `vite.config.ts` minification, confirm no source maps in production, tighten `terser` compress passes. Small but free (~50–100 ms parse savings).

### Phase 3: Web-Worker Data Offload

**Why third:** `data-worker.ts` already exists and is wired via `src/lib/workers/data-worker-url.ts`. Moving semantic thread parsing to the existing worker is a targeted refactor with clear worker boundaries. Depends on Phase 1 landing first (so the main thread is free to schedule the worker response).

### Phase 4: Code-Split Remaining Islands

**Why last:** Further lazy-loading (focus pocket, postprocessing) requires more invasive code-splitting and adds loading-state complexity. Do this only after high-leverage deferrals land, to avoid premature optimization of code that may become cheap via Phases 1–3.

---

## 4. Measurement Protocol

After each phase, re-run Lighthouse against the production preview build:

```bash
npm run build && npm run preview
npx lighthouse http://127.0.0.1:4174/ --output=json --output-path=docs/lighthouse-w44-phaseN.json
```

Track deltas:

| Metric     | Baseline       | Phase 1   | Phase 2   | Phase 3   | Phase 4   |
| ---------- | -------------- | --------- | --------- | --------- | --------- |
| TBT        | 1,470–4,110 ms | <2,000 ms | <1,900 ms | <1,500 ms | <1,300 ms |
| LCP        | 17.0–17.3 s    | <10 s     | <9.5 s    | <9 s      | <8.5 s    |
| Perf score | 33–35          | ≥45       | ≥48       | ≥55       | ≥60       |

---

## 5. Open Questions

1. **Why does TBT vary 2.8×?** Profile the 4,110 ms worst case via Chrome DevTools Performance recording — is it a specific codepath (focus-pocket init) or GC pressure?
2. **Can Three.js be fully lazy-loaded?** If the canvas is below the fold, deferring ALL Three.js code (not just init) could save the entire 561 KB parse cost. Needs UX confirmation.
3. **Mobile viability?** The mobile Lighthouse run showed LCP timeout (319 s). Deferred init may not be enough for mobile — may need a fundamentally lighter initial render.

---

_Created 2026-06-18. Worker D, Team W43-Immediate._
