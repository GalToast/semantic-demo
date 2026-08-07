/**
 * @vitest-environment node
 *
 * result-renderer.ts pure-function contract tests — Phase 7c (2026-06-26)
 *
 * Tests the pure (no DOM, no appState) exported helpers from
 * src/lib/search/result-renderer.ts (~440 LOC). These helpers produce
 * stable string/number output used by results-ui.ts to render search
 * results. The DOM-mutating functions (revealActiveSearchResultOnCompact,
 * setActiveSearchResultRow, refreshSearchResultHierarchy) and the
 * state-dependent buildSearchStageLabel are intentionally NOT covered here.
 *
 * Covered:
 *   - renderResultCountLine (count display string)
 *   - getSearchResultStrength (score → percentage)
 *   - getSearchResultStrengthLabel (order + strength → label)
 *   - getSearchResultCardClasses (order + anchor → class string)
 *   - buildSearchResultSnippet (result → display snippet)
 *   - buildSearchRankLabel (rank params → label)
 */
import { describe, it, expect } from 'vitest'
import {
    renderResultCountLine,
    getSearchResultStrength,
    getSearchResultStrengthLabel,
    getSearchResultCardClasses,
    buildSearchResultSnippet,
    buildSearchRankLabel
} from '@lib/search/result-renderer'

// ── Minimal SearchResult factory ──────────────────────────────────────────

interface SearchResultPoint {
    name?: string
    what?: string
    city?: string
    cluster?: number
    [key: string]: unknown
}

interface SearchResult {
    point: SearchResultPoint
    index: number
    score: number
    publicNote?: string
    publicDetail?: string
    [key: string]: unknown
}

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
    return {
        point: { name: 'Test Business', what: 'Coffee Shop', city: 'Rockville' },
        index: 0,
        score: 85,
        ...overrides
    }
}

// ── renderResultCountLine ────────────────────────────────────────────────

describe('renderResultCountLine', () => {
    it('returns empty string when total is 0', () => {
        expect(renderResultCountLine(0, 0)).toBe('')
        expect(renderResultCountLine(0, 5)).toBe('')
    })

    it('returns "1 anchor" for a single result (default mode)', () => {
        expect(renderResultCountLine(1, 1)).toBe('1 anchor')
        expect(renderResultCountLine(1, 0)).toBe('1 anchor')
    })

    it('returns "All N matches" when all results are visible', () => {
        expect(renderResultCountLine(5, 5)).toBe('All 5 matches')
        expect(renderResultCountLine(10, 10)).toBe('All 10 matches')
    })

    it('returns "All N matches" when visible exceeds total (clamped)', () => {
        expect(renderResultCountLine(5, 8)).toBe('All 5 matches')
    })

    it('returns "X of N · Y behind" when some results are hidden', () => {
        expect(renderResultCountLine(10, 5)).toBe('5 of 10 · 5 behind')
        expect(renderResultCountLine(8, 3)).toBe('3 of 8 · 5 behind')
    })

    it('returns "Anchor · N more" in peek mode', () => {
        expect(renderResultCountLine(5, 1, 'peek')).toBe('Anchor · 4 more')
        expect(renderResultCountLine(3, 0, 'peek')).toBe('Anchor · 3 more')
    })

    it('returns "1 anchor" even in peek mode for single result', () => {
        expect(renderResultCountLine(1, 1, 'peek')).toBe('1 anchor')
    })

    it('handles currentVisibleCount=0 in initial mode', () => {
        expect(renderResultCountLine(5, 0)).toBe('0 of 5 · 5 behind')
    })

    it('handles large totals', () => {
        expect(renderResultCountLine(1000, 500)).toBe('500 of 1000 · 500 behind')
    })
})

// ── getSearchResultStrength ──────────────────────────────────────────────

