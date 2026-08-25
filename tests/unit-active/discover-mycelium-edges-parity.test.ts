/**
 * Discovery parity test: the worker's discoverMyceliumEdges (the ONLY
 * implementation — the main-thread sync fallback calls the same exported
 * function) must reproduce the documented thread-manager semantics:
 * top-20-by-score, seen-set dedup, per-layer degree caps, bridge thresholds.
 * INP campaign 2026-08-25.
 */
import { describe, expect, it } from 'vitest'
import { discoverMyceliumEdges } from '../../src/lib/workers/mycelium-build-worker'

const leadIds = ['a', 'b', 'c', 'd']
const clusters = [0, 0, 1, 1]

const neighborMap = {
    // a→b: same cluster, score 0.9 → core. a→c: cross-cluster bridge → bridge.
    a: [
        { leadId: 'b', semanticScore: 0.9, sameCity: false, threadType: '' },
        { leadId: 'c', semanticScore: 0.5, sameCity: false, threadType: 'bridge-lane', bridgeScore: 0.7 }
    ],
    // b→a: dedup via seen-set (pair already discovered from a's side).
    b: [{ leadId: 'a', semanticScore: 0.95, sameCity: false, threadType: '' }],
    // c→d: same cluster (1), score 0.45 → wispy (below core, above wispy floor).
    c: [{ leadId: 'd', semanticScore: 0.45, sameCity: false, threadType: '' }],
    // d→a: cross-cluster, bridgeScore 0.3 + no bridge threadType → dropped.
    d: [{ leadId: 'a', semanticScore: 0.8, sameCity: true, threadType: '' }]
}

describe('discoverMyceliumEdges — thread-manager semantics', () => {
    it('classifies core/wispy/bridge with dedup and degree caps', () => {
        const result = discoverMyceliumEdges({ leadIds, pointClusters: clusters, neighborMap })
        expect(result).not.toBeNull()
        const r = result!
        // a-b core pair discovered once (dedup).
        expect(r.corePairs).toEqual([{ a: 0, b: 1 }])
        // c-d wispy pair.
        expect(r.wispyPairs).toEqual([{ a: 2, b: 3 }])
        // a-c bridge (cross-cluster + bridgeLike); d-a dropped (cross-cluster, not bridgeLike).
        expect(r.bridgePairs).toEqual([{ a: 0, b: 2 }])
    })

    it('enforces the bridge degree cap (max 2 per node)', () => {
        const dense = discoverMyceliumEdges({
            leadIds: ['a', 'b', 'c', 'd'],
            pointClusters: [0, 1, 1, 1],
            neighborMap: {
                a: [
                    { leadId: 'b', semanticScore: 0.9, threadType: 'bridge', bridgeScore: 0.9 },
                    { leadId: 'c', semanticScore: 0.9, threadType: 'bridge', bridgeScore: 0.9 },
                    { leadId: 'd', semanticScore: 0.9, threadType: 'bridge', bridgeScore: 0.9 }
                ]
            }
        })
        // a-b and a-c accepted; a-d rejected (a already has bridge degree 2).
        expect(dense!.bridgePairs.map((p) => p.b).sort()).toEqual([1, 2])
    })

    it('enforces the core degree cap (max 4 per node)', () => {
        const neighbors = [1, 2, 3, 4, 5, 6].map((i) => ({
            leadId: String(i),
            semanticScore: 0.9,
            sameCity: false,
            threadType: ''
        }))
        const dense = discoverMyceliumEdges({
            leadIds: ['0', '1', '2', '3', '4', '5', '6'],
            pointClusters: [0, 0, 0, 0, 0, 0, 0],
            neighborMap: { 0: neighbors }
        })
        expect(dense!.corePairs.length).toBe(4)
    })

    it('returns null when no edges qualify or input is empty', () => {
        expect(discoverMyceliumEdges({ leadIds: [], pointClusters: [], neighborMap: {} })).toBeNull()
        expect(discoverMyceliumEdges({ leadIds: ['a'], pointClusters: [0], neighborMap: { a: [] } })).toBeNull()
    })
})
