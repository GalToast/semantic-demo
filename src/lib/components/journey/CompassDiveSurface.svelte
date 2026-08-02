<!--
  CompassDiveSurface.svelte — extracted from JourneyCompass.svelte (W52).
  Renders the dive-surface sibling block that follows the
  #journey-compass <section>: the map-trail strip, the map-county reset
  button, the Step Inside / focus-dive button, the focus-stage kicker /
  inside-status / inside-controls. Props are the parent's reactive state
  + the 4 click handlers; the child is a pure prop-driven renderer (the
  (d)-split pattern). DOM ids / classes / data-* / aria-* / hidden /
  disabled / tabindex / title / type / onclick + inner text + the legacy
  hit-test comment are byte-identical to the original source block.
-->
<script lang="ts">
  import { JOURNEY_ACTIONS } from '@lib/journey/compass-state';

  interface Props {
    /** Whether the map-trail strip + county reset button are shown. */
    showMapTrailStrip: boolean;
    /** Accessible title for the map-trail strip. */
    stripAccessibleTitle: string;
    /** Whether the Step Inside / focus-dive button is shown. */
    showDiveButton: boolean;
    /** Whether the dive action is currently enabled (data/pocket ready). */
    canDive: boolean;
    /** Whether the semantic-dive (inside neighborhood) surface is active. */
    semanticDiveActive: boolean;
    /** Whether the focus-stage inside controls are shown. */
    showInsideControls: boolean;
    /** County overview handler (map-county reset + inside County button). */
    handleInsideCounty: () => void;
    /** Step Inside / enter-inside handler (focus-dive button). */
    handleStepInside: () => void;
    /** Next Stop handler (inside controls). */
    handleInsideNext: () => void;
    /** Map handler (inside controls). */
    handleInsideMap: () => void;
    /** Whether #btn-inside-next is disabled (parent-computed, reactive). */
    insideNextDisabled: boolean;
  }

  let {
    showMapTrailStrip,
    stripAccessibleTitle,
    showDiveButton,
    canDive,
    semanticDiveActive,
    showInsideControls,
    handleInsideCounty,
    handleStepInside,
    handleInsideNext,
    handleInsideMap,
    insideNextDisabled
  }: Props = $props();

  // W53 F5: defensive id-uniqueness guard. The `id="btn-focus-dive"` literal
  // lives only HERE in source, but Svelte can briefly co-mount two instances of
  // this child during a remount-straddling transition / HMR re-mount — the W53
  // visual capture caught this transient duplicate (both jurors flagged
  // [HIGH]). Steady state always reconciles to exactly one. On mount, if a
  // stale sibling still carries the same id, strip the id from those orphans
  // (NEVER our own node) so HTML5 id-uniqueness holds and
  // getElementById('btn-focus-dive') always resolves to the canonical (this)
  // button. Orphan nodes are left for Svelte to tear down — we never remove DOM
  // Svelte owns. Detection moment was faithful (`querySelectorAll('[id]')`
  // grouping), so the transient dup was real at the capture instant.
  let diveButton: HTMLButtonElement | null = $state(null);

  // Document-level id-uniqueness guard removed: Svelte reconciliation handles
  // id uniqueness through component lifecycle. The previous onMount mutation
  // stripped ids from DOM nodes outside this component's subtree, which could
  // break getElementById for parent/consumer code during HMR remounts.
</script>

<div
  id="map-trail-strip"
  class="map-trail-strip"
  hidden={!showMapTrailStrip}
  aria-hidden={!showMapTrailStrip ? 'true' : 'false'}
>
  {#if showMapTrailStrip}
    <div class="map-strip-title" data-route-director={showMapTrailStrip ? 'map-trail' : undefined} title={stripAccessibleTitle} aria-label={stripAccessibleTitle}>
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
  bind:this={diveButton}
  id="btn-focus-dive"
  class="focus-stage-dive-btn"
  type="button"
  data-journey-action="enter-inside"
  hidden={!showDiveButton}
  disabled={!canDive}
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
    aria-disabled={insideNextDisabled}
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
