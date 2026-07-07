# W51 Controls Audit — Deferred Items Investigation

Date: 2026-07-06
Companion to: `docs/ui-ux-audit-w51-mobile-2026-07-03.md`

## Investigation results

### C3 — Auto-rotate resumes too aggressively after drag → NOT A BUG

**Original concern:** The `'end'` event calls `scheduleAutoRotateResume(5200ms)`. If the user pauses mid-drag, auto-rotate kicks in.

**Investigation:** `scheduleAutoRotateResume()` at `camera-controls-restore.svelte.ts:127` has a guard:

```ts
if (
    !this.autoRotate ||        // ← only resumes if auto-rotate was already ON
    !_isGalaxy ||
    !_noFocus ||
    ...
) return  // early-return, no resume scheduled
```

If auto-rotate is OFF (the default), the function returns immediately — no timer is scheduled, no resume happens. The "fight" only occurs when the user has explicitly enabled auto-rotate via the toggle button, which is the expected behavior (user enabled rotation, paused, rotation resumes after 5.2s idle).

**Timing:** `AUTO_ROTATE_MANUAL_IDLE_MS = 5200ms` (config.ts:69), `AUTO_ROTATE_IDLE_MS = 3600ms` (default), `AUTO_ROTATE_SOFT_RESUME_MS = 1800ms` (soft ramp-up). The 5.2s delay after drag-end is reasonable — it's longer than the 3.6s general idle default, giving the user ample time to re-grab before rotation resumes.

**Verdict:** Not a bug. The guard correctly checks `this.autoRotate` before scheduling a resume. No fix needed.

---

### C4 — Controls toolbar `tabindex="0"` without roving focus → REAL BUG (LOW)

**Original concern:** The `<div class="controls" tabindex="0" role="toolbar">` is focusable, but there's no `onkeydown` handler for arrow-key navigation between buttons.

**Investigation:** Confirmed — `Controls.svelte` has:

- `tabindex="0"` on the toolbar container (line 124)
- `role="toolbar"` (line 123)
- NO `onkeydown` handler anywhere in the component
- 5 buttons inside, each independently focusable

**Impact:** Keyboard users Tab into the toolbar (focusing the container), then Tab again to reach the first button, then Tab through each button individually. The WAI-ARIA toolbar pattern expects Arrow Left/Right to move focus between buttons within the toolbar, keeping Tab for moving between toolbar and other page elements. Without arrow-key nav, the toolbar is functional but doesn't match the expected keyboard interaction pattern.

**Severity:** LOW — the toolbar is still fully operable via Tab; the issue is pattern compliance, not a blocker.

**Fix sketch:** Add `onkeydown` handler to the container that manages roving tabindex (ArrowLeft/ArrowRight move focus between buttons, Home/End go to first/last). Set `tabindex="-1"` on the container and `tabindex={i === focusIndex ? 0 : -1}` on each button.

---

### C5 — CompassRail `<nav>` redundant `stopPropagation` → COSMETIC (NOT A BUG)

**Original concern:** The `<nav>` has `onpointerdown`/`onwheel`/`ondblclick` with `stopPropagation()`, but `.compass-rail` has `pointer-events: none`, making the handlers dead code.

**Investigation:** Confirmed:

- `.compass-rail` has `pointer-events: none` (CompassRail.svelte:189)
- `.compass-step` has `pointer-events: auto` (CompassRail.svelte:192)
- The `<nav>` has `onpointerdown`/`onwheel`/`ondblclick` with `stopPropagation()`

The handlers are NOT dead code. When the user clicks a `.compass-step` button (which has `pointer-events: auto`), the event fires on the button, then bubbles to the `<nav>` parent. The `<nav>`'s `onpointerdown` handler catches the bubble and calls `stopPropagation()`. This prevents the event from bubbling past the `<nav>` to the document/canvas.

This is intentional — it prevents compass-rail button clicks from triggering canvas interactions. The `pointer-events: none` on `.compass-rail` only prevents the `<nav>` itself from being the event target (clicking the rail background passes through to the canvas). But events from buttons inside still bubble to the `<nav>`.

**However:** The Svelte a11y warning `a11y_no_noninteractive_element_interactions` fires because `<nav>` is a non-interactive element with mouse/keyboard listeners. The fix is to move the `stopPropagation` to a wrapper `<div>` or use `onpointerdown` on the buttons themselves.

**Verdict:** The `stopPropagation` is working as designed (not dead code). The a11y warning is a lint-level concern, not a runtime bug. No fix needed for functionality; the a11y warning can be resolved by restructuring the event handlers.

---

### C6 — No `controls.dispose()` call → NOT A BUG (FALSE POSITIVE)

