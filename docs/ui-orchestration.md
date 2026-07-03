# UI Orchestration & Event-Bus Contract (W49-E)

Date: 2026-07-03

This document captures the runtime contract for transient UI surfaces (tooltips, hover previews, splash dialogs, thread inspector, map view) and which event-bus signals they must publish/subscribe to. It is the working companion to `src/lib/orchestration/event-bus.ts` and `src/lib/ui/tooltip.ts`.

## TL;DR

| Surface               | Action               | Bus event(s) to publish                     |
| --------------------- | -------------------- | ------------------------------------------- |
| Search results UI     | re-renders           | `TOOLTIP_HIDE_REQUESTED`                    |
| Thread inspector open | `pinThread(idx)`     | `TOOLTIP_HIDE_REQUESTED`                    |
| Map view activate     | `activateLeafletMap` | `TOOLTIP_HIDE_REQUESTED`                    |
| Splash dismiss        | `dismiss()`          | `TOOLTIP_HIDE_REQUESTED` (defense-in-depth) |

| Subscriber                              | Event                              | Effect                                  |
| --------------------------------------- | ---------------------------------- | --------------------------------------- |
| `src/lib/ui/tooltip.ts`                 | `TOOLTIP_HIDE_REQUESTED`           | `hideCanvasHoverPreview()`              |
| `canvas-hover-preview:focused-business` | `CAMERA_NODE_FOCUSED` (idx=number) | `showCanvasHoverPreviewForFocused(idx)` |
| `canvas-hover-preview:focused-business` | `CAMERA_NODE_FOCUSED` (idx=null)   | `hideCanvasHoverPreview()`              |

## Why the bridge exists

The canvas hover preview is one `<div>` positioned `fixed` near the cursor (or pinned to the canvas-container for AT users). It is a transient surface meant to live alongside the 3D scene. As soon as another surface takes over (map replaces canvas; thread inspector floats over the scene; splash is dismissed mid-hover), the preview becomes a distraction that points to nothing.

`src/lib/ui/tooltip.ts` owns the singleton subscription that hides it. Before W49-E the only signal feeding into the bridge was the search-results re-render. The other surfaces had no clean event to signal "the canvas is no longer the foreground, hide the preview" — and so the preview would occasionally linger behind the wrong surface.

W49-E closed those gaps by adding explicit publishes at each take-over site.

## Surface-by-surface rationale

### Search results (`src/lib/search/results-ui.ts`)

When the search UI re-renders, the user's cursor is no longer relevant — they were navigating the result list, not looking at the canvas. Publish `TOOLTIP_HIDE_REQUESTED` so the hover preview doesn't keep showing the business that was under the cursor a frame ago.

### Thread inspector (`src/lib/stores/focus.svelte.ts` -> `pinThread`)

`pinThread(index)` is the entry point the rest of the app uses to open the thread inspector card. The inspector floats over the canvas; the preview's `position: fixed` content would compete with it for screen real estate. Adding the publish at `pinThread` covers all entry points (JourneyChrome rail click, neighbor hover, code paths) without scattering the publish across each caller.

### Map view (`src/components/MapView.svelte`)

The map replaces the canvas entirely. Any preview still visible belongs to the galaxy view, which is now hidden. The publish goes in `activateLeafletMap` so it fires at the moment the view swap begins, not after (de)activate is fully complete. `deactivateMapShell` does not need a publish — the canvas comes back and the preview naturally reappears on pointermove.

### Splash dismiss (`src/components/Splash.svelte`)

Defensive only. The canvas isn't mounted yet when the splash is dismissed; the preview can't be visible. But the demo choreography sometimes hovers a node immediately after dismiss; the publish ensures a race-condition window doesn't leave a stale preview on the very first frame.

## Bridge implementation contract

```ts
// src/lib/ui/tooltip.ts (excerpt)
export function initTooltipEventBusSubscriptions(): void {
    if (_tooltipUnsubs.length > 0) return
    _tooltipUnsubs.push(subscribeKeyed('tooltip:hide-requested', EVENTS.TOOLTIP_HIDE_REQUESTED, hideTooltip))
}

export function hideTooltip(): void {
    hideCanvasHoverPreview() // direct sync entry point
}
```

The bridge is intentionally small: one key (`tooltip:hide-requested`), one event, one handler. New events or hide surfaces should add publishes at the call sites, not new keys here — the bridge is a sink, not a router.

## Idempotency

The bridge is idempotent across init/dispose cycles, but **every publish should be safe to fire repeatedly**. `hideCanvasHoverPreview` is a no-op if the preview is already hidden, so a publish from MapView activation racing with a publish from Splash dismiss is fine.

## Out of scope

- DOM-level listeners on the cursor that fire `pointermove` will still re-show the preview the moment the cursor moves over a node — that is by design and orthogonal to the bus.

## VIEW_CHANGED — activated as part of W49-F

`EVENTS.VIEW_CHANGED` was published from `writeNavStateMirror` only when the patch's `currentView` differed from the current view. The publisher also fires from `MapView.svelte`'s `setLegacyView` for the direct-bypass mutation path. The pre-state view is captured **before** the in-place `Object.assign` mutates `appState.navState` (capturing from `_readNavSnapshot()` is not safe post-mutation).

| Subscriber | Sync action |
| ---------- | ----------- |
| `src/lib/engine/lifecycle.ts` | forwards to `callbacks.onViewChanged?.(view)` |
| `src/lib/journey/focus-ui.ts`   | `updateFocusNeighborRail()` |
| `src/lib/journey/semantic-dive.ts` | `syncSemanticDiveUi()` |
| `src/lib/journey/selected-card.ts` | `updateSelectedBusiness()` (with skipHydrate) |
| `src/lib/journey/route-trace.ts` | `refreshRouteTraceOverlay()` |
| `src/lib/engine/map-state.ts` | syncRouteDirectorState + refreshMapMarkers + refreshMapRouteEmbodiment |
| `src/lib/journey/legend-ui.ts` | `setLegendOpen(false)` |
| `src/lib/stores/legend-panel.svelte.ts` | `setLegendOpen(false)` |
| `src/lib/ui/cluster-labels.ts` | `syncClusterSectionState()` |

Every subscriber is an idempotent DOM-state sync. They re-read appState and re-apply to the DOM, so calling them again with view-change context just produces the visible state for the current view. Subscribe pattern: each subscriber uses `subscribeKeyed` or `subscribe` keyed on its own module name so they don't duplicate or leak between consumers.

These subscribers had been silently waiting on `VIEW_CHANGED` from before W49-F; the publish was missing, so they never fired during view transitions. The earlier W48-fix attempts that added one-off `subscribeKeyed` calls in individual modules left the **publish** side missing. W49-F closes the gap: the publish now fires whenever `currentView` changes, AND the existing silent subscribers activate.

## Verifying the contract

```bash
# Runtime test
npx vitest run tests/unit-active/tooltip-bridge.test.ts

# Source-level scan: every publish site is checked
rg -n "publish\(EVENTS\.TOOLTIP_HIDE_REQUESTED\)" src/
```

The source inspection block at the bottom of `tooltip-bridge.test.ts` automatically verifies the four call sites ship the publish; future additions to that table become a one-line PR.
