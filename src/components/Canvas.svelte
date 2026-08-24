<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { viewport, viewportWidth, viewportHeight } from '@lib/stores/viewport.svelte.ts';
  import { completeCameraTransition } from '@lib/stores/camera.svelte.ts';
  import { dispatchNavTransition, NAV_TRANSITION_ACTIONS, navStore } from '@lib/stores/navigation.svelte.ts';
  import { setGraphicsMode, setLoadingPhase, graphicsModeStore } from '@lib/data-store';
  import { setRenderKind } from '@lib/orchestration/parity-attrs.svelte';
  import { engineReady as engineReadyStore } from '@lib/stores/engine-ready.svelte';
  import { debugLog, debugWarn, debugError } from '@lib/utils/debug';
  import type { EngineCallbacks } from '@lib/engine/lifecycle';
  import type { LoadingPhase } from '@lib/types/state';
  import { handleCanvasKeydown } from '@lib/journey/canvas-keyboard-nav';
  import { appState as _canvasAppState } from '@lib/state/app.svelte.ts';
  import { friendlyErrorMessage } from '@lib/utils/error-messages';
import { isPlaywrightEnvironment } from '@lib/app/app-lifecycle.ts';

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
  // H8: bound ref to the map-container element so we can claim the #map-container
  // id defensively (see onMount) and avoid a duplicate-id race with MapView's
  // gated-Canvas fallback, which also creates #map-container when Canvas hasn't
  // rendered yet.
  let mapContainerEl: HTMLDivElement | undefined = $state(undefined);
  // W6-T5: Overlay teardown flag tracked to avoid resetting overlay state on
  // re-mount after the engine already warmed up.
  // W6-T5: Track the last overlay log to prevent spam on rapid remounts.
  let lastOverlayLogAt = 0;
  // Bug-1: When the engine-ready gate flips (deep-link boot or user gesture),
  // hide the loading overlay immediately so the info panel — which may already
  // be populated with business details — is not obscured by "Loading the map…"
  // during engine init. Without this, deep-link users see the overlay for the
  // full engine-init duration while the info panel already shows content.
  $effect(() => {
    if (engineReadyStore.value && overlayVisible) {
      hideOverlay();
    }
  });
  let canvasError = $state(false);
  let canvasErrorMessage = $state('');
  // W-D1: normalize the raw engine error through the friendly-error pipeline so
  // the overlay surfaces human copy (title/detail) with the raw message
  // collapsed in a <details> instead of leaking tech strings into the UI.
  let friendlyCanvasError = $derived(canvasErrorMessage ? friendlyErrorMessage(canvasErrorMessage) : null);
  // W52: Overlay timeout — 15s in dev (slow engine init on HMR/hot reload +
  // slower devices), 5s in prod.  Override via data-overlay-timeout on
  // #canvas-container (e.g. <div data-overlay-timeout="12000">) or via
  // window.__OVERLAY_TIMEOUT_MS.
  let overlayTimeoutMs = $state(import.meta.env.DEV ? 15000 : 5000);

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
      // Task 145 / P8: when GPU init hangs (the 8s safety valve reports
      // 'fallback'), hand mobile users the designed 2D preview instead of a
      // dark dead stage. Desktop keeps the existing degraded-copy path
      // (Placeholder2D is compact-only by design). Flipping renderKind also
      // unmounts this failed Canvas instance via App.svelte's branch swap.
      if (state === 'fallback' && $viewport.isCompact) {
        setRenderKind('placeholder2d');
      }
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

  // ── W48-C keyboard navigation — L3 AbortController (Aug-2026 sweep) ───────
  // Previous code bound keydown to canvasEl (#engine-canvas) which is
  // REMOVED by scene-init.ts:90 (orphan sweep) and replaced by
  // renderer.domElement. So the handler lived on a detached node, OrbitControls
  // on the real canvas stole arrows, and 6 aria-keyshortcuts were inert.
  // L3: replaced manual _canvasKeyHandler element-ref with AbortController
  // (house style: src/lib/journey/canvas-interaction.ts). abort() is idempotent
  // and cleanly tears down all listeners across placeholder↔live-canvas switches.
  let _canvasKbdAbort: AbortController | null = null
  function bindKeysToLiveCanvas(el: HTMLCanvasElement | null, handler: (_e: KeyboardEvent) => void): void {
    if (!el) return
    _canvasKbdAbort?.abort()
    _canvasKbdAbort = new AbortController()
    el.addEventListener('keydown', handler, { signal: _canvasKbdAbort.signal })
  }
  function unbindLiveCanvasKeys(): void {
    _canvasKbdAbort?.abort()
    _canvasKbdAbort = null
  }

  onMount(() => {
    // H8: claim the #map-container id only if no other component (e.g. MapView's
    // gated-Canvas fallback) has already claimed it. This makes Canvas + MapView
    // idempotent owners and prevents a duplicate-id DOM race.
    if (mapContainerEl && !document.getElementById('map-container')) {
      mapContainerEl.id = 'map-container';
    }

    if (!canvasEl) return;

    const keyHandler = (e: KeyboardEvent): void => handleCanvasKeydown(e)
    // Early binding for placeholder / test path (surface-contract tests that never init WebGL)
    bindKeysToLiveCanvas(canvasEl, keyHandler)
    // Also try live canvas immediately in case engine already mounted (HMR)
    const liveNow =
      (_canvasAppState.renderer?.domElement as HTMLCanvasElement | null) ??
      (typeof document !== 'undefined' ? (document.querySelector('#canvas-container canvas') as HTMLCanvasElement | null) : null)
    if (liveNow && liveNow !== canvasEl) { bindKeysToLiveCanvas(liveNow, keyHandler); }

    // Check for data-overlay-timeout override on the canvas container
    if (containerEl) {
      const dataVal = containerEl.getAttribute('data-overlay-timeout');
      if (dataVal !== null) {
        const parsed = parseInt(dataVal, 10);
        if (!isNaN(parsed) && parsed > 0) {
          overlayTimeoutMs = parsed;
        }
      }
    }

    // Set CSS custom property so the overlay-fade-out animation stays in sync
    // with the JS timeout (animation delay = timeout - animation duration 400ms).
    // Dev timeout is 15s to accommodate slow engine init on HMR/hot reload.
    const fadeDelayMs = Math.max(0, overlayTimeoutMs - 400);
    const overlayEl = document.querySelector('.canvas-loading-overlay') as HTMLElement | null;
    if (overlayEl) {
      overlayEl.style.setProperty('--overlay-fade-delay', `${fadeDelayMs}ms`);
    }

    // Fallback: hide overlay after timeout if engine hasn't signalled ready.
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
        hideOverlay();
      }
    }, overlayTimeoutMs);

    const initLifecycle = async (): Promise<void> => {
      try {
        // P3-LCP (2026-08-21): journey.ts was previously statically imported by
        // app-init at boot, dragging the Three.js graph onto the cold path of
        // the mobile 2D surface. Load it here (engine boot seam, BEFORE
        // lifecycle init) so its CAMERA_NODE_FOCUSED subscription and journey
        // state are registered before the engine publishes events — while
        // keeping Three.js off the no-engine boot.
        await import('@lib/journey/journey')
        const lifecycle = await import('@lib/engine/lifecycle');        engineLifecycle = lifecycle;
        // The component can unmount while the lazy lifecycle chunk is still
        // resolving. Assign the module before checking the flag so onDestroy
        // and this continuation share the same teardown path; otherwise a
        // renderer created by the late init can outlive its page/context.
        if (componentDestroyed || !canvasEl) {
          lifecycle.destroyEngine();
          return;
        }
        await lifecycle.initEngine(canvasEl, callbacks);
        if (componentDestroyed) {
          lifecycle.destroyEngine();
          return;
        }
        engineHasInit = true;
        // H1a fix: after engine init, renderer.domElement is the canonical live
        // canvas (placeholder #engine-canvas removed by scene-init). Bind kbd to it.
        const liveAfterInit =
          (_canvasAppState.renderer?.domElement as HTMLCanvasElement | null) ??
          (typeof document !== 'undefined' ? (document.querySelector('#canvas-container canvas') as HTMLCanvasElement | null) : null)
        if (liveAfterInit && liveAfterInit !== canvasEl) {
          bindKeysToLiveCanvas(liveAfterInit, keyHandler)
        }
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
        if (isPlaywrightEnvironment()) {
          void initLifecycle();
          return;
        }
        if (typeof window !== 'undefined') {
          // Use rAF instead of rIC — the user just clicked Explore; don't
          // wait for browser idle. One frame (~16ms) gives the DOM time to
          // settle without the up-to-300ms rIC timeout penalty.
          requestAnimationFrame(() => {
            if (!engineHasInit && !componentDestroyed) {
              void initLifecycle();
            }
          });
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
        // W53 fix: also null engineReadyUnsub so onDestroy's engineReadyUnsub?.()
        // is a no-op after cleanup runs (prevents double-unsubscribe).
        const cleanup = () => { unsub?.(); unsub = null; engineReadyUnsub = null; };
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
    // L3: AbortController teardown covers both placeholder and live-canvas bindings in one call.
    unbindLiveCanvasKeys()

    componentDestroyed = true;
    engineHasInit = false;
    canvasReady = false;
    engineReadyUnsub?.();
    engineReadyUnsub = null;
    // W6-T5: keep the overlay hidden on destroy to prevent an overlay flash on
    // re-mount after a successful engine lifecycle.
    overlayVisible = false;
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
    bind:this={mapContainerEl}
    class="map-container"
    aria-hidden="true"
    data-active-view="idle"
  ></div>
  <div
    bind:this={containerEl}
    id="canvas-container"
    class="semantic-canvas-container"
    class:canvas-ready={canvasReady}
    data-graphics-mode={graphicsMode}
    aria-describedby="canvas-hover-preview"
  >
    <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role: WebGL graphviz canvas needs a non-native role; role is img per canvas-webgl-a11y canon (focus + keyshortcuts stay interactive) -->
    <canvas
      id="engine-canvas"
      bind:this={canvasEl}
      class="semantic-canvas"
      width={$viewport.width * $viewport.dpr}
      height={$viewport.height * $viewport.dpr}
      role="img"
      aria-label="3D business network"
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Plus Minus"
      tabindex={interactive ? 0 : -1}
    ></canvas>
  </div>

  <!-- Loading overlay: visible during engine init, hides on scene-ready or 15s timeout (dev) / 5s (prod) -->
  {#if overlayVisible}
    <div class="canvas-loading-overlay" aria-live="polite">
      <span class="loading-pulse">Loading the map…</span>
    </div>
  {/if}

  <!-- W45-B: Error overlay -->
  {#if canvasError}
    <div class="canvas-error-overlay" role="alert" aria-live="assertive">
      <div class="error-content">
        <p class="error-title">{friendlyCanvasError?.title ?? '3D scene unavailable'}</p>
        <p class="error-message">{friendlyCanvasError?.detail ?? 'Something went wrong launching the scene.'}</p>
        {#if friendlyCanvasError?.technical}
          <details class="error-technical">
            <summary>Technical details</summary>
            {friendlyCanvasError.technical}
          </details>
        {/if}
        <button type="button" class="error-dismiss" onclick={() => { canvasError = false; canvasEl?.focus(); }}>
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
    /* Prevent minor horizontal overflow (14px desktop, 3–4px mobile) without
       breaking the WebGL canvas mount — overflow-x:hidden on this container
       clips only the container, not the canvas that initThreeJS appends into
       it at 100% width. */
    overflow-x: hidden;
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
    animation: overlay-fade-out 0.4s ease-in var(--overlay-fade-delay, 4600ms) forwards;
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
    color: rgba(224, 240, 240, 0.85);
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
