<!--
  CompassStepIndicators.svelte — extracted from JourneyCompass.svelte (W52).
  Renders the 5/6 journey phase milestone pills inside the parent
  #journey-compass section. Props are pure; the parent owns all derived
  state. DOM (data-journey-step / .journey-compass-step + aria-label/title)
  is byte-identical to the original source block.
-->
<script lang="ts">
  interface Props {
    /** Current active phase (drives .current / .done). */
    phase: string;
    /** Ordered phase list (JOURNEY_COMPASS_PHASE_ORDER). */
    order: readonly string[];
    /** phase → human description map (STEP_DESCRIPTIONS). */
    descriptions: Record<string, string>;
  }

  let { phase, order, descriptions }: Props = $props();

  const currentPhaseIndex = $derived(order.indexOf(phase));
</script>

{#each order as stepPhase, stepIndex (stepPhase)}
  <span
    data-journey-step={stepPhase}
    class="journey-compass-step"
    class:current={stepPhase === phase}
    class:done={currentPhaseIndex > stepIndex}
    aria-label={`${stepIndex + 1}. ${stepPhase}: ${descriptions[stepPhase] || stepPhase}`}
    title={descriptions[stepPhase] || stepPhase}
  >{stepPhase}</span>
{/each}
