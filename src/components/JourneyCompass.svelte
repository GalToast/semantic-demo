<!--
  @components/JourneyCompass.svelte

  Renders the legacy-compatible DOM structure that
  vector-explorer-polished.html places inside <body>:

    <section id="journey-compass" class="journey-compass" data-phase="..." data-density="...">
      <div id="journey-compass-kicker"></div>
      <div id="journey-compass-title"></div>
      <div id="journey-compass-note"></div>
      <div class="journey-compass-actions">
        <button type="button" id="btn-journey-primary" aria-label="Begin primary journey step"></button>
        <button type="button" id="btn-journey-secondary" aria-label="Begin secondary journey step"></button>
    <button type="button" id="btn-journey-tertiary" aria-label="Begin tertiary journey step"></button>
      </div>
    </section>
    <div id="map-trail-strip" hidden></div>
    <button type="button" id="btn-focus-dive-legacy" hidden>...</button>

  This is the Svelte-side replacement for the DOM that
 + semantic-dive-ui.js
  build imperatively. The component:

    1. Renders the same DOM IDs the legacy CSS / hit-test
       contract expects.
    2. Mirrors the same data-* attributes the legacy
       updateJourneyCompass() / syncSemanticDiveUi() write
       imperatively.
    3. Wires the same click handlers to the same actions
       the legacy executeJourneyCompassAction() handles.

  The body data-* attribute mirror lives in
  src/lib/orchestration/parity-attrs.svelte.ts (single source of
  truth for the parity layer).
