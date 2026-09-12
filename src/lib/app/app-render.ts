/**
 * @lib/app/app-render.ts — Render logic helpers for App.svelte
 *
 * Extracted from App.svelte to keep the root component thin.
 * Contains pure helper functions used by the template and $derived computations.
 */

/**
 * Focus the search input element. Used by the a11y effect that moves
 * focus into the app when it first becomes interactive.
 *
 * Defers via rAF to avoid popping the mobile keyboard during the
 * Splash modal trap teardown.
 */
export function focusSearchInput(): void {
    // eslint-disable-next-line no-restricted-syntax -- one-shot focus defer; the frame callback runs once and completes, so there is no recurring loop to dispose via DisposableRegistry
    requestAnimationFrame(() => {
        const input = document.getElementById('search-input') as HTMLInputElement | null
        if (input && document.activeElement !== input) input.focus()
    })
}

export interface FocusSearchInputUntilLandedOptions {
    raf?: (callback: FrameRequestCallback) => number
    cancelRaf?: (id: number) => void
    now?: () => number
    getInput?: () => HTMLElement | null
    getActive?: () => Element | null
    maxMs?: number
    stableFrames?: number
    /** Fallback target when the search input never mounts (e.g. the mobile
     *  place-first map boot renders no search chrome). Probed once per run
     *  frame while the input is absent; the first non-null hit takes over. */
    getFallback?: () => HTMLElement | null
}

/**
 * Retry focus across the splash-to-app handoff until it is stably owned by the
 * search input. The bounded loop avoids both a one-shot lazy-hydration race
 * and an unbounded rAF that keeps reopening the mobile keyboard.
 */
export function focusSearchInputUntilLanded(
    options: FocusSearchInputUntilLandedOptions = {}
): () => void {
    const raf = options.raf ?? ((callback: FrameRequestCallback) => requestAnimationFrame(callback))
    const cancelRaf = options.cancelRaf ?? ((id: number) => cancelAnimationFrame(id))
    const now = options.now ?? (() => performance.now())
    const getInput = options.getInput ?? (() => document.getElementById('search-input') as HTMLInputElement | null)
    const getActive = options.getActive ?? (() => document.activeElement)
    const getFallback = options.getFallback
    const maxMs = options.maxMs ?? 1500
    const stableFrames = Math.max(1, options.stableFrames ?? 3)
    const startedAt = now()
    let canceled = false
    let frameId: number | null = null
    let landedFrames = 0
    // W50 (2026-09-11): when the search input never mounts (mobile place-first
    // map boot — surface 'map' renders no search chrome by design), focus must
    // still land somewhere reachable instead of stranding on <body>. Lazily
    // probe the fallback on frames where the input is absent.
    let fallbackTarget: HTMLElement | null = null

    const schedule = (): void => {
        if (!canceled) frameId = raf(step)
    }

    const step = (): void => {
        frameId = null
        if (canceled || now() - startedAt >= maxMs) return

        const input = getInput()
        if (!input) {
            // Fallback probe (W50): input absent — if a fallback target is
            // configured and reachable, drive focus there instead of spinning
            // out and stranding on <body>.
            if (getFallback) {
                fallbackTarget ??= getFallback()
                if (fallbackTarget) {
                    if (getActive() !== fallbackTarget) {
                        landedFrames = 0
                        fallbackTarget.focus()
                        schedule()
                        return
                    }
                    landedFrames += 1
                    if (landedFrames < stableFrames) schedule()
                    return
                }
            }
            landedFrames = 0
            schedule()
            return
        }

        if (getActive() !== input) {
            landedFrames = 0
            input.focus()
            schedule()
            return
        }

        landedFrames += 1
        if (landedFrames < stableFrames) schedule()
    }

    schedule()
    return () => {
        canceled = true
        if (frameId !== null) cancelRaf(frameId)
        frameId = null
    }
}

/**
 * Surface-agnostic twin of focusSearchInputUntilLanded: drive focus to any
 * single target (W50: the mobile place-first map container) with the same
 * bounded-retry / stable-land / cancelable-teardown contract. Shares the
 * retry implementation via delegation — the search-input loop with a forced
 * getter is behaviorally identical to a generic target loop.
 */
export function focusElementUntilLanded(
    getTarget: () => HTMLElement | null,
    options: Omit<FocusSearchInputUntilLandedOptions, 'getInput' | 'getFallback'> = {}
): () => void {
    return focusSearchInputUntilLanded({ ...options, getInput: getTarget, getFallback: undefined })
}
