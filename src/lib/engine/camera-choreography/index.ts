/**
 * @lib/engine/camera-choreography/index.ts — Camera choreography public API
 *
 * Barrel export for focus camera animation, focus-node orchestrator,
 * and route/terrain/centroid/zoom camera animations.
 *
 * Usage:
 * ```ts
 * import { focusOnNode, animateCameraToNode } from '@lib/engine/camera-choreography';
 * ```
 */

export { animateCameraToNode } from './focus';
export type { AnimateCameraToNodeOptions } from './focus';

export { focusOnNode } from './cursor';
export type { FocusOnNodeOptions } from './cursor';

export {
  animateCameraToSearchCorridor,
  animateCameraToTerrainPrelude,
  applySemanticCentroidCamera,
  zoomCamera,
  clearInsideCentroid,
} from './routes';
