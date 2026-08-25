/**
 * @lib/engine/mycelium-worker-client.ts — main-thread bridge to the mycelium
 * build worker (INP campaign 2026-08-25).
 *
 * Moves the ~751ms tessellation loop off the post-tap interaction window:
 * the worker runs the identical pushBezierLinePair math and returns
 * TRANSFERRED Float32Array buffers; the main thread only does the GPU upload
 * (createLineSegments — must stay main-side).
 *
 * SINGLETON + PREWARM (2026-08-25 interleaved A/B, tmp/inp-campaign.md):
 * under CPU saturation the per-build worker spawn + three module eval landed
 * on the critical path and erased the win (worker 873-1217ms vs sync
 * 570-1098ms). A persistent singleton amortizes spawn/eval to once, and
 * prewarmMyceliumWorker() (called from the CTA-visible poll in main.ts, same
 * hook as preloadJourneyWebgl) pays that cost BEFORE the tap.
 *
 * Fallback: any worker failure resolves null and callers use the existing
 * synchronous path (pushBezierLinePair on main) — the build never blocks on
 * worker availability. A crashed singleton resets so the next build retries.
 *
 * URL boundary follows the data-worker-url.ts pattern (?worker&url is
 * Vite-specific and must be imported at the site Vite processes).
 */
let workerUrl: string | null = null

async function resolveWorkerUrl(): Promise<string> {
    if (workerUrl) return workerUrl
    try {
        const mod = await import('@lib/workers/mycelium-build-worker-url')
        const resolved = (mod as { default?: string }).default
        if (resolved) workerUrl = resolved
    } catch {
        workerUrl = './assets/mycelium-build-worker.js'
    }
    return workerUrl as string
}

export interface MyceliumWorkerBuffers {
    layerBounds: {
        core: LayerBounds
        wispy: LayerBounds
        bridge: LayerBounds
    }
    core: Float32Array
    wispy: Float32Array
    bridge: Float32Array
    coreColors: Float32Array
    wispyColors: Float32Array
    bridgeColors: Float32Array
}

export type MyceliumBuildPayload = import('@lib/workers/mycelium-build-worker').MyceliumBuildPayload
type LayerBounds = import('@lib/workers/mycelium-build-worker').LayerBounds
export type PointsBuildPayload = import('@lib/workers/mycelium-build-worker').PointsBuildPayload
export type PointsBuildBuffers = import('@lib/workers/mycelium-build-worker').PointsBuildBuffers
export type DiscoverPayload = import('@lib/workers/mycelium-build-worker').DiscoverPayload
export type DiscoveredEdgeSets = import('@lib/workers/mycelium-build-worker').DiscoveredEdgeSets
export type DiscoveredEdgeSetsBuffers = import('@lib/workers/mycelium-build-worker').DiscoveredEdgeSetsBuffers
export type SerializedAdjacency = import('@lib/workers/mycelium-build-worker').SerializedAdjacency
export type DiscoverCsrPayload = Omit<DiscoverPayload, 'neighborMap'> & SerializedAdjacency

type PendingResolve = (buffers: MyceliumWorkerBuffers | null) => void

let singletonWorker: Worker | null = null
let nextRequestId = 1
const pending = new Map<number, PendingResolve>()

function resetSingleton(): void {
    if (singletonWorker) {
        const w = singletonWorker
        singletonWorker = null
        w.terminate()
    }
    for (const resolve of pending.values()) resolve(null)
    pending.clear()
}

async function getSingletonWorker(): Promise<Worker | null> {
    if (singletonWorker) return singletonWorker
    const url = await resolveWorkerUrl()
    const worker = new Worker(url, { type: 'module' })
    worker.onmessage = (e: MessageEvent) => {
        const data = e.data as
            | ((MyceliumWorkerBuffers | PointsBuildBuffers | { edgeSets: DiscoveredEdgeSetsBuffers | null }) & {
                  type?: string
                  requestId?: number
              })
            | null
        if (data?.type !== 'BUILT' && data?.type !== 'POINTS_BUILT' && data?.type !== 'DISCOVER_BUILT') return
        const requestId = typeof data.requestId === 'number' ? data.requestId : -1
        const resolve = pending.get(requestId)
        if (resolve) {
            pending.delete(requestId)
            resolve(data as unknown as MyceliumWorkerBuffers)
        }
    }
    worker.onerror = () => {
        // Crashed singleton: fail all in-flight builds to the sync path and
        // reset so the NEXT build spawns a fresh worker (transient faults
        // don't permanently disable the worker path).
        resetSingleton()
    }
    singletonWorker = worker
    return worker
}

/** Build the tessellated buffers off-thread. Resolves null on ANY failure —
 * callers must fall back to the synchronous path. */
