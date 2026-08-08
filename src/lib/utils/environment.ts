/**
 * @lib/utils/environment.ts — Shared viewport, pointer, DPR, and reduced-motion helpers
 *
 * Port of
 * Note: The viewport store in @lib/stores/viewport.ts is the canonical reactive
 * source for viewport state. These functions provide the same logic as imperative
 * helpers for use outside Svelte's reactive context (e.g. in engine bridge code).
 */

export function getViewportSize(): { width: number; height: number } {
    return {
        width: typeof window !== 'undefined' ? window.innerWidth : 1280,
        height: typeof window !== 'undefined' ? window.innerHeight : 800
    }
}

export function isMobileViewport(): boolean {
    return typeof window !== 'undefined' && window.innerWidth <= 768
}

export const isMobile = isMobileViewport

export function isCompactFocusStage(): boolean {
    return isMobileViewport()
}

/**
 * Module-level cache for the reduced-motion MediaQueryList.
 * Lazily created on first call; SSR-safe (null when window is absent).
 */
let _reducedMotionMQL: MediaQueryList | null = null
let _reducedMotionCached: boolean | null = null
let _reducedMotionOnChange: ((e: MediaQueryListEvent) => void) | null = null
/** Identity of the window.matchMedia function that created the cached MQL.
 *  If a test/iframe replaces window.matchMedia, we detect the swap and
 *  rebuild the cache so the new mock's value is returned. */
let _reducedMotionMatchMediaFn: typeof window.matchMedia | null = null

/**
 * Return the shared, listener-equipped MediaQueryList for reduced motion.
 * The MQL is created once (lazily), and a `change` listener invalidates the
 * cached boolean so the next `prefersReducedMotion()` call reflects the OS
 * preference change without a per-frame `matchMedia` call.
 */
export function getReducedMotionMQL(): MediaQueryList | null {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
    // Rebuild when window.matchMedia has been replaced (test/iframe mock swap).
    if (_reducedMotionMQL && window.matchMedia !== _reducedMotionMatchMediaFn) {
        resetReducedMotionCache()
    }
    if (!_reducedMotionMQL) {
        _reducedMotionMQL = window.matchMedia('(prefers-reduced-motion: reduce)')
        _reducedMotionCached = _reducedMotionMQL.matches
        _reducedMotionMatchMediaFn = window.matchMedia
        _reducedMotionOnChange = (e: MediaQueryListEvent) => {
            _reducedMotionCached = e.matches
        }
        // Tolerate test mocks with no addEventListener (use addListener fallback,
        // silently skip when neither exists — the cache is still valid, it just
        // won't auto-invalidate on OS-preference changes).
        if (typeof _reducedMotionMQL.addEventListener === 'function') {
            _reducedMotionMQL.addEventListener('change', _reducedMotionOnChange)
        } else if (typeof (_reducedMotionMQL as any).addListener === 'function') {
            ;(_reducedMotionMQL as any).addListener('change', _reducedMotionOnChange)
        }
    }
    return _reducedMotionMQL
}

/**
 * drop the cached reduced-motion MQL and its change listener so the next
 * `prefersReducedMotion()` call re-queries `window.matchMedia`.
 *
 * NOT exported — kept private. The automatic `window.matchMedia` identity
 * check in `getReducedMotionMQL()` handles test/iframe mock replacement
 * without a public API. Only advanced teardown (HMR, hot reload) needs this.
 */
function resetReducedMotionCache(): void {
    if (_reducedMotionMQL && _reducedMotionOnChange) {
        if (typeof _reducedMotionMQL.removeEventListener === 'function') {
            _reducedMotionMQL.removeEventListener('change', _reducedMotionOnChange)
        } else if (typeof (_reducedMotionMQL as any).removeListener === 'function') {
            ;(_reducedMotionMQL as any).removeListener('change', _reducedMotionOnChange)
        }
    }
    _reducedMotionMQL = null
    _reducedMotionCached = null
    _reducedMotionOnChange = null
    _reducedMotionMatchMediaFn = null
}

/**
 * Check the OS reduced-motion preference via a single cached MediaQueryList.
 *
 * On first call the MQL is created and its current value is cached. On
 * subsequent calls the cached boolean is returned immediately — no per-frame
 * `window.matchMedia()` cost. If the OS preference changes, a `change` listener
 * invalidates the cache so the next read returns the new value.
 *
 * SSR-safe: returns `false` when `window` is absent.
 */
export function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return false
    // Always route through getReducedMotionMQL() so the window.matchMedia
    // identity check runs on every call — test/iframe mock replacements
    // are picked up transparently without an explicit reset API.
    const mql = getReducedMotionMQL()
    if (mql) return _reducedMotionCached === true
    // SSR / no-window fallback: single-shot live query with no caching.
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
}

export function hasCoarsePointer(): boolean {
    return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches === true
}

export function isCompactLandscape(): boolean {
    if (typeof window === 'undefined') return false
    const { width, height } = getViewportSize()
    return width <= 768 && height <= 740
}

export function isUltraCompactPortrait(): boolean {
    if (typeof window === 'undefined') return false
    const { width, height } = getViewportSize()
    return width <= 430 && height >= 741 && height <= 860
}

export function getDevicePixelRatio(): number {
    return typeof window !== 'undefined' && window.devicePixelRatio !== undefined ? window.devicePixelRatio : 1
}

export function getPanelSurface(): string {
    if (typeof document === 'undefined') return ''
    return document.body?.dataset?.panelSurface ?? ''
}

export function isMapSummarySurface(): boolean {
    return getPanelSurface() === 'map-focus-search'
}

export function isSemanticDiveSurface(): boolean {
    return getPanelSurface() === 'semantic-dive'
}

export function matchMedia(query: string): MediaQueryList | null {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
    return window.matchMedia(query)
}

export function getLocation(): Location | null {
    return typeof window !== 'undefined' ? window.location : null
}

export function getCurrentUrl(): string {
    return typeof window !== 'undefined' ? window.location.href : ''
}

export function getComputedStyle(el: Element, pseudo?: string): CSSStyleDeclaration | null {
    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return null
    return pseudo !== undefined ? window.getComputedStyle(el, pseudo) : window.getComputedStyle(el)
}

export function requestAnimationFrame(callback: FrameRequestCallback): number {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return 0
    return window.requestAnimationFrame(callback)
}

export function cancelAnimationFrame(id: number): void {
    if (typeof window === 'undefined' || typeof window.cancelAnimationFrame !== 'function') return
    window.cancelAnimationFrame(id)
}
