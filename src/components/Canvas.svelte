<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { viewport, viewportWidth, viewportHeight, dpr } from '@lib/stores/viewport.svelte.ts';
  import { completeCameraTransition } from '@lib/stores/camera.svelte.ts';
  import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation';
  import { setGraphicsMode, setLoadingPhase } from '@lib/data-store';
  import type { EngineBridge, EngineCallbacks } from '@lib/engine';
  import type { LoadingPhase } from '@lib/types/state';

  interface Props {
    interactive?: boolean;
  }

  let { interactive = true }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state(undefined);
  let canvasEl: HTMLCanvasElement | undefined = $state(undefined);
  let mounted = $state(false);
  let bridge: EngineBridge | undefined = $state(undefined);

  const callbacks: EngineCallbacks = {
    onNodePicked: (index) => {
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, { index });
    },
    onCameraArrived: () => {
      completeCameraTransition();
    },
    onNodeHovered: (index) => {
      // Sync hover index to body dataset for parity; the legacy RAF loop
      // reads state.hoverHighlightIndex directly from the engine side.
      if (typeof document !== 'undefined' && document.body) {
        if (index !== null && index >= 0) {
          document.body.dataset.hoveredNode = String(index);
        } else {
          delete document.body.dataset.hoveredNode;
        }
      }
    },
    onViewChanged: (view) => {
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_VIEW, {
        view: view as 'galaxy' | 'map',
      });
    },
    onLoadingPhase: (phase, progress) => {
      setLoadingPhase(phase as LoadingPhase);
      if (phase === 'launch') console.log('[Canvas] Scene ready', progress);
    },
    onGraphicsStateChange: (state) => {
      setGraphicsMode(state === 'fallback' ? 'fallback' : 'webgl');
    },
  };

  onMount(async () => {
    mounted = true;
    if (!canvasEl) return;
    try {
      const { createEngineBridge } = await import('@lib/engine');
      if (!mounted || !canvasEl) return;
      bridge = createEngineBridge(callbacks);
      await bridge.init(canvasEl);
      bridge.resize(viewportWidth(), viewportHeight());
    } catch (err) {
      console.error('[Canvas] Engine init failed:', err);
    }
  });

  $effect(() => {
    // Use $viewport auto-subscription so the effect re-runs on viewport
    // changes. Calling viewportWidth()/viewportHeight() here is a snapshot
    // read (get(store).x) and is NOT tracked by $effect in Svelte 5 runes
    // mode — that's why the bridge never received resize events from the
    // viewport store on its own. See qa-screenshots/REPORT.md bug 1.
    const w = $viewport.width;
    const h = $viewport.height;
    if (bridge?.isReady()) {
      bridge.resize(w, h);
    }
  });

  onDestroy(() => {
    bridge?.destroy();
    bridge = undefined;
    mounted = false;
  });

  export function getBridge(): EngineBridge | undefined {
    return bridge;
  }
</script>

  <!--
    #canvas-container: the legacy initThreeJS() looks for this element by ID
    and appends the renderer's canvas into it. The placeholder <canvas> below
    is removed by initThreeJS() and replaced with the live WebGL canvas.
  -->
  <div
    id="map-container"
    class="map-container"
    aria-hidden="true"
    data-active-view="idle"
  ></div>
  <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
  <div
    bind:this={containerEl}
    id="canvas-container"
    class="semantic-canvas-container"
    style="z-index: var(--z-canvas)"
  >
    <canvas
      bind:this={canvasEl}
      class="semantic-canvas"
      width={$viewport.width * $viewport.dpr}
      height={$viewport.height * $viewport.dpr}
      role="application"
      aria-label="3D semantic business explorer"
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Plus Minus"
      tabindex={interactive ? 0 : -1}
    ></canvas>
  </div>

<style>
  .semantic-canvas-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    touch-action: none;
  }

  .semantic-canvas-container :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .semantic-canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }
</style>