export async function buildMyceliumBuffersInWorker(
    payload: MyceliumBuildPayload
): Promise<MyceliumWorkerBuffers | null> {
    if (typeof Worker === 'undefined') return null
    try {
        const worker = await getSingletonWorker()
        if (!worker) return null
        const requestId = nextRequestId++
        return await new Promise<MyceliumWorkerBuffers | null>((res) => {
            const timeout = setTimeout(() => {
                pending.delete(requestId)
                res(null)
            }, 15000)
            pending.set(requestId, (buffers) => {
                clearTimeout(timeout)
                res(buffers)
            })
            worker.postMessage({ type: 'BUILD', requestId, ...payload })
        })
    } catch {
        return null
    }
}

/** Build the point-cloud buffers off-thread. Resolves null on ANY failure —
 * callers must fall back to the synchronous path. rawPositions/rawClusters
 * are CLONED by postMessage (never transferred — the main-side stores keep
 * their references). */
export async function buildPointsBuffersInWorker(payload: PointsBuildPayload): Promise<PointsBuildBuffers | null> {
    if (typeof Worker === 'undefined') return null
    try {
        const worker = await getSingletonWorker()
        if (!worker) return null
        const requestId = nextRequestId++
        return await new Promise<PointsBuildBuffers | null>((res) => {
            const timeout = setTimeout(() => {
                pending.delete(requestId)
                res(null)
            }, 15000)
            pending.set(requestId, (buffers) => {
                clearTimeout(timeout)
                res(buffers as PointsBuildBuffers | null)
            })
            worker.postMessage({ type: 'POINTS_BUILD', requestId, ...payload })
        })
    } catch {
        return null
    }
}

/** Run semantic edge DISCOVERY off-thread (the ~900ms main-thread task —
 * longtask attribution 2026-08-25). CSR arrays are TRANSFERRED (zero-copy —
 * the structured clone of the object graph measured ~650ms on main).
 * Resolves undefined on ANY failure (caller falls back to the main-thread
 * pure function), null when discovery legitimately found no edges. */
export async function discoverMyceliumEdgesInWorker(
    payload: DiscoverCsrPayload
): Promise<DiscoveredEdgeSetsBuffers | null | undefined> {
    if (typeof Worker === 'undefined') return undefined
    try {
        const worker = await getSingletonWorker()
        if (!worker) return undefined
        const requestId = nextRequestId++
        return await new Promise<DiscoveredEdgeSetsBuffers | null | undefined>((res) => {
            const timeout = setTimeout(() => {
                pending.delete(requestId)
                res(undefined)
            }, 15000)
            pending.set(requestId, (buffers) => {
                clearTimeout(timeout)
                res((buffers as { edgeSets?: DiscoveredEdgeSetsBuffers | null } | null)?.edgeSets ?? null)
            })
            const transfer = [payload.recordOffsets.buffer, payload.neighborLeadIdx.buffer, payload.neighborScores.buffer, payload.neighborBridgeScores.buffer, payload.neighborFlags.buffer]
            worker.postMessage({ type: 'DISCOVER_BUILD', requestId, ...payload }, transfer)
        })
    } catch {
        return undefined
    }
}

let prewarmStarted = false

/** Spawn + module-eval the worker BEFORE the tap (CTA-visible hook). Trivial
 * BUILD + POINTS_BUILD messages force the worker chunk fetch, three import
 * evaluation, and JIT warm without touching real data. Safe to call repeatedly. */
export function prewarmMyceliumWorker(): void {
    if (prewarmStarted || typeof Worker === 'undefined') return
    prewarmStarted = true
    void (async () => {
        try {
            const worker = await getSingletonWorker()
            if (!worker) return
            worker.postMessage({
                type: 'BUILD',
                requestId: 0,
                corePairs: [],
                wispyPairs: [],
                bridgePairs: [],
                nodePositions: [],
                pointClusters: [],
                colors: ['#888888'],
                intensities: { core: 1, wispy: 1, bridge: 1 },
                viewVector: { x: 0, y: 0, z: 1 },
                segmentsPerPair: 1
            })
            worker.postMessage({
                type: 'POINTS_BUILD',
                requestId: 0,
                clusters: [],
                rawPositions: new Float32Array(0),
                colors: ['#888888'],
                threadTint: { r: 0.5, g: 0.5, b: 0.5 },
                fieldScale: { x: 1, y: 1, z: 1 }
            })
            worker.postMessage({
                type: 'DISCOVER_BUILD',
                requestId: 0,
                leadIds: [],
                pointClusters: [],
                neighborMap: {}
            })
        } catch {
            prewarmStarted = false
        }
    })()
}
