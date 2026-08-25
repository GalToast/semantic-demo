/**
 * @lib/workers/mycelium-build-worker.ts — off-main-thread mycelium tessellation.
 *
 * INP campaign (2026-08-25): createMycelium's tessellation loop measured
 * +751ms inside the post-tap interaction window (tmp/inp-campaign.md). This
 * worker runs the EXACT same pushBezierLinePair math off-thread and returns
 * transferable Float32Array buffers — the main thread only does the GPU
 * upload (which must stay main-side).
 *
 * Parity: uses the same pure pushBezierLinePair from @lib/engine/mycelium-bezier
 * (DI-injected, no store/webgl reads in the tessellation path). The view-vector
 * cache is seeded from the main thread via seedBezierViewVector so control
 * points match camera-refreshed builds.
 *
 * Protocol:
 *   in:  { type: 'BUILD', ...MyceliumBuildPayload }
 *   out: { type: 'BUILT', core: Float32Array, wispy: Float32Array,
 *          bridge: Float32Array, coreColors: Float32Array,
 *          wispyColors: Float32Array, bridgeColors: Float32Array,
 *          pairCount: number }  (buffers transferred, not cloned)
 */
import { pushBezierLinePair, seedBezierViewVector } from '@lib/engine/mycelium-bezier'
import { Color } from 'three'

type EdgePair = { a: number; b: number }

export interface MyceliumBuildPayload {
    corePairs: EdgePair[]
    wispyPairs: EdgePair[]
    bridgePairs: EdgePair[]
    nodePositions: Array<{ x?: number; y?: number; z?: number }>
    points: Array<{ cluster?: number | null }>
    /** Category color strings (CONFIG.COLORS) — Color parses them worker-side. */
    colors: string[]
    intensities: { core: number; wispy: number; bridge: number }
    /** Main-thread view vector (refreshCachedBezierViewVector result). */
    viewVector: { x: number; y: number; z: number }
    segmentsPerPair: number
}

/** Pure build function — exported for unit-test parity checks (no worker spawn). */
export function buildMyceliumBuffers(payload: MyceliumBuildPayload): {
    core: Float32Array
    wispy: Float32Array
    bridge: Float32Array
    coreColors: Float32Array
    wispyColors: Float32Array
    bridgeColors: Float32Array
} {
    seedBezierViewVector(payload.viewVector)
    const colorFn = (cluster: number | null | undefined): { r: number; g: number; b: number } => {
        const c = new Color(
            payload.colors[
                (cluster === null || cluster === undefined || !Number.isFinite(cluster) ? 0 : cluster) %
                    payload.colors.length
            ]
        )
        return { r: c.r, g: c.g, b: c.b }
    }

    const core: number[] = []
    const coreColors: number[] = []
    const wispy: number[] = []
    const wispyColors: number[] = []
    const bridge: number[] = []
    const bridgeColors: number[] = []

    for (const pair of payload.corePairs) {
        pushBezierLinePair(
            core,
            coreColors,
            pair,
            payload.nodePositions,
            payload.points,
            colorFn,
            payload.intensities.core,
            payload.segmentsPerPair
        )
    }
    for (const pair of payload.wispyPairs) {
        pushBezierLinePair(
            wispy,
            wispyColors,
            pair,
            payload.nodePositions,
            payload.points,
            colorFn,
            payload.intensities.wispy,
            payload.segmentsPerPair
        )
    }
    for (const pair of payload.bridgePairs) {
        pushBezierLinePair(
            bridge,
            bridgeColors,
            pair,
            payload.nodePositions,
            payload.points,
            colorFn,
            payload.intensities.bridge,
            payload.segmentsPerPair
        )
    }

    return {
        core: new Float32Array(core),
        wispy: new Float32Array(wispy),
        bridge: new Float32Array(bridge),
        coreColors: new Float32Array(coreColors),
        wispyColors: new Float32Array(wispyColors),
        bridgeColors: new Float32Array(bridgeColors)
    }
}

interface WorkerAPI {
    postMessage(message: MyceliumBuildPayload & { type: 'BUILD' }): void
    onmessage: ((e: MessageEvent) => void) | null
    addEventListener(type: 'message', cb: (e: MessageEvent) => void): void
}

const ctx = self as unknown as WorkerAPI

ctx.onmessage = (e: MessageEvent<MyceliumBuildPayload & { type: 'BUILD'; requestId?: number }>): void => {
    const result = buildMyceliumBuffers(e.data)
    const transfer = [
        result.core.buffer,
        result.wispy.buffer,
        result.bridge.buffer,
        result.coreColors.buffer,
        result.wispyColors.buffer,
        result.bridgeColors.buffer
    ]
    ;(self as unknown as Worker).postMessage({ type: 'BUILT', requestId: e.data.requestId ?? 0, ...result }, transfer)
}
