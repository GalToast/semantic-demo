/**
 * @lib/engine/camera-orbit-slack-bridge.ts — Bridge re-exporting orbit slack from camera-choreography
 *
 * Replaces: js/modules/camera-orbit-slack.ts (kernel)
 *
 * This bridge provides the canonical import path for consumers that need
 * orbit slack functions but live outside the camera-choreography directory.
 */

export {
  isSearchRouteFocusActive,
  getFocusOrbitSlackPivot,
  applyFocusOrbitSlack,
  clearFocusOrbitSlack,
} from './camera-choreography/orbit-slack'
