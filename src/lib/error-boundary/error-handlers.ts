import { errorStore } from './error-store.svelte'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import type { AppError } from './error-store.svelte'

export interface ErrorHandlerOptions {
    onError?: (e: AppError) => void
}

export interface ErrorHandlerHandle {
    uninstall: () => void
}

export function installErrorHandlers(options?: ErrorHandlerOptions): ErrorHandlerHandle {
    if (typeof window === 'undefined') {
        return { uninstall: () => {} }
    }

    function handleErrorEvent(event: ErrorEvent): void {
        const message =
            (event.error && event.error instanceof Error && event.error.message) ||
            event.message ||
            'Unknown error'
        const error = errorStore.record('window.error', message, 'error')
        publish(EVENTS.APP_ERROR_CAUGHT, { source: 'window.error', message: error.message, kind: 'error' })
        options?.onError?.(error)
    }

    function handleRejectionEvent(event: PromiseRejectionEvent): void {
        const reason = event.reason
        const message =
            (reason instanceof Error && reason.message) ||
            (typeof reason === 'string' ? reason : null) ||
            String(reason) ||
            'Unhandled promise rejection'
        const error = errorStore.record('unhandledrejection', message, 'rejection')
        publish(EVENTS.APP_ERROR_CAUGHT, { source: 'unhandledrejection', message: error.message, kind: 'rejection' })
        options?.onError?.(error)
    }

    window.addEventListener('error', handleErrorEvent)
    window.addEventListener('unhandledrejection', handleRejectionEvent)

    return {
        uninstall: () => {
            window.removeEventListener('error', handleErrorEvent)
            window.removeEventListener('unhandledrejection', handleRejectionEvent)
        }
    }
}
