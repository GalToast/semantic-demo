/**
 * @lib/journey/thread-inspector.ts — Thread inspection overlay management
 *
 * Ported from: js/modules/thread-inspector.js
 *
 * Bridge for thread inspection state. The Svelte path delegates to the
 * legacy real implementation via the BOTH-pattern shim, so any consumer
 * of ../../../js/modules/thread-inspector gets the real work (state reset,
 * pinned/unpinned thread transitions, strand continuity clearing,
 * canvas timer cleanup, sync focus stage + sync semantic dive UI) instead
 * of the prior silent no-op stub.
 *
 * The 7 dead stubs (getThreadInspectionState, renderThreadInspection,
 * inspectThreadNeighbor, etc.) were deleted as part of Part C of the
 * 2026-06-13 fix-wave PR — they had zero external consumers per
 * ast-grep structural trace.
 *
 * Future work: port the function body from the legacy .ts to a native
 * Svelte helper. For now, re-exporting is the lowest-risk fix for the
 * thread-inspection bug (clearThreadInspection was stubbed out but called
 * from ThreadInspector.svelte + 13 other sites).
 */

export { clearThreadInspection } from '@lib/engine/thread-inspector-bridge';