-->
<script lang="ts">
  import { appState } from '@lib/state/app.svelte';
  import { journeyStore, JOURNEY_COMPASS_PHASE_ORDER } from '@lib/stores/journey.svelte.ts';
  import type { JourneyStoreState } from '@lib/stores/journey.svelte.ts';
  import { focusStore } from '@lib/stores/focus.svelte.ts';
  import type { FocusStoreState } from '@lib/stores/focus.svelte.ts';
  import { dataLoadState } from '@lib/data-store';
  import { viewport } from '@lib/stores/viewport.svelte.ts';
  import {
    getJourneyCompassState,
    type CompassStateContext
  } from '@lib/journey/compass-state';
  import {
    getJourneyCompassPresentationState,
    executeJourneyCompassAction,
    type CompassPresentationState
  } from '@lib/orchestration/compass-controller';
  import { JOURNEY_ACTIONS, type CompassAction } from '@lib/stores/compass.svelte.ts';
  import { parityMap, getBypassAttr } from '@lib/orchestration/parity-attrs.svelte';
  import CompassStepIndicators from '@lib/components/journey/CompassStepIndicators.svelte';
  import CompassHeader from '@lib/components/journey/CompassHeader.svelte';
  import CompassActionButton from '@lib/components/journey/CompassActionButton.svelte';
  import CompassDiveSurface from '@lib/components/journey/CompassDiveSurface.svelte';

  interface Props {
    /** Suppress the compass in overview mode when URL has ?nodemo=1 */
    noDemo?: boolean;
  }

  let { noDemo = false }: Props = $props();

  // ── Reactive state ────────────────────────────────────────────────────────

  // We re-read the derived compass state every store change. This is the
  // Svelte equivalent of the legacy updateJourneyCompass() call that
  // the EVENT bus fires on every state change.
  // The reactive $effect below recomputes both on every store change.
  // Initialize with defaults rather than calling state-producing functions
  // at init, which would capture a stale snapshot. The $effect subscriptions
  // below populate the real values on the first reactive tick.
  let compass: CompassStateContext = $state({
    phase: 'overview',
    kicker: '',
    title: '',
    note: '',
    primaryAction: { label: '', action: '' },
    secondaryAction: null,
    tertiaryAction: null
  });
  let navState = $derived(appState.navState);
  // Initialize with defaults (not function snapshots) so template reads
  // (`journeyState.depth >= 1`) don't throw during the first render tick
  // before the $effect subscriptions populate the real values.
  let journeyState = $state<JourneyStoreState>({
    phase: 'overview', trail: [], cursor: -1, depth: 0,
    threadCandidates: [], threadReasonByIndex: new Map(),
    threadSource: 'geometric-fallback', lastTraversalReason: null,
    terrainHandoffPhase: 'idle', routeExplorationPhase: 'idle',
    routeChoreographyPhase: 'overview', selectedId: null,
    selectedStopIndex: null, neighbors: [],
    compass: { phase: 'idle' as const, currentAction: 'none' as const,
      previousAction: 'none' as const, lastTransitionAt: 0 },
    walkHistory: [], trailDepth: 0, walkHistoryIndices: [],
    trailSeedIndex: null
  });
  let focusState = $state<FocusStoreState>({
    pocketNodes: [], pocketMeta: null, pocketRoleByIndex: new Map(),
    pocketMotionByIndex: new Map(), pocketTransitionStartedAt: 0,
    nodesAreSettling: false, semanticDiveMode: false,
    strandContinuityPhase: 'idle', inspectedStrandIndex: null,
    pinnedThreadIndex: null, threadInspectorPointerInside: false,
    canvasThreadInspectionClearTimer: null, selectedBusiness: null,
    infoPanelOpen: true, pocketListVisible: false,
    pocketRoleFilter: 'all', settling: false,
    transitionMode: 'idle', transitionStartedAt: 0,
    orbitSlack: { phase: 'idle', reason: '', startedAt: 0,
      targetShift: 0, cameraShift: 0, distanceBefore: 0,
      distanceAfter: 0, maxDistance: 5.5, rotateSpeed: 0.6,
      panSpeed: 0.5 },
    threadInspector: { active: false, source: 'none',
      inspectedIndex: null, pinnedIndex: null, pointerInside: false,
      segmentCount: 0, braidCount: 0, endpointCount: 0 }
  });

  // Subscribe to all stores that the legacy updateJourneyCompass() reacts to.
  // The hybrid callable stores return snapshots, so explicit subscriptions keep
  // this parity surface current after focus and trail transitions.
  $effect(() => {
    const refreshCompass = () => {
      compass = getJourneyCompassState();
    };
    const unsubJourney = journeyStore.subscribe((state) => {
      journeyState = state;
      refreshCompass();
    });
    const unsubFocus = focusStore.subscribe((state) => {
      focusState = state;
      refreshCompass();
    });
    // Track navState dependency, then refresh (replaces navStore.subscribe mirror)
    void navState;
    refreshCompass();
    return () => {
      unsubJourney();
      unsubFocus();
    };
  });

  // Presentation is derived from the live compass state. This avoids
  // the "captures initial value" lint warning that comes from calling
  // a function with a $state value at init time.
  let presentation: CompassPresentationState = $derived(
    getJourneyCompassPresentationState(compass)
  );

  // ── Reactive data-attr strings (from stores, not body) ──────────────────

  let phase = $derived(compass.phase || 'overview');
  let density = $derived(presentation.density);
  let copy = $derived(presentation.copy);
  let actionsProfile = $derived(presentation.actions);
  let navigationOwner = $derived(presentation.navigationOwner);
  let navSurface = $derived(navState.surface);

  // Body attribute mirrors — derived from parityMap (single source of truth
  // kept in sync by installParityAttributeSync() in parity-attrs.svelte.ts).
  let bodyPanelSurface = $derived(parityMap.panelSurface || '');
  let bodyPanelSurfaceDetail = $derived(parityMap.panelSurfaceDetail || 'none');
  let bodyFocusedNode = $derived(parityMap.focusedNode || '');
  let bodyTrailDepth = $derived(parityMap.trailDepth || '');
  let bodyAppTrailDepth = $derived(parityMap.trailDepth || '');
  let bodySemanticDive = $derived(parityMap.semanticDive || '');
  let bodyCanStepInside = $derived(
    (journeyState.depth >= 1 || navState.trailDepth >= 1)
      && navState.focusedIndex != null
      && !focusState.semanticDiveMode
  );

  // Read body data-focus-panel-mode reactively via parity-attrs bypass accessor
  // (shared MutationObserver inside parity-attrs.svelte.ts owns this attr).
  let bodyFocusPanelMode = $derived(getBypassAttr('focusPanelMode') ?? '');

  // Step indicators: 5 milestones mapped to data-journey-step elements
  const STEP_DESCRIPTIONS: Record<string, string> = {
    overview: 'See the whole county.',
    search: 'Find and center on a business.',
    focus: 'Inspect a centered anchor.',
    inside: 'Explore the neighborhood.',
    map: 'View the geographic layer.'
  };

  // ── Click handlers ───────────────────────────────────────────────────────

  function handleAction(action: CompassAction | null | undefined): void {
    if (!action?.action) return;
    executeJourneyCompassAction(action.action);
  }

  function handleStepInside(): void {
    // W-low3: defensive guard — if the dive is not yet ready (data/pocket not
    // loaded), no-op instead of firing into an inactive state.
    if (!canDive) return;
    executeJourneyCompassAction(JOURNEY_ACTIONS.ENTER_INSIDE);
  }

  function handleInsideNext(): void {
    executeJourneyCompassAction(JOURNEY_ACTIONS.NEXT_STOP);
  }

  function handleInsideMap(): void {
    executeJourneyCompassAction(JOURNEY_ACTIONS.OPEN_MAP);
  }

  function handleInsideCounty(): void {
    executeJourneyCompassAction(JOURNEY_ACTIONS.COUNTY_OVERVIEW);
  }

  function finiteDepth(value: unknown): number {
    const depth = Number(value);
    return Number.isFinite(depth) ? depth : 0;
  }

  // ── Step Inside (focus-dive) button visibility logic ─────────────────────

  // Mirrors legacy semantic-dive-ui.js showDiveButton rule:
  //   showDiveButton = getTrailDepth() >= 1 && hasFocus && !active
  let bodyFocusedIndex = $derived(Number(bodyFocusedNode));
  let activeTrailDepth = $derived(Math.max(
    finiteDepth(journeyState.depth),
    finiteDepth(navState.trailDepth),
    finiteDepth(bodyTrailDepth),
    finiteDepth(bodyAppTrailDepth)
  ));
  let semanticDiveActive = $derived(
    focusState.semanticDiveMode ||
    bodySemanticDive === 'active' ||
    (navState.currentView === 'galaxy' && activeTrailDepth >= 2)
  );
  let hasDiveFocus = $derived(focusState.semanticDiveMode || navState.focusedIndex != null || Number.isFinite(bodyFocusedIndex));
  // LOW3: require either a built pocket or populated thread candidates before
  // enabling the action. Candidate data is the canonical readiness signal on
  // the mobile placeholder route; the pocket can lag while its 3D positions
  // hydrate, so hiding the action in that window made the real route appear
  // broken even though the neighborhood was already available.
  let isDataLoading = $derived(!($dataLoadState.status === 'ready'));
  let pocketReady = $derived(
    (focusState.pocketNodes?.length ?? 0) > 0 ||
    (navState.threadCandidates?.length ?? 0) > 0
  );
  let hasTrailDepth = $derived(activeTrailDepth >= 1);
  let canDive = $derived(
    navState.currentView === 'galaxy'
      && hasDiveFocus
      && !isDataLoading
      && pocketReady
  );
  let showDiveButton = $derived(
    bodyCanStepInside ||
    (hasTrailDepth
      && hasDiveFocus
      && !semanticDiveActive)
  );
  let primaryCanStepInside = $derived(
    !semanticDiveActive
      && (canDive || bodyPanelSurface === 'focus' || bodyPanelSurface === 'focus-search')
  );
  let primaryAction = $derived<CompassAction>(
    primaryCanStepInside
      ? { label: 'Step Inside', action: JOURNEY_ACTIONS.ENTER_INSIDE }
      : compass.primaryAction
  );

  // Suppress dive button inside the inside phase / semantic-dive surface
  let suppressInsideDiveActions = $derived(
    phase === 'inside' && semanticDiveActive
  );
  let showInsideControls = $derived(
    semanticDiveActive && navState.currentView === 'galaxy'
  );

  $effect(() => {
    if (typeof window === 'undefined' || !showInsideControls) return;
    const frame = window.requestAnimationFrame(() => {
      for (const id of ['btn-inside-map', 'btn-inside-county']) {
        const button = document.getElementById(id) as HTMLButtonElement | null;
        if (!button) continue;
        button.hidden = false;
        button.disabled = false;
        button.setAttribute('aria-hidden', 'false');
        button.setAttribute('aria-disabled', 'false');
      }
    });
    return () => window.cancelAnimationFrame(frame);
  });

  // ── Map route strip ─────────────────────────────────────────────────────

  let showMapTrailStrip = $derived.by(() => {
    return navState.currentView === 'map' && (
      navigationOwner === 'map-trail-strip' ||
      navState.surface === 'focus-search' ||
      navState.surface === 'map-trail' ||
      navState.surface === 'map-focus-search'
    );
  });

  // The strip carries the connection-trail label. Action buttons duplicate
  // the right panel chip rail and global view-toggle, so we render the
  // title only.
  let stripTitle = $derived(compass.title || 'Map route');
  let compactStripTitle = $derived(stripTitle.replace(/\s+pinned to map$/i, ''));
  let stripAccessibleTitle = $derived(compactStripTitle || stripTitle);

  // ── Action button state ──────────────────────────────────────────────────

  function buttonDisabled(action: CompassAction | null | undefined): boolean {
    if (!action?.action) return true;
    if (
      action.action === JOURNEY_ACTIONS.NEXT_STOP
      && focusState.strandContinuityPhase === 'exploring'
    ) {
      return true;
    }
    return false;
  }

  function buttonHidden(
    action: CompassAction | null | undefined,
    role: 'primary' | 'secondary' | 'tertiary'
  ): boolean {
    if (suppressInsideDiveActions) return true;
    if (!action?.action) return true;
    if (role === 'tertiary') return false; // tertiary may be empty
    return false;
  }

  function buttonLabel(
    action: CompassAction | null | undefined,
    role: 'primary' | 'secondary' | 'tertiary'
  ): string {
    if (action?.label) return action.label;
    return role === 'primary' ? 'Search' : role === 'secondary' ? 'Map' : 'Navigate';
  }

  function actionKey(action: CompassAction | null | undefined): string {
    return action?.action || '';
  }

  // ── Title special case ──────────────────────────────────────────────────
  // Legacy: in focus/inside phases the title element is intentionally empty
  // and gets an sr-only "Focused on X" alt text for the h1 landmark.
  let searchSurface = $derived(
    navSurface === 'search' ||
    navSurface === 'focus-search' ||
    bodyPanelSurface === 'search' ||
    bodyPanelSurface === 'focus-search'
  );

  // Hide compass in overview phase when ?nodemo=1 is set.
  // In search/focus/inside/map phases the compass is needed for navigation.
  let hideCompassForNoDemo = $derived(
    noDemo && phase === 'overview'
  );

  // Hide the compass only while the search results surface owns the view.
  // `focus-search` is the settled focus surface after a result is chosen;
  // hiding the compass there also hides its real Step Inside action and leaves
  // the mobile route with no reachable way into the neighborhood.
  let hideCompassForSearch = $derived(
    (navSurface === 'search' || bodyPanelSurface === 'search') &&
    navState.currentView !== 'map'
  );

  // Suppress step indicators in focus/inside phase on desktop.
  // The header chip rail already shows the same 6 mode options
  // (Overview, Search, Trail, Focus, Inside, Map) as clickable chips.
  // The journey-compass-step pills duplicate these visually and consume
  // ~340px of horizontal space — competing with the chip rail for attention
  // and re-asking the user "what mode?" when they already chose one.
  let suppressStepIndicators = $derived(
    phase === 'focus' || phase === 'inside'
  );

  // Suppress journey action buttons (primary/secondary/tertiary) in
  // focus/inside phase on desktop. The header chip rail + btn-focus-dive
  // provide all needed navigation. The 3 compass action buttons duplicate
  // 'Step Inside' / 'Map' / 'County' options already available in the
  // chip rail and the focus-stage card.
  let suppressJourneyActions = $derived(
    (phase === 'focus' || phase === 'inside') && !$viewport.isCompact
  );
  let visibleTitle = $derived(
    searchSurface
      ? (compass.title || 'Search results')
      : compass.title || (phase === 'focus' || phase === 'inside' ? '' : 'County overview')
  );
  let titleSrOnlyText = $derived(
    visibleTitle ? '' : 'Focused on the current business'
  );
