/**
 * @lib/utils/error-handler.ts — Centralized error handling for fire-and-forget operations
 *
 * Provides safe wrappers for async operations that shouldn't block the UI but
 * should still report failures (to console, toast, or state updates).
 */

import { debugWarn, debugError } from './debug'
import { showExperienceToast } from '@lib/orchestration/toast'

export interface ErrorHandlerOptions {
    /** Context label for logging (e.g., 'webgl-preload') */
    context: string
    /** Whether to show a user-facing toast */
    userFacing?: boolean
    /** Toast title if userFacing */
    toastTitle?: string
    /** Toast message if userFacing */
    toastMessage?: string
    /** Callback to run on error (e.g., update UI state) */
    onError?: (err: unknown) => void
    /** Whether to re-throw after handling */
    rethrow?: boolean
}

/**
 * Wrap a promise with consistent error handling.
 * For fire-and-forget: call via .catch(handleError({ context: '...' }))
 */
export function handleError(options: ErrorHandlerOptions): (err: unknown) => void {
    return (err: unknown): void => {
        const msg = `[${options.context}] ${err instanceof Error ? err.message : String(err)}`
        debugWarn(msg, err)

        if (options.onError) {
            try {
                options.onError(err)
            } catch (callbackErr) {
                debugError(`[${options.context}] onError callback threw:`, callbackErr)
            }
        }

        if (options.userFacing) {
            showExperienceToast(
                options.toastTitle || 'Something went wrong',
                options.toastMessage || 'Please try again in a moment.'
            )
        }

        if (options.rethrow) {
            throw err
        }
    }
}

/**
 * Wrap a promise with error handling that returns a fallback value.
 */
export function handleErrorWithFallback<T>(
    fallback: T,
    options: Omit<ErrorHandlerOptions, 'rethrow'>
): (err: unknown) => T {
    return (err: unknown): T => {
        handleError(options)(err)
        return fallback
    }
}

/**
 * Silent error handler for non-user-facing background operations.
 */
export function silenceError(context: string): (err: unknown) => void {
    return (err: unknown): void => {
        debugWarn(`[${context}] ${err instanceof Error ? err.message : String(err)}`, err)
    }
}
