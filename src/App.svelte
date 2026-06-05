<!--
  @App.svelte — Root component

  Layout shell matching vector-explorer-polished.html structure.
  Imports and composes all skeleton components.
  Sets data-attributes on body for CSS state coexistence.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { navState, isOverview } from '@lib/stores/navigation';
  import { journeyPhase } from '@lib/stores/journey';
  import { demoPhase } from '@lib/stores/demo';
  import { viewport, isCompact, reducedMotion, initViewportListeners } from '@lib/stores/viewport';
  import { initData } from '@lib/data-store';

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

  interface Props {
    /** Force demo to run regardless of eligibility */
    forceDemo?: boolean;
    /** Suppress demo entirely */
    noDemo?: boolean;
  }

  let { forceDemo = false, noDemo = false }: Props = $props();

  onMount(() => {
    const cleanupViewport = initViewportListeners();
    initData().catch(console.error);
    return () => {
      cleanupViewport();
    };
  });

  $effect(() => {
    if (document.body) {
      document.body.dataset.navSurface = $navState.surface;
    }
  });

  $effect(() => {
    if (document.body) {
      document.body.dataset.journeyPhase = $journeyPhase;
    }
  });

  $effect(() => {
    if (document.body) {
      document.body.dataset.demoPhase = $demoPhase;
    }
  });

  $effect(() => {
    if (document.body) {
      document.body.dataset.reducedMotion = String($reducedMotion);
    }
  });

  $effect(() => {
    if (document.body) {
      document.body.dataset.mode = $navState.mode;
    }
  });

  $effect(() => {
    if (document.body) {
      document.body.dataset.compact = String($isCompact);
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
  <InfoPanel open={false} />

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
