/**
 * @lib/orchestration/toast.ts — Toast notification orchestrator
 *
 * Sets body data-attributes that Toast.svelte observes via MutationObserver.
 * Pattern mirrors bodyFocusPanelMode / bodyPanelSurface body-data-attr bridges.
 *
 * Replaces the legacy DOM-direct showExperienceToast from ui-feedback.ts.
 * The Svelte Toast component handles rendering and auto-dismiss.
 */

let _dismissTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Show a transient toast notification.
 *
 * Sets `data-toast-message` and `data-toast-state="active"` on `<body>`.
 * Toast.svelte observes these via MutationObserver, renders the toast,
 * and auto-hides after ~3.5 seconds.
 */
export function showExperienceToast(title: string, copy: string): void {
  if (typeof document === 'undefined' || !document.body) return;

  // Clear any in-flight dismiss timer
  if (_dismissTimer !== null) {
    clearTimeout(_dismissTimer);
    _dismissTimer = null;
  }

  const body = document.body;
  body.dataset.toastMessage = `${title}\n${copy}`;
  body.dataset.toastState = 'active';

  // Auto-dismiss after 3.5 seconds
  _dismissTimer = setTimeout(() => {
    body.dataset.toastState = 'dismissed';
    _dismissTimer = null;
  }, 3500);
}

/**
 * Dismiss the toast immediately.
 */
export function dismissToast(): void {
  if (typeof document === 'undefined' || !document.body) return;
  if (_dismissTimer !== null) {
    clearTimeout(_dismissTimer);
    _dismissTimer = null;
  }
  document.body.dataset.toastState = 'dismissed';
}
