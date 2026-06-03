/**
 * diagnostic-adapter.js
 *
 * Centralized gating and registration for DevTools and testing probes.
 * Governs the window.__DEBUG_PROBES__ gate.
 */

/**
 * Returns true if debug probes should be exposed to the global scope.
 * Defaults to true on localhost/test; should be set to false in production.
 */
export function isDebugProbesEnabled() {
    if (typeof window === 'undefined') return false;
    if (typeof window.__DEBUG_PROBES__ !== 'undefined') return !!window.__DEBUG_PROBES__;

    // Default-on for local development and test environments
    const hostname = window.location?.hostname || '';
    if (!hostname) return true;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    return isLocal;
}

/**
 * Registers a diagnostic probe to the window object if the gate is enabled.
 * @param {string} key - The global property name (e.g. '_ti')
 * @param {object|function} probe - The diagnostic payload
 */
export function registerDiagnosticProbe(key, probe) {
    if (!isDebugProbesEnabled()) return;
    if (typeof window === 'undefined') return;

    window[key] = probe;
}

/**
 * Conditional warning logger — only emits to console.warn when debug is enabled.
 * Use for verbose/repetitive warnings that clutter production consoles.
 * Keep bare console.warn for critical error recovery paths.
 */
export function debugWarn(...args) {
    if (!isDebugProbesEnabled()) return;
    console.warn(...args);
}
