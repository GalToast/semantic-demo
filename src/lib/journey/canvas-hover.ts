/**
 * @lib/journey/canvas-hover.ts — Canvas field hover state management
 *
 * Ported from: js/modules/journey-canvas-hover.js
 *
 * Manages hover state for canvas nodes, with stable hover sticking
 * and clear delay for smooth UX.
 */

/** Delay before clearing hover state (ms). */
const CANVAS_FIELD_HOVER_CLEAR_DELAY_MS = 120;

/** Distance threshold for stable hover sticking (px). */
const STABLE_HOVER_STICKY_PX = 9;

/**
 * Clear the canvas field hover state.
 * Ported from journey-canvas-hover.js clearCanvasFieldHover().
 */
export function clearCanvasFieldHover(
  _canvas: HTMLElement | null,
  options: { force?: boolean } = {}
): void {
  const { force = false } = options;
  if (force) {
    clearHoverState(null);
  } else {
    scheduleHoverClear();
  }
}

/**
 * Set the canvas field hover candidate.
 * Ported from journey-canvas-hover.js setCanvasFieldHover().
 */
export function setCanvasFieldHover(
  candidate: { index: number; screenX?: number; screenY?: number } | null,
  _canvas: HTMLElement | null
): void {
  if (!candidate || !Number.isFinite(candidate.index)) {
    clearCanvasFieldHover(null);
    return;
  }

  const prev = getStableHover();
  let stableCandidate = candidate;

  if (prev && Number.isFinite(prev.index)) {
    const dx = (candidate.screenX || 0) - (prev.screenX || 0);
    const dy = (candidate.screenY || 0) - (prev.screenY || 0);
    const moved = Math.hypot(dx, dy);
    if (moved > STABLE_HOVER_STICKY_PX) {
      setStableHover(candidate);
    } else {
      stableCandidate = prev;
    }
  } else {
    setStableHover(candidate);
  }

  setHoverHighlightIndex(stableCandidate.index);
}

// ── Internal/Global State (mimics the module-scoped vars in the JS version) ──

interface StableHoverState {
  index: number;
  screenX: number;
  screenY: number;
}

let _stableHover: StableHoverState | null = null;
let _hoverHighlightIndex: number = -1;
let _hoverClearTimer: ReturnType<typeof setTimeout> | null = null;

function getStableHover(): StableHoverState | null {
  return _stableHover;
}

function setStableHover(candidate: { index: number; screenX?: number; screenY?: number }): void {
  _stableHover = {
    index: candidate.index,
    screenX: candidate.screenX ?? 0,
    screenY: candidate.screenY ?? 0
  };
}

function setHoverHighlightIndex(index: number): void {
  _hoverHighlightIndex = index;
  // Update body data attribute for CSS
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.hoverNode = index >= 0 ? String(index) : '';
  }
}

function clearHoverState(_canvas: HTMLElement | null): void {
  _hoverHighlightIndex = -1;
  _stableHover = null;
  if (typeof document !== 'undefined' && document.body) {
    document.body.removeAttribute('data-hover-node');
  }
}

function scheduleHoverClear(): void {
  if (_hoverClearTimer) {
    clearTimeout(_hoverClearTimer);
  }
  _hoverClearTimer = setTimeout(() => {
    _hoverClearTimer = null;
    clearHoverState(null);
  }, CANVAS_FIELD_HOVER_CLEAR_DELAY_MS);
}

/**
 * Get the current hover highlight index. Used by the engine bridge.
 */
export function getActiveHoverIndex(): number {
  return _hoverHighlightIndex;
}

/**
 * Clean up hover timers. Call on destroy.
 */
export function disposeHoverState(): void {
  if (_hoverClearTimer) {
    clearTimeout(_hoverClearTimer);
    _hoverClearTimer = null;
  }
  _stableHover = null;
  _hoverHighlightIndex = -1;
}
