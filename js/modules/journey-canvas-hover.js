import { state } from '../state.js';
import { canvasInteractionAdapter } from './journey-canvas-hit-test.js';

const CANVAS_FIELD_HOVER_CLEAR_DELAY_MS = 120;
const STABLE_HOVER_STICKY_PX = 9;

export function clearCanvasFieldHover(canvas, { force = false } = {}) {
    if (state.canvasFieldHoverClearTimer) {
        canvasInteractionAdapter.clearTimer(state.canvasFieldHoverClearTimer);
        state.canvasFieldHoverClearTimer = null;
    }
    const clear = () => {
        state.hoverHighlightIndex = -1;
        state.stableCanvasHover = null;
        if (canvas) canvas.style.cursor = '';
        state.lastCanvasNodeHover = null;
    };
    if (force) {
        clear();
        return;
    }
    state.canvasFieldHoverClearTimer = canvasInteractionAdapter.setTimer(clear, CANVAS_FIELD_HOVER_CLEAR_DELAY_MS);
}

export function setCanvasFieldHover(candidate, canvas) {
    if (!candidate || !Number.isFinite(candidate.index)) {
        clearCanvasFieldHover(canvas);
        return;
    }
    if (state.canvasFieldHoverClearTimer) {
        canvasInteractionAdapter.clearTimer(state.canvasFieldHoverClearTimer);
        state.canvasFieldHoverClearTimer = null;
    }

    const prev = state.stableCanvasHover;
    let stableCandidate = candidate;
    if (prev && Number.isFinite(prev.index)) {
        const dx = candidate.screenX - prev.screenX;
        const dy = candidate.screenY - prev.screenY;
        const moved = Math.hypot(dx, dy);
        if (moved > STABLE_HOVER_STICKY_PX) {
            state.stableCanvasHover = candidate;
        } else {
            stableCandidate = prev;
        }
    } else {
        state.stableCanvasHover = candidate;
    }

    state.hoverHighlightIndex = stableCandidate.index;
    if (canvas) canvas.style.cursor = 'pointer';
    state.lastCanvasNodeHover = stableCandidate;
}
