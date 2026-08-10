/**
 * @lib/orchestration/url-event-registration.ts — URL event listener registration
 *
 * Extracted from url-state.ts (Phase 8 split, 2026-08-09).
 * Keeps the browser URL aligned with Svelte-owned lifecycle/search events.
 * Registered through `registerUrlStateEventListeners()` so the unsubscribe
 * handles are captured (previously dropped on the floor → leak on HMR /
 * module re-evaluation). Idempotent within a module instance.
 *
 * Auto-invoked once at module load to preserve prior registration timing
 * for importers and tests. main.ts holds the returned teardown for app unload.
 *
 * NOTE: This module imports `updateUrlState` from url-state.ts, creating a
 * benign circular dependency. The import binding is live; `updateUrlState` is
 * only called inside deferred subscribe callbacks (not at module eval time),
 * so it is fully initialized before any event fires.
 */

import { subscribe, EVENTS } from '@lib/orchestration/event-bus'
import { updateUrlState } from '@lib/orchestration/url-state'

// ── Internal State ────────────────────────────────────────────────────────────

let _urlStateEventTeardown: (() => void) | null = null

// ── Registration ─────────────────────────────────────────────────────────────

export function registerUrlStateEventListeners(): () => void {
    if (_urlStateEventTeardown) return _urlStateEventTeardown
    const unsubscribers = [
        subscribe(EVENTS.SEARCH_CLEARED, () => {
            updateUrlState({ q: null, offset: null }, { reason: 'search-clear' })
        }),
        subscribe(EVENTS.SEARCH_SUCCESS, () => {
            updateUrlState({ offset: null }, { reason: 'search-payload' })
        }),
        subscribe(EVENTS.SEARCH_EMPTY, () => {
            updateUrlState({ offset: null }, { reason: 'search' })
        }),
        subscribe(EVENTS.STATE_RESET, ({ options }: { options?: { skipUrlSync?: boolean } }) => {
            if (!options?.skipUrlSync) {
                updateUrlState({ q: null, record: null, anchor: null, depth: null }, { mode: 'push', reason: 'reset' })
            }
        })
    ]
    _urlStateEventTeardown = () => {
        for (const unsub of unsubscribers) unsub()
        _urlStateEventTeardown = null
    }
    return _urlStateEventTeardown
}

// Preserve prior module-load registration behavior — fires once when this
// module is first imported by url-state.ts's barrel.
registerUrlStateEventListeners()
