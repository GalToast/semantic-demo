# Parity-Attrs Diagnostic Report — 2026-06-17

## 1. TL;DR

The parity-attrs effect (`installParityAttributeSync`) subscribes to `navStore` and is the intended sole writer of body.dataset.mode/navMode/navSurface/panelSurfaceMode/journeyPhase, but **it never fires in the live browser** (MutationObserver: ZERO changes in 1.5s post-click). The fallback writer `applyCompositionState()` runs synchronously via `refreshCompositionState()` but **does not write those 6 attrs**. The net result: nobody writes them.

## 2. Evidence

- **triggers.ts:194-203** — `SEARCH_FOCUS_REQUESTED` handler calls `navStore.update(s => ({...s, mode: 'focus', surface: 'focus-search', ...}))`. This correctly updates `_navWritable`.
- **parity-attrs.svelte.ts:435-439** — `navStore.subscribe(scheduleSync)` registers a subscriber that queues `queueMicrotask(syncNow)`. The `scheduleSync` callback should fire when `_navWritable` changes.
- **parity-attrs.svelte.ts:443-451** — `syncNow()` calls `computeParityAttributes()` (reads `navStore()` → `get(_navWritable)`) then `applyParityAttributes(map)` which writes `document.body.dataset[key]` for all attrs including mode, navMode, navSurface, panelSurfaceMode, journeyPhase.
- **triggers.ts:227** — After `navStore.update()`, the handler calls `refreshCompositionState()` → `applyCompositionState()`. This is a SECOND DOM writer that runs synchronously.
- **lifecycle.ts (stores):102** — `applyCompositionState()` writes SOME body.dataset attrs from `appState.navState` (legacy source) but does NOT write mode, navMode, navSurface, panelSurfaceMode, or journeyPhase.
- **Live probe (MutationObserver)**: After search → click first result → observe 1.5s → **ZERO** body data-attr changes. Not even temporarily.
- **App.svelte:147** — `installParityAttributeSync()` is called in onMount. The cleanup reference (`cleanupParity`) is stored but the effect root should persist.
- **navigation.svelte.ts:128-143** — `navStore` is a hybrid: `fn.subscribe = _navWritable.subscribe`. Standard Svelte writable `.subscribe()` should trigger on `.update()`.

## 3. Root cause

The parity-attrs effect is **dead in the live browser** — the `.subscribe(scheduleSync)` registration inside `$effect.root()` does not trigger when `_navWritable.update()` is called from the `SEARCH_FOCUS_REQUESTED` handler. This is likely a **Svelte 5 `$effect.root()` scoping issue**: subscriptions registered inside `$effect.root()` at module/component init time may not survive the HMR boundary or may be disconnected from the Svelte store runtime's notification mechanism in the Vite dev server. The `$effect.root()` creates an isolated reactive scope, but the `.subscribe()` calls are Svelte 4-style store subscriptions — mixing these two mechanisms in Svelte 5 can produce subscriptions that register but never fire.

Meanwhile, `applyCompositionState()` (the second writer) writes body.dataset attrs from the legacy `appState.navState` source, which IS updated by the `withStateMutation()` call in the same handler (triggers.ts:204-216). But `applyCompositionState()` only writes a subset of attrs — it does NOT write mode, navMode, navSurface, panelSurfaceMode, or journeyPhase. These 6 attrs are the exclusive domain of `applyParityAttributes()`, which never runs.

## 4. Recommended fix

**Call `applyParityAttributes(computeParityAttributes())` directly at the end of `refreshCompositionState()`** in `src/lib/stores/lifecycle.ts:149`. This makes every `refreshCompositionState()` call — including the one in `SEARCH_FOCUS_REQUESTED` — also write the full parity attribute set, bypassing the broken `$effect.root()` subscription entirely.

```typescript
// src/lib/stores/lifecycle.ts:147-153 — add 1 line:
export function refreshCompositionState(): void {
    applyCompositionState()
    applyParityAttributes(computeParityAttributes())  // ← ADD: ensure parity attrs are written
    publish(EVENTS.COMPOSITION_UPDATED)
}
```

This is a 1-line addition. It makes `refreshCompositionState()` the single entry point that writes ALL body.dataset attrs (legacy subset via `applyCompositionState` + full set via `applyParityAttributes`). The parity-attrs microtask can remain as a reactive backup for store-only changes that bypass `refreshCompositionState`.

## 5. Follow-up tests

1. **Contract test**: After `refreshCompositionState()` is called with `navStore` having `mode: 'focus'`, assert `document.body.dataset.mode === 'focus'` and `document.body.dataset.navSurface === 'focus-search'`.
2. **Live QA**: Search → click first result → snapshot body.dataset immediately → confirm mode/navMode/navSurface/panelSurfaceMode/journeyPhase all reflect the focus state within one frame.
3. **Regression guard**: Verify the existing 225 contract tests still pass (the parity-attrs write is additive, no existing assertions should break).
