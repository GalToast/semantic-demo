# Body-Attribute State Machine — Retirement Plan

_Mapped 2026-06-26. Living document — update as writers are consolidated._

## What the "state machine" actually is

`src/lib/orchestration/parity-attrs.svelte.ts` (671 lines) is a **reactive JS→DOM mirror**, not a MutationObserver (the old audit claim was wrong — it uses Svelte 5 `$effect.root()` + explicit `.subscribe()` on `navStore`/`journeyStore`/`loadingPhaseStore`/`graphicsModeStore`/`engineReady`).

Flow: store snapshots → `computeParityAttributes()` (pure) → `applyParityAttributes()` writes `document.body.dataset[*]` + toggles the `body.is-active` class. Entry: `installParityAttributeSync()`. Back-read: `readParityAttributesFromBody()`.

This is a **load-bearing JS↔CSS contract** (`AGENTS.md` lists it Active). It must NOT be deleted — CSS and tests depend on the body attrs existing.

### Consumers

- **CSS**: `:global(body.is-active[data-panel-surface='focus']) .focus-card` etc. in `FocusCard.svelte`, `Controls.svelte`, `WeatherWidget.svelte`.
- **e2e specs + contracts**: `3d-state-transition-integrity`, `3d-focus-pocket-selectability`, `3d-camera-orbit-resilience`, `3d-focus-neighborhood-interaction`, `3d-thread-orchestration-quality`, `aria-sync-contract.mjs` — all assert on `body.dataset.*` at runtime (black-box).
- **JS**: `url-state.ts`, `DevGui.svelte`, `Toast.svelte` read body attrs.

## The shitty part = multi-writer drift

Direct `document.body.dataset.*` writers that **race the mirror** (write attrs parity-attrs _also_ mirrors → last-writer-wins, ordering-dependent):

| Writer                                            | Attrs written (all mirrored → drift)                                                                                 | Dirty?              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `src/lib/orchestration/window-actions.ts:237-238` | `trailDepth`, `trailState`                                                                                           | clean               |
| `src/lib/orchestration/url-state.ts:193,481-483`  | `viewMode`, `panelSurface`, `journeyPhase`, `graphContext`                                                           | clean               |
| `src/lib/data-store.ts:230,240`                   | `loadingPhase`, `graphicsMode` ("legacy test compat")                                                                | clean               |
| `src/lib/stores/lifecycle.ts:142-143`             | `trailDepth`, `trailState` (duplicate of window-actions!)                                                            | clean               |
| `src/App.svelte:165,172-176,269`                  | `testReady`, `activeView`, `graphContext`, `semanticDive`, `panelSurface`, `panelSurfaceDetail`, `focusSearchForced` | **dirty (phase6f)** |

Worst case: `trailDepth`/`trailState` has **3 writers** (`window-actions`, `lifecycle`, parity-attrs) + `setTrailDepth` (`journey.ts:196`, `lifecycle.ts:28`).

**Non-mirrored direct writers (legitimate, NOT drift — leave alone):** `focusPanelMode` (`focus-panel-mode.ts`), `toast*` (`toast.ts`), `hoveredNode` (`Canvas`), `appState` (`Splash`), `premiumMode` (`DevGui`), `renderKind` (`main.ts`), `mobileSearchSheet`.

## Why not piecemeal alongside phase6f (2026-06-26)

- `parity-attrs.svelte.ts` (the mirror) + `App.svelte` + `LoadingOverlay` + `InfoPanel` + `FocusCard` + `FocusPocket` are all dirty under `phase6f-loadingoverlay-parityattrs`. The mirror contract is in flux.
- Even the "clean slice" (`window-actions` trailDepth) writes the body attr _after_ updating `journeyStore` (line 220) — the direct write is redundant drift that currently relies on parity-attrs' subscribe not having fired. Removing it blind depends on mirror timing phase6f is changing.
- **Test signal is corrupted**: `loading-ui-contract` is already failing from phase6f's `LoadingOverlay` rewrite (`data-loading-state="active"` → dynamic `={…?'active':'idle'}`, `Math.round` + phase map dropped). A body-attr regression can't be cleanly attributed to my change vs theirs.

## Sequenced retirement (execute when phase6f quiesces)

1. **Freeze mirror contract** — re-confirm `PARITY_ATTRIBUTES` (parity-attrs:53-228) is stable post-phase6f; the `source` column is the migration target for each writer.
2. **Consolidate drift writers → set the underlying store, not `body.dataset`:**
    1. `window-actions.ts:237-238` → rely on `journeyStore.trailDepth` mirror; **also delete `lifecycle.ts:142-143`** (duplicate). Verify `setTrailDepth` path (`journey.ts:196`) updates `journeyStore`.
    2. `data-store.ts:230,240` → set `loadingPhaseStore`/`graphicsModeStore` (remove "legacy test compat" shim).
    3. `url-state.ts:193,481-483` → set `navStore.currentView`/`surface` + `journeyStore.phase` (remove direct `viewMode`/`panelSurface`/`journeyPhase`/`graphContext` writes).
    4. `App.svelte:165,172-176` → set `navStore`/`focusStore` (remove `activeView`/`semanticDive`/`panelSurface`/`panelSurfaceDetail`/`testReady` direct writes).
3. **parity-attrs becomes the SOLE `body.dataset` writer** for mirrored attrs. Non-mirrored direct writers stay.
4. **(Optional, larger)** expose `appState` via a dev-only `window.__APP_STATE__` and migrate the e2e specs to read state, not body attrs — decouples black-box tests from the mirror. Keep body attrs as the CSS contract either way.
5. **Verify**: `npm run build` + `npm run lint` + `npm run test:contract` (esp. `3d-state-transition-integrity`, `aria-sync-contract`, `loading-ui-contract`) + visual QA for `FocusCard`/`Controls`/`WeatherWidget` CSS at desktop+mobile.

## Guardrails

- **Do not delete `parity-attrs.svelte.ts`** — CSS + tests depend on the body attrs it mirrors. The fix is consolidating _writers_, not removing the mirror.
- Acquire the session lock (`node scripts/session-lock.mjs acquire "body-attr writer consolidation"`) before step 2 — this is multi-commit work across shared files.
- Re-run this mapping post-phase6f before executing; the `PARITY_ATTRIBUTES` list may have changed.
