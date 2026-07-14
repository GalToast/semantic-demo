/**
 * @lib/app/app-lifecycle.ts — Lifecycle hooks for App.svelte
 *
 * Extracted from App.svelte to keep the root component thin.
 * Contains pure functions that run during mount/destroy lifecycle.
 */

/**
 * Remove the static #app-loading-placeholder from index.html after Svelte
 * takes over rendering. The Svelte LoadingOverlay component owns
 * #loading-overlay once mounted; the static first-paint placeholder uses
 * the distinct id #app-loading-placeholder so the two never collide.
 *
 * Called once on App mount so it never races the LoadingOverlay render.
 */
export function removeStaticPlaceholder(): void {
    if (typeof document !== 'undefined') {
        const candidates = document.querySelectorAll<HTMLElement>('#app-loading-placeholder');
        candidates.forEach((el) => el.remove());
    }
}

/**
 * Compute whether dev-only runtime tooling (lil-gui + Spector + telemetry)
 * should be visible. Checks environment mode and URL parameters.
 */
export function computeDevToolsVisible(): boolean {
    return import.meta.env.MODE === 'development'
        && typeof window !== 'undefined'
        && (() => {
            const params = new URLSearchParams(window.location.search || '');
            return params.has('debug') || params.has('devtools') || params.has('spector');
        })();
}

/**
 * Check if running in a Playwright test environment.
 */
export function isPlaywrightEnvironment(): boolean {
    return typeof window !== 'undefined' && !!window.__PLAYWRIGHT__;
}
