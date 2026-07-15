import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { attachLegacyState, loadSemanticThreads } from '../../src/lib/engine/semantic-threads'
import {
    getLayoutManifest,
    getSemanticNeighborMap,
    getSemanticThreadArtifactName,
    getSemanticThreadBundle,
    resetDataStores
} from '../../src/lib/data-store.ts'
import type { SemanticThreadBundle, SemanticThreadNode } from '../../src/lib/types/business'

vi.mock('../../src/lib/workers/data-worker-url', () => ({
    workerUrl: 'mock-data-worker.js'
}))

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

function createSemanticThreadNode(): SemanticThreadNode {
    return {
        lead_id: 'lead-1',
        name: 'Lead One',
        city: 'Conroe',
        status: 'active',
        signal_score: 0.75,
        neighbors: [
            {
                lead_id: 'lead-2',
                score: 0.9,
                semantic_score: 0.8,
                same_city: true,
                same_status: true,
                bridge_score: 0.1,
                signal_score: 0.7,
                thread_type: 'local_semantic_neighbor',
                relationship_role: 'semantic_similarity',
                relationship_axis: 'offer',
                role_reason: 'shared category signal',
                reason: 'semantically related'
            }
        ]
    }
}

/**
 * Create a node matching the real worker output shape (camelCase, normalized).
 * This mirrors the `NeighborEntry` interface in src/lib/workers/data-worker.ts
 * — the worker builds these entries with `leadId` (not `lead_id`), so the
 * main-thread `normalizeSemanticNeighborEntries` MUST read camelCase.
 */
function createWorkerOutputNode(): {
    leadId: string
    name: string | null
    city: string | null
    status: string | null
    signalScore: number
    neighbors: Array<{
        leadId: string
        score: number
        semanticScore: number
        sameCity: boolean
        sameStatus: boolean
        bridgeScore: number
        signalScore: number
        threadType: string
        relationshipRole: string
        relationshipAxis: string
        roleReason: string
        reason: string
    }>
} {
    return {
        leadId: '519',
        name: 'Angel Fire Coffee',
        city: 'Cleveland',
        status: 'active',
        signalScore: 2.6,
        neighbors: [
            {
                leadId: '7070',
                score: 1.1497,
                semanticScore: 0.8757,
                sameCity: true,
                sameStatus: true,
                bridgeScore: 0.7557,
                signalScore: 2.6,
                threadType: 'same_city_semantic_neighbor',
                relationshipRole: 'downstream',
                relationshipAxis: 'industrial_supply_serves_food_hospitality',
                roleReason: 'candidate looks like a customer',
                reason: 'close semantic neighbor, same city'
            },
            {
                leadId: '8812',
                score: 1.13,
                semanticScore: 0.86,
                sameCity: false,
                sameStatus: true,
                bridgeScore: 0.7,
                signalScore: 2.5,
                threadType: 'local_semantic_neighbor',
                relationshipRole: 'core_peer',
                relationshipAxis: 'shared_category',
                roleReason: 'core category overlap',
                reason: 'close semantic neighbor'
            }
        ]
    }
}

function createBundle(): SemanticThreadBundle {
    return {
        nodes: {
            'lead-1': createSemanticThreadNode()
        }
    }
}

function createState() {
    return {
        semanticThreadsLoadPromise: null,
        semanticThreadsRetryTimer: null,
        semanticThreadsRetryAttempt: 0,
        semanticThreadsStatus: 'idle',
        semanticThreadBundle: null,
        semanticThreadArtifactName: null,
        semanticNeighborMapByLeadId: new Map(),
        semanticSpaceLayoutManifest: null,
        semanticSpaceLayoutStatus: 'idle',
        semanticSpaceLayoutError: null,
        points: [{ id: 'point-1' }]
    }
}

