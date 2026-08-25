/**
 * CSR discovery parity: serializeAdjacency → discoverMyceliumEdgesCSR must
 * produce IDENTICAL edge sets to the object-form discoverMyceliumEdges (the
 * sync-fallback wrapper) across classification, dedup, and degree caps.
 * INP campaign 2026-08-25 — transferable adjacency + zero-copy response.
 */
import { describe, expect, it } from 'vitest'
import {
    discoverMyceliumEdges,
    discoverMyceliumEdgesCSR,
    discoverMyceliumEdgesCSRBuffers,
    serializeAdjacency,
    unpairEdges
} from '../../src/lib/workers/mycelium-build-worker'

const leadIds = ['a', 'b', 'c', 'd']
const clusters = [0, 0, 1, 1]

const neighborMap = {
    a: [
        { leadId: 'b', semanticScore: 0.9, sameCity: false, threadType: '' },
        { leadId: 'c', semanticScore: 0.5, sameCity: false, threadType: 'bridge-lane', bridgeScore: 0.7 }
    ],
    b: [{ leadId: 'a', semanticScore: 0.95, sameCity: false, threadType: '' }],
    c: [{ leadId: 'd', semanticScore: 0.45, sameCity: false, threadType: '' }],
    d: [{ leadId: 'a', semanticScore: 0.8, sameCity: true, threadType: '' }]
}

describe('discovery CSR ↔ object-form parity', () => {
    it('CSR path matches object-form on the classification fixture', () => {
        const objResult = discoverMyceliumEdges({ leadIds, pointClusters: clusters, neighborMap })
        expect(objResult).not.toBeNull()
        const adjacency = serializeAdjacency({ leadIds, neighborMap })
        // Simulate the transfer boundary: structuredClone round-trips the
        // typed arrays exactly as postMessage would deliver them.
        const csrResult = discoverMyceliumEdgesCSR({
            leadIds,
            pointClusters: clusters,
            adjacency: structuredClone(adjacency)
        })
        expect(csrResult).toEqual(objResult)
    })

    it('CSR path matches on bridge/core degree caps and cross-cluster drops', () => {
        const denseMap = {
            a: [
                { leadId: 'b', semanticScore: 0.9, threadType: 'bridge', bridgeScore: 0.9 },
                { leadId: 'c', semanticScore: 0.9, threadType: 'bridge', bridgeScore: 0.9 },
                { leadId: 'd', semanticScore: 0.9, threadType: 'bridge', bridgeScore: 0.9 }
            ]
        }
        const denseLeadIds = ['a', 'b', 'c', 'd']
        const objResult = discoverMyceliumEdges({
            leadIds: denseLeadIds,
            pointClusters: [0, 1, 1, 1],
            neighborMap: denseMap
        })
        const csrResult = discoverMyceliumEdgesCSR({
            leadIds: denseLeadIds,
            pointClusters: [0, 1, 1, 1],
            adjacency: structuredClone(serializeAdjacency({ leadIds: denseLeadIds, neighborMap: denseMap }))
        })
        expect(csrResult).toEqual(objResult)
        expect(csrResult!.bridgePairs.map((p) => p.b).sort()).toEqual([1, 2])
    })

    it('top-20-by-score selection is preserved under CSR', () => {
        // 30 neighbors, all core-eligible → only top 20 by score survive the
        // slice, then the core degree cap (4/node) limits further.
        const many = Array.from({ length: 30 }, (_, i) => ({
            leadId: `n${i}`,
            semanticScore: 0.5 + i / 100,
            sameCity: false,
            threadType: ''
        }))
        const starLeads = ['0', ...Array.from({ length: 30 }, (_, i) => `n${i}`)]
        const starMap: Record<string, typeof many> = { 0: many }
        const objResult = discoverMyceliumEdges({
            leadIds: starLeads,
            pointClusters: starLeads.map(() => 0),
            neighborMap: starMap
        })
        const csrResult = discoverMyceliumEdgesCSR({
            leadIds: starLeads,
            pointClusters: starLeads.map(() => 0),
            adjacency: structuredClone(serializeAdjacency({ leadIds: starLeads, neighborMap: starMap }))
        })
        expect(csrResult).toEqual(objResult)
        // Top-20 slice first, then core degree cap 4 per node.
        expect(csrResult!.corePairs.length).toBe(4)
        expect(csrResult!.corePairs.every((p) => p.a === 0)).toBe(true)
    })

    it('empty inputs stay null through the CSR path', () => {
        expect(
            discoverMyceliumEdgesCSR({
                leadIds: [],
                pointClusters: [],
                adjacency: structuredClone(serializeAdjacency({ leadIds: [], neighborMap: {} }))
            })
        ).toBeNull()
    })

    it('buffer form interleaves the same pairs as the object form (zero-copy response)', () => {
        const adjacency = structuredClone(serializeAdjacency({ leadIds, neighborMap }))
        const objResult = discoverMyceliumEdgesCSR({
            leadIds,
            pointClusters: clusters,
            adjacency
        })
        const bufResult = discoverMyceliumEdgesCSRBuffers({
            leadIds,
            pointClusters: clusters,
            adjacency
        })
        if (!objResult) {
            expect(bufResult).toBeNull()
            return
        }
        expect(bufResult).not.toBeNull()
        expect(unpairEdges(bufResult!.corePairs)).toEqual(objResult.corePairs)
        expect(unpairEdges(bufResult!.wispyPairs)).toEqual(objResult.wispyPairs)
        expect(unpairEdges(bufResult!.bridgePairs)).toEqual(objResult.bridgePairs)
        // Interleaved invariant: even length, Int32Array (zero-copy transferable).
        for (const buf of [bufResult!.corePairs, bufResult!.wispyPairs, bufResult!.bridgePairs]) {
            expect(buf.length % 2).toBe(0)
            expect(buf).toBeInstanceOf(Int32Array)
        }
    })
})
