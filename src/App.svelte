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
  import { searchStore } from '@lib/stores/search.svelte';
  import { isCompact, reducedMotion, initViewportListeners } from '@lib/stores/viewport';
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
  import SearchResults from '@components/SearchResults.svelte';
  import JourneyChrome from '@components/JourneyChrome.svelte';
  import FocusPocket from '@components/FocusPocket.svelte';
  import ModeChips from '@components/ModeChips.svelte';
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
  import LegacyCompassSurface from '@components/LegacyCompassSurface.svelte';
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
  $effect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => {
      bodyFocusPanelMode = document.body.dataset.focusPanelMode || '';
      bodyPanelSurface = document.body.dataset.panelSurface || '';
    };
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-focus-panel-mode', 'data-panel-surface'] });
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
  let searchSurfaceActive = $derived(navSurface === 'search' || bodyPanelSurface === 'search' || bodyPanelSurface === 'focus-search');
  let idleSurfaceActive = $derived(navSurface === 'idle' && !searchSurfaceActive);

  // Search only shows when explicitly in search AND has content
  let searchHasQuery = $derived(searchStore.query?.length > 0 || searchStore.results?.length > 0);
  let searchVisible = $derived(searchSurfaceActive && searchHasQuery);
  let searchBarVisible = $derived(searchSurfaceActive || idleSurfaceActive);

  // Focus stage: only when in focus/inside/trail or a node is explicitly focused
  let focusActive = $derived(
    navMode === 'focus' || navMode === 'inside' || navMode === 'trail' || navFocusedIndex !== null || bodyFocusPanelMode === 'field-node' || bodyPanelSurface === 'semantic-dive'
  );

  // Header chrome belongs to the idle overview; search and focus surfaces own
  // their own controls.
  let headerVisible = $derived(idleSurfaceActive);
  let controlsVisible = $derived(navSurface !== 'focus-search');
</script>

<div
  id="semantic-explorer"
  class="semantic-explorer"
  class:is-compact={isCompact()}
  class:reduced-motion={reducedMotion()}
  class:is-overview={isOverview()}
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
  <InfoPanel open={true} />

  {#if searchBarVisible}
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
    style:pointer-events={bodyPanelSurface === 'focus-search' ? 'none' : undefined}
  >
    <!-- Focus card for selected business (self-gates via cardVisible = visible && isFocused) -->
    <FocusCard visible={true} forceSemanticDiveVisible={semanticDiveContractForced} />

    <!-- Layer 200: Journey chrome (breadcrumb, trail indicators) -->
    <JourneyChrome visible={true} />

    <!-- Layer 500: Active journey visualization — rendered by Three.js -->

    <!-- Layer 600: Focus pocket (self-gates via visible && hasFocus()) -->
    <FocusPocket visible={true} />
  </div>

  <!-- Mini-map trail (self-gates via visible && hasTrail() && trail.length > 0) -->
  <MapSummary visible={true} />

  <!-- Layer 700: Compass rail -->
  <CompassRail visible={focusActive} />

  <!--
    Legacy-compass parity surface (2026-06-06):
    Renders the legacy #journey-compass + #btn-focus-dive + #map-trail-strip
    DOM that the legacy production shell (vector-explorer-polished.html) and
    the legacy CSS modules expect. The data-* attributes are driven by the
    live stores via reactive $state; clicks call into executeJourneyCompassAction.
    This is the Svelte-side replacement for the DOM that
    js/modules/journey-compass-controller.js + semantic-dive-ui.js build
    imperatively in the legacy shell.
  -->
  <LegacyCompassSurface />

  <!-- Layer 800: Camera controls -->
  <Controls visible={controlsVisible} />

  <!-- Filters (positioned at bottom center) -->
  <Filters open={false} />

  <!-- Thread inspector (overlay, self-gates via visible && threadInspectorActive()) -->
  <ThreadInspector visible={true} />

  <!-- Demo choreography overlay -->
  <DemoChoreography force={forceDemo} suppress={noDemo} />

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
    pointer-events: auto;
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
</style>
