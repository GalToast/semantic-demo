<!--
  @components/CompassRail.svelte — Journey compass rail

  Ported from:
    - js/modules/journey-compass-state.js (compass state synthesis)
    - js/modules/journey-compass-controller.js (step rendering, updateJourneyCompass)
    - js/modules/CompassRail.svelte (skeleton → wired)

  Compass steps follow the ordered milestones:
    overview → search → focus → inside → map

  Each step's state is computed by the compassSteps derived store:
    done | current | upcoming

  The compass state machine (compassPhase) controls rail animation:
    idle → checking → synthesizing → active | interrupted → idle
-->
<script lang="ts">
  import { compassSteps } from '@lib/stores/compass.svelte';
  import type { CompassStep } from '@lib/stores/compass.svelte';
  import { compassPhase, transitionCompass } from '@lib/stores/journey.svelte';
  import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation.svelte';

  interface Props {
    /** Whether the compass rail is visible */
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  let bodyPanelSurface = $state('');
  let bodyGraphContext = $state('');
  $effect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => {
      bodyPanelSurface = document.body.dataset.panelSurface || '';
      bodyGraphContext = document.body.dataset.graphContext || '';
    };
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-panel-surface', 'data-graph-context'] });
    sync();
    return () => obs.disconnect();
  });

  // Track pending timeouts so they can be cleared on unmount.
  const pendingTimers: ReturnType<typeof setTimeout>[] = [];

  /**
   * Dispatch nav transition + compass state animation for a clicked step.
   *
   * The compass SM follows:
   *   idle → checking → synthesizing → active → idle
   * with ~520ms total animation before returning to idle.
   */
  function handleAction(phase: string): void {
    // Clear any in-flight animation timers from a prior click.
    for (const t of pendingTimers) clearTimeout(t);
    pendingTimers.length = 0;

    // 1. Start compass animation
    transitionCompass('checking');

    // 2. Dispatch nav transition for the clicked phase
    switch (phase) {
      case 'overview':
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW);
        break;
      case 'search':
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'search' });
        break;
      case 'focus':
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'focus' });
        break;
      case 'inside':
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'inside' });
        break;
      case 'map':
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'map' });
        break;
      default:
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.RESET);
        break;
    }

    // 3. Animate through the state machine (tracked for cleanup)
    pendingTimers.push(setTimeout(() => {
      transitionCompass('synthesizing');
      pendingTimers.push(setTimeout(() => {
        transitionCompass('active');
        pendingTimers.push(setTimeout(() => transitionCompass('idle'), 300));
      }, 120));
    }, 100));
  }

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  $effect(() => {
    return () => {
      for (const t of pendingTimers) clearTimeout(t);
    };
  });
</script>

{#if visible}
  <div
    class="compass-rail compass-steps"
    class:active={compassPhase() === 'active'}
    class:checking={compassPhase() === 'checking'}
    class:synthesizing={compassPhase() === 'synthesizing'}
    id="compass-rail"
    role="navigation"
    aria-label="Journey compass"
    onpointerdown={(e) => e.stopPropagation()}
    onwheel={(e) => e.stopPropagation()}
    ondblclick={(e) => e.stopPropagation()}
  >
    {#each compassSteps() as step (step.phase)}
      <button
        class="compass-step"
        class:primary={step.phase === 'search' && (bodyPanelSurface === 'focus-search' || bodyGraphContext === 'focus-search') || step.state === 'current' || step.state === 'done'}
        class:current={step.state === 'current'}
        class:done={step.state === 'done'}
        onclick={() => handleAction(step.phase)}
        aria-label="Navigate to {step.phase}"
        aria-current={step.state === 'current' ? 'step' : undefined}
      >
        <span class="step-dot"></span>
        <span class="step-label">{step.phase}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .compass-rail {
    position: absolute;
    left: 1rem;
    top: 50%;
    transform: translateY(-50%);
    z-index: var(--z-compass);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(7, 16, 24, 0.88);
    backdrop-filter: blur(10px);
    border-radius: 0.5rem;
    border: 1px solid rgba(78, 205, 196, 0.12);
    pointer-events: none;
  }
  .compass-step {
    pointer-events: auto; /* buttons remain clickable while rail passes through */
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.3rem 0.5rem;
    min-width: 44px;
    min-height: 44px;
    background: none;
    border: none;
    border-radius: 0.3rem;
    cursor: pointer;
    transition: all 0.15s;
    color: #6a8a8a;
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.65rem;
  }
  .compass-step:hover {
    color: #b0d0d0;
    background: rgba(78, 205, 196, 0.08);
  }
  .compass-step.current {
    color: #4ecdc4;
  }
  .compass-step.done {
    opacity: 0.5;
  }
  .compass-step.done:hover {
    opacity: 0.8;
  }
  .step-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.6;
  }
  .compass-step.current .step-dot {
    opacity: 1;
    box-shadow: 0 0 6px currentColor;
  }
  .compass-step.done .step-dot {
    opacity: 1;
  }
  .step-label {
    text-transform: capitalize;
  }

  @media (max-width: 768px) {
    .compass-rail {
      left: 0.5rem;
      padding: 0.35rem;
    }
    .step-label {
      display: none;
    }
  }
</style>
