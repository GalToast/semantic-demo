<!--
  @components/ProximityLegend.svelte — Dismissible proximity-legend overlay

  Teaches the core concept on first visit: dots close together do similar
  things. Uses localStorage flag so it only appears once per user.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { CLUSTER_COLORS } from '@lib/utils/design-tokens';
  import { CLUSTER_NAMES } from '@lib/utils/ui-presentation';
  import { DisposableRegistry } from '@lib/utils/disposable-registry';
  import { isDemoActive } from '@lib/stores/demo.svelte.ts';
  import { engineReady } from '@lib/stores/engine-ready.svelte';
  import { ONBOARDING_STORAGE_KEY, markOnboardingSeen } from '@lib/onboarding/onboarding-storage';

  // Top-8 category swatches for the color key
  const SWATCH_COUNT = 8;
  const swatches = CLUSTER_NAMES.slice(0, SWATCH_COUNT).map((name, i) => ({
    name,
    color: CLUSTER_COLORS[i] ?? '#888'
  }));

  const _registry = new DisposableRegistry({ label: 'ProximityLegend', warnAfterDispose: false });

  let dismissed = $state(false);
  let visible = $state(false);
  let reducedMotion = $state(false);

  /**
   * Reveal-helper. Centralizes the "show after animation delay" decision so
   * the on-mount path and the post-demo-deferral path stay in lockstep.
   */
  function reveal(): void {
    if (reducedMotion) {
      visible = true;
    } else {
      _registry.schedule(100, () => { visible = true; });
    }
    // W49b Punch 2: demote the proximity legend from pinned onboarding
    // overlay to peek/popover. Auto-dismiss after 10s if the user has not
    // closed it manually — the card stays available via btn-help if they
    // want to re-read it. Auto-dismiss fires from the reveal() call so it
    // does not stack with re-reveals after demo completion.
    _registry.schedule(10000, () => {
      if (!dismissed) {
        dismissed = true;
        visible = false;
      }
    });
  }

  onMount(() => {
    // Check localStorage
    try {
      const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
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

    // W52-UX: only reveal when the 3D engine is actually mounted. On
    // the mobile 2D cold-load Placeholder2D, the engine hasn't been
    // initiated yet — the legend teaching about "dots close together"
    // references content that doesn't exist (the splash shows colored
    // orbs, not the data points). Showing the legend there makes the
    // onboarding card feel unmoored from the surface the user can see.
    // Subscribe to engineReady so the card appears the moment the user
    // enters the 3D scene (clicking Enter 3D Scene) OR when it was
    // already ready (desktop auto-init / cached boot).
    //
    // If the demo is running at mount time (e.g. ?demo=force first-visit),
    // defer the legend until it settles — otherwise the legend competes
    // with the choreography overlay for the bottom-left corner during
    // OVERVIEW/SEARCH phases. The $effect below flips `visible` on
    // isDemoActive() false. Otherwise, show after the engine is ready.
    if (engineReady.value && !isDemoActive()) {
      reveal();
    } else if (!engineReady.value) {
      const unsub = engineReady.subscribe((ready) => {
        if (ready && !dismissed && !isDemoActive()) {
          unsub();
          reveal();
        }
      });
    }

    return () => {
      _registry.disposeAll();
    };
  });

  // Post-demo reveal: when the running demo ends (or a previously-running
  // demo was cancelled/finished), if the legend is still eligible AND the
  // engine has fired ready, show it. Re-runs whenever isDemoActive() or
  // engineReady.value change, so the legend inherits the mount-time
  // reduced-motion + 100ms-animation-delay discipline.
  //
  // W52-UX: the engineReady gate is REQUIRED here, not optional — without
  // it, the initial-render effect fires reveal() the moment isDemoActive()
  // returns false on the placeholder view, since the mount-time branch
  // returned early without subscribing (engine wasn't ready). The previous
  // version of this effect leaked the legend back onto the placeholder.
  $effect(() => {
    if (engineReady.value && !isDemoActive() && !dismissed && !visible) {
      reveal();
    }
  });

  function handleDismiss(): void {
    dismissed = true;
    visible = false;
    markOnboardingSeen();
  }
</script>

{#if !dismissed && visible && !isDemoActive()}
  <div
    class="proximity-legend-wrapper"
    aria-label="Proximity legend: dots close together do similar things"
    aria-live="polite"
  >
    <div class="proximity-legend-card">
      <button
        class="proximity-legend-dismiss"
        type="button"
        aria-label="Dismiss proximity legend"
        onclick={handleDismiss}
      ></button>
      <h2 class="proximity-legend-headline">
        Dots close together do similar things — not just those nearby.
      </h2>
      <p class="proximity-legend-sub">
        Colors = business categories. Click any dot to explore.
      </p>
      <div class="proximity-legend-swatches">
        {#each swatches as swatch}
          <span class="swatch-item">
            <span class="swatch-dot" style="background: {swatch.color}" aria-hidden="true"></span>
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
    border: 1px solid rgba(var(--color-primary-alt-rgb), 0.25);
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
    color: rgba(224, 240, 240, 0.6);
    font-size: 1.3rem;
    cursor: pointer;
    padding: 2px 6px;
    line-height: 1;
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
  }

  .proximity-legend-dismiss::before {
    content: '\00d7';
    font-size: 1.3rem;
    line-height: 1;
  }

  .proximity-legend-dismiss:hover {
    color: #e0f0f0;
  }

  .proximity-legend-headline {
    margin: 0 0 4px 0;
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.3;
    color: var(--color-primary-alt);
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
