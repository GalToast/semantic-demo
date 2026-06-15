<!--
  @components/MapSummary.svelte — Mini-map trail overlay

  Ported from:
    - js/modules/journey-route-trace.js (route trace rendering)
    - js/modules/journey-neighborhood.js (neighborhood manifest)

  Renders a mini-map showing the current journey trail as connected nodes.
  Positioned in the bottom-left corner above the legend.
-->
<script lang="ts">
  import { journeyTrail } from '@lib/stores/journey.svelte.ts';
  import { hasTrail, focusedIndex } from '@lib/stores/navigation';
  import { getBusinessRecords, getIsDataReady } from '@lib/stores/index.svelte.ts';
  import type { TrailStop } from '@lib/types/state';

  interface Props {
    /** Whether the mini-map is visible */
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  /** Map a trail stop to a display coordinate for the mini-map */
  function trailToPosition(stop: TrailStop, total: number, idx: number): { x: number; y: number } {
    // Spread stops evenly across the mini-map width with slight vertical variance
    const xPad = 12;
    const mapWidth = 140;
    const x = total <= 1
      ? mapWidth / 2 + xPad
      : xPad + (idx / (total - 1)) * mapWidth;
    // Use a sine wave for organic vertical spread
    const yOffset = Math.sin((idx / Math.max(1, total - 1)) * Math.PI) * 18;
    const y = 30 + yOffset;
    return { x, y };
  }

  let trail = $derived(journeyTrail());
  let showMap = $derived(visible && hasTrail() && trail.length > 0);
  let currentIdx = $derived(focusedIndex());

  function getStopName(idx: number): string {
    if (!getIsDataReady() || getBusinessRecords().length === 0) return `Node ${idx}`;
    return getBusinessRecords()[idx]?.name ?? `Node ${idx}`;
  }
</script>

{#if showMap}
  <div
    class="map-summary"
    id="map-trail"
    aria-label="Journey trail mini-map"
    role="img"
  >
    <span class="map-title">Trail</span>
    <svg class="map-svg" viewBox="0 0 164 70" aria-hidden="true">
      <!-- Connection lines -->
      {#each trail as stop, i}
        {#if i > 0}
          {@const prev = trailToPosition(trail[i - 1]!, trail.length, i - 1)}
          {@const curr = trailToPosition(stop, trail.length, i)}
          <line
            x1={prev.x}
            y1={prev.y}
            x2={curr.x}
            y2={curr.y}
            stroke="rgba(78, 205, 196, 0.3)"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        {/if}
      {/each}

      <!-- Node dots -->
      {#each trail as stop, i}
        {@const pos = trailToPosition(stop, trail.length, i)}
        {@const isCurrent = currentIdx === stop.index}
        <circle
          cx={pos.x}
          cy={pos.y}
          r={isCurrent ? 4 : 3}
          fill={isCurrent ? '#4ecdc4' : 'rgba(78, 205, 196, 0.5)'}
          stroke={isCurrent ? '#fff' : 'none'}
          stroke-width={isCurrent ? 1 : 0}
        />
      {/each}
    </svg>

    <div class="map-stops">
      {#each trail as stop, i}
        <span class="map-stop" class:current={currentIdx === stop.index}>
          <span class="stop-num">{i + 1}</span>
          <span class="stop-name">{getStopName(stop.index)}</span>
        </span>
      {/each}
    </div>
  </div>
{/if}

<style>
  .map-summary {
    position: absolute;
    bottom: 6rem;
    left: 1rem;
    z-index: var(--z-legend, 50);
    background: rgba(7, 16, 24, 0.88);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(78, 205, 196, 0.12);
    border-radius: 0.5rem;
    padding: 0.5rem;
    width: 180px;
    pointer-events: auto;
  }

  .map-title {
    display: block;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.6rem;
    font-weight: 600;
    color: rgba(78, 205, 196, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.3rem;
  }

  .map-svg {
    width: 100%;
    height: 70px;
  }

  .map-stops {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin-top: 0.3rem;
  }

  .map-stop {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.55rem;
    color: rgba(176, 208, 208, 0.5);
    line-height: 1.3;
  }
  .map-stop.current {
    color: #4ecdc4;
    font-weight: 600;
  }

  .stop-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.5rem;
    opacity: 0.5;
    flex-shrink: 0;
    width: 1rem;
  }

  .stop-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 768px) {
    .map-summary {
      display: none;
    }
  }
</style>
