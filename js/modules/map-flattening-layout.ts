/**
 * map-flattening-layout.ts — TypeScript shadow of map-flattening-layout.js
 */
import { state as _state } from '@lib/engine/state-bridge';

const state = _state as any;

export function applyMapFlatteningLayout(enabled: boolean): void {
    if (!state.points || !state.originalPositions) return;

    const hasRawBuffer = state.rawPositionsBuffer
        && state.rawPositionsBuffer.length >= state.points.length * 3;

    if (enabled) {
        const bounds = state.overviewBounds as { sourceCenter: { x: number; y: number } } | undefined;
        const centerX = bounds?.sourceCenter?.x ?? 0;
        const centerY = bounds?.sourceCenter?.y ?? 0;

        state.points.forEach((_point: any, i: number) => {
            let rawX: number, rawY: number;
            if (hasRawBuffer && state.rawPositionsBuffer) {
                rawX = state.rawPositionsBuffer[i * 3]!;
                rawY = state.rawPositionsBuffer[i * 3 + 1]!;
            } else {
                const orig = (state.originalPositions as any[])[i];
                rawX = Number.isFinite(orig?.x) ? orig.x : 0;
                rawY = Number.isFinite(orig?.y) ? orig.y : 0;
            }

            (state.targetPositions as any[])[i] = {
                x: rawX - centerX,
                y: rawY - centerY,
                z: -0.15
            };
        });
    } else {
        state.points.forEach((_point: any, i: number) => {
            const orig = (state.originalPositions as any[])[i];
            if (orig) {
                (state.targetPositions as any[])[i] = { x: orig.x, y: orig.y, z: orig.z };
            }
        });
    }
    state.nodesAreSettling = true;
}