describe('getSearchResultStrength', () => {
    it('returns 14 for null result', () => {
        expect(getSearchResultStrength(null, 100)).toBe(14)
    })

    it('returns 14 when topScore is 0', () => {
        expect(getSearchResultStrength(makeResult({ score: 50 }), 0)).toBe(14)
    })

    it('returns 14 when topScore is negative', () => {
        expect(getSearchResultStrength(makeResult({ score: 50 }), -10)).toBe(14)
    })

    it('returns 14 when topScore is NaN', () => {
        expect(getSearchResultStrength(makeResult({ score: 50 }), NaN)).toBe(14)
    })

    it('returns 14 when topScore is Infinity', () => {
        expect(getSearchResultStrength(makeResult({ score: 50 }), Infinity)).toBe(14)
    })

    it('returns 14 when result score is NaN', () => {
        expect(getSearchResultStrength(makeResult({ score: NaN }), 100)).toBe(14)
    })

    it('returns 100 when result score equals topScore', () => {
        expect(getSearchResultStrength(makeResult({ score: 100 }), 100)).toBe(100)
    })

    it('returns 50 when result score is half of topScore', () => {
        expect(getSearchResultStrength(makeResult({ score: 50 }), 100)).toBe(50)
    })

    it('returns 14 (floor) when result score is very low relative to top', () => {
        expect(getSearchResultStrength(makeResult({ score: 1 }), 1000)).toBe(14)
    })

    it('rounds to nearest integer', () => {
        expect(getSearchResultStrength(makeResult({ score: 67 }), 100)).toBe(67)
        expect(getSearchResultStrength(makeResult({ score: 33 }), 100)).toBe(33)
    })
})

// ── getSearchResultStrengthLabel ─────────────────────────────────────────

describe('getSearchResultStrengthLabel', () => {
    it('returns "Best match" for order 0 regardless of strength', () => {
        expect(getSearchResultStrengthLabel(0, 14)).toBe('Best match')
        expect(getSearchResultStrengthLabel(0, 50)).toBe('Best match')
        expect(getSearchResultStrengthLabel(0, 100)).toBe('Best match')
    })

    it('returns "Strong match" for strength >= 90 (and order > 0)', () => {
        expect(getSearchResultStrengthLabel(1, 90)).toBe('Strong match')
        expect(getSearchResultStrengthLabel(2, 100)).toBe('Strong match')
    })

    it('returns "Good match" for strength 75-89', () => {
        expect(getSearchResultStrengthLabel(1, 75)).toBe('Good match')
        expect(getSearchResultStrengthLabel(1, 89)).toBe('Good match')
    })

    it('returns "Related" for strength 50-74', () => {
        expect(getSearchResultStrengthLabel(1, 50)).toBe('Related')
        expect(getSearchResultStrengthLabel(1, 74)).toBe('Related')
    })

    it('returns "Broader match" for strength < 50', () => {
        expect(getSearchResultStrengthLabel(1, 49)).toBe('Broader match')
        expect(getSearchResultStrengthLabel(1, 14)).toBe('Broader match')
        expect(getSearchResultStrengthLabel(1, 0)).toBe('Broader match')
    })

    it('uses 89 < 90 boundary correctly', () => {
        expect(getSearchResultStrengthLabel(1, 89)).not.toBe('Strong match')
    })
})

// ── getSearchResultCardClasses ──────────────────────────────────────────

describe('getSearchResultCardClasses', () => {
    it('always includes base "search-result-item"', () => {
        expect(getSearchResultCardClasses(0, false)).toContain('search-result-item')
        expect(getSearchResultCardClasses(5, false)).toContain('search-result-item')
    })

    it('adds "top-result" when order is 0', () => {
        expect(getSearchResultCardClasses(0, false)).toContain('top-result')
    })

    it('omits "top-result" when order is not 0', () => {
        expect(getSearchResultCardClasses(1, false)).not.toContain('top-result')
    })

    it('adds "is-anchor" when isAnchor=true', () => {
        expect(getSearchResultCardClasses(1, true)).toContain('is-anchor')
    })

    it('adds "is-secondary" when isAnchor=false', () => {
        expect(getSearchResultCardClasses(1, false)).toContain('is-secondary')
    })

    it('combines top-result + is-anchor when order=0 and isAnchor=true', () => {
        const classes = getSearchResultCardClasses(0, true)
        expect(classes).toContain('top-result')
        expect(classes).toContain('is-anchor')
        expect(classes).not.toContain('is-secondary')
    })
})

// ── buildSearchResultSnippet ────────────────────────────────────────────

