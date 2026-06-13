/**
 * @lib/journey/thread-inspector.ts — Thread inspection overlay management
 *
 * Ported from: js/modules/thread-inspector.js
 *
 * Bridge/stub for thread inspection state. During migration,
 * actual overlay rendering is handled by the ThreadInspector.svelte
 * component and the engine bridge.
 */

import type { ThreadInspectorState } from '@lib/types/state';
import { debugWarn } from '@lib/utils/diagnostic-adapter';

/**
 * Get the thread inspection state for a given index.
 * Ported from thread-inspector.js getThreadInspectionState().
 */
export function getThreadInspectionState(
  _index: number | null,
  _options?: { surface?: string }
): ThreadInspectorState & {
  title?: string;
  copy?: string;
  meta?: string;
  journeyPhase?: string;
  pinned?: boolean;
} {
  debugWarn('[journey] Stub function hit: getThreadInspectionState');
  return {
    active: false,
    source: 'none',
    inspectedIndex: null,
    pinnedIndex: null,
    pointerInside: false,
    segmentCount: 0,
    braidCount: 0,
    endpointCount: 0
  };
}

/**
 * Render the thread inspection overlay.
 * Ported from thread-inspector.js renderThreadInspection().
 */
export function renderThreadInspection(
  _index?: number | null,
  _options?: Record<string, unknown>
): ReturnType<typeof getThreadInspectionState> {
  debugWarn('[journey] Stub function hit: renderThreadInspection');
  return getThreadInspectionState(null);
}

/**
 * Inspect a thread neighbor.
 * Ported from thread-inspector.js inspectThreadNeighbor().
 */
export function inspectThreadNeighbor(
  _index: number,
  _options?: { force?: boolean; preserveJourney?: boolean; surface?: string }
): ReturnType<typeof renderThreadInspection> {
  debugWarn('[journey] Stub function hit: inspectThreadNeighbor');
  return renderThreadInspection(null);
}

/**
 * Pin a thread neighbor for click-lock inspection.
 * Ported from thread-inspector.js pinThreadNeighbor().
 */
export function pinThreadNeighbor(
  _index: number,
  _options?: { reason?: string; surface?: string }
): ReturnType<typeof renderThreadInspection> {
  debugWarn('[journey] Stub function hit: pinThreadNeighbor');
  return renderThreadInspection(null);
}

/**
 * Unpin thread inspection.
 * Ported from thread-inspector.js unpinThreadInspection().
 */
export function unpinThreadInspection(): ReturnType<typeof renderThreadInspection> {
  debugWarn('[journey] Stub function hit: unpinThreadInspection');
  return renderThreadInspection(null);
}

/**
 * Schedule a canvas thread inspection clear.
 * Ported from thread-inspector.js scheduleCanvasThreadInspectionClear().
 */
export function scheduleCanvasThreadInspectionClear(
  _delay?: number
): void {
  debugWarn('[journey] Stub function hit: scheduleCanvasThreadInspectionClear');
}

/**
 * Clear thread inspection.
 * Ported from thread-inspector.js clearThreadInspection().
 */
export function clearThreadInspection(
  _options?: { force?: boolean; preserveJourney?: boolean }
): ReturnType<typeof renderThreadInspection> {
  debugWarn('[journey] Stub function hit: clearThreadInspection');
  return renderThreadInspection(null);
}

/**
 * Explore/follow a thread neighbor.
 * Ported from thread-inspector.js exploreThreadNeighbor().
 */
export function exploreThreadNeighbor(
  _index: number,
  _options?: {
    fromIndex?: number;
    fromCanvasNode?: boolean;
    surface?: string;
    reason?: string;
    restoreHistory?: boolean;
    arrivalDelay?: number;
    settleDelay?: number;
  }
): { targetIndex: number; fromIndex: number | null | undefined; reason: string } | null {
  debugWarn('[journey] Stub function hit: exploreThreadNeighbor');
  return null;
}
