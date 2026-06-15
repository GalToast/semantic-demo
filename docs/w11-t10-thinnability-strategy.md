# W11-T10 Thinnability Strategy — Three.js Render Loop

> **Generated:** 2026-06-15
> **Author:** Main lane strategic planning
> **Status:** Draft, awaiting alignment with T10 prep tactical detail
> **Purpose:** Architectural strategy for the W11-T10 thinning arc. Pairs with `tmp/w11-t10-prep/` tactical deliverables.

## The strategic shift

**The W11-T8 work + W11-T9 journey subsystem port arc have already pre-empted most of the T10 "thinning" candidates.** When the W11 plan was written, T10 was estimated as a major port of the render loop and ~20 callees. The reality:

- **The render loop itself** (`js/modules/three-engine.ts:animate()`) — stays imperative, ZERO changes
- **The per-frame callees** — MOST have already been ported to `src/lib/engine/*.ts` and `src/lib/journey/*.ts` over the W11 arc (W11-T5, T7, T8, T9)
- **The thinnable surface inside `animate()`** — state reads (`state.X`) + state writes (`withStateMutation(() => { state.X = Y })`)

So T10 is actually a **state-touch footprint reduction** inside `animate()`, not a porting arc. The 2-3 waves will be small (~30-60 LOC of mechanical changes each) but cumulatively meaningful: ~100-200 LOC of legacy state access removed from the hottest function in the codebase.

## Render loop anatomy (`js/modules/three-engine.ts:animate()`)

The render loop is 784 LOC total, but `animate()` itself is ~120 LOC. The rest is setup/init code (`initThreeJS`, `onWindowResize`, `deinit`, etc.) that runs once.

The `animate()` function structure:
```
1. Circuit-breaker check (return early if tripped)
2. WebGL context-lost check (return early)
3. Renderer/scene/camera null check (return early)
4. View-not-galaxy check (return early)
5. Schedule next requestAnimationFrame
6. Frame timing: get frameStart, compute sceneFrameMs, update lastFrameAt
7. Auto-rotate soft resume + camera assist check
8. THREE.js controls.update()
9. Reveal progress computation
10. Node lerp loop (matrix math) — update state.nodePositions
11. Per-frame callees (semantic overlay, route trace, corridor glow, etc.) — ~25 functions
12. THREE.js renderer.render()
13. Post-processing
14. Diagnostic sampling
```

## Thinnability classification

### IMPERATIVE (stays untouched)

| Item | Why imperative |
|---|---|
| `requestAnimationFrame(animate)` | Browser API, no Svelte equivalent |
| `webglContext.renderer/scene/camera` | THREE.js object references, must be live |
| `webglContext.controls.update()` | THREE.js OrbitControls, imperative |
| The node lerp loop | Matrix math at 60fps, can't add reactivity overhead |
| THREE.js renderer.render() | GPU call, imperative |
| Post-processing | WebGL render targets, imperative |
| WebGL buffer management | GPU state, imperative |
| `circuitBreakerTripped`, `webglContextLost` flags | Error state, imperative |

### THINNABLE — state reads (Wave 10a)

Inside `animate()`, replace direct `state.X` reads with `appState.X` reads. The `appState` is the Svelte 5 state class at `src/lib/state/app.svelte.ts` which has proper TypeScript types and reactivity.

**Specific state reads in `animate()` to thin:**
- `state.currentView` (view gate check)
- `state.forceAnimate` (force gate check)
- `state.scenePerformanceDiagnostics.lastFrameAt` (frame timing)
- `state.nodePositions` (lerp loop)
- `state.targetPositions` (lerp loop)
- `state.nodesAreSettling` (lerp factor selection)

**Estimated LOC reduction:** ~15-20 LOC of `state.X` → `appState.X` swaps.

### THINNABLE — state writes (Wave 10b)

Inside `animate()`, replace `withStateMutation(() => { state.X = Y })` blocks with direct `appState.X = Y` assignments. The `withStateMutation` is a legacy singleton helper; `appState` is a Svelte 5 class with native reactivity.

**Specific state writes in `animate()` to thin:**
- `withStateMutation(() => { state.scenePerformanceDiagnostics.lastFrameAt = frameNow })`
- `withStateMutation(() => { state.X = ... })` blocks (if any others)

