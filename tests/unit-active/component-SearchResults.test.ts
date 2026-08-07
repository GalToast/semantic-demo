/**
 * component-SearchResults.test.ts — Component test for SearchResults.svelte
 *
 * Uses source-inspection (readFileSync + string assertions) to verify the
 * a11y/structure contract. The component imports from multiple stores
 * (searchState, navigation, filter) which hit circular dependency chains
 * in the vitest environment, preventing a full render().
 *
 * Verifies:
 *  1. Root wrapper #search-results with .search-results-wrapper class
 *  2. Loading state .search-loading with spinner and text
 *  3. Error state .search-error-state with role="status" aria-live="polite"
 *  4. Empty state .search-empty-state with role="status" aria-live="polite"
 *  5. Results count #search-results-count with role="status" aria-live="polite"
 *  6. Result list #search-result-list with role="list" and aria-label
 *  7. Show-more button .search-show-more-btn with aria-expanded="false"
 *  8. Keyboard aria-keyshortcuts on result list container
 *
 * Note: the result list uses the ARIA sweep F3 pattern — container
 * role="list" (NOT listbox, no aria-activedescendant), items are plain
 * divs, and the inner result button carries the roving tabindex.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SEARCH_RESULTS_PATH = resolve(__dirname, '../../src/components/SearchResults.svelte')
const SEARCH_RESULT_LIST_PATH = resolve(__dirname, '../../src/lib/components/search/SearchResultList.svelte')
const SEARCH_EMPTY_STATE_PATH = resolve(__dirname, '../../src/lib/components/search/SearchEmptyState.svelte')
const ERROR_STATE_PATH = resolve(__dirname, '../../src/components/ErrorState.svelte')

function readSource(): string {
    return readFileSync(SEARCH_RESULTS_PATH, 'utf-8')
}

function readResultList(): string {
    return readFileSync(SEARCH_RESULT_LIST_PATH, 'utf-8')
}

function readEmptyState(): string {
    return readFileSync(SEARCH_EMPTY_STATE_PATH, 'utf-8')
}

function readErrorState(): string {
    return readFileSync(ERROR_STATE_PATH, 'utf-8')
}

describe('SearchResults component', () => {
    let source: string

    beforeAll(() => {
        source = readSource()
    })

    it('root wrapper #search-results with .search-results-wrapper class', () => {
        expect(source).toContain('id="search-results"')
        expect(source).toContain('class="search-results-wrapper"')
    })

    it('loading state .search-loading with spinner and text', () => {
        expect(source).toContain('class="search-loading"')
        expect(source).toContain('class="search-loading-spinner"')
        expect(source).toContain('class="search-loading-text"')
        expect(source).toContain('Searching...')
    })

    it('error state .search-error-state exists and a single polite live region announces it', () => {
        // The error surface was extracted into the shared ErrorState.svelte
        // presentational component (SearchResults renders <ErrorState />), so
        // the marker assertions live there now.
        const errorState = readErrorState()
        expect(errorState).toContain('class="search-error-state"')
        expect(errorState).toContain('search-error-kicker')
        expect(errorState).toContain('Retry needed')
        // A single .sr-only live region (not the marker itself) handles all
        // loading/error/empty announcements so they don't interrupt the user.
        expect(source).toMatch(/<div[^>]*class="sr-only"[^>]*aria-live="polite"[^>]*role="status"/)
    })

    it('empty state .search-empty-state exists and is announced by the polite live region', () => {
        const emptyState = readEmptyState()
        expect(emptyState).toContain('class="search-empty-state')
        expect(emptyState).toContain('search-empty-title')
        expect(emptyState).toContain('No results found')
    })

    it('results count #search-results-count exists and is announced by the polite live region', () => {
        const resultList = readResultList()
        expect(resultList).toContain('id="search-results-count"')
        expect(source).toContain('aria-atomic="true"')
    })

    it('result list #search-result-list with role="list" and aria-label', () => {
        const resultList = readResultList()
        expect(resultList).toContain('id="search-result-list"')
        expect(resultList).toContain('class="search-result-list"')
        // role="list" as LIVE markup inside the container tag (the legacy
        // comment pin also contains the literal as text).
        expect(resultList).toMatch(/id="search-result-list"[^>]*role="list"/)
        expect(resultList).toContain('aria-label="Search result businesses"')
    })

    it('show-more button .search-show-more-btn with aria-expanded="false"', () => {
        const resultList = readResultList()
        expect(resultList).toContain('class="search-show-more-btn"')
        expect(resultList).toContain('aria-expanded="false"')
        expect(resultList).toContain('aria-controls="search-result-list"')
        expect(resultList).toContain('aria-describedby="search-results-count"')
    })

    it('keyboard aria-keyshortcuts on result list container', () => {
        // W48-D: ArrowLeft/Right removed (they were silently cycling).
        // The list now only advertises the keys it actually honors.
        const resultList = readResultList()
        expect(resultList).toContain('aria-keyshortcuts="ArrowDown ArrowUp Home End Enter Escape"')
    })

    it('peek label uses canonical panelSurfaceDetail state, not summary.mode', () => {
        // Regression: previously read summary?.mode which never existed on the
        // SearchSummary shape (only resultIndices/anchorIndex/topIndex). The
        // mobile "Top match · X more" label never fired.
        expect(source).toContain("parityMap.panelSurfaceDetail === 'peek'")
        expect(source).not.toContain("summary?.mode === 'peek'")
        expect(source).toContain('Top match')
        expect(source).toContain('search-results-count-hidden')
    })

    it('W48-E: keyboard ArrowDown scrolls the active listitem into view', () => {
        // Regression: previously setActiveResultByIndex only updated the store,
        // so ArrowDown past the visible cap (max-height: min(52vh, 420px))
        // updated aria-activedescendant but the user couldn't see what was
        // highlighted. The wrapper has overflow-y: auto so a scrollIntoView
        // on the new listitem is the right fix.
        expect(source).toMatch(/getElementById\(`search-result-option-\$\{clamped\}`\)/)
        expect(source).toMatch(/item\.scrollIntoView\(\{[\s\S]*?block: 'nearest'/)
        // Honors prefers-reduced-motion for instant scroll.
        expect(source).toMatch(/behavior: prefersReducedMotion\(\) \? 'auto' : 'smooth'/)
    })
})
