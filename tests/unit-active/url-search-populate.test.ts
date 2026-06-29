/**
 * url-search-populate.test.ts — Verify the URL ?q= query populates the search input
 *
 * UI-7: When the URL has `?q=foo`, the SearchInput.svelte input should show `foo`
 * on mount, and the search should dispatch automatically.
 *
 * Two paths are tested:
 *  1. SearchInput.svelte has an onMount block that reads `?q=` and populates the input
 *  2. url-state.ts has _restoreSearchFromParams that calls runSearch when ?q= is present
 *
 * Both paths must exist; one is a defensive backstop for the other.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SEARCH_INPUT_PATH = resolve(__dirname, '../../src/components/SearchInput.svelte')
const URL_STATE_PATH = resolve(__dirname, '../../src/lib/orchestration/url-state.ts')

function readSource(path: string): string {
    return readFileSync(path, 'utf-8')
}

describe('URL ?q= populates SearchInput (UI-7)', () => {
    describe('SearchInput.svelte onMount path', () => {
        let source: string

        beforeAll(() => {
            source = readSource(SEARCH_INPUT_PATH)
        })

        it('has an onMount block that reads the URL ?q= param', () => {
            // The onMount must import onMount
            expect(source).toMatch(/import\s+\{[^}]*\bonMount\b[^}]*\}\s+from\s+['"]svelte['"]/)
            // The onMount must read window.location.search for ?q=
            expect(source).toMatch(
                /onMount\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?URLSearchParams\([\s\S]*?window\.location\.search[\s\S]*?\.get\(['"]q['"]\)/
            )
        })

        it('onMount sets the local queryInput state from the URL q param', () => {
            // The onMount must assign to queryInput so the input value reflects the URL
            const onMountMatch = source.match(/onMount\s*\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*\)\s*;/)
            expect(onMountMatch).toBeTruthy()
            const onMountBody = onMountMatch?.[1] ?? ''
            expect(onMountBody).toMatch(/queryInput\s*=\s*query/)
        })

        it('onMount dispatches the search via setSearchQuery + dispatchSearch', () => {
            // The onMount must trigger the search store and dispatch the search action
            const onMountMatch = source.match(/onMount\s*\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*\)\s*;/)
            const onMountBody = onMountMatch?.[1] ?? ''
            expect(onMountBody).toMatch(/setSearchQuery\s*\(\s*query\s*\)/)
            expect(onMountBody).toMatch(/dispatchSearch\s*\(\s*query\s*\)/)
        })

        it('onMount guards against empty/short query strings', () => {
            // The onMount must not run for empty, missing, or sub-2-char queries
            const onMountMatch = source.match(/onMount\s*\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*\)\s*;/)
            const onMountBody = onMountMatch?.[1] ?? ''
            // Must have a guard that returns early
            expect(onMountBody).toMatch(/if\s*\(\s*!query\b/)
            // Must check query length is at least 2
            expect(onMountBody).toMatch(/query\.length\s*<\s*2/)
        })
    })

    describe('url-state.ts _restoreSearchFromParams path', () => {
        let source: string

        beforeAll(() => {
            source = readSource(URL_STATE_PATH)
        })

        it('imports runSearch from the search store', () => {
            expect(source).toMatch(/import\s+\{[^}]*\brunSearch\b[^}]*\}\s+from\s+['"]@lib\/stores\/search\.svelte['"]/)
        })

        it('defines _restoreSearchFromParams that calls runSearch', () => {
            // The helper must exist
            expect(source).toMatch(/async\s+function\s+_restoreSearchFromParams\s*\(/)
            // The helper must call runSearch with the query
            const helperMatch = source.match(
                /async\s+function\s+_restoreSearchFromParams\s*\([^)]*\)\s*:\s*Promise<void>\s*\{([\s\S]*?)\n\}/
            )
            expect(helperMatch).toBeTruthy()
            const helperBody = helperMatch?.[1] ?? ''
            expect(helperBody).toMatch(/await\s+runSearch\s*\(\s*query\s*,/)
        })

        it('applyUrlState routes ?q= through _restoreSearchFromParams', () => {
            // The applyUrlState function must call _restoreSearchFromParams for ?q= queries
            expect(source).toMatch(
                /if\s*\(\s*query\s*&&\s*query\.trim\(\)\.length\s*>=\s*2\s*\)\s*\{[\s\S]*?_restoreSearchFromParams\s*\(\s*query\s*,\s*anchorId\s*,[\s\S]*?\)/
            )
        })
    })

    describe('integration: both paths cooperate', () => {
        it('SearchInput.svelte uses value={queryInput} for the input binding', () => {
            const source = readSource(SEARCH_INPUT_PATH)
            // The input must be bound to queryInput via value= so URL populate shows up
            expect(source).toMatch(/<input[^>]*id="search-input"[\s\S]*?value=\{queryInput\}/)
        })

        it('SearchInput.svelte has a $effect that syncs searchState.query → queryInput', () => {
            const source = readSource(SEARCH_INPUT_PATH)
            // The $effect must update queryInput from $searchState.query
            // so changes from url-state.ts runSearch propagate into the input
            expect(source).toMatch(
                /\$effect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?\$searchState\.query[\s\S]*?queryInput\s*=/
            )
        })
    })
})
