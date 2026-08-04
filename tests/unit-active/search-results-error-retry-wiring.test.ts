/**
 * search-results-error-retry-wiring.test.ts
 *
 * Regression guard for BUG-6 (bugsweep ds4): the Svelte error-card Retry/Clear
 * buttons in SearchResults.svelte must actually re-run / clear the search, not
 * only publish EVENTS.SEARCH_CLEARED. Previously both handlers were inert —
 * the common typed-input error path renders this card via runSearch ->
 * setSearchError, so users were stuck on the error card. The fix wires:
 *   - onRetry -> clearSearchState() then search(query, { preferCachedResults: false })
 *     (same orchestration entry as the legacy DOM retry button, so the
 *     lease/sequence guards in search-abort.ts — BUG-3 fix — still apply).
 *   - onClear -> clearSearchState() then publish(EVENTS.SEARCH_CLEARED) (clears
 *     the store so the Svelte card actually dismisses, while preserving the
 *     existing downstream SEARCH_CLEARED notification).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SEARCH_RESULTS = resolve(import.meta.dirname, '../../src/components/SearchResults.svelte')

function readSource(): string {
    return readFileSync(SEARCH_RESULTS, 'utf-8')
}

describe('BUG-6: SearchResults error-card Retry/Clear wiring', () => {
    const src = readSource()

    // Slice each handler block out of the source so assertions are scoped to
    // that function — the file has several SEARCH_CLEARED mentions elsewhere.
    const onRetryMatch = src.match(/function onRetry\(\): void \{([\s\S]*?)\n  function onClear\(\): void \{/)
    const onClearMatch = src.match(/function onClear\(\): void \{([\s\S]*?)\n<\/script>/)

    it('exposes both onRetry and onClear function blocks', () => {
        expect(onRetryMatch).not.toBeNull()
        expect(onClearMatch).not.toBeNull()
    })

    describe('onRetry — must re-run the live search', () => {
        const onRetry = onRetryMatch?.[1] ?? ''

        it('imports SearchDispatch (the lease-protected dispatch entry)', () => {
            expect(src).toMatch(/import\s*\{\s*SearchDispatch\s*\}\s*from\s*'@lib\/search\/search-dispatch'/)
        })

        it('imports clearSearch as clearSearchState for dismissing the stale card', () => {
            expect(src).toMatch(/clearSearch as clearSearchState/)
        })

        it('instantiates a retryDispatch SearchDispatch at module scope', () => {
            expect(src).toMatch(/const\s+retryDispatch\s*=\s*new\s+SearchDispatch\(\)/)
        })

        it('clears the stale searchError/results, then dispatches via retryDispatch', () => {
            expect(onRetry).toContain('clearSearchState()')
            expect(onRetry).toMatch(/retryDispatch\.dispatchSearch\(\s*query\s*\)/)
        })

        it('clears BEFORE dispatching so the card flips to searching state first', () => {
            const clearIdx = onRetry.indexOf('clearSearchState()')
            const dispatchIdx = onRetry.indexOf('retryDispatch.dispatchSearch')
            expect(clearIdx).toBeGreaterThan(-1)
            expect(dispatchIdx).toBeGreaterThan(-1)
            expect(clearIdx).toBeLessThan(dispatchIdx)
        })

        it('retries the failed query (searchError.query, summary fallback)', () => {
            expect(onRetry).toMatch(/searchError\?\.query\s*\?\?\s*summary\?\.query/)
        })

        it('does NOT route through the legacy orchestration search() entry', () => {
            // Retry must go through runSearch -> setSearchError (Svelte card
            // consistency), NOT orchestration.search() whose catch applies the
            // legacy applySemanticSearchDegradedState DOM path.
            expect(onRetry).not.toMatch(/\bsearch\(\s*query,\s*\{\s*preferCachedResults/)
        })

        it('does NOT only publish SEARCH_CLEARED (the BUG-6 regression)', () => {
            // The buggy body was: if (summary?.query) { publish(EVENTS.SEARCH_CLEARED, { query: summary.query, ... }) }
            expect(onRetry).not.toMatch(/publish\(EVENTS\.SEARCH_CLEARED,\s*\{\s*query:\s*summary\.query/)
        })
    })

    describe('onClear — must actually clear the store, then notify', () => {
        const onClear = onClearMatch?.[1] ?? ''

        it('clears the store so the error card actually dismisses', () => {
            expect(onClear).toContain('clearSearchState()')
        })

        it('still publishes SEARCH_CLEARED so downstream subscribers (url-state, compass) react', () => {
            expect(onClear).toMatch(/publish\(EVENTS\.SEARCH_CLEARED\)/)
        })

        it('clears BEFORE publishing so subscribers observe cleared appState', () => {
            const clearIdx = onClear.indexOf('clearSearchState()')
            const publishIdx = onClear.indexOf('publish(EVENTS.SEARCH_CLEARED)')
            expect(clearIdx).toBeGreaterThan(-1)
            expect(publishIdx).toBeGreaterThan(-1)
            expect(clearIdx).toBeLessThan(publishIdx)
        })
    })
})
