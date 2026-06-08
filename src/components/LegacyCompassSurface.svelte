<!--
  @components/LegacyCompassSurface.svelte

  Renders the legacy-compatible DOM structure that
  vector-explorer-polished.html places inside <body>:

    <section id="journey-compass" class="journey-compass" data-phase="..." data-density="...">
      <div id="journey-compass-kicker"></div>
      <div id="journey-compass-title"></div>
      <div id="journey-compass-note"></div>
      <div class="journey-compass-actions">
        <button id="btn-journey-primary"></button>
        <button id="btn-journey-secondary"></button>
        <button id="btn-journey-tertiary"></button>
      </div>
      <div id="map-trail-strip" hidden></div>
    </section>
    <button id="btn-focus-dive" hidden>...</button>

  This is the Svelte-side replacement for the DOM that
  js/modules/journey-compass-controller.js + semantic-dive-ui.js
  build imperatively. The component:

    1. Renders the same DOM IDs the legacy CSS / hit-test
       contract expects.
    2. Mirrors the same data-* attributes the legacy
       updateJourneyCompass() / syncSemanticDiveUi() write
       imperatively.
    3. Wires the same click handlers to the same actions
       the legacy executeJourneyCompassAction() handles.

  The body data-* attribute mirror lives in
  src/lib/orchestration/parity-attrs.ts (single source of
  truth for the parity layer).
