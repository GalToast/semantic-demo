<!--
  @components/DemoChoreography.svelte — Micro-demo orchestrator
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    demoStore,
    demoPhase,
    isDemoActive,
    startDemo,
    cancelDemo,
    transitionDemo,
    cancelAllDemoTimers,
    findDemoNode,
    shouldRunDemo,
    markDemoCompleted,
    markDemoSessionSkipped,
    DEMO_TIMING,
    DEMO_START_DELAY_MS,
    MAX_START_RETRIES
  } from '@lib/stores/demo';
  import { getBusinessRecords } from '@lib/stores';
  import type { DemoPhase } from '@lib/types/state';

  interface Props {
    force?: boolean;
    suppress?: boolean;
  }

  let { force = false, suppress = false }: Props = $props();

  let eligible = $state(true);

  const FORCED_START_DELAY_MS = 800;
  const RETRY_START_DELAY_MS = 250;

  const phaseLabels: Record<DemoPhase, string> = {
    IDLE: '',
    GLIDING: 'Gliding to a highlight...',
    ARRIVED: 'Arrived.',
    CARD_VISIBLE: 'Exploring connections...',
    PULLBACK: 'Pulling back...',
    WIDE_VIEW: 'The county at a glance.',
    RETURNING: 'Returning...',
    COMPLETE: '',
    CANCELLED: ''
  };

  function completeDemo() {
    transitionDemo('COMPLETE');
    markDemoCompleted();
    markDemoSessionSkipped();
  }

  function dismissDemo() {
    markDemoSessionSkipped();
    cancelDemo();
  }

  function runDemoSequence() {
    // Timers are now managed within the store actions or local effects
    transitionDemo('GLIDING');
    
    setTimeout(() => {
      transitionDemo('ARRIVED');
      setTimeout(() => {
        transitionDemo('CARD_VISIBLE');
        setTimeout(() => {
          transitionDemo('PULLBACK');
          setTimeout(() => {
            transitionDemo('WIDE_VIEW');
            setTimeout(() => {
              transitionDemo('RETURNING');
              setTimeout(completeDemo, DEMO_TIMING.RETURN_DURATION_MS);
            }, DEMO_TIMING.WIDE_VIEW_MS);
          }, DEMO_TIMING.PULLBACK_DURATION_MS);
        }, DEMO_TIMING.CARD_VISIBLE_MS);
      }, 1000); // Hold arrived
    }, DEMO_TIMING.GLIDE_DURATION_MS);
  }

  function attemptStart(remainingAttempts = MAX_START_RETRIES) {
    const nodeIndex = findDemoNode();
    if (nodeIndex === null) {
      if (remainingAttempts <= 0) {
        eligible = false;
        return;
      }
      setTimeout(() => attemptStart(remainingAttempts - 1), RETRY_START_DELAY_MS);
      return;
    }

    // Atomic guard: startDemo() returns false if another attempt already
    // claimed the guard (race between retry loop and a parallel start path).
    // If blocked, silently drop — the winning start owns the sequence.
    if (!startDemo()) return;
    runDemoSequence();
  }

  onMount(() => {
    if (suppress || (!force && !shouldRunDemo())) {
      eligible = false;
      return;
    }

    setTimeout(() => {
      attemptStart();
    }, force ? FORCED_START_DELAY_MS : DEMO_START_DELAY_MS);
  });

  onDestroy(() => {
    cancelAllDemoTimers();
    if (isDemoActive()) {
      cancelDemo();
    }
  });
</script>

{#if eligible && isDemoActive()}
  <div
    class="demo-choreography"
    id="demo-choreography"
    aria-live="polite"
    aria-label="Guided demo"
  >
    <button class="demo-dismiss" onclick={dismissDemo} aria-label="Dismiss demo">&times;</button>
    <p class="demo-status">{phaseLabels[demoPhase()] ?? demoPhase()}</p>
  </div>
{/if}

<style>
  .demo-choreography {
    position: absolute;
    bottom: 3rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-journey-block);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    pointer-events: auto;
  }
  .demo-dismiss {
    background: rgba(7, 16, 24, 0.8);
    border: 1px solid rgba(78, 205, 196, 0.2);
    color: #6a8a8a;
    font-size: 1rem;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, border-color 0.15s;
    padding: 0;
    line-height: 1;
  }
  .demo-dismiss:hover {
    color: #e0f0f0;
    border-color: rgba(78, 205, 196, 0.5);
  }
  .demo-status {
    font-size: 0.65rem;
    color: rgba(78, 205, 196, 0.4);
    text-align: center;
  }
</style>
