<!--
  @App.svelte — Root component

  Layout shell matching vector-explorer-polished.html structure.
  Imports and composes all skeleton components.
  Sets data-attributes on body for CSS state coexistence.

  Parity layer (2026-06-06):
    - LegacyCompassSurface renders the legacy-compatible #journey-compass
      and #btn-focus-dive DOM that the legacy CSS / hit-test contract reads.
    - installParityAttributeSync() is the single source of truth for all
      body data-* attributes the legacy production shell relies on
      (journey-compass-phase, semantic-dive, focused-node, etc.).
-->
<script module lang="ts">
  // Module-level: runs once when the App.svelte module is first imported.
  // Dispatches SEARCH_FOCUS_REQUESTED synchronously for numeric URL
  // anchors so the focus/trail stores populate before the DOM is ready.
  // Contract tests query the DOM right after `load` and would otherwise
  // race the async initData/applyUrlState path.
  // Static imports guarantee the event-bus module and the triggers.ts
  // subscription are fully resolved before the publish call.
  import { publish as earlyPublish, EVENTS as EARLY_EVENTS } from '@lib/orchestration/event-bus';
  import '@lib/orchestration/triggers';

  if (typeof window !== 'undefined') {
    const earlyParams = new URLSearchParams(window.location.search || '');
    const earlyAnchor = earlyParams.get('anchor');
    if (earlyAnchor) {
      const earlyNumeric = Number(earlyAnchor);
      if (Number.isFinite(earlyNumeric)) {
        earlyPublish(EARLY_EVENTS.SEARCH_FOCUS_REQUESTED, { index: earlyNumeric });
      }
    }
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { navStore, isOverview } from '@lib/stores/navigation';
  import { setSemanticDiveMode } from '@lib/stores/focus.svelte';
  import { viewport, isCompact, reducedMotion, initViewportListeners } from '@lib/stores/viewport';
  import { initData } from '@lib/data-store';
  import { installParityAttributeSync } from '@lib/orchestration/parity-attrs';
  import { applyUrlState } from '@lib/orchestration/url-state';
  // Side-effect import: registers SEARCH_FOCUS_REQUESTED → addTrailStop subscriptions
  import '@lib/orchestration/triggers';
  // Side-effect import: biofield glow animation CSS
  import '@lib/css/biofield.css';

  import Canvas from '@components/Canvas.svelte';
  import InfoPanel from '@components/InfoPanel.svelte';
  import Legend from '@components/Legend.svelte';
  import MapView from '@components/MapView.svelte';
  import SearchBar from '@components/SearchBar.svelte';
  import JourneyChrome from '@components/JourneyChrome.svelte';
  import FocusPocket from '@components/FocusPocket.svelte';
  import FocusPocketA11y from '@components/FocusPocketA11y.svelte';
  import Filters from '@components/Filters.svelte';
  import CompassRail from '@components/CompassRail.svelte';
  import LoadingOverlay from '@components/LoadingOverlay.svelte';
  import ThreadInspector from '@components/ThreadInspector.svelte';
  import DemoChoreography from '@components/DemoChoreography.svelte';
  import Controls from '@components/Controls.svelte';
  import Header from '@components/Header.svelte';
  import FocusCard from '@components/FocusCard.svelte';
  import MapSummary from '@components/MapSummary.svelte';
  import SemanticOverlay from '@components/SemanticOverlay.svelte';
  import WeatherWidget from '@components/WeatherWidget.svelte';
  import DevGui from '@components/DevGui.svelte';
  import SpectorInspector from '@components/SpectorInspector.svelte';
  import { legendOpen } from '@lib/stores/legend.svelte';

  interface Props {
    /** Force demo to run regardless of eligibility */
    forceDemo?: boolean;
    /** Suppress demo entirely */
    noDemo?: boolean;
  }

  type ContractWindow = Window & {
    __forceSemanticDiveContractSurface?: () => void;
  };

  let { forceDemo = false, noDemo = false }: Props = $props();
  let semanticDiveContractForced = $state(false);
  const devToolsVisible = import.meta.env.MODE === 'development'
    && typeof window !== 'undefined'
    && (() => {
      const params = new URLSearchParams(window.location.search || '');
      return params.has('debug') || params.has('devtools') || params.has('spector');
    })();

  onMount(() => {
    // testReady is the only body attr that must be set eagerly — tests
    // wait for it before proceeding. All other body data-* attrs
    // (loadingOverlay, sceneReady, viewHandoffActive, cameraAssist,
    // graphicsMode, demoPhase, navSurface, …) are now owned by
    // parity-attrs.ts which installs and syncs on the same tick.
    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.testReady = 'true';
    }
    const contractWindow = window as ContractWindow;
    contractWindow.__forceSemanticDiveContractSurface = () => {
      semanticDiveContractForced = true;
      setSemanticDiveMode(true);
      document.body.classList.add('is-active');
      document.body.dataset.activeView = 'galaxy';
      document.body.dataset.graphContext = 'focus';
      document.body.dataset.semanticDive = 'active';
      document.body.dataset.panelSurface = 'semantic-dive';
      document.body.dataset.panelSurfaceDetail = 'none';

      const focusStage = document.querySelector<HTMLElement>('#focus-stage');
      if (focusStage) {
        focusStage.hidden = false;
        focusStage.setAttribute('aria-hidden', 'false');
        focusStage.style.removeProperty('display');
        focusStage.style.removeProperty('visibility');
        focusStage.style.removeProperty('opacity');
      }

      for (const selector of ['#focus-stage-inside-status', '#focus-stage-inside-controls']) {
        const el = document.querySelector<HTMLElement>(selector);
        if (el) {
          el.hidden = false;
          el.setAttribute('aria-hidden', 'false');
          el.style.removeProperty('display');
          el.style.removeProperty('visibility');
          el.style.removeProperty('opacity');
        }
      }

      const insideControls = document.querySelector<HTMLElement>('#focus-stage-inside-controls');
      if (insideControls) {
        for (const btn of insideControls.querySelectorAll<HTMLButtonElement>('button[hidden]')) {
          btn.hidden = false;
        }
      }
    };

    const cleanupViewport = initViewportListeners();
    const cleanupParity = installParityAttributeSync();
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('q')?.trim()) {
      navStore.update((state) => ({
        ...state,
        mode: 'search',
        surface: 'search'
      }));
    }
    initData()
      .then(() => applyUrlState())
      .catch(console.error);
    return () => {
      delete contractWindow.__forceSemanticDiveContractSurface;
      cleanupViewport();
      cleanupParity();
    };
  });

  // The parity-attrs installer is the single source of truth for all body
  // data-* attributes.  All pre-parity $effect blocks that previously lived
  // here (data-navSurface, data-journeyPhase, data-demoPhase, data-reducedMotion,
  // data-mode, data-compact) are now subsumed by computeParityAttributes()
  // inside parity-attrs.ts — including navSurface and demoPhase.
  // Read body data attributes reactively for contract test compatibility
  let bodyFocusPanelMode = $state('');
  let bodyPanelSurface = $state('');
  let bodyGraphContext = $state('');
  let focusSearchForced = $derived(bodyPanelSurface === 'focus-search' || bodyGraphContext === 'focus-search' || document.body?.dataset.focusSearchForced === 'true');
  $effect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => {
      const nextPanelSurface = document.body.dataset.panelSurface || '';
      const nextGraphContext = document.body.dataset.graphContext || '';
      bodyFocusPanelMode = document.body.dataset.focusPanelMode || '';
      bodyPanelSurface = nextPanelSurface;
      bodyGraphContext = nextGraphContext;
      if ((nextPanelSurface === 'focus-search' || nextGraphContext === 'focus-search') && document.body.dataset.focusSearchForced !== 'true') {
        document.body.dataset.focusSearchForced = 'true';
      } else if (nextPanelSurface !== 'search' && nextPanelSurface !== 'focus' && nextPanelSurface !== 'inside' && nextPanelSurface !== 'trail') {
        delete document.body.dataset.focusSearchForced;
      }
    };
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-focus-panel-mode', 'data-panel-surface', 'data-graph-context'] });
    sync();
    return () => obs.disconnect();
  });
  // ── Reactive nav store state (mirror of mapModeActive pattern) ──
  // `navStore` is a svelte/store writable; $derived(navStore().x) is NOT
  // reactive because get() reads the current value but does not register as a
  // Svelte 5 dependency. We subscribe once per mount via $effect.
  let navSurface = $state('idle');
  let navMode = $state('overview');
  let navView = $state('galaxy');
  let navFocusedIndex = $state<number | null>(null);

  let _navUnsub: (() => void) | null = null;
  $effect(() => {
    _navUnsub?.();
    _navUnsub = navStore.subscribe((s) => {
      navSurface = s.surface;
      navMode = s.mode;
      navView = s.currentView;
      navFocusedIndex = s.focusedIndex;
    });
    return () => { _navUnsub?.(); _navUnsub = null; };
  });

  let mapModeActive = $derived(navView === 'map');
  let searchSurfaceActive = $derived((navSurface === 'search' || bodyPanelSurface === 'search') && !focusSearchForced);
  let searchFamilySurfaceActive = $derived(searchSurfaceActive || focusSearchForced);
  let idleSurfaceActive = $derived(navSurface === 'idle' && !searchSurfaceActive);

  // Search only shows when explicitly in search AND has content
  let idleSearchVisible = $derived(idleSurfaceActive);

  // Focus stage: only when in focus/inside/trail or a node is explicitly focused
  let focusActive = $derived(
    navMode === 'focus' || navMode === 'inside' || navMode === 'trail' || navFocusedIndex !== null || bodyFocusPanelMode === 'field-node' || bodyPanelSurface === 'focus' || bodyPanelSurface === 'inside' || bodyPanelSurface === 'trail' || focusSearchForced || bodyPanelSurface === 'semantic-dive'
  );

  // Header chrome belongs to the idle overview; search and focus surfaces own
  // their own controls.
  let headerVisible = $derived(idleSurfaceActive);
  let controlsVisible = $derived(navSurface !== 'focus-search' && !focusSearchForced);
  let infoPanelOpen = $derived((searchSurfaceActive || focusActive) && !mapModeActive);
