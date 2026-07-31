<!--
  @components/MapSummary.svelte — Mini-map trail overlay

  Ported from:
 - (route trace rendering)
 - (neighborhood manifest)

  Renders a mini-map showing the current journey trail as connected nodes.
  Positioned in the bottom-left corner above the legend.
-->
<script lang="ts">
  import { journeyTrail } from '@lib/stores/journey.svelte.ts';
  import { hasTrail, focusedIndex } from '@lib/stores/navigation.svelte.ts';
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
    if (!getIsDataReady() || getBusinessRecords().length === 0) return `Stop ${idx}`;
    return getBusinessRecords()[idx]?.name ?? `Stop ${idx}`;
  }
</script>

{#if showMap}
  <div
    class="map-summary"
    id="map-trail"
    aria-labelledby="map-trail-title"
    role="region"
  >
    <h2 class="map-title" id="map-trail-title">Trail</h2>

    <svg
      class="map-svg"
      viewBox="0 0 164 70"
      role="img"
      aria-labelledby="map-trail-svg-title"
      aria-describedby="map-trail-desc"
    >
      <title id="map-trail-svg-title">Journey path</title>
      <desc id="map-trail-desc">
        {trail.length} stop{trail.length === 1 ? '' : 's'} on the current route.
        {#if currentIdx != null}Currently focused: stop {trail.findIndex((s) => s.index === currentIdx) + 1} of {trail.length}.{/if}
      </desc>

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
            stroke="rgba(var(--color-primary-alt-rgb), 0.3)"
            stroke-width="1.5"
            stroke-linecap="round"
            aria-hidden="true"
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
          fill={isCurrent ? 'var(--color-primary-alt)' : 'rgba(var(--color-primary-alt-rgb), 0.5)'}
          stroke={isCurrent ? '#fff' : 'none'}
          stroke-width={isCurrent ? 1 : 0}
          aria-hidden="true"
        />
      {/each}
    </svg>

    <!-- W48-I: replace role="img" + flat span list with role="region" + a
         proper ordered list (<ol>). Each <li> carries aria-current="step"
         so screen readers announce the focused stop, plus a stable
         step-position label. A separate <p aria-live="polite"> announces
         the current stop whenever the user navigates the trail. -->
    <p class="sr-only" id="map-trail-status" aria-live="polite" aria-atomic="true">
      {#if currentIdx != null && trail.length > 0}
        Now on step {trail.findIndex((s) => s.index === currentIdx) + 1} of {trail.length}: {getStopName(currentIdx)}.
      {/if}
    </p>
    <ol class="map-stops" aria-label="Journey stops">
      {#each trail as stop, i}
        {@const isCurrent = currentIdx === stop.index}
        <li
          class="map-stop"
          class:current={isCurrent}
          aria-current={isCurrent ? 'step' : undefined}
        >
          <span class="stop-num" aria-hidden="true">{i + 1}</span>
          <span class="stop-name">{getStopName(stop.index)}</span>
        </li>
      {/each}
    </ol>
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
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.12);
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
    color: rgba(var(--color-primary-alt-rgb), 0.6);
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
    color: rgba(176, 208, 208, 0.85); /* a11y-ok: caption-text — small map-stop label */
    line-height: 1.3;
  }
  .map-stop.current {
    color: var(--color-primary-alt);
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
