# 15 deleted dead stub functions (Part C of the 2026-06-13 fix-wave)

These 15 stub function bodies were deleted in commit `c5a04a3`. Each was a 4-6 line `debugWarn + return null` (or similar) block. They're preserved here as text for reference.

## `src/lib/journey/selected-card.ts` (1 deleted)

- `initJourneySelectedCard(deps)`: was already dead per commit `56c3c48` (the only call site was removed). Stub body: `debugWarn('[journey] Stub function hit: initJourneySelectedCard');`

## `src/lib/journey/focus-ui.ts` (7 deleted)

- `isCondensedFocusStageViewport()`: returns false if window undefined, else `debugWarn + return false`. **Zero external consumers** per ast-grep.
- `shouldUseSingleNeighborFocusRail()`: returns false if document undefined, else `debugWarn + return false`. **Zero external consumers**.
- `shouldSuppressSelectedBusinessNeighborRail()`: `debugWarn + return false`. **Zero external consumers**.
- `hasColdDegradedSemanticFallback()`: `debugWarn + return false`. **Zero external consumers**.
- `shouldUseFloatingFocusJourneyOnly()`: `debugWarn + return false`. **Zero external consumers**.
- `initFocusNeighborRailSubscriptions()`: `debugWarn` only. **Zero external consumers**.
- `updateFocusNeighborRail(_options)`: `debugWarn` only. **Zero external consumers**.

## `src/lib/journey/thread-inspector.ts` (7 deleted)

- `getThreadInspectionState(_index, _options)`: returns default-inactive state object + `debugWarn`. **Zero external consumers** (other stubs internally called it).
- `renderThreadInspection(_index, _options)`: returns `getThreadInspectionState(null)` + `debugWarn`. **Zero external consumers**.
- `inspectThreadNeighbor(_index, _options)`: returns `renderThreadInspection(null)` + `debugWarn`. **Zero external consumers**.
- `pinThreadNeighbor(_index, _options)`: returns `renderThreadInspection(null)` + `debugWarn`. **Zero external consumers**.
- `unpinThreadInspection()`: returns `renderThreadInspection(null)` + `debugWarn`. **Zero external consumers**.
- `scheduleCanvasThreadInspectionClear(_delay)`: `debugWarn` only. **Zero external consumers**.
- `exploreThreadNeighbor(_index, _options)`: returns `null` + `debugWarn`. **Zero external consumers**.

## `src/lib/journey/thread-settler-adapter.ts` (0 net deleted)

The 3 "dead" stubs in this file (traverseNeighbor, walkInsideToNextStop, previewInsideNextThread) all turned out to have LIVE consumers (per ast-grep + svelte-check) and were restored as stubs with `debugWarn`. Net deletion: 0.

| Function | LIVE consumer |
|---|---|
| `traverseNeighbor` | `src/lib/orchestration/triggers.ts:67,70` (ArrowLeft/ArrowRight keyboard nav) |
| `walkInsideToNextStop` | `src/lib/journey/journey.ts:294` (thread-settler integration) |
| `previewInsideNextThread` | `src/lib/journey/journey.ts:198` (setSemanticDiveMode activation) |

Net effect: 18 deleted as planned by deepsek; 3 of those 18 turned out to have consumers and were restored. Real net: **15 dead stub functions deleted**, matching the live `rg "Stub function hit" src/lib/` count drop from 29 → 10.
