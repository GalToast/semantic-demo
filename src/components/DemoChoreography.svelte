<!--
  @components/DemoChoreography.svelte — Micro-demo orchestrator
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { demoState, demoPhase, isDemoActive, startDemo, cancelDemo, transitionDemo, setDemoTimer, cancelAllDemoTimers } from '@lib/stores/demo';
  import { navState } from '@lib/stores/navigation';
  import { viewport } from '@lib/stores/viewport';
  import type { DemoPhase } from '@lib/types/state';

  interface Props {
    force?: boolean;
    suppress?: boolean;
  }

  let { force = false, suppress = false }: Props = $props();

  let eligible = $state(true);

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

  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const forceDemo = urlParams.get('demo') === 'force';
    const noDemo = urlParams.get('nodemo') === '1';

    if (noDemo || suppress) { eligible = false; return; }

    const hasSeenDemo = localStorage.getItem('moco_mycelium_demo_v1');
    if (hasSeenDemo && !forceDemo && !force) { eligible = false; return; }

    setDemoTimer('start-delay', 800, () => {
      const nodeIndex = Math.floor(Math.random() * 8406);
      startDemo(nodeIndex);

      setDemoTimer('gliding', 1400, () => {
        transitionDemo('ARRIVED');
        transitionDemo('CARD_VISIBLE');

        setDemoTimer('card-visible', 1800, () => {
          transitionDemo('PULLBACK');
          transitionDemo('WIDE_VIEW');

          setDemoTimer('wide-view', 1000, () => {
            transitionDemo('RETURNING');

            setDemoTimer('returning', 1000, () => {
              transitionDemo('COMPLETE');
              localStorage.setItem('moco_mycelium_demo_v1', '1');
              sessionStorage.setItem('moco_mycelium_demo_session_v1', '1');
            });
          });
        });
      });
    });
  });

  onDestroy(() => {
    cancelAllDemoTimers();
    cancelDemo();
  });
</script>

{#if eligible && $isDemoActive}
  <div
    class="demo-choreography"
    id="demo-choreography"
    aria-live="polite"
    aria-label="Guided demo"
  >
    <button class="demo-dismiss" onclick={cancelDemo} aria-label="Dismiss demo">&times;</button>
    <p class="demo-status">{phaseLabels[$demoPhase] ?? $demoPhase}</p>
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
    width: 1.5rem;
    height: 1.5rem;
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
