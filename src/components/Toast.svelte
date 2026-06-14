<!--
  @components/Toast.svelte — Transient toast notification

  Observes body data-toast-message + data-toast-state via MutationObserver
  (mirrors the bodyFocusPanelMode pattern in App.svelte).

  Renders with DOM IDs matching the legacy contract (#experience-reset-toast,
  #experience-toast-title, #experience-toast-copy) so the existing
  src/lib/ui/ui-feedback.ts showExperienceToast can also manipulate it
  during migration coexistence.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  let toastMessage = $state('');
  let toastActive = $state(false);
  let toastTitle = $derived(toastMessage.split('\n')[0] || '');
  let toastCopy = $derived(toastMessage.split('\n').slice(1).join('\n') || '');

  onMount(() => {
    if (typeof document === 'undefined' || !document.body) return;

    const sync = () => {
      const body = document.body;
      toastMessage = body.dataset.toastMessage || '';
      toastActive = body.dataset.toastState === 'active';
    };

    const obs = new MutationObserver(sync);
    obs.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-toast-message', 'data-toast-state'],
    });
    sync();

    return () => obs.disconnect();
  });
</script>

<div
  id="experience-reset-toast"
  class="experience-reset-toast"
  class:active={toastActive}
  aria-hidden={toastActive ? 'false' : 'true'}
  aria-live="polite"
  role="status"
>
  <div id="experience-toast-title" class="experience-toast-title">{toastTitle}</div>
  <div id="experience-toast-copy" class="experience-toast-copy">{toastCopy}</div>
</div>

<style>
  .experience-reset-toast {
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%) translateY(1rem);
    z-index: var(--z-toast, 1200);
    max-width: min(90vw, 360px);
    padding: 0.6rem 1rem;
    background: rgba(7, 16, 24, 0.94);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(78, 205, 196, 0.22);
    border-radius: 0.5rem;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.35s ease, transform 0.35s ease;
  }

  .experience-reset-toast.active {
    opacity: 1;
    pointer-events: auto;
    transform: translateX(-50%) translateY(0);
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
</style>
