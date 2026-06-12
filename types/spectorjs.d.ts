// Type shim for `spectorjs` v0.9.30 which ships as an untyped UMD bundle.
// We use this for the dev-only SpectorInspector; production tree-shakes the
// import out via `import.meta.env.DEV` so the any-typed surface never ships.

declare module 'spectorjs' {
  export class Spector {
    constructor(options?: { enableXRCapture?: boolean });
    captureCanvas(canvas: HTMLCanvasElement, maxFrames?: number, quickCapture?: boolean, fullCapture?: boolean): void;
    captureContext(
      context: WebGLRenderingContext | WebGL2RenderingContext,
      maxFrames?: number,
      quickCapture?: boolean,
      fullCapture?: boolean,
    ): void;
    captureNextFrame(target: HTMLCanvasElement | WebGLRenderingContext | WebGL2RenderingContext, quickCapture?: boolean, fullCapture?: boolean): void;
    startCapture(target: HTMLCanvasElement | WebGLRenderingContext | WebGL2RenderingContext, maxFrames?: number, quickCapture?: boolean, fullCapture?: boolean): void;
    pauseCapture(): void;
    playCapture(): void;
    stopCapture(): unknown;
    getCurrentResult(): unknown;
    displayUI(forceTrackCanvases?: boolean): void;
    setMarker(marker: string): void;
    clearMarker(): void;
    log(message: string): void;
    onCaptureStarted: { add: (cb: () => void) => void };
    onCapture: { add: (cb: (capture: unknown) => void) => void };
    onError: { add: (cb: (err: unknown) => void) => void };
  }

  // The bundle exposes a default export in some module-system shapes.
  const _default: { Spector?: typeof Spector };
  export default _default;
}
