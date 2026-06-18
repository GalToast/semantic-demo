# Bug: thread-inspector visual baseline is invalid + activation logic gap

**Date:** 2026-06-18
**Found via:** debug sweep after W35 visual-baseline capture (commit `802f410`).
**Severity:** LOW–MED (cosmetic + test anti-guard; not a crash).
**Surface:** `tests/visual-baselines/thread-inspector.png`, `src/lib/journey/thread-inspector.ts`, `src/components/ThreadInspector.svelte`.

---

## Summary

The `thread-inspector.png` visual baseline committed in `802f410` is **invalid**: it captures the mobile focus view with the `ThreadInspector` component completely unmounted, not the thread-inspector surface. The 8% `thresholdOverride` with the comment *"Svelte component may not render in legacy shell — capture whatever state is present"* masks this. The test now **anti-guards** the surface — it enforces a no-inspector state, so a future fix that actually renders the inspector would cause a test *failure*.

A deeper activation-logic gap was also found: `pinThreadNeighbor(<focused index>)` returns `active:false, pinned:false`.

---

## Evidence (live probe, dev server `:5173`)

### 1. The recipe does not mount the inspector

Recipe: `?view=galaxy&q=coffee&anchor=519&nodemo=1`

```
mode: focus                        ← focus activated correctly
panelSurface: focus-search
focusCardPresent: true
threadInspectorElPresent: false    ← .focus-thread-inspector absent from DOM
bodyHasThreadInspectorActive: absent
```

`anchor=519` publishes `SEARCH_FOCUS_REQUESTED {index:519}` early (App.svelte:28). Focus activates, but `ThreadInspector.svelte` line 112 renders only when `{#if visible && focusSnapshot.threadInspector.active}` — focus alone sets neither. The component never mounts.

### 2. Programmatic activation also fails to *visibly* render

`window.__APP_ACTIONS__.pinThreadNeighbor(519, {reason:'debug-verify'})` returns:

```json
{ "active": false, "pinned": false, "surface": "pinned", "source": "" }
```

After the call:

- `.focus-thread-inspector` element IS now in the DOM (component mounted — store's `active:true` was set).
- Class: `"focus-thread-inspector"` — **without** `.active` (would have triggered `journey_steps.css:671 { opacity:1 }`).
- `aria-hidden="true"`.
- `body[data-thread-inspect-surface='idle']` (unchanged).
- Computed `opacity: 0` (hidden via `layout_base.css:886` body attr rule).

The inspector mounts its skeleton (renders "Connection Preview / Select a nearby stop / Click a neighbor below to preview" empty-state copy) but stays invisible.

### 3. Why the body attr is correct (NOT a parity-attrs gap)

`thread-inspector.ts:210` writes:

```ts
document.body.dataset.threadInspectSurface = inspectionState?.active
    ? inspectionState.surface || options.surface || 'rail'
    : 'idle'
```

`inspectionState` comes from `getThreadInspectionState(519)`, which computed `active:false`. So the `'idle'` body attr is **faithfully reflecting** the false computation — NOT a sync failure between store and body-attr.

## Root cause (hypothesis, high confidence)

`pinThreadNeighbor(index)` is designed to pin a **neighbor** of the focused node — a thread is a *focus↔neighbor connection*. Passing the **focused index itself** (519) produces no thread strand (`getThreadInspectionState` → `active:false`, `segmentCount:0`), so:

- The store write (`focusStore.threadInspector.active = true`) mounts the component.
- `renderThreadInspection`'s returned `inspectionState.active = false` keeps the body attr `'idle'` and the element never gets the `.active` class.
- CSS hides the mounted-but-inactive element.

To capture a real thread-inspector baseline, the recipe would need to pass an **actual neighbor index of 519** (not 519 itself), which requires knowing the neighbor graph at recipe-authoring time — not derivable from a URL param alone.

---

## Recommended actions

1. **Remove or `.skip` the `thread-inspector` TestState** in `tests/visual-regression.test.ts`. The baseline is anti-guarding. (In-lane, safe — this is the test file, not the activation logic.)
2. **Fix the activation logic** (separate ticket, deeper): either
   - Make `pinThreadNeighbor` reject/short-circuit when `index === focusedIndex` (return null with a clear reason), OR
   - Add a canonical "pin first available neighbor" helper that picks a real neighbor index, OR
   - Document that the inspector only activates on a true neighbor hover/click and update the visual-regression recipe to simulate that interaction.
3. **Do NOT treat this as a parity-attrs bug.** The body attr is correct; the divergence is logic-level (pinThreadNeighbor store-write vs getThreadInspectionState computed result). See `notes/` memory entry for the self-correction.

## Verification of the focus stage (side benefit)

This probe incidentally confirmed that `anchor=519` correctly drives focus: `mode:focus`, `panelSurface:focus-search`, `focusCardPresent:true`. The focus-stage click path abandoned during Seam D (HMR churn) is verified working via URL param. The `cursor.ts` surface-preservation fix is intact.
