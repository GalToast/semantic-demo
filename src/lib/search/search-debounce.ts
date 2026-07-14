/**
 * @lib/search/search-debounce.ts — Reusable debounce timer for search input.
 *
 * Encapsulates the clear-and-reschedule timer pattern used by SearchInput.svelte
 * to avoid duplicating setTimeout/clearTimeout boilerplate across 6+ handlers.
 * Behavior-preserving: schedule() clears any pending timer before setting
 * a new one, cancel() is idempotent.
 */

export class SearchDebounce {
    private timer: ReturnType<typeof setTimeout> | null = null

    /**
     * Schedule a callback after `delayMs`. Clears any pending timer first.
     * After the callback fires, the timer is auto-nulled.
     */
    schedule(callback: () => void, delayMs: number): void {
        this.cancel()
        // eslint-disable-next-line no-restricted-syntax -- SearchDebounce IS the timer lifecycle wrapper; callers go through cancel()/schedule() and never touch setTimeout directly.
        this.timer = setTimeout(() => {
            this.timer = null
            callback()
        }, delayMs)
    }

    /** Clear the pending timer if any. Idempotent — safe to call when no timer is active. */
    cancel(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer)
            this.timer = null
        }
    }

    /** Whether a timer is currently pending (hasn't fired or been cancelled). */
    get isPending(): boolean {
        return this.timer !== null
    }
}
