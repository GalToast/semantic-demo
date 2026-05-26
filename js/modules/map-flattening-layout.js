import { state } from '../state.js';

export function applyMapFlatteningLayout(enabled) {
    if (!state.points || !state.originalPositions) return;

    if (enabled) {
        const bounds = state.overviewBounds;
        const centerX = bounds.sourceCenter.x;
        const centerY = bounds.sourceCenter.y;

        state.points.forEach((point, i) => {
            const rawX = Number.isFinite(point.x) ? point.x : 0;
            const rawY = Number.isFinite(point.y) ? point.y : 0;

            state.targetPositions[i] = {
                x: rawX - centerX,
                y: rawY - centerY,
                z: -0.15
            };
        });
    } else {
        state.points.forEach((point, i) => {
            const orig = state.originalPositions[i];
            if (orig) {
                state.targetPositions[i] = { x: orig.x, y: orig.y, z: orig.z };
            }
        });
    }
    state.nodesAreSettling = true;
}
