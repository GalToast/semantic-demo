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

  interface Props {
    visible?: boolean;
  }

  let { visible = false }: Props = $props();

  let spectorInstance: unknown = null;
  let isReady = $state(false);
  let lastCapture: unknown = null;
  let activeCanvas: HTMLCanvasElement | null = null;

  onMount(async () => {
    if (!visible || !import.meta.env.DEV) return;

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
        captureCanvas: (canvas: HTMLCanvasElement) => void;
        pauseCapture: () => void;
        playCapture: () => void;
        getCurrentResult: () => unknown;
      };
      spectorInstance = new Ctor();
    } catch (err) {
      console.warn('[spector-inspector] failed to load spectorjs', err);
      return;
    }

    type SpectorHandle = {
      captureCanvas: (canvas: HTMLCanvasElement, maxFrames?: number, quickCapture?: boolean, fullCapture?: boolean) => void;
      captureContext: (
        context: WebGLRenderingContext | WebGL2RenderingContext,
        maxFrames?: number,
        quickCapture?: boolean,
        fullCapture?: boolean,
      ) => void;
      pauseCapture: () => void;
      playCapture: () => void;
      getCurrentResult: () => unknown;
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
        const devEngine = (window as unknown as {
          __semanticEngine?: { renderOnce?: () => void };
        }).__semanticEngine;
        try {
          devEngine?.renderOnce?.();
        } catch (renderErr) {
          // Non-fatal — Spector will report "No frames detected" if the
          // engine is mid-teardown, but the bridge shouldn't fail the
          // call for this.
          console.debug('[spector-inspector] pre-render threw:', renderErr);
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
            type SpectorEventHandle = {
              add: (cb: (...args: unknown[]) => void) => void;
            };
            const spectorWithEvents = spector as unknown as {
              onCapture?: SpectorEventHandle;
              onError?: SpectorEventHandle;
            };
            spectorWithEvents.onCapture?.add(onCapture as unknown as (...args: unknown[]) => void);
            spectorWithEvents.onError?.add(((err: unknown) => {
              clearTimeout(timeout);
              resolve({ ok: false, reason: 'spector-error', error: String(err) });
            }) as unknown as (...args: unknown[]) => void);
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

    (window as unknown as { __spector: typeof bridge }).__spector = bridge;
    console.log('[spector-inspector] ready; call window.__spector.capture() to begin');
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      delete (window as unknown as { __spector?: unknown }).__spector;
    }
  });
</script>

{#if visible}
  <!--
    Spector.js builds its own UI panel when used interactively. For
    headless agent access we skip that panel and expose the API on
    window.__spector. No visual chrome needed.
  -->
{/if}

<style>
  /* No styles — Spector manages its own UI. */
</style>
