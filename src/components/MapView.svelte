<!--
  @components/MapView.svelte - Leaflet map view chrome

  The real map is owned by #map-container in Canvas.svelte and the Leaflet
  lifecycle in @lib/engine/map-state.ts. This component mounts only while the
  Svelte nav view is "map"; it activates the shared view controller, initializes
  Leaflet, and renders lightweight controls above the tile surface.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation.svelte.ts';
  import { viewport } from '@lib/stores/viewport.svelte.ts';
  import { switchView } from '@lib/orchestration/view-controller';
  import { appState } from '@lib/state/app.svelte';
  import { withStateMutation } from '@lib/state/with-state-mutation';
  import { debugWarn } from '@lib/utils/debug'
  import { DisposableRegistry } from '@lib/utils/disposable-registry'
  import { friendlyErrorMessage } from '@lib/utils/error-messages'
  import {
    centerMapOnRouteAnchor,
    initMap,
    initMapStateSubscriptions,
    refreshMapMarkers,
    refreshMapRouteEmbodiment
  } from '@lib/engine/map-state';

  /**
   * Leaflet's invalidateSize signature isn't visible from appState.map's
   * loose Record<string, unknown> type. Mirrors the structural-typing
   * pattern in @lib/engine/map-state.ts (LeafletMapWithFitBounds).
   */
  interface LeafletMapWithInvalidateSize {
    invalidateSize?: () => void
  }

  type MapStatus = 'loading' | 'ready' | 'error';

  // eslint-disable-next-line no-empty-pattern -- empty $props() destructuring is the Svelte 5 idiom for "no props accepted"
  let {} = $props();

  const _registry = new DisposableRegistry({ label: 'MapView', warnAfterDispose: false });

  let status = $state<MapStatus>('loading');
  // W48-H: statusDetail surfaces the map-load state. We hold a separate
  // rawError so the error state can be normalized through friendlyErrorMessage
  // — Leaflet/Cloudflare failures produce technical messages like
  // "Failed to fetch" or HTML error pages that are incomprehensible to
  // users. The friendly title + detail are derived from rawError.
  let statusDetail = $state('Loading county terrain');
  let rawError: unknown = $state(null);
  let friendlyMapError = $derived(status === 'error' ? friendlyErrorMessage(rawError) : null);
  let mounted = false;
  let activationToken = 0;

  function activateMapShell(): void {
    // Ensure the map container exists — Canvas.svelte may not be loaded yet
    // when MapView mounts (e.g., Playwright contract tests preload MapView
    // but Canvas is gated on engineReady.value).
    let mapContainer = document.getElementById('map-container');
    if (!mapContainer) {
      mapContainer = document.createElement('div');
      mapContainer.id = 'map-container';
      mapContainer.className = 'map-container';
      mapContainer.setAttribute('aria-hidden', 'true');
      mapContainer.dataset.activeView = 'idle';
      const semanticExplorer = document.getElementById('semantic-explorer');
      if (semanticExplorer) {
        semanticExplorer.insertBefore(mapContainer, semanticExplorer.firstChild);
      } else {
        document.body.appendChild(mapContainer);
      }
    }
    mapContainer.classList.add('active');
    mapContainer.classList.remove('arriving');
    mapContainer.setAttribute('aria-hidden', 'false');
    mapContainer.dataset.activeView = 'map';
    mapContainer.style.removeProperty('opacity');
    mapContainer.style.removeProperty('pointer-events');
  }

  /**
   * Set `appState.currentView` directly, bypassing the nav-store/url-sync/
   * handoff prelude that `switchView()` triggers. Used during initial mount
   * (where the nav store may not be initialized yet) and on canvas re-show
   * (where we just want to flip `currentView` without animation/sync overhead).
   *
   * Direct assignment is type-safe: `view: 'galaxy' | 'map'` is a subset of
   * `ViewName` ('galaxy' | 'map' | 'focus' | 'trail' | 'semantic'), so TS
   * accepts the write without any cast. The previous `as unknown as RuntimeState`
   * cast was dishonest — it widened `currentView` from a 5-value union to
   * `string` via a locally-fabricated `RuntimeState` interface, hiding the
   * type contract and bypassing the `withStateMutation()` guard semantics.
   */
  function setLegacyView(view: 'galaxy' | 'map'): void {
    withStateMutation(() => {
      appState.currentView = view;
    });
  }

  function deactivateMapShell(): void {
    const mapContainer = document.getElementById('map-container');
    if (mapContainer) {
      mapContainer.classList.remove('active', 'arriving');
      mapContainer.setAttribute('aria-hidden', 'true');
      mapContainer.dataset.activeView = 'idle';
    }

    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) {
      canvasContainer.classList.remove('hidden');
    }

    setLegacyView('galaxy');
  }

  async function activateLeafletMap(): Promise<void> {
    const token = ++activationToken;
    status = 'loading';
    statusDetail = 'Loading county terrain';

    try {
      await tick();
      if (!mounted || token !== activationToken) return;

      activateMapShell();

      if (!mounted || token !== activationToken) return;

      setLegacyView('map');

      initMapStateSubscriptions();
      await initMap();

      if (!mounted || token !== activationToken) return;

      refreshMapMarkers();
      refreshMapRouteEmbodiment();
      centerMapOnRouteAnchor();

      requestAnimationFrame(() => {
        const map = appState.map as unknown as LeafletMapWithInvalidateSize | undefined;
        map?.invalidateSize?.();
        _registry.schedule(120, () => map?.invalidateSize?.());
      });

      status = 'ready';
      statusDetail = 'County terrain active';
    } catch (error) {
      debugWarn('MapView Leaflet activation failed:', error);
      status = 'error';
      rawError = error;
      statusDetail = error instanceof Error ? error.message : 'Map failed to load';
    }
  }

  function returnToOverview(): void {
    activationToken += 1;
    switchView('galaxy', {
      skipUrlSync: true,
      silentHandoff: true,
    });
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW);
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'idle' });
  }

  onMount(() => {
    mounted = true;
    void activateLeafletMap();

    return () => {
      mounted = false;
      activationToken += 1;
      deactivateMapShell();
      _registry.disposeAll();
    };
  });
