# W15 Parity-Attrs Second Look — 2026-06-17

## TL;DR

The W15 deeper parity-attrs gap was NOT caused by `$effect.root()` not firing in `parity-attrs.svelte.ts` (as the first diagnostic hypothesized). The real root cause: **`syncSvelteNavFromLegacy()` in `src/lib/orchestration/window-actions.ts:175` was mirroring stale legacy `state.navState.mode` and `surface` values (which the Svelte track never updates) back into the Svelte 5 `_navWritable` store, clobbering the correct `'focus'`/`'focus-search'` values that cursor.ts had just written.**

The previous fix (commit `7c131d7`, "force-write parity attributes on every refreshCompositionState") was correct in direction but couldn't fix the visible bug because `syncSvelteNavFromLegacy` ran AFTER the parity-attrs write and reverted it.

## Final fix

**`42aa09b fix(orchestration): stop mirroring legacy mode/surface in syncSvelteNavFromLegacy`**

```diff
   navStore.update((state) => ({
     ...state,
-    mode: (navState.mode as typeof state.mode | undefined) ?? state.mode,
-    surface: (navState.surface as typeof state.surface | undefined) ?? state.surface,
     focusedIndex,
     ...
   }))
```

The Svelte track owns `mode` and `surface` exclusively (via cursor.ts → dispatchNavTransition → `_navWritable.update`). The legacy mirror now only handles `focusedIndex` and trail/thread bookkeeping, which ARE properly maintained in the legacy state by the SEARCH_FOCUS_REQUESTED `withStateMutation` block at triggers.ts:213-220.

## Verified

Live Playwright MCP probe after a search → "cafe" → click first result:

| Attribute | Before | After |
| --- | --- | --- |
| `data-mode` | `'overview'` | `'focus'` |
| `data-nav-mode` | `'overview'` | `'focus'` |
| `data-nav-surface` | `'idle'` | `'focus-search'` |
| `data-panel-surface` | `'idle'` | `'focus-search'` |
| `data-panel-surface-mode` | `'idle'` | `'focus-search'` |
| `data-journey-phase` | `'overview'` | `'focus'` |
| `data-focused-node` | `'522'` | `'522'` |
| `data-trail-depth` | `'1'` | `'1'` |
| `data-search-status` | `'focusing'` | `'focusing'` |
| `data-focus-origin` | `'search-result'` | `'search-result'` |

All 10 attrs GREEN. The 4 previously-RED attrs (mode, navSurface, panelSurface, journeyPhase) are now correct.

## Investigation timeline

1. **First diagnostic (tmp/parity-attrs-diagnostic-2026-06-17.md)** — written by mimo 2.5 paid subagent (worker `ocw_6d80b822`). Hypothesis: `$effect.root()` in parity-attrs.svelte.ts doesn't fire reliably in the live browser. Recommended fix: add `applyParityAttributes(computeParityAttributes())` to `refreshCompositionState()`.

2. **First fix attempt (commit 7c131d7)** — applied the recommendation. Live browser probe showed body data-attrs still showed `'overview'`/`'idle'`. The fix was directionally correct (computeParityAttributes DID return the right values) but something AFTER it was overwriting.

3. **Second-look subagent dispatch (worker `ocw_5e79c4f1`)** — dispatched on `openrouter/owl-alpha` to investigate why the first fix didn't work. The worker bounced between Playwright selector errors (`querySelectorAll(':has-text(...)')` issues) and openrouter API quirks for 90+ minutes before its PID died without writing a report.

4. **Main-lane investigation** — In parallel with the subagent, added debug console.logs to:
   - `applyCompositionState` (read $nav state)
   - `applyParityAttributes` (read map values)
   - `cursor.ts focusOnNode` (read navStore before updateExplorationUi)
   - `triggers.ts CAMERA_NODE_FOCUSED` subscriber (read navStore on each call)

