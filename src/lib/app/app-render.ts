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
