// environment.ts
// TypeScript shadow of environment.js
// Shared viewport & motion preference helpers.

export interface ViewportSize {
    width: number;
    height: number;
}

/**
 * Returns the current viewport size as { width, height }.
 */
export function getViewportSize(): ViewportSize {
    return {
        width: typeof window !== 'undefined' ? window.innerWidth : 1280,
        height: typeof window !== 'undefined' ? window.innerHeight : 800
    };
}

/**
 * Returns true when the viewport width is at or below the mobile breakpoint.
 */
export function isMobileViewport(): boolean {
    return typeof window !== 'undefined' && window.innerWidth <= 768;
}

// Backward compatibility alias
export const isMobile: () => boolean = isMobileViewport;

/**
 * Returns true when the focus-stage UI should use the compact (mobile) layout.
 */
export function isCompactFocusStage(): boolean {
    return isMobileViewport();
}

/**
 * Returns true when the user prefers reduced motion.
 */
export function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

/**
 * Returns true when the current device has a coarse pointer.
 */
export function hasCoarsePointer(): boolean {
    return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches === true;
}

/**
 * Returns true for the "compact landscape" layout variant.
 */
export function isCompactLandscape(): boolean {
    if (typeof window === 'undefined') return false;
    const { width, height } = getViewportSize();
    return width <= 768 && height <= 740;
}

/**
 * Returns true for the "ultra-compact" layout variant.
 */
export function isUltraCompactPortrait(): boolean {
    if (typeof window === 'undefined') return false;
    const { width, height } = getViewportSize();
    return width <= 430 && height >= 741 && height <= 860;
}

/**
 * Returns the device pixel ratio, defaulting to 1 when unavailable.
 */
export function getDevicePixelRatio(): number {
    return typeof window !== 'undefined' && window.devicePixelRatio !== undefined
        ? window.devicePixelRatio
        : 1;
}

/**
 * Returns the current value of `data-panel-surface` on `<body>`.
 */
export function getPanelSurface(): string {
    if (typeof document === 'undefined') return '';
    return document.body?.dataset?.panelSurface || '';
}

/**
 * Returns true when the mobile map-focus-search surface is the active panel.
 */
export function isMapSummarySurface(): boolean {
    return getPanelSurface() === 'map-focus-search';
}

/**
 * Returns true when the mobile semantic-dive surface is the active panel.
 */
export function isSemanticDiveSurface(): boolean {
    return getPanelSurface() === 'semantic-dive';
}

/**
 * Safe wrapper for `window.matchMedia`.
 */
export function matchMedia(query: string): MediaQueryList | null {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    return window.matchMedia(query);
}

/**
 * Returns `window.location` when available, otherwise null.
 */
export function getLocation(): Location | null {
    return typeof window !== 'undefined' ? window.location : null;
}

/**
 * Returns the current URL string, or empty string for SSR/test.
 */
export function getCurrentUrl(): string {
    return typeof window !== 'undefined' ? window.location.href : '';
}

/**
 * Safe wrapper for `window.getComputedStyle`.
 */
export function getComputedStyle(el: Element, pseudo?: string | null): CSSStyleDeclaration | null {
    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return null;
    return pseudo !== undefined ? window.getComputedStyle(el, pseudo) : window.getComputedStyle(el);
}

/**
 * Safe wrapper for `window.requestAnimationFrame`.
 */
export function requestAnimationFrame(callback: FrameRequestCallback): number {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return 0;
    return window.requestAnimationFrame(callback);
}

/**
 * Safe wrapper for `window.cancelAnimationFrame`.
 */
export function cancelAnimationFrame(id: number): void {
    if (typeof window === 'undefined' || typeof window.cancelAnimationFrame !== 'function') return;
    window.cancelAnimationFrame(id);
}
