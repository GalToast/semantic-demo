# W49-D Performance Audit

Date: 2026-07-03
Scope: 3D engine idle skipping, render loop coalescing, listener cleanup, memory bookkeeping.
Method: Source review (`src/lib/engine/`, `src/lib/camera-choreography/`) only. No live-frame profiling data this round (no perf tooling in repo).

## TL;DR

The render loop is **already sophisticated** — `scheduleNextAnimationFrame(continuous)` uses RAF (60fps) when the scene is changing and `setTimeout(125ms)` (8fps) when static. RAF is paused on `document.hidden`, `webglContextLost`, and `circuitBreakerTripped`. The remaining wins are smaller and depend on per-viewport perf data we don't have here.

## What's Already Optimized (Verified in Source)

| Mechanism                                  | Location                                   | Effect                                            |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------------- |
| RAF → setTimeout(125ms) at 8fps idle       | `src/lib/engine/three-engine-timers.ts:41` | Static-state idle cost drops ~7×                  |
| Pause on `document.hidden`                 | `src/lib/engine/three-engine-core.ts:369`  | Tab not visible → no frames                       |
| Pause on `webglContextLost`                | `src/lib/engine/three-engine-core.ts:365`  | GPU context loss → no frames                      |
| Pause on `circuitBreakerTripped`           | `src/lib/engine/three-engine-core.ts:362`  | Tripped fault → no frames                         |
| Pause when not `galaxy` view               | `src/lib/engine/three-engine-core.ts:375`  | Map / semantic-dive views skip the 3D render path |
| Skip if renderer/scene/camera missing      | `src/lib/engine/three-engine-core.ts:372`  | Init-time guard                                   |
| Cluster-label updates gated                | `src/lib/engine/three-engine-core.ts:567`  | Only update labels when sceneNeedsContinuous      |
| UpdateInteractionVisuals gated             | `src/lib/engine/three-engine-core.ts:539`  | Only run when continuous frame needed             |
| Mycelium thread update gated               | `src/lib/engine/three-engine-core.ts:552`  | Only run when continuous frame needed             |
| Auto-rotate cache invalidation skipped     | `src/lib/engine/three-engine-core.ts:540`  | GPU buffers only updated on change                |
| `preserveDrawingBuffer: false`             | `src/lib/engine/renderer/scene-init.ts:75` | Avoids Chrome's 2× memory cost                    |
| EffectComposer fast-path for premium       | `src/lib/engine/three-engine-core.ts:574`  | Skips standard render when composer takes over    |
| `requestIdleCallback` fallback (when used) | `src/lib/engine/lifecycle.ts`              | Heavy work yields to browser                      |

## What Could Be Improved (Open Findings)

### 1. Multiple RAF chains driving the same frame (first tranche shipped 2026-08-06)

Historically, `requestAnimationFrame` was requested independently by:

- `src/lib/engine/three-engine-timers.ts:50,55` (main animate loop)
- `src/lib/engine/camera-choreography/focus.ts:299,304` (focus camera)
- `src/lib/engine/camera-choreography/routes.ts:167,169,219,224,302,308` (route trace animation, multiple sub-chains)
- `src/lib/engine/three-search-animations.ts:340` (hero corridor glow)

When all fired in the same frame, each callback had its own bookkeeping cost (RAF id tracking, closure allocation). They run in the SAME `requestAnimationFrame` tick so the visual effect is identical — they can share one RAF.

**Status:** the engine-owned `src/lib/engine/frame-scheduler.ts` now runs focus-camera, route-camera, and search-hero tasks in stable registration order immediately before the main engine update/render path. The existing `DisposableRegistry` cancellation boundary is preserved for route teardown, and engine cancellation clears all scheduled tasks.

Focused unit coverage in `tests/unit-active/frame-scheduler.test.ts` verifies wake-up, stable ordering, idempotent cancellation, and deferral of tasks added during a frame. Remaining `requestAnimationFrame` calls under `src/` are UI focus/resize one-shots, audio, demo choreography, and other independently owned surfaces; they were intentionally left out of this engine tranche.

### 2. Render runs at 8fps in fully-static state (low effort, ~5× idle-CPU win when truly static)

When `sceneNeedsContinuous` is false, the loop still calls `renderer.render(scene, camera)` every 125ms. But:

- No animations active
- No scene state mutations scheduled
- Camera may have settled

The render is wasted CPU because the output equals the previous frame's.

**Safe-but-conditional fix**: track the camera's matrixWorld at the end of each render. On the next animate tick, if:

- `sceneNeedsContinuous === false`
- camera matrixWorld bytewise-equals previous
- no DOM-attached interaction listeners fired in the interval

then skip the render call. Schedule the next tick as before.

**Why we did not ship this**: needs a per-frame matrix-compare path that doesn't itself eat the saved CPU. A simpler version: count consecutive "no-op" frames and stop scheduling after 3, only resuming on the next state mutation. That introduces a "wake on activity" contract that the camera-choreography code would have to respect.

### 3. Listener cleanup verification (low effort, mostly verification)

Sources of long-lived listeners:

- `src/lib/engine/three-listener-registration.ts` — visibilitychange, contextlost/restored
- `src/lib/engine/camera-choreography/*` — pointer/wheel on the canvas, registered via OrbitControls
- `src/lib/engine/three-search-animations.ts` — RAF + state subscribers

`engineState.cleanupFns` registry pattern is used in some places (`src/lib/engine/three-engine-state.ts`) but not consistently. **Recommend** an audit pass via `addEventListener` grep to confirm every `addEventListener` in `src/lib/engine/**` has a paired `removeEventListener` in the corresponding `dispose*` function.

