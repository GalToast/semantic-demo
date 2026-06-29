import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import type { LeadEnrichment } from '@lib/types/business'
import { appState as legacyState } from '@lib/state/app.svelte'

const originalGlobalWorker = globalThis.Worker
const originalWindowWorker = (window as Window & { Worker?: unknown }).Worker
const originalRequestIdleCallback = (window as Window & { requestIdleCallback?: unknown }).requestIdleCallback

import {
    businessRecords,
    dataLoadState,
    getLeadEnrichment,
    getPointIndexByLeadId,
    initData,
    leadEnrichment,
    loadLeadEnrichment,
    loadingPhaseStore,
    pointIndexByLeadId,
    resetDataStores
} from '@lib/data-store.ts'

const workerHarness = vi.hoisted(() => {
    const instances: Array<{
        listeners: Record<string, Array<(event: MessageEvent) => void>>
        terminated: boolean
    }> = []

    return { instances }
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
    restoreGlobalProperty(window as unknown as Record<string, unknown>, 'Worker', TestWorker)
}

function restoreWorker(): void {
    restoreGlobalProperty(globalThis, 'Worker', originalGlobalWorker)
    restoreGlobalProperty(window as unknown as Record<string, unknown>, 'Worker', originalWindowWorker)
}

function installIdleCallbackNoop(): void {
    restoreGlobalProperty(window as unknown as Record<string, unknown>, 'requestIdleCallback', vi.fn(() => 0))
}

function restoreIdleCallback(): void {
    restoreGlobalProperty(window as unknown as Record<string, unknown>, 'requestIdleCallback', originalRequestIdleCallback)
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
            } else {
                response = {
                    type: 'LOAD_RECORDS_SUCCESS',
                    payload: {
                        points: [
                            {
                                cluster: 0,
                                name: 'coffee-shop',
                                what: 'Coffee',
                                city: 'Rockville',
                                lead_id: 'lead-1',
                                lat: 39.08,
                                lng: -77.15,
                                website: null,
                                email: null,
                                phone: null,
                                trivia: null,
                                status: 'active',
                                naics: null
                            }
                        ],
                        pointIndexByLeadId: { 'lead-1': 0 },
                        positionsBuffer: new Float32Array([0.1, 0.2, 0.3]),
                        clustersBuffer: new Uint16Array([0]),
                        invalidPositionIndices: []
                    }
                }
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

function makeEnrichment(): Record<string, LeadEnrichment> {
    return {
        'lead-1': {
            lead_id: 'lead-1',
            category: 'Coffee',
            website_status: 'reachable',
            email_verified: true,
            synergy_score: 0.88
        }
    }
}

function resetLegacyDataState(): void {
    ;(legacyState as any).points = []
    ;(legacyState as any).rawPositionsBuffer = null
    ;(legacyState as any).rawClustersBuffer = null
    ;(legacyState as any).leadEnrichment = null
    ;(legacyState as any).pointIndexByLeadId = new Map()
}

describe('lead enrichment hydration seam in data-store', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
        workerHarness.instances.length = 0
        installTestWorker()

        fetchMock = vi.fn(async (url: RequestInfo | URL) => {
            const requested = String(url)
            if (requested.includes('leadEnrichment.public.json')) {
                throw new Error('startup business load must not fetch optional enrichment')
            }
            return new Response('unexpected fetch', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchMock)

        installIdleCallbackNoop()
        resetLegacyDataState()
        resetDataStores()
    })

    afterEach(() => {
        restoreIdleCallback()
        restoreWorker()
        vi.unstubAllGlobals()
        vi.clearAllMocks()
    })

    it('reaches launch-ready business state before requesting optional enrichment', async () => {
        await initData()

        expect(get(dataLoadState)).toMatchObject({
            status: 'ready',
            businessLoaded: true,
            threadsLoaded: true,
            error: null
        })
        expect(get(loadingPhaseStore)).toBe('launch')
        expect(get(businessRecords)).toHaveLength(1)
        expect(get(pointIndexByLeadId).get('lead-1')).toBe(0)
        expect(get(leadEnrichment)).toBeNull()
        expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('leadEnrichment.public.json'))
        expect(legacyState.points).toHaveLength(1)
        expect(legacyState.leadEnrichment).toBeNull()
    })

    it('hydrates optional enrichment later without replacing business consumers', async () => {
        await initData()

        const businessRecordsBeforeHydration = get(businessRecords)
        const pointIndexBeforeHydration = get(pointIndexByLeadId)
        const enrichment = makeEnrichment()
        fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
            if (String(url).includes('leadEnrichment.public.json')) {
                return new Response(JSON.stringify(enrichment), { status: 200 })
            }
            return new Response('unexpected fetch', { status: 404 })
        })

        await expect(loadLeadEnrichment()).resolves.toEqual(enrichment)

        expect(getLeadEnrichment()).toEqual(enrichment)
        expect(get(businessRecords)).toBe(businessRecordsBeforeHydration)
        expect(get(pointIndexByLeadId)).toBe(pointIndexBeforeHydration)
        expect(get(dataLoadState)).toMatchObject({
            status: 'ready',
            businessLoaded: true,
            threadsLoaded: true,
            error: null
        })
        expect(legacyState.leadEnrichment).toEqual(enrichment)

        await loadLeadEnrichment()
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('keeps ready business consumers usable when late enrichment is unavailable', async () => {
        await initData()
        fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
            if (String(url).includes('leadEnrichment.public.json')) {
                return new Response('missing', { status: 404 })
            }
            return new Response('unexpected fetch', { status: 404 })
        })

        await expect(loadLeadEnrichment()).resolves.toBeNull()

        expect(getLeadEnrichment()).toBeNull()
        expect(get(businessRecords)).toHaveLength(1)
        expect(getPointIndexByLeadId().get('lead-1')).toBe(0)
        expect(get(dataLoadState)).toMatchObject({
            status: 'ready',
            businessLoaded: true,
            threadsLoaded: true,
            error: null
        })
    })
})
