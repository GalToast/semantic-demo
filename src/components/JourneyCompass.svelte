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
    <button type="button" id="btn-focus-dive" hidden>...</button>

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
  import { onMount } from 'svelte';
  import { navStore } from '@lib/stores/navigation.svelte.ts';
  import { journeyStore, JOURNEY_COMPASS_PHASE_ORDER } from '@lib/stores/journey.svelte.ts';
  import { focusStore } from '@lib/stores/focus.svelte.ts';
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
  let compass: CompassStateContext = $state(getJourneyCompassState());
  let navState = $state(navStore());
  let journeyState = $state(journeyStore());
  let focusState = $state(focusStore());

  // Subscribe to all stores that the legacy updateJourneyCompass() reacts to.
  // The hybrid callable stores return snapshots, so explicit subscriptions keep
  // this parity surface current after focus and trail transitions.
  $effect(() => {
    const refreshCompass = () => {
      compass = getJourneyCompassState();
    };
    const unsubNav = navStore.subscribe((state) => {
      navState = state;
      refreshCompass();
    });
    const unsubJourney = journeyStore.subscribe((state) => {
      journeyState = state;
      refreshCompass();
    });
    const unsubFocus = focusStore.subscribe((state) => {
      focusState = state;
      refreshCompass();
    });
    refreshCompass();
    return () => {
      unsubNav();
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

  // Body attribute mirrors — now derived directly from stores
  let bodyPanelSurface = $derived(navState.surface);
  let bodyFocusedNode = $derived(navState.focusedIndex != null ? String(navState.focusedIndex) : '');
  let bodyTrailDepth = $derived(String(journeyState.depth ?? ''));
  let bodyAppTrailDepth = $derived(String(navState.trailDepth ?? ''));
  let bodySemanticDive = $derived(focusState.semanticDiveMode ? 'active' : '');
  let bodyCanStepInside = $derived(
    (journeyState.depth >= 1 || navState.trailDepth >= 1)
      && navState.focusedIndex != null
      && !focusState.semanticDiveMode
  );

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
    bodyPanelSurface === 'semantic-dive' ||
    (navState.currentView === 'galaxy' && activeTrailDepth >= 2)
  );
  let hasDiveFocus = $derived(focusState.semanticDiveMode || navState.focusedIndex != null || Number.isFinite(bodyFocusedIndex));
  let canDive = $derived(
    navState.currentView === 'galaxy'
      && hasDiveFocus
  );
  let showDiveButton = $derived(
    bodyCanStepInside ||
    (activeTrailDepth >= 1
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

  // ── Map trail strip ─────────────────────────────────────────────────────

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
  let stripTitle = $derived(compass.title || 'Map trail');
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

  // Hide compass when search results are active to avoid overlap.
  let hideCompassForSearch = $derived(
    searchSurface && !(navState.currentView === 'map')
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
  data-phase={phase}
  data-density={density}
  data-copy={copy}
  data-actions={actionsProfile}
  data-navigation-owner={navigationOwner}
  aria-live="polite"
>
  <!-- Step indicators (legacy [data-journey-step] hook) -->
  {#each JOURNEY_COMPASS_PHASE_ORDER as stepPhase, stepIndex (stepPhase)}
    <span
      data-journey-step={stepPhase}
      class="journey-compass-step"
      class:current={stepPhase === phase}
      class:done={JOURNEY_COMPASS_PHASE_ORDER.indexOf(phase) > stepIndex}
      aria-label={`${stepIndex + 1}. ${stepPhase}: ${STEP_DESCRIPTIONS[stepPhase] || stepPhase}`}
      title={STEP_DESCRIPTIONS[stepPhase] || stepPhase}
    >{stepPhase}</span>
  {/each}

  <div id="journey-compass-kicker" class="journey-compass-kicker">
    {compass.kicker || 'Journey'}
  </div>

  <div
    id="journey-compass-title"
    class="journey-compass-title"
    class:sr-only={!visibleTitle}
    style="overflow: visible; text-overflow: clip; white-space: normal;"
  >
    {visibleTitle || titleSrOnlyText}
  </div>

  <div
    id="journey-compass-note"
    class="journey-compass-note"
  >
    {compass.note || 'Search to open one semantic trail.'}
  </div>

  <div
    class="journey-compass-actions"
    class:standard-flex={!$viewport.isCompact && actionsProfile === 'standard'}
  >
    <button
      id="btn-journey-primary"
      class="journey-compass-action primary"
      type="button"
      data-journey-action={actionKey(primaryAction)}
      data-mobile-label={actionKey(primaryAction) === JOURNEY_ACTIONS.ENTER_INSIDE ? 'Inside' : undefined}
      hidden={buttonHidden(primaryAction, 'primary')}
      aria-disabled={buttonDisabled(primaryAction) || suppressInsideDiveActions}
      tabindex={buttonHidden(primaryAction, 'primary') ? -1 : 0}
      aria-hidden={buttonHidden(primaryAction, 'primary') ? 'true' : 'false'}
      aria-label={buttonLabel(primaryAction, 'primary')}
      onclick={() => handleAction(primaryAction)}
    >
      {buttonLabel(primaryAction, 'primary')}
    </button>
    <button
      id="btn-journey-secondary"
      class="journey-compass-action secondary"
      type="button"
      data-journey-action={actionKey(compass.secondaryAction)}
      hidden={buttonHidden(compass.secondaryAction, 'secondary')}
      aria-disabled={buttonDisabled(compass.secondaryAction) || suppressInsideDiveActions}
      tabindex={buttonHidden(compass.secondaryAction, 'secondary') ? -1 : 0}
      aria-hidden={buttonHidden(compass.secondaryAction, 'secondary') ? 'true' : 'false'}
      aria-label={buttonLabel(compass.secondaryAction, 'secondary')}
      onclick={() => handleAction(compass.secondaryAction)}
    >
      {buttonLabel(compass.secondaryAction, 'secondary')}
    </button>
    <button
      id="btn-journey-tertiary"
      class="journey-compass-action tertiary"
      type="button"
      data-journey-action={actionKey(compass.tertiaryAction)}
      hidden={buttonHidden(compass.tertiaryAction, 'tertiary')}
      aria-disabled={buttonDisabled(compass.tertiaryAction) || suppressInsideDiveActions}
      aria-expanded={buttonHidden(compass.tertiaryAction, 'tertiary') ? 'false' : 'true'}
      tabindex={buttonHidden(compass.tertiaryAction, 'tertiary') ? -1 : 0}
      aria-hidden={buttonHidden(compass.tertiaryAction, 'tertiary') ? 'true' : 'false'}
      aria-label={buttonLabel(compass.tertiaryAction, 'tertiary')}
      onclick={() => handleAction(compass.tertiaryAction)}
    >
      {buttonLabel(compass.tertiaryAction, 'tertiary')}
    </button>
  </div>

</section>

<div
  id="map-trail-strip"
  class="map-trail-strip"
  hidden={!showMapTrailStrip}
  aria-hidden={!showMapTrailStrip ? 'true' : 'false'}
>
  {#if showMapTrailStrip}
    <div class="map-strip-title" title={stripAccessibleTitle} aria-label={stripAccessibleTitle}>
      {stripAccessibleTitle}
    </div>
  {/if}
</div>

<button
  id="btn-map-county"
  class="map-county-reset-btn"
  type="button"
  data-journey-action={JOURNEY_ACTIONS.COUNTY_OVERVIEW}
  hidden={!showMapTrailStrip}
  aria-hidden={!showMapTrailStrip ? 'true' : 'false'}
  aria-label="Return to county overview"
  onclick={handleInsideCounty}
>
  County
</button>

<!--
  Step Inside / focus-dive button.
 Mirrors ensureDiveButton and
 syncSemanticDiveUi.

  Legacy hit-test contract (tests/canvas-hit-test-interaction.spec.js):
    - The button must be the topmost element at its center
    - The body data-semantic-dive attribute must be 'active' or
      'transitioning' when the click reaches the engine
-->
<button
  id="btn-focus-dive"
  class="focus-stage-dive-btn"
  type="button"
  data-journey-action="enter-inside"
  hidden={!showDiveButton}
  aria-hidden={!showDiveButton ? 'true' : 'false'}
  aria-pressed={semanticDiveActive ? 'true' : 'false'}
  aria-disabled={!canDive ? 'true' : 'false'}
  aria-label="Explore the neighborhood around this business"
  onclick={handleStepInside}
>
  <span class="focus-stage-dive-label">
    {semanticDiveActive ? 'Inside Neighborhood' : 'Explore Neighborhood'}
  </span>
  <span class="focus-stage-dive-copy">
    {semanticDiveActive
      ? 'Use Next Stop to continue or County to exit.'
      : 'Explore related businesses in the neighborhood.'}
  </span>
</button>

<div class="focus-stage-kicker" hidden aria-hidden="true">Focus stage</div>

<div
  id="focus-stage-inside-status"
  class="focus-stage-inside-status"
  hidden={!showInsideControls}
  aria-hidden={!showInsideControls ? 'true' : 'false'}
>
  <span class="focus-stage-inside-status-copy">Inside neighborhood</span>
</div>

<div
  id="focus-stage-inside-controls"
  class="focus-stage-inside-controls"
  hidden={!showInsideControls}
  aria-hidden={!showInsideControls ? 'true' : 'false'}
>
  <button
    id="btn-inside-next"
    class="focus-stage-inside-btn biofield-glow"
    type="button"
    data-journey-action={JOURNEY_ACTIONS.NEXT_STOP}
    hidden={!showInsideControls}
    aria-hidden={!showInsideControls ? 'true' : 'false'}
    aria-disabled={buttonDisabled({ label: 'Next Stop', action: JOURNEY_ACTIONS.NEXT_STOP })}
    tabindex={showInsideControls ? 0 : -1}
    onclick={handleInsideNext}
  >
    Next Stop
  </button>
  <button
    id="btn-inside-map"
    class="focus-stage-inside-btn"
    type="button"
    data-journey-action={JOURNEY_ACTIONS.OPEN_MAP}
    hidden={!showInsideControls}
    aria-hidden={!showInsideControls ? 'true' : 'false'}
    aria-disabled={!showInsideControls ? 'true' : 'false'}
    tabindex={showInsideControls ? 0 : -1}
    onclick={handleInsideMap}
  >
    Map
  </button>
  <button
    id="btn-inside-county"
    class="focus-stage-inside-btn"
    type="button"
    data-journey-action={JOURNEY_ACTIONS.COUNTY_OVERVIEW}
    hidden={!showInsideControls}
    aria-hidden={!showInsideControls ? 'true' : 'false'}
    aria-disabled={!showInsideControls ? 'true' : 'false'}
    tabindex={showInsideControls ? 0 : -1}
    onclick={handleInsideCounty}
  >
    County
  </button>
</div>

<!--
  Minimal CSS for sr-only.
  Full styling is owned by the legacy CSS modules; this is just enough
  to keep the data-attr-based layout functional during the migration.
-->
<style>
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
  /* Hide compass in overview when ?nodemo=1 */
  .journey-compass.hidden-by-nodemo {
    display: none !important;
  }
  /* Hide compass when search results are active to prevent overlap */
  .journey-compass.hidden-by-search {
    display: none !important;
  }
  .journey-compass-title {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }
  .journey-compass-actions.standard-flex {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .focus-stage-dive-btn[hidden] {
    display: none;
    visibility: hidden;
    pointer-events: none;
  }
  .map-county-reset-btn[hidden] {
    display: none;
    visibility: hidden;
    pointer-events: none;
  }
</style>
