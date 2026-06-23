<!--
  @components/Header.svelte — App header bar with mode chips

  Ported from:
    - js/modules/bindings/mode.js (mode chip click handling)
    - js/modules/ui-renderers.js (mode label rendering)

  Contains the mode chip rail and the app title.
  Sits above the canvas at the top of the viewport.
-->
<script lang="ts">
  import type { NavMode } from '@lib/types/state';
  import {
    currentMode,
    currentView,
    dispatchNavTransition,
    NAV_TRANSITION_ACTIONS,
    navStore,
    type NavStoreApi
  } from '@lib/stores/navigation.svelte.ts';
  import { viewport, isCompact } from '@lib/stores/viewport.svelte.ts';
  import { legendOpen, toggleLegend } from '@lib/stores/legend.svelte';
  import { updateUrlState } from '@lib/orchestration/url-state';
  import { initKeyboardShortcutsHint, toggleKeyboardShortcutsHint } from '@lib/keyboard/keyboard-help';

  interface Props {
    /** Whether the header is visible */
    visible?: boolean;
    /** Render only floating utility controls, without brand or mode chips */
    utilityOnly?: boolean;
  }

  let { visible = true, utilityOnly = false }: Props = $props();

  /** Mode descriptions ported from lifecycle.js MODE_DESCRIPTIONS */
  const MODE_DESCRIPTIONS: Record<NavMode, string> = {
    overview: 'County-wide overview across all visible records.',
    search: 'Search results across all business records.',
    trail: 'Focused path of related business entities.',
    focus: 'Living records with high relationship potential.',
    inside: 'Immersive exploration of local neighborhoods.',
    map: 'Geographic map view of the county.',
    bridge: 'Transitioning between navigation states.'
  };

  interface ModeOption {
    id: NavMode | 'map';
    label: string;
    description: string;
    /** SVG sprite symbol id (e.g. 'icon-mycelium') */
    iconId: string;
  }

  const modes: ModeOption[] = [
    { id: 'overview', label: 'Overview', description: MODE_DESCRIPTIONS.overview, iconId: 'icon-mycelium' },
    { id: 'search', label: 'Search', description: MODE_DESCRIPTIONS.search, iconId: 'icon-search' },
    { id: 'trail', label: 'Trail', description: MODE_DESCRIPTIONS.trail, iconId: 'icon-trail-bloom' },
    { id: 'focus', label: 'Focus', description: MODE_DESCRIPTIONS.focus, iconId: 'icon-orbit' },
    { id: 'inside', label: 'Inside', description: MODE_DESCRIPTIONS.inside, iconId: 'icon-zoom-in' },
    { id: 'map', label: 'Map', description: 'Geographic map view of the county.', iconId: 'icon-map' }
  ];

  // Subscribe to navStore for reactive updates in Svelte 5 runes.
  // Using $derived with get() doesn't work for svelte/store writables.
  let activeMode = $state(currentMode());
  let activeView = $state(currentView());
  let activeIndex = $state(Math.max(0, modes.findIndex((m) => {
    if (m.id === 'map') return currentView() === 'map';
    return currentMode() === m.id;
  })));

  $effect(() => {
    const unsub = navStore.subscribe((s) => {
      activeMode = s.mode;
      activeView = s.currentView;
      // Keep roving tabindex index in sync with the active mode
      const idx = modes.findIndex((m) => {
        if (m.id === 'map') return s.currentView === 'map';
        return s.mode === m.id;
      });
      if (idx >= 0) activeIndex = idx;
    });
    return () => unsub();
  });

  function isActive(modeId: NavMode | 'map'): boolean {
    if (modeId === 'map') return activeView === 'map';
    return activeMode === modeId;
  }

  /** Roving tabindex keyboard handler for the mode-chip radiogroup */
  function handleModeKeydown(e: KeyboardEvent): void {
    let newIndex = activeIndex;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        newIndex = (activeIndex + 1) % modes.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        newIndex = (activeIndex - 1 + modes.length) % modes.length;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = modes.length - 1;
        break;
      default:
        return; // Let Enter/Space pass through to native button click behavior
    }

    activeIndex = newIndex;
    const target = modes[newIndex];
    if (!target) return;
    const chip = document.querySelector<HTMLElement>(`.mode-chip[data-mode="${target.id}"]`);
    chip?.focus();
  }

  /** Sync activeIndex when a chip receives focus (roving tabindex pattern) */
  function handleModeFocusin(e: FocusEvent): void {
    const target = e.target as HTMLElement;
    if (!target?.classList.contains('mode-chip')) return;
    const modeId = target.getAttribute('data-mode');
    if (!modeId) return;
    const idx = modes.findIndex((m) => m.id === modeId);
    if (idx >= 0) activeIndex = idx;
  }

  function selectMode(modeId: NavMode | 'map'): void {
    if (modeId === 'overview') {
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW);
    } else if (modeId === 'search') {
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'search' });
    } else if (modeId === 'focus') {
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'focus' });
    } else if (modeId === 'inside') {
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'inside' });
    } else if (modeId === 'trail') {
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'trail' });
    } else if (modeId === 'map') {
      // Map is a view-level switch (galaxy ↔ map), not just a surface change.
      // SET_VIEW updates currentView; SET_SURFACE preserves the map-family
      // surface for downstream panels that still read navState.surface.
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_VIEW, { view: 'map' });
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'map' });
    }
    // Sync URL after mode change so the browser bar reflects the new state
    try {
      updateUrlState({}, { reason: 'mode-switch' });
    } catch (e) {
      if (import.meta.env.DEV) console.warn('Header.selectMode: URL update failed', e);
    }
    // Keep roving tabindex index in sync with the selected mode
    const idx = modes.findIndex((m) => m.id === modeId);
    if (idx >= 0) activeIndex = idx;
  }

  /** Find the active mode description for the tooltip */
  let activeDescription = $derived.by(() => {
    const active = modes.find((m) => isActive(m.id));
    return active?.description ?? '';
  });

  function openKeyboardHelp(): void {
    try {
      initKeyboardShortcutsHint();
      toggleKeyboardShortcutsHint();
    } catch (error) {
      if (import.meta.env.DEV) console.warn('Header.openKeyboardHelp: keyboard help unavailable', error);
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
          class:active={isActive(mode.id)}
          role="radio"
          tabindex={isActive(mode.id) ? 0 : -1}
          aria-checked={isActive(mode.id)}
          aria-label={mode.label}
          title={mode.description}
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
    background: rgba(7, 16, 24, 0.75);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid rgba(78, 205, 196, 0.08);
  }
  .app-header.compact {
    padding: 0.4rem 0.5rem;
    gap: 0.5rem;
  }
  .app-header.utility-only,
  .header-brand.utility-only {
    display: contents;
  }

  /* ── Brand ─────────────────────────────────────────────────────────────── */
  .header-brand {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-shrink: 0;
  }
  .brand-mark {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    font-weight: 700;
    color: #4ecdc4;
    background: rgba(78, 205, 196, 0.12);
    border: 1px solid rgba(78, 205, 196, 0.25);
    border-radius: 0.25rem;
    padding: 0.15rem 0.35rem;
    letter-spacing: 0.05em;
  }
  .brand-label {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0f0f0;
    white-space: nowrap;
  }

  /* ── Utility toggles ───────────────────────────────────────────────────── */
  .legend-toggle,
  .help-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    background: none;
    border: 1px solid rgba(78, 205, 196, 0.15);
    border-radius: 0.25rem;
    color: #6a8a8a;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .legend-toggle:hover,
  .help-toggle:hover {
    color: #b0d0d0;
    border-color: rgba(78, 205, 196, 0.3);
    background: rgba(78, 205, 196, 0.06);
  }
  .legend-toggle.active {
    color: #4ecdc4;
    border-color: rgba(78, 205, 196, 0.4);
    background: rgba(78, 205, 196, 0.1);
  }

  /* ── Mode chips ────────────────────────────────────────────────────────── */
  .mode-chips {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .mode-chip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    padding: 0.3rem 0.5rem;
    min-width: 44px;
    min-height: 44px;
    background: none;
    border: 1px solid transparent;
    border-radius: 0.3rem;
    color: #6a8a8a;
    cursor: pointer;
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.7rem;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .mode-chip:hover {
    color: #b0d0d0;
    border-color: rgba(78, 205, 196, 0.15);
  }
  .mode-chip.active {
    background: rgba(78, 205, 196, 0.12);
    border-color: rgba(78, 205, 196, 0.4);
    color: #4ecdc4;
    font-weight: 600;
  }
  :global(#mode-chips .mode-chip.is-waiting) {
    opacity: 0.75;
    border-style: solid;
    border-color: rgba(255, 176, 30, 0.5);
    background: rgba(255, 176, 30, 0.08);
    color: rgba(255, 210, 130, 0.9);
    box-shadow: 0 0 0 1px rgba(255, 176, 30, 0.15);
  }
  :global(#mode-chips .mode-chip.is-locked) {
    background: rgba(78, 205, 196, 0.18);
    border-color: rgba(78, 205, 196, 0.55);
    color: rgba(201, 255, 248, 0.98);
    box-shadow:
      0 0 0 1px rgba(78, 205, 196, 0.25),
      0 0 12px rgba(78, 205, 196, 0.15);
  }
  :global(#mode-chips .mode-chip.is-locked .chip-label) {
    color: rgba(201, 255, 248, 1);
  }
  :global(#mode-chips .mode-chip:disabled) {
    cursor: not-allowed;
    opacity: 0.45;
    pointer-events: none;
  }
  .chip-icon {
    display: none;
    flex-shrink: 0;
    width: 16px;
    height: 16px;
  }
  .chip-label {
    font-size: 0.7rem;
  }

  /* ── Active description ────────────────────────────────────────────────── */
  .header-description {
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.6rem;
    color: rgba(176, 208, 208, 0.45);
    line-height: 1.3;
    max-width: 16rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-left: auto;
  }

  @media (max-width: 768px) {
    .app-header {
      padding: 0.35rem 0.5rem;
      gap: 0.4rem;
    }
    .mode-chip .chip-label {
      display: none;
    }
    .mode-chip .chip-icon {
      display: block;
    }
    .mode-chip {
      padding: 0.25rem;
      justify-content: center;
    }
  }
</style>
