/**
 * Canonical re-export of composition-state logic.
 *
 * `applyCompositionState` and `derivePanelSurface` are computed from the
 * lifecycle store. See `@lib/stores/lifecycle` for the canonical
 * implementation. This module exists as a stable re-export point so that
 * `js/modules/` consumers can wire to a single canonical path.
 *
 * The 3 legacy `js/modules/` consumers (lifecycle-modes.ts, lifecycle.ts,
 * view-controller.ts) wire to this canonical, which lets us delete
 * `js/modules/composition-state.ts` cleanly.
 */

export { applyCompositionState, derivePanelSurface } from '@lib/stores/lifecycle'
