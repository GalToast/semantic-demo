import { toastStore } from '@lib/stores/toast.svelte'

/**
 * @lib/orchestration/toast.ts — Toast notification orchestrator
 *
 * Writes to the Svelte toastStore which Toast.svelte subscribes to.
 * Replaces the legacy body data-attribute bridge.
 *
 * The Svelte Toast component handles rendering, auto-dismiss, and close button.
 */

/**
 * Show a transient toast notification.
 *
 * Pushes to the toast store. Toast.svelte renders the toast
 * and auto-hides after 5s (info) or 8s (error). The user can also
 * dismiss early via the close button or clicking the toast.
 */
export function showExperienceToast(title: string, copy: string): void {
    toastStore.set({
        message: `${title}\n${copy}`,
        variant: 'info',
        active: true
    })
}

/**
 * Show an error toast notification.
 *
 * Same as showExperienceToast but with error variant styling
 * and longer auto-dismiss (8s vs 5s).
 */
export function showErrorToast(title: string, copy: string): void {
    toastStore.set({
        message: `${title}\n${copy}`,
        variant: 'error',
        active: true
    })
}

/**
 * Dismiss the toast immediately.
 */
export function dismissToast(): void {
    toastStore.update((s) => ({ ...s, active: false }))
}
