/**
 * @lib/journey/canvas-hover.ts — Canvas field hover state management
 *
 * Port of js/modules/journey-canvas-hover.js
 *
 * Manages canvas hover highlight index, stable hover tracking,
 * cursor state, and lastCanvasNodeHover for canvas pointer events.
 * Uses canvasInteractionAdapter from canvas-hit-test for timer management.
 */
import { appState } from '@lib/state/app.svelte';
import { canvasInteractionAdapter } from './canvas-hit-test';

const CANVAS_FIELD_HOVER_CLEAR_DELAY_MS = 120;
const STABLE_HOVER_STICKY_PX = 9;

let _canvasFieldHoverClearTimer: number | undefined = undefined;

export function clearCanvasFieldHover(
  canvas: HTMLCanvasElement | null,
  { force = false }: { force?: boolean } = {}
): void {
  if (_canvasFieldHoverClearTimer != null) {
    canvasInteractionAdapter.clearTimer(_canvasFieldHoverClearTimer);
    _canvasFieldHoverClearTimer = undefined;
  }
  const clear = (): void => {
    appState.hoverHighlightIndex = -1;
    appState.stableCanvasHover = null;
    if (canvas) canvas.style.cursor = '';
    appState.lastCanvasNodeHover = null;
  };
  if (force) {
    clear();
    return;
  }
  _canvasFieldHoverClearTimer = canvasInteractionAdapter.setTimer(
    clear,
    CANVAS_FIELD_HOVER_CLEAR_DELAY_MS
  );
}

export interface HoverCandidate {
  index: number;
  screenX: number;
  screenY: number;
  source?: string;
  reason?: string;
}

export function setCanvasFieldHover(
  candidate: HoverCandidate | null,
  canvas: HTMLCanvasElement | null
): void {
  if (!candidate || !Number.isFinite(candidate.index)) {
    clearCanvasFieldHover(canvas);
    return;
  }
  if (_canvasFieldHoverClearTimer != null) {
    canvasInteractionAdapter.clearTimer(_canvasFieldHoverClearTimer);
    _canvasFieldHoverClearTimer = undefined;
  }

  const prev = appState.stableCanvasHover as HoverCandidate | null;
  let stableCandidate: HoverCandidate = candidate;
  if (prev && Number.isFinite(prev.index)) {
    const dx = candidate.screenX - prev.screenX;
    const dy = candidate.screenY - prev.screenY;
    const moved = Math.hypot(dx, dy);
    if (moved > STABLE_HOVER_STICKY_PX) {
      appState.stableCanvasHover = candidate as unknown as typeof appState.stableCanvasHover;
    } else {
      stableCandidate = prev;
    }
  } else {
    appState.stableCanvasHover = candidate as unknown as typeof appState.stableCanvasHover;
  }

  appState.hoverHighlightIndex = stableCandidate.index;
  if (canvas) canvas.style.cursor = 'pointer';
  appState.lastCanvasNodeHover = stableCandidate as unknown as typeof appState.lastCanvasNodeHover;
}
