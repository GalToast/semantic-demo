<!--
  HelpDialog.svelte — "What is this?" help <dialog>, extracted from
  Header.svelte (W52). Owns the <dialog> element, show/close, first-visit
  auto-open, close-on-search-intent document listeners, and entry-focus
  routing. The parent Header toggles it via the exported toggleHelpDialog()
  over bind:this. CSS comes from the shared header.css (@import below).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { engineReady } from '@lib/stores/engine-ready.svelte';
  import { viewport } from '@lib/stores/viewport.svelte.ts';
  import {
    requestEntryFocus,
    isMeaningfulActiveElement,
    emitFocusLifecycleSignal,
  } from '@lib/focus/focus-coordinator';
  import { ONBOARDING_STORAGE_KEY, markOnboardingSeen } from '@lib/onboarding/onboarding-storage';

  /** Show / hide the "What is this?" help dialog. */
  let helpDialog: HTMLDialogElement | undefined = $state();
  let helpDialogAutoOpened = $state(false);

  function openHelpDialog(): void {
    if (!helpDialog || helpDialog.open) return;
    helpDialog.showModal();
  }

  function closeHelpDialog(): void {
    if (!helpDialog || !helpDialog.open) return;
    helpDialog.close();
    markOnboardingSeen();
  }

  /** Toggled by #btn-app-help in the parent Header (called via bind:this). */
  export function toggleHelpDialog(): void {
    if (!helpDialog) return;
    if (helpDialog.open) {
      closeHelpDialog();
    } else {
      openHelpDialog();
    }
  }

  /**
   * W49-I: close the help dialog when the user wants to interact with the
   * search surface. The dialog's `showModal()` backdrop sits in the browser
   * top-layer and absorbs all pointer events, which blocked search input
   * clicks AND programmatic .focus() calls from keyboard shortcuts. So we
   * hook focusin (capture phase) at the document level — when focus moves
   * into the search bar regardless of source, close the dialog first.
   *
   * Also close on `/` (the global search shortcut) so users who press `/`
   * while reading the dialog don't have to dismiss twice.
   *
   * The click outside handler (e.target === helpDialog) still fires for
   * explicit backdrop dismissals; the existing Escape handler still fires.
   *
   * W48-UX bugfix: the previous implementation closed on ANY focusin event,
   * including the focus that showModal() itself moves into the dialog. That
   * made the `?` button reopen a no-op (open → focusin → close in one frame).
   * Now we only close when the new focus target is OUTSIDE the dialog. The
   * dialog's own showModal()-driven focusin is inside the dialog and is
   * ignored, so `?` re-opens cleanly.
   */
  function handleSearchSurfaceFocus(e: FocusEvent): void {
    if (!helpDialog?.open) return;
    // Skip focus events that originate from inside the dialog itself —
    // showModal() moves focus into the dialog and that focusin must not
    // immediately re-close the dialog we just opened.
    const target = e.target;
    if (target instanceof Node && helpDialog.contains(target)) return;
    closeHelpDialog();
  }

  function handleSearchSurfaceKeydown(e: KeyboardEvent): void {
    if (!helpDialog?.open) return;
    // Closing on / is explicit: user is signalling search intent.
    // Letters / numbers / Backspace / Delete / ArrowKeys also imply
    // "I'm typing, not reading this dialog" — close on any char key
    // when the dialog is open. Don't close on modifier-only keys.
    if (
      e.key === '/' ||
      e.key === 'Backspace' ||
      e.key === 'Delete' ||
      (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey)
    ) {
      closeHelpDialog();
    }
  }

  /**
   * pointerdown (capture) closes the dialog when ANY non-dialog element is
   * pressed. The existing dialog onclick handler covers clicks on the
   * backdrop element itself, but synthesized Playwright pointer events
   * bypass dialog markup and target child elements directly. Closing on
   * pointerdown at document level lets the synthetic click reach the
   * intended target on the second frame.
   *
   * Ignore pointerdown inside the open dialog itself so the close-button
   * and the backdrop click still work as before.
   */
  function handleSearchSurfacePointerdown(e: PointerEvent): void {
    if (!helpDialog?.open) return;
    if (!(e.target instanceof Node)) return;
    if (helpDialog.contains(e.target)) return;
    closeHelpDialog();
  }

  onMount(() => {
    // Capture phase so we fire BEFORE the modal-restoring focus handlers.
    document.addEventListener('focusin', handleSearchSurfaceFocus, true);
    document.addEventListener('keydown', handleSearchSurfaceKeydown, true);
    document.addEventListener('pointerdown', handleSearchSurfacePointerdown, true);
    return () => {
      document.removeEventListener('focusin', handleSearchSurfaceFocus, true);
      document.removeEventListener('keydown', handleSearchSurfaceKeydown, true);
      document.removeEventListener('pointerdown', handleSearchSurfacePointerdown, true);
    };
  });

  /**
   * W52-UX: auto-open the help dialog on first visit once the 3D scene is
   * ready. The small ? icon is hard to discover; surfacing the core concept
   * ("dots close together do similar things") immediately after the user
   * enters the scene prevents stranded users. Shares the same localStorage
   * first-visit flag as ProximityLegend so we don't spam returning users.
   */
  $effect(() => {
    if (engineReady.value && helpDialog && !helpDialogAutoOpened && !$viewport.isCompact) {
      try {
        const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
        if (!raw) {
          helpDialog.showModal();
        }
      } catch {
        /* storage unavailable – silently skip */
      } finally {
        helpDialogAutoOpened = true;
      }
    }
  });

  /**
   * W50-A11y: when the help dialog closes, route entry-point focus through
   * the focus coordinator (single owner of document.activeElement transitions).
   * Attached here — where `helpDialog` is bound via `bind:this` — so it
   * depends on the dialog's reactive existence.
   */
  $effect(() => {
    if (!helpDialog) return;
    const dialog = helpDialog;
    const onHelpDialogClose = () => {
      emitFocusLifecycleSignal('dialog-close');
      requestEntryFocus('#search-input', { signal: 'dialog-close' });
    };
    dialog.addEventListener('close', onHelpDialogClose);
    return () => dialog.removeEventListener('close', onHelpDialogClose);
  });

  /**
   * W50-A11y (mobile): the help-dialog auto-open above is gated to desktop
   * (!$viewport.isCompact), so on mobile the dialog never opens and the
   * close-handler focus path never fires — mobile screen-reader users strand
   * at <body> with no focus target after dismissing the splash. Route through
   * the focus coordinator once the 3D scene is ready.
   */
  $effect(() => {
    if (!engineReady.value || !$viewport.isCompact) return;
    if (helpDialog?.open) return;
    if (isMeaningfulActiveElement()) return;
    emitFocusLifecycleSignal('scene-ready');
    requestEntryFocus('#search-input', { signal: 'scene-ready' });
  });
