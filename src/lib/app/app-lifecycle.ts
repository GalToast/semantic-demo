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
        const candidates = document.querySelectorAll<HTMLElement>('#app-loading-placeholder')
        candidates.forEach((el) => el.remove())
    }
}

/**
 * Compute whether dev-only runtime tooling (lil-gui + Spector + telemetry)
 * should be visible. Checks environment mode and URL parameters.
 */
export function computeDevToolsVisible(): boolean {
    return (
        import.meta.env.MODE === 'development' &&
        typeof window !== 'undefined' &&
        (() => {
            const params = new URLSearchParams(window.location.search || '')
            return params.has('debug') || params.has('devtools') || params.has('spector')
        })()
    )
}

/**
 * Check if running in a Playwright test environment.
 */
export function isPlaywrightEnvironment(): boolean {
    return typeof window !== 'undefined' && !!window.__PLAYWRIGHT__
}

/**
 * Check if running in an automated browser session (Playwright
 * __PLAYWRIGHT__ flag OR a WebDriver navigator.webdriver flag).
 *
 * Broader than isPlaywrightEnvironment(): also catches WebDriver-driven
 * sessions (e.g. Selenium / non-Playwright harnesses). Single source of
 * truth for the predicate shared by ProximityLegend auto-dismiss and the
 * W6-T4 gesture-gate auto-fire.
 */
export function isAutomatedBrowserSession(): boolean {
    return Boolean(
        typeof window !== 'undefined' &&
        (!!window.__PLAYWRIGHT__ || (typeof navigator !== 'undefined' && !!navigator.webdriver))
    )
}

/**
 * Contract-boot test mode (F12 journey reconciliation, 2026-08-23).
 *
 * Automated session that explicitly opted into the contract-boot shortcut
 * via ?contract-boot=1: engineReady auto-fires at boot and every pinned
 * component mounts synchronously so surface/contract checks see the full
 * chrome without a gesture.
 *
 * Journey specs deliberately do NOT pass the param: they exercise the real
 * splash → CTA → search/focus flow. Before this gate existed, the gesture-
 * monitor auto-fire + App.svelte shortcut made every splash-flow journey
 * spec structurally unpassable (~40 reds).
 */
export function isContractBootTest(): boolean {
    return (
        isAutomatedBrowserSession() &&
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('contract-boot') === '1'
    )
}
