/**
 * map-flattening-layout.ts — Canonical port of map-flattening-layout.ts
 * Pure state mutation for flattening map layout.
 */
import { appState } from '@lib/state/app.svelte'
import { positionBuffer } from '@lib/data-store'

export function applyMapFlatteningLayout(enabled: boolean): void {
    if (!appState.points || !appState.originalPositions) return

    const hasRawBuffer = positionBuffer.getSnapshot() && positionBuffer.getSnapshot().length >= appState.points.length * 3

    if (enabled) {
        const bounds = appState.overviewBounds as { sourceCenter: { x: number; y: number } } | undefined
        const centerX = bounds?.sourceCenter?.x ?? 0
        const centerY = bounds?.sourceCenter?.y ?? 0

        appState.points.forEach((_point, i: number) => {
            let rawX: number, rawY: number
            if (hasRawBuffer && positionBuffer.getSnapshot()) {
                rawX = positionBuffer.getSnapshot()[i * 3]!
                rawY = positionBuffer.getSnapshot()[i * 3 + 1]!
            } else {
                const orig = appState.originalPositions[i]
                rawX = Number.isFinite(orig?.x) ? orig!.x : 0
                rawY = Number.isFinite(orig?.y) ? orig!.y : 0
            }

            appState.targetPositions[i] = {
                x: rawX - centerX,
                y: rawY - centerY,
                z: -0.15
            }
        })
    } else {
        appState.points.forEach((_point, i: number) => {
            const orig = appState.originalPositions[i]
            if (orig) {
                appState.targetPositions[i] = { x: orig.x, y: orig.y, z: orig.z }
            }
        })
    }
    appState.focusState.nodesAreSettling = true
}
