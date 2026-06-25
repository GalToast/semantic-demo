/**
 * src/lib/utils/debug.ts
 *
 * Debug utilities shadow of
 */

/// <reference types="vite/client" />

// import.meta.env is undefined in Node (test environments), so guard the
// access. In the browser/Vite build the env is always present.
const DEBUG_ENABLED = (() => {
    try {
        return (
            (import.meta as { env?: { DEV?: boolean; VITE_DEBUG?: string } }).env?.DEV === true ||
            (import.meta as { env?: { DEV?: boolean; VITE_DEBUG?: string } }).env?.VITE_DEBUG === 'true'
        )
    } catch {
        return false
    }
})()

export function debugInfo(message: string, ...args: unknown[]): void {
    if (DEBUG_ENABLED) {
        console.info(`[DEBUG] ${message}`, ...args)
    }
}

export function debugWarn(message: string, ...args: unknown[]): void {
    if (DEBUG_ENABLED) {
        console.warn(`[DEBUG] ${message}`, ...args)
    }
}

export function debugLog(message: string, ...args: unknown[]): void {
    if (DEBUG_ENABLED) {
        console.log(`[DEBUG] ${message}`, ...args)
    }
}

export function debugError(message: string, ...args: unknown[]): void {
    if (DEBUG_ENABLED) {
        console.error(`[DEBUG] ${message}`, ...args)
    }
}