</script>

<section
  class="map-view"
  class:is-compact={$viewport.isCompact}
  class:is-loading={status === 'loading'}
  class:is-error={status === 'error'}
  role="application"
  aria-label="Interactive business map of Montgomery County"
>
  <header class="map-view-header">
    <div class="map-view-kicker">MAP | MONTGOMERY COUNTY</div>
    <h2 class="map-view-title">County terrain</h2>
  </header>

  {#if status === 'loading'}
    <div class="map-shimmer" aria-hidden="true">
      <div class="shimmer-row"></div>
      <div class="shimmer-row short"></div>
      <div class="shimmer-row medium"></div>
    </div>
  {/if}

  {#if !(status === 'ready')}
    <div class="map-status" class:is-error={status === 'error'} role="status" aria-live="polite">
      <span class="map-status-dot" aria-hidden="true"></span>
      {#if status === 'error' && friendlyMapError}
        <div class="map-status-text">
          <strong>{friendlyMapError.title}</strong>
          {#if friendlyMapError.detail}<div class="map-status-detail">{friendlyMapError.detail}</div>{/if}
          {#if friendlyMapError.technical}
            <details class="map-status-technical">
              <summary>Technical details</summary>
              <code>{friendlyMapError.technical}</code>
            </details>
          {/if}
        </div>
        <button class="map-retry-btn" type="button" onclick={activateLeafletMap}>Retry</button>
      {:else}
        <span>{statusDetail}</span>
      {/if}
    </div>
  {/if}

  <footer class="map-view-footer">
    <button
      class="map-back-btn"
      type="button"
      onclick={returnToOverview}
      aria-label="Return to overview"
    >
      Overview
    </button>
    <span class="map-attribution">OpenStreetMap | CARTO</span>
  </footer>
</section>

<style>
  .map-view {
    position: absolute;
    inset: 0;
    z-index: var(--z-overlay-100, 50);
    pointer-events: none;
    color: #e7f7f2;
    font-family: 'Nunito Sans', system-ui, sans-serif;
  }

  .map-view::before,
  .map-view::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    pointer-events: none;
  }

  .map-view::before {
    top: 0;
    height: 140px;
    background: linear-gradient(180deg, rgba(4, 9, 12, 0.74), rgba(4, 9, 12, 0));
  }

  .map-view::after {
    bottom: 0;
    height: 132px;
    background: linear-gradient(0deg, rgba(4, 9, 12, 0.7), rgba(4, 9, 12, 0));
  }

  .map-view-header,
  .map-view-footer,
  .map-status {
    position: absolute;
    pointer-events: auto;
    z-index: var(--z-controls, 1);
  }

  .map-view-header {
    top: calc(24px + env(safe-area-inset-top, 0px));
    left: 24px;
    display: grid;
    gap: 6px;
    max-width: min(420px, calc(100vw - 48px));
  }

  .map-view-kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: rgba(126, 231, 219, 0.9);
  }

  .map-view-title {
    margin: 0;
    font-family: 'Bricolage Grotesque', 'Nunito Sans', sans-serif;
    font-size: clamp(1.25rem, 2.4vw, 2rem);
    font-weight: 650;
    letter-spacing: 0;
    color: #f5fff9;
    text-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
  }

  .map-status {
    left: 50%;
    top: 50%;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    max-width: min(420px, calc(100vw - 32px));
    padding: 10px 14px;
    border: 1px solid rgba(126, 231, 219, 0.22);
    border-radius: 8px;
    background: rgba(7, 16, 24, 0.82);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
    transform: translate(-50%, -50%);
    color: rgba(238, 255, 251, 0.9);
    font-size: 0.86rem;
    font-weight: 700;
    backdrop-filter: blur(20px) saturate(150%);
  }

  .map-status.is-error {
    border-color: rgba(255, 151, 107, 0.38);
    color: #ffe1d1;
  }

  .map-status-dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: #7ee7db;
    box-shadow: 0 0 18px rgba(126, 231, 219, 0.9);
    animation: mapStatusPulse 1.3s ease-in-out infinite;
  }

  .map-status.is-error .map-status-dot {
    background: #ff976b;
    box-shadow: 0 0 18px rgba(255, 151, 107, 0.75);
    animation: none;
  }

  .map-status-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    text-align: left;
  }
  .map-status-detail {
    font-size: 0.78rem;
    color: rgba(255, 225, 209, 0.78);
    font-weight: 400;
  }
  .map-status-technical {
    font-size: 0.65rem;
    margin-top: 0.25rem;
  }
  .map-status-technical summary {
    cursor: pointer;
    user-select: none;
    color: rgba(255, 225, 209, 0.6);
  }
  .map-status-technical code {
    display: block;
    font-family: var(--font-mono, monospace);
    font-size: 0.6rem;
    color: rgba(255, 225, 209, 0.5); /* a11y-ok: technical-only, rendered inside <details> collapsed by default */
    word-break: break-word;
    margin-top: 0.2rem;
  }

  .map-view-footer {
    left: 24px;
    right: 24px;
    bottom: calc(22px + env(safe-area-inset-bottom, 0px));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }

  .map-back-btn,
  .map-retry-btn {
    min-height: 44px;
    border: 1px solid rgba(126, 231, 219, 0.35);
    border-radius: 8px;
    background: rgba(10, 23, 29, 0.78);
    color: #eafffb;
    font: inherit;
    font-size: 0.84rem;
    font-weight: 800;
    letter-spacing: 0;
    cursor: pointer;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
    transition:
      background 0.16s ease,
      border-color 0.16s ease,
      transform 0.16s ease;
  }

  .map-back-btn {
    padding: 0 16px;
  }

  .map-retry-btn {
    min-height: 44px;
    padding: 0 12px;
  }

  .map-back-btn:hover,
  .map-retry-btn:hover {
    background: rgba(17, 41, 47, 0.92);
    border-color: rgba(126, 231, 219, 0.64);
    transform: translateY(-1px);
  }

  .map-attribution {
    padding: 7px 10px;
    border-radius: 8px;
    background: rgba(4, 10, 13, 0.55);
    color: rgba(218, 239, 234, 0.72);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.66rem;
  }

  .map-view.is-compact .map-view-header {
    top: calc(14px + env(safe-area-inset-top, 0px));
    left: 14px;
  }

  .map-view.is-compact .map-view-footer {
    left: 14px;
    right: 14px;
    bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  }

  .map-view.is-compact .map-attribution {
    display: none;
  }

  :global(#map-container.active) {
    opacity: 1;
    pointer-events: auto;
  }

  :global(#map-container .leaflet-container) {
    background: #071018;
  }

  @keyframes mapStatusPulse {
    0%,
    100% {
      opacity: 0.55;
      transform: scale(0.82);
    }

    50% {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* ── Loading shimmer ──────────────────────────────────────────────────────── */
  .map-shimmer {
    position: absolute;
    inset: 0;
    z-index: var(--z-canvas, 0);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 0.75rem;
    padding: 2rem;
    pointer-events: none;
  }
  .shimmer-row {
    width: min(320px, 70vw);
    height: 10px;
    border-radius: 5px;
    background: linear-gradient(
      90deg,
      rgba(78, 205, 196, 0.04) 0%,
      rgba(78, 205, 196, 0.12) 40%,
      rgba(78, 205, 196, 0.04) 80%
    );
    background-size: 200% 100%;
    animation: shimmerSlide 1.6s ease-in-out infinite;
  }
  .shimmer-row.short {
    width: min(200px, 50vw);
    animation-delay: 0.15s;
  }
  .shimmer-row.medium {
    width: min(260px, 60vw);
    animation-delay: 0.3s;
  }

  @keyframes shimmerSlide {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .map-status-dot,
    .shimmer-row {
      animation: none;
    }
  }
</style>
