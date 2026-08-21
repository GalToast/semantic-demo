// data-loader-guards.test.ts — loud-failure guards for the business-data asset.
// Regression context (2026-08-21 audit): src/data.dat is an untracked runtime
// asset; when it goes missing the app booted with points:0 SILENTLY (every
// consumer swallowed the empty state). These tests pin the loud guard.
import { describe, it, expect } from 'vitest'
import { assertRecordsNonEmpty } from '@lib/data-loader'

describe('assertRecordsNonEmpty (data.dat loud-failure guard)', () => {
    it('passes for a healthy record count', () => {
        expect(() => assertRecordsNonEmpty(8406)).not.toThrow()
    })

    it('throws with actionable copy on zero records', () => {
        expect(() => assertRecordsNonEmpty(0)).toThrow(/0 business records/)
        expect(() => assertRecordsNonEmpty(0)).toThrow(/src\/data\.dat/)
    })

    it('treats non-finite counts as empty', () => {
        expect(() => assertRecordsNonEmpty(Number.NaN)).toThrow(/0 business records/)
    })

    it('names the source in the message when provided', () => {
        expect(() => assertRecordsNonEmpty(0, 'data.dat?v=123')).toThrow(/data\.dat\?v=123/)
    })
})
