/**
 * src/lib/utils/debug.ts
 *
 * Debug utilities shadow of
 */

/// <reference types="vite/client" />

const DEBUG_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true';

export function debugWarn(message: string, ...args: unknown[]): void {
    if (DEBUG_ENABLED) {
        console.warn(`[DEBUG] ${message}`, ...args);
    }
}

export function debugLog(message: string, ...args: unknown[]): void {
    if (DEBUG_ENABLED) {
        console.log(`[DEBUG] ${message}`, ...args);
    }
}

export function debugError(message: string, ...args: unknown[]): void {
    if (DEBUG_ENABLED) {
        console.error(`[DEBUG] ${message}`, ...args);
    }
}