/**
 * @lib/engine/adapters/camera-bridge.ts — Camera transitions, poses, and orbit sync
 *
 * Handles all camera-related operations that the EngineBridge exposes:
 * focus animation, auto-rotate, zoom, viewport resize, and overview settling.
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * 1. CAMERA ONLY.  This adapter does not touch search glow, filters, lifecycle,
 *    or data syncing.  Its sole dependency is the CameraControlsModule.
 * 2. DEFENSIVE.  Guards every method with `assertReady` and `assertModules`
 *    so callers get clear errors when the engine has not been initialised.
 * 3. THIN DELEGATION.  Each method calls exactly one legacy module function.
 *    No business logic or animation math lives here.
 */

import type {
  BridgeContext,
  EngineBridge,
  FocusNodeOptions,
} from './types';

// ── Public Factory ───────────────────────────────────────────────────────────

/**
 * Create the camera slice of the EngineBridge.
 *
 * The returned object is spread into the final bridge by the core factory.
 * Each method closes over `ctx` so it reads the latest module references
 * populated during init/loadModules.
 */
export function createCameraMethods(
  ctx: BridgeContext
): Pick<EngineBridge, 'focusNode' | 'clearFocus' | 'resize' | 'setAutoRotate' | 'zoomCamera' | 'settleToOverview'> {

  function _assertReady(method: string): void {
    if (ctx.status !== 'ready') {
      throw new Error(
        `EngineBridge.${method}: engine status is "${ctx.status}", expected "ready"`
      );
    }
  }

  function _assertModules(method: string): void {
    if (!ctx._threeEngine || !ctx._cameraControls) {
      throw new Error(`EngineBridge.${method}: legacy modules not loaded`);
    }
  }

  return {
    // ── Node Interaction (camera side) ──────────────────────────────────

    focusNode(index: number, options: FocusNodeOptions = {}): void {
      _assertReady('focusNode');
      _assertModules('focusNode');

      ctx._cameraControls!.focusOnNode(index, {
        duration: options.durationMs,
        reason: options.reason ?? 'svelte-focus',
      });
    },

    clearFocus(): void {
      _assertReady('clearFocus');
      _assertModules('clearFocus');

      ctx._cameraControls!.settleCameraToOverviewPose();
    },

    // ── Viewport & Orbit ────────────────────────────────────────────────

    resize(width: number, height: number): void {
      _assertReady('resize');

      if (!ctx._state?.camera || !ctx._state?.renderer) return;

      ctx._state.camera.aspect = width / height;
      ctx._state.camera.updateProjectionMatrix();
      ctx._state.renderer.setSize(width, height);
      ctx._threeEngine?.updateCameraViewportOffset();
    },

    setAutoRotate(enabled: boolean): void {
      _assertReady('setAutoRotate');
      _assertModules('setAutoRotate');

      ctx._cameraControls!.setAutoRotateSuspended(!enabled);
      ctx._cameraControls!.syncOrbitAutoRotate();
    },

    zoomCamera(multiplier: number): void {
      _assertReady('zoomCamera');
      _assertModules('zoomCamera');

      ctx._cameraControls!.zoomCamera(multiplier);
    },

    settleToOverview(): void {
      _assertReady('settleToOverview');
      _assertModules('settleToOverview');

      ctx._cameraControls!.settleCameraToOverviewPose();
    },
  };
}
