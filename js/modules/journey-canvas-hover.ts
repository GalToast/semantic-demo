/**
 * journey-canvas-hover.ts
 * Canonical TS module — preserves export/import parity with the prior
 * journey-canvas-hover.js twin.
 */
import { state } from '@lib/engine/state-bridge';
import { canvasInteractionAdapter } from './journey-canvas-hit-test.ts';

const CANVAS_FIELD_HOVER_CLEAR_DELAY_MS = 120;
const STABLE_HOVER_STICKY_PX = 9;

export function clearCanvasFieldHover(canvas: HTMLCanvasElement | null, { force = false } = {}): void {
    if ((state as any).canvasFieldHoverClearTimer) {
        canvasInteractionAdapter.clearTimer((state as any).canvasFieldHoverClearTimer);
        (state as any).canvasFieldHoverClearTimer = null;
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
    (state as any).canvasFieldHoverClearTimer = canvasInteractionAdapter.setTimer(clear, CANVAS_FIELD_HOVER_CLEAR_DELAY_MS);
}

interface HoverCandidate {
    index: number;
    screenX: number;
    screenY: number;
    source?: string;
    reason?: string;
    [key: string]: unknown;
}

export function setCanvasFieldHover(candidate: HoverCandidate | null, canvas: HTMLCanvasElement | null): void {
    if (!candidate || !Number.isFinite(candidate.index)) {
        clearCanvasFieldHover(canvas);
        return;
    }
    if ((state as any).canvasFieldHoverClearTimer) {
        canvasInteractionAdapter.clearTimer((state as any).canvasFieldHoverClearTimer);
        (state as any).canvasFieldHoverClearTimer = null;
    }

    const prev = state.stableCanvasHover as HoverCandidate | null;
    let stableCandidate = candidate;
    if (prev && Number.isFinite(prev.index)) {
        const dx = candidate.screenX - prev.screenX;
        const dy = candidate.screenY - prev.screenY;
        const moved = Math.hypot(dx, dy);
        if (moved > STABLE_HOVER_STICKY_PX) {
            state.stableCanvasHover = candidate as any;
        } else {
            stableCandidate = prev;
        }
    } else {
        state.stableCanvasHover = candidate as any;
    }

    state.hoverHighlightIndex = stableCandidate.index;
    if (canvas) canvas.style.cursor = 'pointer';
    state.lastCanvasNodeHover = stableCandidate as any;
}
