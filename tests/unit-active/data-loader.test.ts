/**
 * data-loader.test.ts — Direct unit coverage for the data orchestrator.
 *
 * Covers non-fossil exports (loadBusinessData, loadLeadEnrichmentData),
 * the worker cache, and worker teardown.
 *
 * The deprecated fossil exports (loadSemanticThreads, loadLayoutManifest)
 * and their helpers were removed in the F2 cleanup. Equivalent coverage
 * lives in semantic-threads-worker-lifecycle.test.ts and
 * relationship-roles.test.ts.
 *
 * Pattern mirrors the existing seam tests: mock the workerUrl helper, install
 * a fake Worker class on globalThis + window, dispatch synthetic MessageEvent
 * responses, and assert on call counts / args.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mock the worker URL helper so `new Worker(workerUrl, ...)` is in-process ──
vi.mock('@lib/workers/data-worker-url', () => ({
    workerUrl: 'mock-data-worker.js'
}))

// ── Shared fake-worker harness ───────────────────────────────────────────────

interface CapturedWorker {
    url: unknown
    options?: unknown
    listeners: Map<string, EventListener[]>
    terminated: boolean
    terminateCount: number
    lastPostMessage: unknown
}

const harness = vi.hoisted(() => {
    const state = {
        instances: [] as CapturedWorker[],
        /**
         * Queue of responses to dispatch on the next worker. Each entry is a
         * function that receives the worker instance and pushes a response
         * after postMessage is called (mirroring async worker behavior).
         */
        responseQueue: [] as Array<(worker: CapturedWorker) => void>,
        /** Default response if the queue is empty. */
        defaultResponse: null as ((worker: CapturedWorker) => void) | null
    }
    return state
})

class FakeWorker extends EventTarget {
    static instances: CapturedWorker[] = []

    readonly listeners = new Map<string, EventListener[]>()
    terminated = false
    terminateCount = 0
    lastPostMessage: unknown

    constructor(
        public readonly url: unknown,
        public readonly options?: unknown
    ) {
        super()
        const self: CapturedWorker = {
            url,
            options,
            listeners: this.listeners,
            terminated: false,
            terminateCount: 0,
            lastPostMessage: undefined
        }
        // Keep terminated/terminateCount in sync via property overrides below.
        Object.defineProperty(self, 'terminated', {
            get: () => this.terminated,
            set: (v: boolean) => {
                this.terminated = v
            },
            configurable: true
        })
        Object.defineProperty(self, 'terminateCount', {
            get: () => this.terminateCount,
            configurable: true
        })
        Object.defineProperty(self, 'lastPostMessage', {
            get: () => this.lastPostMessage,
            configurable: true
        })
        FakeWorker.instances.push(self)
        harness.instances.push(self)
    }

    addEventListener(type: string, listener: EventListener): void {
        if (!this.listeners.has(type)) this.listeners.set(type, [])
        this.listeners.get(type)!.push(listener)
        super.addEventListener(type, listener)
    }

    removeEventListener(type: string, listener: EventListener): void {
        const list = this.listeners.get(type) ?? []
        const idx = list.indexOf(listener)
        if (idx >= 0) list.splice(idx, 1)
        super.removeEventListener(type, listener)
    }

    postMessage(message: unknown): void {
        this.lastPostMessage = message
        // Schedule response on next microtask to mimic async worker.
        queueMicrotask(() => {
            if (this.terminated) return
            const handler =
                harness.responseQueue.shift() ?? harness.defaultResponse
            if (handler) handler(this as unknown as CapturedWorker)
        })
    }