5. **Root cause surfaced** — Console log sequence revealed:

   ```
   [CAMERA_NODE_FOCUSED] {currentSurface: 'focus-search'} ← cursor.ts path, SKIP (focusedIndex matches)
   [applyComp] {navSurface: 'focus-search', focusedIndex: 522} ← first applyCompositionState
   [applyComp] {navSurface: 'focus', focusedIndex: 522} ← second applyCompositionState (surface clobbered)
   [applyParityAttrs] {mode: 'focus', navSurface: 'focus-search'} ← final parity-attrs subscriber fires LATE
   [applyParityAttrs] {mode: 'overview', navSurface: 'idle', focusedNode: '522'} ← clobbered by syncSvelteNavFromLegacy
   ```

   The last `applyParityAttrs` call wrote `'overview'`/`'idle'` because `_navWritable.mode` had been overwritten by `syncSvelteNavFromLegacy` (which reads stale legacy `state.navState.mode`).

6. **Fix (commit 42aa09b)** — Stop mirroring legacy mode/surface. Verified live in browser.

## Key insight

The parity-attrs effect DOES fire reliably. The previous diagnostic was wrong about that. The bug was downstream: `syncSvelteNavFromLegacy` was the culprit, not `parity-attrs.svelte.ts`.

The diagnostic's recommendation (call `applyParityAttributes(computeParityAttributes())` from `refreshCompositionState`) was actually correct, but it wasn't sufficient on its own — the late parity-attrs subscriber would still see the clobbered value and write it.

## Lessons

- Two separate stores with mirrored data (`_navWritable` vs `legacyState.navState`) is fragile. Each writer needs to know which fields it owns.
- The Svelte 5 class `appState.navState` is upstream of the Svelte writable `_navWritable`. Many writes go to `_navWritable` but never to `appState.navState` (and vice versa). This is a known store-parity gap (the `writeNavStateMirror` helper was added in `fc2d5fd` to close the most visible gaps, but mode/surface were missed).
- When mirroring between stores, default to mirroring only fields that have a canonical writer. Mode/surface don't have a canonical legacy writer; their canonical writer is cursor.ts → dispatchNavTransition → `_navWritable.update`.

## Related commits this wave

- `ca65525` — fix(focus): preserve focus-search surface across canvas/traversal/breadcrumb paths (W15+)
- `fc2d5fd` — fix(stores): add writeNavStateMirror helper + close 3 of 5 HIGH store-parity gaps
- `aed8bd8` — fix(stores): close remaining 2 HIGH store-parity gaps (GAP-4 + GAP-5)
- `99cb0f6` — test(stores): add store-parity-mirror-regression test
- `505ad77` — test(integration): lock W15 body-attr live probe
- `7c131d7` — fix(stores): force-write parity attributes on every refreshCompositionState (first attempt — wasn't enough)
- `2b100a1` — docs(notes): preserve W15 parity-attrs diagnostic report
- `42aa09b` — **fix(orchestration): stop mirroring legacy mode/surface in syncSvelteNavFromLegacy (this fix)**

## Worker outcomes

- `ocw_6d80b822` (mimo 2.5 paid, followup) — wrote the first diagnostic at `tmp/parity-attrs-diagnostic-2026-06-17.md`. Report preserved at `notes/w15-parity-attrs-diagnostic-2026-06-17.md`. Verdict: helpful, but the diagnosis was incomplete.
- `ocw_5e79c4f1` (owl-alpha, second-look) — died after 90 minutes without writing a report. Bounced between Playwright selector errors and openrouter quirks. Main lane investigation was more productive.

## Follow-up (low priority)

- The mode/surface ownership story is still complex. Consider documenting which code paths own each field in a short README.
- The store-parity mirror (`writeNavStateMirror`) should arguably be extended to include the fields that parity-attrs reads (mode, surface, focusedIndex, etc.) so legacy state stays consistent. Currently the mirror handles focusedIndex + trail bookkeeping but not mode/surface.
- The diagnostic in `tmp/parity-attrs-diagnostic-2026-06-17.md` is now partially wrong (the `$effect.root()` claim). Consider updating it.