</script>

<dialog
  bind:this={helpDialog}
  class="help-dialog"
  aria-labelledby="help-title"
  aria-describedby="help-desc"
  onclick={(e) => { if (e.target === helpDialog) closeHelpDialog(); }}
  onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closeHelpDialog(); } }}
>
  <div class="help-dialog-inner">
    <h3 id="help-title">Explore Montgomery County businesses visually</h3>
    <p id="help-desc">
      All <strong>8,406 local businesses</strong> are shown as a 3D network.
      Businesses that offer similar services sit close together, so you can
      find <em>connections by what a business does</em>, not just where it is.
    </p>
    <ul class="help-dialog-steps" aria-label="Quick start steps">
      <li><strong>Search</strong> for a service like "coffee" or "HVAC".</li>
      <li><strong>Click</strong> any business to see details and reviews.</li>
      <li>Use <kbd>arrow keys</kbd> or <strong>drag</strong> to explore nearby neighbors.</li>
    </ul>
    <p class="help-dialog-hint">
      Press <kbd aria-label="Question mark">?</kbd> anytime for keyboard shortcuts.
    </p>
    <button
      class="help-dialog-close"
      type="button"
      onclick={() => closeHelpDialog()}
    >
      Got it
    </button>
  </div>
</dialog>

<style>
  @import '@lib/components/header/header.css';
</style>
