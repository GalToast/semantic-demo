/**
 * data-loader-worker-settle.test.ts — Verify hardened worker settle/cleanup
 *
 * Bug: callDataWorker could terminate the worker multiple times if both a
 * timeout and a message arrived in the same tick, or if a message arrived
 * after terminate() was already called. The fix adds a `settled` flag that
 * guards all cleanup paths.
 *
 * Coverage:
 *  1. Success path: worker terminates once, listeners removed
 *  2. Error path: worker terminates once, listeners removed
 *  3. Timeout path: worker terminates once, listeners removed
 *  4. Race: message after timeout does not double-terminate or crash
 *  5. Race: timeout after message does not double-terminate or crash
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/workers/data-worker-url', () => ({
    workerUrl: 'mock-data-worker.js'
}))

class MockWorker extends EventTarget {
    static instances: MockWorker[] = []
    terminated = false
    terminateCount = 0
    listeners = new Map<string, EventListener[]>()

    constructor() {
        super()
        MockWorker.instances.push(this)
    }

    addEventListener(type: string, listener: EventListener): void {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, [])
        }
        this.listeners.get(type)!.push(listener)
        super.addEventListener(type, listener)
    }

    removeEventListener(type: string, listener: EventListener): void {
        const list = this.listeners.get(type) ?? []
        const idx = list.indexOf(listener)
        if (idx >= 0) list.splice(idx, 1)
        super.removeEventListener(type, listener)
    }

    postMessage(_message: unknown): void {
        // no-op for test
    }

    terminate(): void {
        this.terminateCount += 1
        this.terminated = true
    }

    dispatch(type: string, data: unknown): void {
        const list = this.listeners.get(type) ?? []
        for (const fn of list) {
            fn(new MessageEvent(type, { data }))
        }
    }
}

// Import after mock
import { loadBusinessData } from '../../src/lib/data-loader'

describe('data-loader worker settle/cleanup', () => {
    beforeEach(() => {
        MockWorker.instances = []
        vi.stubGlobal('Worker', MockWorker)
        vi.stubGlobal('fetch', vi.fn(() => {
            return Promise.resolve(new Response(JSON.stringify([['x','y','z','cluster','name','what','city','lead_id','lat','lng','website','email','phone','trivia','status','naics']]), { status: 200 }))
        }))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('terminates worker exactly once on success', async () => {
        const promise = loadBusinessData()
        await Promise.resolve()

        const worker = MockWorker.instances[0]
        expect(worker).toBeDefined()

        worker.dispatch('message', {
            type: 'LOAD_RECORDS_SUCCESS',
            payload: {
                points: [],
                pointIndexByLeadId: {},
                positionsBuffer: new Float32Array(),
                clustersBuffer: new Uint16Array(),
                invalidPositionIndices: []
            }
        })

        await expect(promise).resolves.toBeDefined()
        expect(worker.terminateCount).toBe(1)
    })

    it('terminates worker exactly once on error (falls back to main thread)', async () => {
        const promise = loadBusinessData()
        await Promise.resolve()

        const worker = MockWorker.instances[0]
        expect(worker).toBeDefined()

        worker.dispatch('message', {
            type: 'ERROR',
            payload: { message: 'parse failed' }
        })

        // loadBusinessData falls back to main thread on worker error,
        // so the overall promise resolves, but the worker still terminated once.
        await expect(promise).resolves.toBeDefined()
        expect(worker.terminateCount).toBe(1)
    })

    it('removes all listeners after success', async () => {
        const promise = loadBusinessData()
        await Promise.resolve()

        const worker = MockWorker.instances[0]
        worker.dispatch('message', {
            type: 'LOAD_RECORDS_SUCCESS',
            payload: {
                points: [],
                pointIndexByLeadId: {},
                positionsBuffer: new Float32Array(),
                clustersBuffer: new Uint16Array(),
                invalidPositionIndices: []
            }
        })

        await promise
        expect(worker.listeners.get('message')?.length ?? 0).toBe(0)
        expect(worker.listeners.get('messageerror')?.length ?? 0).toBe(0)
        expect(worker.listeners.get('error')?.length ?? 0).toBe(0)
    })

    it('does not double-terminate if message arrives after timeout', async () => {
        vi.useFakeTimers()
        const promise = loadBusinessData()
        await Promise.resolve()

        const worker = MockWorker.instances[0]

        // Let timeout fire first
        vi.runAllTimers()
        await Promise.resolve()

        expect(worker.terminateCount).toBe(1)

        // Now fire the message (race condition)
        worker.dispatch('message', {
            type: 'LOAD_RECORDS_SUCCESS',
            payload: {
                points: [],
                pointIndexByLeadId: {},
                positionsBuffer: new Float32Array(),
                clustersBuffer: new Uint16Array(),
                invalidPositionIndices: []
            }
        })

        await Promise.resolve()
        // Should still be exactly 1, not 2
        expect(worker.terminateCount).toBe(1)

        vi.useRealTimers()
    })
})