    terminate(): void {
        this.terminateCount += 1
        this.terminated = true
    }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makePoints(count: number) {
    return Array.from({ length: count }, (_, i) => ({
        cluster: i % 5,
        name: `business-${i}`,
        what: `Service ${i}`,
        city: 'Rockville',
        lead_id: `lead-${i}`,
        lat: 39.0 + i * 0.01,
        lng: -77.0 - i * 0.01,
        website: `https://example-${i}.test`,
        email: `contact-${i}@example.test`,
        phone: `555-010${i}`,
        trivia: `trivia-${i}`,
        status: 'active',
        naics: '722515'
    }))
}

function makeLoadRecordsSuccess(points: ReturnType<typeof makePoints>) {
    const count = points.length
    const positionsBuffer = new Float32Array(count * 3)
    const clustersBuffer = new Uint16Array(count)
    for (let i = 0; i < count; i++) {
        positionsBuffer[i * 3] = 0.1 * i
        positionsBuffer[i * 3 + 1] = 0.2 * i
        positionsBuffer[i * 3 + 2] = 0.3 * i
        clustersBuffer[i] = points[i]!.cluster
    }
    return {
        type: 'LOAD_RECORDS_SUCCESS',
        payload: {
            points,
            pointIndexByLeadId: Object.fromEntries(points.map((p, i) => [p.lead_id, i])),
            positionsBuffer,
            clustersBuffer,
            invalidPositionIndices: []
        }
    }
}

function makeLoadEnrichmentSuccess() {
    return {
        type: 'LOAD_LEAD_ENRICHMENT_SUCCESS',
        payload: {
            enrichment: {
                'lead-1': {
                    lead_id: 'lead-1',
                    category: 'cafe',
                    website_status: 'live',
                    email_verified: true,
                    synergy_score: 0.85,
                    cluster_assignment: 'food_service'
                }
            }
        }
    }
}

// ── Test setup ───────────────────────────────────────────────────────────────

const originalWorker = globalThis.Worker

function installWorker(): void {
    vi.stubGlobal('Worker', FakeWorker)
}

function restoreWorker(): void {
    vi.unstubAllGlobals()
    // Restore original Worker if it existed
    if (originalWorker) {
        globalThis.Worker = originalWorker
    }
}

// Import after mock registration
import {
    loadBusinessData,
    loadLeadEnrichmentData
} from '@lib/data-loader'

describe('data-loader direct coverage', () => {
    beforeEach(() => {
        FakeWorker.instances = []
        harness.instances = []
        harness.responseQueue = []
        harness.defaultResponse = null
        installWorker()
        // Default fetch: 404 everything so fallbacks return null / throw cleanly.
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('not found', { status: 404 }))
        )
    })

