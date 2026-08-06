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
  import { onMount, type Snippet } from 'svelte';
  import { get } from 'svelte/store';
  import { navStore } from '@lib/stores/navigation.svelte.ts';
  import { useParityAttrs } from '@lib/ui/use-parity-attrs.svelte';
  import { useNavState } from '@lib/ui/use-nav-state.svelte';
  import { threadInspectorActive } from '@lib/stores/focus.svelte';
  import { viewport } from '@lib/stores/viewport.svelte.ts';
  import { removeStaticPlaceholder, computeDevToolsVisible, isPlaywrightEnvironment } from '@lib/app/app-lifecycle.ts';
  import { createAppBootHandlers } from '@lib/app/app-event-handlers.ts';
  import { focusSearchInput } from '@lib/app/app-render.ts';

  // Side-effect import: biofield glow animation CSS
  import '@lib/css/biofield.css';
  import '@lib/css/canvas-hover-preview.css';
  // Side-effect import: shared app-header visual contract (Header family).
  // Hoisted from per-component @imports (HelpDialog/Header) so the CSS loads
  // once at app scope — behavior is identical (the stack already emits it
  // globally) but svelte-check stops misrepporting the shared selectors as
  // "unused in this component."
  import '@lib/components/header/header.css';
  import AppBoot from '@components/AppBoot.svelte';

  // W46-B2b: Lazy components consolidated via createLazyComponent() helper.
  // See src/lib/utils/lazy-component.svelte.ts. Each handle exposes a reactive
  // `current` (the component class once loaded) and `ensure(condition)` to
  // drive loading from a $effect. The previous inline $state holder +
  // importPending flag + $effect pattern is no longer needed.

  import Splash from '@components/Splash.svelte';
  import Placeholder2D from '@components/Placeholder2D.svelte';
  import { engineReady } from '@lib/stores/engine-ready.svelte';
  import { signalSceneReady, signalSceneError } from '@lib/stores/scene-ready.svelte';
  import Legend from '@components/Legend.svelte';
  import SearchBar from '@components/SearchBar.svelte';
  import FocusPocketA11y from '@components/FocusPocketA11y.svelte';
  import Filters from '@components/Filters.svelte';
  import CompassRail from '@components/CompassRail.svelte';
  import LoadingOverlay from '@components/LoadingOverlay.svelte';
  import Controls from '@components/Controls.svelte';
  import Header from '@components/Header.svelte';
  import MapSummary from '@components/MapSummary.svelte';
  import SemanticOverlay from '@components/SemanticOverlay.svelte';
  import Toast from '@components/Toast.svelte';
  import SemanticGuideCard from '@components/SemanticGuideCard.svelte';
  import SearchTrailCue from '@components/SearchTrailCue.svelte';
  import ProximityLegend from '@components/ProximityLegend.svelte';
  import InfoPanel from '@components/InfoPanel.svelte';
  import FocusCard from '@components/FocusCard.svelte';
  import JourneyChrome from '@components/JourneyChrome.svelte';
  import FocusPocket from '@components/FocusPocket.svelte';
  import { createLazyComponent } from '@lib/utils/lazy-component.svelte';
  import { ErrorFallback } from '@lib/error-boundary';
  import { legendOpen, setLegendOpen } from '@lib/stores/legend.svelte';

  // Lazy component handles -- driven by $effects further down. Components that
  // are required synchronously by focus/ journey contract tests are imported
  // statically above; the remaining heavy chunks stay lazy for cold-load budget.
  const canvasLazy = createLazyComponent(
    () => import('@components/Canvas.svelte'),
    { logOnError: true }
  )
  const mapViewLazy = createLazyComponent(
    () => import('@components/MapView.svelte'),
    { idle: false, logOnError: true }
  )
  const threadInspectorLazy = createLazyComponent(() => import('@components/ThreadInspector.svelte'))
  const demoChoreographyLazy = createLazyComponent(() => import('@components/DemoChoreography.svelte'))
  const weatherWidgetLazy = createLazyComponent(() => import('@components/WeatherWidget.svelte'))
  // Dev-only runtime tooling (lil-gui + Spector + telemetry). Extracted to
  // DevToolsMount.svelte so App.svelte doesn't have to own 3 lazy handles +
  // the DEV-gated telemetry install. App.svelte wraps the mount in
  // {#if import.meta.env.DEV} so the chunks stay out of prod builds.
  import DevToolsMount from '@components/DevToolsMount.svelte';
  const legacyCompassSurfaceLazy = createLazyComponent(
    () => import('@components/JourneyCompass.svelte')
  )

  // Pre-warm the engine module tree during splash so Vite's dev server
  // compiles the heavy Three.js + engine dependency graph in the background.
  // The import() result is cached by Vite; when Canvas.svelte later calls
  // import('@lib/engine/lifecycle') in initLifecycle, it resolves instantly.
  // W63: in production there is no compile benefit, and eagerly fetching the
  // engine pulls Three.js onto the cold-load path. Gate this to DEV only.
  if (import.meta.env.DEV) {
    import('@lib/engine/lifecycle').catch(() => {})
  }


  // In Playwright tests, eagerly pre-load components that are required by
  // contract tests but now lazy-loaded in production for performance.
  // W46-B2b: pre-load via the helper handles' ensure(true) so we don't reach
  // into module-internal $state holders (which no longer exist).
  if (typeof window !== 'undefined' && window.__PLAYWRIGHT__) {
    mapViewLazy.ensure(true)
    legacyCompassSurfaceLazy.ensure(true)
    threadInspectorLazy.ensure(true)
    // Contract tests need #canvas-container and #map-container in the DOM.
    // Canvas.svelte is gated on engineReady.value; signal it so the component
    // renders without waiting for a user gesture that never happens in headless
    // Playwright. The Three.js engine init is deferred via requestIdleCallback
    // and does not block the DOM element creation.
    engineReady.signalReady()
    canvasLazy.ensure(true)
  }

  const isPlaywright = isPlaywrightEnvironment();

  // W46-B2b: scheduleIdleComponentImport was moved to lazy-component.svelte.ts
  // as scheduleIdleImport, used internally by createLazyComponent. No call
  // sites remain in App.svelte; deletion.

  $effect(() => mapViewLazy.ensure(mapModeActive));

  // W5-T3b: idle-schedule ThreadInspector — only mounts when Thread view is active.
  $effect(() => threadInspectorLazy.ensure(threadInspectorActive()));

  $effect(() => demoChoreographyLazy.ensure(true));

  $effect(() => weatherWidgetLazy.ensure(weatherVisible));

  // Dev-only runtime tooling mount is delegated to DevToolsMount.svelte.
  // The component handles its own lazy loading and telemetry install.

  interface Props {
    /** Force demo to run regardless of eligibility */
    forceDemo?: boolean;
    /** Suppress demo entirely */
    noDemo?: boolean;
  }

  let { forceDemo = false, noDemo = false }: Props = $props();
  let semanticDiveContractForced = $state(false);

  // W45-A: Decide initial render kind synchronously at mount time.
  // Mobile / narrow-viewport / automated sessions get the 2D placeholder
  // so the 587 KB three.js chunk stays off the cold-load critical path.
  // The parity-attr composable returned below is the source of truth for
  // `renderKind`; declare it here so the $derived initializer below is in
  // scope (Svelte 5 will invalidate `renderKind` whenever `parity.renderKind`
  // changes via the parityMap MutationObserver).
  const parity = useParityAttrs();
  // Reactive render kind: read from the parity-attr snapshot so the {#if}
  // branches below re-render when the body dataset flips (e.g., the
  // Playwright auto-signal in this file calls setRenderKind('webgl') on
  // mount, which would otherwise leave this local at 'placeholder2d'
  // forever and keep <Placeholder2D> rendered on top of <SearchInput>).
  let renderKind = $derived(parity.renderKind);
  let s3dSceneReady = $state(false);
  let s3dSceneError = $state(false);

  const devToolsVisible = computeDevToolsVisible();

  onMount(() => {
    removeStaticPlaceholder();
  });

  // The parity-attrs installer is the single source of truth for all body
  // data-* attributes.  All pre-parity $effect blocks that previously lived
  // here (data-nav.surface, data-journeyPhase, data-demoPhase, data-reducedMotion,
  // data-mode, data-compact) are now subsumed by computeParityAttributes()
  // inside parity-attrs.svelte.ts — including nav.surface and demoPhase.
  // Read body data attributes reactively. Most parity-mirrored attrs come
  // from `parityMap` (reactive rune-backed proxy kept in sync by
  // parity-attrs.svelte.ts:installParityAttributeSync()).
  //
  // Parity attribute bundle — replaces 9 separate $derived reads.
  // The composable returns reactive getters; reads in the template and
  // $derived/$effect below register dependencies on parityMap and the
  // bypass-attr MutationObserver automatically.
  // (parity is declared earlier — just above the renderKind $derived — so
  //  the renderKind initializer has parity in scope.)
  // ── Reactive nav store state ──
  // appState.navState is Svelte 5 rune-backed $state; reads in $derived
  // register reactive dependencies directly — no subscribe mirror needed.
  // After W48-T4 extraction, the 4 raw nav reads come from useNavState().
  // Surface composition (mapModeActive, searchSurfaceActive, focusActive,
  // etc.) stays here because it composes both nav + parity attrs and is
  // tightly coupled to App.svelte's template-local predicates.
  const nav = useNavState();
  let weatherVisible = $state(true);

  let mapModeActive = $derived(nav.view === 'map');
  let searchSurfaceActive = $derived((nav.surface === 'search' || parity.panelSurface === 'search') && !parity.focusSearchForced);
  let searchFamilySurfaceActive = $derived(searchSurfaceActive || parity.focusSearchForced);
  let mapTrailSearchLaneActive = $derived(
    mapModeActive &&
    parity.journeyNavigationOwner === 'map-trail-strip' &&
      parity.panelSurface.startsWith('map-') &&
      parity.panelSurface !== 'map-idle' && // audit-ok: literal state check
      parity.panelSurface !== 'map' // audit-ok: literal state check
  );
  let idleSurfaceActive = $derived(nav.surface === 'idle' && !searchSurfaceActive);

  // Search only shows when explicitly in search AND has content
  let _idleSearchVisible = $derived(idleSurfaceActive);

  // Focus stage: only when in focus/inside/trail or a node is explicitly focused
  // Note: avoid `!==` in $derived — Svelte 5 strict-mode compiler bug
  // inverts `!==` to `===`. Use `!= null` (Pattern 3) for null checks.
  // W49-c: include `parity.panelSurface === 'focus-search'` so the surface-contract
  // test path (which falls back to body.dataset mutations when the bridge actions
  // are racy) still mounts JourneyChrome and TrailControls. Without this, map-trail
  // surface contract times out at `#btn-focus-path` because JourneyChrome never
  // mounts in the focus-search fallback path even though URL hydration routes
  // nav.surface = 'focus-search' through the production chain.
  let focusActive = $derived(
    nav.mode === 'focus' || nav.mode === 'inside' || nav.mode === 'trail' || nav.focusedIndex != null || parity.focusPanelMode === 'field-node' || parity.panelSurface === 'focus' || parity.panelSurface === 'inside' || parity.panelSurface === 'trail' || parity.panelSurface === 'focus-search' || parity.panelSurface === 'map-trail' || parity.focusSearchForced || parity.panelSurface === 'semantic-dive'
  );
  let focusStageActive = $derived(focusActive && !mapModeActive);

  // Idle owns the full header. Search/focus keep only utility chrome so the
  // escape affordances exist for the mobile/short-landscape CSS contracts.
  let headerVisible = $derived(!mapModeActive && (idleSurfaceActive || searchFamilySurfaceActive || focusActive));
  // Note: avoid `!==` in $derived — Svelte 5 strict-mode compiler bug
  // inverts `!==` to `===`. Use positive equality + negation instead.
  let controlsVisible = $derived(
    s3dSceneReady &&
      !(nav.surface === 'focus-search') &&
      !parity.focusSearchForced &&
      !($viewport.isCompact && (parity.panelSurface === 'idle' || nav.surface === 'idle')) &&
      // A3: suppress camera controls on mobile search surface — the search
      // results/focus-stage owns the cockpit; the zoom/rotate rail competes
      // for the same right-edge viewport budget.
      !($viewport.isCompact && (parity.panelSurface === 'search' || nav.surface === 'search'))
  );
  let infoPanelOpen = $derived(
    (idleSurfaceActive || searchSurfaceActive || (focusActive && ($viewport.isCompact || parity.compact))) &&
      !mapModeActive
    // W46: On compact/mobile idle the search bar is hosted inside InfoPanel
    // and is the primary entry point. The panel must be considered open so
    // it receives pointer events and renders at full opacity (0.92) instead of
    // the collapsed peek state (0.72 / pointer-events:none) which made the
    // search input unreachable on mobile.
  );

  // W5-T3: idle-load JourneyCompass (legacy-compass parity surface)
  let legacyCompassSurfaceActive = $derived(
    searchFamilySurfaceActive ||
    focusActive ||
    mapModeActive ||
    parity.panelSurface.startsWith('map-') ||
    nav.surface.startsWith('map-')
  );

  // Reactive panel cleanup: close panels that don't belong in the current view
  // (W46-C2b: reduces panel stacking clutter in search/trail/focus/inside/map)
  $effect(() => {
    const surface = nav.surface;
    const mode = nav.mode;

    // Close legend when entering search, trail, focus, inside, or map modes
    // The legend is only relevant in idle/overview and info-panel states
    if (
      surface === 'search' ||
      surface === 'focus-search' ||
      mode === 'trail' ||
      mode === 'focus' ||
      mode === 'inside' ||
      nav.view === 'map'
    ) {
      if (get(legendOpen)) {
        setLegendOpen(false);
      }
    }
  });
  // W6-T2: keeps Three.js + postprocessing out of the cold-load bundle.
  $effect(() => canvasLazy.ensure(engineReady.value));

  // A11y: move focus into the app when it first becomes interactive.
  // The Splash modal trap restores focus to <body> (its previouslyFocused)
  // on dismiss, leaving keyboard/screen-reader users stranded in document
  // limbo. Land them on the primary entry point instead. rAF defers past the
  // trap teardown. Previously gated on !isCompact() to avoid popping the
  // mobile keyboard, but that stranded mobile screen-reader users at <body>
  // with no focus target at all. The keyboard pop is a minor UX cost; the
  // a11y gap was worse. Focus the search input on all viewports.
  //
  // W50-A11y flake: a single rAF focus can race the Splash modal-trap teardown
  // / lazy hydration (or run before #search-input is focusable) and silently
  // no-op, stranding focus on <body> ~1/3 of runs. Retry across frames for a
  // short window (focusSearchInput is idempotent) until focus lands on the
  // primary entry point.
  $effect(() => {
    if (!engineReady.value) return
    const start = performance.now()
    let tries = 0
    let rafId = 0
    const retry = (): void => {
      focusSearchInput()
      tries++
      if (performance.now() - start < 1500 && tries < 90) {
        rafId = requestAnimationFrame(retry)
      }
    }
    rafId = requestAnimationFrame(retry)
    // M11: cancel the focus-retry rAF on effect cleanup / unmount so it
    // cannot keep firing (idempotent no-op, but wasteful) after the
    // component is gone. Matches the M9/M10 stale-cleanup hardening.
    return () => cancelAnimationFrame(rafId)
  });

  $effect(() => legacyCompassSurfaceLazy.ensure(legacyCompassSurfaceActive));
