// rail-status.test.ts — truth-table coverage for the banner split.
import { test, expect } from 'vitest'
import { railBanner } from '@lib/rail/rail-status'

test('live: api up + rail up + not degraded', () => {
  expect(railBanner('api', true, false)).toEqual({ key: 'live', copy: 'Live search' })
})

test('fallback: api up + rail down (explicit probe false)', () => {
  expect(railBanner('api', false, null)).toEqual({
    key: 'fallback',
    copy: 'Live records · semantic lane warming (lexical fallback)',
  })
})

test('fallback: api up + degraded response flag', () => {
  expect(railBanner('api', true, true)).toMatchObject({ key: 'fallback' })
})

test('demo: engine fell back to local index/mock', () => {
  expect(railBanner('fallback', null, null)).toEqual({
    key: 'demo',
    copy: 'Demo data — live API unreachable',
  })
})

test('live default when rail unknown but api live and not degraded', () => {
  expect(railBanner('api', null, null)).toEqual({ key: 'live', copy: 'Live search' })
})