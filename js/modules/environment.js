// js/modules/environment.js — Shared viewport & motion preference helpers
// Replaces scattered window.innerWidth, window.innerHeight, matchMedia, and
// devicePixelRatio calls across the codebase with a single, guarded API.

/**
 * Returns the current viewport size as `{ width, height }`.
 * All callers should prefer this rather than reading window directly.
 */
export function getViewportSize() {
    return {
        width: typeof window !== 'undefined' ? window.innerWidth : 1280,
        height: typeof window !== 'undefined' ? window.innerHeight : 800
    };
}

/**
 * Returns true when the viewport width is at or below the mobile breakpoint.
 */
export function isMobileViewport() {
    return typeof window !== 'undefined' && window.innerWidth <= 768;
}

// Backward compatibility alias for isMobileViewport
export const isMobile = isMobileViewport;

/**
 * Returns true when the focus-stage UI should use the compact (mobile) layout.
 */
export function isCompactFocusStage() {
    return isMobileViewport();
}

/**
 * Returns true when the user prefers reduced motion (accessibility / OS-level).
 */
export function prefersReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

/**
 * Returns true when the current device has a coarse pointer (e.g. touch).
 */
export function hasCoarsePointer() {
    return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches === true;
}

/**
 * Returns true for the "compact landscape" layout variant (common on small mobile).
 * Logic: (max-width: 768px) and (max-height: 740px)
 */
export function isCompactLandscape() {
    if (typeof window === 'undefined') return false;
    const { width, height } = getViewportSize();
    return width <= 768 && height <= 740;
}

/**
 * Returns true for the "ultra-compact" layout variant (very narrow mobile).
 * Logic: (max-width: 430px) and (min-height: 741px) and (max-height: 860px)
 */
export function isUltraCompactPortrait() {
    if (typeof window === 'undefined') return false;
    const { width, height } = getViewportSize();
    return width <= 430 && height >= 741 && height <= 860;
}

/**
 * Returns the device pixel ratio, defaulting to 1 when unavailable.
 */
export function getDevicePixelRatio() {
    return typeof window !== 'undefined' && window.devicePixelRatio !== undefined
        ? window.devicePixelRatio
        : 1;
}

/**
 * Returns the current value of `data-panel-surface` on `<body>`, or `''` when
 * the dataset is unavailable (SSR, tests without a DOM).
 */
export function getPanelSurface() {
    if (typeof document === 'undefined') return '';
    return document.body?.dataset?.panelSurface || '';
}

/**
 * Returns true when the mobile map-focus-search surface is the active panel
 * — the state that owns the dedicated `#selected-map-summary` content
 * variant and the map trail strip.
 */
export function isMapSummarySurface() {
    return getPanelSurface() === 'map-focus-search';
}

/**
 * Returns true when the mobile semantic-dive surface is the active panel.
 * Pairs with `isMapSummarySurface()` for the two mobile traversal surfaces
 * the focus-stage / journey-compass controllers gate on.
 */
export function isSemanticDiveSurface() {
    return getPanelSurface() === 'semantic-dive';
}

/**
 * Safe wrapper for `window.matchMedia`. Returns null in SSR/test environments.
 * @param {string} query - Media query string, e.g. '(max-width: 768px)'
 * @returns {MediaQueryList|null}
 */
export function matchMedia(query) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    return window.matchMedia(query);
}

/**
 * Returns `window.location` when available, otherwise null for SSR/test contexts.
 */
export function getLocation() {
    return typeof window !== 'undefined' ? window.location : null;
}

/**
 * Returns the current URL string (`window.location.href`), or empty string for SSR/test.
 */
export function getCurrentUrl() {
    return typeof window !== 'undefined' ? window.location.href : '';
}

/**
 * Safe wrapper for `window.getComputedStyle`. Returns null in SSR/test environments.
 * @param {Element} el
 * @param {string|null} [pseudo]
 * @returns {CSSStyleDeclaration|null}
 */
export function getComputedStyle(el, pseudo) {
    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return null;
    return pseudo !== undefined ? window.getComputedStyle(el, pseudo) : window.getComputedStyle(el);
}

/**
 * Safe wrapper for `window.requestAnimationFrame`. Returns 0 in SSR/test environments.
 * @param {FrameRequestCallback} callback
 * @returns {number}
 */
export function requestAnimationFrame(callback) {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return 0;
    return window.requestAnimationFrame(callback);
}

/**
 * Safe wrapper for `window.cancelAnimationFrame`. No-op in SSR/test environments.
 * @param {number} id
 */
export function cancelAnimationFrame(id) {
    if (typeof window === 'undefined' || typeof window.cancelAnimationFrame !== 'function') return;
    window.cancelAnimationFrame(id);
}
