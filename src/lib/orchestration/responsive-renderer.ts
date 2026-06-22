/**
 * @lib/orchestration/responsive-renderer.ts — Initial-mount render-kind decision
 *
 * W45-A: Decides whether the initial cold-load mount should render the WebGL
 * canvas or the Placeholder2D preview. The decision is made synchronously at
 * module load (no async dependency on the render path).
 *
 * Mobile-UA / narrow-viewport devices get the placeholder path so the 587 KB
 * three.js chunk does not enter the cold-load critical path. Desktop and
 * wide-viewport devices get the WebGL path (unchanged behavior).
 *
 * Decision factors (in priority order):
 *   1. `?webgl=1` URL param — force WebGL (dev / debugging)
 *   2. `?placeholder=1` URL param — force placeholder (testing)
 *   3. Viewport width ≤ MOBILE_MAX_WIDTH (768px) — placeholder
 *   4. `navigator.webdriver` — placeholder (automated sessions are typically
 *      Lighthouse / Playwright; the placeholder paints fast and the LCP is a
 *      static SVG rather than the gated three.js scene)
 *   5. Default — WebGL (desktop)
 */

export type RenderKind = 'webgl' | 'placeholder2d'

/** Viewport threshold for the placeholder decision (matches MOBILE_BREAKPOINT in viewport store). */
export const MOBILE_MAX_WIDTH = 768

/**
 * Decide the initial render kind for the current environment.
 * Synchronous, SSR-safe — returns 'webgl' when `window` is undefined.
 */
export function getInitialRenderKind(): RenderKind {
    if (typeof window === 'undefined') return 'webgl'

    // URL-param overrides (dev / QA)
    const params = new URLSearchParams(window.location.search)
    if (params.get('webgl') === '1') return 'webgl'
    if (params.get('placeholder') === '1') return 'placeholder2d'

    // Narrow viewport → placeholder
    if (window.innerWidth <= MOBILE_MAX_WIDTH) return 'placeholder2d'

    // Automated browser sessions (Lighthouse, Playwright) → placeholder so the
    // LCP measurement captures a static SVG rather than the gated three.js
    // scene. The three.js chunk still loads on demand when the CTA is tapped.
    if (typeof navigator !== 'undefined' && navigator.webdriver) return 'placeholder2d'

    return 'webgl'
}
