<!--
  @components/SpectorInspector.svelte — Dev-only Spector.js WebGL inspector.

  Mounted only when import.meta.env.DEV is true. Lazy-imports the
  ~70 kB spectorjs bundle on mount, tree-shaken from production.

  Exposes window.__spector for headless capture via Playwright:
    window.__spector.isReady() -> boolean
    window.__spector.capture(canvasSelector?: string) -> { ok, frameCount? }
    window.__spector.stop() -> { ok, commandCount, capture: <Spector JSON> }
    window.__spector.listCanvases() -> string[]  // CSS selectors of all WebGL canvases

  Typical Playwright MCP workflow (driven by the agent):
    await page.evaluate(() => window.__spector.capture('canvas#webgl'));
    await page.click('button[data-action="focus"]');
    await page.waitForTimeout(500);
    const result = await page.evaluate(() => window.__spector.stop());
    console.log(result.capture);
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
import { debugWarn, debugLog } from '@lib/utils/debug'

  // Dev-engine handle published on window in DEV builds only by
  // src/lib/engine/three-engine.ts. Widened to include the status
  // snapshot bridge so the two `window as unknown as` call sites
  // below (pre-render probe + status publisher) share one shape.
  interface SpectorDevWindow {
    __semanticEngine?: { renderOnce?: () => void };
    __spectorStatus?: {
      phase: LoadPhase;
      loadError: string | null;
      loadDetail: string | null;
      lastCommandCount: number;
      lastCaptureAt: number | null;
      bridgeReady: boolean;
    };
  }

  // Spector.js capture event bus. The npm package ships no public
  // types for these handlers, so we declare the minimal surface
  // we use and cast `spector as SpectorCaptureApi` at one call site.
  interface SpectorCaptureApi {
    onCapture?: SpectorEventHandler;
    onError?: SpectorEventHandler;
  }
  interface SpectorEventHandler {
    add(_handler: (..._args: unknown[]) => void): void;
  }

  // Single typed accessor for window — replaces both `window as
  // unknown as { … }` sites in the capture bridge and publisher.
  function getSpectorDevWindow(): SpectorDevWindow {
    return window as unknown as SpectorDevWindow;
  }

  interface Props {
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  // Track the inspector's lifecycle so failures are visible to the dev
  // instead of silently disappearing into console. The previous version
  // swallowed import errors with console.warn and left no UI feedback,
  // which made it hard to tell whether Spector had actually loaded.
  type LoadPhase = 'idle' | 'loading' | 'ready' | 'unsupported' | 'error';
  let phase = $state<LoadPhase>('idle');
  let loadError = $state<string | null>(null);
  let loadDetail = $state<string | null>(null);

  let spectorInstance: unknown = null;
  let isReady = $state(false);
  let lastCapture: unknown = null;
  let activeCanvas: HTMLCanvasElement | null = null;
  let lastCommandCount = $state(0);
  let lastCaptureAt = $state<number | null>(null);

  onMount(async () => {
    if (!visible || !import.meta.env.DEV) {
      phase = 'idle';
      return;
    }

    phase = 'loading';
    loadError = null;
    loadDetail = null;

    try {
      // Spector.js v0.9.30 exports the class as a named export `Spector`.
      // The package's main bundle is UMD so we have to pick from several
      // possible shapes: named export, default export, or wrapped namespace.
      const mod = (await import('spectorjs')) as Record<string, unknown> & {
        default?: unknown;
      };
      const candidate =
        (mod.Spector as unknown) ??
        (mod.default as Record<string, unknown> | undefined)?.Spector ??
        (mod.default as unknown) ??
        mod;
      const Ctor = candidate as new () => {
        captureCanvas: (_canvas: HTMLCanvasElement) => void;
        pauseCapture: () => void;
        playCapture: () => void;
        getCurrentResult: () => unknown;
      };
      spectorInstance = new Ctor();
      // Record which shape we used so the dev can tell from the status
      // panel whether the named export or the default export was the
      // working one. Useful for debugging future spectorjs upgrades.
      loadDetail =
        candidate === mod.Spector
          ? 'named-export'
          : candidate === (mod.default as Record<string, unknown> | undefined)?.Spector
            ? 'default.Spector'
            : candidate === mod.default
              ? 'default'
              : 'namespace';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Two distinct failure modes: the import itself failed (network /
      // bundler / missing dep), or the candidate shape was unusable
      // (e.g. a future spectorjs version drops both named + default).
      // The latter is rare but the dev panel can show which one hit.
      const isImportError = err instanceof TypeError && /import|fetch|module/i.test(message);
      loadError = isImportError ? 'import-failed' : 'init-failed';
      phase = 'error';
      debugWarn('[spector-inspector] failed to load spectorjs', err);
      publishStatus();
      return;
    }

    // Sightly widened handle: the base capture methods plus the
    // optional onCapture/onError event bus. Declaring the event
    // bus inline avoids a second `spector as unknown as` cast when
    // wiring capture/errror callbacks below.
    type SpectorHandle = {
      captureCanvas: (_canvas: HTMLCanvasElement, _maxFrames?: number, _quickCapture?: boolean, _fullCapture?: boolean) => void;
      captureContext: (
        _context: WebGLRenderingContext | WebGL2RenderingContext,
        _maxFrames?: number,
        _quickCapture?: boolean,
        _fullCapture?: boolean,
      ) => void;
      pauseCapture: () => void;
      playCapture: () => void;
      getCurrentResult: () => unknown;
      onCapture?: SpectorEventHandler;
      onError?: SpectorEventHandler;
    };
    const spector = spectorInstance as SpectorHandle;

    isReady = true;

    const bridge = {
      isReady: () => isReady,
      listCanvases: () => {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        return canvases.map((c, i) => {
          const id = c.id || c.getAttribute('data-spector-id');
          if (id) return `#${id}`;
          return `canvas:nth-of-type(${i + 1})`;
        });
      },
      // Async capture. Resolves when Spector's onCapture event fires.
      // Timeout after 5s so a stalled capture doesn't hang the caller.
      //
      // Pre-render trick: Spector's frame-finder needs to see a draw
      // call dispatched on the captured context during its capture
      // window. Three.js only renders when state.currentView === 'galaxy'
      // (or forceAnimate). We force a synchronous renderer.render() call
      // right before captureContext() via the dev-only __semanticEngine
      // handle so the frame-finder always finds commands.
      capture: async (canvasSelector?: string, maxFrames = 0) => {
        let canvas: HTMLCanvasElement | null = null;
        if (canvasSelector) {
          canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
        } else {
          const all = Array.from(document.querySelectorAll('canvas'));
          canvas = all[0] ?? null;
        }
        if (!canvas) {
          return { ok: false, reason: 'no-canvas' };
        }
        const existingCtx =
          (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ??
          (canvas.getContext('webgl') as WebGLRenderingContext | null);
        if (!existingCtx) {
          return { ok: false, reason: 'no-webgl-context' };
        }
        // Force a render right before capture so Spector sees WebGL
        // commands during its capture window. The handle is published by
        // src/lib/engine/three-engine.ts in DEV builds only.
        const devEngine = getSpectorDevWindow().__semanticEngine;
        try {
          devEngine?.renderOnce?.();
        } catch (renderErr) {
          // Non-fatal — Spector will report "No frames detected" if the
          // engine is mid-teardown, but the bridge shouldn't fail the
          // call for this.
          debugLog('[spector-inspector] pre-render threw:', renderErr);
        }
        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            resolve({ ok: false, reason: 'timeout' });
          }, 5000);
          try {
            // onCapture fires when a capture completes with commands.
            const onCapture = (capture: unknown) => {
              clearTimeout(timeout);
              activeCanvas = canvas;
              lastCapture = capture;
              const cmds = (capture as { commands?: unknown[] } | null)?.commands ?? [];
              resolve({
                ok: true,
                canvas: canvasSelector ?? 'first-canvas',
                mode: 'context',
                commandCount: cmds.length,
                capture,
              });
            };
            // spector already carries onCapture/onError on SpectorHandle,
            // so it narrows to SpectorCaptureApi without a cast.
            const spectorWithEvents: SpectorCaptureApi = spector;
            // Track capture metadata so the dev-only status panel can
            // show the most recent command count and capture timestamp
            // without needing a Playwright probe.
            const onCaptureTracked = (capture: unknown) => {
              const cmds = (capture as { commands?: unknown[] } | null)?.commands ?? [];
              lastCommandCount = cmds.length;
              lastCaptureAt = Date.now();
              publishStatus();
              onCapture(capture);
            };
            // onCaptureTracked / the onError closure both accept a
            // single `unknown` param, which is structurally a subtype of
            // the `(...args: unknown[]) => void` signature
            // SpectorEventHandler.add expects (TS bivariance for
            // functions with fewer parameters), so no cast is needed.
            spectorWithEvents.onCapture?.add(onCaptureTracked);
            spectorWithEvents.onError?.add((err: unknown) => {
              clearTimeout(timeout);
              resolve({ ok: false, reason: 'spector-error', error: String(err) });
            });
            // maxFrames=0 means "capture the next frame"
            spector.captureContext(existingCtx, maxFrames, false, false);
          } catch (err) {
            clearTimeout(timeout);
            resolve({ ok: false, reason: 'capture-failed', error: String(err) });
          }
        });
      },
      stop: () => {
        try {
          spector.pauseCapture();
          return { ok: true, capture: lastCapture };
        } catch (err) {
          return { ok: false, reason: 'stop-failed', error: String(err) };
        }
      },
      resume: () => {
        try {
          spector.playCapture();
          return { ok: true };
        } catch (err) {
          return { ok: false, reason: 'resume-failed', error: String(err) };
        }
      },
      getLastCapture: () => lastCapture,
      getActiveCanvas: () => (activeCanvas ? 'captured' : 'idle'),
    };

    window.__spector = bridge;
    phase = 'ready';
    publishStatus();
    debugLog('[spector-inspector] ready; call window.__spector.capture() to begin');
  });

  // Publish a read-only status snapshot on window.__spectorStatus so
  // headless tests and the dev panel can both observe lifecycle state
  // without having to introspect the bridge internals. Kept deliberately
  // minimal — the bridge is the authoritative API.
  function publishStatus() {
    if (typeof window === 'undefined') return;
    // Assign through the shared accessor — shape is declared on
    // SpectorDevWindow, the single typed bridge for window.__*.
    getSpectorDevWindow().__spectorStatus = {
      phase,
      loadError,
      loadDetail,
      lastCommandCount,
      lastCaptureAt,
      bridgeReady: isReady,
    };
  }

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      delete window.__spector;
      delete window.__spectorStatus;
    }
  });