describe('semantic thread worker lifecycle', () => {
    let state: ReturnType<typeof createState>
    let bundle: SemanticThreadBundle

    beforeEach(() => {
        vi.useFakeTimers()
        MockWorker.instances = []
        vi.stubGlobal('Worker', MockWorker)
        resetDataStores()
        expect(getSemanticThreadBundle()).toBeNull()
        bundle = createBundle()

        vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
            const url = String(input)
            if (url.includes('semantic_space_layout_manifest.json')) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            generated_at: '2026-06-18',
                            method: 'test',
                            rows: 1,
                            edges: 1,
                            thread_path: 'semantic_threads_ui.dat',
                            data_path: 'data.dat'
                        }),
                        { status: 200 }
                    )
                )
            }

            throw new Error(`Unexpected fetch: ${url}`)
        })

        state = createState()
        attachLegacyState(state)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('sends a request id, resolves from the matching worker response, and terminates the worker', async () => {
        const promise = loadSemanticThreads({ reason: 'unit-test' })
        await Promise.resolve()
        await Promise.resolve()

        const worker = MockWorker.instances[0]
        expect(worker).toBeDefined()

        const request = worker.lastMessage as {
            type: string
            requestId: number
        }
        expect(request.type).toBe('LOAD_THREADS')
        expect(request.requestId).toBe(1)

        worker.dispatchEvent(
            new MessageEvent('message', {
                data: {
                    type: 'LOAD_THREADS_SUCCESS',
                    requestId: request.requestId,
                    payload: {
                        neighborEntries: [['lead-1', createSemanticThreadNode()]],
                        artifactName: 'semantic_threads_ui.dat',
                        bundle
                    }
                }
            })
        )

        await expect(promise).resolves.toBe(true)
        expect(state.semanticThreadsStatus).toBe('ready')
        expect(state.semanticThreadArtifactName).toBe('semantic_threads_ui.dat')
        expect(state.semanticNeighborMapByLeadId.size).toBe(1)
        expect(getSemanticThreadBundle()).toBe(bundle)
        expect(getSemanticThreadArtifactName()).toBe('semantic_threads_ui.dat')
        expect(getSemanticNeighborMap().size).toBe(1)
        expect(getLayoutManifest()).not.toBeNull()
        expect(worker.terminated).toBe(true)
    })

    it('ignores stale worker responses until the matching request id resolves', async () => {
        const promise = loadSemanticThreads({ reason: 'unit-test-stale-response' })
        const resolved = vi.fn()
        promise.then(resolved)
        await Promise.resolve()
        await Promise.resolve()

        const worker = MockWorker.instances[0]
        expect(worker).toBeDefined()

        const request = worker.lastMessage as {
            type: string
            requestId: number
        }

        worker.dispatchEvent(
            new MessageEvent('message', {
                data: {
                    type: 'LOAD_THREADS_SUCCESS',
                    requestId: request.requestId + 1,
                    payload: {
                        neighborEntries: [['stale-lead', createSemanticThreadNode()]],
                        artifactName: 'semantic_threads_ui.dat',
                        bundle
                    }
                }
            })
        )
        await Promise.resolve()

        expect(resolved).not.toHaveBeenCalled()
        expect(worker.terminated).toBe(false)
        expect(state.semanticThreadsStatus).toBe('loading')

        worker.dispatchEvent(
            new MessageEvent('message', {
                data: {
                    type: 'LOAD_THREADS_SUCCESS',
                    requestId: request.requestId,
                    payload: {
                        neighborEntries: [['lead-1', createSemanticThreadNode()]],
                        artifactName: 'semantic_threads_ui.dat',
                        bundle
                    }
                }
            })
        )

        await expect(promise).resolves.toBe(true)
        expect(worker.terminated).toBe(true)
        expect(state.semanticNeighborMapByLeadId.size).toBe(1)
    })

    it('fails and terminates the worker when the semantic thread worker emits an error', async () => {
        const promise = loadSemanticThreads({ reason: 'unit-test-worker-error' })
        await Promise.resolve()
        await Promise.resolve()

        const worker = MockWorker.instances[0]
        expect(worker).toBeDefined()

        worker.dispatchEvent(
            new ErrorEvent('error', {
                message: 'worker exploded',
                error: new Error('worker exploded')
            })
        )

        await expect(promise).resolves.toBe(false)
        expect(worker.terminated).toBe(true)
        expect(state.semanticThreadsStatus).toBe('failed')
        expect(state.semanticThreadsLoadPromise).toBeNull()
        expect(getSemanticThreadBundle()).toBeNull()
        expect(getSemanticThreadArtifactName()).toBeNull()
        expect(getSemanticNeighborMap().size).toBe(0)
        expect(getLayoutManifest()).toBeNull()
    })

    it('fails and terminates the worker when the semantic thread request times out', async () => {
        const promise = loadSemanticThreads({ reason: 'unit-test-timeout' })
        await Promise.resolve()
        await Promise.resolve()

        await vi.runAllTimersAsync()
        const worker = MockWorker.instances[0]
        expect(worker).toBeDefined()
        expect(worker.terminated).toBe(true)

        await expect(promise).resolves.toBe(false)
        expect(state.semanticThreadsStatus).toBe('failed')
        expect(state.semanticThreadsLoadPromise).toBeNull()
        expect(getSemanticThreadBundle()).toBeNull()
        expect(getSemanticThreadArtifactName()).toBeNull()
        expect(getSemanticNeighborMap().size).toBe(0)
        expect(getLayoutManifest()).toBeNull()
    })
})

