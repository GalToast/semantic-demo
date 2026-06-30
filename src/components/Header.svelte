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
        </button>
      {/each}
    </div>

    {#if activeDescription && !$viewport.isCompact}
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
  .app-header {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: var(--z-controls);
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: linear-gradient(
      to bottom,
      rgba(7, 16, 24, 0.85) 0%,
      rgba(7, 16, 24, 0.5) 70%,
      transparent 100%
    );
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transition: opacity 0.2s;
    pointer-events: none;
  }
  .app-header > * {
    pointer-events: auto;
  }
  .app-header.utility-only {
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    justify-content: flex-end;
    padding: 0.25rem 0.5rem;
  }
  .app-header.compact {
    padding: 0.35rem 0.5rem;
    gap: 0.4rem;
  }
  /* W46-D6: hide brand text and shrink padding on mobile. The mode chips stay
     visible (icon-only); brand shrinks to "SE"; help/legend collapse to icons. */
  .header-brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .brand-mark {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--color-text-teal-light);
    letter-spacing: 0.08em;
  }
  .brand-label {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }
  .legend-toggle,
  .help-toggle {
    width: 1.6rem;
    height: 1.6rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(78, 205, 196, 0.06);
    border: 1px solid rgba(78, 205, 196, 0.15);
    border-radius: 0.3rem;
    color: rgba(176, 208, 208, 0.75);
    cursor: pointer;
    transition: all 0.15s;
  }
  .legend-toggle:hover,
  .help-toggle:hover {
    background: rgba(78, 205, 196, 0.15);
    color: var(--color-text-teal-light);
  }
  .legend-toggle.active {
    background: rgba(78, 205, 196, 0.25);
    color: var(--color-text-teal-light);
    border-color: rgba(78, 205, 196, 0.5);
  }
  .app-help-label {
    font-size: 0.7rem;
    margin-left: 0.25rem;
  }
  /* ── Mode chips ─────────────────────────────────────────────────────────── */
  .mode-chips {
    display: flex;
    gap: 0.35rem;
    align-items: center;
  }
  .mode-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.6rem;
    background: rgba(78, 205, 196, 0.06);
    border: 1px solid rgba(78, 205, 196, 0.18);
    border-radius: 999px;
    color: rgba(176, 208, 208, 0.85);
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    pointer-events: auto;
    outline: none;
  }
  .mode-chip:hover:not(:disabled) {
    background: rgba(78, 205, 196, 0.15);
    color: var(--color-text-teal-light);
    border-color: rgba(78, 205, 196, 0.4);
  }
  .mode-chip.active {
    background: rgba(78, 205, 196, 0.25);
    color: var(--color-text-teal-light);
    border-color: rgba(78, 205, 196, 0.5);
    box-shadow: 0 0 12px rgba(78, 205, 196, 0.18);
  }
  .mode-chip:focus-visible {
    outline: 2px solid var(--color-text-teal-light);
    outline-offset: 2px;
  }
  /* Selection-dependent modes (trail / focus / inside) are dimmed when no
     business is focused — proactively disabled (aria-disabled) rather than
     appearing active. Matches the lock guard in navigation.svelte.ts. */
  .mode-chip.is-locked {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .mode-chip.is-locked:hover {
    background: rgba(78, 205, 196, 0.06); /* same as base — no hover lift */
    border-color: rgba(78, 205, 196, 0.18);
    color: rgba(176, 208, 208, 0.85); /* same as base — no hover lighten */
    box-shadow: none;
  }
  .chip-icon {
    display: none; /* hidden on desktop by default */
    width: 0.9rem;
    height: 0.9rem;
  }
  .chip-label {
    white-space: nowrap;
  }
  .header-description {
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.6rem;
    color: rgba(176, 208, 208, 0.45); /* a11y-ok: caption-text — header description */
    line-height: 1.3;
    max-width: 16rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-left: auto;
  }

  /* ── Help dialog ─────────────────────────────────────────────────────────── */
  .help-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(7, 16, 24, 0.95);
    border: 1px solid rgba(78, 205, 196, 0.25);
    border-radius: 0.5rem;
    padding: 0;
    max-width: 28rem;
    width: 90vw;
    color: rgba(224, 240, 240, 0.9);
    box-shadow: 0 0 0 1px rgba(78, 205, 196, 0.1), 0 20px 60px rgba(0, 0, 0, 0.5);
  }
  .help-dialog::backdrop {
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
  }
  .help-dialog-inner {
    padding: 1.5rem;
  }
  .help-dialog-inner h3 {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-teal-light);
    margin: 0 0 0.5rem;
  }
  .help-dialog-inner p {
    font-size: 0.8rem;
    line-height: 1.5;
    color: rgba(224, 240, 240, 0.75);
    margin: 0 0 1rem;
  }
  .help-dialog-close {
    padding: 0.4rem 1rem;
    background: rgba(78, 205, 196, 0.12);
    border: 1px solid rgba(78, 205, 196, 0.3);
    border-radius: 0.3rem;
    color: var(--color-text-teal-light);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .help-dialog-close:hover {
    background: rgba(78, 205, 196, 0.2);
    border-color: rgba(78, 205, 196, 0.5);
  }

  @media (max-width: 768px) {
    .app-header {
      padding: 0.35rem 0.5rem;
      gap: 0.4rem;
    }
    .mode-chip .chip-label {
      display: none;
    }
    /* Mobile mode-chip label policy (W46-D4 polish):
       - Active chip: label visible so the user always knows which mode
         they're in (W46-D1 rationale). This is the most important
         orientation signal and survives in the limited mobile space.
       - Locked chips: icon-only. Locked status is communicated by the
         dimmed locked styling (`#mode-chips .mode-chip.is-locked` tint
         in the global rule above) and the enriched `title` attribute
         on each chip — long-press / hover surfaces the full mode
         description so users learn what each dimmed icon means.
       - Other chips: icon-only by default (`.mode-chip .chip-label`
         rule above sets `display: none`).

       Without this policy, adding labels to locked chips pushed the
       row to 387px (Map pushed off-screen at 390px viewport). Icons-
       only except active brings the row to 311px — fits in the 339px
       budget with 28px to spare. See `docs/svelte-css-pruning-quirk.md`
       for the related Svelte `:global()` workaround history. */
    .mode-chip.active .chip-label {
      display: inline;
      margin-left: 0.25rem;
    }
    .mode-chip .chip-icon {
      display: block;
    }
    .mode-chip {
      padding: 0.25rem;
      justify-content: center;
    }
    .mode-chip.active {
      padding: 0.25rem 0.5rem;
      gap: 0.3rem;
    }
  }
</style>
