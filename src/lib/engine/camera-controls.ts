/**
 * @lib/engine/camera-controls.ts — Camera controls facade
 *
 * Port of js/modules/camera-controls.ts.
 *
 * Re-exports choreography functions from @lib/engine/camera-choreography
 * (already ported) and lazy-loads camera-controls-core and
 * camera-controls-restore from legacy for the remaining surface.
 *
 * Legacy module dependencies are lazy-loaded at module init time via
 * _ensureModules(). Exported functions are synchronous with defensive guards.
 */

// ── Re-export ported choreography functions ──────────────────────────────────

import * as cameraControlsCoreModule from '../../../js/modules/camera-controls-core.ts';
import * as cameraControlsRestoreModule from '../../../js/modules/camera-controls-restore.ts';
import * as cameraControlsChoreographyModule from '../../../js/modules/camera-controls-choreography.ts';

export {
  animateCameraToNode,
  focusOnNode,
  animateCameraToSearchCorridor,
  animateCameraToTerrainPrelude,
  applySemanticCentroidCamera,
  zoomCamera,
  clearInsideCentroid,
} from './camera-choreography';

export type { FocusOnNodeOptions, AnimateCameraToNodeOptions } from './camera-choreography';

// ── Legacy Module Type Contracts ──────────────────────────────────────────────

interface CameraControlsCoreModule {
  setFocusTransitionMode(mode: string, options?: { duration?: number }): void;
  getFocusTransitionProgress(duration?: number): number;
  startFocusCameraAssist(duration?: number, reason?: string): void;
  releaseFocusCameraAssist(reason?: string): void;
  focusCameraAssistIsActive(now?: number): boolean;
  syncCameraAssistDataset(): void;
  setCameraAssistChoreography(phase?: string, reason?: string): void;
  setRouteExplorationState(phase?: string, reason?: string): void;
  clearRouteExploration(reason?: string): void;
  markRouteExploration(reason?: string): void;
  shouldMarkRouteExploration(reason?: string): boolean;
  getRouteLayerOrigin(): unknown;
}

interface CameraControlsRestoreModule {
  OVERVIEW_CAMERA_POSE: { position: number[]; target: number[] };
  settleCameraToOverviewPose(): void;
  isCameraIdleOrbitAllowed(): boolean;
  syncOrbitAutoRotate(): void;
  setAutoRotateSuspended(suspended: boolean): void;
  clearAutoRotateResumeTimer(): void;
  scheduleAutoRotateResume(delay: number): void;
  noteSceneInteraction(delay: number): void;
  updateAutoRotateSoftResume(now?: number): void;
  toggleAutoRotate(): void;
}

interface CameraControlsChoreographyModule {
  cancelFocusCameraAnimation(): void;
}

// ── Lazy Module Cache ────────────────────────────────────────────────────────

let _core: CameraControlsCoreModule | null = cameraControlsCoreModule as unknown as CameraControlsCoreModule;
let _restore: CameraControlsRestoreModule | null = cameraControlsRestoreModule as unknown as CameraControlsRestoreModule;
let _choreography: CameraControlsChoreographyModule | null =
  cameraControlsChoreographyModule as unknown as CameraControlsChoreographyModule;

let _loaded = true;

async function _ensureModules(): Promise<void> {
  return;
}

void _ensureModules();

// ── Choreography functions (from legacy choreography module) ─────────────────

export function cancelFocusCameraAnimation(): any {
  return _choreography?.cancelFocusCameraAnimation();
}

// ── Restore functions (from legacy restore module) ───────────────────────────

export const OVERVIEW_CAMERA_POSE: { position: number[]; target: number[] } = {
  position: [],
  target: [],
};

// Sync OVERVIEW_CAMERA_POSE from legacy module once loaded
void (async () => {
  while (!_loaded) await new Promise((r) => setTimeout(r, 10));
  const restoreModule = _restore as { OVERVIEW_CAMERA_POSE?: { position: number[]; target: number[] } } | null;
  if (restoreModule?.OVERVIEW_CAMERA_POSE) {
    (OVERVIEW_CAMERA_POSE as any).position = restoreModule.OVERVIEW_CAMERA_POSE.position;
    (OVERVIEW_CAMERA_POSE as any).target = restoreModule.OVERVIEW_CAMERA_POSE.target;
  }
})();

export function settleCameraToOverviewPose(): any {
  return _restore?.settleCameraToOverviewPose();
}

export function isCameraIdleOrbitAllowed(): any {
  return _restore?.isCameraIdleOrbitAllowed();
}

export function syncOrbitAutoRotate(): any {
  return _restore?.syncOrbitAutoRotate();
}

export function setAutoRotateSuspended(suspended: boolean): any {
  return _restore?.setAutoRotateSuspended(suspended);
}

export function clearAutoRotateResumeTimer(): any {
  return _restore?.clearAutoRotateResumeTimer();
}

export function scheduleAutoRotateResume(delay: number): any {
  return _restore?.scheduleAutoRotateResume(delay);
}

export function noteSceneInteraction(delay: number): any {
  return _restore?.noteSceneInteraction(delay);
}

export function updateAutoRotateSoftResume(now = performance.now()): any {
  return _restore?.updateAutoRotateSoftResume(now);
}

export function toggleAutoRotate(): any {
  return _restore?.toggleAutoRotate();
}

// ── Core functions (from legacy core module) ─────────────────────────────────

export function setFocusTransitionMode(mode: string, options: any = {}): any {
  return _core?.setFocusTransitionMode(mode, options);
}

export function getFocusTransitionProgress(duration = 640): any {
  return _core?.getFocusTransitionProgress(duration);
}

export function startFocusCameraAssist(duration = 900, reason = 'focus'): any {
  return _core?.startFocusCameraAssist(duration, reason);
}

export function releaseFocusCameraAssist(reason = 'manual'): any {
  return _core?.releaseFocusCameraAssist(reason);
}

export function focusCameraAssistIsActive(now = performance.now()): any {
  return _core?.focusCameraAssistIsActive(now);
}

export function syncCameraAssistDataset(): any {
  return _core?.syncCameraAssistDataset();
}

export function setCameraAssistChoreography(phase = 'free', reason = 'view-handoff'): any {
  return _core?.setCameraAssistChoreography(phase, reason);
}

export function setRouteExplorationState(phase = 'idle', reason = ''): any {
  return _core?.setRouteExplorationState(phase, reason);
}

export function clearRouteExploration(reason = 'clear'): any {
  return _core?.clearRouteExploration(reason);
}

export function markRouteExploration(reason = 'user-control'): any {
  return _core?.markRouteExploration(reason);
}

export function shouldMarkRouteExploration(reason = ''): any {
  return _core?.shouldMarkRouteExploration(reason);
}

export function getRouteLayerOrigin(): any {
  return _core?.getRouteLayerOrigin();
}