**Estimated LOC reduction:** ~5-10 LOC of `withStateMutation(...)` → `appState.X = Y` swaps.

### THINNABLE — per-frame callee state I/O (Wave 10c, optional)

The ~25 per-frame callees (e.g., `updateMyceliumThreads`, `applyFocusPocketBreathing`, `setNodeSporeInstanceMatrix`) all read/write legacy state. Their thinnability depends on:

1. **Do they need to be thinned at all?** Many are already in Svelte 5 ports at `src/lib/engine/*.ts`. The thinnability is about HOW they read state (legacy `(state as any).X` vs modern `appState.X`), not WHETHER they're ported.
2. **Can we change the contract?** Some callees are called per-frame and pass `frameNow` explicitly. Others read state internally. For each, decide: keep the function signature, but change the internal state-touch to use `appState`.

**Estimated LOC reduction:** ~30-50 LOC of `(state as any).X` → `appState.X` swaps across the ~25 callees.

**Risk:** some callees have complex state-write patterns (e.g., batched updates, debounced writes) that may not directly translate. Need per-callee audit.

## Wave sequence

### Wave 10a: state reads in `animate()` (small, safe)
- 15-20 LOC mechanical changes
- One-file change: `js/modules/three-engine.ts` only
- Expected verification: svelte-check + vitest + render-loop contract tests
- Expected duration: 20-30 min
- Expected risk: LOW (read-only changes, no state mutation order changes)

### Wave 10b: state writes in `animate()` (small, careful)
- 5-10 LOC mechanical changes
- One-file change: `js/modules/three-engine.ts` only
- Expected verification: svelte-check + vitest + render-loop contract tests + manual smoke
- Expected duration: 20-30 min
- Expected risk: MEDIUM (state mutation order matters; if the appState assignment triggers reactivity, the render loop may re-run)

### Wave 10c (optional): per-frame callee state I/O (medium, careful)
- 30-50 LOC changes across ~25 callees
- Multi-file change: `src/lib/engine/*.ts` (where the per-frame callees live)
- Expected verification: svelte-check + vitest + render-loop contract tests + render-loop latency profile (before/after)
- Expected duration: 60-90 min
- Expected risk: HIGH (many files, performance-critical, may need per-callee audit)

### Decision point between 10b and 10c

