<!--
  @components/JourneyCanvas.svelte — WebGL canvas + journey interactions

  Ported from:
    - js/modules/journey-canvas-interaction.js (canvas hit test, node picking)
    - js/modules/journey-webgl.js (WebGL overlay orchestration)

  Wraps the base Canvas.svelte with journey-specific interaction handling:
  node picking, hover tracking, camera transitions, and filter application.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { viewportWidth, viewportHeight, dpr } from '@lib/stores/viewport';
  import { completeCameraTransition } from '@lib/stores/camera';
  import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation';
  import { filterState } from '@lib/stores/filter';
  import { createEngineBridge } from '@lib/engine';
  import type { EngineBridge, EngineCallbacks } from '@lib/engine';

  interface Props {
    /** Whether the canvas accepts user interactions */
    interactive?: boolean;
  }

  let { interactive = true }: Props = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state(undefined);
  let bridge: EngineBridge | undefined = $state(undefined);

  const callbacks: EngineCallbacks = {
    onNodePicked: (index: number) => {
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, { index });
    },
    onNodeHovered: (_index: number | null) => {
      // Hover state can be synced to navigation store if needed
    },
    onCameraArrived: () => {
      completeCameraTransition();
    },
    onLoadingPhase: (phase: string) => {
      if (phase === 'launch') console.log('[JourneyCanvas] Scene ready');
    },
    onGraphicsStateChange: (state: string) => {
      console.warn('[JourneyCanvas] Graphics state:', state);
    },
  };

  onMount(async () => {
    if (!canvasEl) return;
    try {
      bridge = createEngineBridge(callbacks);
      await bridge.init(canvasEl);
      bridge.resize($viewportWidth, $viewportHeight);
    } catch (err) {
      console.error('[JourneyCanvas] Engine init failed:', err);
    }
  });

  $effect(() => {
    const w = $viewportWidth;
    const h = $viewportHeight;
    if (bridge?.isReady()) {
      bridge.resize(w, h);
    }
  });

  $effect(() => {
    if (bridge?.isReady()) {
      bridge.applyFilters($filterState);
    }
  });

  onDestroy(() => {
    bridge?.destroy();
    bridge = undefined;
  });

  /** Expose the bridge for parent components that need direct engine access */
  export function getBridge(): EngineBridge | undefined {
    return bridge;
  }
</script>

<div
  class="journey-canvas"
  id="canvas-container"
  style="z-index: var(--z-canvas)"
>
  <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
  <canvas
    bind:this={canvasEl}
    class="journey-canvas-el"
    width={$viewportWidth * $dpr}
    height={$viewportHeight * $dpr}
    role="application"
    aria-label="3D semantic business explorer"
    tabindex={interactive ? 0 : -1}
  ></canvas>
</div>

<style>
  .journey-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    touch-action: none;
  }

  .journey-canvas :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .journey-canvas-el {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }
</style>
