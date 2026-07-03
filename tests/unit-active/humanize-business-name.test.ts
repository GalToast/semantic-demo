/**
 * humanize-business-name.test.ts — Unit tests for `humanizeBusinessName`
 *
 * Covers all three resolution paths (Legal name → slug fallback → 'Unknown')
 * plus the trimming + missing-input edge cases called out in the spec.
 */

import { describe, it, expect } from 'vitest'
import {
    humanizeBusinessName,
    parseLegalName,
    titleCaseSlug
} from '../../src/lib/business/humanize'

describe('humanizeBusinessName', () => {
    it('returns the Legal name from public_note, preserving ALL CAPS', () => {
        const out = humanizeBusinessName({
            public_note: 'Legal name: ANGEL FIRE COFFEE\n- Industry: X',
            name: '519-angel-fire-coffee'
        })
        expect(out).toBe('ANGEL FIRE COFFEE')
    })

    it('trims leading/trailing whitespace around the captured Legal name', () => {
        const out = humanizeBusinessName({
            public_note: '  Legal name:  ACME CORP  \n- Industry: Other',
            name: '900-acme-corp'
        })
        expect(out).toBe('ACME CORP')
    })

    it('falls back to slug Title-Case when public_note lacks "Legal name:" prefix', () => {
        const out = humanizeBusinessName({
            public_note: 'Industry: Coffee Distributor\nFounded: 2014',
            name: '519-angel-fire-coffee'
        })
        expect(out).toBe('519 Angel Fire Coffee')
    })

    it('falls back to slug Title-Case when public_note is empty', () => {
        const out = humanizeBusinessName({
            public_note: '',
            name: '519-angel-fire-coffee'
        })
        expect(out).toBe('519 Angel Fire Coffee')
    })

    it('Title-cases an all-lowercase slug without a lead_id prefix', () => {
        const out = humanizeBusinessName({
            public_note: '',
            name: 'angel-fire-coffee'
        })
        expect(out).toBe('Angel Fire Coffee')
    })

    it('returns "Unknown" when both public_note and name are empty', () => {
        const out = humanizeBusinessName({ public_note: '', name: '' })
        expect(out).toBe('Unknown')
    })

    it('treats undefined public_note as missing and uses slug fallback', () => {
        const out = humanizeBusinessName({
            // public_note intentionally absent
            name: '519-angel-fire-coffee'
        } as any)
        expect(out).toBe('519 Angel Fire Coffee')
    })
})

describe('parseLegalName', () => {
    it('returns null when public_note is missing or empty', () => {
        expect(parseLegalName(null)).toBeNull()
        expect(parseLegalName(undefined)).toBeNull()
        expect(parseLegalName('')).toBeNull()
    })

    it('returns null when no "Legal name:" prefix is present', () => {
        expect(parseLegalName('Industry: Coffee')).toBeNull()
    })

    it('returns the trimmed captured name when present', () => {
        expect(parseLegalName('Legal name: ACME CORP')).toBe('ACME CORP')
        expect(parseLegalName('Legal name:  spaced out  \n-x')).toBe('spaced out')
    })
})

describe('titleCaseSlug', () => {
    it('handles lead_id prefix correctly', () => {
        expect(titleCaseSlug('519-angel-fire-coffee')).toBe('519 Angel Fire Coffee')
    })

    it('handles single-word slugs', () => {
        expect(titleCaseSlug('acme')).toBe('Acme')
    })

    it('handles empty input', () => {
        expect(titleCaseSlug('')).toBe('')
    })

    it('preserves multi-digit lead_id prefixes', () => {
        expect(titleCaseSlug('12345-foo-bar-baz')).toBe('12345 Foo Bar Baz')
    })
})