describe('buildSearchResultSnippet', () => {
    it('returns generic snippet for null result (no point data)', () => {
        expect(buildSearchResultSnippet(null)).toBe('Montgomery County business.')
    })

    it('returns category-only snippet when no city', () => {
        const r = makeResult({ point: { name: 'X', what: 'Bakery', city: '' } })
        expect(buildSearchResultSnippet(r)).toBe('Bakery')
    })

    it('returns generic snippet when no category and no city', () => {
        const r = makeResult({ point: { name: 'X', what: '', city: '' } })
        expect(buildSearchResultSnippet(r)).toBe('Montgomery County business.')
    })

    it('returns generic snippet when category is "local business" placeholder', () => {
        const r = makeResult({ point: { name: 'X', what: 'local business', city: 'Rockville' } })
        expect(buildSearchResultSnippet(r)).toBe('Montgomery County business in Rockville.')
    })

    it('uses publicNote when present', () => {
        const r = makeResult({ publicNote: 'Hand-crafted espresso bar' })
        const result = buildSearchResultSnippet(r)
        expect(result).toContain('Hand-crafted')
    })

    it('falls back to publicDetail when publicNote is missing', () => {
        const r = makeResult({
            publicDetail: 'Family-owned since 1985',
            publicNote: undefined
        } as Partial<SearchResult>)
        const result = buildSearchResultSnippet(r)
        expect(result).toContain('Family-owned')
    })

    it('returns category snippet for "pending research" notes', () => {
        const r = makeResult({ publicNote: 'pending research.' })
        expect(buildSearchResultSnippet(r)).toBe('Coffee Shop in Rockville.')
    })

    it('returns category snippet for "no public" notes', () => {
        const r = makeResult({ publicNote: 'no public information available' })
        expect(buildSearchResultSnippet(r)).toBe('Coffee Shop in Rockville.')
    })

    it('handles official site confirms prefix', () => {
        const r = makeResult({ publicNote: 'Official site confirms this entity.' })
        const result = buildSearchResultSnippet(r)
        expect(result.toLowerCase()).toContain('official site confirms')
    })
})

// ── buildSearchRankLabel ────────────────────────────────────────────────

describe('buildSearchRankLabel', () => {
    it('returns "Match" when index is null', () => {
        expect(buildSearchRankLabel({ index: null, order: 0, topIndex: 0 })).toBe('Match')
        expect(buildSearchRankLabel({ index: undefined, order: 0, topIndex: 0 })).toBe('Match')
    })

    it('returns "Current stop" when index matches exploreIndex', () => {
        expect(buildSearchRankLabel({ index: 5, order: 1, topIndex: 0, exploreIndex: 5 })).toBe('Current stop')
    })

    it('returns "Original anchor" when index is anchor AND explore exists AND not same', () => {
        expect(buildSearchRankLabel({ index: 3, order: 1, topIndex: 0, anchorIndex: 3, exploreIndex: 5 })).toBe(
            'Original anchor'
        )
    })

    it('returns "Anchor" when index is anchor AND no explore', () => {
        expect(buildSearchRankLabel({ index: 3, order: 1, topIndex: 0, anchorIndex: 3 })).toBe('Anchor')
    })

    it('returns "Current stop" when index is anchor AND explore is same (explore check wins)', () => {
        expect(buildSearchRankLabel({ index: 3, order: 1, topIndex: 0, anchorIndex: 3, exploreIndex: 3 })).toBe(
            'Current stop'
        )
    })

    it('returns "Original top match" when index is top AND explore exists AND not same', () => {
        expect(buildSearchRankLabel({ index: 7, order: 1, topIndex: 7, exploreIndex: 5 })).toBe('Original top match')
    })

    it('returns "Top match" when index is top AND no explore', () => {
        expect(buildSearchRankLabel({ index: 7, order: 1, topIndex: 7 })).toBe('Top match')
    })

    it('returns "Current stop" when index is top AND explore is same (explore check wins)', () => {
        expect(buildSearchRankLabel({ index: 7, order: 1, topIndex: 7, exploreIndex: 7 })).toBe('Current stop')
    })

    it('returns "Top result" when order is 0 and not matching anchor/top', () => {
        expect(buildSearchRankLabel({ index: 99, order: 0, topIndex: 0 })).toBe('Top result')
    })

    it('returns "Result N+1" for non-zero order', () => {
        expect(buildSearchRankLabel({ index: 5, order: 2, topIndex: 0 })).toBe('Result 3')
        expect(buildSearchRankLabel({ index: 5, order: 5, topIndex: 0 })).toBe('Result 6')
    })
})

// (2026-08-07) The two former source-inspection asserts from this block
// regex-checked the typed 'no-cast' scheduling path in result-renderer.ts.
// That contract is now tested behaviorally in the jsdom sibling
// result-renderer-reveal-schedule.test.ts (real setTimeout ids registered on
// appState.compactSearchRevealTimers and resolved on tick via the actual
// scroll side effect). This file stays @vitest-environment node for its pure
// helpers only; module-level readFileSync machinery removed with the block.

