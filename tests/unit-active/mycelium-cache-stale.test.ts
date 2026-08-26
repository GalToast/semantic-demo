/**
 * Cache-staleness pinning for isCachedEdgeSetsUsable (thread-manager).
 * Semantic-upgrade cycle (2026-08-26): when the 40MB threads artifact lands
 * AFTER boot, the neighbor-map identity changes and the geometric-fallback
 * edge-set cache must be treated as stale so the scene upgrades to real
 * semantic filaments. A mid-load empty/reset map must NOT downgrade a live
 * scene. Contract defined before implementation landed (TDD red→green).
 */
import { describe, expect, it } from 'vitest'
import { isCachedEdgeSetsUsable } from '../../src/lib/engine/thread-manager'

// Shared identities — the cache and the "current" refs must point at the
// SAME objects for the usable-path tests; only the varied field differs.
const points = { id: 'points' }
const positions = { id: 'positions' }
const baseCurrent = (overrides: Record<string, unknown> = {}) => ({
    points,
    positions,
    neighborMap: new Map([['a', []]]),
    neighborMapSize: 1,
    ...overrides
})

describe('isCachedEdgeSetsUsable — semantic upgrade cache semantics', () => {
    it('returns false when there is no cache', () => {
        const cur = baseCurrent()
        expect(isCachedEdgeSetsUsable(null, cur)).toBe(false)
    })

    it('returns false when the points array identity drifted', () => {
        const cached = { pointsRef: { id: 'old-points' }, positionsRef: positions, semanticSource: null }
        const cur = baseCurrent({ points: { id: 'new-points' } })
        expect(isCachedEdgeSetsUsable(cached, cur)).toBe(false)
    })

    it('returns false when the nodePositions array identity drifted', () => {
        const cached = { pointsRef: points, positionsRef: { id: 'old-pos' }, semanticSource: null }
        const cur = baseCurrent({ positions: { id: 'new-pos' } })
        expect(isCachedEdgeSetsUsable(cached, cur)).toBe(false)
    })

    it('returns false when a NEW non-empty neighbor map arrived (geometric → semantic upgrade)', () => {
        const oldMap = new Map()
        const cached = { pointsRef: points, positionsRef: positions, semanticSource: oldMap }
        const freshMap = new Map([['a', []]])
        const cur = baseCurrent({ neighborMap: freshMap, neighborMapSize: 1 })
        // Reference comparison: two distinct Map instances are never equal.
        expect(isCachedEdgeSetsUsable(cached, cur)).toBe(false)
        void oldMap
    })

    it('returns true when the same non-empty map identity is still current', () => {
        const map = new Map([['a', []]])
        const cached = { pointsRef: points, positionsRef: positions, semanticSource: map }
        const cur = baseCurrent({ neighborMap: map, neighborMapSize: 1 })
        expect(isCachedEdgeSetsUsable(cached, cur)).toBe(true)
    })

    it('keeps the current build when the map is still empty/mid-load (never downgrade to geometric)', () => {
        const semanticMap = new Map([['a', []]])
        const cachedSemantic = { pointsRef: points, positionsRef: positions, semanticSource: semanticMap }
        const curEmptyDifferentMap = baseCurrent({ neighborMap: new Map(), neighborMapSize: 0 })
        expect(isCachedEdgeSetsUsable(cachedSemantic, curEmptyDifferentMap)).toBe(true)
        // Even a geometric-built cache survives an empty-map window.
        const cachedGeometric = { pointsRef: points, positionsRef: positions, semanticSource: null }
        expect(isCachedEdgeSetsUsable(cachedGeometric, curEmptyDifferentMap)).toBe(true)
    })
})