</script>

<!--
  The legacy shell places #journey-compass as a <section> at body level.
  We render it the same way so the legacy CSS selectors
  (`.journey-compass`, `#journey-compass`, `[data-phase]`, etc.) match.
-->
<section
  id="journey-compass"
  class="journey-compass glass-heavy"
  class:focus-search-active={bodyPanelSurface === 'focus-search'}
  class:hidden-by-nodemo={hideCompassForNoDemo}
  class:hidden-by-search={hideCompassForSearch}
  class:suppress-step-indicators={suppressStepIndicators}
  class:suppress-actions={suppressJourneyActions}
  data-phase={phase}
  data-density={density}
  data-copy={copy}
  data-actions={actionsProfile}
  data-navigation-owner={navigationOwner}
  data-active-view={navState.currentView}
  data-panel-surface={bodyPanelSurface}
  data-panel-surface-detail={bodyPanelSurfaceDetail}
  data-focus-panel-mode={bodyFocusPanelMode}
  aria-live="polite"
>
  <CompassStepIndicators
    phase={phase}
    order={JOURNEY_COMPASS_PHASE_ORDER}
    descriptions={STEP_DESCRIPTIONS}
  />

  <CompassHeader
    kicker={compass.kicker}
    title={compass.title}
    note={compass.note}
    visibleTitle={visibleTitle}
    titleSrOnlyText={titleSrOnlyText}
  />

  <div
    class="journey-compass-actions"
    class:standard-flex={!$viewport.isCompact && actionsProfile === 'standard'}
  >
    <CompassActionButton
      role="primary"
      hidden={buttonHidden(primaryAction, 'primary')}
      ariaDisabled={buttonDisabled(primaryAction) || suppressInsideDiveActions}
      ariaHidden={buttonHidden(primaryAction, 'primary') ? 'true' : 'false'}
      ariaLabel={buttonLabel(primaryAction, 'primary')}
      tabindex={buttonHidden(primaryAction, 'primary') ? -1 : 0}
      dataJourneyAction={actionKey(primaryAction)}
      dataMobileLabel={actionKey(primaryAction) === JOURNEY_ACTIONS.ENTER_INSIDE ? 'Inside' : undefined}
      onclick={() => handleAction(primaryAction)}
    />
    <CompassActionButton
      role="secondary"
      hidden={buttonHidden(compass.secondaryAction, 'secondary')}
      ariaDisabled={buttonDisabled(compass.secondaryAction) || suppressInsideDiveActions}
      ariaHidden={buttonHidden(compass.secondaryAction, 'secondary') ? 'true' : 'false'}
      ariaLabel={buttonLabel(compass.secondaryAction, 'secondary')}
      tabindex={buttonHidden(compass.secondaryAction, 'secondary') ? -1 : 0}
      dataJourneyAction={actionKey(compass.secondaryAction)}
      onclick={() => handleAction(compass.secondaryAction)}
    />
    <CompassActionButton
      role="tertiary"
      hidden={buttonHidden(compass.tertiaryAction, 'tertiary')}
      ariaDisabled={buttonDisabled(compass.tertiaryAction) || suppressInsideDiveActions}
      ariaExpanded={buttonHidden(compass.tertiaryAction, 'tertiary') ? 'false' : 'true'}
      ariaHidden={buttonHidden(compass.tertiaryAction, 'tertiary') ? 'true' : 'false'}
      ariaLabel={buttonLabel(compass.tertiaryAction, 'tertiary')}
      tabindex={buttonHidden(compass.tertiaryAction, 'tertiary') ? -1 : 0}
      dataJourneyAction={actionKey(compass.tertiaryAction)}
      onclick={() => handleAction(compass.tertiaryAction)}
    />
  </div>

