/**
 * @lib/journey/canvas-hover.ts — Canvas field hover state management
 *
 * Port of js/modules/journey-canvas-hover.js
 *
 * Manages canvas hover highlight index, stable hover tracking,
 * cursor state, and lastCanvasNodeHover for canvas pointer events.
 * Uses canvasInteractionAdapter from canvas-hit-test for timer management.
 */
import { state } from '../../../js/state';
import { canvasInteractionAdapter } from './canvas-hit-test';

const CANVAS_FIELD_HOVER_CLEAR_DELAY_MS = 120;
const STABLE_HOVER_STICKY_PX = 9;

export function clearCanvasFieldHover(
  canvas: HTMLCanvasElement | null,
  { force = false }: { force?: boolean } = {}
): void {
  if ((state as unknown as Record<string, unknown>).canvasFieldHoverClearTimer != null) {
    canvasInteractionAdapter.clearTimer(
      (state as unknown as Record<string, unknown>).canvasFieldHoverClearTimer as number | undefined
    );
    (state as unknown as Record<string, unknown>).canvasFieldHoverClearTimer = null;
  }
  const clear = (): void => {
    state.hoverHighlightIndex = -1;
    state.stableCanvasHover = null;
    if (canvas) canvas.style.cursor = '';
    state.lastCanvasNodeHover = null;
  };
  if (force) {
    clear();
    return;
  }
  (state as unknown as Record<string, unknown>).canvasFieldHoverClearTimer = canvasInteractionAdapter.setTimer(
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
  const lState = state as unknown as Record<string, unknown>;
  if (lState.canvasFieldHoverClearTimer != null) {
    canvasInteractionAdapter.clearTimer(lState.canvasFieldHoverClearTimer as number | undefined);
    lState.canvasFieldHoverClearTimer = null;
  }

  const prev = state.stableCanvasHover as HoverCandidate | null;
  let stableCandidate: HoverCandidate = candidate;
  if (prev && Number.isFinite(prev.index)) {
    const dx = candidate.screenX - prev.screenX;
    const dy = candidate.screenY - prev.screenY;
    const moved = Math.hypot(dx, dy);
    if (moved > STABLE_HOVER_STICKY_PX) {
      state.stableCanvasHover = candidate as unknown as typeof state.stableCanvasHover;
    } else {
      stableCandidate = prev;
    }
  } else {
    state.stableCanvasHover = candidate as unknown as typeof state.stableCanvasHover;
  }

  state.hoverHighlightIndex = stableCandidate.index;
  if (canvas) canvas.style.cursor = 'pointer';
  state.lastCanvasNodeHover = stableCandidate as unknown as typeof state.lastCanvasNodeHover;
}
