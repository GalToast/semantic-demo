/**
 * @lib/journey/canvas-interaction.ts — Canvas node interaction orchestration
 *
 * Ported from: js/modules/journey-canvas-interaction.js
 *
 * Coordinates canvas node picking, hover, and click-to-walk flow.
 * During migration, this is a facade/bridge to the legacy runtime.
 */

import { debugWarn } from '@lib/utils/diagnostic-adapter';

/**
 * Initialize the journey canvas interaction adapter.
 * Ported from journey-canvas-interaction.js initJourneyCanvasInteractionAdapter().
 */
export function initJourneyCanvasInteractionAdapter(
  _deps: {
    summarizeNeighborReason?: (candidate: unknown, point: unknown, focusPoint: unknown) => string;
    walkThreadNeighbor?: (index: number, options: unknown) => void;
    inspectThreadNeighbor?: (index: number, options: unknown) => unknown;
    scheduleCanvasThreadInspectionClear?: (delay?: number) => void;
    setTimer?: (fn: () => void, delay: number) => number;
    clearTimer?: (id: number) => void;
  } = {}
): void {
  debugWarn('[journey] Stub function hit: initJourneyCanvasInteractionAdapter');
}

/**
 * Check if a thread candidate is visible on the canvas.
 * Ported from journey-canvas-hit-test.js isThreadCandidateVisibleOnCanvas()
 * (re-exported via the interaction module).
 */
export function isThreadCandidateVisibleOnCanvas(
  _index: number,
  _margin = 18
): boolean {
  debugWarn('[journey] Stub function hit: isThreadCandidateVisibleOnCanvas');
  return true;
}

/**
 * Ensure canvas node interaction bindings are active.
 * Ported from journey-canvas-interaction.js ensureCanvasNodeInteractionBindings().
 */
export function ensureCanvasNodeInteractionBindings(): void {
  debugWarn('[journey] Stub function hit: ensureCanvasNodeInteractionBindings');
}
