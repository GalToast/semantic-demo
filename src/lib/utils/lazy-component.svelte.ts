/**
 * @lib/utils/lazy-component.svelte.ts
 *
 * Lazy component orchestrator for Svelte 5.
 *
 * Consolidates the repeated pattern previously inlined across App.svelte's
 * 12 lazy-import `$effect` blocks:
 *   1. A `$state` holder for the loaded component constructor
 *   2. A `$state` flag for import-pending
 *   3. An `$effect` that imports the module when a condition becomes true
 *   4. Optionally log load failures (DEV only)
 *   5. Optionally defer via `requestIdleCallback` for cold-load budget
 *
 * Usage (typical):
 *
 *   const mapViewLazy = createLazyComponent(
 *     () => import('@components/MapView.svelte')
 *   )
 *   $effect(() => mapViewLazy.ensure(mapModeActive))
 *
 *   {#if mapViewLazy.current}
 *     {@const Cmp = mapViewLazy.current}
 *     <Cmp />
 *   {/if}
 *
 * The helper is idempotent: calling `ensure(true)` while already loaded or
 * while a load is in flight is a no-op. This matches the manual guard
 * pattern (`!Component && !ImportPending`) that each App.svelte effect
 * hand-rolled before this extraction.
 *
 * Complementary to `disposable.svelte.ts` (lifecycle-tracking primitive for
 * timers/listeners/subscriptions). This helper focuses on load orchestration;
 * the disposable primitive focuses on cleanup. They can compose in W46-B2b
 * or later if App.svelte's lazy imports ever need explicit teardown.
 */

// ── Public types ─────────────────────────────────────────────────────────────

export interface LazyComponentOptions {
    /**
     * Defer the actual import via `requestIdleCallback` so the load is
     * off the cold-load critical path. Defaults to `true`.
     * Set to `false` for components that must be ready synchronously when
     * their condition becomes true (e.g. dev-only inspector panels).
     */
    idle?: boolean

    /**
     * Console-log load failures in DEV mode (`import.meta.env.DEV`).
     * Defaults to `false` to match the existing App.svelte pattern where
     * most idle-loaded components silently no-op on failure.
     */
    logOnError?: boolean
}

export interface LazyComponentHandle<T> {
    /** The loaded component constructor, or `null` until the import resolves. */
    readonly current: T | null

    /** `true` while an import is in flight (or queued for the idle slot). */
    readonly isPending: boolean

    /**
     * Call from a `$effect`. When `condition` is `true`, starts the load
     * (no-op if already loaded or loading). When `false`, optionally clears
     * the cached component if `clearOnFalse` is set.
     */
    ensure(_condition: boolean, _opts?: { clearOnFalse?: boolean }): void
}

// ── Schedule helper ──────────────────────────────────────────────────────────

/**
 * Schedule a promise to run during the next idle slot.
 * Falls back to `setTimeout(0)` when `requestIdleCallback` is unavailable
 * (e.g. older Safari). In Playwright test environments the load runs
 * immediately so contract tests don't have to wait for the idle callback.
 *
 * Exported so consumers can use the same idle-deferral pattern for non-UI
 * work (e.g. data workers, side-effect imports without a component binding).
 */
export function scheduleIdleImport<T>(load: () => Promise<T>): Promise<T> {
    const run = (): Promise<T> => load()

    if (typeof window !== 'undefined' && window.__PLAYWRIGHT__) {
        return run()
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        return new Promise((resolve, reject) => {
            window.requestIdleCallback(() => run().then(resolve, reject), { timeout: 1500 })
        })
    }

    return new Promise((resolve, reject) => {
        setTimeout(() => run().then(resolve, reject), 0)
    })
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a lazy-loaded Svelte component handle.
 *
 * Returns a reactive object whose `current` becomes the imported component
 * constructor when `ensure(true)` is called and the import resolves. The
 * `isPending` flag is `true` during the load window (including while the
 * load is queued in the idle slot).
 *
 * The returned object is a plain handle — keep the reference stable across
 * renders by binding it to a `const` in the consumer's component scope.
 */
export function createLazyComponent<T>(
    loader: () => Promise<{ default: T }>,
    options: LazyComponentOptions = {}
): LazyComponentHandle<T> {
    let current = $state<T | null>(null)
    let isPending = $state(false)

    function startLoad(): void {
        if (current !== null || isPending) return
        isPending = true
        const doLoad = (): Promise<void> =>
            loader().then((mod) => {
                current = mod.default
            })
        const promise = options.idle === false ? doLoad() : scheduleIdleImport(doLoad)
        promise
            .catch((err: unknown) => {
                if (options.logOnError && import.meta.env.DEV) {
                    console.error('[lazy-component] load failed:', err)
                }
            })
            .finally(() => {
                isPending = false
            })
    }

    return {
        get current() {
            return current
        },
        get isPending() {
            return isPending
        },
        ensure(condition: boolean, opts: { clearOnFalse?: boolean } = {}): void {
            if (condition) {
                startLoad()
            } else if (opts.clearOnFalse && current !== null) {
                current = null
            }
        }
    }
}
