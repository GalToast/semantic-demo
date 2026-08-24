/**
 * Tests for SearchResult.index resolution in mapServiceRow.
 *
 * The defect: mapServiceRow previously set `index: order` (the API page
 * position) unconditionally. Downstream focus/glow/trail/card/URL code
 * requires the **corpus** index — the position of the business record in
 * the canonical 8,406-point array.
 *
 * The fix adds an optional `leadToIndex` map parameter. When present and
 * the row has a `lead_id`, the function looks up the lead_id in the
 * canonical map to find the true corpus position. Page order (the `order`
 * parameter) is the documented fallback for rows lacking a usable lead_id
 * or whose lead_id is absent from the map.
 *
 * Lead IDs in the Montgomery County dataset are non-sequential (e.g.
 * 1001, 1045, 1088, ...) so arithmetic from lead_id would be wrong.
 * The API's `row.index` field is also not trusted: it carries the
 * response-order position, not a corpus index.
 */
import { describe, it, expect } from 'vitest'
import { mapServiceRow } from '../../src/lib/search/semantic-search-mapper'

/**
 * Create a canonical lead_id → corpus index map that mimics the shape
 * of the real Map populated by data-loader.ts.
 *
 * The corpus has 8,406 points with non-sequential lead_ids such as:
 *   1001 → index 0, 1045 → index 1, 1088 → index 2, 1230 → index 3, ...
 */
function makeCanonicalIndexMap(): Map<string, number> {
    const map = new Map<string, number>()
    // Non-sequential lead_ids: 1001, 1045, 1088, 1230, 4017, ...
    map.set('1001', 0)
    map.set('1045', 1)
    map.set('1088', 2)
    map.set('1230', 3)
    map.set('4017', 100)
    map.set('712', 105)
    map.set('815', 202)
    return map
}

describe('mapServiceRow index resolution: canonical lead_id → corpus index', () => {
    const canonicalMap = makeCanonicalIndexMap()

    it('resolves a known lead_id to its corpus index, not page order', () => {
        // lead_id=1001 is known → corpus index 0, even though it's at page position 5
        const r = mapServiceRow({ lead_id: '1001', name: 'Alpha Co.' } as never, 5, canonicalMap)
        expect(r).not.toBeNull()
        expect(r!.index).toBe(0) // corpus index, not 5
        expect(r!.point?.lead_id).toBe('1001')
    })

    it('resolves a different non-sequential lead_id correctly', () => {
        // lead_id=4017 is at corpus index 100, page position 2
        const r = mapServiceRow({ lead_id: '4017', name: 'Beta Inc.' } as never, 2, canonicalMap)
        expect(r).not.toBeNull()
        expect(r!.index).toBe(100) // corpus index, not 2
    })

    it('resolves lead_id=815 (corpus index 202) when it appears first in results', () => {
        // lead_id=815 is at corpus index 202, page position 0
        const r = mapServiceRow({ lead_id: '815', name: 'Gamma LLC' } as never, 0, canonicalMap)
        expect(r).not.toBeNull()
        expect(r!.index).toBe(202) // corpus index, not 0
    })

    it('ignores the row-level index field from the API (it is page order, not corpus)', () => {
        // Even if the API sends `index: 99`, we must NOT use it — it's response-order.
        // The lead_id map is the source of truth.
        const r = mapServiceRow({ lead_id: '1045', name: 'Delta', index: 99 } as never, 3, canonicalMap)
        expect(r).not.toBeNull()
        expect(r!.index).toBe(1) // corpus index for lead_id=1045, not 99 and not 3
    })
})

describe('mapServiceRow index resolution: fallback behavior', () => {
    const canonicalMap = makeCanonicalIndexMap()

    it('falls back to page order when no leadToIndex map is provided', () => {
        // This preserves backward compatibility with tests and isolated usage.
        const r = mapServiceRow({ lead_id: '1001', name: 'Alpha Co.' } as never, 7)
        expect(r).not.toBeNull()
        expect(r!.index).toBe(7) // page order fallback
    })

    it('falls back to page order when lead_id is not in the canonical map', () => {
        // lead_id='unknown-999' is not in the corpus → page order fallback
        const r = mapServiceRow({ lead_id: 'unknown-999', name: 'Unknown Biz' } as never, 4, canonicalMap)
        expect(r).not.toBeNull()
        expect(r!.index).toBe(4) // page order fallback
    })

    it('falls back to page order for a name-only row (no lead_id)', () => {
        const r = mapServiceRow({ name: 'Some Business' } as never, 2, canonicalMap)
        expect(r).not.toBeNull()
        expect(r!.index).toBe(2)
        expect(r!.point?.lead_id).toBeUndefined()
    })

    it('falls back gracefully when map is empty', () => {
        const emptyMap = new Map<string, number>()
        const r = mapServiceRow({ lead_id: '1001', name: 'Alpha Co.' } as never, 3, emptyMap)
        expect(r).not.toBeNull()
        expect(r!.index).toBe(3) // page order fallback since 1001 not in empty map
    })

    it('preserves all other fields when the canonical resolution succeeds', () => {
        const r = mapServiceRow(
            { lead_id: '1088', name: 'Conroe Diner', score: 0.85, category: 'Food', public_note: 'Good eats' } as never,
            0,
            canonicalMap
        )
        expect(r).not.toBeNull()
        expect(r!.index).toBe(2) // corpus index
        expect(r!.name).toBe('Conroe Diner')
        // F-search-8 normalization: raw 0.85 -> Math.min(1, 0.85/100) = 0.0085.
        expect(r!.score).toBe(0.0085)
        expect(r!.category).toBe('Food')
        expect(r!.snippet).toBe('Good eats')
        expect(r!.point?.lead_id).toBe('1088')
        expect(r!.point?.name).toBe('Conroe Diner')
    })

    it('returns null for rows with neither name nor lead_id (unchanged behavior)', () => {
        expect(mapServiceRow(null as never, 0, canonicalMap)).toBeNull()
        expect(mapServiceRow({} as never, 0, canonicalMap)).toBeNull()
        expect(mapServiceRow({ score: 0.5 } as never, 0, canonicalMap)).toBeNull()
    })
})
