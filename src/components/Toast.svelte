<!--
  @components/Toast.svelte — Transient toast notification

  Subscribes to toastStore for reactive cross-component communication.
  Replaces the legacy body data-attribute MutationObserver bridge.

  Renders with DOM IDs matching the legacy contract (#experience-reset-toast,
  #experience-toast-title, #experience-toast-copy).

  Queue-aware (see @lib/stores/toast.svelte.ts): when a caller enqueues a
  toast while one is already visible, the new one waits behind it. The
  visible count "1 of N" hint lets the user know there are more to come,
  and a "Skip all" affordance clears the rest.

  Features:
    - Close button for manual dismissal (advances the queue)
    - Auto-dismiss driven by the store (info ~5s / warning ~6.5s / error ~8s)
    - Click-to-dismiss on toast body
    - Keyboard accessible (Escape to dismiss when focused)
    - Queue counter + "Skip all" when items are waiting
-->
<script lang="ts">
  import { toastStore, dismissToast, clearToastQueue } from '@lib/stores/toast.svelte';

  // eslint-disable-next-line no-empty-pattern -- empty $props() destructuring is the Svelte 5 idiom for "no props accepted"
  let {} = $props();

  // Auto-subscription: $toastStore mirrors the store and is reactive.
  const active = $derived($toastStore.active);
  const title = $derived($toastStore.title);
  const copy = $derived($toastStore.copy);
  const variant = $derived($toastStore.variant);
  const queueLength = $derived($toastStore.queueLength);
  const nextTitle = $derived($toastStore.nextTitle);
  const isError = $derived(variant === 'error');
  const isWarning = $derived(variant === 'warning');
  const hasQueue = $derived(queueLength > 0);
  const hasNextPreview = $derived(hasQueue && nextTitle.length > 0);

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && active) {
      e.preventDefault();
      dismissToast();
    }
  }

  function handleBodyClick(): void {
    dismissToast();
  }

  function handleCloseClick(e: MouseEvent): void {
    e.stopPropagation();
    dismissToast();
  }

  function handleSkipAllClick(e: MouseEvent): void {
    e.stopPropagation();
    clearToastQueue();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  id="experience-reset-toast"
  class="experience-reset-toast"
  class:active={active}
  class:error={isError}
  class:warning={isWarning}
  aria-hidden={active ? 'false' : 'true'}
  aria-live={isError ? 'assertive' : 'polite'}
  role={isError ? 'alert' : 'status'}
  tabindex="-1"
  onclick={handleBodyClick}
>
  <div class="experience-toast-content">
    <div id="experience-toast-title" class="experience-toast-title">{title}</div>
    <div id="experience-toast-copy" class="experience-toast-copy">{copy}</div>
    {#if hasQueue}
      <div class="experience-toast-queue" aria-live="polite">
        <span class="experience-toast-queue-count">+{queueLength} more</span>
        <button
          class="experience-toast-skip"
          type="button"
          aria-label={`Dismiss ${queueLength} queued notification${queueLength === 1 ? '' : 's'}`}
          onclick={handleSkipAllClick}
        >Skip all</button>
      </div>
      {#if hasNextPreview}
        <div class="experience-toast-next" data-testid="toast-next-preview">
          Next: <span class="experience-toast-next-title">{nextTitle}</span>
        </div>
      {/if}
    {/if}
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
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.22);
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
    color: var(--color-primary-alt);
    margin-bottom: 0.15rem;
  }

  .experience-toast-copy {
    font-size: 0.65rem;
    color: rgba(224, 240, 240, 0.85);
    line-height: 1.4;
    overflow-wrap: break-word;
  }

  /* Queue counter + Skip all */
  .experience-toast-queue {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.35rem;
    padding-top: 0.3rem;
    border-top: 1px solid rgba(var(--color-primary-alt-rgb), 0.12);
  }

  /* W49-A: "Next: <title>" preview so users know what's queued without
     having to dismiss the current toast to find out. The line is muted
     so it doesn't compete with the main title; contrast against the
     chrome bg is documented by the a11y-ok comment. */
  .experience-toast-next {
    font-size: 0.6rem;
    color: rgba(224, 240, 240, 0.85); /* a11y-ok: supplementary preview line — same as .experience-toast-queue-count */
    margin-top: 0.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .experience-toast-next-title {
    color: var(--color-text-teal-light);
    font-weight: 500;
  }

  .experience-toast-queue-count {
    font-size: 0.6rem;
    /* a11y-ok: queue-count badge is mono-cased supplementary text, not a primary label.
     * Adjacent aria-live live region announces the same content semantically. */
    color: rgba(224, 240, 240, 0.85); /* a11y-ok: supplementary count, aria-live announces content */
    letter-spacing: 0.02em;
  }

  .experience-toast-skip {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font-size: 0.6rem;
    font-family: inherit;
    color: var(--color-text-teal-light);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
    min-height: 0;
    min-width: auto;
  }

  .experience-toast-skip:hover {
    color: var(--color-primary-alt);
  }

  .experience-toast-skip:focus-visible {
    outline: 2px solid rgba(var(--color-primary-alt-rgb), 0.8);
    outline-offset: 1px;
  }

  /* Close button */
  .experience-toast-close {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    margin: 0;
    background: rgba(var(--color-primary-alt-rgb), 0.1);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.2);
    border-radius: 4px;
    color: rgba(224, 240, 240, 0.85); /* a11y-ok: icon-color — toast close button */
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .experience-toast-close:hover {
    background: rgba(var(--color-primary-alt-rgb), 0.2);
    border-color: rgba(var(--color-primary-alt-rgb), 0.4);
    color: var(--color-text-teal-light);
  }

  .experience-toast-close:focus-visible {
    outline: 2px solid rgba(var(--color-primary-alt-rgb), 0.8);
    outline-offset: 1px;
  }

  /* Warning variant */
  .experience-reset-toast.warning {
    border-color: rgba(255, 193, 7, 0.35);
    background: rgba(30, 24, 8, 0.94);
  }
  .experience-reset-toast.warning .experience-toast-title {
    color: #ffc107;
  }
  .experience-reset-toast.warning .experience-toast-copy {
    color: rgba(255, 224, 130, 0.85);
  }
  .experience-reset-toast.warning .experience-toast-close {
    background: rgba(255, 193, 7, 0.1);
    border-color: rgba(255, 193, 7, 0.2);
  }
  .experience-reset-toast.warning .experience-toast-close:hover {
    background: rgba(255, 193, 7, 0.2);
    border-color: rgba(255, 193, 7, 0.4);
  }

  /* Error variant */
  .experience-reset-toast.error {
    border-color: rgba(255, 107, 107, 0.35);
    background: rgba(30, 12, 12, 0.94);
  }
  .experience-reset-toast.error .experience-toast-title {
    color: var(--status-danger);
  }
  .experience-reset-toast.error .experience-toast-copy {
    color: rgba(255, 200, 200, 0.85);
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
