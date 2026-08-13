import {
    toastStore,
    showWarningToast,
    showErrorToast,
    showToastSpec,
    dismissToast,
    dismissToastById,
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
export function showExperienceToast(title: string, copy: string): void
export function showExperienceToast(title: string, copy: string, id: string): void
export function showExperienceToast(title: string, copy: string, id?: string): void {
    showToastSpec({ title, copy, variant: 'info', id })
}

/** Dismiss the visible toast and advance the queue. */
export { dismissToast }

/**
 * Dismiss a specific toast by id without disturbing unrelated queued toasts
 * (engine lifecycle audit F1). Aliased as `dismissExperienceToast` so it lands
 * on `engineState.uiFeedback` via the toast-orchestration merge.
 */
export { dismissToastById, dismissToastById as dismissExperienceToast }

/**
 * Test/dev affordance: expose the toast trigger functions on `window` so
 * Playwright (and DevTools) can drive the toast UI without rebuilding the
 * full call stack. Same pattern as `__refreshTestCompatState__`,
 * `showSemanticThreadsDetail`, and `requestSemanticGuide` — typed in
 * `src/window.d.ts`, mounted by `main.ts` for adjacent hooks, here directly
 * because `@lib/orchestration/toast.ts` is the canonical test path for
 * exercising SearchResults' missing-point toast (PR-W52-1).
 */
if (typeof window !== 'undefined') {
    window.__toastHooks__ = {
        showErrorToast,
        dismissToast,
        clearToastQueue,
        showToastSpec
    }
}

/**
 * L1 (bugsweep): tear down the __toastHooks__ window global so HMR re-evaluation
 * and test isolation don't stack duplicate hook references. Mirrors the cleanup
 * pattern in window-actions.ts and test-globals.ts.
 */
export function teardownToastHooks(): void {
    if (typeof window !== 'undefined') {
        delete (window as { __toastHooks__?: unknown }).__toastHooks__
    }
}
