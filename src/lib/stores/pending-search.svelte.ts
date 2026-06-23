/**
 * @lib/stores/pending-search.svelte.ts — Deferred search-intent handoff
 *
 * Lets the Splash gate capture a search query before the 3D engine is ready
 * and hand it to SearchInput once the app is live. SearchInput mounts early
 * (during the idle-surface splash phase) but must not run the search until
 * the user has opted in via the gate — so it reads this signal reactively
 * gated on `engineReady`, rather than only in onMount.
 *
 * Uses a Svelte 5 $state rune for fine-grained reactivity.
 */

let _pending: string | null = $state(null)

export const pendingSearch = {
    /** Current pending query (null when none). Tracked by $effect readers. */
    get value(): string | null {
        return _pending
    },
    /** Stage a query to be fulfilled once the app is ready. */
    set(query: string): void {
        _pending = query.trim() || null
    },
    /** Take and clear the pending query. Returns null if none staged. */
    consume(): string | null {
        const v = _pending
        _pending = null
        return v
    }
}
