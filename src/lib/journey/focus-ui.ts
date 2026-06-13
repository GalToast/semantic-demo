/**
 * @lib/journey/focus-ui.ts — Focus stage UI update utilities
 *
 * Ported from: js/modules/journey-focus-ui.js
 *
 * Bridge for focus stage UI updates. The Svelte path delegates to the
 * legacy real implementation via the BOTH-pattern shim, so any consumer
 * of @legacy/modules/journey-focus-ui gets the real work (trail controls
 * visibility, neighbor rail updates, focus progress copy, focus journey
 * toggle) instead of the prior silent no-op stub.
 *
 * The 7 dead stubs (isCondensedFocusStageViewport,
 * shouldUseSingleNeighborFocusRail, etc.) were deleted as part of Part C
 * of the 2026-06-13 fix-wave PR — they had zero external consumers per
 * ast-grep structural trace.
 *
 * Future work: port the function body from the legacy .ts to a native
 * Svelte helper. For now, re-exporting is the lowest-risk fix for the
 * render-loop bug (updateTraversalUi was stubbed out but called every
 * frame from the scene-reveal path).
 */

export { updateTraversalUi } from '@legacy/modules/journey-focus-ui';
