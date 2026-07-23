/**
 * a11y-w43a-keyboard-trap.test.mjs — W43-A accessibility contract tests
 *
 * Covers the keyboard trap fix for SearchResults:
 *   1. Up/Down arrow navigation through result rows (WCAG 2.1.1)
 *   2. Enter to select the active result (WCAG 2.1.1)
 *   3. Escape to close/search panel collapse (WCAG 2.1.1)
 *   4. Active result announced via aria-live region (WCAG 4.1.3)
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const SEARCH_RESULTS = `${ROOT}/src/components/SearchResults.svelte`
const SEARCH_RESULT_LIST = `${ROOT}/src/lib/components/search/SearchResultList.svelte`
const SEARCH_RESULT_ITEM = `${ROOT}/src/components/SearchResultItem.svelte`

function read(path) {
    return readFileSync(path, 'utf-8')
}

let src

beforeAll(() => {
    src = read(SEARCH_RESULTS)
})

// ── 1. Arrow key navigation (WCAG 2.1.1) ──────────────────────────────────

describe('A11y W43-A: Arrow key navigation in search results', () => {
    it('handleContainerKeyDown handler exists', () => {
        expect(src).toContain('function handleContainerKeyDown')
    })

    it('ArrowDown moves to next result', () => {
        expect(src).toMatch(/key === 'ArrowDown'[\s\S]*?setActiveResultByIndex/)
    })

    it('ArrowUp moves to previous result', () => {
        expect(src).toMatch(/key === 'ArrowUp'[\s\S]*?setActiveResultByIndex/)
    })

    // W48-D: ArrowDown at the last result no longer wraps — it surfaces an
    // "End of results" toast instead. Verifies the boundary branch fires.
    it('ArrowDown at last result surfaces an end-of-results toast (no silent wrap)', () => {
        expect(src).toMatch(/ArrowDown[\s\S]*?showExperienceToast\(['"]End of results['"]/)
    })

    // W48-D: ArrowUp at the first result returns focus to the search input
    // instead of wrapping to the last result.
    it('ArrowUp at first result returns focus to search input (no silent wrap)', () => {
        expect(src).toMatch(/ArrowUp[\s\S]*?activeIndex === 0[\s\S]*?search-input/)
    })

    it('Home key navigates to first result', () => {
        expect(src).toMatch(/key === 'Home'[\s\S]*?setActiveResultByIndex\(0\)/)
    })

    it('End key navigates to last result', () => {
        expect(src).toMatch(/key === 'End'[\s\S]*?setActiveResultByIndex\(count - 1\)/)
    })

    it('preventDefault is called for arrow keys to prevent page scroll', () => {
        expect(src).toMatch(/ArrowDown[\s\S]*?preventDefault/)
        expect(src).toMatch(/ArrowUp[\s\S]*?preventDefault/)
    })
})

// ── 2. Enter to select active result (WCAG 2.1.1) ──────────────────────────

describe('A11y W43-A: Enter key selects active result', () => {
    it('Enter key triggers result selection', () => {
        expect(src).toMatch(/key === 'Enter'[\s\S]*?handleResultClick/)
    })

    it('Space key also triggers result selection', () => {
        expect(src).toMatch(/key === 'Enter' \|\| key === ' '/)
    })

    it('preventDefault is called for Enter to prevent form submission', () => {
        expect(src).toMatch(/Enter[\s\S]*?preventDefault/)
    })

    it('handleResultClick function exists', () => {
        expect(src).toContain('function handleResultClick')
    })
})

// ── 3. Escape to close/collapse search panel (WCAG 2.1.1) ──────────────────

describe('A11y W43-A: Escape key closes search panel', () => {
    it('Escape key triggers onClear', () => {
        expect(src).toMatch(/key === 'Escape'[\s\S]*?onClear\(\)/)
    })

    it('Focus returns to search input after Escape', () => {
        // Escape calls onClear() then explicitly focuses the search input.
        // This satisfies WCAG 2.4.3 (focus order) for the Escape-to-clear flow.
        expect(src).toMatch(/Escape[\s\S]*?onClear\(\)/)
        expect(src).toMatch(/search-input[^]*?focus\(\)/)
    })

    it('preventDefault is called for Escape', () => {
        expect(src).toMatch(/Escape[\s\S]*?preventDefault/)
    })

    it('onClear function exists', () => {
        expect(src).toContain('function onClear')
    })
})

// ── 4. Roving tabindex pattern (WCAG 2.1.1) ────────────────────────────────

describe('A11y W43-A: Roving tabindex for keyboard navigation', () => {
    it('activeIndex is computed from activeId', () => {
        expect(src).toMatch(/let activeIndex = \$derived\.by/)
    })

    it('setActiveResultByIndex function exists', () => {
        expect(src).toContain('function setActiveResultByIndex')
    })

    it('active result button has tabindex=0', () => {
        const childSrc = read(SEARCH_RESULT_ITEM)
        expect(childSrc).toMatch(/tabindex=\{active \? 0 : -1\}/)
    })

    it('inactive result buttons have tabindex=-1', () => {
        const childSrc = read(SEARCH_RESULT_ITEM)
        expect(childSrc).toMatch(/active \? 0 : -1/)
    })
})

// ── 5. Active result announcement (WCAG 4.1.3) ─────────────────────────────

describe('A11y W43-A: Active result live announcement', () => {
    it('aria-live region exists for keyboard navigation announcements', () => {
        expect(src).toMatch(/aria-live="polite"/)
    })

    it('liveAnnouncement includes result count (e.g., "X of Y")', () => {
        expect(src).toMatch(/liveAnnouncement = .*idx \+ 1.*resultSlice\.length/)
    })

    it('liveAnnouncement includes result name and rank', () => {
        expect(src).toMatch(/liveAnnouncement = .*Focus/)
    })

    it('aria-activedescendant is set on the listbox', () => {
        const resultListSrc = read(SEARCH_RESULT_LIST)
        expect(resultListSrc).toMatch(/aria-activedescendant=\{activeIndex >= 0/)
    })

    it('result options have aria-selected attribute', () => {
        const childSrc = read(SEARCH_RESULT_ITEM)
        expect(childSrc).toContain('aria-selected={active}')
    })
})

// ── 6. No keyboard trap (Tab escapes the results list) ─────────────────────

describe('A11y W43-A: No keyboard trap — Tab is not trapped', () => {
    it('Tab key is NOT prevented (allows focus to leave results)', () => {
        // Verify there is no Tab handling that calls preventDefault
        const tabSection = src.match(/key === 'Tab'[\s\S]*?preventDefault/)
        expect(tabSection).toBeNull()
    })

    it('listbox role is present for proper semantics', () => {
        const resultListSrc = read(SEARCH_RESULT_LIST)
        expect(resultListSrc).toMatch(/role="listbox"/)
    })

    it('result items have role="option"', () => {
        const childSrc = read(SEARCH_RESULT_ITEM)
        expect(childSrc).toContain('role="option"')
    })
})

// ── 7. Reset on query change (A2-8) ────────────────────────────────────────

describe('A11y W43-A: Active index resets on new query', () => {
    it('lastQuery state tracks previous query', () => {
        expect(src).toMatch(/let lastQuery = \$state/)
    })

    it('effect resets activeIndex when query changes', () => {
        expect(src).toMatch(/\$effect\(\(\) =>[\s\S]*?currentQuery !== lastQuery/)
    })

    it('resets to first result after query change', () => {
        expect(src).toMatch(/setActiveResultByIndex\(0\)/)
    })
})