    afterEach(() => {
        restoreWorker()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    // ── loadBusinessData ─────────────────────────────────────────────────
    describe('loadBusinessData', () => {
        it('happy path: resolves with parsed result, worker instantiated, postMessage called with init payload', async () => {
            const points = makePoints(3)
            harness.responseQueue.push((w) => {
                w.listeners.get('message')?.forEach((fn) =>
                    fn(new MessageEvent('message', { data: makeLoadRecordsSuccess(points) }))
                )
            })

            const result = await loadBusinessData()

            // Worker was instantiated exactly once
            expect(FakeWorker.instances).toHaveLength(1)
            const worker = FakeWorker.instances[0]!
            expect(worker.url).toBe('mock-data-worker.js')

            // postMessage called with the expected init payload
            expect(worker.lastPostMessage).toMatchObject({
                type: 'LOAD_RECORDS',
                payload: { url: expect.stringContaining('data.dat') }
            })

            // Result shape
            expect(result.records).toHaveLength(3)
            expect(result.records[0]).toMatchObject({
                id: 'point-0',
                lead_id: 'lead-0',
                name: 'business-0',
                cluster: 0
            })
            expect(result.positionsBuffer).toBeInstanceOf(Float32Array)
            expect(result.clustersBuffer).toBeInstanceOf(Uint16Array)
            expect(result.pointIndexByLeadId).toBeInstanceOf(Map)
            expect(result.pointIndexByLeadId.get('lead-0')).toBe(0)
            expect(result.enrichment).toBeNull()
        })

        it('error path: worker ERROR yields enriched error in result object (falls back to main thread)', async () => {
            // Worker returns ERROR → loadBusinessData falls back to main thread.
            harness.responseQueue.push((w) => {
                w.listeners.get('message')?.forEach((fn) =>
                    fn(
                        new MessageEvent('message', {
                            data: { type: 'ERROR', payload: { message: 'network' } }
                        })
                    )
                )
            })
            // Main-thread fallback fetch returns valid data.
            const fetchMock = vi.fn(async (url: string) => {
                if (url.includes('data.dat')) {
                    return new Response(
                        JSON.stringify([
                            [
                                0.1,
                                0.2,
                                0.3,
                                1,
                                'test-business',
                                'Test service',
                                'Rockville',
                                'lead-x',
                                39.0,
                                -77.0,
                                null,
                                null,
                                null,
                                null,
                                'active',
                                '541611'
                            ]
                        ]),
                        { status: 200 }
                    )
                }
                return new Response('not found', { status: 404 })
            })
            vi.stubGlobal('fetch', fetchMock)

            const result = await loadBusinessData()

            // Fallback produced a valid result (not a thrown error)
            expect(result.records).toHaveLength(1)
            expect(result.records[0]!.lead_id).toBe('lead-x')
            expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('data.dat'))
        })

        it('with empty rows: throws the loud zero-records guard error', async () => {
            // 2026-08-21 audit: zero-records used to boot silently empty; the
            // loud guard now rejects so LoadingOverlay surfaces the bad asset.
            harness.responseQueue.push((w) => {
                w.listeners.get('message')?.forEach((fn) =>
                    fn(new MessageEvent('message', { data: makeLoadRecordsSuccess([]) }))
                )
            })

            await expect(loadBusinessData()).rejects.toThrow(/parsed 0 business records/)
        })

        it('normalizes slug-style names (e.g. "coffee-shop" → "Coffee Shop")', async () => {
            const points = [
                {
                    cluster: 0,
                    name: 'coffee-shop',
                    what: 'Coffee',
                    city: 'Rockville',
                    lead_id: 'lead-slug',
                    lat: 39.0,
                    lng: -77.0,
                    website: null,
                    email: null,
                    phone: null,
                    trivia: null,
                    status: 'active',
                    naics: null
                }
            ]
            harness.responseQueue.push((w) => {
                w.listeners.get('message')?.forEach((fn) =>
                    fn(new MessageEvent('message', { data: makeLoadRecordsSuccess(points as unknown as ReturnType<typeof makePoints>) }))
                )
            })

            const result = await loadBusinessData()
            expect(result.records[0]!.name).toBe('Coffee Shop')
        })

        it('treats unknown/none/null optional values as null', async () => {
            const points = [
                {
                    cluster: 0,
                    name: 'test-biz',
                    what: 'N/A',
                    city: 'unknown',
                    lead_id: 'lead-opt',
                    lat: null,
                    lng: null,
                    website: 'none',
                    email: 'NULL',
                    phone: 'not found',
                    trivia: 'none detected',
                    status: 'active',
                    naics: null
                }
            ]
            harness.responseQueue.push((w) => {
                w.listeners.get('message')?.forEach((fn) =>
                    fn(new MessageEvent('message', { data: makeLoadRecordsSuccess(points as unknown as ReturnType<typeof makePoints>) }))
                )
            })

            const result = await loadBusinessData()
            const rec = result.records[0]!
            expect(rec.website).toBeNull()
            expect(rec.email).toBeNull()
            expect(rec.phone).toBeNull()
            expect(rec.what).toBe('Montgomery County business') // fallback
            expect(rec.city).toBe('Montgomery County') // fallback
        })
    })

    // ── loadLeadEnrichmentData ───────────────────────────────────────────
    describe('loadLeadEnrichmentData', () => {
        it('happy path: parses rows into a Record keyed by lead-id', async () => {
            harness.responseQueue.push((w) => {
                w.listeners.get('message')?.forEach((fn) =>
                    fn(new MessageEvent('message', { data: makeLoadEnrichmentSuccess() }))
                )
            })

            const result = await loadLeadEnrichmentData()

            expect(FakeWorker.instances).toHaveLength(1)
            const worker = FakeWorker.instances[0]!
            expect(worker.lastPostMessage).toMatchObject({
                type: 'LOAD_LEAD_ENRICHMENT',
                payload: { url: expect.stringContaining('leadEnrichment.public.json') }
            })

            expect(result).not.toBeNull()
            expect(result!['lead-1']).toMatchObject({
                lead_id: 'lead-1',
                category: 'cafe',
                website_status: 'live',
                email_verified: true
            })
        })

        it('falls back to main thread fetch on worker error', async () => {
            harness.responseQueue.push((w) => {
                w.listeners.get('message')?.forEach((fn) =>
                    fn(
                        new MessageEvent('message', {
                            data: { type: 'ERROR', payload: { message: 'worker failed' } }
                        })
                    )
                )
            })
            const enrichment = {
                'lead-2': {
                    lead_id: 'lead-2',
                    category: 'plumber',
                    website_status: 'dead',
                    email_verified: false
                }
            }
            const fetchMock = vi.fn(async (url: string) => {
                if (url.includes('leadEnrichment.public.json')) {
                    return new Response(JSON.stringify(enrichment), { status: 200 })
                }
                return new Response('not found', { status: 404 })
            })
            vi.stubGlobal('fetch', fetchMock)

            const result = await loadLeadEnrichmentData()
            expect(result).toEqual(enrichment)
            expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('leadEnrichment.public.json'))
        })

        it('returns null when enrichment artifact is missing', async () => {
            harness.responseQueue.push((w) => {
                w.listeners.get('message')?.forEach((fn) =>
                    fn(
                        new MessageEvent('message', {
                            data: { type: 'ERROR', payload: { message: 'worker failed' } }
                        })
                    )
                )
            })
            // fetch returns 404 → fallback returns null
            const result = await loadLeadEnrichmentData()
            expect(result).toBeNull()
        })
    })

