<!--
  @components/ModeChips.svelte — View mode selector
-->
<script lang="ts">
  import type { NavMode } from '@lib/types/state';
  import { currentMode, currentSurface, dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation.svelte';

  interface Props {
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

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

  function isActive(modeId: NavMode | 'map'): boolean {
    if (modeId === 'map') return currentSurface() === 'map';
    return currentMode() === modeId;
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
    } else if (modeId === 'map') {
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'map' });
    }
  }
</script>

{#if visible}
  <div class="mode-chips" id="mode-chips" role="radiogroup" aria-label="View mode">
    {#each modes as mode (mode.id)}
      <button
        class="mode-chip"
        class:active={isActive(mode.id)}
        role="radio"
        aria-checked={isActive(mode.id)}
        aria-label={mode.label}
        title={mode.description}
        onclick={() => selectMode(mode.id)}
      >
        <svg class="chip-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#{mode.iconId}"/></svg>
        <span class="chip-label" aria-hidden="true">{mode.label}</span>
      </button>
      {#if isActive(mode.id) && mode.description}
        <span class="chip-description">{mode.description}</span>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .mode-chips {
    position: absolute;
    top: 50%;
    right: 1rem;
    transform: translateY(-50%);
    z-index: var(--z-controls);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .mode-chip {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.6rem;
    background: rgba(7, 16, 24, 0.85);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(78, 205, 196, 0.15);
    border-radius: 0.4rem;
    color: #b0d0d0;
    cursor: pointer;
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.7rem;
    transition: all 0.2s;
    white-space: nowrap;
  }
  .mode-chip:hover {
    border-color: rgba(78, 205, 196, 0.4);
    color: #e0f0f0;
  }
  .mode-chip.active {
    background: rgba(78, 205, 196, 0.15);
    border-color: #4ecdc4;
    color: #4ecdc4;
    font-weight: 600;
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
  .chip-description {
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.55rem;
    color: rgba(176, 208, 208, 0.6);
    line-height: 1.3;
    padding: 0 0.3rem 0 1.3rem;
    max-width: 10rem;
    white-space: normal;
  }

  /* P1 #3 fix: at narrow viewports the long-label chips (OVERVIEW/SEARCH/
     FOCUS/INSIDE/MAP) overflow the viewport and clip MAP off the right
     edge. Condense to icon-only at <=480px to match the mobile-idle
     icon-condensed treatment. */
  @media (max-width: 480px) {
    .chip-label,
    .chip-description {
      display: none;
    }
    .mode-chip {
      padding: 0.4rem 0.55rem;
      gap: 0;
      min-width: 2.2rem;
      justify-content: center;
    }
    .chip-icon {
      display: block;
      width: 16px;
      height: 16px;
    }
  }
</style>
