/**
 * @lib/demo/camera.ts — Camera snapshot and animation helpers for the micro-demo
 *
 * Ported from: js/modules/micro-demo-camera.js
 *
 * Camera snapshot helpers. During migration, these are bridge stubs.
 * The actual camera operations happen in the legacy engine.
 */

/**
 * Capture an overview camera snapshot.
 * Ported from micro-demo-camera.js captureOverviewCameraSnapshot().
 */
export function captureOverviewCameraSnapshot(): void {
  // Bridge stub — delegates to the legacy engine
}

/**
 * Get the overview camera snapshot.
 * Ported from micro-demo-camera.js getOverviewCameraSnapshot().
 */
export function getOverviewCameraSnapshot(): { camera: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } } {
  return {
    camera: { x: 0, y: 3.5, z: 5 },
    target: { x: 0, y: 0, z: 0 }
  };
}

/**
 * Animate the camera to the overview position.
 * Ported from micro-demo-camera.js animateCameraToOverview().
 */
export function animateCameraToOverview(_duration: number = 1000): void {
  // Bridge stub — delegates to the legacy engine
}

/**
 * Cancel any in-progress overview camera animation.
 * Ported from micro-demo-camera.js cancelOverviewCameraAnimation().
 */
export function cancelOverviewCameraAnimation(): void {
  // Bridge stub — prevents RAF leaks in the legacy runtime
}
