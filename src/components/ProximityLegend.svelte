<!--
  @components/ProximityLegend.svelte — Dismissible proximity-legend overlay

  Teaches the core concept on first visit: dots close together do similar
  things. Uses localStorage flag so it only appears once per user.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { CLUSTER_COLORS } from '@lib/utils/design-tokens';
  import { CLUSTER_NAMES } from '@lib/utils/ui-presentation';


  const STORAGE_KEY = 'moco_onboarding_seen_v1';

  /** Mark onboarding as seen (exported for other components). */
  export function markOnboardingSeen(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ seen: true, seenAt: new Date().toISOString() }));
    } catch {
      /* storage full / private browsing – silently ignore */
    }
  }

  // Top-8 category swatches for the color key
  const SWATCH_COUNT = 8;
  const swatches = CLUSTER_NAMES.slice(0, SWATCH_COUNT).map((name, i) => ({
    name,
    color: CLUSTER_COLORS[i] ?? '#888'
  }));

  let dismissed = $state(false);
  let visible = $state(false);
  let reducedMotion = $state(false);

  onMount(() => {
    // Check localStorage
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.seen === true) {
          dismissed = true;
          return;
        }
      }
    } catch {
      /* corrupt data – allow showing */
    }

    // Check prefers-reduced-motion
    if (typeof window !== 'undefined') {
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // Show immediately (or after tiny delay for animation)
    if (reducedMotion) {
      visible = true;
    } else {
      // Small delay so the CSS animation plays
      setTimeout(() => { visible = true; }, 100);
    }
  });

  function handleDismiss(): void {
    dismissed = true;
    visible = false;
    markOnboardingSeen();
  }
</script>

{#if !dismissed && visible}
  <div
    class="proximity-legend-wrapper"
    aria-label="Proximity legend: dots close together do similar things"
    aria-live="polite"
  >
    <div class="proximity-legend-card">
      <button
        class="proximity-legend-dismiss"
        aria-label="Dismiss proximity legend"
        onclick={handleDismiss}
      >
        ×
      </button>
      <h2 class="proximity-legend-headline">
        Dots close together do similar things — not just those nearby.
      </h2>
      <p class="proximity-legend-sub">
        Colors = business categories. Click any dot to explore.
      </p>
      <div class="proximity-legend-swatches">
        {#each swatches as swatch}
          <span class="swatch-item">
            <span class="swatch-dot" style="background: {swatch.color}"></span>
            <span class="swatch-label">{swatch.name}</span>
          </span>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  @import '@lib/css/z-layers.css';

  .proximity-legend-wrapper {
    position: absolute;
    bottom: 16px;
    left: 16px;
    z-index: var(--z-overlay-floating, 102);
    pointer-events: none;
    transition: opacity 0.4s ease;
  }

  .proximity-legend-card {
    pointer-events: auto;
    background: rgba(7, 16, 24, 0.92);
    border: 1px solid rgba(78, 205, 196, 0.25);
    border-radius: 10px;
    padding: 14px 18px;
    max-width: 300px;
    color: #e0f0f0;
    font-family: 'Bricolage Grotesque', sans-serif;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    animation: slideUp 0.5s ease forwards;
    opacity: 0;
  }

  .proximity-legend-wrapper:not(.reduced-motion) .proximity-legend-card {
    animation: slideUp 0.5s ease forwards;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .proximity-legend-dismiss {
    position: absolute;
    top: 6px;
    right: 8px;
    background: none;
    border: none;
    color: rgba(224, 240, 240, 0.5);
    font-size: 1.3rem;
    cursor: pointer;
    padding: 2px 6px;
    line-height: 1;
    transition: color 0.2s;
  }

  .proximity-legend-dismiss:hover {
    color: #e0f0f0;
  }

  .proximity-legend-headline {
    margin: 0 0 4px 0;
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.3;
    color: #4ecdc4;
  }

  .proximity-legend-sub {
    margin: 0 0 10px 0;
    font-size: 0.8rem;
    color: rgba(224, 240, 240, 0.7);
  }

  .proximity-legend-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
  }

  .swatch-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.75rem;
    color: rgba(224, 240, 240, 0.8);
  }

  .swatch-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .swatch-label {
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .proximity-legend-card {
      animation: none;
      opacity: 1;
    }
  }
</style>
