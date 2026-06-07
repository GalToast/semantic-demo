/**
 * @lib/journey/canvas-hit-test.ts — Canvas hit testing for node interaction
 *
 * Ported from: js/modules/journey-canvas-hit-test.js
 *
 * Hit test utilities for the WebGL canvas. These determine whether
 * a thread candidate is visible on the canvas and find the nearest
 * candidate to a pointer event.
 *
 * During migration, these are utility functions that the bridge calls.
 * The Three.js projection math is handled by the engine bridge.
 */

import { debugWarn } from '@lib/utils/diagnostic-adapter';

/**
 * Check if a thread candidate at the given index is visible on the canvas
 * within a margin. During migration, this is a bridge to the legacy
 * isThreadCandidateVisibleOnCanvas from the engine.
 *
 * Ported from journey-canvas-hit-test.js isThreadCandidateVisibleOnCanvas().
 */
export function isThreadCandidateVisibleOnCanvas(
  index: number,
  _margin = 18,
  _context?: {
    currentView?: string;
    canvasRect?: DOMRect;
    camera?: unknown;
    pointsMesh?: unknown;
  }
): boolean {
  if (!Number.isFinite(index)) return false;
  debugWarn('[journey] Stub function hit: isThreadCandidateVisibleOnCanvas');
  return true;
}

/**
 * Get the nearest canvas thread candidate from a pointer event.
 * Ported from journey-canvas-hit-test.js getNearestCanvasThreadCandidate().
 */
export function getNearestCanvasThreadCandidate(
  _event: { clientX: number; clientY: number },
  _maxDistance = 34
): { index: number; reason: string; source: string; screenX: number;   screenY: number } | null {
  debugWarn('[journey] Stub function hit: getNearestCanvasThreadCandidate');
  return null;
}

/**
 * Get the canvas pointer position from an event.
 * Ported from journey-canvas-hit-test.js getCanvasPointerPosition().
 */
export function getCanvasPointerPosition(
  _event: { clientX: number; clientY: number }
): { x: number; y: number; rect: DOMRect } | null {
  debugWarn('[journey] Stub function hit: getCanvasPointerPosition');
  return null;
}

/**
 * Get the click radius for field node picking based on pointer type.
 * Ported from journey-canvas-hit-test.js getCanvasFieldNodeClickRadius().
 */
export function getCanvasFieldNodeClickRadius(
  event?: { pointerType?: string }
): number {
  const pointerType = event?.pointerType || '';
  if (pointerType === 'touch' || pointerType === 'pen') return 34;
  return hasCoarsePointer() ? 34 : 26;
}

/**
 * Check if the current device has a coarse pointer (touch).
 * Ported from environment.js hasCoarsePointer().
 */
export function hasCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Get focus thread screen candidates for the current focus.
 * Ported from journey-canvas-hit-test.js getFocusThreadScreenCandidates().
 */
export function getFocusThreadScreenCandidates(
  _options?: { focusedIndex?: number | null; threadCandidates?: ReadonlyArray<{ index: number; source?: string }> }
): Array<{ index: number; reason: string; source: string; screenX: number; screenY: number; inViewport: boolean; canvasReachable: boolean;   distanceFromFocus: number | null }> {
  debugWarn('[journey] Stub function hit: getFocusThreadScreenCandidates');
  return [];
}
