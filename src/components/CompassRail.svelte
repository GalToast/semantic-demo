<!--
  @components/CompassRail.svelte — Journey compass rail

  Ported from:
 - (compass state synthesis)
 - (step rendering, updateJourneyCompass)
 - (skeleton → wired)

  Compass steps follow the ordered milestones:
    overview → search → focus → inside → map

  Each step's state is computed by the compassSteps derived store:
    done | current | upcoming

  The compass state machine (compassPhase) controls rail animation:
    idle → checking → synthesizing → active | interrupted → idle
-->
<script lang="ts">
  import { compassSteps } from '@lib/stores/compass.svelte';
  import { compassPhase, transitionCompass } from '@lib/stores/journey.svelte';
  import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation.svelte';

  import { parityMap } from '@lib/orchestration/parity-attrs.svelte';
  import { selectMode as applyModeSelect } from '@lib/components/header/mode-nav';
  import { appState } from '@lib/state/app.svelte';
  import { updateUrlState } from '@lib/orchestration/url-state';
  import { debugWarn } from '@lib/utils/debug';
  import type { NavMode } from '@lib/types/state';

  interface Props {
    /** Whether the compass rail is visible */
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  // ── Parity-attrs reactive reads (replaces inline parity computation) ────
  let panelSurface = $derived(parityMap.panelSurface || '');
  let graphContext = $derived(parityMap.graphContext || '');

  // Whether a business node is currently focused (enables selection-dependent modes).
  let hasSelection = $derived(
    appState.navState.focusedIndex != null && Number.isFinite(appState.navState.focusedIndex as number)
  );

  // Track pending timeouts so they can be cleared on unmount.
  const pendingTimers: ReturnType<typeof setTimeout>[] = [];

  // ── W48-D: roving tabindex + arrow-key navigation ────────────────────────
  // Without this, screen-reader and keyboard-only users must Tab through
  // every compass step individually. With roving tabindex + ArrowUp/Down,
  // they can navigate the journey phases like a vertical WAI-ARIA tablist.
  // Tracks which step has focus so arrow keys move focus + activate on Enter/Space.
  let compassFocusIndex = $state(0);

  function handleCompassKeydown(event: KeyboardEvent): void {
    const steps = compassSteps();
    if (steps.length === 0) return;
    const last = steps.length - 1;
    let nextIndex: number;

    switch (event.key) {
      case 'ArrowDown':
        nextIndex = compassFocusIndex < last ? compassFocusIndex + 1 : 0;
        break;
      case 'ArrowUp':
        nextIndex = compassFocusIndex > 0 ? compassFocusIndex - 1 : last;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = last;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        handleAction(steps[compassFocusIndex]?.phase ?? '');
        return;
      default:
        return;
    }
    event.preventDefault();
    compassFocusIndex = nextIndex;
    const buttons = document.querySelectorAll<HTMLButtonElement>('.compass-rail .compass-step');
    buttons[nextIndex]?.focus();
  }

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

    // 2. Dispatch nav transition using the shared selectMode helper.
    //    selectMode handles all 7 known modes (overview, search, focus, inside, trail, map)
    //    plus lock-guard for selection-dependent modes and URL sync.
    const KNOWN_NAV_MODES: readonly string[] = ['overview', 'search', 'focus', 'inside', 'trail', 'map'];
    if (KNOWN_NAV_MODES.includes(phase)) {
      applyModeSelect(phase as NavMode, hasSelection, {
        navActions: NAV_TRANSITION_ACTIONS,
        dispatchNavTransition: dispatchNavTransition as unknown as (
          action: unknown,
          payload?: Record<string, unknown>
        ) => unknown,
        updateUrlState: updateUrlState as unknown as (...args: unknown[]) => void,
        debugWarn: debugWarn as unknown as (...args: unknown[]) => void,
      });
    } else {
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.RESET);
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
  <nav
    class="compass-rail compass-steps"
    class:active={compassPhase() === 'active'}
    class:checking={compassPhase() === 'checking'}
    class:synthesizing={compassPhase() === 'synthesizing'}
    id="compass-rail"
    aria-label="Journey compass"
    aria-keyshortcuts="ArrowUp ArrowDown Home End Enter Space"
    onpointerdown={(e) => e.stopPropagation()}
    onwheel={(e) => e.stopPropagation()}
    ondblclick={(e) => e.stopPropagation()}
    onkeydown={handleCompassKeydown}
  >
    {#each compassSteps() as step, idx (step.phase)}
      <button
        class="compass-step"
        class:primary={step.phase === 'search' && (panelSurface === 'focus-search' || graphContext === 'focus-search') || step.state === 'current' || step.state === 'done'}
        class:current={step.state === 'current'}
        class:done={step.state === 'done'}
        onclick={() => handleAction(step.phase)}
        aria-label="Navigate to {step.phase}"
        aria-current={step.state === 'current' ? 'step' : undefined}
        tabindex={idx === compassFocusIndex ? 0 : -1}
        type="button"
      >
        <span class="step-dot"></span>
        <span class="step-label">{step.phase}</span>
      </button>
        {/each}
  </nav>
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
    color: var(--color-text-teal-dark);
    font-family: 'Nunito Sans', sans-serif;
    font-size: 0.65rem;
  }
  .compass-step:hover {
    color: var(--color-text-teal-muted);
    background: rgba(78, 205, 196, 0.08);
  }
  .compass-step.current {
    color: var(--color-primary-alt);
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