-->
<script lang="ts">
  import { navStore } from '@lib/stores/navigation';
  import { journeyStore, JOURNEY_COMPASS_PHASE_ORDER } from '@lib/stores/journey';
  import { focusStore } from '@lib/stores/focus';
  import {
    getJourneyCompassState,
    type CompassStateContext
  } from '@lib/orchestration/compass-state';
  import {
    getJourneyCompassPresentationState,
    executeJourneyCompassAction,
    type CompassPresentationState
  } from '@lib/orchestration/compass-controller';
  import { JOURNEY_ACTIONS, type CompassAction } from '@lib/stores/compass';

  // ── Reactive state ────────────────────────────────────────────────────────

  // We re-read the derived compass state every store change. This is the
  // Svelte equivalent of the legacy updateJourneyCompass() call that
  // the EVENT bus fires on every state change.
  // The reactive $effect below recomputes both on every store change.
  let compass: CompassStateContext = $state(getJourneyCompassState());

  // Subscribe to all the stores that the legacy updateJourneyCompass()
  // reacts to. $effect tracks reactive reads automatically.
  $effect(() => {
    compass = getJourneyCompassState();
  });

  // Presentation is derived from the live compass state. This avoids
  // the "captures initial value" lint warning that comes from calling
  // a function with a $state value at init time.
  let presentation: CompassPresentationState = $derived(
    getJourneyCompassPresentationState(compass)
  );

  // ── Reactive data-attr strings ────────────────────────────────────────────

  let phase = $derived(compass.phase || 'overview');
  let density = $derived(presentation.density);
  let copy = $derived(presentation.copy);
  let actionsProfile = $derived(presentation.actions);
  let navigationOwner = $derived(presentation.navigationOwner);

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

  // ── Step Inside (focus-dive) button visibility logic ─────────────────────

  // Mirrors legacy semantic-dive-ui.js showDiveButton rule:
  //   showDiveButton = getTrailDepth() >= 1 && hasFocus && !active
  let canDive = $derived(
    navStore().currentView === 'galaxy'
      && (focusStore().semanticDiveMode || navStore().focusedIndex !== null)
  );
  let showDiveButton = $derived(
    journeyStore().trailDepth >= 1
      && (navStore().focusedIndex !== null || focusStore().semanticDiveMode)
      && !focusStore().semanticDiveMode
  );

  // Suppress dive button inside the inside phase / semantic-dive surface
  let suppressInsideDiveActions = $derived(
    phase === 'inside' && focusStore().semanticDiveMode
  );

  // ── Map trail strip ─────────────────────────────────────────────────────

  let showMapTrailStrip = $derived(
    navStore().currentView === 'map' && navigationOwner === 'map-trail-strip'
  );

  // The strip carries the connection-trail label. Action buttons duplicate
  // the right panel chip rail and global view-toggle, so we render the
  // title only.
  let stripTitle = $derived(compass.title || 'Map trail');
  let compactStripTitle = $derived(stripTitle.replace(/\s+pinned to map$/i, ''));

  // ── Action button state ──────────────────────────────────────────────────

  function buttonDisabled(action: CompassAction | null | undefined): boolean {
    if (!action?.action) return true;
    if (
      action.action === JOURNEY_ACTIONS.NEXT_STOP
      && focusStore().strandContinuityPhase === 'exploring'
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
  let visibleTitle = $derived(
    compass.title || (phase === 'focus' || phase === 'inside' ? '' : 'County overview')
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
  class="journey-compass"
  data-phase={phase}
  data-density={density}
  data-copy={copy}
  data-actions={actionsProfile}
  data-navigation-owner={navigationOwner}
  aria-live={copy === 'full' ? 'polite' : 'off'}
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
    ></span>
  {/each}

  <div id="journey-compass-kicker" class="journey-compass-kicker">
    {compass.kicker || 'Journey'}
  </div>

  <div
    id="journey-compass-title"
    class="journey-compass-title"
    class:sr-only={!visibleTitle}
  >
    {visibleTitle || titleSrOnlyText}
  </div>

  <div
    id="journey-compass-note"
    class="journey-compass-note"
    class:discovery-active={compass.discovery}
  >
    {compass.note || 'Search to open one semantic trail.'}
  </div>

  <div class="journey-compass-actions">
    <button
      id="btn-journey-primary"
      class="journey-compass-action"
      type="button"
      data-journey-action={actionKey(compass.primaryAction)}
      hidden={buttonHidden(compass.primaryAction, 'primary')}
      aria-disabled={buttonDisabled(compass.primaryAction) || suppressInsideDiveActions}
      tabindex={buttonHidden(compass.primaryAction, 'primary') ? -1 : 0}
      aria-hidden={buttonHidden(compass.primaryAction, 'primary') ? 'true' : 'false'}
      aria-label={buttonLabel(compass.primaryAction, 'primary')}
      onclick={() => handleAction(compass.primaryAction)}
    >
      {buttonLabel(compass.primaryAction, 'primary')}
    </button>
    <button
      id="btn-journey-secondary"
      class="journey-compass-action"
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
      class="journey-compass-action"
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

  <div
    id="map-trail-strip"
    class="map-trail-strip"
    hidden={!showMapTrailStrip}
    aria-hidden={!showMapTrailStrip ? 'true' : 'false'}
  >
    {#if showMapTrailStrip}
      <div class="map-strip-title" title={stripTitle} aria-label={stripTitle}>
        {compactStripTitle || stripTitle}
      </div>
    {/if}
  </div>
</section>

<!--
  Step Inside / focus-dive button.
  Mirrors js/modules/focus-stage-dom.js ensureDiveButton() and
  js/modules/semantic-dive-ui.js syncSemanticDiveUi().

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
  aria-pressed={focusStore().semanticDiveMode ? 'true' : 'false'}
  aria-disabled={!canDive ? 'true' : 'false'}
  aria-label="Explore the neighborhood around this business"
  onclick={handleStepInside}
>
  <span class="focus-stage-dive-label">
    {focusStore().semanticDiveMode ? 'Inside Neighborhood' : 'Explore Neighborhood'}
  </span>
  <span class="focus-stage-dive-copy">
    {focusStore().semanticDiveMode
      ? 'Use Next Stop to continue or County to exit.'
      : 'Explore related businesses in the neighborhood.'}
  </span>
</button>

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
</style>
