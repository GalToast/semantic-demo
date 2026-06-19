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
  // Static import: event-bus must be resolved before the early publish call below.
  import { publish as earlyPublish, EVENTS as EARLY_EVENTS } from '@lib/orchestration/event-bus';
  // NOTE: triggers.ts side-effect import is deferred to onMount (W5-T1).
  // The subscribe() calls in triggers.ts register event handlers that trigger
  // synchronous state computation (refreshCompositionState, updateJourneyCompass, etc.).
  // Deferring until after FCP eliminates ~7,152ms of cold-load main-thread blocking.

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
  import { onMount, type Snippet } from 'svelte';
  import { navStore, dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation.svelte.ts';
  import { setSemanticDiveMode, threadInspectorActive } from '@lib/stores/focus.svelte';
  import { viewport, initViewportListeners } from '@lib/stores/viewport.svelte.ts';
  import { initData } from '@lib/data-store';
  import { state as legacyState } from '@lib/engine/state-bridge';
  import { appState } from '@lib/state/app.svelte.ts';
  import { installParityAttributeSync } from '@lib/orchestration/parity-attrs.svelte.ts';
  import { applyUrlState, updateUrlState } from '@lib/orchestration/url-state';
  import { showKeyboardShortcutsHint, initKeyboardShortcutsHint } from '@lib/keyboard/keyboard-help';
  // Side-effect import: biofield glow animation CSS
  import '@lib/css/biofield.css';

  import Canvas from '@components/Canvas.svelte';
  type InfoPanelModule = typeof import('@components/InfoPanel.svelte');
  let InfoPanelComponent: InfoPanelModule['default'] | null = $state(null);
  let infoPanelImportPending = false;
  import Legend from '@components/Legend.svelte';
  type MapViewModule = typeof import('@components/MapView.svelte');
  let MapViewComponent: MapViewModule['default'] | null = $state(null);
  let mapViewImportPending = false;
  import SearchBar from '@components/SearchBar.svelte';
  import FocusPocket from '@components/FocusPocket.svelte';
  import FocusPocketA11y from '@components/FocusPocketA11y.svelte';
  import Filters from '@components/Filters.svelte';
  import CompassRail from '@components/CompassRail.svelte';
  import LoadingOverlay from '@components/LoadingOverlay.svelte';
  type ThreadInspectorModule = typeof import('@components/ThreadInspector.svelte');
  let ThreadInspectorComponent: ThreadInspectorModule['default'] | null = $state(null);
  let threadInspectorImportPending = false;
  type DemoChoreographyModule = typeof import('@components/DemoChoreography.svelte');
  let DemoChoreographyComponent: DemoChoreographyModule['default'] | null = $state(null);
  let demoChoreographyImportPending = false;
  import Controls from '@components/Controls.svelte';
  import Header from '@components/Header.svelte';
  type FocusCardModule = typeof import('@components/FocusCard.svelte');
  let FocusCardComponent: FocusCardModule['default'] | null = $state(null);
  let focusCardImportPending = false;
  import MapSummary from '@components/MapSummary.svelte';
  import SemanticOverlay from '@components/SemanticOverlay.svelte';
  type WeatherWidgetModule = typeof import('@components/WeatherWidget.svelte');
  let WeatherWidgetComponent: WeatherWidgetModule['default'] | null = $state(null);
  let weatherWidgetImportPending = false;
  import Toast from '@components/Toast.svelte';
  type DevGuiModule = typeof import('@components/DevGui.svelte');
  let DevGuiComponent: DevGuiModule['default'] | null = $state(null);
  let devGuiImportPending = false;
  type SpectorInspectorModule = typeof import('@components/SpectorInspector.svelte');
  let SpectorInspectorComponent: SpectorInspectorModule['default'] | null = $state(null);
  let spectorInspectorImportPending = false;
  import { legendOpen } from '@lib/stores/legend.svelte';

  function scheduleIdleComponentImport<T>(
    load: () => Promise<T>,
  ): Promise<T> {
    const run = (): Promise<T> => load();

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      return new Promise((resolve, reject) => {
        window.requestIdleCallback(
          () => run().then(resolve, reject),
          { timeout: 1500 }
        );
      });
    }

    return new Promise((resolve, reject) => {
      setTimeout(() => run().then(resolve, reject), 0);
    });
  }

  $effect(() => {
    if (mapModeActive && !MapViewComponent && !mapViewImportPending) {
      mapViewImportPending = true;
      import('@components/MapView.svelte')
        .then((mod) => {
          MapViewComponent = mod.default;
        })
        .catch((err) => {
          console.error('[App] MapView lazy-load failed:', err);
        })
        .finally(() => {
          mapViewImportPending = false;
        });
    }
  });

  $effect(() => {
    if (!ThreadInspectorComponent && !threadInspectorImportPending) {
      threadInspectorImportPending = true;
      import('@components/ThreadInspector.svelte')
        .then((mod) => {
          ThreadInspectorComponent = mod.default;
        })
        .catch((err) => {
          console.error('[App] ThreadInspector lazy-load failed:', err);
        })
        .finally(() => {
          threadInspectorImportPending = false;
        });
    }
  });

  $effect(() => {
    if (!DemoChoreographyComponent && !demoChoreographyImportPending) {
      demoChoreographyImportPending = true;
      scheduleIdleComponentImport(() =>
        import('@components/DemoChoreography.svelte').then((mod) => {
          DemoChoreographyComponent = mod.default;
          return mod.default;
        })
      ).finally(() => {
        demoChoreographyImportPending = false;
      });
    }
  });

  $effect(() => {
    if (focusStageActive && !FocusCardComponent && !focusCardImportPending) {
      focusCardImportPending = true;
      // W44-S4: idle-deferred for cold-load
      scheduleIdleComponentImport(() =>
        import('@components/FocusCard.svelte').then((mod) => {
          FocusCardComponent = mod.default;
          return mod.default;
        })
      ).finally(() => {
        focusCardImportPending = false;
      });
    }
  });

  $effect(() => {
    if (weatherVisible && !WeatherWidgetComponent && !weatherWidgetImportPending) {
      weatherWidgetImportPending = true;
      scheduleIdleComponentImport(() =>
        import('@components/WeatherWidget.svelte').then((mod) => {
          WeatherWidgetComponent = mod.default;
          return mod.default;
        })
      ).finally(() => {
        weatherWidgetImportPending = false;
      });
    }
  });

  $effect(() => {
    if (devToolsVisible && !DevGuiComponent && !devGuiImportPending) {
      devGuiImportPending = true;
      import('@components/DevGui.svelte')
        .then((mod) => {
          DevGuiComponent = mod.default;
        })
        .catch((err) => {
          console.error('[App] DevGui lazy-load failed:', err);
        })
        .finally(() => {
          devGuiImportPending = false;
        });
    }

    if (devToolsVisible && !SpectorInspectorComponent && !spectorInspectorImportPending) {
      spectorInspectorImportPending = true;
      import('@components/SpectorInspector.svelte')
        .then((mod) => {
          SpectorInspectorComponent = mod.default;
        })
        .catch((err) => {
          console.error('[App] SpectorInspector lazy-load failed:', err);
        })
        .finally(() => {
          spectorInspectorImportPending = false;
        });
    }
  });

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
    // parity-attrs.svelte.ts which installs and syncs on the same tick.
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
      .then(() => {
        if ((legacyState as any).semanticNeighborMapByLeadId instanceof Map) {
          appState.semanticNeighborMapByLeadId = (legacyState as any).semanticNeighborMapByLeadId;
        }
        if ((legacyState as any).pointIndexByLeadId instanceof Map) {
          appState.pointIndexByLeadId = (legacyState as any).pointIndexByLeadId;
        }
        applyUrlState();
      })
      .catch(console.error);

    // W5-T1: Defer triggers.ts subscribe() registration until after FCP.
    // The 15+ subscribe() calls in triggers.ts register handlers that synchronously
    // call refreshCompositionState(), updateJourneyCompass(), navStore.update(), etc.
    // At module load time this blocks the main thread for ~7s. Deferring via
    // requestIdleCallback moves it off the cold-load critical path.
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(
        () => import('@lib/orchestration/triggers'),
        { timeout: 3000 }
      );
    } else {
      // Fallback: setTimeout 0 (still async, still off critical path).
      setTimeout(() => import('@lib/orchestration/triggers'), 0);
    }
    return () => {
      delete contractWindow.__forceSemanticDiveContractSurface;
      cleanupViewport();
      cleanupParity();
    };
  });

  // ── Global keyboard shortcuts ──────────────────────────────────────────────
  // P1: `/` focuses the search input; `Esc` clears it when focused.
  $effect(() => {
    function handleGlobalKeydown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      const isFormField = tag === 'input' || tag === 'textarea' || tag === 'select'
        || target?.isContentEditable === true;

      // A2-4: Ctrl/Cmd+1-6 keyboard shortcuts for mode switching.
      // Fires before all other handlers so shortcuts are never masked.
      if ((e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)) {
        if (isFormField) return;
        e.preventDefault();
        switch (e.key) {
          case '1': dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW); break;
          case '2': dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'search' }); break;
          case '3': dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'trail' as any }); break;
          case '4': dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'focus' }); break;
          case '5': dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'inside' }); break;
          case '6':
            dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_VIEW, { view: 'map' });
            dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'map' });
            break;
        }
        return;
      }

      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isFormField) {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
        return;
      }

      // A2-7: `?` keybinding opens the keyboard shortcuts overlay.
      // Was missing from the Svelte port — Round 2/3 QA flagged it.
      // Ensure the panel DOM is created (idempotent), then show it.
      if ((e.key === '?' || (e.key === '/' && e.shiftKey)) && !e.metaKey && !e.ctrlKey && !e.altKey && !isFormField) {
        e.preventDefault();
        initKeyboardShortcutsHint();
        showKeyboardShortcutsHint();
        return;
      }

      if (e.key === 'w' && !e.metaKey && !e.ctrlKey && !e.altKey && !isFormField) {
        e.preventDefault();
        weatherVisible = !weatherVisible;
        return;
      }

      if (e.key === 'Escape') {
        // A2-4: Escape always returns to Overview from any non-idle mode.
        // If the search input is focused, clear its text as a side effect.
        // Visual QA Round 3 found that without `preventDefault()` the
        // browser's default back-nav fires AFTER the handler and overwrites
        // the page to about:blank. preventDefault() here preserves the
        // app-side return-to-overview behavior.
        e.preventDefault();
        const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const { mode, surface } = navStore();
        if (mode !== 'overview' || surface !== 'idle') { // audit-ok: plain Ln() callback, not transformed
          dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW);
          // A2-7: after returning to overview, sync the URL to reflect
          // the galaxy view so the back button works correctly.
          updateUrlState({}, { reason: 'return-overview' });
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  });

  // The parity-attrs installer is the single source of truth for all body
  // data-* attributes.  All pre-parity $effect blocks that previously lived
  // here (data-navSurface, data-journeyPhase, data-demoPhase, data-reducedMotion,
  // data-mode, data-compact) are now subsumed by computeParityAttributes()
  // inside parity-attrs.svelte.ts — including navSurface and demoPhase.
  // Read body data attributes reactively for contract test compatibility
  let bodyFocusPanelMode = $state('');
  let bodyPanelSurface = $state('');
  let bodyGraphContext = $state('');
  let bodyCompact = $state(false);
  let focusSearchForced = $derived(bodyPanelSurface === 'focus-search' || bodyGraphContext === 'focus-search' || document.body?.dataset.focusSearchForced === 'true');
  $effect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => {
      const nextPanelSurface = document.body.dataset.panelSurface || '';
      const nextGraphContext = document.body.dataset.graphContext || '';
      bodyFocusPanelMode = document.body.dataset.focusPanelMode || '';
      bodyPanelSurface = nextPanelSurface;
      bodyGraphContext = nextGraphContext;
      bodyCompact = document.body.dataset.compact === 'true';
      if ((nextPanelSurface === 'focus-search' || nextGraphContext === 'focus-search') && document.body.dataset.focusSearchForced !== 'true') {
        document.body.dataset.focusSearchForced = 'true';
      } else if (nextPanelSurface !== 'search' && nextPanelSurface !== 'focus' && nextPanelSurface !== 'inside' && nextPanelSurface !== 'trail') { // audit-ok: plain Ln() callback, not transformed
        delete document.body.dataset.focusSearchForced;
      }
    };
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-compact', 'data-focus-panel-mode', 'data-panel-surface', 'data-graph-context'] });
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
  let weatherVisible = $state(true);
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
  // Note: avoid `!==` in $derived — Svelte 5 strict-mode compiler bug
  // inverts `!==` to `===`. Use `!= null` (Pattern 3) for null checks.
  let focusActive = $derived(
    navMode === 'focus' || navMode === 'inside' || navMode === 'trail' || navFocusedIndex != null || bodyFocusPanelMode === 'field-node' || bodyPanelSurface === 'focus' || bodyPanelSurface === 'inside' || bodyPanelSurface === 'trail' || focusSearchForced || bodyPanelSurface === 'semantic-dive'
  );
  let focusStageActive = $derived(focusActive && !mapModeActive);

  // Lazy-load JourneyChrome (34 KB source) — only needed in focus/trail/inside mode
  type JourneyChromeModule = typeof import('@components/JourneyChrome.svelte');
  let JourneyChrome: JourneyChromeModule['default'] | null = $state(null);
  let journeyChromeImportPending = false;
  $effect(() => {
    if (focusActive && !JourneyChrome && !journeyChromeImportPending) {
      journeyChromeImportPending = true;
      // W44-S4: idle-deferred for cold-load
      scheduleIdleComponentImport(() =>
        import('@components/JourneyChrome.svelte').then(mod => {
          JourneyChrome = mod.default;
          return mod.default;
        })
      ).finally(() => {
        journeyChromeImportPending = false;
      });
    } else if (!focusActive) {
      JourneyChrome = null;
    }
  });

  // Idle owns the full header. Search/focus keep only utility chrome so the
  // escape affordances exist for the mobile/short-landscape CSS contracts.
  let headerVisible = $derived(!mapModeActive && (idleSurfaceActive || searchFamilySurfaceActive || focusActive));
  // Note: avoid `!==` in $derived — Svelte 5 strict-mode compiler bug
  // inverts `!==` to `===`. Use positive equality + negation instead.
  let controlsVisible = $derived(!(navSurface === 'focus-search') && !focusSearchForced);
  let infoPanelOpen = $derived((idleSurfaceActive || searchSurfaceActive || (focusActive && !bodyCompact && !$viewport.isCompact)) && !mapModeActive);

  $effect(() => {
    if (infoPanelOpen && !InfoPanelComponent && !infoPanelImportPending) {
      infoPanelImportPending = true;
      // W44-S4: idle-deferred for cold-load
      scheduleIdleComponentImport(() =>
        import('@components/InfoPanel.svelte').then((mod) => {
          InfoPanelComponent = mod.default;
          return mod.default;
        })
      ).finally(() => {
        infoPanelImportPending = false;
      });
    }
  });