</script>

{#if visible}
  <!--
    Spector.js builds its own UI panel when used interactively. For
    headless agent access we skip that panel and expose the API on
    window.__spector. The small status badge below is dev-only and
    disappears entirely when visible={false}, so it's tree-shaken out
    of the production bundle via the {#if visible} gate.
  -->
  <aside class="spector-status" data-phase={phase} aria-live="polite">
    <span class="spector-status__dot" aria-hidden="true"></span>
    <span class="spector-status__label">
      Spector: {phase}
      {#if loadDetail}<span class="spector-status__detail">({loadDetail})</span>{/if}
      {#if loadError}<span class="spector-status__error">— {loadError}</span>{/if}
      {#if lastCaptureAt}
        <span class="spector-status__last">
          · last: {lastCommandCount} cmd
          {Math.round((Date.now() - lastCaptureAt) / 1000)}s ago
        </span>
      {/if}
    </span>
  </aside>
{/if}

<style>
  /*
   * Status badge. Dev-only via the {#if visible} gate. Pointer-events:none
   * so the badge never intercepts canvas clicks or pointer events. The
   * low z-index keeps it below the canvas surface chrome; the data-phase
   * attribute lets the dev-tools stylesheet color it appropriately.
   */
  .spector-status {
    position: fixed;
    top: 6px;
    right: 6px;
    z-index: var(--z-devtools, 5);
    pointer-events: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    font: 11px/1.2 ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace;
    background: rgba(20, 20, 28, 0.78);
    color: #e8e8f0;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    backdrop-filter: blur(4px);
  }
  .spector-status__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #6a6a78;
    box-shadow: 0 0 0 0 currentColor;
  }
  .spector-status[data-phase="loading"] .spector-status__dot {
    background: #f0b94e;
    animation: spector-pulse 1.2s ease-in-out infinite;
  }
  .spector-status[data-phase="ready"] .spector-status__dot {
    background: var(--color-primary-alt);
  }
  .spector-status[data-phase="error"] .spector-status__dot,
  .spector-status[data-phase="unsupported"] .spector-status__dot {
    background: #e26d6d;
  }
  .spector-status__detail {
    color: #9aa0aa;
    margin-left: 4px;
  }
  .spector-status__error {
    color: #ff9a9a;
    margin-left: 4px;
  }
  .spector-status__last {
    color: #8fb3a8;
    margin-left: 4px;
  }
  @keyframes spector-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
</style>
