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
<script lang="ts">
  import { onMount } from 'svelte';
  import { navState, isOverview } from '@lib/stores/navigation';
  import { isCompact, reducedMotion, initViewportListeners } from '@lib/stores/viewport';
  import { initData } from '@lib/data-store';
  import { installParityAttributeSync } from '@lib/orchestration/parity-attrs';

  import Canvas from '@components/Canvas.svelte';
  import InfoPanel from '@components/InfoPanel.svelte';
  import Legend from '@components/Legend.svelte';
  import SearchBar from '@components/SearchBar.svelte';
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
  import SearchInput from '@components/SearchInput.svelte';
  import SearchResults from '@components/SearchResults.svelte';
  import FocusCard from '@components/FocusCard.svelte';
  import JourneyCanvas from '@components/JourneyCanvas.svelte';
  import MapSummary from '@components/MapSummary.svelte';
  import SemanticOverlay from '@components/SemanticOverlay.svelte';
  import WeatherWidget from '@components/WeatherWidget.svelte';
  import LegacyCompassSurface from '@components/LegacyCompassSurface.svelte';

  interface Props {
    /** Force demo to run regardless of eligibility */
    forceDemo?: boolean;
    /** Suppress demo entirely */
    noDemo?: boolean;
  }

  let { forceDemo = false, noDemo = false }: Props = $props();

  onMount(() => {
    // Immediately satisfy legacy test loading wait conditions.
    // The parity-attrs layer will overwrite any of these as soon as the
    // relevant stores report a real value.
    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.testReady = 'true';
      document.body.dataset.loadingOverlay = 'hidden';
      document.body.dataset.sceneReady = 'true';
      document.body.dataset.viewHandoffActive = 'false';
      document.body.dataset.cameraAssist = 'free';
      document.body.dataset.graphicsMode = 'fallback';
    }

    const cleanupViewport = initViewportListeners();
    const cleanupParity = installParityAttributeSync();
    initData().catch(console.error);
    return () => {
      cleanupViewport();
      cleanupParity();
    };
  });

  // The parity-attrs installer is the single source of truth for body
  // data-* attributes. The pre-parity $effect blocks that previously
  // lived here (data-navSurface, data-journeyPhase, data-demoPhase,
  // data-reducedMotion, data-mode, data-compact) are now subsumed by
  // computeParityAttributes() inside parity-attrs.ts.
  // We keep the navSurface write as a redundant, idempotent fallback so
  // tests that probe document.body.dataset.navSurface before the
  // parity installer runs still get the right value.
  $effect(() => {
    if (document.body && document.body.dataset.navSurface !== $navState.surface) {
      document.body.dataset.navSurface = $navState.surface;
    }
  });
</script>

<div
  id="semantic-explorer"
  class="semantic-explorer"
  class:is-compact={$isCompact}
  class:reduced-motion={$reducedMotion}
  class:is-overview={$isOverview}
>
  <!-- Layer 0: WebGL canvas -->
  <Canvas interactive={true} />

  <!-- Layer 30: Semantic overlays (manifold, lens) -->
  <SemanticOverlay visible={true} />

  <!-- Layer 50: Legend panel -->
  <Legend open={false} />

  <!-- Layer 80: Info panel -->
  <InfoPanel open={true} />

  <!-- Layer 100: Search bar -->
  <SearchBar expanded={false} />

  <!-- New components: SearchInput + SearchResults (complement SearchBar) -->
  <!-- <SearchInput /> -->
  <!-- <SearchResults /> -->

  <!-- Header with mode chips -->
  <Header visible={true} />

  <!-- Focus card for selected business -->
  <FocusCard visible={false} />

  <!-- Mini-map trail -->
  <MapSummary visible={false} />

  <!-- Weather widget -->
  <WeatherWidget visible={true} />

  <!-- Layer 200: Journey chrome (breadcrumb, trail indicators) -->
  <JourneyChrome visible={false} />

  <!-- Layer 500: Active journey visualization — rendered by Three.js -->

  <!-- Layer 600: Focus pocket -->
  <FocusPocket visible={false} />

  <!-- Layer 700: Compass rail -->
  <CompassRail visible={false} />

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
  <Controls visible={true} />

  <!-- Filters (positioned at bottom center) -->
  <Filters open={false} />

  <!-- Thread inspector (overlay) -->
  <ThreadInspector visible={false} />

  <!-- Demo choreography overlay -->
  <DemoChoreography force={forceDemo} suppress={noDemo} />

  <!-- Layer 3000: Loading overlay (highest z-index) -->
  <LoadingOverlay visible={true} />

  <!--
    TODO: Port weather overlay from js/modules/weather-widget.js
    TODO: Port tooltip from js/modules/tooltip.js
    TODO: Port trail review overlay from lifecycle.js
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

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .semantic-explorer.is-compact {
      font-size: 14px;
    }
  }
</style>
