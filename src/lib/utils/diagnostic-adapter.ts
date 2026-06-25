/**
 * @lib/utils/diagnostic-adapter.ts — Centralized gating for DevTools and testing probes
 *
 * Port of
 * Governs the window.__DEBUG_PROBES__ gate.
 */

declare global {
    interface Window {
        __DEBUG_PROBES__?: boolean
    }
}

export function isDebugProbesEnabled(): boolean {
    if (typeof window === 'undefined') return false
    if (typeof window.__DEBUG_PROBES__ !== 'undefined') return !!window.__DEBUG_PROBES__

    const hostname = window.location?.hostname ?? ''
    if (!hostname) return true
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    return isLocal
}

export function registerDiagnosticProbe(key: string, probe: object | (() => void)): void {
    if (!isDebugProbesEnabled()) return
    if (typeof window === 'undefined') return
    ;(window as unknown as Record<string, unknown>)[key] = probe
}

export function debugWarn(...args: unknown[]): void {
    if (!isDebugProbesEnabled()) return
    console.warn(...args)
}

export function debugInfo(...args: unknown[]): void {
    if (!isDebugProbesEnabled()) return
    console.info(...args)
}
