<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { viewport, viewportWidth, viewportHeight } from '@lib/stores/viewport.svelte.ts';
  import { completeCameraTransition } from '@lib/stores/camera.svelte.ts';
  import { dispatchNavTransition, NAV_TRANSITION_ACTIONS, navStore } from '@lib/stores/navigation.svelte.ts';
  import { setGraphicsMode, setLoadingPhase, graphicsModeStore } from '@lib/data-store';
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
    /** W45-B: callback fired when the 3D scene is fully ready */
    onSceneReady?: () => void;
    /** W45-B: callback fired when the 3D scene fails to initialize */
    onSceneError?: (_message: string) => void;
  }

  let { interactive = true, defer = false, onSceneReady, onSceneError }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state(undefined);
  let canvasEl: HTMLCanvasElement | undefined = $state(undefined);
  let graphicsMode = $state(get(graphicsModeStore));
  let overlayVisible = $state(true);
  let canvasReady = $state(false);
  let engineHasInit = $state(false);
  let engineLifecycle: typeof import('@lib/engine/lifecycle') | null = null;
  let componentDestroyed = $state(false);
  let overlayTimeout: ReturnType<typeof setTimeout> | undefined = undefined;
  let engineReadyUnsub: (() => void) | null = null;
  // W6-T5: Track whether the engine lifecycle has been destroyed so we
  // don't reset overlay state on re-mount after the engine already warmed up.
  let engineLifecycleDestroyed = false;
  // W6-T5: Track the last overlay log to prevent spam on rapid remounts.
  let lastOverlayLogAt = 0;
  let canvasError = $state(false);
  let canvasErrorMessage = $state('');

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
      const _currentFocusedIndex = get(navStore).focusedIndex
      if (_currentFocusedIndex === index) return
      dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, {
        index,
        surface: _currentSurface && _currentSurface !== 'idle' ? _currentSurface : undefined // audit-ok: plain function, not transformed
      })
    },
    onCameraArrived: () => {
      completeCameraTransition();
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
        onSceneReady?.(); // W45-B: signal to parent that the scene is ready
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
    if (!canvasEl) return;

    // Fallback: hide overlay after 5 seconds if engine hasn't signalled ready.
    // Gate on !canvasReady so a fast scene-ready path (onLoadingPhase →
    // hideOverlay) that already cleared the timeout is never retroactively
    // warned about.
    overlayTimeout = setTimeout(() => {
      if (overlayVisible && !canvasReady) {
        const now = Date.now();
        if (now - lastOverlayLogAt > 3000) {
          lastOverlayLogAt = now;
          debugWarn('Canvas: Overlay fallback timeout — hiding loading overlay');
        }
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
        canvasError = true;
        canvasErrorMessage = err instanceof Error ? err.message : 'Unknown error';
        onSceneError?.(canvasErrorMessage);
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
        if (typeof window !== 'undefined' && window.__PLAYWRIGHT__) {
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
        // W6-T5: Declare unsub before subscribe to avoid TDZ if the callback
        // fires synchronously (store already true).
        let unsub: (() => void) | null = null;
        const cleanup = () => { unsub?.(); unsub = null; };
        unsub = engineReadyStore.subscribe((ready) => {
          if (ready && !engineHasInit && !componentDestroyed) {
            cleanup();
            scheduleInitWhenIdle();
          }
        });
        engineReadyUnsub = unsub;
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

  $effect(() => {
    const unsub = graphicsModeStore.subscribe((v) => {
      graphicsMode = v;
    });
    return () => unsub();
  });

  onDestroy(() => {
    componentDestroyed = true;
    engineLifecycleDestroyed = true;
    engineHasInit = false;
    canvasReady = false;
    engineReadyUnsub?.();
    engineReadyUnsub = null;
    // W6-T5: Don't reset overlay to visible on destroy if we already had a
    // successful engine lifecycle. This prevents overlay flash on re-mount.
    overlayVisible = !engineLifecycleDestroyed;
    engineLifecycle?.destroyEngine();
    engineLifecycle = null;
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
    data-graphics-mode={graphicsMode}
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

  <!-- W45-B: Error overlay -->
  {#if canvasError}
    <div class="canvas-error-overlay" role="alert" aria-live="assertive">
      <div class="error-content">
        <p class="error-title">3D scene unavailable</p>
        <p class="error-message">{canvasErrorMessage || 'WebGL could not be initialized.'}</p>
        <button type="button" class="error-dismiss" onclick={() => canvasError = false}>
          Continue in 2D
        </button>
      </div>
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
    z-index: var(--z-canvas);
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

  @media (prefers-reduced-motion: reduce) {
    .canvas-loading-overlay,
    .loading-pulse {
      animation: none;
    }
  }

  .canvas-error-overlay {
    position: absolute;
    inset: 0;
    z-index: calc(var(--z-canvas, 10) + 2);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(7, 16, 24, 0.92);
    backdrop-filter: blur(8px);
    padding: 1.5rem;
  }
  .error-content {
    text-align: center;
    max-width: 320px;
  }
  .error-title {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-text-teal-light);
    margin-bottom: 0.5rem;
  }
  .error-message {
    font-size: 0.8rem;
    color: rgba(224, 240, 240, 0.7);
    margin-bottom: 1.5rem;
  }
  .error-dismiss {
    border: 1px solid rgba(78, 205, 196, 0.3);
    border-radius: 0.45rem;
    background: rgba(78, 205, 196, 0.1);
    color: var(--color-text-teal-light);
    padding: 0.45rem 0.8rem;
    font-size: 0.8rem;
    cursor: pointer;
    min-height: 44px;
    min-width: 44px;
  }
  .error-dismiss:hover {
    background: rgba(78, 205, 196, 0.2);
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-pulse { animation: none; }
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