    // ── worker cache / teardown ──────────────────────────────────────────
    describe('worker lifecycle', () => {
        it('second call to same loader with same params re-instantiates worker (no shared cache)', async () => {
            // Note: each call to loadBusinessData creates a fresh worker (no internal
            // cache in the current implementation). This test documents that behavior.
            harness.responseQueue.push((w) => {
                w.listeners.get('message')?.forEach((fn) =>
                    fn(new MessageEvent('message', { data: makeLoadRecordsSuccess(makePoints(1)) }))
                )
            })
            harness.responseQueue.push((w) => {
                w.listeners.get('message')?.forEach((fn) =>
                    fn(new MessageEvent('message', { data: makeLoadRecordsSuccess(makePoints(1)) }))
                )
            })

            await loadBusinessData()
            await loadBusinessData()

            // Two separate worker instances were created (one per call).
            expect(FakeWorker.instances).toHaveLength(2)
        })

        it('worker is properly torn down via .terminate() on completion', async () => {
            harness.responseQueue.push((w) => {
                w.listeners.get('message')?.forEach((fn) =>
                    fn(new MessageEvent('message', { data: makeLoadRecordsSuccess(makePoints(1)) }))
                )
            })

            await loadBusinessData()

            const worker = FakeWorker.instances[0]!
            expect(worker.terminateCount).toBe(1)
            expect(worker.terminated).toBe(true)
        })

        it('worker is torn down on error path too', async () => {
            harness.responseQueue.push((w) => {
                w.listeners.get('message')?.forEach((fn) =>
                    fn(
                        new MessageEvent('message', {
                            data: { type: 'ERROR', payload: { message: 'boom' } }
                        })
                    )
                )
            })
            // Provide fallback data so the overall promise resolves
            vi.stubGlobal(
                'fetch',
                vi.fn(async (url: string) => {
                    if (url.includes('data.dat')) {
                        return new Response(
                            JSON.stringify([
                                [
                                    0.1, 0.2, 0.3, 1, 'biz', 'svc', 'City', 'l1', null, null,
                                    null, null, null, null, 'active', '000000'
                                ]
                            ]),
                            { status: 200 }
                        )
                    }
                    return new Response('not found', { status: 404 })
                })
            )

            await loadBusinessData()

            const worker = FakeWorker.instances[0]!
            expect(worker.terminateCount).toBe(1)
            expect(worker.terminated).toBe(true)
        })

        it('all listeners are removed after worker settles', async () => {
            harness.responseQueue.push((w) => {
                w.listeners.get('message')?.forEach((fn) =>
                    fn(new MessageEvent('message', { data: makeLoadRecordsSuccess(makePoints(1)) }))
                )
            })

            await loadBusinessData()

            const worker = FakeWorker.instances[0]!
            expect(worker.listeners.get('message')?.length ?? 0).toBe(0)
            expect(worker.listeners.get('messageerror')?.length ?? 0).toBe(0)
            expect(worker.listeners.get('error')?.length ?? 0).toBe(0)
        })
    })
})
