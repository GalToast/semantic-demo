/**
 * tests/data-loader-abort.spec.js
 *
 * Verifies that callDataWorker properly terminates the underlying Worker
 * when the supplied AbortSignal is aborted mid-flight.
 */

import { test, expect } from '@playwright/test'
import { callDataWorker } from '@lib/data-loader'

test('callDataWorker terminates worker when signal aborts', async () => {
    // Backup and mock the global Worker used by callDataWorker in this Node test process.
    const originalWorker = globalThis.Worker
    let workerTerminated = false
    class SpyWorker {
        constructor(url, opts) {
            this.url = url
            this.opts = opts
        }
        addEventListener() {
            /* no-op */
        }
        removeEventListener() {
            /* no-op */
        }
        postMessage() {
            /* no response → simulates in-flight operation */
        }
        terminate() {
            workerTerminated = true
        }
    }
    globalThis.Worker = SpyWorker
    try {
        const controller = new AbortController()
        // Start a load records call with an abort signal.
        const promise = callDataWorker('LOAD_RECORDS', { url: '/data.dat' }, { signal: controller.signal })
        // Give it a moment to spin up the worker and register listeners.
        await new Promise((res) => setTimeout(res, 10))
        // Abort the signal.
        controller.abort()
        // The promise should reject with an AbortError.
        await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
        // And the spy worker's terminate should have been called.
        expect(workerTerminated).toBe(true)
    } finally {
        // Restore the original Worker global.
        globalThis.Worker = originalWorker
    }
})
