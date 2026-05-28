// js/modules/environment.js — Shared viewport & motion preference helpers
// Replaces scattered window.innerWidth, window.innerHeight, matchMedia, and
// devicePixelRatio calls across the codebase with a single, guarded API.

const _dpr =
    typeof window !== 'undefined' && window.devicePixelRatio !== undefined
        ? window.devicePixelRatio
        : 1;

const _viewport = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
    dpr: _dpr
};

/**
 * Returns the current viewport size as `{ width, height }`.
 * All callers should prefer this rather than reading window directly.
 */
export function getViewportSize() {
    return {
        width: typeof window !== 'undefined' ? window.innerWidth : _viewport.width,
        height: typeof window !== 'undefined' ? window.innerHeight : _viewport.height
    };
}

/**
 * Returns true when the viewport width is at or below the mobile breakpoint.
 */
export function isMobile() {
    return typeof window !== 'undefined' && window.innerWidth <= 768;
}

/**
 * Returns true when the user prefers reduced motion (accessibility / OS-level).
 */
export function prefersReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

/**
 * Returns the device pixel ratio, defaulting to 1 when unavailable.
 */
export function getDevicePixelRatio() {
    return typeof window !== 'undefined' && window.devicePixelRatio !== undefined
        ? window.devicePixelRatio
        : 1;
}