/**
 * @lib/journey/selected-card.ts — Selected business card lifecycle
 *
 * Ported from: js/modules/journey-selected-card.js
 *
 * Bridge for selected business card management. The Svelte path delegates
 * to the legacy real implementation via the BOTH-pattern shim, so any
 * consumer of ../../../js/modules/journey-selected-card gets the real work
 * (focus-stage sync, traversal UI updates, lead hydration, cascade animation,
 * page meta) instead of the prior silent no-op stubs.
 *
 * Future work: port the function bodies from the legacy .ts to native
 * Svelte components (or to thin Svelte helpers here). For now, re-exporting
 * from the legacy canonical is the lowest-risk fix for the user-facing
 * bug (syncFocusStage / updateSelectedBusiness were stubbed out in this
 * file but called from 23 LIVE call sites — see ticket
 * docs/both-pattern-follow-ups-2026-06-13.md#1).
 */

export {
	syncFocusStage,
	updateSelectedBusiness
} from '../../../js/modules/journey-selected-card';
