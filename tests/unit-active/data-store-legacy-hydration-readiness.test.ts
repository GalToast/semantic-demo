/**
 * data-store-legacy-hydration-readiness.test.ts
 *
 * Regression tests for the legacy-to-Svelte hydration readiness race.
 *
 * The bug: hydrateFromLegacyState() returned true when semanticNeighborMapByLeadId
 * was an empty Map (new Map()), causing the main.ts retry loop to stop before
 * meaningful semantic-thread data arrived.
 *
 * Readiness contract:
 * - An empty semanticNeighborMapByLeadId must NOT alone report successful hydration
 * - A populated semanticNeighborMapByLeadId (size > 0) MUST report success
 * - Populated business points MUST report success (existing behavior)
 * - SSR/no-window behavior remains untouched; this jsdom fixture does not
 *   attempt to delete its non-configurable global window
 * - Optional artifacts (bundle, artifactName, layoutManifest) being null count as
 *   hydration only after the legacy state reports a terminal thread status
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    hydrateFromLegacyState,
    resetDataStores,
    getBusinessRecords,
    getSemanticNeighborMap,
    getSemanticThreadBundle,
    getSemanticThreadArtifactName,
    getLayoutManifest,
    setSemanticThreadData
} from '../../src/lib/data-store.ts'
import type {
    SemanticNeighborEntry,
    SemanticThreadDataResult,
    SemanticThreadBundle,
    SemanticThreadNode
} from '../../src/lib/types/business'
import type { BusinessRecord } from '../../src/lib/types/business'

// Helper to create a minimal BusinessRecord
function makeBusinessRecord(overrides: Partial<BusinessRecord> = {}): BusinessRecord {
    return {
        lead_id: 'lead-1',
        name: 'Test Business',
        what: 'Coffee',
        city: 'Rockville',
        category: 'Cafe',
        lat: 39.08,
        lng: -77.15,
        website: null,
        email: null,
        phone: null,
        trivia: null,
        status: 'active',
        naics: null,
        cluster: 0,
        ...overrides
    }
}

// Helper to create a minimal SemanticNeighborEntry
function makeNeighborEntry(overrides: Partial<SemanticNeighborEntry> = {}): SemanticNeighborEntry {
    return {
        leadId: 'lead-1',
        neighbors: [],
        threadCount: 0,
        ...overrides
    }
}

// Helper to set up a clean window.__APP_STATE__
function setupLegacyState(appState: Record<string, unknown>): void {
    const w = window as unknown as Record<string, unknown>
    w.__APP_STATE__ = appState
}

function clearLegacyState(): void {
    const w = window as unknown as Record<string, unknown>
    delete w.__APP_STATE__
}

describe('hydrateFromLegacyState readiness contract', () => {
    beforeEach(() => {
        resetDataStores()
        clearLegacyState()
        vi.restoreAllMocks()
    })

    afterEach(() => {
        resetDataStores()
        clearLegacyState()
        vi.restoreAllMocks()
    })

    it('returns false when __APP_STATE__ is missing', () => {
        expect(hydrateFromLegacyState()).toBe(false)
    })

    it('returns false when __APP_STATE__ exists but has no hydratable data', () => {
        setupLegacyState({})
        expect(hydrateFromLegacyState()).toBe(false)
    })

    it('returns false when semanticNeighborMapByLeadId is an empty Map (the bug)', () => {
        // This is the core regression: an empty Map must not count as hydration
        setupLegacyState({
            semanticNeighborMapByLeadId: new Map<string, SemanticNeighborEntry>()
        })
        expect(hydrateFromLegacyState()).toBe(false)
        // Verify the store was not updated with the empty map
        expect(getSemanticNeighborMap().size).toBe(0)
    })

    it('returns true when semanticNeighborMapByLeadId is a populated Map', () => {
        const neighborMap = new Map<string, SemanticNeighborEntry>()
        neighborMap.set('lead-1', makeNeighborEntry({ leadId: 'lead-1', neighbors: ['lead-2'], threadCount: 1 }))

        setupLegacyState({
            semanticNeighborMapByLeadId: neighborMap
        })
        expect(hydrateFromLegacyState()).toBe(true)
        expect(getSemanticNeighborMap().size).toBe(1)
        expect(getSemanticNeighborMap().get('lead-1')?.neighbors).toEqual(['lead-2'])
    })

    it('returns true when business points are populated (existing behavior)', () => {
        const points = [makeBusinessRecord({ lead_id: 'lead-1' }), makeBusinessRecord({ lead_id: 'lead-2' })]
        setupLegacyState({
            points
        })
        expect(hydrateFromLegacyState()).toBe(true)
        expect(getBusinessRecords().length).toBe(2)
    })

    it('returns true when both points and populated neighbor map exist', () => {
        const points = [makeBusinessRecord({ lead_id: 'lead-1' })]
        const neighborMap = new Map<string, SemanticNeighborEntry>()
        neighborMap.set('lead-1', makeNeighborEntry({ leadId: 'lead-1', neighbors: ['lead-2'], threadCount: 1 }))

        setupLegacyState({
            points,
            semanticNeighborMapByLeadId: neighborMap
        })
        expect(hydrateFromLegacyState()).toBe(true)
        expect(getBusinessRecords().length).toBe(1)
        expect(getSemanticNeighborMap().size).toBe(1)
    })

    it('returns true when semanticThreadBundle is explicitly null with failed status', () => {
        // When semantic threads fail, setSemanticThreadFailure sets bundle to null
        // (not undefined). This should still count as hydration so the retry loop stops.
        setupLegacyState({
            semanticThreadBundle: null,
            semanticThreadArtifactName: null,
            semanticSpaceLayoutManifest: null,
            semanticNeighborMapByLeadId: new Map(), // empty map from failure
            semanticThreadsStatus: 'failed'
        })
        expect(hydrateFromLegacyState()).toBe(true)
        expect(getSemanticThreadBundle()).toBeNull()
        expect(getSemanticThreadArtifactName()).toBeNull()
        expect(getLayoutManifest()).toBeNull()
    })

    it('returns true when semanticThreadArtifactName is explicitly null with ready status', () => {
        setupLegacyState({
            semanticThreadArtifactName: null,
            semanticThreadsStatus: 'ready'
        })
        expect(hydrateFromLegacyState()).toBe(true)
        expect(getSemanticThreadArtifactName()).toBeNull()
    })

    it('returns true when semanticSpaceLayoutManifest is explicitly null with ready status', () => {
        setupLegacyState({
            semanticSpaceLayoutManifest: null,
            semanticThreadsStatus: 'ready'
        })
        expect(hydrateFromLegacyState()).toBe(true)
        expect(getLayoutManifest()).toBeNull()
    })

    it('returns false when semanticThreadBundle is null with idle status (canonical defaults)', () => {
        // This is the race condition: canonical defaults (null fields + idle status) should not hydrate
        setupLegacyState({
            semanticThreadBundle: null,
            semanticThreadArtifactName: null,
            semanticSpaceLayoutManifest: null,
            semanticNeighborMapByLeadId: new Map(),
            semanticThreadsStatus: 'idle'
        })
        expect(hydrateFromLegacyState()).toBe(false)
        // Verify stores were not updated with null values
        expect(getSemanticThreadBundle()).toBeNull()
        expect(getSemanticThreadArtifactName()).toBeNull()
        expect(getLayoutManifest()).toBeNull()
        expect(getSemanticNeighborMap().size).toBe(0)
    })

    it('returns false when semanticThreadBundle is null with loading status', () => {
        // Loading state should not hydrate null values
        setupLegacyState({
            semanticThreadBundle: null,
            semanticThreadArtifactName: null,
            semanticSpaceLayoutManifest: null,
            semanticNeighborMapByLeadId: new Map(),
            semanticThreadsStatus: 'loading'
        })
        expect(hydrateFromLegacyState()).toBe(false)
        // Verify stores were not updated with null values
        expect(getSemanticThreadBundle()).toBeNull()
        expect(getSemanticThreadArtifactName()).toBeNull()
        expect(getLayoutManifest()).toBeNull()
        expect(getSemanticNeighborMap().size).toBe(0)
    })

    it('returns true when semanticThreadBundle is null with ready status (explicit success)', () => {
        // Ready state with null values should hydrate (explicit terminal state)
        setupLegacyState({
            semanticThreadBundle: null,
            semanticThreadArtifactName: null,
            semanticSpaceLayoutManifest: null,
            semanticNeighborMapByLeadId: new Map(),
            semanticThreadsStatus: 'ready'
        })
        expect(hydrateFromLegacyState()).toBe(true)
        expect(getSemanticThreadBundle()).toBeNull()
        expect(getSemanticThreadArtifactName()).toBeNull()
        expect(getLayoutManifest()).toBeNull()
    })

    it('returns true when semanticThreadBundle is populated regardless of status', () => {
        // Non-null values always hydrate, even during loading
        setupLegacyState({
            semanticThreadBundle: { threads: [], metadata: { version: 1 } },
            semanticThreadsStatus: 'loading'
        })
        expect(hydrateFromLegacyState()).toBe(true)
        expect(getSemanticThreadBundle()).toEqual({ threads: [], metadata: { version: 1 } })
    })

    it('returns true when populated neighbor map exists regardless of thread status', () => {
        // Populated neighbor map always hydrates, even during loading
        const neighborMap = new Map<string, SemanticNeighborEntry>()
        neighborMap.set('lead-1', makeNeighborEntry({ leadId: 'lead-1', neighbors: ['lead-2'], threadCount: 1 }))

        setupLegacyState({
            semanticNeighborMapByLeadId: neighborMap,
            semanticThreadsStatus: 'loading'
        })
        expect(hydrateFromLegacyState()).toBe(true)
        expect(getSemanticNeighborMap().size).toBe(1)
    })

    it('returns true when populated points exist regardless of thread status', () => {
        // Populated points always hydrate, even during loading
        const points = [makeBusinessRecord({ lead_id: 'lead-1' })]
        setupLegacyState({
            points,
            semanticThreadsStatus: 'loading'
        })
        expect(hydrateFromLegacyState()).toBe(true)
        expect(getBusinessRecords().length).toBe(1)
    })

    it('preserves legacy compatibility for non-null optional values without status', () => {
        // Legacy payloads without status field should still work
        setupLegacyState({
            semanticThreadBundle: { threads: [], metadata: { version: 1 } }
        })
        expect(hydrateFromLegacyState()).toBe(true)
        expect(getSemanticThreadBundle()).toEqual({ threads: [], metadata: { version: 1 } })
    })

    it('does not hydrate when semanticThreadBundle is undefined (not yet set)', () => {
        // undefined means the legacy state hasn't been initialized with this field yet
        setupLegacyState({
            semanticThreadBundle: undefined
        })
        expect(hydrateFromLegacyState()).toBe(false)
    })

    it('is idempotent - calling twice with same data does not double-write', () => {
        const points = [makeBusinessRecord({ lead_id: 'lead-1' })]
        setupLegacyState({ points })

        const first = hydrateFromLegacyState()
        const second = hydrateFromLegacyState()

        expect(first).toBe(true)
        expect(second).toBe(true)
        expect(getBusinessRecords().length).toBe(1)
    })

    it('updates stores when legitimate data arrives after initial empty state', () => {
        // Simulate the race: first call sees empty map, second call sees populated data
        setupLegacyState({
            semanticNeighborMapByLeadId: new Map()
        })
        expect(hydrateFromLegacyState()).toBe(false)

        // Now real data arrives
        const neighborMap = new Map<string, SemanticNeighborEntry>()
        neighborMap.set('lead-1', makeNeighborEntry({ leadId: 'lead-1', neighbors: ['lead-2'], threadCount: 1 }))
        setupLegacyState({
            semanticNeighborMapByLeadId: neighborMap
        })
        expect(hydrateFromLegacyState()).toBe(true)
        expect(getSemanticNeighborMap().size).toBe(1)
    })

    it('populated points with empty neighbor map still hydrates points', () => {
        const points = [makeBusinessRecord({ lead_id: 'lead-1' })]
        setupLegacyState({
            points,
            semanticNeighborMapByLeadId: new Map()
        })
        // Points should hydrate even though neighbor map is empty
        expect(hydrateFromLegacyState()).toBe(true)
        expect(getBusinessRecords().length).toBe(1)
        expect(getSemanticNeighborMap().size).toBe(0) // Empty map not written
    })

    it('hydrates points-first, then accepts semantic thread data via setSemanticThreadData', () => {
        // Phase 1: window.__APP_STATE__ carries populated points but no semantic
        // thread payload. hydrateFromLegacyState() must succeed on the points-first
        // path without waiting for optional thread data.
        const points = [makeBusinessRecord({ lead_id: 'lead-1' })]
        setupLegacyState({
            points,
            semanticThreadBundle: undefined,
            semanticThreadArtifactName: undefined,
            semanticSpaceLayoutManifest: undefined,
            semanticNeighborMapByLeadId: new Map(),
            semanticThreadsStatus: undefined
        })

        expect(hydrateFromLegacyState()).toBe(true)
        expect(getBusinessRecords().length).toBe(1)

        // Semantic thread stores must remain at their initial defaults; the
        // canonical push setter will populate them in phase 2.
        expect(getSemanticThreadBundle()).toBeNull()
        expect(getSemanticThreadArtifactName()).toBeNull()
        expect(getSemanticNeighborMap().size).toBe(0)
        expect(getLayoutManifest()).toBeNull()

        // Phase 2: semantic thread data arrives through the canonical push API
        // used by semantic-threads.ts. Even though hydration already returned
        // true, the stores must still reflect the later push.
        const threadNode: SemanticThreadNode = {
            lead_id: 'lead-1',
            name: 'Test Business',
            city: 'Rockville',
            status: 'active',
            signal_score: 0.8,
            neighbors: [
                {
                    lead_id: 'lead-2',
                    score: 0.5,
                    semantic_score: 0.6,
                    same_city: false,
                    same_status: true,
                    bridge_score: 0.1,
                    signal_score: 0.4,
                    thread_type: 'supply_chain',
                    relationship_role: 'direct',
                    relationship_axis: 'commercial',
                    role_reason: 'same category',
                    reason: 'close match'
                }
            ]
        }

        const bundle: SemanticThreadBundle = {
            nodes: { 'lead-1': threadNode }
        }

        const neighborMap = new Map<string, SemanticNeighborEntry>()
        neighborMap.set(
            'lead-1',
            makeNeighborEntry({
                leadId: 'lead-1',
                neighbors: [
                    {
                        leadId: 'lead-2',
                        score: 0.5,
                        semanticScore: 0.6,
                        sameCity: false,
                        sameStatus: true,
                        bridgeScore: 0.1,
                        signalScore: 0.4,
                        threadType: 'supply_chain',
                        relationshipRole: 'direct',
                        relationshipAxis: 'commercial',
                        roleReason: 'same category',
                        reason: 'close match'
                    }
                ]
            })
        )

        const threadData: SemanticThreadDataResult = {
            bundle,
            artifactName: 'semantic_threads_v1.dat',
            neighborMap,
            layoutManifest: {
                rows: 1,
                edges: 1,
                thread_path: '/threads/v1',
                data_path: '/data/v1'
            }
        }

        setSemanticThreadData(threadData)

        // The later push must update all four semantic-thread getters.
        expect(getSemanticThreadBundle()).toBe(bundle)
        expect(getSemanticThreadArtifactName()).toBe('semantic_threads_v1.dat')
        expect(getSemanticNeighborMap().size).toBe(1)
        expect(getSemanticNeighborMap().get('lead-1')?.leadId).toBe('lead-1')
        expect(getLayoutManifest()).toEqual({
            rows: 1,
            edges: 1,
            thread_path: '/threads/v1',
            data_path: '/data/v1'
        })
    })
})
