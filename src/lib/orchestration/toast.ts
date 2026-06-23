/**
 * @lib/orchestration/toast.ts — Toast notification orchestrator
 *
 * Sets body data-attributes that Toast.svelte observes via MutationObserver.
 * Pattern mirrors bodyFocusPanelMode / bodyPanelSurface body-data-attr bridges.
 *
 * Replaces the legacy DOM-direct showExperienceToast from ui-feedback.ts.
 * The Svelte Toast component handles rendering, auto-dismiss, and close button.
 */

/**
 * Show a transient toast notification.
 *
 * Sets `data-toast-message` and `data-toast-state="active"` on `<body>`.
 * Toast.svelte observes these via MutationObserver, renders the toast,
 * and auto-hides after 5s (info) or 8s (error). The user can also
 * dismiss early via the close button or clicking the toast.
 */
export function showExperienceToast(title: string, copy: string): void {
    if (typeof document === 'undefined' || !document.body) return

    const body = document.body
    body.dataset.toastMessage = `${title}\n${copy}`
    body.dataset.toastVariant = 'info'
    body.dataset.toastState = 'active'
}

/**
 * Show an error toast notification.
 *
 * Same as showExperienceToast but with error variant styling
 * and longer auto-dismiss (8s vs 5s).
 */
export function showErrorToast(title: string, copy: string): void {
    if (typeof document === 'undefined' || !document.body) return

    const body = document.body
    body.dataset.toastMessage = `${title}\n${copy}`
    body.dataset.toastVariant = 'error'
    body.dataset.toastState = 'active'
}

/**
 * Dismiss the toast immediately.
 */
export function dismissToast(): void {
    if (typeof document === 'undefined' || !document.body) return
    document.body.dataset.toastState = 'dismissed'
}