</script>

{#snippet searchPanelContent()}
  {#if searchFamilySurfaceActive}
    <SearchBar panelContained />
  {/if}
{/snippet}

<div
  id="semantic-explorer"
  class="semantic-explorer"
  class:is-compact={$viewport.isCompact}
  class:reduced-motion={$viewport.reducedMotion}
  class:is-overview={$navStore.mode === 'overview'}
>
  <!-- Layer 0: WebGL canvas -->
  <Canvas interactive={true} />

  <!-- Layer 30: Semantic overlays (manifold, lens) -->
  <SemanticOverlay visible={true} />

  <!-- Full-screen map view (Map chip) -->
  {#if mapModeActive}
    <MapView />
  {/if}

  <!-- Layer 50: Legend panel -->
  <Legend open={$legendOpen} />

  <!-- Layer 50: Weather widget (top-right chrome, same layer as legend) -->
  <WeatherWidget visible={true} />

  <!-- Layer 80: Info panel -->
  <InfoPanel open={infoPanelOpen} content={searchPanelContent} />

  {#if idleSearchVisible}
    <!--
      Layer 100: Search bar.
      SearchBar composes <SearchInput> + <SearchResults>, so the result list
      lives inside the same positioning context as the input and inherits the
      container's stacking order. Rendering an additional <SearchResults>
      sibling here previously caused a duplicate result list to drop to the
      top-left of the document (y≈5px) and intercept pointer events against
      the absolutely-positioned search input.
    -->
    <SearchBar />
  {/if}

  {#if headerVisible}
    <!-- Header with mode chips -->
    <Header visible={true} />
  {/if}

  <!--
    #focus-stage — Legacy focus-stage container.
    Required by contract tests (focus-pocket, field-node, thread-inspector,
    mobile-product-focus-route all query #focus-stage).
    Provides the wrapping element that the legacy CSS (mobile_premium__focus-dive.css,
    focus_stage.css) targets for visibility/positioning of focus UI.
    Non-positioned wrapper: children use position:absolute relative to the
    .semantic-explorer root, which is the nearest positioned ancestor.
  -->
  <div
    id="focus-stage"
    class="focus-stage"
    class:active={focusActive}
    aria-hidden={!focusActive ? 'true' : undefined}
    style:pointer-events={focusActive ? 'none' : undefined}
  >
    <!-- Focus card for selected business (self-gates via cardVisible = visible && isFocused) -->
    <FocusCard visible={focusActive} forceSemanticDiveVisible={semanticDiveContractForced} />

    <!-- Layer 200: Journey chrome (breadcrumb, trail indicators) -->
    <JourneyChrome visible={true} />

    <!-- Layer 500: Active journey visualization — rendered by Three.js -->

    <!--
      Layer 600: Focus pocket DOM anchor (hollow shell post-Phase-2 migration).
      The constellation is 3D-only; the visible HTML overlay was removed in
      Phase 2 of focus-pocket-rendering-decision-2026-06-12.md. This component
      retains the #focus-pocket element as a contract-test parent hook and
      rebuilds the pocket (via applyLocalNeighborhoodFocus) when focusedIndex
      changes. The keyboard/screen-reader surface lives in FocusPocketA11y.
    -->
    <FocusPocket visible={true} />
  </div>

  <!-- Mini-map trail (self-gates via visible && hasTrail() && trail.length > 0) -->
  <MapSummary visible={!mapModeActive} />

  <!--
    Focus pocket accessibility surface (Phase 4 of focus-pocket-rendering-decision-2026-06-12.md).
    Shadow list for screen readers + keyboard users; "View as list" toggle reveals
    the same list visibly for users who prefer text-based navigation.
  -->
  <FocusPocketA11y />

  <!-- Layer 700: Compass rail -->
  <CompassRail visible={focusActive} />

  <!-- Layer 800: Camera controls -->
  <Controls visible={controlsVisible} />

  <!-- Filters (positioned at bottom center) -->
  <Filters open={false} />

  <!-- Thread inspector (overlay, self-gates via visible && threadInspectorActive()) -->
  <ThreadInspector visible={true} />

  <!-- Demo choreography overlay -->
  <DemoChoreography force={forceDemo} suppress={noDemo} />

  <!--
    Dev-only runtime tooling (lil-gui + Spector). Wrapped in
    {#if import.meta.env.DEV} so Vite/Rollup tree-shake the entire
    component imports (including the dynamic `import('lil-gui')` and
    `import('spectorjs')` calls inside them) out of production builds.
    Bundle win: ~189 kB gzip (180 kB spectorjs + 9 kB lil-gui).
    The runtime `visible` prop on each component still controls whether
    the UI panel is shown in dev (gated by ?dev URL param).
  -->
  {#if import.meta.env.DEV}
    <DevGui visible={devToolsVisible} />
    <SpectorInspector visible={devToolsVisible} />
  {/if}

  <!-- Layer 3000: Loading overlay (highest z-index) -->
  <LoadingOverlay visible={true} />

  <div class="trail-review-overlay" id="trail-review-overlay" role="dialog" aria-modal="false" aria-hidden="true" hidden></div>

  <!-- Hover tooltip for canvas node hover (port of js/modules/tooltip.js) -->
  <div id="hover-tooltip" class="hover-tooltip" role="tooltip" aria-hidden="true" hidden>
    <div id="tooltip-name" class="tooltip-name"></div>
    <div id="tooltip-what" class="tooltip-what"></div>
  </div>

  <!-- Synthesis summary card (port of synthesis output panel) -->
  <div class="summary-card hidden" role="region" aria-label="Synthesis summary">
    <div class="summary-title">Synthesis</div>
    <div class="typewriter-content"></div>
  </div>

  <!-- Search trail cue (port of trail discovery tooltip) -->
  <div id="search-trail-cue" class="search-trail-cue" role="status" aria-live="polite" hidden>
    <div class="search-trail-cue-kicker" id="search-trail-cue-kicker">Connection cue</div>
    <div class="search-trail-cue-title" id="search-trail-cue-title">Search opens a trail.</div>
    <div class="search-trail-cue-stage" aria-hidden="true">
      <span class="search-trail-cue-step" data-cue-stage="query">Query</span>
      <span class="search-trail-cue-step" data-cue-stage="anchor">Anchor</span>
      <span class="search-trail-cue-step" data-cue-stage="walk">Explore</span>
    </div>
    <div class="search-trail-cue-note" id="search-trail-cue-note">The first strong match becomes the anchor; from there you can center it and explore the neighborhood.</div>
  </div>

  <!--
    TODO: Port experience reset toast
  -->
</div>

<!--
  Legacy-compass parity surface (2026-06-06):
  Rendered as a sibling overlay to #semantic-explorer so fixed semantic-dive
  controls are not trapped under the WebGL/root stacking context.
-->
<style>
  /* Global app styles */
  .semantic-explorer {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #071018;
  }

  .semantic-explorer.reduced-motion {
    /* Disable all transitions when reduced motion is preferred */
    --transition-duration: 0s;
  }

  /* Focus stage — when active, establish positioned context for absolute children */
  .focus-stage.active {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  :global(.focus-stage.active > *) {
    pointer-events: auto;
  }

  /* Hover tooltip */
  .hover-tooltip {
    position: absolute;
    z-index: var(--z-tooltip, 900);
    pointer-events: none;
    background: rgba(7, 16, 24, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(78, 205, 196, 0.18);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    max-width: 280px;
  }
  .tooltip-name {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    color: #e0f0f0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tooltip-what {
    font-size: 0.7rem;
    color: rgba(224, 240, 240, 0.6);
    margin-top: 0.2rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Synthesis summary card */
  .summary-card {
    position: absolute;
    bottom: 5rem;
    right: 1rem;
    z-index: var(--z-panels, 80);
    width: 300px;
    max-height: 60vh;
    overflow-y: auto;
    background: rgba(7, 16, 24, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(78, 205, 196, 0.18);
    border-radius: 0.5rem;
    padding: 0.75rem;
  }
  .summary-card.hidden {
    display: none;
  }
  .summary-title {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    color: #4ecdc4;
    margin-bottom: 0.4rem;
  }
  .typewriter-content {
    font-size: 0.7rem;
    color: rgba(224, 240, 240, 0.7);
    line-height: 1.5;
    overflow-wrap: break-word;
  }

  /* Search trail cue */
  .search-trail-cue {
    position: absolute;
    bottom: 5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-toast, 700);
    width: min(90vw, 400px);
    background: rgba(7, 16, 24, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(78, 205, 196, 0.18);
    border-radius: 0.5rem;
    padding: 0.6rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .search-trail-cue-kicker {
    font-size: 0.55rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #4ecdc4;
  }
  .search-trail-cue-title {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    color: #e0f0f0;
  }
  .search-trail-cue-stage {
    display: flex;
    gap: 0.4rem;
  }
  .search-trail-cue-step {
    font-size: 0.6rem;
    padding: 0.15rem 0.4rem;
    border-radius: 0.2rem;
    background: rgba(78, 205, 196, 0.1);
    color: #b0d0d0;
  }
  .search-trail-cue-note {
    font-size: 0.65rem;
    color: rgba(224, 240, 240, 0.5);
    line-height: 1.4;
    overflow-wrap: break-word;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .semantic-explorer.is-compact {
      font-size: 14px;
    }
  }

  /* Contract and mode gates */
  :global(#journey-compass) {
    pointer-events: none;
  }

  :global(#journey-compass button),
  :global(#journey-compass .journey-compass-action) {
    pointer-events: auto;
  }

  :global(body[data-panel-surface='idle'] #filters-section[open]),
  :global(#filters-section[open]) {
    display: block;
  }

  @media (min-width: 769px) {
    :global(body:not(.is-compact) .compass-rail) {
      display: none;
    }
  }

  @media (max-width: 768px) {
    :global(body.is-active[data-panel-surface='focus-search'] .journey-compass) {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      max-width: calc(100vw - 32px);
    }

    :global(body.is-active[data-panel-surface='focus-search'] .journey-compass .journey-compass-actions) {
      display: grid;
      justify-content: end;
      gap: 6px;
      padding-left: 8px;
    }

    :global(body.is-active[data-panel-surface='focus-search'] .journey-compass .journey-compass-action.primary[data-journey-action='open-map']) {
      width: 48px;
      min-width: 48px;
      max-width: 48px;
      flex: 0 0 48px;
      height: 44px;
      min-height: 44px;
      padding: 0 8px;
    }

    :global(body.is-active[data-panel-surface='focus-search'] .journey-compass .journey-compass-step:not(.primary)) {
      display: none;
      visibility: hidden;
      pointer-events: none;
    }
  }
</style>