</section>

<CompassDiveSurface
  showMapTrailStrip={showMapTrailStrip}
  stripAccessibleTitle={stripAccessibleTitle}
  showDiveButton={showDiveButton}
  canDive={canDive}
  semanticDiveActive={semanticDiveActive}
  showInsideControls={showInsideControls}
  handleInsideCounty={handleInsideCounty}
  handleStepInside={handleStepInside}
  handleInsideNext={handleInsideNext}
  handleInsideMap={handleInsideMap}
  insideNextDisabled={buttonDisabled({ label: 'Next Stop', action: JOURNEY_ACTIONS.NEXT_STOP })}
/>

<style>
  /* Hide compass in overview when ?nodemo=1 */
  .journey-compass.hidden-by-nodemo {
    display: none !important;
  }
  /* Hide compass when search results are active to prevent overlap */
  .journey-compass.hidden-by-search {
    display: none !important;
  }
  .journey-compass-actions.standard-flex {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  :global(.focus-stage-dive-btn[hidden]) {
    display: none !important;
    visibility: hidden;
    pointer-events: none;
  }
  :global(.map-county-reset-btn[hidden]) {
    display: none !important;
    visibility: hidden;
    pointer-events: none;
  }

  /*
    PR-C: Suppress step indicators in focus/inside phase on desktop.
    The header chip rail (Overview / Search / Trail / Focus / Inside / Map)
    already surfaces all mode choices as clickable chips. The journey-compass-step
    pills are progress indicators that re-present the same options — confusing
    and redundant. Keep them visible in search/map/overview phases where the
    chip rail is partially hidden or the user needs progress orientation.
  */
  :global(.journey-compass.suppress-step-indicators [data-journey-step]) {
    display: none;
    visibility: hidden;
    pointer-events: none;
  }

  /*
    PR-C: Suppress the 3 journey action buttons on desktop in focus/inside.
    The header chip rail + btn-focus-dive provide all needed navigation.
    The action buttons duplicate 'Step Inside' / 'Map' / 'County' options
    already available in the chip rail.
  */
  .journey-compass.suppress-actions .journey-compass-actions {
    display: none;
    visibility: hidden;
    pointer-events: none;
  }

  /*
    PR-C: On mobile, also suppress step indicators in focus/inside phase
    when the header chip rail is visible but condensed.
  */
  @media (max-width: 768px) {
    :global(.journey-compass.suppress-step-indicators [data-journey-step]) {
      display: none;
      visibility: hidden;
      pointer-events: none;
    }
  }
</style>
