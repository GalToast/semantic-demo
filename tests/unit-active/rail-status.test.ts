// rail-status.test.ts — truth-table coverage for the banner split.
import { test, expect } from 'vitest'
import { railBanner } from '@lib/rail/rail-status'

test('live: api up + rail up + not degraded', () => {
    expect(railBanner('api', true, false)).toEqual({ key: 'live', copy: 'Live search' })
})

test('fallback: api up + rail down (explicit probe false)', () => {
    expect(railBanner('api', false, null)).toEqual({
        key: 'fallback',
        copy: 'Live records · semantic lane warming (lexical fallback)'
    })
})

test('fallback: api up + degraded response flag', () => {
    expect(railBanner('api', true, true)).toMatchObject({ key: 'fallback' })
})

test('demo: engine fell back to local index/mock', () => {
    expect(railBanner('fallback', null, null)).toEqual({
        key: 'demo',
        copy: 'Local data — live feed unavailable'
    })
})

test('live default when rail unknown but api live and not degraded', () => {
    expect(railBanner('api', null, null)).toEqual({ key: 'live', copy: 'Live search' })
})

test('fallback: api up + rail down + degraded both signals', () => {
    expect(railBanner('api', false, true)).toMatchObject({ key: 'fallback' })
})

test('demo: api fallback dominates even when rail reports healthy', () => {
    expect(railBanner('fallback', true, null)).toEqual({
        key: 'demo',
        copy: 'Local data — live feed unavailable'
    })
})

test('fallback: api up + rail unknown + degraded flag', () => {
    expect(railBanner('api', null, true)).toMatchObject({ key: 'fallback' })
})

test('demo: api fallback + rail down + degraded', () => {
    expect(railBanner('fallback', false, true)).toEqual({
        key: 'demo',
        copy: 'Local data — live feed unavailable'
    })
})

// data-freshness truth (2026-08-18, product-audit #1): the data-age pill.
import { describe, it } from 'vitest'
import { dataFreshness } from '@lib/rail/rail-status'

describe('dataFreshness', () => {
    it('old graph gets a dated snapshot label', () => {
        const r = dataFreshness({ generated_at: '2026-06-04T13:39:13Z', rows: 8406 })
        if (!r.ageDays) throw new Error('expected age')
        if (!r.label.includes('2026-06-04') || !r.label.includes('8406')) throw new Error(r.label)
    })
    it('recent graph reads as "as of"', () => {
        const r = dataFreshness({ generated_at: new Date().toISOString() })
        if (r.ageDays !== 0) throw new Error('expected fresh')
    })
    it('missing stamp is honest, not fake-fresh', () => {
        const r = dataFreshness({})
        expect(r.ageDays).toBeNull()
        if (!r.label.includes('unknown')) throw new Error(r.label)
    })
})
