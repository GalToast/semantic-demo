/**
 * @lib/stores/notify.ts — Shared "update a Svelte writable" pattern
 *
 * Every store in this directory (demo, focus, journey, viewport, …) defines
 * a `withXxxNotify(updater)` wrapper that:
 *   1. reads the current value from its `_xxxWritable`,
 *   2. computes the next value via `updater(current)`,
 *   3. publishes the next value to the writable, and
 *   4. (optionally) mirrors the new value to `appState` for legacy readers.
 *
 * Steps 1–3 are identical across every wrapper. This helper extracts that
 * shared structural piece and returns the new value so the per-store wrapper
 * can run its specific mirror step without re-reading the writable.
 *
 * The per-store `withXxxNotify` wrappers stay — they own the mirror logic
 * (which differs per store: viewport writes 5 fields to appState.viewportX,
 * focus calls writeNavStateMirror + 10 individual fields, journey normalizes
 * depth/trailDepth aliases, demo writes a single field, etc.). This helper
 * is the "compute + publish" half of the contract.
 *
 * `withSearchNotify` is intentionally NOT migrated — it has a different
 * signature `withSearchNotify<T>(fn: () => T): T` (do-and-return-value, not
 * updater) used by search-pipeline actions that need to return a result.
 *
 * @example
 *   function withViewportNotify(updater: (s: ViewportState) => ViewportState): void {
 *       const next = withNotify(_viewportWritable, updater)
 *       appState.viewportState.viewportWidth = next.width
 *       appState.viewportState.viewportHeight = next.height
 *       // … etc.
 *   }
 */
import type { Writable } from 'svelte/store'
import { get } from 'svelte/store'

export function withNotify<T>(writable: Writable<T>, updater: (_s: T) => T): T {
    const next = updater(get(writable))
    writable.set(next)
    return next
}