/**
 * @lib/stores/scene-ready.svelte.ts — WebGL scene readiness signals
 *
 * Exposes s3dSceneReady / s3dSceneError as a Svelte 5 $state-backed store
 * so non-sibling components (e.g. DemoChoreography) can gate behaviour on
 * the canvas actually being rendered.
 *
 * Written by App.svelte via the onSceneReady / onSceneError Canvas callbacks.
 * Read by DemoChoreography.svelte to phase-gate the auto-demo.
 */

let _ready = $state(false);
let _error = $state(false);

/** Signal that the WebGL scene has rendered at least one frame. */
export function signalSceneReady(): void {
  _ready = true;
}

/** Signal that the WebGL scene failed to initialize. */
export function signalSceneError(): void {
  _error = true;
}

/** Reset both signals (used by tests or hot-reload). */
export function resetSceneReady(): void {
  _ready = false;
  _error = false;
}

export const sceneReady = {
  /** Whether the WebGL canvas has finished its first render. */
  get value(): boolean {
    return _ready;
  },
  /** Whether the WebGL canvas reported an init error. */
  get error(): boolean {
    return _error;
  },
  signalSceneReady,
  signalSceneError,
  resetSceneReady,
};
