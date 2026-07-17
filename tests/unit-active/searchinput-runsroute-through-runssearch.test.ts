/**
 * search-input-runs-through-runsearch.test.ts
 *
 * PR-O5: SearchInput.dispatchSearch() now calls runSearch() (the URL
 * hydration gateway) instead of performSearch() directly. This unifies
 * the two entry points so that during `?q=X` URL hydration, the same
 * query no longer fires two separate performSearch invocations from
 * url-state and SearchInput's input handler.
 *
 * Run: npx vitest run tests/unit-active/search-input-runs-through-runsearch.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readSearchDispatch(): string {
    const p = resolve(__dirname, '../../src/lib/search/search-dispatch.ts')
    return readFileSync(p, 'utf-8')
}

function readSearchInput(): string {
    const p = resolve(__dirname, '../../src/components/SearchInput.svelte')
    return readFileSync(p, 'utf-8')
}

describe('PR-O5: SearchInput routes through runSearch', () => {
    it('search-dispatch imports runSearch from @lib/stores/search.svelte', () => {
        const src = readSearchDispatch()
        expect(src).toMatch(/import\s*\{[^}]*runSearch[^}]*\}\s*from\s*['"]@lib\/stores\/search\.svelte['"]/)
    })

    it('search-dispatch does NOT import performSearch from @lib/search-engine', () => {
        const src = readSearchDispatch()
        expect(src).not.toMatch(/import\s*\{[^}]*performSearch[^}]*\}\s*from\s*['"]@lib\/search-engine['"]/)
    })

    it('search-dispatch does NOT call performSearch() directly in dispatchSearch', () => {
        const src = readSearchDispatch()
        const body = src.slice(
            src.indexOf('dispatchSearch(query: string)'),
            src.indexOf('cancel(cancelledQuery: string)')
        )
        expect(body).not.toMatch(/performSearch\s*\(/)
        expect(body).toMatch(/runSearch\s*\(/)
    })

    it('search-dispatch does NOT call setSearchResults or setSearchError directly', () => {
        const src = readSearchDispatch()
        expect(src).not.toMatch(/setSearchResults\s*\(/)
        expect(src).not.toMatch(/setSearchError\s*\(/)
    })

    it('search-dispatch preserves the dispatchNavTransition to search surface', () => {
        const src = readSearchDispatch()
        const body = src.slice(
            src.indexOf('dispatchSearch(query: string)'),
            src.indexOf('cancel(cancelledQuery: string)')
        )
        expect(body).toMatch(
            /dispatchNavTransition\(NAV_TRANSITION_ACTIONS\.SET_SURFACE,\s*\{\s*surface:\s*['"]search['"]\s*\}\)/
        )
        expect(body).toMatch(/surfaceSwitchedToSearch\s*=\s*true/)
    })

    it('search-dispatch still sets status to searching before runSearch (immediate UI feedback)', () => {
        const src = readSearchDispatch()
        const body = src.slice(
            src.indexOf('dispatchSearch(query: string)'),
            src.indexOf('cancel(cancelledQuery: string)')
        )
        expect(body).toMatch(/setSearchStatus\(['"]searching['"]\)/)
    })

    it('handleInput skips redundant dispatch when input value matches the store query (defense-in-depth dedup)', () => {
        const src = readSearchInput()
        const handler = src.slice(src.indexOf('function handleInput'), src.indexOf('function handleClearQuery'))
        expect(handler).toMatch(/value\s*===\s*\(\$searchState\.query\s*\?\?\s*['"]['"]\)/)
        expect(handler).toMatch(/return;[\s\S]{0,50}\}/)
    })
})