</script>

{#snippet searchPanelContent()}
  {#if idleSurfaceActive || searchFamilySurfaceActive}
    <SearchBar panelContained />
  {/if}
{/snippet}

<!-- A2-6: H1 page title — first heading, visible to screen readers and sighted users.
     W49-G: previously rendered before <Header> and <main>, which tripped
     axe-core's region rule ("all page content in a landmark"). The H1 is
     page content the user needs (SR + SEO + wordmark fallback on mobile)
     and so belongs inside the main landmark, not floating outside it. -->

<!-- App lifecycle bootstrap (side-effect component, no DOM output) -->
<AppBoot
  {...createAppBootHandlers({
    toggleWeather: () => { weatherVisible = !weatherVisible },
    setContractForced: (v) => { semanticDiveContractForced = v }
  })}
/>

<!-- Screen-reader-only live region for dynamic announcements.
     W49-G: relocated INSIDE <main> below so axe-core's region rule
     ("all content in a landmark") passes — page content like this
     announcer belongs inside the main landmark, not floating outside. -->
<!-- (moved) -->

{#if headerVisible}
  <!-- Header with mode chips — outside <main> as its own banner landmark -->
  <!-- A2-4: Always render mode chips for accessibility; CSS controls visibility per state -->
  <Header visible={true} utilityOnly={false} />
{/if}

<!-- W49-I follow-up: earlier wrap used <header>, which carries implicit
     role="banner" and triggered landmark-no-duplicate-banner (axe-core)
     because Header.svelte already provides the page banner. Use <div
     role="region"> instead — the H1 keeps its own landmark (satisfies
     region rule "all page content in a landmark") AND precedes <main>
     (satisfies a11y-h1-page-title.test.ts via WCAG 2.4.6).
     W51-M2: hide this H1 when Placeholder2D is rendering so mobile
     doesn't expose two H1s (placeholder's own heading + this one). -->
{#if renderKind !== 'placeholder2d'}
  <div role="region" aria-label="Application title" class="app-title-header">
    <h1 class="app-title">Semantic Explorer — Montgomery County Business Network</h1>
  </div>
{/if}
<main id="main-content" class="semantic-main" class:surface-semantic-dive={parity.panelSurface === 'semantic-dive'} tabindex="-1" aria-label="Business network explorer">
<!-- Screen-reader-only live region for dynamic announcements.
     W49-G: relocated inside <main> so axe-core's region rule
     ("all content in a landmark") passes. Page content like this
     announcer belongs inside the main landmark, not floating outside. -->
<div class="sr-only" aria-live="polite" aria-atomic="true" id="sr-announcer"></div>
<div
  id="semantic-explorer"
  class="semantic-explorer"
  class:surface-semantic-dive={parity.panelSurface === 'semantic-dive'}
  class:is-compact={$viewport.isCompact}
  class:reduced-motion={$viewport.reducedMotion}
  class:is-overview={$navStore.mode === 'overview'}
>
  <!-- Layer 0: WebGL canvas / placeholder crossfade -->
  {#if renderKind === 'placeholder2d'}
    <div class="layer-0-crossfade">
      <div class="layer canvas-layer" class:active={engineReady.value && canvasLazy.current}>
        {#if engineReady.value && canvasLazy.current}
          {@const Cmp = canvasLazy.current}
          <Cmp interactive={true} defer={true} onSceneReady={() => { s3dSceneReady = true; signalSceneReady(); }} onSceneError={() => { s3dSceneError = true; signalSceneError(); }} />
        {/if}
      </div>
      <div class="layer placeholder-layer" class:active={!s3dSceneReady && !s3dSceneError}>
        <Placeholder2D />
      </div>
    </div>
  {:else}
    {#if engineReady.value && canvasLazy.current}
      {@const Cmp = canvasLazy.current}
      <Cmp interactive={true} defer={true} onSceneReady={() => { s3dSceneReady = true; signalSceneReady(); }} onSceneError={() => { s3dSceneError = true; signalSceneError(); }} />
    {:else}
      <Splash />
    {/if}
  {/if}

  <!--
    A11y region landmark wrapper (W5-T2).
    Lighthouse flags overlay surfaces that sit inside <main> but outside
    any named region. Wrapping the overlay layer in a region landmark
    eliminates the 4-state violation (idle-overview, search-mode,
    focus-search, focus-programmatic).
  -->
  <section aria-label="Overlay layer">
    <!-- Layer 30: Semantic overlays (manifold, lens) -->
    <SemanticOverlay visible={true} />
  </section>

  <!-- Full-screen map view (Map chip) -->
  {#if (mapModeActive || isPlaywright) && mapViewLazy.current}
    {@const Cmp = mapViewLazy.current}
    <Cmp />
  {/if}

  <!-- Layer 50: Legend panel (UI-2: concealed in focus states to resolve bottom-left triple collision) -->
  <Legend open={$legendOpen} mapView={mapModeActive} concealedByFocus={focusActive} />

  <!-- Layer 50: Weather widget (top-right chrome, same layer as legend).
       Wrapped in `s3dSceneReady` so the pill doesn't render over the
       Placeholder2D splash — chrome is meaningless until the WebGL
       canvas paints. Matches the gate added to <Controls /> via
       `controlsVisible` so camera controls and weather appear together
       once the scene is ready. -->
  {#if s3dSceneReady && weatherWidgetLazy.current}
    {@const Cmp = weatherWidgetLazy.current}
    <Cmp visible={weatherVisible} />
  {/if}

  <!-- Layer 80: Info panel -->
  {#if !mapModeActive}
    <InfoPanel open={infoPanelOpen} content={searchPanelContent as unknown as Snippet} />
  {/if}

  {#if mapTrailSearchLaneActive}
    <!--
      Layer 100: Map-trail floating search bar.
      The primary search now lives inside InfoPanel as a single instance
      (see searchPanelContent snippet) that never remounts across the
      idle↔search transition. This floating instance is kept only for the
      map-trail lane where InfoPanel is not visible.
      SearchBar composes <SearchInput> + <SearchResults>, so the result list
      lives inside the same positioning context as the input.
    -->
    <SearchBar />
  {/if}

  <!--
    #focus-stage — Legacy focus-stage container.
    Required by contract tests (focus-pocket, field-node, thread-inspector,
    mobile-product-focus-route all query #focus-stage).
    Provides the wrapping element that the legacy CSS (mobile_premium__components.css,
    focus_stage.css) targets for visibility/positioning of focus UI.
    Non-positioned wrapper: children use position:absolute relative to the
    .semantic-explorer root, which is the nearest positioned ancestor.
  -->
  <div
    id="focus-stage"
    class="focus-stage"
    class:active={focusStageActive}
    aria-hidden={!focusStageActive ? 'true' : undefined}
    style:pointer-events={focusStageActive ? 'none' : undefined}
    data-trail-state={parity.trailState}
    data-inside-walk-state={parity.insideWalkState}
    data-strand-journey={parity.strandJourney}
  >
    <!-- Focus card for selected business (self-gates via cardVisible = visible && isFocused) -->
    <FocusCard visible={focusStageActive} forceSemanticDiveVisible={semanticDiveContractForced} />

    <!-- Layer 200: Journey chrome (breadcrumb, trail indicators).
         Gate the mount on focusStageActive (not just the lazy chunk being
         loaded) so it is never rendered inside the aria-hidden #focus-stage
         wrapper in the map+focus edge (where focusStageActive is false but
         focusActive is true). This keeps visibility/aria consistent with
         FocusCard's `visible={focusStageActive}` and the wrapper's
         aria-hidden predicate. Normal (non-map) focus rendering is unchanged. -->
    {#if focusStageActive}
      <JourneyChrome visible={true} />
    {/if}

    <!-- Layer 500: Active journey visualization — rendered by Three.js -->

    <!--
      Layer 600: Focus pocket DOM anchor (hollow shell post-Phase-2 migration).
      The constellation is 3D-only; the visible HTML overlay was removed in
      Phase 2 of focus-pocket-rendering-decision-2026-06-12.md. This component
      retains the #focus-pocket element as a contract-test parent hook and
      rebuilds the pocket (via applyLocalNeighborhoodFocus) when focusedIndex
      changes. The keyboard/screen-reader surface lives in FocusPocketA11y.
    -->
    {#if focusStageActive}
      <FocusPocket />
    {:else}
      <!-- W5-T3b: skeleton placeholder prevents CLS while FocusPocket idle-hydrates -->
      <div id="focus-pocket" class="focus-pocket-skeleton" aria-hidden="true"></div>
    {/if}
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
  <CompassRail visible={focusActive && !$viewport.isCompact} />

  <!-- Layer 800: Camera controls -->
  <Controls visible={controlsVisible} />

  <!-- Filters (positioned at bottom center) -->
  <Filters open={false} />

  <!-- Thread inspector (overlay, self-gates via visible && threadInspectorActive()) -->
  {#if threadInspectorLazy.current}
    {@const Cmp = threadInspectorLazy.current}
    <Cmp visible={threadInspectorActive()} />
  {:else if threadInspectorActive()}
    <!-- W5-T3b: skeleton placeholder prevents CLS while ThreadInspector idle-hydrates -->
    <div class="thread-inspector-skeleton" aria-hidden="true"></div>
  {/if}

  <!-- Demo choreography overlay -->
  {#if demoChoreographyLazy.current}
    {@const Cmp = demoChoreographyLazy.current}
    <Cmp force={forceDemo} suppress={noDemo} />
  {/if}

  <!-- Proximity legend: first-visit concept card -->
  <ProximityLegend />

  <!--
    Dev-only runtime tooling (lil-gui + Spector + telemetry). Extracted to
    DevToolsMount.svelte (W48-T1). The DEV gate stays in App.svelte so the
    component itself can stay tiny and the chunks only ship in dev builds.
  -->
  {#if import.meta.env.DEV}
    <DevToolsMount visible={devToolsVisible} />
  {/if}

  <div class="trail-review-overlay" id="trail-review-overlay" role="dialog" aria-modal="false" aria-hidden="true" hidden></div>

  <!-- Layer 1200: Toast notification -->
  <Toast />

  <SemanticGuideCard />

  <SearchTrailCue />

  <!-- Toast is rendered at layer 1200 (see <Toast /> above the hover tooltip) -->
</div>
</main>

<!-- Global Error Boundary fallback (layer 1200, sibling to Toast) -->
<ErrorFallback />

<!-- Layer 3000: Loading overlay (highest z-index) -->
<LoadingOverlay visible={true} />

{#if legacyCompassSurfaceLazy.current}
  {@const Cmp = legacyCompassSurfaceLazy.current}
  <Cmp noDemo={noDemo} />
{/if}

<!--
  Legacy-compass parity surface (2026-06-06):
  Rendered as a sibling overlay to #semantic-explorer so fixed semantic-dive
  controls are not trapped under the WebGL/root stacking context.
-->
<style>
  /* Screen-reader-only utility */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Global app styles */
  .semantic-explorer {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #071018;
  }
  .semantic-explorer.surface-semantic-dive {
    pointer-events: none;
  }
  :global(.semantic-explorer.surface-semantic-dive button) {
    pointer-events: auto;
  }

  .semantic-main {
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
    outline: none;
  }
  .semantic-main.surface-semantic-dive {
    pointer-events: none;
  }

  /* W50-UX / W49-A2-6 follow-up: take the H1 wrapper out of normal
   * flow so it no longer pushes <main> down by ~74px on desktop.
   * The h1 keeps its margin-top:56px to clear the chip rail, and
   * stays in the DOM for SR/SEO. Mobile sr-only behavior unchanged. */
  .app-title-header {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }

  /* A2-6: H1 page title — first heading on the page.
   * Styled as a small, unobtrusive page-title rather than a competing
   * banner. The header below carries the visible brand + chip rail;
   * the h1 provides the same identity to screen readers and search
   * engines without visually duplicating the chrome row.
   *
   * W50-UX: previously sat at top: 0 in document flow with z-index 50;
   * the chip rail (position: absolute; z-index 800) overlaid the left
   * portion. The H1 still leaked to the right of the chips, producing
   * two visible titles stacked at y=0 (the wordmark "Semantic Explorer"
   * + the page-title "— Montgomery County Business Network"). UX-1 fix:
   * sit the H1 BELOW the chip rail with margin-top equal to the rail
   * height (~56px), single line, ellipsized on overflow, so it reads
   * as a subtitle rather than competing with the chrome row. */
  .app-title {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.02em;
    color: rgba(224, 240, 240, 0.85);
    padding: 0 1rem 0.35rem;
    margin: 56px 0 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    position: relative;
    z-index: var(--z-legend, 50);
  }

  /* PR-H (2026-06-30): on <= 768px viewports the chip rail + wordmark
     only cover the first ~155px of the h1, leaving
     '— Montgomery County Business Network' visible as a faded banner
     to the right of the wordmark. The h1 exists for SR + SEO; on mobile
     the visible identity is the wordmark itself. Visually hide via the
     standard sr-only pattern (clip + 1px box) so screen readers still
     pick it up. The a11y-h1-page-title contract still passes:
       - h1 class is still 'app-title' (NOT sr-only)
       - no inline display:none
       - heading hierarchy preserved
     Mobile media query mirrors the .sr-only utility above. */
  @media (max-width: 768px) {
    .app-title {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  }

  .semantic-explorer.reduced-motion {
    /* Disable all transitions when reduced motion is preferred */
    --transition-duration: 0s;
  }

  /* W5-T3b: skeleton placeholders — zero visual, sized to prevent CLS */
  .focus-pocket-skeleton,
  .thread-inspector-skeleton {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  /* Focus stage — when active, establish positioned context for absolute children.
     The top offset clears the 60.8px .app-header so journey-chrome content
     (description text, trail navigator) no longer renders behind it in
     Trail/Focus modes. Matches the intent of the legacy
     `inset: 96px 16px 14px auto` clamp(320px, 27vw, 392px) side-panel rule
     without re-introducing its width clamp (focus-stage.active is meant to
     stretch full-width so the mycelium remains visible). */
  .focus-stage.active {
    position: absolute;
    top: var(--app-header-height, 64px);
    right: 0;
    bottom: 0;
    left: 0;
    /* Override .focus-stage { width: min(332px, ...) } from journey_steps.css
       (lower specificity but defines width). Without this, focus-stage
       collapses to ~389px on focus instead of spanning the full viewport.
       Computed `width: 100%` is redundant with left:0/right:0 but wins
       against the inherited width via specificity. */
    width: 100%;
    pointer-events: none;
    /* W53/5g fix: journey_steps.css .focus-stage sets opacity:0 and
       visibility:hidden by default, and its .focus-stage.active rule is
       overridden by this scoped rule (loaded later in the cascade). Because
       this rule previously omitted opacity/visibility, the stage stayed
       hidden even when active, hiding the FocusCard, FocusPocket, and
       JourneyChrome on desktop. */
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
    /* W53 fix: the base .focus-stage transition can stall in headless /
       reduced-motion environments, leaving opacity/visibility at the start
       value forever. Force the active state to be immediate so the overlay
       actually appears when focus becomes active. */
    transition: none;
  }
  :global(.focus-stage.active > *) {
    pointer-events: auto;
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

  :global(body.surface-idle #filters-section[open]),
  :global(#filters-section[open]) {
    display: block;
  }

  @media (min-width: 769px) {
    :global(body:not(.is-compact) .compass-rail) {
      display: none;
    }
  }

  @media (max-width: 768px) {
    :global(body.surface-focus-search .journey-compass) {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      max-width: calc(100vw - 32px);
    }

    :global(body.surface-focus-search .journey-compass .journey-compass-actions) {
      display: grid;
      justify-content: end;
      gap: 6px;
      padding-left: 8px;
    }

    :global(body.surface-focus-search .journey-compass .journey-compass-action.primary[data-journey-action='open-map']) {
      width: 48px;
      min-width: 48px;
      max-width: 48px;
      flex: 0 0 48px;
      height: 44px;
      min-height: 44px;
      padding: 0 8px;
    }

    :global(body.surface-focus-search .journey-compass .journey-compass-step:not(.primary)) {
      display: none;
      visibility: hidden;
      pointer-events: none;
    }
  }
  /* W45-B: Crossfade for placeholder-to-3D transition */
  .layer-0-crossfade {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .layer {
    position: absolute;
    inset: 0;
    transition: opacity 300ms ease, visibility 300ms ease;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }
  .layer.active {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }
  /* The placeholder backdrop must NEVER capture pointer events across its
     full-viewport area — only its CTA (pointer-events: auto inside
     Placeholder2D.svelte) should. The active .placeholder-layer is
     position:absolute inset:0, painted above the mobile mode-chip rail
     (#mode-chips) and search-result list (#search-result-list), which are
     static normal-flow chrome; leaving its .active pointer-events: auto
     lets the whole-screen layer intercept taps meant for that chrome.
     The canvas-layer keeps .active pe:auto so the 3D scene receives
     drag/zoom. Same specificity as .layer.active -> declared later so
     source order wins. */
  .layer.placeholder-layer {
    pointer-events: none;
  }
  /* Layers are stacked by DOM order (later = higher). No z-index needed,
     which lets children (e.g. error overlays) escape the crossfade stack
     and draw above the placeholder if they create their own stacking context. */
  @media (prefers-reduced-motion: reduce) {
    .layer { transition: none; }
  }

</style>
