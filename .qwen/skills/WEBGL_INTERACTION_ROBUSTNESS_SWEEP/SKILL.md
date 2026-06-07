---
name: WebGL Interaction Pipeline Robustness Sweep
description: Targeted diagnostic sweep of WebGL/journey/interaction pipeline for production edge cases — hit-test correctness, timer/race safety, cleanup/disposal completeness, state mutation invariants, route/thread parity, and test confidence.
source: auto-skill
extracted_at: '2026-06-06T23:55:59.082Z'
---

# WebGL Interaction Pipeline Robustness Sweep

Use this when you need a **production-robustness diagnostic** of a Three.js/WebGL interaction pipeline that involves canvas hit-testing, timer-driven thread traversal, WebGL resource lifecycle, and state mutation guards. This is not a general bug sweep — it targets the specific failure modes that cause embarrassing production issues: wrong node being picked, stale timer callbacks overwriting correct state, WebGL resource leaks, and tests that pass vacuously.

## When to Use

- A Three.js-based application with canvas pointer interaction (raycasting, screen-space projection, hit-testing)
- Timer-driven state machines for thread/settler traversal (exploring → arrived → settled with clear/cancel patterns)
- Production Proxy-based state mutation guards (e.g., `withStateMutation()` required for critical path writes)
- Parallel code paths for the same logical operation (e.g., rail-walk vs. canvas-walk with duplicated or diverging logic)
- Contract tests for visual surfaces that may pass vacuously (test doesn't set up prerequisites before asserting)
- Before shipping a release that touches hit-testing, thread traversal, or WebGL resource lifecycle

## When NOT to Use

- **General bug sweep:** Use `PARALLEL_DIAGNOSTIC_BUGSWEEP` for open-ended discovery across multiple surfaces.
- **Deep logic audit:** Use `DEEP_DIVE_LOGIC_AUDIT` for deadlock/race/architecture analysis across the full system.
- **Graphics performance audit:** Use `GRAPHICS_PERFORMANCE_AUDIT` for VRAM, FPS, and GPU bottleneck analysis.
- **Fix pipeline:** Use `STRUCTURED_BUG_SURGERY` to execute verified fixes for known bugs.
- **State desync fixes:** Use `STATE_DESYNC_PARITY_SURGERY` for Svelte/legacy store mismatches.

## The Six-Facet Diagnostic

### Facet 1: Hit-Testing Correctness

Canvas hit testing is the most user-visible correctness failure. A wrong node pick means the user sees the wrong business selected. The failure mode is silent — no error, just wrong behavior.

**Procedure:**

1. **Check world↔screen projection consistency.** Find every function that projects a 3D node position to 2D screen space. Compare them:
   - Do all call `state.pointsMesh?.localToWorld(worldVector)` **before** `vector.project(state.camera)`?
   - Or does one path call `localToWorld`, another skip it? Inconsistent projection produces inconsistent screen positions for the same node between different callers.

2. **Verify hit-radius selection.** Raycaster-based picking and screen-distance-based picking must agree:
   - Read the raycaster threshold logic (`getCanvasPointWorldThreshold` and any equivalent).
   - Read the screen-distance fallback (`getCanvasFieldNodeClickRadius`, `getCanvasNodeScreenCandidate`).
   - Can the same point be "hit" by one method but not the other? Does one method filter candidates the other doesn't?
   - **Critical check:** If raycaster returns a candidate at `distance = 0.8` but screen-distance returns a different candidate at `screenPx = 12`, which one is used? Is `compareCanvasNodePickCandidates` order consistent?

3. **Check `elementFromPoint` usage.** If the hit-test uses `document.elementFromPoint(screenX, screenY)` to check canvas reachability:
   - Verify `screenX`/`screenY` are computed in CSS pixels (not device pixels) — `getBoundingClientRect()` returns CSS pixels; `elementFromPoint()` expects CSS pixels.
   - Verify `state.renderer.setPixelRatio()` doesn't create a CSS/device pixel mismatch in the projection math.
   - Check that the fallback behavior when element is null, canvas, or canvas descendant is uniform across all callers.

4. **Check picking mode override.** If a URL parameter or dataset attribute can switch between `'raycast'` and `'nearest'` picking mode:
   - Verify both modes produce the same winning candidate in normal cases.
   - Verify the URL parameter is re-read on each call (not cached at module init).

**Evidence format:**
```
### Finding — <brief title> — SEVERITY
- **Files:** path:line(s)
- **Projection inconsistency:** path1 uses localToWorld before project; path2 skips localToWorld
- **Impact:** node selection differs between hover highlight and click — user sees the wrong business
- **Fix:** centralize projection in one utility; both paths call it
```

### Facet 2: Timer/Race Safety

Timer-driven thread traversal (exploring → arrived → settled phase machines) is vulnerable to stale-callback overwrites when the user acts faster than the timer durations.

**Procedure:**

1. **Map every timer's lifecycle.** For each `setTimer(key, ms, callback)` or `window.setTimeout()`:
   - What state does the callback read/write?
   - Is there a stale-callback guard (checks phase and/or targetIndex before acting)?
   - What clears this timer? Is there a `clearTimer(key)` or `cancelAllTimers()` call in every interrupt path?

2. **Check interrupt resistance.** For each guarded timer callback, verify:
   - **Phase gate:** `if (state.strandContinuityState.phase !== 'arrived') return;` — guards against late-fire after new action started.
   - **Target gate:** `if (state.strandContinuityState.targetIndex !== capturedIndex) return;` — guards against late-fire for a different target.
   - **State gate:** `if (!state.points) return;` — guards against module teardown mid-callback.

3. **Check timer clearing order.** When a new walk/interruption starts:
   - Are **all** pending timers cleared BEFORE setting the new phase?
   - Is there a one-pass clear (`cancelAllThreadTimers()`) or individual clears?
   - If individual clears, is every timer ID in the shared pool, or are some stored in `state.*` directly (and thus missed by pool-wide clear)?

4. **Check timer pool ownership.** If a shared `_timers` Map (in `strand-continuity.js` or equivalent) holds timer IDs:
   - Verify every module that creates timers uses `setTimer(key, ms, cb)` against this shared pool.
   - Verify no module stores timer IDs in `state.*` fields that bypass the pool.
   - Verify `disposeTimers()` (pool-wide clear) is called on engine teardown.

5. **Check dual-path parity.** If both the thread-settler and thread-inspector implement the same explore/walk logic:
   - Do both clear timers before setting phase? (Often one forgets.)
   - Do both call the same nav-state update? (Often one omits `withStateMutation` or `lastTraversalReason`.)
   - Do both use the same arrival/settle delay defaults?

**Evidence format:**
```
### Finding — <brief title> — SEVERITY
- **Files:** path:line(s)
- **Timer pool gap:** timer ID stored in state.canvasThreadInspectionClearTimer, not in _timers Map
- **Impact:** timer not cleared on engine teardown → callback fires against null state
- **Fix:** register all timers through shared pool, or add state-owned IDs to pool-wide clear
```

### Facet 3: Cleanup/Disposal Completeness

WebGL applications leak GPU resources silently — no garbage collector, no OOM crash until the browser kills the tab.

**Procedure:**

1. **Map every WebGL group lifecycle.** For each `THREE.Group`, `THREE.Mesh`, `THREE.LineSegments`, `THREE.InstancedMesh` created:
   - Where is it created? (file:line)
   - Where is it disposed? (file:line — search for `.dispose()`, `disposeObject3D()`, `scene.remove()`)
   - Is there a path where creation happens without disposal? (e.g., `syncArrivalHandoffOverlay()` called a second time before the first overlay is disposed)

2. **Check texture tracking.** Canvas textures (`createSporeTexture`, `createFocusRingTexture`, etc.) are the most common WebGL leak vector:
   - Is there a tracked array (`_trackedTextures`)?
   - Is every new texture pushed to this array?
   - Is the array cleared AND disposed on every teardown path?
   - Are state references to textures nulled after disposal?

3. **Check init/destroy symmetry.** For every `init()`/`create()`/`sync()` function:
   - Does it call its own dispose first? (Pattern: `initSemanticLens()` → `disposeSemanticLens()` at the top)
   - If it creates a group and adds to the scene, does the dispose remove it from the scene and call `disposeObject3D()` on it?
   - Does `deinit()` call every module's dispose function?

4. **Check listener cleanup.** For every `addEventListener`:
   - Is there a corresponding `removeEventListener`?
   - Is the reference stored for removal? (Function reference must match for `removeEventListener` to work.)
   - Are document-level listeners with `{ capture: true }` tracked and removed?

5. **Check event bus subscription cleanup.** If using a custom event bus with `subscribe()`:
   - Does `subscribe()` return an unsubscribe function?
   - Does the destroy/teardown function call it?
   - Are module-level subscriptions (not inside init) at risk of duplication on re-init?

**Evidence format:**
```
### Finding — <brief title> — SEVERITY
- **Files:** path:line(s)
- **Lifecycle gap:** syncX() creates new Group without disposing previous one
- **Impact:** orphaned Group accumulates in scene; geometry + material never GC'd
- **Fix:** call disposeX() at the top of syncX()
```

### Facet 4: State Mutation Invariant Compliance

Production Proxy-based state guards (`withStateMutation()` required for critical path writes) make this a **throw-or-wrong** invariant — violation either throws or silently bypasses the guard.

**Procedure:**

1. **Read the state singleton's Proxy trap.** Identify:
   - `CRITICAL_KEYS` — set of top-level keys that require `withStateMutation()`
   - `TRACKED_SUB_KEYS` — set of sub-object keys that get a nested production Proxy
   - `_makeProdProxy` — what does the `set` trap do for non-critical keys? (Allow with warning? Throw?)

2. **Grep for direct writes to critical keys.** Search for patterns that mutate critical state fields OUTSIDE `withStateMutation()`:
   ```bash
   grep -rn "state\.<criticalKey>\." js/modules/ --include="*.js" --include="*.ts"
   ```
   **Manually skip** lines that are inside `withStateMutation(() => { ... })` blocks. Every remaining match is a violation.

3. **Grep for direct writes to TRACKED_SUB_KEYS sub-properties.** Same pattern for nested fields:
   ```bash
   grep -rn "state\.navState\." js/modules/ --include="*.js" --include="*.ts"
   ```
   These are higher risk because the nested Proxy `set` trap may throw only for `CRITICAL_KEYS` parents — non-critical parents may silently bypass the guard.

4. **Check both JS and TS tracks.** If the project has parallel JS (legacy) and TS (migration) tracks:
   - Search both for the same violation patterns.
   - A TS file may have been ported without the `withStateMutation()` wrapper, while the JS original has it. The TS side throws in production.
   - A JS file may have been fixed after the TS port, creating a migration regression.

**Evidence format:**
```
### Finding — <brief title> — SEVERITY
- **Files:** path:line(s)
- **Violation:** `state.navState.foo = bar;` outside withStateMutation()
- **Impact:** Production throw when this line executes (or silent bypass if non-critical)
- **Fix:** wrap in withStateMutation(() => { ... })
```

### Facet 5: Route/Thread Inspector Parity

When the same logical operation (explore a connection, walk a neighbor) has two code paths — one via the thread-settler (canvas interaction) and one via the thread-inspector (rail UI) — they must produce identical state side effects.

**Procedure:**

1. **Identify parallel implementations.** Find pairs like:
   - `walkThreadNeighbor()` in `journey-thread-settler.js` vs. `exploreThreadNeighbor()` in `thread-inspector.js`
   - `findRaycastCanvasFieldNode()` in `journey-canvas-node-picking.js` vs. `getNearestCanvasThreadCandidate()` in `journey-canvas-hit-test.js`

2. **Diff the logic line by line.** For each pair:
   - Do both call `setStrandContinuityState('exploring', ...)` with the same parameters?
   - Do both clear existing timers before setting new ones?
   - Do both call `dispatchNavTransition('WALK_TO', ...)` with the same options?
   - Do both update `state.navState.lastTraversalReason`? (One almost certainly omits this.)
   - Do both call `showExperienceToast()` with the same level of detail?
   - Do both schedule the same arrival/settle timer callbacks with the same delay defaults?

3. **Check the arrival callback behavior.** Both walk paths schedule an arrival timer (820ms default) that transitions to `'arrived'` phase. Verify:
   - Both call `syncFocusStage()` on arrival.
   - Both call `updateJourneyCompass()` on arrival.
   - Both have the same stale-callback guards.
   - Both clear the inspection or preview state on arrival (or don't, consistently).

4. **Verify the state atom.** Use a mental model: "After the walk completes, state must be identical regardless of which path triggered it." List every state field touched by both paths and confirm the final values match.

**Evidence format:**
```
### Finding — <brief title> — SEVERITY
- **Files:** path:line(s) vs. path:line(s)
- **Divergence:** Path A calls X; Path B does not call X
- **Impact:** navState.lastTraversalReason differs based on entry point → breadcrumb/compass shows wrong text
- **Fix:** add the missing call to Path B
```

### Facet 6: Test Confidence — False Negatives and False Positives

Contract tests for visual surfaces (especially Playwright assertions) often pass vacuously — the element assertions succeed because the element doesn't exist, not because the assertion passed.

**Procedure:**

1. **Find the weakest assertions.** For each surface contract test:
   - Read the `await page.evaluate(() => { ... })` block.
   - Identify every assertion that checks for the existence of a DOM element **before** checking its properties.
   - How is the test surface set up? (URL navigation, interaction sequence, or default base state?)
   - If the test doesn't navigate to a state where the element should exist, the element check passes vacuously (element not found = not tested).

2. **Check URL/target state setup.** For tests that need a focused node or active thread inspector:
   - Does the test navigate to `?view=galaxy&q=...&anchor=...`?
   - Does it simulate a click on a search result and wait for the focus stage to render?
   - Or does it load the base URL and wait for generic overlay settle?

3. **Identify assertions that always pass.** Look for:
   ```javascript
   const el = document.querySelector('#focus-thread-inspector');
   if (el) {
     ctx.pass('surface', 'check:thread-inspector');
   } else {
     ctx.pass('surface', 'check:thread-inspector:hidden');  // Always hidden = always passes
   }
   ```
   This pattern is a **false negative** — the test claims to verify thread-inspector layout but only verifies it's absent.

4. **Check timeouts and catches.** Anti-pattern:
   ```javascript
   await page.waitForSelector('.result-item', { timeout: 5000 }).catch(() => {});
   ```
   The `.catch(() => {})` swallows the timeout — test continues as if the element appeared. The subsequent assertions silently pass because they're not reached (or they assert on null).

5. **Verify early-exit contracts.** In Node-based contract tests (non-Playwright):
   ```javascript
   if (!points || !points.length) return;  // Early exit — no points, no test
   ```
   This early exit is a false negative if the common case (points present and focused) is what should be tested, but the test hits the early exit path due to incorrect state setup.

**Evidence format:**
```
### Finding — <brief title> — SEVERITY
- **Files:** path:line(s)
- **False-negative pattern:** test loads base URL; thread-inspector requires focused node; assertion checks element existence only
- **Impact:** thread-inspector could have broken layout (overflow, clipped text, overlapping buttons) but contract test never verifies it
- **Fix:** navigate to a state that renders the inspected surface; assert on layout properties, not just existence
```

## Prioritization Framework

| Severity | Criteria | Example |
|----------|----------|---------|
| 🔴 **CRITICAL** | Production throw; wrong node selected; WebGL resource leak per interaction | Proxy trap throws on normal mutation; stale timer overwrites correct state with stale data |
| 🟠 **HIGH** | Silent state corruption; dual-path divergence; timer leak on teardown | `lastTraversalReason` differs by entry point; canvas clear timer never cleared on deinit |
| 🟡 **MEDIUM** | Predictable but rare; test false negative; listener duplication risk | RenderThreadInspection listener re-binding edge case; contract test passes vacuously |
| 🟢 **LOW** | Code smell; maintenance burden; defensive coding gap | Unnecessary `instanceof Map` check; document listeners not tracked in AbortController |

## Output Format

Each finding in the report must include:

```
### Finding N — Title — SEVERITY
- **Facet:** 1 / 2 / 3 / 4 / 5 / 6 (Hit-test / Timer / Cleanup / State / Parity / Test)
- **Files:** primary and affected file paths with relevant line numbers
- **Evidence:** exact code excerpt or structural pattern showing the problem
- **Impact:** what happens in production or under test
- **Fix direction:** approach with approximate effort (Low/Medium/High)
- **Confidence:** High / Medium / Low (with verification steps run)
```

End with a **Prioritized Risk Register** table sorting findings by severity, and note which items need immediate attention before the next release.

## Self-Verification

After completing all findings, ask:
1. **"What would make this finding wrong?"** — if you searched `state.navState.*` in JS files but not TS files, you may have missed the real violation in the migration track. Double-check both.
2. **"Did I check the interrupt path?"** — for every timer/transition, did I consider what happens if the user acts again before it fires? If the guard was absent, did I flag it?
3. **"Is there a simpler explanation?"** — a four-step race condition may be less harmful than a one-step state mutation guard violation. Don't inflate rare races; don't miss certain throws.
4. **"What does the evidence NOT support?"** — if you inferred a pattern (e.g., "this function must call the shared timer pool") but didn't verify the actual call site, re-read the code. Inferences are the most common source of false findings.

## Adjacent Skills

- **STRUCTURED_BUG_SURGERY** — Run AFTER this sweep to fix confirmed findings with surgical precision.
- **GRAPHICS_PERFORMANCE_AUDIT** — Run concurrently or after this sweep for GPU-level analysis (this sweep covers correctness; performance sweep covers FPS/VRAM).
- **DEEP_DIVE_LOGIC_AUDIT** — Run for broader architecture/deadlock analysis when this sweep uncovers systemic issues.
- **STATE_DESYNC_PARITY_SURGERY** — Run for fixing specific state desync patterns found in Facet 4 (State Mutation Invariants) or Facet 5 (Route/Thread Parity).
