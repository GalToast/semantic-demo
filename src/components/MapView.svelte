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
  import { updateUrlState } from '@lib/orchestration/url-state';
  import { appState } from '@lib/state/app.svelte';
  import { debugWarn } from '@lib/utils/debug'
  import { DisposableRegistry } from '@lib/utils/disposable-registry'
  import { friendlyErrorMessage } from '@lib/utils/error-messages'
  import MapBackButton from '@lib/components/MapBackButton.svelte'
  import MapStatusOverlay from '@lib/components/MapStatusOverlay.svelte'
  import { publish, EVENTS } from '@lib/orchestration/event-bus';
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
  // H5: observes #map-container so Leaflet recalculates tile layout on viewport
  // resizes (notably mobile orientation changes). Disconnected on teardown.
  let resizeObserver: ResizeObserver | null = null;

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
   * Direct assignment is type-safe: `view: 'galaxy' | 'map'` matches
   * `ViewName` ('galaxy' | 'map'), so TS
   * accepts the write without any cast. The previous `as unknown as RuntimeState`
   * cast was dishonest — it widened `currentView` from a 5-value union to
   * `string` via a locally-fabricated `RuntimeState` interface, hiding the
   * type contract.
   */
  function setLegacyView(view: 'galaxy' | 'map'): void {
    {
      // W49-F: capture the previous view BEFORE the mutation so the
      // VIEW_CHANGED payload can carry it. writeNavStateMirror takes
      // the same shape; see src/lib/stores/navigation.svelte.ts.
      const previousView = appState.currentView === 'galaxy' || appState.currentView === 'map'
        ? appState.currentView
        : undefined
      appState.currentView = view;
      if (previousView !== view) {
        publish(EVENTS.VIEW_CHANGED, {
          view,
          previousView,
          myceliumMode: appState.myceliumMode || undefined
        })
      }
    }
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
    // W49-E: returning to galaxy. The canvas hover preview will start
    // showing again the moment the cursor moves over a node; no need to
    // actively show it here.
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

      // W61-F5.4: re-check the token right before the view write. The click
      // path (returnToOverview) bumps activationToken to cancel an in-flight
      // activation, and the other checkpoints honor it — but setLegacyView
      // ('map') sat between checkpoints, so a back-click landing in that gap
      // flipped currentView to 'galaxy' and was then silently reverted to
      // 'map' a microtask later (found by the W54 smoke journey test: early
      // back-clicks were swallowed, late ones worked).
      if (!mounted || token !== activationToken) return;

      // M16: guard against prematurely flipping currentView to 'map' at boot.
      // App.svelte's isPlaywright condition mounts MapView eagerly so
      // #map-container exists in the DOM for contract tests, even when the
      // view is 'galaxy'. In that case we should activate the shell (for DOM
      // presence) but NOT write currentView='map' — the view-switch path
      // (switchView → navStore mirror) handles that when the user actually
      // clicks the Map button. The url-state early-return (parallel session)
      // removed the resetStateBeforeUrlRestore() call that previously masked
      // this bug by resetting currentView to 'galaxy' after MapView's
      // premature write.
      if (appState.currentView === 'galaxy') {
        // Mark as dormant (not an error) so the template shows neither
        // loading-spinner nor error state. The DOM shell (#map-container)
        // is already created by activateMapShell() above and remains
        // present for contract tests.
        status = 'ready'
        statusDetail = 'Map dormant (galaxy view active)'
        return
      }

      setLegacyView('map');

      // W49-E: hide the canvas hover preview when the map takes over the
      // surface. The preview is positioned `fixed` near the cursor and
      // is meant for the galaxy view; without this publish it would
      // remain visible on top of the map tiles, drawing the eye to a
      // 2D preview over a 2D map. The bridge in @lib/ui/tooltip.ts
      // subscribes to TOOLTIP_HIDE_REQUESTED and calls
      // hideCanvasHoverPreview() in response.
      publish(EVENTS.TOOLTIP_HIDE_REQUESTED);

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

      // H5: keep Leaflet tiles sized to the viewport on resize. The container is
      // created by Canvas (or MapView's fallback); we observe whatever exists and
      // bail gracefully if it is absent at activation time.
      const mc = document.getElementById('map-container');
      if (mc && !resizeObserver) {
        resizeObserver = new ResizeObserver(() => {
          const map = appState.map as unknown as LeafletMapWithInvalidateSize | undefined;
          map?.invalidateSize?.();
        });
        resizeObserver.observe(mc);
      }

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
    // W-fix: do NOT call switchView() here — dispatchNavTransition(RETURN_OVERVIEW)
    // already sets mode/overview + surface/idle + currentView/galaxy via
    // returnToOverviewState(). Calling switchView() first would pre-set
    // currentView to galaxy, then returnToOverviewState's writeNavStateMirror
    // could noop on the already-set currentView, and on desktop (no record)
    // the surface transit from 'map' to 'idle' might not propagate correctly.
    // The Escape-key handler (global-shortcuts.ts) uses this same pattern and
    // works correctly for both desktop and mobile.
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW);
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'idle' });
    // Sync the URL to remove ?view=map so the URL matches the galaxy state.
    // This matches the Escape handler pattern (global-shortcuts.ts).
    updateUrlState({}, { reason: 'return-overview' });
  }

  onMount(() => {
    mounted = true;
    void activateLeafletMap();

    return () => {
      mounted = false;
      activationToken += 1;
      resizeObserver?.disconnect();
      resizeObserver = null;
      deactivateMapShell();
      _registry.disposeAll();
    };
  });

  // M16 companion: the URL / deep-link path flips appState.currentView to
  // 'map' AFTER MapView has already mounted eagerly — App.svelte renders
  // MapView under __PLAYWRIGHT__ even when the view is still 'galaxy' so
  // #map-container exists for contract tests, and the M16 dormant bail above
  // defers activation for that early mount. onMount alone would never catch
  // the later flip (same component instance stays mounted: the lazy
  // mapViewLazy.ensure(mapModeActive) effect only loads the chunk, it does
  // not remount). Real user clicks avoid the hole because they remount via
  // the view switch; only the URL-driven flip lands here. Watching currentView
  // re-activates the shared controller exactly once — the status === 'loading'
  // guard skips when an activation is already in flight, and appState.map
  // being set means initMap already ran (idempotent second call is a no-op).
  $effect(() => {
    if (!mounted) return
    if (appState.currentView !== 'map') return
    if (appState.map) return
    if (status === 'loading') return
    void activateLeafletMap()
  })
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

  <MapStatusOverlay {status} {statusDetail} friendlyError={friendlyMapError} onRetry={() => void activateLeafletMap()} />

  <footer class="map-view-footer">
    <MapBackButton onClick={returnToOverview} label="Overview" ariaLabel="Return to overview" />
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
  .map-view-footer {
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

  .map-view-footer {
    left: 24px;
    right: 24px;
    bottom: calc(22px + env(safe-area-inset-bottom, 0px));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }

  .map-attribution {
    padding: 7px 10px;
    border-radius: 8px;
    background: rgba(4, 10, 13, 0.55);
    color: rgba(218, 239, 234, 0.85);
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

  :global(#map-container) {
    display: flow-root;
    /* Cap to the parent's content box (100%, not 100vw) so the map shell never
       produces a horizontal scrollbar on mobile where 100vw exceeds the layout
       viewport. clip (not hidden) avoids scroll containers while still preventing
       overflow paint. No !important needed — this id selector outranks defaults. */
    max-width: 100%;
    overflow: clip;
  }

  :global(#map-container.active) {
    opacity: 1;
    pointer-events: auto;
  }

  :global(#map-container .leaflet-container) {
    /* Force the Leaflet surface to fill #map-container so its rendered width
       matches the viewport-capped container instead of Leaflet's own initial
       size calc, which otherwise leaves scrollWidth > clientWidth and clips
       the map at the edges (BUG H5). !important overrides the inline width
       Leaflet assigns on init. */
    width: 100% !important;
    background: #071018;
  }

</style>
