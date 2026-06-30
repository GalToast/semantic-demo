import {
    toastStore,
    showToast,
    showWarningToast,
    showErrorToast,
    showToastSpec,
    dismissToast,
    clearToastQueue,
    type ToastSpec,
    type ToastVariant
} from '@lib/stores/toast.svelte'

/**
 * @lib/orchestration/toast.ts — Toast notification orchestrator (legacy surface)
 *
 * Thin re-export of the queue-aware toast store API so callers keep using the
 * orchestration module as their public entry point. New code may import the
 * store functions directly; this file exists to keep historical imports
 * (`showExperienceToast`, `dismissToast`) stable.
 *
 * Behavior change vs. the pre-queue version: rapid calls no longer overwrite
 * each other. Each call enqueues; the active toast is followed by the queue
 * in FIFO order. Auto-dismiss advances the queue automatically.
 */

export type { ToastSpec, ToastVariant }
export { toastStore, showWarningToast, showErrorToast, showToastSpec, clearToastQueue }

/** Show a transient info toast. Enqueues behind any currently visible toast. */
export function showExperienceToast(title: string, copy: string): void {
    showToast(title, copy)
}

/** Dismiss the visible toast and advance the queue. */
export { dismissToast }
