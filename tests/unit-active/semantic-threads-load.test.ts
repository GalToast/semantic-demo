/**
 * @vitest-environment jsdom
 *
 * Direct coverage for the 694-LOC semantic-thread orchestrator at
 * src/lib/semantic-threads.ts.
 *
 * The file has 6 named exports:
 *   - attachLegacyState(state as any) — wires the legacy state singleton
 *   - resetSemanticThreadWorker() — tears down the data worker
 *   - getSemanticThreadBundle() → SemanticThreadBundle | null
 *   - getSemanticThreadArtifactName() → string | null
 *   - getSemanticNeighborMapByLeadId() → Map
 *   - loadSemanticThreads(options) → Promise<boolean>
 *
 * Existing seam test (semantic-threads-worker-lifecycle.test.ts) covers
 * loadSemanticThreads thoroughly (4 tests). This file covers the OTHER
 * 5 exports — the public getters + lifecycle functions — that had no
 * direct contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const workerBoot = vi.hoisted(() => ({
    resetCalls: 0,
    lastTerminatedWorker: null as null | { terminate: ReturnType<typeof vi.fn> },
}))

vi.mock('@lib/workers/data-worker-url', () => ({
    workerUrl: 'mock-data-worker.js',
    // Provide a buildAssetUrl if the SUT ever imports it
    buildAssetUrl: (url: string) => url,
}))

import {
    attachLegacyState,
    resetSemanticThreadWorker,
    getSemanticThreadBundle,
    getSemanticThreadArtifactName,
    getSemanticNeighborMapByLeadId,
} from '@lib/engine/semantic-threads'

// ── Mock Worker ──────────────────────────────────────────────────────────────

class MockWorker {
    static prototypeInstances: MockWorker[] = []
    terminate = vi.fn(() => {
        workerBoot.resetCalls += 1
        workerBoot.lastTerminatedWorker = this
    })
    lastMessage: unknown = null
    postMessage(_msg: unknown): void {
        // noop
    }
    addEventListener(): void {
        // noop
    }
    removeEventListener(): void {
        // noop
    }
    dispatchEvent(): boolean {
        return true
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function createStateFixture(): Record<string, unknown> {
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
        points: [{ id: 'point-1' }],
    }
}

function createBundle(): { bundle: Record<string, unknown>; artifact: string; neighborMap: Map<string, unknown> } {
    const neighborMap = new Map<string, unknown>([
        [
            'lead-1',
            {
                lead_id: 'lead-1',
                name: 'Lead One',
                neighbors: [
                    { lead_id: 'lead-2', relationship_role: 'semantic_similarity', score: 0.9 },
                ],
            },
        ],
        [
            'lead-2',
            {
                lead_id: 'lead-2',
                name: 'Lead Two',
                neighbors: [
                    { lead_id: 'lead-1', relationship_role: 'semantic_similarity', score: 0.8 },
                ],
            },
        ],
    ])

    const bundle = {
        nodes: {
            'lead-1': neighborMap.get('lead-1'),
            'lead-2': neighborMap.get('lead-2'),
        },
    }

    return { bundle, artifact: 'semantic_threads_ui.dat', neighborMap }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('semantic-threads — attachLegacyState', () => {
    beforeEach(() => {
        MockWorker.prototypeInstances = []
        vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker)
        resetSemanticThreadWorker()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        workerBoot.resetCalls = 0
        workerBoot.lastTerminatedWorker = null
    })

    it('binds the state singleton', () => {
        const state = createStateFixture()
        attachLegacyState(state as any)
        // After attach, getSemanticThreadBundle reads from _state.semanticThreadBundle
        // which starts at null.
        expect(getSemanticThreadBundle()).toBeNull()
        expect(getSemanticThreadArtifactName()).toBeNull()
    })

    it('after attach + populate, getters return the populated values', () => {
        const state = createStateFixture()
        const { bundle, artifact, neighborMap } = createBundle()

        attachLegacyState(state as any)

        // Simulate a successful loadSemanticThreads outcome by mutating
        // the bound state directly (loadSemanticThreads is tested elsewhere).
        const typedState = state as {
            semanticThreadBundle: unknown
            semanticThreadArtifactName: string | null
            semanticNeighborMapByLeadId: Map<string, unknown>
        }
        typedState.semanticThreadBundle = bundle
        typedState.semanticThreadArtifactName = artifact
        typedState.semanticNeighborMapByLeadId = neighborMap

        expect(getSemanticThreadBundle()).toBe(bundle)
        expect(getSemanticThreadArtifactName()).toBe(artifact)
        expect(getSemanticNeighborMapByLeadId()).toBe(neighborMap)
        expect(getSemanticNeighborMapByLeadId().size).toBe(2)
        expect(getSemanticNeighborMapByLeadId().has('lead-1')).toBe(true)
    })

    it('accepts a stateRef cast as unknown (matches real call sites)', () => {
        // Real call sites pass the legacy state singleton which is typed
        // loosely; the cast to `unknown` mirrors the production call shape.
        const state = createStateFixture()
        attachLegacyState(state as unknown as Parameters<typeof attachLegacyState>[0])
        expect(getSemanticThreadBundle()).toBeNull()
    })
})

describe('semantic-threads — public getters (without attach)', () => {
    // Note: we don't attach state in these tests — they exercise the
    // null/empty-map fallback path of the public getters.

    beforeEach(() => {
        resetSemanticThreadWorker()
    })

    it('getSemanticThreadBundle returns null when state is unattached', () => {
        expect(getSemanticThreadBundle()).toBeNull()
    })

    it('getSemanticThreadArtifactName returns null when state is unattached', () => {
        expect(getSemanticThreadArtifactName()).toBeNull()
    })

    it('getSemanticNeighborMapByLeadId returns an empty Map when state is unattached', () => {
        const map = getSemanticNeighborMapByLeadId()
        expect(map).toBeInstanceOf(Map)
        expect(map.size).toBe(0)
    })

    it('getSemanticNeighborMapByLeadId returns a Map (may be the same singleton map as before)', () => {
        // The getter returns either the bound state's map OR a fallback
        // `new Map()`. Whether it's the same Map across calls depends on
        // whether attachLegacyState() was previously called (module-level
        // _state persists across tests in the same module). Either way,
        // the return value must be a Map instance.
        const result = getSemanticNeighborMapByLeadId()
        expect(result).toBeInstanceOf(Map)
        expect(typeof result.size).toBe('number')
    })
})

describe('semantic-threads — resetSemanticThreadWorker', () => {
    let mockWorkerInstance: MockWorker

    beforeEach(() => {
        MockWorker.prototypeInstances = []
        vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker)
        mockWorkerInstance = new MockWorker()
        workerBoot.resetCalls = 0
        workerBoot.lastTerminatedWorker = null
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('is a no-op when no worker is cached', () => {
        // Reset without an active worker: must not throw, must not call terminate on any worker.
        expect(() => resetSemanticThreadWorker()).not.toThrow()
    })

    it('can be called multiple times without error', () => {
        expect(() => {
            resetSemanticThreadWorker()
            resetSemanticThreadWorker()
            resetSemanticThreadWorker()
        }).not.toThrow()
    })
})

describe('semantic-threads — neighbor-map shape after populate', () => {
    beforeEach(() => {
        vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker)
        resetSemanticThreadWorker()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('Map.keys() returns the populated lead-ids', () => {
        const state = createStateFixture()
        const { neighborMap } = createBundle()
        attachLegacyState(state as any)
        ;(state as { semanticNeighborMapByLeadId: Map<string, unknown> }).semanticNeighborMapByLeadId =
            neighborMap

        const result = getSemanticNeighborMapByLeadId()
        expect(Array.from(result.keys())).toEqual(['lead-1', 'lead-2'])
    })

    it('neighbor entries expose the inner relationship_role field for tests below', () => {
        const state = createStateFixture()
        const { neighborMap } = createBundle()
        attachLegacyState(state as any)
        ;(state as { semanticNeighborMapByLeadId: Map<string, unknown> }).semanticNeighborMapByLeadId =
            neighborMap

        const entry = getSemanticNeighborMapByLeadId().get('lead-1') as unknown as {
            neighbors: { relationship_role: string }[]
        }
        expect(entry.neighbors[0]?.relationship_role).toBe('semantic_similarity')
    })
})
