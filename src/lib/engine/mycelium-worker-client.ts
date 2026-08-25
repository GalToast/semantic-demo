/**
 * @lib/engine/mycelium-worker-client.ts — main-thread bridge to the mycelium
 * build worker (INP campaign 2026-08-25).
 *
 * Moves the ~751ms tessellation loop off the post-tap interaction window:
 * the worker runs the identical pushBezierLinePair math and returns
 * TRANSFERRED Float32Array buffers; the main thread only does the GPU upload
 * (createLineSegments — must stay main-side).
 *
 * Fallback: any worker failure resolves null and callers use the existing
 * synchronous path (pushBezierLinePair on main) — the build never blocks on
 * worker availability.
 *
 * URL boundary follows the data-worker-url.ts pattern (?worker&url is
 * Vite-specific and must be imported at the site Vite processes).
 */
let workerUrl: string | null = null

async function resolveWorkerUrl(): Promise<string> {
    if (workerUrl) return workerUrl
    try {
        const mod = await import('./mycelium-build-worker-url?worker&url')
        workerUrl = (mod as { default: string }).default
    } catch {
        workerUrl = './assets/mycelium-build-worker.js'
    }
    return workerUrl
}

export interface MyceliumWorkerBuffers {
    core: Float32Array
    wispy: Float32Array
    bridge: Float32Array
    coreColors: Float32Array
    wispyColors: Float32Array
    bridgeColors: Float32Array
}

export type MyceliumBuildPayload = import('@lib/workers/mycelium-build-worker').MyceliumBuildPayload

/** Build the tessellated buffers off-thread. Resolves null on ANY failure —
 * callers must fall back to the synchronous path. */
export async function buildMyceliumBuffersInWorker(
    payload: MyceliumBuildPayload
): Promise<MyceliumWorkerBuffers | null> {
    if (typeof Worker === 'undefined') return null
    try {
        const url = await resolveWorkerUrl()
        const worker = new Worker(url, { type: 'module' })
        return await new Promise<MyceliumWorkerBuffers | null>((res) => {
            const timeout = setTimeout(() => {
                worker.terminate()
                res(null)
            }, 15000)
            worker.onmessage = (e: MessageEvent) => {
                if (e.data?.type !== 'BUILT') return
                clearTimeout(timeout)
                worker.terminate()
                res(e.data as MyceliumWorkerBuffers)
            }
            worker.onerror = () => {
                clearTimeout(timeout)
                worker.terminate()
                res(null)
            }
            worker.postMessage({ type: 'BUILD', ...payload })
        })
    } catch {
        return null
    }
}
