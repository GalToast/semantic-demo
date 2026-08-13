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
    const maxMs = options.maxMs ?? 1500
    const stableFrames = Math.max(1, options.stableFrames ?? 3)
    const startedAt = now()
    let canceled = false
    let frameId: number | null = null
    let landedFrames = 0

    const schedule = (): void => {
        if (!canceled) frameId = raf(step)
    }

    const step = (): void => {
        frameId = null
        if (canceled || now() - startedAt >= maxMs) return

        const input = getInput()
        if (!input) {
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
