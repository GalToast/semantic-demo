<!--
  @components/Header.svelte — App header bar with mode chips

  Ported from:
 - (mode chip click handling)
 - (mode label rendering)

  Contains the mode chip rail and the app title.
  Sits above the canvas at the top of the viewport.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { NavMode } from '@lib/types/state';
  import {
    dispatchNavTransition,
    NAV_TRANSITION_ACTIONS,
  } from '@lib/stores/navigation.svelte.ts';
  import { appState } from '@lib/state/app.svelte';
  import { viewport } from '@lib/stores/viewport.svelte.ts';
  import { legendOpen, toggleLegend } from '@lib/stores/legend.svelte';
  import { updateUrlState } from '@lib/orchestration/url-state';
  import { initKeyboardShortcutsHint, toggleKeyboardShortcutsHint } from '@lib/keyboard/keyboard-help';
  import { debugWarn } from '@lib/utils/debug'
  import { engineReady } from '@lib/stores/engine-ready.svelte';
  import { requestEntryFocus, isMeaningfulActiveElement, emitFocusLifecycleSignal } from '@lib/focus/focus-coordinator';
  import { modes } from '@lib/components/header/mode-constants';
  import { getActiveDescription, selectMode as applyModeSelect } from '@lib/components/header/mode-nav';
  import { executeJourneyCompassAction } from '@lib/orchestration/compass-controller';
  import ModeChipRail from '@lib/components/header/ModeChipRail.svelte';
  import { JOURNEY_ACTIONS } from '@lib/journey/compass-state';

  interface Props {
    /** Whether the header is visible */
    visible?: boolean;
    /** Render only floating utility controls, without brand or mode chips */
    utilityOnly?: boolean;
  }

  const ONBOARDING_STORAGE_KEY = 'moco_onboarding_seen_v1';

  /** Mark the first-visit onboarding as seen (shared with ProximityLegend). */
  function markOnboardingSeen(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        JSON.stringify({ seen: true, seenAt: new Date().toISOString() })
      );
    } catch {
      /* storage full / private browsing – silently ignore */
    }
  }

  let { visible = true, utilityOnly = false }: Props = $props();

  // Read directly from appState.navState (Svelte 5 rune-backed $state) — no mirror needed.
  let activeMode = $derived(appState.navState.mode ?? 'overview');
  let activeView = $derived(appState.navState.currentView ?? 'galaxy');
  let hasSelection = $derived(
    appState.navState.focusedIndex != null && Number.isFinite(appState.navState.focusedIndex as number)
  );
  let activeDescription = $derived(getActiveDescription(activeMode, activeView));

  function selectMode(modeId: NavMode | 'map'): void {
    applyModeSelect(modeId, hasSelection, {
      navActions: NAV_TRANSITION_ACTIONS,
      dispatchNavTransition: dispatchNavTransition as unknown as (
        _action: unknown,
        _payload?: Record<string, unknown>
      ) => unknown,
      updateUrlState: updateUrlState as unknown as (..._args: unknown[]) => void,
      debugWarn: debugWarn as unknown as (..._args: unknown[]) => void
    });
    // Bug 2 fix: selecting "Inside" must also engage the semantic-dive surface
    // (ENTRY_INSIDE). On desktop the journey-compass "Step Inside" button is
    // display:none, so this is the only path that reveals #focus-pocket there.
    // Roving tabindex (keyboardFocusIndex) now lives in ModeChipRail, set via
    // focusin before click fires, so nothing to harvest here.
    if (modeId === 'inside') {
      executeJourneyCompassAction(JOURNEY_ACTIONS.ENTER_INSIDE);
    }
  }

  function openKeyboardHelp(): void {
    try {
      initKeyboardShortcutsHint();
      toggleKeyboardShortcutsHint();
    } catch (error) {
      debugWarn('Header.openKeyboardHelp: keyboard help unavailable', error);
    }
  }

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

  function toggleHelpDialog(): void {
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

{#if visible}
  <header
    class="app-header"
    class:compact={$viewport.isCompact}
    class:utility-only={utilityOnly}
    id="app-header"
  >
    <div class="header-brand" class:utility-only={utilityOnly}>
      {#if !utilityOnly}
        <span class="brand-mark">SE</span>
        {#if !$viewport.isCompact}
          <span class="brand-label">Semantic Explorer</span>
        {/if}
      {/if}
      <button
        id="btn-legend"
        class="legend-toggle"
        class:active={$legendOpen}
        onclick={toggleLegend}
        type="button"
        aria-expanded={$legendOpen}
        aria-label={$legendOpen ? 'Close category legend' : 'Open category legend'}
        title={$legendOpen ? 'Close legend' : 'Open legend'}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="4" height="4" rx="1" fill="currentColor" opacity="0.6"/>
          <rect x="1" y="9" width="4" height="4" rx="1" fill="currentColor" opacity="0.6"/>
          <rect x="7" y="1" width="6" height="4" rx="1" fill="currentColor" opacity="0.6"/>
          <rect x="7" y="9" width="6" height="4" rx="1" fill="currentColor" opacity="0.6"/>
        </svg>
      </button>
      <button
        id="btn-keyboard-help"
        class="help-toggle"
        onclick={openKeyboardHelp}
        type="button"
        aria-label="Open keyboard shortcuts"
        title="Keyboard shortcuts"
      >
        <!-- 2026-07-03: replaced the prior `?`-in-a-circle glyph (which
             read identically to the Help button's `i`-in-a-circle next
             to it) with a Lucide-style keyboard silhouette so the two
             help affordances are visually distinct at a glance.
             aria-label/title are unchanged, so the existing
             #btn-keyboard-help tests (which key on the id and on the
             panel's `region[aria-label*="keyboard"|"shortcut"]`)
             continue to pass. -->
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M10 14h.01M14 14h.01M18 14h.01" />
          <path d="M7 18h10" />
        </svg>
      </button>
      <button
        id="btn-app-help"
        class="help-toggle app-help-toggle"
        onclick={toggleHelpDialog}
        type="button"
        aria-label="Help — What is Semantic Explorer?"
        title="Help — What is this?"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="5.75" stroke="currentColor" stroke-width="1.25"/>
          <circle cx="7" cy="4.8" r="0.7" fill="currentColor"/>
          <path d="M7 7v3.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
        </svg>
        {#if !$viewport.isCompact}
          <span class="app-help-label">Help</span>
        {/if}
      </button>
    </div>

    <!-- Mode chips radiogroup extracted to ModeChipRail.svelte (W52). Props
         mirror Header's derived nav values; selectMode is the single funnel. -->
    <ModeChipRail {modes} {activeMode} {hasSelection} {activeView} {selectMode} />

    {#if activeDescription && !$viewport.isCompact}
      <span class="header-description">{activeDescription}</span>
    {:else if activeDescription}
      <!-- PR-B (2026-06-30): show the mode description on mobile too.
           On mobile (compact viewport) the header chips + utility buttons
           already fill the row width, so the description wraps to its
           own row below the chips via `flex-wrap: wrap` + `flex-basis: 100%`
           in header.css. -->
      <span class="header-description">{activeDescription}</span>
    {/if}
  </header>

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
{/if}

<style>
  @import '@lib/components/header/header.css';
</style>
