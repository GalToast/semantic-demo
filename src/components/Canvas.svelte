<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { viewport, viewportWidth, viewportHeight, dpr } from '@lib/stores/viewport.svelte.ts';
  import { completeCameraTransition } from '@lib/stores/camera.svelte.ts';
  import { dispatchNavTransition, NAV_TRANSITION_ACTIONS, navStore } from '@lib/stores/navigation.svelte.ts';
  import { setGraphicsMode, setLoadingPhase } from '@lib/data-store';
  import { engineReady as engineReadyStore } from '@lib/stores/engine-ready.svelte';
  import { debugLog, debugWarn, debugError } from '@lib/utils/debug';
  import type { EngineCallbacks } from '@lib/engine/lifecycle';
  import type { LoadingPhase } from '@lib/types/state';

  interface Props {
    interactive?: boolean;
    /**
     * W6-T1: when true, defer initEngine() until the engine-ready store
     * flips to true. Required for lazy-shell mount via App.svelte's
     * conditional <Splash /> → <Canvas /> pattern. Default: false to
     * preserve existing behaviour for non-lazy callers.
     */
    defer?: boolean;
  }

  let { interactive = true, defer = false }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state(undefined);
  let canvasEl: HTMLCanvasElement | undefined = $state(undefined);
  let mounted = $state(false);
  let overlayVisible = $state(true);
  let canvasReady = $state(false);
  let engineHasInit = $state(false);
  let engineLifecycle: typeof import('@lib/engine/lifecycle') | null = null;
  let componentDestroyed = false;
  let overlayTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

  const callbacks: EngineCallbacks = {
    onNodePicked: (index) => {
      // W15+ parity-attrs fix: preserve the current surface (especially
      // 'focus-search') when re-dispatching FOCUS_NODE. Without this, the
      // canvas CAMERA_NODE_FOCUSED → lifecycle-bridge → onNodePicked chain
      // re-fires dispatchNavTransition with no surface and clobbers
      // 'focus-search' → 'focus' in the Svelte navStore. The Svelte track's
      // cursor.ts focusOnNode is the canonical writer for surface; this
      // bridge re-dispatch should defer to whatever surface is current.
      const _currentSurface = navStore().surface
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, {
        index,
        surface: _currentSurface && _currentSurface !== 'idle' ? _currentSurface : undefined // audit-ok: plain function, not transformed
      })
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
      if (phase === 'launch') {
        debugLog('Canvas: Scene ready', progress);
        canvasReady = true;
        hideOverlay();
      }
    },
    onGraphicsStateChange: (state) => {
      setGraphicsMode(state === 'fallback' ? 'fallback' : 'webgl');
    },
  };

  function hideOverlay(): void {
    canvasReady = true; // fallback: ensure canvas is visible even if onLoadingPhase missed
    overlayVisible = false;
    if (overlayTimeout !== undefined) {
      clearTimeout(overlayTimeout);
      overlayTimeout = undefined;
    }
  }

  onMount(() => {
    mounted = true;
    if (!canvasEl) return;

    // Fallback: hide overlay after 5 seconds if engine hasn't signalled ready.
    // Gate on !canvasReady so a fast scene-ready path (onLoadingPhase →
    // hideOverlay) that already cleared the timeout is never retroactively
    // warned about.
    overlayTimeout = setTimeout(() => {
      if (overlayVisible && !canvasReady) {
        debugWarn('Canvas: Overlay fallback timeout — hiding loading overlay');
        overlayVisible = false;
        overlayTimeout = undefined;
      }
    }, 5000);

    const initLifecycle = async (): Promise<void> => {
      try {
        const lifecycle = await import('@lib/engine/lifecycle');
        if (componentDestroyed || !canvasEl) return;
        engineLifecycle = lifecycle;
        await lifecycle.initEngine(canvasEl, callbacks);
        if (componentDestroyed) {
          lifecycle.destroyEngine();
          return;
        }
        engineHasInit = true;
        lifecycle.resizeEngine(viewportWidth(), viewportHeight());
      } catch (err) {
        debugError('Canvas: Engine init failed:', err);
      }
    };

    if (defer) {
      // W6-T2: lazy mount — wait for engine-ready store to flip before init,
      // then yield to requestIdleCallback so the heavy Three.js boot does not
      // land on the gesture event's critical path.
      const scheduleInitWhenIdle = (): void => {
        if (engineHasInit || componentDestroyed) return;
        // W6-T4: in Playwright tests, skip requestIdleCallback so surfaces
        // that assert on #canvas-container don't race the idle timeout.
        if (typeof window !== 'undefined' && (window as any).__PLAYWRIGHT__) {
          void initLifecycle();
          return;
        }
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          window.requestIdleCallback(
            () => {
              if (!engineHasInit && !componentDestroyed) {
                void initLifecycle();
              }
            },
            { timeout: 300 }
          );
        } else {
          setTimeout(() => {
            if (!engineHasInit && !componentDestroyed) {
              void initLifecycle();
            }
          }, 0);
        }
      };

      if (engineReadyStore.value) {
        scheduleInitWhenIdle();
      } else {
        const unsub = engineReadyStore.subscribe((ready) => {
          if (ready && !engineHasInit && !componentDestroyed) {
            unsub();
            scheduleInitWhenIdle();
          }
        });
      }
    } else {
      void initLifecycle();
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
    if (engineHasInit && engineLifecycle?.getEngineStatus() === 'ready') {
      engineLifecycle.resizeEngine(w, h);
    }
  });

  onDestroy(() => {
    componentDestroyed = true;
    engineHasInit = false;
    canvasReady = false;
    overlayVisible = true;
    engineLifecycle?.destroyEngine();
    engineLifecycle = null;
    mounted = false;
    if (overlayTimeout !== undefined) { // audit-ok: onDestroy is a plain hook, not a reactive block
      clearTimeout(overlayTimeout);
      overlayTimeout = undefined;
    }
  });
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
    class:canvas-ready={canvasReady}
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

  <!-- Loading overlay: visible during engine init, hides on scene-ready or 5s timeout -->
  {#if overlayVisible}
    <div class="canvas-loading-overlay" aria-live="polite">
      <span class="loading-pulse">Loading mycelium…</span>
    </div>
  {/if}

<style>
  .semantic-canvas-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    touch-action: none;
  }

  .semantic-canvas-container:not(.canvas-ready) {
    visibility: hidden;
  }

  .semantic-canvas-container .semantic-canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }

  .semantic-canvas-container.canvas-ready .semantic-canvas {
    content-visibility: auto;
  }

  /* A11y: visible focus ring for keyboard users on the 3D canvas (WCAG 2.4.7) */
  .semantic-canvas:focus-visible {
    outline: 2px solid rgba(78, 205, 196, 0.8);
    outline-offset: -2px;
  }

  .canvas-loading-overlay {
    position: absolute;
    inset: 0;
    z-index: calc(var(--z-canvas, 10) + 1);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    pointer-events: none;
    animation: overlay-fade-out 0.4s ease-in 4.6s forwards;
  }

  .loading-pulse {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.85);
    letter-spacing: 0.04em;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.5; }
    50%      { opacity: 1; }
  }

  @keyframes overlay-fade-out {
    from { opacity: 1; }
    to   { opacity: 0; }
  }
</style>
