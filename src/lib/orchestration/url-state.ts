/**
 * @lib/orchestration/url-state.ts — URL state sync (PURE BARREL)
 *
 * Re-exports the split URL state modules so existing import paths
 * (`@lib/orchestration/url-state`) continue to work without changes.
 *
 * Layout (Phase 8 split, 2026-08-09):
 *   - url-params.ts      : URL param helpers (getSearchParams, hasRestorableUrlState, etc.)
 *   - share-copy.ts      : clipboard share-link builder
 *   - url-event-registration.ts : browser event listener registration
 *   - url-writer.ts      : URL serialization + write path (updateUrlState, clear/reset)
 *   - url-restore.ts     : URL deserialization + restore path (applyUrlState + helpers)
 */

// ── Barrel re-exports ─────────────────────────────────────────────────────────
// url-event-registration import triggers its module-load auto-registration side effect

export { registerUrlStateEventListeners } from './url-event-registration'
export { copyCurrentViewLink } from './share-copy'
export { getRequestedUrlDepth } from './url-params'
export { applyUrlState, resetStateBeforeUrlRestore, type UrlStateOptions } from './url-restore'
export { updateUrlState, clearExplorationFocusSelection, type UpdateUrlStateOptions } from './url-writer'