**Original concern:** OrbitControls has a `.dispose()` method that removes internal event listeners. I didn't see it called in the engine disposal path.

**Investigation:** The disposal path EXISTS and IS called:

1. `Canvas.svelte:137` calls `lifecycle.destroyEngine()` (on unmount)
2. `Canvas.svelte:248` calls `engineLifecycle?.destroyEngine()` (on error)
3. `destroyEngine()` (lifecycle.ts:468) calls `cancelAnimate()` (step 1, line 473)
4. `cancelAnimate()` (three-engine-core.ts:252) contains:

    ```ts
    engineState.sceneRegistry?.disposeAll() // disposes all registered listeners
    engineState.sceneRegistry = null
    // ...
    if (engineState.state?.controls && typeof engineState.state.controls.dispose === 'function') {
        try {
            engineState.state.controls.dispose() // ← OrbitControls.dispose() IS called
        } catch (error) {
            debugWarn('[three-engine] controls already disposed:', error)
        }
    }
    ```

**Verdict:** `controls.dispose()` IS called in the disposal path. My original audit was wrong — I missed the `cancelAnimate()` function which contains the full disposal logic. No fix needed.

---

## Summary

| #   | Original concern                     | Verdict                                                                   | Action                           |
| --- | ------------------------------------ | ------------------------------------------------------------------------- | -------------------------------- |
| C3  | Auto-rotate resumes too aggressively | **NOT A BUG** — guard checks `this.autoRotate` before scheduling          | None                             |
| C4  | Controls toolbar no roving focus     | **REAL BUG (LOW)** — no `onkeydown` for arrow-key nav                     | Fix when addressing a11y backlog |
| C5  | CompassRail dead `stopPropagation`   | **NOT A BUG** — handlers fire on bubble from buttons; working as designed | None (a11y warning is cosmetic)  |
| C6  | No `controls.dispose()`              | **FALSE POSITIVE** — `controls.dispose()` IS called via `cancelAnimate()` | None                             |

Only C4 is a real (low-severity) issue. The rest are false positives from the initial source review.

---

## Journey test verification (2026-07-06)

### W51 controls/drag audit deliverable — DONE & GREEN

The four controls-audit edits landed this session:

- **C1** — `Controls.svelte` toolbar `pointer-events` (canvas drag does not eat toolbar clicks)
- **C2** — `contextmenu` suppression on canvas drag (right-click no longer aborts drag)
- **C4** — roving `tabindex` on the `role="toolbar"` container + arrow-key nav (the LOW-severity bug above, now fixed)
- **C7** — mode-chip `pointer-events` (locked chips do not swallow pointer events)
- **5m** — `tests/widget-journey.spec.js` journey test `5m. W51-C4: camera controls toolbar supports roving tabindex + arrow-key navigation`

`5m` passes against a dist rebuilt from the controls-audit source (verified 2026-07-06). The blocker that held 5m back was a stale `dist/` served while the dev server was down; rebuilding `dist` at 10:21 local with the dev server offline produced a clean bundle (`index-DfYJM_K-.js`) carrying `tabindex="-1"` on the toolbar container, and 5m went green (11.8s).

### Full widget-journey suite — 7 passed / 4 failed

Running the full `tests/widget-journey.spec.js` suite surfaced 4 failures that are **outside the controls/drag audit scope**. Their failure modes:

1. **5h** (W48 trail counter) — pre-condition fail: no point yields a "0 visible neighbors" state, so the `Stop N of 0` assertion path is unreachable. Suspect: committed `eb1b3f4c` (route `updateMyceliumThreads` through thread-manager) made the 0-neighbor state unreachable.
2. **5i** (W48 mobile 375px overlap) — `#search-input` not visible on mobile at idle → `page.fill` 120s timeout.
3. **W50-A11y** (mobile focus-to-search) — `document.activeElement.id === 'body'` (not `'search-input'`) after mobile splash dismiss. Same root class as 5i: mobile search input hidden/unfocusable at idle.
4. **5k** (UX-2 role badge) — `#selected-role-badge` never resolves to `"Business view"`. Role copy is unchanged; `selectionSource` / `viewModel` not resolving to the non-search branch.

### Decisive isolation experiment (clean-HEAD rebuild)

To separate "drift-induced" from "committed-pre-existing" for the 4 failures, all uncommitted tracked drift was stashed (`stash@{0}: w51-isolation-experiment-2026-07-06`), `dist` rebuilt from clean HEAD (`7cbdabe5`), and the 4 tests re-run:

