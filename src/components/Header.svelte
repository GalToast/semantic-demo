<!--
  @components/Header.svelte — App header bar with mode chips

  Ported from:
 - (mode chip click handling)
 - (mode label rendering)

  Contains the mode chip rail and the app title.
  Sits above the canvas at the top of the viewport.
-->
<script lang="ts">
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
  import { modes } from '@lib/components/header/mode-constants';
  import {
    isModeLocked,
    isActive,
    getActiveIndexForMode,
    getActiveDescription,
    computeModeKeydown,
    indexForModeId,
    selectMode as applyModeSelect
  } from '@lib/components/header/mode-nav';

  interface Props {
    /** Whether the header is visible */
    visible?: boolean;
    /** Render only floating utility controls, without brand or mode chips */
    utilityOnly?: boolean;
  }

  let { visible = true, utilityOnly = false }: Props = $props();

  // Read directly from appState.navState (Svelte 5 rune-backed $state) — no mirror needed.
  let activeMode = $derived(appState.navState.mode ?? 'overview');
  let activeView = $derived(appState.navState.currentView ?? 'galaxy');
  let hasSelection = $derived(
    appState.navState.focusedIndex != null && Number.isFinite(appState.navState.focusedIndex as number)
  );
  let activeIndex = $derived(getActiveIndexForMode(activeMode, activeView));
  let activeDescription = $derived(getActiveDescription(activeMode, activeView));

  /** Roving tabindex: which chip currently has keyboard focus. Defaults to
   * the active-mode index; diverges after keyboard navigation. */
  let keyboardFocusIndex = $state<number>(0);

  /** Thin wrappers that close over the Svelte 5 derived values. These exist
   * because the module functions take hasSelection / activeMode / activeView
   * as explicit args (pure), while the Svelte template expects single-arg
   * chip-id calls. Mapping names so we don't shadow the imported `isModeLocked`
   * / `isActive`. */
  function isChipLocked(modeId: NavMode | 'map'): boolean {
    return isModeLocked(modeId, hasSelection);
  }
  function isChipActive(modeId: NavMode | 'map'): boolean {
    return isActive(modeId, activeMode, activeView);
  }

  function handleModeKeydown(e: KeyboardEvent): void {
    const result = computeModeKeydown(
      e.key,
      keyboardFocusIndex,
      (id) => isModeLocked(id, hasSelection)
    );
    if (result.kind === 'noop') return;
    e.preventDefault();
    keyboardFocusIndex = result.index;
    const target = modes[result.index];
    if (!target) return;
    const chip = document.querySelector<HTMLElement>(`.mode-chip[data-mode="${target.id}"]`);
    chip?.focus();
  }

  function handleModeFocusin(e: FocusEvent): void {
    const target = e.target as HTMLElement;
    if (!target?.classList.contains('mode-chip')) return;
    const idx = indexForModeId(target.getAttribute('data-mode'));
    if (idx >= 0) keyboardFocusIndex = idx;
  }

  function selectMode(modeId: NavMode | 'map'): void {
    const idx = applyModeSelect(modeId, hasSelection, {
      navActions: NAV_TRANSITION_ACTIONS,
      dispatchNavTransition: dispatchNavTransition as unknown as (
        action: unknown,
        payload?: Record<string, unknown>
      ) => unknown,
      updateUrlState: updateUrlState as unknown as (...args: unknown[]) => void,
      debugWarn: debugWarn as unknown as (...args: unknown[]) => void
    });
    if (idx >= 0) keyboardFocusIndex = idx;
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
  function toggleHelpDialog(): void {
    if (!helpDialog) return;
    if (helpDialog.open) {
      helpDialog.close();
    } else {
      helpDialog.showModal();
    }
  }
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
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="5.75" stroke="currentColor" stroke-width="1.25"/>
          <path d="M5.4 5.35a1.7 1.7 0 0 1 3.22.78c0 1.45-1.62 1.4-1.62 2.55" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          <circle cx="7" cy="10.55" r="0.55" fill="currentColor"/>
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

    <!-- A2-4: Mode chips are always rendered for accessibility. CSS controls visibility per state. -->
    <div
      class="mode-chips"
      id="mode-chips"
      role="radiogroup"
      aria-label="View mode"
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Control+1 Control+2 Control+3 Control+4 Control+5 Control+6"
      tabindex="-1"
      onkeydown={handleModeKeydown}
      onfocusin={handleModeFocusin}
    >
      {#each modes as mode (mode.id)}
        <button type="button"
          class="mode-chip"
          class:active={isChipActive(mode.id)}
          class:is-locked={isChipLocked(mode.id)}
          disabled={isChipLocked(mode.id)}
          aria-disabled={isChipLocked(mode.id)}
          role="radio"
          tabindex={isChipActive(mode.id) ? 0 : -1}
          aria-checked={isChipActive(mode.id)}
          aria-label={mode.label}
          title={isChipLocked(mode.id)
            ? `${mode.label}: ${mode.description} Select a business to unlock.`
            : mode.description}
          data-mode={mode.id}
          onclick={() => selectMode(mode.id)}
        >
          <svg class="chip-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#{mode.iconId}"/></svg>
          <span class="chip-label">{mode.label}</span>
          {#if isChipLocked(mode.id)}
            <!-- PR-D (2026-06-30): visible lock indicator on locked chips.
                 Previously the chip relied solely on dimmed opacity
                 (`.is-locked` at 0.35) and the title tooltip to convey
                 "this is locked". Users had to hover/long-press to
                 discover the lock. Inline a small SVG padlock that
                 matches the chip's icon styling so the lock is visible
                 at a glance on both desktop and mobile. -->
            <svg class="chip-lock" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="7" width="10" height="7" rx="1" />
              <path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7" />
            </svg>
          {/if}
        </button>
      {/each}
    </div>

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
    onclick={(e) => { if (e.target === helpDialog) toggleHelpDialog(); }}
  >
    <div class="help-dialog-inner">
      <h3 id="help-title">What is Semantic Explorer?</h3>
      <p id="help-desc">
        A 3D network of <strong>8,406 Montgomery County businesses</strong>.
        Dots close together do similar things — not just those nearby.
        Search, click, and discover connections by what a business does,
        not just where it is.
      </p>
      <button
        class="help-dialog-close"
        type="button"
        onclick={() => toggleHelpDialog()}
      >
        Got it
      </button>
    </div>
  </dialog>
{/if}

<style>
  @import '@lib/components/header/header.css';
</style>
