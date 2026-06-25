<!--
  @components/Toast.svelte — Transient toast notification

  Observes body data-toast-message + data-toast-state via MutationObserver
  (mirrors the bodyFocusPanelMode pattern in App.svelte).

  Renders with DOM IDs matching the legacy contract (#experience-reset-toast,
  #experience-toast-title, #experience-toast-copy) so the existing
  src/lib/ui/ui-feedback.ts showExperienceToast can also manipulate it
  during migration coexistence.

  Features:
    - Close button for manual dismissal
    - Auto-dismiss after 5s (info) or 8s (error)
    - Click-to-dismiss on toast body
    - Keyboard accessible (Escape to dismiss when focused)
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface Props {}
  // eslint-disable-next-line no-empty-pattern -- empty $props() destructuring is the Svelte 5 idiom for "no props accepted"
  let {} = $props();

  let toastMessage = $state('');
  let toastActive = $state(false);
  let toastVariant = $state<'info' | 'error'>('info');
  let toastTitle = $derived(toastMessage.split('\n')[0] || '');
  let toastCopy = $derived(toastMessage.split('\n').slice(1).join('\n') || '');
  let isError = $derived(toastVariant === 'error');

  /** Auto-dismiss duration in ms — longer for errors so users can read them */
  const DISMISS_DELAY = $derived(isError ? 8000 : 5000);

  let dismissTimer: ReturnType<typeof setTimeout> | null = null;
  let toastElement: HTMLElement | null = null;

  function clearDismissTimer(): void {
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
  }

  function startDismissTimer(): void {
    clearDismissTimer();
    dismissTimer = setTimeout(() => {
      dismiss();
    }, DISMISS_DELAY);
  }

  function dismiss(): void {
    clearDismissTimer();
    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.toastState = 'dismissed';
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && toastActive) {
      e.preventDefault();
      dismiss();
    }
  }

  function handleCloseClick(e: MouseEvent): void {
    e.stopPropagation();
    dismiss();
  }

  onMount(() => {
    if (typeof document === 'undefined' || !document.body) return;

    const sync = () => {
      const body = document.body;
      const wasActive = toastActive;
      toastMessage = body.dataset.toastMessage || '';
      toastActive = body.dataset.toastState === 'active';
      toastVariant = (body.dataset.toastVariant as 'info' | 'error') || 'info';

      // Start auto-dismiss when toast becomes active
      if (toastActive && !wasActive) {
        startDismissTimer();
      } else if (!toastActive) {
        clearDismissTimer();
      }
    };

    const obs = new MutationObserver(sync);
    obs.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-toast-message', 'data-toast-state', 'data-toast-variant'],
    });
    sync();

    // Global Escape key handler
    document.addEventListener('keydown', handleKeydown);

    return () => {
      obs.disconnect();
      document.removeEventListener('keydown', handleKeydown);
      clearDismissTimer();
    };
  });

  onDestroy(() => {
    clearDismissTimer();
  });
</script>

<div
  bind:this={toastElement}
  id="experience-reset-toast"
  class="experience-reset-toast"
  class:active={toastActive}
  class:error={isError}
  aria-hidden={toastActive ? 'false' : 'true'}
  aria-live={isError ? 'assertive' : 'polite'}
  role={isError ? 'alert' : 'status'}
  tabindex="0"
  onclick={dismiss}
  onkeydown={(e) => e.key === 'Enter' && dismiss()}
>
  <div class="experience-toast-content">
    <div id="experience-toast-title" class="experience-toast-title">{toastTitle}</div>
    <div id="experience-toast-copy" class="experience-toast-copy">{toastCopy}</div>
  </div>
  <button
    class="experience-toast-close"
    type="button"
    aria-label="Dismiss notification"
    onclick={handleCloseClick}
  >
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </button>
</div>

<style>
  .experience-reset-toast {
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%) translateY(1rem);
    z-index: var(--z-toast, 1200);
    max-width: min(90vw, 360px);
    padding: 0.6rem 0.75rem;
    background: rgba(7, 16, 24, 0.94);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(78, 205, 196, 0.22);
    border-radius: 0.5rem;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.35s ease, transform 0.35s ease;
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    cursor: pointer;
  }

  .experience-reset-toast.active {
    opacity: 1;
    pointer-events: auto;
    transform: translateX(-50%) translateY(0);
  }

  .experience-toast-content {
    flex: 1;
    min-width: 0;
  }

  .experience-toast-title {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    color: #4ecdc4;
    margin-bottom: 0.15rem;
  }

  .experience-toast-copy {
    font-size: 0.65rem;
    color: rgba(224, 240, 240, 0.7);
    line-height: 1.4;
    overflow-wrap: break-word;
  }

  /* Close button */
  .experience-toast-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    margin: 0;
    background: rgba(78, 205, 196, 0.1);
    border: 1px solid rgba(78, 205, 196, 0.2);
    border-radius: 4px;
    color: rgba(224, 240, 240, 0.5);
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .experience-toast-close:hover {
    background: rgba(78, 205, 196, 0.2);
    border-color: rgba(78, 205, 196, 0.4);
    color: #e0f0f0;
  }

  .experience-toast-close:focus-visible {
    outline: 2px solid rgba(78, 205, 196, 0.8);
    outline-offset: 1px;
  }

  /* Error variant */
  .experience-reset-toast.error {
    border-color: rgba(255, 107, 107, 0.35);
    background: rgba(30, 12, 12, 0.94);
  }
  .experience-reset-toast.error .experience-toast-title {
    color: #ff6b6b;
  }
  .experience-reset-toast.error .experience-toast-copy {
    color: rgba(255, 200, 200, 0.7);
  }
  .experience-reset-toast.error .experience-toast-close {
    background: rgba(255, 107, 107, 0.1);
    border-color: rgba(255, 107, 107, 0.2);
  }
  .experience-reset-toast.error .experience-toast-close:hover {
    background: rgba(255, 107, 107, 0.2);
    border-color: rgba(255, 107, 107, 0.4);
  }

  /* Reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .experience-reset-toast {
      transition: opacity 0.01s;
    }
  }
</style>
