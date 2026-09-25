/**
 * @lib/engine/camera-controls.ts — Camera controls facade
 *
 * Port of js/modules/camera-controls.ts.
 *
 * Re-exports choreography functions from @lib/engine/camera-choreography
 * (already ported), core functions from the local camera-controls-core port,
 * and restore functions from the local camera-controls-restore port.
 */

// ── Re-export ported choreography functions ──────────────────────────────────

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

// ── Re-export cancelFocusCameraAnimation from ported choreography focus ─────

import { cancelFocusCameraAnimation as _cancelFocusCameraAnimation } from './camera-choreography/focus';

export function cancelFocusCameraAnimation(): void {
  _cancelFocusCameraAnimation();
}

// ── Re-export core functions (ported to local) ───────────────────────────────

export {
  setFocusTransitionMode,
  getFocusTransitionProgress,
  startFocusCameraAssist,
  releaseFocusCameraAssist,
  focusCameraAssistIsActive,
  syncCameraAssistDataset,
  setCameraAssistChoreography,
  setRouteExplorationState,
  clearRouteExploration,
  markRouteExploration,
  shouldMarkRouteExploration,
  getRouteLayerOrigin,
} from './camera-controls-core';

// ── Re-export restore functions (ported to local) ────────────────────────────

export {
  OVERVIEW_CAMERA_POSE,
  settleCameraToOverviewPose,
  isCameraIdleOrbitAllowed,
  syncOrbitAutoRotate,
  setAutoRotateSuspended,
  clearAutoRotateResumeTimer,
  scheduleAutoRotateResume,
  noteSceneInteraction,
  updateAutoRotateSoftResume,
  toggleAutoRotate,
} from './camera-controls-restore';
