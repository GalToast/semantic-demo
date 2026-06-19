import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadLeadEnrichmentData } from '../../src/lib/data-loader'

// ── Mock Worker infrastructure (matches semantic-threads-worker-lifecycle pattern) ──

const originalGlobalWorker = globalThis.Worker

class MockWorker extends EventTarget {
    static instances: MockWorker[] = []

    terminated = false
    lastMessage: unknown = null

    constructor() {
        super()
        MockWorker.instances.push(this)
    }

    postMessage(message: unknown): void {
        this.lastMessage = message
    }

    terminate(): void {
        this.terminated = true
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('lead enrichment worker lifecycle', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        MockWorker.instances = []
        vi.stubGlobal('Worker', MockWorker)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('request ids are monotonic across multiple calls', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('{}', { status: 200 }))
        )

        const promise1 = loadLeadEnrichmentData()
        const w1 = MockWorker.instances[0]!
        expect(w1).toBeDefined()
        expect(w1.lastMessage).toMatchObject({ type: 'LOAD_LEAD_ENRICHMENT' })

        const promise2 = loadLeadEnrichmentData()
        const w2 = MockWorker.instances[1]!
        expect(w2).toBeDefined()

        // Respond to first worker
        w1.dispatchEvent(
            new MessageEvent('message', {
                data: {
                    type: 'LOAD_LEAD_ENRICHMENT_SUCCESS',
                    payload: { enrichment: { 'lead-100': { lead_id: 'lead-100' } } }
                }
            })
        )

        // Respond to second worker
        w2.dispatchEvent(
            new MessageEvent('message', {
                data: {
                    type: 'LOAD_LEAD_ENRICHMENT_SUCCESS',
                    payload: { enrichment: { 'lead-200': { lead_id: 'lead-200' } } }
                }
            })
        )

        const result1 = await promise1
        const result2 = await promise2

        expect(result1).toEqual({ 'lead-100': { lead_id: 'lead-100' } })
        expect(result2).toEqual({ 'lead-200': { lead_id: 'lead-200' } })
        expect(w1.terminated).toBe(true)
        expect(w2.terminated).toBe(true)
    })

    it('worker error rejects and falls back to fetch', async () => {
        const fetchMock = vi.fn(async () => {
            return new Response(JSON.stringify({ 'lead-err': { lead_id: 'lead-err' } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        })
        vi.stubGlobal('fetch', fetchMock)

        const promise = loadLeadEnrichmentData()
        const w = MockWorker.instances[0]!
        expect(w).toBeDefined()

        // Worker reports an error
        w.dispatchEvent(
            new MessageEvent('message', {
                data: {
                    type: 'ERROR',
                    payload: { message: 'worker parse blew up' }
                }
            })
        )

        const result = await promise

        // Should fall back to fetch enrichment
        expect(result).toEqual({ 'lead-err': { lead_id: 'lead-err' } })
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('leadEnrichment.public.json'))
        expect(w.terminated).toBe(true)
    })

    it('timeout rejects and falls back to fetch', async () => {
        const fetchMock = vi.fn(async () => {
            return new Response(JSON.stringify({ 'lead-to': { lead_id: 'lead-to' } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        })
        vi.stubGlobal('fetch', fetchMock)

        const promise = loadLeadEnrichmentData()
        const w = MockWorker.instances[0]!
        expect(w).toBeDefined()

        // Worker never responds — advance past the 30s worker timeout
        await vi.advanceTimersByTimeAsync(30_001)

        const result = await promise

        // Should have fallen back to fetch
        expect(result).toEqual({ 'lead-to': { lead_id: 'lead-to' } })
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('leadEnrichment.public.json'))
        expect(w.terminated).toBe(true)
    })

    it('success stores the enrichment result and terminates the worker', async () => {
        const fetchMock = vi.fn(async () => {
            throw new Error('should not be called when worker succeeds')
        })
        vi.stubGlobal('fetch', fetchMock)

        const enrichmentData = {
            'lead-1': { lead_id: 'lead-1', synergy_score: 0.9 },
            'lead-2': { lead_id: 'lead-2', email_verified: true }
        }

        const promise = loadLeadEnrichmentData()
        const w = MockWorker.instances[0]!
        expect(w).toBeDefined()

        w.dispatchEvent(
            new MessageEvent('message', {
                data: {
                    type: 'LOAD_LEAD_ENRICHMENT_SUCCESS',
                    payload: { enrichment: enrichmentData }
                }
            })
        )

        const result = await promise

        expect(result).toEqual(enrichmentData)
        expect(w.terminated).toBe(true)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('cacheBust version param is included in the worker payload URL', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('{}', { status: 200 }))
        )

        const promise = loadLeadEnrichmentData()
        const w = MockWorker.instances[0]!
        expect(w).toBeDefined()

        w.dispatchEvent(
            new MessageEvent('message', {
                data: {
                    type: 'LOAD_LEAD_ENRICHMENT_SUCCESS',
                    payload: { enrichment: null }
                }
            })
        )

        await promise

        // The worker receives the URL as a payload, not as constructor arg.
        // Verify the URL passed in the postMessage includes cacheBust param.
        const sentPayload = w.lastMessage as { type: string; payload: { url: string } }
        expect(sentPayload.type).toBe('LOAD_LEAD_ENRICHMENT')
        expect(sentPayload.payload.url).toMatch(/leadEnrichment\.public\.json\?v=\d+/)
    })

    it('returns null when worker returns null enrichment', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('not found', { status: 404 }))
        )

        const promise = loadLeadEnrichmentData()
        const w = MockWorker.instances[0]!
        expect(w).toBeDefined()

        w.dispatchEvent(
            new MessageEvent('message', {
                data: {
                    type: 'LOAD_LEAD_ENRICHMENT_SUCCESS',
                    payload: { enrichment: null }
                }
            })
        )

        const result = await promise

        // Worker returned null enrichment — that's a valid result
        expect(result).toBeNull()
        expect(w.terminated).toBe(true)
    })
})
