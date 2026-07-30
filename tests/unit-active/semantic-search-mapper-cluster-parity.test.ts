/**
 * W62-L4 cluster parity: mapServiceRow must propagate `cluster` from the
 * raw API service row into `point.cluster` so that downstream consumers
 * (audio-scape, focus-pocket-geometry, thread-lens, cluster-labels,
 * semantic-guide-payload-adapter, map-state, etc.) see the same shape as
 * the local-search-index path's localHitsToResults (which sets
 * `cluster: record.cluster` at local-search-index.ts:~285).
 *
 * Prior to the fix, PHP api/search.php:240 omitted `cluster` from its
 * response row and mapServiceRow omits `cluster` from its `point`,
 * so clients silently fell back to cluster-0 (wrong color/label/geometry
 * for API-path results — ~10 `point.cluster ?? 0` consumers affected).
 */
import { describe, it, expect } from 'vitest'
import { mapServiceRow } from '../../src/lib/search/semantic-search-mapper'

describe('mapServiceRow cluster parity (W62-L4)', () => {
    it('propagates numeric cluster into point.cluster', () => {
        const row = { lead_id: '100', name: 'Beanpa Coffee', cluster: 7 }
        const r = mapServiceRow(row as never, 0)
        expect(r).not.toBeNull()
        expect(r?.point.cluster).toBe(7)
    })

    it('propagates cluster when raw value is a numeric string', () => {
        const row = { lead_id: '100', name: 'Beanpa Coffee', cluster: '3' }
        const r = mapServiceRow(row as never, 0)
        expect(r?.point.cluster).toBe(3)
    })

    it('preserves cluster:0 (cluster zero is a real cluster)', () => {
        const row = { lead_id: '100', name: 'Beanpa Coffee', cluster: 0 }
        const r = mapServiceRow(row as never, 0)
        expect(r?.point.cluster).toBe(0)
    })

    it('returns undefined for point.cluster when raw row omits cluster (parity with localHitsToResults)', () => {
        const row = { lead_id: '100', name: 'Beanpa Coffee' }
        const r = mapServiceRow(row as never, 0)
        expect(r?.point.cluster).toBeUndefined()
    })

    it('returns undefined for cluster when raw value is not a finite number (e.g. "abc")', () => {
        const row = { lead_id: '100', name: 'Beanpa Coffee', cluster: 'abc' }
        const r = mapServiceRow(row as never, 0)
        expect(r?.point.cluster).toBeUndefined()
    })

    it('returns undefined for cluster when raw value is null (parity with localHitsToResults)', () => {
        const row = { lead_id: '100', name: 'Beanpa Coffee', cluster: null }
        const r = mapServiceRow(row as never, 0)
        expect(r?.point.cluster).toBeUndefined()
    })

    it('returns undefined for cluster when raw value is boolean (silence typeof leak)', () => {
        const row = { lead_id: '100', name: 'Beanpa Coffee', cluster: true }
        const r = mapServiceRow(row as never, 0)
        // Number(true) === 1, but a boolean is not a real cluster id; reject
        expect(r?.point.cluster).toBeUndefined()
    })

    it('non-cluster branches of the point remain populated when cluster is missing', () => {
        const row = { lead_id: '100', name: 'Beanpa Coffee', city: 'Crawford', what: 'cafe' }
        const r = mapServiceRow(row as never, 0)
        expect(r?.point.lead_id).toBe('100')
        expect(r?.point.name).toBe('Beanpa Coffee')
        expect(r?.point.city).toBe('Crawford')
        expect(r?.point.cluster).toBeUndefined()
    })
})
