<!--
  ModeChipRail.svelte — the mode-chip radiogroup, extracted from
  Header.svelte in W52.

  Owns roving tabindex (keyboardFocusIndex) and the keyboard/focusin
  handlers that move it. Header passes its local `selectMode` wrapper
  so selecting a chip still funnels through the single mode-switch path
  (`selectMode` from @lib/components/header/mode-nav) — ModeChipRail
  never calls updateUrlState / setJourneyPhase / updateNavState directly.
-->
<script lang="ts">
  import type { NavMode } from '@lib/types/state';
  import type { ModeOption } from '@lib/components/header/mode-constants';
  import {
    isModeLocked,
    isActive,
    computeModeKeydown,
    indexForModeId,
  } from '@lib/components/header/mode-nav';

  interface Props {
    /** Ordered mode-chip descriptors (Header owns the canonical `modes`). */
    modes: ModeOption[];
    /** Current navState.mode. */
    activeMode: NavMode;
    /** Whether a business is focused (drives selection-lock). */
    hasSelection: boolean;
    /** Current navState.currentView (drives `map` active state). */
    activeView: string;
    /** Header's local selectMode wrapper (the single mode-switch funnel). */
    selectMode: (_modeId: NavMode | 'map') => void;
  }

  let { modes, activeMode, hasSelection, activeView, selectMode }: Props = $props();

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
</script>

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
      aria-label={isChipLocked(mode.id)
        ? `${mode.label} — locked, select a business to unlock`
        : mode.label}
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
             discover the lock.
             2026-07-03: lock was at 11×11 / opacity 0.7, layered on a
             0.45 chip — net ~0.31 effective alpha — reading as
             broken. Bumped to 13×13, full opacity, and switched the
             stroke from `currentColor` (which inherits the dimmed
             chip color) to the warning palette so the lock reads as
             an amber status dot rather than a fading decoration.
             Filled the shackle so the icon is recognizable at glance
             and screen-reader/zoom users see a clear symbol. -->
        <svg class="chip-lock" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="7.5" width="10" height="6.5" rx="1" fill="currentColor" fill-opacity="0.25" />
          <path d="M5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5" fill="currentColor" fill-opacity="0.45" />
        </svg>
      {/if}
    </button>
  {/each}
</div>

<style>
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
      background: rgba(var(--color-primary-alt-rgb), 0.06);
      border: 1px solid rgba(var(--color-primary-alt-rgb), 0.18);
      border-radius: 999px;
      color: rgba(176, 208, 208, 0.85);
      font-family: var(--font-body);
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      pointer-events: auto;
      outline: none;
  }
  .mode-chip:hover:not(:disabled) {
      background: rgba(var(--color-primary-alt-rgb), 0.15);
      color: var(--color-text-teal-light);
      border-color: rgba(var(--color-primary-alt-rgb), 0.4);
  }
  .mode-chip.active {
      background: rgba(var(--color-primary-alt-rgb), 0.25);
      color: var(--color-text-teal-light);
      border-color: rgba(var(--color-primary-alt-rgb), 0.5);
      box-shadow: 0 0 12px rgba(var(--color-primary-alt-rgb), 0.18);
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
      background: rgba(var(--color-primary-alt-rgb), 0.06);
      border-color: rgba(var(--color-primary-alt-rgb), 0.18);
      color: rgba(176, 208, 208, 0.85);
      box-shadow: none;
  }
  .chip-icon {
      display: none; /* hidden on desktop by default */
      width: 0.9rem;
      height: 0.9rem;
  }
  .chip-lock {
      width: 0.8125rem;
      height: 0.8125rem;
      color: var(--status-warning);
      opacity: 1;
      flex-shrink: 0;
  }
  .chip-label {
      white-space: nowrap;
  }

  /* Mobile: tighten spacing */
  @media (max-width: 820px) {
      .mode-chips {
          gap: 0.25rem;
          overflow-x: auto;
          min-width: 0;
          scrollbar-width: none;
          -ms-overflow-style: none;
      }
      .mode-chips::-webkit-scrollbar {
          display: none;
      }
      .mode-chip {
          padding: 0.3rem 0.45rem;
          font-size: 0.7rem;
      }
  }

  @media (max-width: 768px) {
      .mode-chip .chip-label {
          display: none;
      }
      .mode-chip.active .chip-label {
          display: inline;
          margin-left: 0.25rem;
      }
      .mode-chip .chip-icon {
          display: block;
      }
      .mode-chip {
          padding: 0.6rem;
          justify-content: center;
      }
      .mode-chip.active {
          padding: 0.4rem 0.7rem;
          gap: 0.3rem;
      }
      .mode-chip {
          position: relative;
      }
      .mode-chip::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 44px;
          height: 44px;
          background: transparent;
      }
  }

  @media (max-width: 390px) {
      .mode-chips {
          gap: 0.2rem;
      }
  }
</style>
