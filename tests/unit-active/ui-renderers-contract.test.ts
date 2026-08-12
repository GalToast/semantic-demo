/**
 * tests/unit-active/ui-renderers-contract.test.ts
 *
 * Contract tests for src/lib/ui/renderers.ts — pure helpers with one
 * appState runtime dependency mocked out.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rejectsTrivia, TRIVIA_BLOCKLIST, getInterestingBusinessNote, buildSelectedMatchNarrative } from '@lib/ui/renderers'
import type { BusinessRecord } from '@lib/types/business'

// ── Minimal appState mock (renderers.ts only reads leadEnrichment and
//    searchState.currentSearchSummary) ────────────────────────────────────────

const mockState = vi.hoisted(() => ({
    leadEnrichment: null as Record<string, Record<string, unknown>> | null,
    searchState: {
        currentSearchSummary: null as { reason?: string } | null
    }
}))

vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: {
        get leadEnrichment() {
            return mockState.leadEnrichment
        },
        set leadEnrichment(v) {
            mockState.leadEnrichment = v
        },
        get searchState() {
            return mockState.searchState
        }
    }
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(partial: Partial<BusinessRecord> & { lead_id: string }): BusinessRecord {
    return {
        id: '1',
        lead_id: partial.lead_id,
        name: 'Test Business',
        what: 'Testing',
        public_note: '',
        public_detail: '',
        status: 'active',
        category: 'test',
        cluster: 0,
        city: 'Test City',
        zip: '00000',
        website: null,
        email: null,
        phone: null,
        trivia: null,
        lat: null,
        lng: null,
        geocoded: false,
        ...partial
    } as BusinessRecord
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('rejectsTrivia', () => {
    it('rejects empty string', () => {
        expect(rejectsTrivia('')).toBe(true)
    })

    it('accepts genuine business text', () => {
        expect(rejectsTrivia('A genuine business description with actual meaningful content.')).toBe(false)
    })

    it('rejects exact-match blocklist entries', () => {
        expect(rejectsTrivia('Pending research.')).toBe(true)
    })

    it('rejects equals-match blocklist entries', () => {
        expect(rejectsTrivia('Has both email and phone.')).toBe(true)
    })

    it('rejects short strings below minLength', () => {
        expect(rejectsTrivia('Too short')).toBe(true)
    })

    it('rejects prefix matches', () => {
        expect(rejectsTrivia('no verifiable contacts found')).toBe(true)
    })

    it('rejects substring matches', () => {
        expect(rejectsTrivia('This contains FMCSA carrier lookup data.')).toBe(true)
    })
})

describe('TRIVIA_BLOCKLIST', () => {
    it('is a frozen object with frozen nested arrays', () => {
        expect(Object.isFrozen(TRIVIA_BLOCKLIST)).toBe(true)
        expect(Object.isFrozen(TRIVIA_BLOCKLIST.exact)).toBe(true)
        expect(Object.isFrozen(TRIVIA_BLOCKLIST.equals)).toBe(true)
        expect(Object.isFrozen(TRIVIA_BLOCKLIST.prefixes)).toBe(true)
        expect(Object.isFrozen(TRIVIA_BLOCKLIST.substrings)).toBe(true)
    })

    it('has minLength 20', () => {
        expect(TRIVIA_BLOCKLIST.minLength).toBe(20)
    })
})

describe('getInterestingBusinessNote', () => {
    beforeEach(() => {
        mockState.leadEnrichment = null
        mockState.searchState.currentSearchSummary = null
    })

    it('returns null for null point', () => {
        expect(getInterestingBusinessNote(null)).toBeNull()
    })

    it('prefers enrichment snapshot over database trivia', () => {
        mockState.leadEnrichment = {
            '42': {
                snapshot: 'Real business summary from snapshot.',
                business_overview_extended: '',
                business_overview: '',
                observations: ''
            }
        }
        const point = makeRecord({ lead_id: '42', trivia: 'Pending research.' })
        expect(getInterestingBusinessNote(point)).toBe('Real business summary from snapshot.')
    })

    it('falls back to enrichment business_overview_extended', () => {
        mockState.leadEnrichment = {
            '42': {
                snapshot: '',
                business_overview_extended: 'Extended overview text here.',
                business_overview: '',
                observations: ''
            }
        }
        const point = makeRecord({ lead_id: '42' })
        expect(getInterestingBusinessNote(point)).toBe('Extended overview text here.')
    })

    it('falls back to enrichment business_overview when snapshot and extended are empty', () => {
        mockState.leadEnrichment = {
            '42': {
                snapshot: '',
                business_overview_extended: '',
                business_overview: 'Basic overview text here.',
                observations: ''
            }
        }
        const point = makeRecord({ lead_id: '42' })
        expect(getInterestingBusinessNote(point)).toBe('Basic overview text here.')
    })

    it('returns null when enrichment exists but all candidates are trivia', () => {
        mockState.leadEnrichment = {
            '42': {
                snapshot: 'Pending research.',
                business_overview_extended: 'no data available',
                business_overview: '',
                observations: ''
            }
        }
        const point = makeRecord({ lead_id: '42', trivia: null })
        expect(getInterestingBusinessNote(point)).toBeNull()
    })

    it('returns enrichment even when point has rejected trivia', () => {
        mockState.leadEnrichment = {
            '42': {
                snapshot: 'Real enrichment text here.',
                business_overview_extended: '',
                business_overview: '',
                observations: ''
            }
        }
        const point = makeRecord({ lead_id: '42', trivia: 'Pending research.' })
        expect(getInterestingBusinessNote(point)).toBe('Real enrichment text here.')
    })

    it('returns trivia field when no enrichment and trivia is not rejected', () => {
        mockState.leadEnrichment = null
        const point = makeRecord({ lead_id: '1', trivia: 'Actual business trivia content here.' })
        expect(getInterestingBusinessNote(point)).toBe('Actual business trivia content here.')
    })

    it('returns null when no enrichment and trivia is rejected', () => {
        mockState.leadEnrichment = null
        const point = makeRecord({ lead_id: '1', trivia: 'Pending research.' })
        expect(getInterestingBusinessNote(point)).toBeNull()
    })

    it('returns null when point has website but no email or phone and no enrichment or trivia', () => {
        mockState.leadEnrichment = null
        const point = makeRecord({
            lead_id: '1',
            website: 'https://example.com',
            email: null,
            phone: null
        })
        expect(getInterestingBusinessNote(point)).toBeNull()
    })

    it('returns null when point has both email and phone and no enrichment or trivia', () => {
        mockState.leadEnrichment = null
        const point = makeRecord({
            lead_id: '1',
            email: 'a@b.com',
            phone: '555-1234'
        })
        expect(getInterestingBusinessNote(point)).toBeNull()
    })

    it('skips enrichment when lead_id does not match and falls through to trivia', () => {
        mockState.leadEnrichment = {
            '99': {
                snapshot: 'Other business.',
                business_overview_extended: '',
                business_overview: '',
                observations: ''
            }
        }
        const point = makeRecord({ lead_id: '1', trivia: 'Actual business trivia content here.' })
        expect(getInterestingBusinessNote(point)).toBe('Actual business trivia content here.')
    })
})

describe('buildSelectedMatchNarrative', () => {
    beforeEach(() => {
        mockState.leadEnrichment = null
        mockState.searchState.currentSearchSummary = null
    })

    it('returns summary.reason when available', () => {
        mockState.searchState.currentSearchSummary = { reason: 'Matched via semantic query.' }
        const point = makeRecord({ lead_id: '1' })
        expect(buildSelectedMatchNarrative(point)).toBe('Matched via semantic query.')
    })

    it('returns empty string when no summary', () => {
        const point = makeRecord({ lead_id: '1' })
        expect(buildSelectedMatchNarrative(point)).toBe('')
    })

    it('returns empty string for null point', () => {
        expect(buildSelectedMatchNarrative(null)).toBe('')
    })

    it('does not throw when point is null and no summary', () => {
        expect(() => buildSelectedMatchNarrative(null)).not.toThrow()
    })

    it('returns empty string when summary exists but has no reason', () => {
        mockState.searchState.currentSearchSummary = { totalMatches: 1 }
        const point = makeRecord({ lead_id: '1' })
        expect(buildSelectedMatchNarrative(point)).toBe('')
    })
})