| Test     | With drift | Clean HEAD | Verdict                                                           |
| -------- | ---------- | ---------- | ----------------------------------------------------------------- |
| 5h       | FAIL       | FAIL       | **Pre-existing committed regression** (not drift, not controls)   |
| 5i       | FAIL       | **PASS**   | **Caused by uncommitted drift** (orphaned mobile-regression work) |
| 5k       | FAIL       | FAIL       | **Pre-existing committed regression** (not drift, not controls)   |
| W50-A11y | FAIL       | FAIL       | **Pre-existing committed regression** (not drift, not controls)   |

**Conclusion:**

- The controls/drag audit edits (C1/C2/C4/C7) are domain-disjoint from all 4 failure modes and **cannot** be the cause. Confirmed: 5h/5k/W50-A11y fail identically on clean HEAD with zero controls edits present.
- 5i is the only failure caused by uncommitted drift. The drift's CSS component is **prettier-only** (verified: `css/mobile_premium__state.css` and `css/layout_base.css` diffs are pure selector line-wrapping with byte-identical declarations — no `display:none` added/removed on the search input). So 5i's search-input hiding is caused by the **semantic** drift, primarily `src/lib/orchestration/url-state.ts` (+67/−4) and/or the engine/state drift, not the CSS.
- 5h, 5k, W50-A11y are committed regressions — candidates are the committed W51 audit round (`6bbcb87d`), the focus-overlay engine commits (`1a9e6c44`, `976a7f73`, `7cbdabe5`), and `eb1b3f4c` (thread-manager activation).

### CSS drift is prettier-only (important correction)

An earlier hypothesis blamed the uncommitted CSS drift for hiding the mobile search input. Verified false: every hunk in `css/mobile_premium__state.css` and `css/layout_base.css` is a multi-line selector collapsed to a single line (or the reverse) with **no change to any declaration**. The `body:not(.surface-idle):is([data-panel-surface='focus-search']...) #canvas-container { pointer-events: none; }` rule and all search-results peek rules are byte-identical apart from whitespace. Do not chase the CSS line-wraps as if they were semantic.

### Parallel-session conflict surfaced (read before recovering the stash)

Mid-experiment a second Pi session acquired `.session-lock` (`session_id: HP@LAPTOP-2QK2TQAP`, intent `"W51 UI/UX audit round 2: continue sweep from #4 (toast lingering) onward"`, started 2026-07-06T16:47:07Z) and began editing engine/state files (`three-engine-core.ts`, `three-engine-frame-updates.ts`, `three-engine-state.ts`, `event-bus.ts`, `app.svelte.ts`, `engine-ready.svelte.ts`, `DemoChoreography.svelte`, `use-parity-attrs.svelte.ts`). The `git stash pop` at the end of the isolation experiment **aborted** because the working tree now held the parallel session's newer edits to overlapping files.

**Current repo state (as of 2026-07-06 ~17:15Z):**

- `HEAD` is unchanged at `7cbdabe5` (no commits lost).
- Working tree holds the **parallel session's** 8-file engine/state edits (consistent, no conflict markers).
- `stash@{0}: w51-isolation-experiment-2026-07-06` is **intact and complete** — it contains all 61 originally-modified files, including the W51 controls-audit edits (Controls.svelte, Canvas.svelte, header.css) and the 5m test, plus the orphaned ~46-file mobile-regression drift.
- The controls-audit files (Controls.svelte, Canvas.svelte, header.css, widget-journey.spec.js) are **clean in the working tree** — the parallel session did not touch them, so they are a non-conflicting seam to recover from the stash once the parallel session's lock is released.

**Recovery guidance (do NOT do while the parallel lock is active):**

- To restore the controls audit only: `git checkout stash@{0} -- src/components/Controls.svelte src/components/Canvas.svelte src/lib/components/header/header.css tests/widget-journey.spec.js` (these 4 files are disjoint from the parallel session's seam).
- To restore the full mobile-regression drift: wait until the parallel session releases `.session-lock`, then `git stash pop` (resolve any overlaps with the parallel session's landed commits first).
- Do **not** `git stash drop` the experiment stash until the controls audit + mobile-regression drift are confirmed recovered.

### Recommended next steps

The controls/drag audit itself is complete and green. The 4 journey failures belong to a separate track:

- **5h, 5k, W50-A11y** — committed regressions; bisect against `6bbcb87d` / `eb1b3f4c` / the focus-overlay engine commits. These need runtime probes (5h: neighbor reachability; 5k: `selectionSource` plumbing; W50-A11y: mobile search-input focus target after splash dismiss).
- **5i** — drift-induced; resolves once the orphaned mobile-regression drift (url-state.ts et al.) is either landed or reconciled with the parallel session's engine work.
- Coordinate with the parallel "W51 audit round 2" session before recovering the stash, to avoid clobbering its in-flight engine/state edits.
