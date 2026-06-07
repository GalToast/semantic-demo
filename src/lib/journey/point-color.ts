/**
 * @lib/journey/point-color.ts — Per-point color derivation
 *
 * Ported from: js/modules/journey-point-color.js
 *
 * Pure color derivation functions for the semantic field.
 * Three.js color utilities are imported only for the type-level interface.
 * Actual rendering is handled by Three.js on the WebGL side.
 */

import type { BusinessRecord } from '@lib/types/business';

/**
 * Describe the lens/thread state for a given business point.
 * Ported from journey-point-color.js describeThreadLensForPoint().
 */
export function describeThreadLensForPoint(
  point: BusinessRecord | null,
  options: {
    myceliumMode?: string;
    neighborCount?: number;
    clusterLabel?: string;
    pointStatus?: string;
  } = {}
): string {
  if (!point) return 'Waiting for a semantic thread.';

  const { myceliumMode = 'default', clusterLabel = '', pointStatus = '' } = options;
  const neighborCount = Number(options.neighborCount) || 0;

  if (neighborCount === 0) {
    const LENS_BY_MODE: Record<string, string> = {
      bloom: 'Signal-rich — surfaced for businesses with a website plus email or phone',
      bridge: 'Between neighborhoods — highlighted for businesses linking neighborhoods',
      trail: 'Connection Trail — focused on semantic neighbors',
      default: clusterLabel ? `${clusterLabel} neighborhood` : 'County View'
    };
    const base: string = LENS_BY_MODE[myceliumMode] ?? 'County View';
    if (pointStatus === 'disqualified') return `Archive layer — ${base}`;
    return base;
  }

  if (neighborCount <= 3) {
    return `Sparse node — only ${neighborCount} connection${neighborCount === 1 ? '' : 's'}.`;
  }
  if (neighborCount >= 20) {
    const anchorWord = clusterLabel || 'County';
    return `Strong anchor in ${anchorWord} cluster with ${neighborCount} semantic neighbors.`;
  }
  return `Connected node — ${neighborCount} semantic neighbors in ${clusterLabel || 'local'} cluster.`;
}

/**
 * Get the intensity factor for a point based on its focus/visibility state.
 * Ported from the per-point factor calculation in applyPointFilterColors().
 */
export function getPointIntensityFactor(
  pointIndex: number,
  focusedIndex: number | null,
  focusLocalIndices: Set<number>,
  historySet: Set<number>,
  isVisible: boolean,
  options: {
    isSemanticFocus?: boolean;
    isTrailMode?: boolean;
    trailIndices?: Set<number>;
    role?: string | null;
    inPocket?: boolean;
    isVisited?: boolean;
  } = {}
): number {
  if (!isVisible) return 0.08;

  const { isSemanticFocus = false, isTrailMode = false, trailIndices = new Set(), role = null, inPocket = false, isVisited = false } = options;
  const nodeMinFloor = 0.65;

  if (focusedIndex !== null) {
    if (isTrailMode) {
      if (trailIndices.size > 0) {
        if (trailIndices.has(pointIndex)) {
          return pointIndex === focusedIndex ? 2.14 : (isSemanticFocus ? 1.74 : 1.48);
        }
        return isVisited ? 1.18 : (isSemanticFocus ? 0.24 : 0.18);
      }
      return isVisited ? 1.18 : 0.28;
    }

    const raw = focusLocalIndices.has(pointIndex)
      ? (pointIndex === focusedIndex
          ? 3.18
          : (role === 'primary'
              ? 2.52
              : (role === 'support'
                  ? 1.78
                  : (inPocket ? 2.1 : (isSemanticFocus ? 1.8 : 1.34)))))
      : (isVisited ? 1.28 : (isSemanticFocus ? 0.32 : 0.22));
    return Math.max(raw, nodeMinFloor);
  }

  return 0.34;
}

/**
 * Compute a state key for the point filter color system.
 * Ported from the state key construction in applyPointFilterColors().
 */
export function computeFilterColorStateKey(
  filterVersion: number,
  mode: string,
  focusedIndex: number | null,
  trailDepth: number,
  myceliumMode: string,
  threadSource: string,
  trailNeighborIndices: readonly number[],
  focusPocketIndices: readonly number[],
  walkHistoryIndices: readonly number[]
): string {
  return [
    filterVersion,
    mode || 'overview',
    focusedIndex ?? 'none',
    trailDepth ?? 0,
    myceliumMode || 'default',
    threadSource || 'none',
    trailNeighborIndices.slice(0, 12).join(','),
    focusPocketIndices.slice(0, 18).join(','),
    walkHistoryIndices.slice(-6).join(',')
  ].join('|');
}