### 4. Frame-coalescing for 60fps → 8fps transitions (low effort, ~3-5% win)

When the scene transitions from continuous (user dragging) to idle (user released), the RAF→setTimeout handoff happens per-frame. There's a brief window where consecutive 8fps ticks could coalesce. Read the handoff in `src/lib/engine/three-engine-timers.ts:42-58`.

### 5. Texture/shader precompile deduplication (already mostly done — verified)

`compilePointMaterialForReadiness()` at `src/lib/engine/node-manager.ts:251` calls `renderer.compile(scene, camera)` then a single `renderer.render` only if the shader is missing. This is called once during init via `three-engine-core.ts:186`. **Verified clean.**

### 6. Event-bus publisher hotpath allocations (low effort, ~1-2% win)

Several `publish(EVENTS.X, ...)` calls in animate-loop inner work allocate new objects each frame. Specifically:

- `src/lib/engine/three-engine-core.ts:386-389` (`scenePerformanceDiagnostics.lastFrameAt` write via `withStateMutation` — every frame)
- `src/lib/engine/three-engine-core.ts:436-441` (route trace overlay frame updates)

The `withStateMutation` wrapping is **necessary** (Svelte 5 reactivity trap), so this is not a quick win. Recommend moving these to an opt-in rate-limited path (every Nth frame) if profiling shows it as a hot spot.

## How to Validate

We don't have a Chrome DevTools perf trace harness in the repo. The next step is:

1. **Install Lighthouse CI** or set up a manual Chrome trace on the entry journey
2. Record a 10-second trace with: idle overview → search → focus → focus-out → idle overview (steady-state)
3. Compare the "idle overview" frame cost (around 80% of the trace) against the budget in `docs/performance-budget.md`
4. If idle overview exceeds the budget, ship changes 2 + 3 above

Until then, this audit doc is the working hypothesis: the engine is well-optimized, but ~10-15% wins remain on the table via frame coalescing and conditional render-skip.

## W49-H Resolution (2026-07-03)

Item 5 — Performance audit — was partially closed in commit `fee083cb` and the
conditional-render follow-up was verified on 2026-08-06:

**Done:**
- New pure helper `src/lib/engine/renderer/scene-static-tracker.ts` computes
  whether the next render can be skipped (camera pos + quat delta vs.
  prior snapshot, EPSILON=1e-5). Focused unit and source-wiring tests lock in
  every branch.
- The animate loop (in `src/lib/engine/three-engine-core.ts`) now captures
  the camera transform each tick and calls the helper. It **records** the
  verdict in `scenePerformanceDiagnostics.renderSkipOpportunities` and
  `consecutiveSkippedFrames`.
- DevGui will now show `renderSkipOpportunities` and
  `consecutiveSkippedFrames` so a future developer can see in real time
  how many frames were skippable on any given viewport.

**Conditional render-skip is now active:**
- `renderer.render(...)` and postprocessing are gated by the helper verdict.
- `sceneVisualsNeedRender()` keeps the idle 8fps tick renderable while normal
  motion advances point time, pulse phase, and thread opacity. Reduced-motion
  static scenes can still skip unchanged camera frames; hover-flash decay also
  prevents a stale frame from being skipped.
- The helper matrix and source-wiring contract are covered by
  `tests/unit-active/three-engine-helpers.test.ts` and
  `tests/unit-active/scene-static-tracker.test.ts`.

**Completed first tranche (2026-08-06):**
- Focus-camera, route-camera, and search-hero choreography now share the
  engine-owned frame scheduler. The scheduler runs before controls and render,
  so visual ordering is deterministic while only one engine RAF drives them.
- Short-landscape parity contracts now distinguish idle InfoPanel ownership
  from focus-search legacy-panel suppression and test blocking focus children
  rather than the full-viewport, pointer-events-none `#focus-stage` wrapper.
- Verification: focused Vitest `4 files / 83 tests`, production build, the
  standalone short-landscape layout contract at `667x375` and `768x380`, and
  Playwright short-landscape contracts at both viewports.

**Headless short-landscape profile (2026-08-06):**
- At 667x375 with software WebGL and 8,406 points, normal motion measured
  about 9.0M triangles, 47ms average update work, 14ms average render work,
  and zero idle render skips. App readiness took about 18s and the canonical
  focus-search transition about 12.5s.
- With `prefers-reduced-motion: reduce`, the same idle scene recorded six
  render skips, about 28ms average update work, and app readiness in about
  1.7s. The focus transition took about 3.4s.
- Geometry/parity-only short-landscape contracts now emulate reduced motion;
  production normal-motion behavior is unchanged. Animation fidelity remains
  covered by separate journey/performance work rather than these layout tests.

## Out of Scope This Round

- GPU/CPU memory profiling (requires Chrome tracing)
- Worker thread offloading for vertex computations (substantial refactor)
- Cloth/thread geometry simplification (visual tradeoff)
- Specific viewport-size perf (mobile vs desktop — already covered by Playwright journey tests in `tests/widget-journey.spec.js`)

## Recommendations for the Lane

| Priority | Item                          | Effort | Expected win                   |
| -------- | ----------------------------- | ------ | ------------------------------ |
| P1       | Frame-budget counter overlay  | 2-4h   | Visibility first, fixes after  |
| P2       | Audit remaining non-engine RAF owners | 0.5-1d | Only pursue if trace evidence shows contention |
| P3       | Conditional render-skip       | Done   | Skips only when camera and visuals are static |
| P4       | Listener cleanup audit + grep | 0.5d   | Memory leak risk closed        |

Each must come with a unit test that asserts the expected RAF count given a synthetic frame stream.
