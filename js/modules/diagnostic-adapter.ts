// diagnostic-adapter.ts
// TypeScript shadow of diagnostic-adapter.js
// Centralized gating and registration for DevTools and testing probes.

/**
 * Returns true if debug probes should be exposed to the global scope.
 */
export function isDebugProbesEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    if (typeof (window as any).__DEBUG_PROBES__ !== 'undefined') return !!(window as any).__DEBUG_PROBES__;

    const hostname = window.location?.hostname || '';
    if (!hostname) return true;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    return isLocal;
}

/**
 * Registers a diagnostic probe to the window object if the gate is enabled.
 */
export function registerDiagnosticProbe(key: string, probe: unknown): void {
    if (!isDebugProbesEnabled()) return;
    if (typeof window === 'undefined') return;

    (window as any)[key] = probe;
}

/**
 * Conditional warning logger — only emits to console.warn when debug is enabled.
 */
export function debugWarn(...args: unknown[]): void {
    if (!isDebugProbesEnabled()) return;
    console.warn(...args);
}

export function debugInfo(...args: unknown[]): void {
    if (!isDebugProbesEnabled()) return;
    console.info(...args);
}
