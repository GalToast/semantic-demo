<!--
  @components/ThreadInspector.svelte — Connection inspector
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    focusStore,
    clearThreadInspector
  } from '@lib/stores/focus.svelte';
  import type { FocusStoreState } from '@lib/stores/focus.svelte';
  import ThreadInspectorPanel from '@lib/components/journey/ThreadInspectorPanel.svelte';

  interface Props {
    visible?: boolean;
  }

  let { visible = false }: Props = $props();
  let focusSnapshot = $state<FocusStoreState>(focusStore());
  let bodyThreadInspectSurface = $state('idle');
  let bodyStrandJourney = $state('idle');

  function removeLegacyInspectorDuplicates(): void {
    if (typeof document === 'undefined') return;
    for (const legacyInspector of document.querySelectorAll<HTMLElement>('#focus-thread-inspector')) {
      if (!legacyInspector.closest('#thread-inspector')) legacyInspector.remove();
    }
  }

  onMount(removeLegacyInspectorDuplicates);

  $effect(() => {
    if (!visible || !focusSnapshot.threadInspector.active) return;
    void tick().then(removeLegacyInspectorDuplicates);
  });

  $effect(() => {
    const unsubscribe = focusStore.subscribe((next) => {
      focusSnapshot = next;
    });
    return unsubscribe;
  });

  $effect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => {
      bodyThreadInspectSurface = document.body?.dataset.threadInspectSurface || 'idle';
      bodyStrandJourney = document.body?.dataset.strandJourney || 'idle';
    };
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-thread-inspect-surface', 'data-strand-journey'] });
    sync();
    return () => obs.disconnect();
  });

  // ── Escape key to close inspector ───────────────────────────────────────────
  // T1: a global keydown listener (active only while the inspector is
  // visible + active) so users can close the panel with the Escape key
  // without first moving focus into the panel. The listener is removed
  // on inspector hide/unmount, so it doesn't leak when the panel isn't
  // open. Cancel the event so any outer handler doesn't double-handle.
  $effect(() => {
    if (!visible || !focusSnapshot.threadInspector.active) return;
    const handleKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        clearThreadInspector();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  // ── Initial focus + focus restoration ──────────────────────────────────────────
  // T3: when the inspector opens, move focus to the close button (the
  // canonical 'first focusable' for a modal-like panel). This anchors
  // keyboard navigation in the panel — Tab/Shift+Tab will then cycle
  // through the buttons within the panel because `.thread-inspector`
  // is in the focus-trap selector set. When the inspector closes,
  // restore focus to whichever element triggered the open
  // (typically a thread-neighbor pill in the focus rail), so the
  // keyboard user lands back where they were.
  let previouslyFocused: HTMLElement | null = null;
  $effect(() => {
    const isOpen = visible && focusSnapshot.threadInspector.active;
    if (isOpen) {
      if (typeof document !== 'undefined' && previouslyFocused === null) {
        previouslyFocused = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      }
      // Move focus to the close button on the next tick so the
      // DOM has settled (the inspector just mounted)
      void tick().then(() => {
        const closeBtn = document.querySelector<HTMLElement>('.thread-inspector .inspector-close');
        if (closeBtn) closeBtn.focus();
      });
    } else if (previouslyFocused && typeof document !== 'undefined') {
      // Inspector closed — restore focus to the trigger element
      // (if still in the DOM and focusable). Guard with try/catch
      // because focus() on a detached element throws.
      try {
        previouslyFocused.focus();
      } catch {
        // ignore — element may have been removed
      }
      previouslyFocused = null;
    }
  });
</script>

{#if visible}
  <div
    class="thread-inspector"
    class:thread-inspector--empty={!focusSnapshot.threadInspector.active}
    id="thread-inspector"
    aria-label="Connection inspector"
    role="complementary"
    aria-live="polite"
    onpointerdown={(e) => e.stopPropagation()}
    onwheel={(e) => e.stopPropagation()}
    ondblclick={(e) => e.stopPropagation()}
  >
    <ThreadInspectorPanel
      {focusSnapshot}
      {bodyThreadInspectSurface}
      {bodyStrandJourney}
    />
  </div>
{/if}

<style>
  .thread-inspector {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: var(--z-compass);
    background: rgba(var(--color-surface-chrome-rgb), 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.2);
    border-radius: var(--radius-tight);
    padding: 0.6rem 0.75rem;
    max-width: 260px;
    pointer-events: auto;
  }
  .thread-inspector--empty {
    opacity: 0.7;
    border-style: dashed;
    border-color: rgba(var(--color-primary-alt-rgb), 0.14);
  }
</style>
