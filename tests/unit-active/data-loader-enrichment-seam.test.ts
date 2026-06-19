import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadBusinessData, loadLeadEnrichmentData } from '@lib/data-loader'

const originalGlobalWorker = globalThis.Worker
const originalWindowWorker = (window as Window & { Worker?: unknown }).Worker

const workerHarness = vi.hoisted(() => {
    const instances: Array<{
        listeners: Record<string, Array<(event: MessageEvent) => void>>
        terminated: boolean
    }> = []

    return {
        instances,
        nextResponseType: 'success' as 'success' | 'error'
    }
})

function restoreGlobalProperty(target: Record<string, unknown>, key: string, value: unknown): void {
    if (value === undefined) {
        delete target[key]
        return
    }
    Object.defineProperty(target, key, {
        configurable: true,
        writable: true,
        value
    })
}

function installTestWorker(): void {
    restoreGlobalProperty(globalThis, 'Worker', TestWorker)
    restoreGlobalProperty(window, 'Worker', TestWorker)
}

function restoreWorker(): void {
    restoreGlobalProperty(globalThis, 'Worker', originalGlobalWorker)
    restoreGlobalProperty(window, 'Worker', originalWindowWorker)
}

class TestWorker {
    listeners: Record<string, Array<(event: MessageEvent) => void>> = {}
    terminated = false

    constructor(
        public readonly url: unknown,
        public readonly options?: unknown
    ) {
        workerHarness.instances.push(this)
    }

    addEventListener(type: string, listener: (event: MessageEvent) => void): void {
        this.listeners[type] ??= []
        this.listeners[type]?.push(listener)
    }

    removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
        const listeners = this.listeners[type]
        if (!listeners) return
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
    }

    postMessage(message: unknown): void {
        setTimeout(() => {
            if (this.terminated) return
            const msg = (message as { type?: string } | undefined)
            let response: unknown
            if (msg?.type === 'LOAD_LEAD_ENRICHMENT') {
                // Enrichment load always errors in tests — the fallback to fetch
                // is what the enrichment-seam tests verify.
                response = {
                    type: 'ERROR',
                    payload: { message: 'worker enrichment not available in test' }
                }
            } else if (workerHarness.nextResponseType === 'error') {
                response = {
                    type: 'ERROR',
                    payload: { message: 'worker failed in test' }
                }
            } else {
                response = makeWorkerSuccessMessage()
            }
            for (const listener of this.listeners.message ?? []) {
                listener({ data: response } as MessageEvent)
            }
        }, 0)
    }

    terminate(): void {
        this.terminated = true
    }
}

function makeWorkerSuccessMessage() {
    return {
        type: 'LOAD_RECORDS_SUCCESS',
        payload: {
            points: [
                {
                    cluster: 2,
                    name: 'coffee-shop',
                    what: 'Coffee',
                    city: 'Rockville',
                    lead_id: 'lead-1',
                    lat: 39.08,
                    lng: -77.15,
                    website: 'https://example.test',
                    email: 'hello@example.test',
                    phone: '555-0100',
                    trivia: 'seed lead',
                    status: 'active',
                    naics: '722515'
                }
            ],
            pointIndexByLeadId: { 'lead-1': 0 },
            positionsBuffer: new Float32Array([0.1, 0.2, 0.3]),
            clustersBuffer: new Uint16Array([2]),
            invalidPositionIndices: []
        }
    }
}

function makeRawBusinessRows(): unknown[] {
    return [
        [0.25, 0.5, 0.75, 3, 'lead-slug', 'Lead service', 'Gaithersburg', 'lead-1', null, null, null, null, null, 'fallback lead', 'active', '541611']
    ]
}

describe('lead enrichment startup seam in data-loader', () => {
    beforeEach(() => {
        workerHarness.instances.length = 0
        workerHarness.nextResponseType = 'success'
        installTestWorker()
        vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
        restoreWorker()
        vi.unstubAllGlobals()
        vi.clearAllMocks()
    })

    it('loads required business data from the worker without fetching the optional enrichment artifact', async () => {
        const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(async (url) => {
            const requested = String(url)
            if (requested.includes('leadEnrichment.public.json')) {
                throw new Error('startup business load must not fetch optional enrichment')
            }
            return new Response('unexpected fetch', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const result = await loadBusinessData()

        expect(result.records).toHaveLength(1)
        expect(result.records[0]).toMatchObject({
            id: 'point-0',
            lead_id: 'lead-1',
            name: 'Coffee Shop',
            city: 'Rockville',
            cluster: 2
        })
        expect(result.enrichment).toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('falls back to data.dat without fetching optional enrichment when the worker fails', async () => {
        workerHarness.nextResponseType = 'error'
        const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(async (url) => {
            const requested = String(url)
            if (requested.includes('leadEnrichment.public.json')) {
                throw new Error('startup business fallback must not fetch optional enrichment')
            }
            if (requested.includes('data.dat')) {
                return new Response(JSON.stringify(makeRawBusinessRows()), { status: 200 })
            }
            return new Response('unexpected fetch', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        const result = await loadBusinessData()

        expect(result.records).toHaveLength(1)
        expect(result.records[0]).toMatchObject({
            id: 'point-0',
            lead_id: 'lead-1',
            name: 'Lead Slug',
            city: 'Gaithersburg',
            cluster: 3
        })
        expect(result.enrichment).toBeNull()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('data.dat'))
        expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('leadEnrichment.public.json'))
    })

    it('treats a missing late enrichment artifact as null instead of throwing', async () => {
        const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>(
            async () => new Response('missing', { status: 404 })
        )
        vi.stubGlobal('fetch', fetchMock)

        await expect(loadLeadEnrichmentData()).resolves.toBeNull()

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('leadEnrichment.public.json'))
    })
})
