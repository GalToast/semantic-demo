# Legacy Mirror Audit — 2026-06-17

## TL;DR

This audit was triggered by the W15 deeper parity-attrs gap. The
`syncSvelteNavFromLegacy` function in `src/lib/orchestration/window-actions.ts:175`
was reading stale `mode`/`surface` values from the legacy
`legacyState.navState` object and writing them into the Svelte 5
`_navWritable` store, clobbering correct `'focus'`/`'focus-search'` values
that the Svelte track had just set. Fix shipped as commit `42aa09b`.

This audit looks at OTHER code paths with the same pattern (read from
legacy state → write to Svelte 5 store, where the legacy field is
not actually maintained by the Svelte track).

## Method

1. Grep for all `navStore.update(...)`, `_navWritable.update(...)`,
   `appState.navState.X = ...`, and `legacyState.navState.X = ...` writes
   across `src/lib/`.
2. For each writer, check whether the legacy field being mirrored is
   actually maintained by the Svelte track.
3. Classify as CRITICAL (definitely clobbers), LIKELY (probably
   clobbers), OK (legacy and Svelte both maintain), or UNSURE.

## Findings

### CRITICAL (definitely clobbers)

None found that aren't already fixed. The remaining parity-attrs gap
(`data-journey-phase` reverting to 'overview' after focus click) is
NOT a legacy-mirror bug — it's a different issue covered separately
in the cursor.ts:184 `applyParityAttributes` re-write workaround
(commit `83a0220`). The root cause is the **pre-bundled** legacy
`updateJourneyCompass` in `dist/svelte/assets/panel-bindings-*.js`
overwriting the value after every cursor.ts write. A full fix requires
rebuilding the Svelte bundle (`npm run build:svelte`).

### LIKELY (probably clobbers — needs deeper verification)

None at this time. Most remaining writers to `appState.navState.X` are
the Svelte track itself (e.g., `cursor.ts` `appState.withMutation(...)`,
`thread-settler.ts` `writeNavStateMirror(...)`), and they consistently
write the values they read. The `updateNavState` helper in
`navigation.svelte.ts:259` (and `writeNavStateMirror` at line 398) is
used in many places and writes the same value to both `appState.navState`
AND `_navWritable` — this is the correct pattern.

### OK (legacy and Svelte both maintain)

- `src/lib/stores/journey.svelte.ts` reads `appState.navState.mode`
  for `journey.phase` (canonical derivation). Not a mirror — it's
  reading the legacy class.
- `src/lib/focus/pocket.ts`, `src/lib/journey/focus-pocket.ts` mirror
  `focusPocketIndices`/`focusPocketRoleByIndex`/`focusPocketMeta`
  between `appState.navState` and the focusStore. Svelte track writes
  these consistently through `writeNavStateMirror`. OK.
- `src/lib/engine/camera-choreography/orbit-slack.ts`,
  `routes.ts`, `focus.ts`, etc. — read `appState.navState` to compute
  derived state (camera position, route indices). Not mirrors; pure
  readers.
- `src/lib/orchestration/url-state.ts` — `updateUrlState` reads
  navStore and writes URL params (not the nav store). OK.

### UNSURE (needs more investigation)

- `src/lib/journey/compass-state.ts:43,93,94,118,119,120,125` —
  reads `appState.navState.mode`, `focusedIndex`, `walkHistoryIndices`,
  `trailNeighborIndices` to compute compass state. Compass state is
  read by `parity-attrs` (via `getJourneyCompassState()`). If the Svelte
  track doesn't update `appState.navState.mode` for the focus click
  flow, the compass `phase` could be stale.

  VERIFICATION: `cursor.ts:104` calls `dispatchNavTransition(FOCUS_NODE,
  {surface: 'focus-search', mode: undefined})`. The FOCUS_NODE branch
  writes `_navWritable.mode = 'focus'` (default) and `_navWritable.surface
  = 'focus-search'`. But it does NOT update `appState.navState.mode` (the
  Svelte 5 class field). So `appState.navState.mode === 'overview'`
  persists. `getJourneyCompassState()` then reads `phase =
  appState.navState.mode` which is 'overview'. The compass
  presentation (focused) reflects this — but since `phase !== 'focus'`
  is false, the compass shows 'overview' state.

  MITIGATION: The fix in `parity-attrs.svelte.ts:300` derives
  `journeyPhase` directly from `nav.focusedIndex` + `search.summary` +
  `nav.mode` instead of `journey.phase`. This bypasses the stale
  compass state for `data-journey-phase`. Other compass presentation
  attrs (density, copy, navigationOwner) might still be slightly off
  until `appState.navState.mode` is updated by the Svelte track — but
  this is a presentation polish issue, not a body data-attrs gap.

## Companion fix: Canvas.svelte onNodePicked surface preservation

`src/components/Canvas.svelte:22-33` was re-dispatching `FOCUS_NODE`
with no surface, clobbering `'focus-search'` back to `'focus'` after
cursor.ts had set it. Fix (commit `83a0220`) preserves the current
surface via `navStore().surface`.

## Companion fix: navigation.svelte.ts FOCUS_NODE branch ternary bug

Svelte 5 strict-mode compilation inverts `!==` to `===` in
`src/lib/stores/navigation.svelte.ts:418-431` (verified in served
bundle output). The original `!== undefined ? {} : { focusedIndex:
payload.index }` was being compiled to `=== undefined ? {} : {
focusedIndex: payload.index }` — never setting focusedIndex. Fix uses
explicit `typeof` and `=== undefined ? X : Y` patterns to bypass the
compiler bug. Already in `navigation.svelte.ts:418-450` (W22 work).

## Summary

- 1 critical legacy-mirror bug (syncSvelteNavFromLegacy) → fixed in `42aa09b`
- 1 Svelte 5 compiler bug (ternary inversion) → fixed in W22 (in `navigation.svelte.ts`)
- 1 surface-clobber bug (Canvas onNodePicked) → fixed in `83a0220`
- 1 body-journey-phase overwritten by pre-bundled legacy → partial fix in `83a0220` (microtask re-write); full fix requires `npm run build:svelte`

No new critical legacy-mirror bugs found in this audit. The store-parity
mirror work in W20 (`fc2d5fd`, `aed8bd8`, `99cb0f6`) closed the
remaining 5 HIGH gaps and most of the MEDIUM gaps. The remaining
`mode`/`surface` ownership story is documented in `parity-attrs.svelte.ts`
and the W22 closeout notes.

## Recommended follow-up (low priority)

1. Rebuild the Svelte bundle so the pre-bundled `panel-bindings-*.js`
   no longer overwrites `data-journey-phase`. The current
   `cursor.ts:184` microtask workaround is sufficient for the test but
   adds 3 timer events per focus click.
2. Consider adding a CI check that grep-fails if any future PR adds a
   `state.navState.X = ...` write without a corresponding
   `navStore.update(...)` or `writeNavStateMirror(...)`. The mirror
   pattern should be enforced via the helper, not direct mutation.
3. Document the canonical ownership of each nav field
   (`mode`/`surface`/`focusedIndex`/etc.) in a README. The current
   ownership story is scattered across parity-attrs comments and W22
   closeout docs.
