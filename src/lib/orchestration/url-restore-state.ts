/**
 * @lib/orchestration/url-restore-state.ts — URL restore liveness check
 *
 * Shared bookkeeping for the url-restore split. `applyUrlState` creates a
 * per-restore `restoreToken` and threads it through every helper; this module
 * is the single source of truth for "has a newer restore superseded me?"
 *
 * Extracted from url-restore.ts (shittiest-parts W3, 2026-08-17).
 */

import { get } from 'svelte/store'
import { navStore } from '@lib/stores/navigation.svelte.ts'

/**
 * Return true if a newer applyUrlState has superseded the given token.
 *
 * Called from every restore helper that awaits something (dynamic import,
 * runSearch, camera settle) so a stale restore bails before writing state
 * on top of the newer one.
 */
export function isRestoreStale(token: number): boolean {
    return get(navStore).urlStateRestoreToken !== token
}
