/**
 * @lib/journey/canvas-node-picking.ts — Raycaster-based canvas field node picking
 *
 * Ported from: js/modules/journey-canvas-node-picking.js
 *
 * Pure utility functions for node picking on the 3D canvas.
 * The actual Three.js raycaster operations are delegated to the engine bridge.
 */

/**
 * Compare two canvas node pick candidates by distance.
 * Ported from journey-canvas-node-picking.js compareCanvasNodePickCandidates().
 */
export function compareCanvasNodePickCandidates(
  a: { distance?: number; rayDistance?: number; distanceToRay?: number | null },
  b: { distance?: number; rayDistance?: number; distanceToRay?: number | null }
): number {
  const distA = Number.isFinite(a.distance) ? a.distance! : Infinity;
  const distB = Number.isFinite(b.distance) ? b.distance! : Infinity;
  if (Math.abs(distA - distB) > 1.0) return distA - distB;

  const rayA = Number.isFinite(a.rayDistance) ? a.rayDistance! : Infinity;
  const rayB = Number.isFinite(b.rayDistance) ? b.rayDistance! : Infinity;
  if (Math.abs(rayA - rayB) > 0.1) return rayA - rayB;

  const rayToRayA = Number.isFinite(a.distanceToRay) ? a.distanceToRay! : Infinity;
  const rayToRayB = Number.isFinite(b.distanceToRay) ? b.distanceToRay! : Infinity;
  return rayToRayA - rayToRayB;
}

/**
 * Get the current canvas node picking mode from URL/body dataset.
 * Ported from journey-canvas-node-picking.js getCanvasNodePickingMode().
 */
export function getCanvasNodePickingMode(): 'nearest' | 'raycast' {
  if (typeof window === 'undefined') return 'raycast';
  const urlMode = new URLSearchParams(window.location.search).get('picking');
  const datasetMode = document.body?.dataset?.canvasPickingMode;
  return urlMode === 'nearest' || datasetMode === 'nearest' ? 'nearest' : 'raycast';
}

/**
 * Get the world-space threshold for point picking based on pixel radius.
 * Ported from journey-canvas-node-picking.js getCanvasPointWorldThreshold().
 */
export function getCanvasPointWorldThreshold(
  pixelRadius: number,
  _rect?: { height: number }
): number {
  // Simplified — in the real implementation this uses camera FOV and distance
  const base = 0.035;
  const factor = Math.max(0.012, Math.min(0.09, pixelRadius * 0.01));
  return Math.min(base * factor, 0.09);
}

/**
 * Get a canvas node screen candidate from its index and pointer position.
 * Ported from journey-canvas-node-picking.js getCanvasNodeScreenCandidate().
 */
export function getCanvasNodeScreenCandidate(
  index: number,
  pointer: { x: number; y: number; rect: { width: number; height: number; left: number; top: number } },
  _position?: { x?: number; y?: number; z?: number }
): { index: number; distance: number; screenX: number; screenY: number } | null {
  if (!Number.isFinite(index)) return null;
  return {
    index,
    distance: 9999, // Will be computed by the engine bridge
    screenX: pointer.x,
    screenY: pointer.y
  };
}