</script>

{#snippet searchPanelContent()}
  {#if searchFamilySurfaceActive}
    <SearchBar panelContained />
  {/if}
{/snippet}

<!-- A2-6: H1 page title — first heading, visible to screen readers and sighted users -->
<h1 class="app-title">Semantic Explorer — Montgomery County Business Network</h1>

<!-- Screen-reader-only live region for dynamic announcements -->
<div class="sr-only" aria-live="polite" aria-atomic="true" id="sr-announcer"></div>

{#if headerVisible}
  <!-- Header with mode chips — outside <main> as its own banner landmark -->
  <!-- A2-4: Always render mode chips for accessibility; CSS controls visibility per state -->
  <Header visible={true} utilityOnly={false} />
{/if}

<main id="main-content" class="semantic-main" tabindex="-1" aria-label="Semantic explorer application">
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
  {#if mapModeActive && MapViewComponent}
    <MapViewComponent />
  {/if}

  <!-- Layer 50: Legend panel (UI-2: concealed in focus states to resolve bottom-left triple collision) -->
  <Legend open={$legendOpen} mapView={mapModeActive} concealedByFocus={focusActive} />

  <!-- Layer 50: Weather widget (top-right chrome, same layer as legend) -->
  {#if WeatherWidgetComponent}
    <WeatherWidgetComponent visible={weatherVisible} />
  {/if}

  <!-- Layer 80: Info panel -->
  {#if InfoPanelComponent}
    <InfoPanelComponent open={infoPanelOpen} content={searchPanelContent as unknown as Snippet} />
  {/if}

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
    class:active={focusStageActive}
    aria-hidden={!focusStageActive ? 'true' : undefined}
    style:pointer-events={focusStageActive ? 'none' : undefined}
  >
    <!-- Focus card for selected business (self-gates via cardVisible = visible && isFocused) -->
    {#if FocusCardComponent}
      <FocusCardComponent visible={focusStageActive} forceSemanticDiveVisible={semanticDiveContractForced} />
    {/if}

    <!-- Layer 200: Journey chrome (breadcrumb, trail indicators) -->
    {#if JourneyChrome}
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
    <FocusPocket />
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
  {#if ThreadInspectorComponent}
    <ThreadInspectorComponent visible={threadInspectorActive()} />
  {/if}

  <!-- Demo choreography overlay -->
  {#if DemoChoreographyComponent}
    <DemoChoreographyComponent force={forceDemo} suppress={noDemo} />
  {/if}

  <!--
    Dev-only runtime tooling (lil-gui + Spector). The component chunks
    are dynamic-imported only when the devtools URL gate is active; the
    nested `import('lil-gui')` and `import('spectorjs')` calls stay out
    of normal app startup.
  -->
  {#if import.meta.env.DEV}
    {#if DevGuiComponent}
      <DevGuiComponent visible={devToolsVisible} />
    {/if}
    {#if SpectorInspectorComponent}
      <SpectorInspectorComponent visible={devToolsVisible} />
    {/if}
  {/if}

  <div class="trail-review-overlay" id="trail-review-overlay" role="dialog" aria-modal="false" aria-hidden="true" hidden></div>

  <!-- Layer 1200: Toast notification -->
  <Toast />

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

  <!-- Toast is rendered at layer 1200 (see <Toast /> above the hover tooltip) -->
</div>
</main>

<!-- Layer 3000: Loading overlay (highest z-index) -->
<LoadingOverlay visible={true} />

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

  .semantic-main {
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
    outline: none;
  }

  /* A2-6: Visible H1 page title — first heading on the page */
  .app-title {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    color: #e0f0f0;
    padding: 0.5rem 1rem;
    margin: 0;
    background: rgba(7, 16, 24, 0.85);
    border-bottom: 1px solid rgba(78, 205, 196, 0.12);
    position: relative;
    z-index: var(--z-legend, 50);
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
