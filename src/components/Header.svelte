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
    currentSurface,
    dispatchNavTransition,
    NAV_TRANSITION_ACTIONS,
    navStore,
    type NavStoreApi
  } from '@lib/stores/navigation';
  import { viewport, isCompact } from '@lib/stores/viewport';
  import { legendOpen, toggleLegend } from '@lib/stores/legend.svelte';
  import { updateUrlState } from '@lib/orchestration/url-state';

  interface Props {
    /** Whether the header is visible */
    visible?: boolean;
  }

  let { visible = true }: Props = $props();

  /** Mode descriptions ported from lifecycle.js MODE_DESCRIPTIONS */
  const MODE_DESCRIPTIONS: Record<NavMode, string> = {
    overview: 'County-wide overview across all visible records.',
    search: 'Search results across all business records.',
    trail: 'Focused path of related business entities.',
    focus: 'Living records with high relationship potential.',
    inside: 'Immersive exploration of local neighborhoods.',
  };

  interface ModeOption {
    id: NavMode | 'map';
    label: string;
    description: string;
    icon: string;
  }

  const modes: ModeOption[] = [
    { id: 'overview', label: 'Overview', description: MODE_DESCRIPTIONS.overview, icon: 'M' },
    { id: 'search', label: 'Search', description: MODE_DESCRIPTIONS.search, icon: 'S' },
    { id: 'trail', label: 'Trail', description: MODE_DESCRIPTIONS.trail, icon: 'T' },
    { id: 'focus', label: 'Focus', description: MODE_DESCRIPTIONS.focus, icon: 'F' },
    { id: 'inside', label: 'Inside', description: MODE_DESCRIPTIONS.inside, icon: 'I' },
    { id: 'map', label: 'Map', description: 'Geographic map view of the county.', icon: 'G' }
  ];

  // Subscribe to navStore for reactive updates in Svelte 5 runes.
  // Using $derived with get() doesn't work for svelte/store writables.
  let activeMode = $state(currentMode());
  let activeSurface = $state(currentSurface());

  $effect(() => {
    const unsub = navStore.subscribe((s) => {
      activeMode = s.mode;
      activeSurface = s.surface;
    });
    return () => unsub();
  });

  function isActive(modeId: NavMode | 'map'): boolean {
    if (modeId === 'map') return activeSurface === 'map';
    return activeMode === modeId;
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
      // 'trail' is a valid NavMode but not in PanelSurface; cast to match the type
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'trail' as any });
    } else if (modeId === 'map') {
      // Map is a view-level switch (galaxy ↔ map), not just a surface change.
      // SET_VIEW updates currentView; SET_SURFACE sets surface='map' for
      // isActive('map') which checks $currentSurface.
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_VIEW, { view: 'map' });
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'map' });
    }
    // Sync URL after mode change so the browser bar reflects the new state
    try {
      updateUrlState({}, { reason: 'mode-switch' });
    } catch (e) {
      console.warn('Header.selectMode: URL update failed', e);
    }
  }

  /** Find the active mode description for the tooltip */
  let activeDescription = $derived.by(() => {
    const active = modes.find((m) => isActive(m.id));
    return active?.description ?? '';
  });
</script>

{#if visible}
  <header
    class="app-header"
    class:compact={$viewport.isCompact}
    id="app-header"
  >
    <div class="header-brand">
      <span class="brand-mark">SE</span>
      {#if !$viewport.isCompact}
        <span class="brand-label">Semantic Explorer</span>
      {/if}
      <button
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
    </div>

    <div
      class="mode-chips"
      id="mode-chips"
      role="radiogroup"
      aria-label="View mode"
    >
      {#each modes as mode (mode.id)}
        <button
          class="mode-chip"
          class:active={isActive(mode.id)}
          role="radio"
          aria-checked={isActive(mode.id)}
          title={mode.description}
          onclick={() => selectMode(mode.id)}
        >
          <span class="chip-icon">{mode.icon}</span>
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

  /* ── Legend toggle ─────────────────────────────────────────────────────── */
  .legend-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: none;
    border: 1px solid rgba(78, 205, 196, 0.15);
    border-radius: 0.25rem;
    color: #6a8a8a;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .legend-toggle:hover {
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
  .chip-icon {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    opacity: 0.7;
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
    .mode-chip {
      padding: 0.25rem;
    }
  }
</style>