describe('semantic thread worker — camelCase worker output (regression: empty-leadId cascade)', () => {
    /**
     * Regression: src/lib/engine/semantic-threads.ts `normalizeSemanticNeighborEntries`
     * historically read snake_case fields (`neighbor.lead_id`) from the worker's
     * postMessage payload, but the worker (src/lib/workers/data-worker.ts) sends
     * camelCase (`neighbor.leadId`). The mismatch produced empty-string leadIds
     * for all 100,872 semantic neighbors across the dataset, silently breaking
     * `resolveSemanticNeighbors` and `getSemanticNeighborRecordBetween` so every
     * focused business ended up with an empty constellation. The main-thread
     * transform must read camelCase to match what the worker actually emits.
     */

    let state: ReturnType<typeof createState>

    beforeEach(() => {
        vi.useFakeTimers()
        MockWorker.instances = []
        vi.stubGlobal('Worker', MockWorker)
        resetDataStores()
        state = createState()
        attachLegacyState(state)

        vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
            const url = String(input)
            if (url.includes('semantic_space_layout_manifest.json')) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            generated_at: '2026-06-18',
                            method: 'test',
                            rows: 1,
                            edges: 2,
                            thread_path: 'semantic_threads_ui.dat',
                            data_path: 'data.dat'
                        }),
                        { status: 200 }
                    )
                )
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('preserves neighbor leadIds when the worker emits camelCase NeighborEntry shape', async () => {
        const workerNode = createWorkerOutputNode()
        const bundle = {
            nodes: { '519': workerNode }
        }

        const promise = loadSemanticThreads({ reason: 'unit-test-camelcase' })
        await Promise.resolve()
        await Promise.resolve()

        const worker = MockWorker.instances[0]
        expect(worker).toBeDefined()

        const request = worker.lastMessage as { requestId: number }
        worker.dispatchEvent(
            new MessageEvent('message', {
                data: {
                    type: 'LOAD_THREADS_SUCCESS',
                    requestId: request.requestId,
                    payload: {
                        neighborEntries: [['519', workerNode]],
                        artifactName: 'semantic_threads_ui.dat',
                        bundle
                    }
                }
            })
        )

        await expect(promise).resolves.toBe(true)

        const map = state.semanticNeighborMapByLeadId as Map<string, {
            leadId: string
            neighbors: Array<{ leadId: string; score: number; sameCity: boolean; relationshipRole: string }>
        }>

        const entry = map.get('519')
        expect(entry).toBeDefined()
        expect(entry.leadId).toBe('519')
        expect(entry.neighbors).toHaveLength(2)

        // The critical regression assertion: every neighbor must have a
        // non-empty leadId. Before the fix, all neighbors had leadId: ''
        // because the transform read snake_case `lead_id` (which was
        // undefined on the worker's camelCase output).
        for (const neighbor of entry.neighbors) {
            expect(neighbor.leadId).toBeTruthy()
            expect(neighbor.leadId).not.toBe('')
        }

        expect(entry.neighbors[0].leadId).toBe('7070')
        expect(entry.neighbors[1].leadId).toBe('8812')

        // Verify that other camelCase fields also propagate (not just leadId).
        expect(entry.neighbors[0].score).toBe(1.1497)
        expect(entry.neighbors[0].sameCity).toBe(true)
        expect(entry.neighbors[0].relationshipRole).toBe('downstream')
        expect(entry.neighbors[1].relationshipRole).toBe('core_peer')
    })
})