After Wave 10b commits, profile the render loop to confirm:
1. No latency regression (target: 0% increase, ideally 1-5% reduction from the state-mutation overhead elimination)
2. No WebGL resource leaks (the `withStateMutation` blocks may have been doing something that the direct `appState.X` assignment doesn't, e.g., debouncing or queuing)
3. No functional changes (the visual output should be identical)

If any of these fail, hold Wave 10c and investigate. If all pass, proceed to Wave 10c.

## Verification gates (per wave + cumulative)

Per wave:
- `npm run check` (svelte-check 0/0)
- `npm run test:unit` (vitest >= 642/642, no regression)
- `npm run build` (vite build clean)
- `npm run test:contract` (DOM/layout contract tests)
- `npm run qa:contract:all` (full contract suite, includes render-loop contract tests)
- `npm run qa:surface:mobile-idle` (or similar visual snapshot) — optional but recommended for T10

Cumulative (after all waves):
- `npm run qa:surface:all` (full visual surface suite)
- `npm run test` (shell + cache + CSS ownership checks)
- Manual browser smoke (dev server, visit /semantic-demo/, check for visual regressions)

## Render loop latency measurement (T10-specific concern)

The render loop runs at 60fps. Any thinned callee must not add latency. The measurement strategy:

1. **Before any changes:** profile the render loop with `performance.now()` markers at the start and end of each per-frame callee
2. **After Wave 10a:** re-profile, compare
3. **After Wave 10b:** re-profile, compare
4. **After Wave 10c:** re-profile, compare

The W11-T10 worker should set up the profiling infrastructure (the `frameStart` and `updateStart` markers in `animate()` are already there) and capture the baseline metrics in the Wave 10a prep.

## Risk register (top 5)

1. **Render loop latency regression** (CRITICAL) — any thinned callee must not slow the render. Mitigation: profile before/after, set a hard 0% latency budget.
2. **State mutation race conditions** (HIGH) — if multiple callees write to the same state key, the order matters. Mitigation: keep `withStateMutation` for batched writes, only use `appState.X = Y` for single-property writes.
3. **WebGL resource leaks** (HIGH) — if thinning changes dispose patterns, GPU resources may leak. Mitigation: run a long-running test (60s+ of render loop) and check GPU memory.
4. **Off-seam drift to the render loop itself** (HIGH) — workers must NOT touch the imperative parts of `animate()`. Mitigation: hard scope boundaries in the worker prompt.
5. **Test flakiness** (MEDIUM) — render-loop contract tests may be timing-sensitive. Mitigation: run tests multiple times, look for flake patterns.

## Coordination with T9

T9 (journey subsystem) is DONE. The Svelte 5 ports at `src/lib/journey/*.ts` and `src/lib/orchestration/*.ts` are the foundation for T10's thinnability. Specifically:
- `src/lib/state/app.svelte.ts` is the Svelte 5 state class that T10 will use
- The T9 bridges at `src/lib/engine/*-bridge.ts` are the Svelte 5 entry points for the per-frame callees

T10's wave sequence can start immediately after T9 lands (which it has, at commit `48434eb`).

## Recommended T10 dispatch sequence

1. **T10 prep** (in flight, expected 30-60 min): tactical survey + WORKER-PROMPT.md
2. **T10 Wave 10a dispatch** (after prep lands): 20-30 min worker
3. **T10 Wave 10a main-lane verify + push**: 5 min
4. **T10 Wave 10b dispatch** (after Wave 10a lands): 20-30 min worker
5. **T10 Wave 10b main-lane verify + push + profile**: 10 min (profiling adds time)
6. **T10 Wave 10c dispatch (optional, if Wave 10b profile is clean)**: 60-90 min worker
7. **T10 Wave 10c main-lane verify + push + profile**: 15 min

**Total T10 estimate:** 1-3 hours of worker time, depending on whether Wave 10c is needed.

## Off-limits for T10 (per AGENTS.md + W11 plan)

- The render loop itself: `js/modules/three-engine.ts:animate()` MUST stay imperative
- The Three.js library code
- The WebGL API calls
- Any Svelte 5 port that's already working (don't undo the W11-T5/7/8/9 work)
- The off-limits write surface: `app.ts`, `state.js`, `lifecycle.js`, `journey.js`, `ui-renderers.js`, `focus-pocket.js`, `journey-compass-state.js`, mobile CSS cascade, deploy scripts
- `src/lib/orchestration/parity-attrs.svelte.ts`, `parity-attrs.ts`, `routes.ts`

## Recommended worker prompt tone

The T10 worker prompt should be:
- **Very explicit** about the render loop being OFF-LIMITS (only state reads/writes are in scope)
- **Mechanical** — these are not "ports", they're "state-touch footprint reductions"
- **Profile-driven** — every wave must include a render-loop latency profile
- **Single-file per wave** — Wave 10a and 10b are both in `js/modules/three-engine.ts` only
- **Multi-file for Wave 10c** — be very explicit about which files

## What success looks like for T10

- `animate()` is cleaner — state reads/writes are direct `appState.X` access, not legacy singleton mutations
- `withStateMutation` is removed from `animate()` (or reduced to where it actually needs batching)
- Render loop latency is unchanged or slightly improved
- No visual regressions
- No WebGL resource leaks
- svelte-check + vitest + render-loop contract tests all green
- The render loop is now in a state where future per-frame callees can be ported without touching `js/modules/three-engine.ts`

## What success looks like for T11

- 5 concrete changes (data-worker port, app.ts retirement, build-app.mjs retirement, dist/bundle.js untrack, package.json:build:legacy removal)
- `npm run build:legacy` FAILS (the legacy build should no longer work)
- The deploy script (deploy.sh + deploy.ps1) doesn't reference `build:legacy`
- CI (if any) doesn't reference `build:legacy`
- W11 arc CLOSED

## Estimated W11 closeout

After T10 (and optionally T11):
- Total W11 LOC reduction: ~4000-5000 LOC (vs the W11 plan's -8000 to -12000 estimate — the plan was optimistic)
- Net Svelte 5 state usage: complete (all state reads/writes go through `appState`)
- Render loop: thinned, profile-clean
- Build pipeline: legacy retired
- **W11 closed.**

The W11 arc has been a masterclass in coordinated porting with live steer, off-seam drift detection, pre-emption checks, and parallel-session coordination. The end is in sight.
