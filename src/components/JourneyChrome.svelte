<!--
  @components/JourneyChrome.svelte — Journey UI overlay

  TODO: Port journey trail rendering from js/modules/journey.js
  TODO: Port walk breadcrumb from js/modules/journey-focus-ui.js
  TODO: Wire journey compass state from journey-compass-state.js
  TODO: Port neighbor rail rendering
-->
<script lang="ts">
  import { journeyState, journeyPhase, journeyTrail, journeyNeighbors, setJourneyPhase, setSelectedStop } from '@lib/stores/journey';
  import { navState, hasTrail, dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation';
  import { viewport } from '@lib/stores/viewport';

  interface Props {
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  let neighborIndex = $state(0);

  function navigateNeighbor(direction: 'prev' | 'next'): void {
    const neighbors = $journeyNeighbors;
    if (!neighbors.length) return;
    if (direction === 'prev' && neighborIndex > 0) {
      neighborIndex--;
    } else if (direction === 'next' && neighborIndex < neighbors.length - 1) {
      neighborIndex++;
    }
    const neighbor = neighbors[neighborIndex];
    if (neighbor) {
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, { index: neighbor.index, reason: neighbor.relationshipLabel });
    }
  }
</script>

{#if visible}
  <div class="journey-chrome" id="journey-chrome" aria-label="Journey navigation">
    <!-- Journey breadcrumb / trail -->
    {#if $hasTrail}
      <div class="journey-breadcrumb">
        {#each $journeyTrail as stop, i}
          <span class="breadcrumb-step" class:current={$navState.trailCursor === i}>
            <span class="step-index">{i + 1}</span>
            <span class="step-name">{stop.name}</span>
          </span>
          {#if i < $journeyTrail.length - 1}
            <span class="breadcrumb-separator" aria-hidden="true">&rarr;</span>
          {/if}
        {/each}
      </div>
    {/if}

    {#if $journeyNeighbors.length > 0}
      <div class="neighbor-rail" role="navigation" aria-label="Neighbor navigation">
        <button class="neighbor-btn" onclick={() => navigateNeighbor('prev')} disabled={neighborIndex <= 0} aria-label="Previous neighbor">
          &larr;
        </button>
        <span class="neighbor-info">
          {neighborIndex + 1} / {$journeyNeighbors.length}
          {#if $journeyNeighbors[neighborIndex]}
            <span class="neighbor-label">{$journeyNeighbors[neighborIndex]?.relationshipLabel}</span>
          {/if}
        </span>
        <button class="neighbor-btn" onclick={() => navigateNeighbor('next')} disabled={neighborIndex >= $journeyNeighbors.length - 1} aria-label="Next neighbor">
          &rarr;
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .journey-chrome {
    position: absolute;
    bottom: 4.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-journey-chrome);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    pointer-events: auto;
  }
  .journey-breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: rgba(7, 16, 24, 0.9);
    backdrop-filter: blur(10px);
    border-radius: 0.5rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.75rem;
    color: #b0d0d0;
  }
  .breadcrumb-step {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    opacity: 0.6;
  }
  .breadcrumb-step.current {
    opacity: 1;
    color: #4ecdc4;
    font-weight: 600;
  }
  .step-index {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    opacity: 0.5;
  }
  .breadcrumb-separator {
    opacity: 0.3;
    font-size: 0.7rem;
  }
  .neighbor-rail {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(7, 16, 24, 0.9);
    backdrop-filter: blur(10px);
    border-radius: 0.5rem;
    padding: 0.35rem 0.65rem;
  }
  .neighbor-btn {
    background: none;
    border: 1px solid rgba(78, 205, 196, 0.2);
    border-radius: 0.3rem;
    color: #4ecdc4;
    cursor: pointer;
    padding: 0.2rem 0.5rem;
    font-size: 0.7rem;
    transition: all 0.15s;
  }
  .neighbor-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .neighbor-btn:not(:disabled):hover {
    background: rgba(78, 205, 196, 0.1);
    border-color: rgba(78, 205, 196, 0.4);
  }
  .neighbor-info {
    font-size: 0.7rem;
    color: #b0d0d0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .neighbor-label {
    color: #4ecdc4;
    font-size: 0.65rem;
  }
</style>
