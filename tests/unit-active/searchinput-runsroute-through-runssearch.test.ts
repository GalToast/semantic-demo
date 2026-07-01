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

function readSearchInput(): string {
    const p = resolve(__dirname, '../../src/components/SearchInput.svelte')
    return readFileSync(p, 'utf-8')
}

describe('PR-O5: SearchInput routes through runSearch', () => {
    it('imports runSearch from @lib/stores/search.svelte', () => {
        const src = readSearchInput()
        expect(src).toMatch(/import\s*\{[^}]*runSearch[^}]*\}\s*from\s*['"]@lib\/stores\/search\.svelte['"]/)
    })

    it('does NOT import performSearch from @lib/search-engine', () => {
        const src = readSearchInput()
        // The performSearch direct import was removed in PR-O5
        expect(src).not.toMatch(/import\s*\{[^}]*performSearch[^}]*\}\s*from\s*['"]@lib\/search-engine['"]/)
    })

    it('does NOT call performSearch() directly in dispatchSearch', () => {
        const src = readSearchInput()
        // Extract the dispatchSearch function body
        const body = src.slice(
            src.indexOf('function dispatchSearch'),
            src.indexOf('function debounceDispatch')
        )
        expect(body).not.toMatch(/performSearch\s*\(/)
        expect(body).toMatch(/runSearch\s*\(/)
    })

    it('does NOT call setSearchResults or setSearchError directly', () => {
        // runSearch handles those — SearchInput should defer to it
        const src = readSearchInput()
        expect(src).not.toMatch(/setSearchResults\s*\(/)
        expect(src).not.toMatch(/setSearchError\s*\(/)
    })

    it('preserves the dispatchNavTransition to search surface (SearchInput-only)', () => {
        // This is the one side effect runSearch does NOT do — only
        // SearchInput knows to flip the nav surface when the user types
        const src = readSearchInput()
        const body = src.slice(
            src.indexOf('function dispatchSearch'),
            src.indexOf('function debounceDispatch')
        )
        expect(body).toMatch(/dispatchNavTransition\(NAV_TRANSITION_ACTIONS\.SET_SURFACE,\s*\{\s*surface:\s*['"]search['"]\s*\}\)/)
        expect(body).toMatch(/surfaceSwitchedToSearch\s*=\s*true/)
    })

    it('still sets status to searching before runSearch (immediate UI feedback)', () => {
        // runSearch also sets status, but SearchInput's pre-set gives
        // the UI immediate feedback before the await microtask fires
        const src = readSearchInput()
        const body = src.slice(
            src.indexOf('function dispatchSearch'),
            src.indexOf('function debounceDispatch')
        )
        expect(body).toMatch(/setSearchStatus\(['"]searching['"]\)/)
    })
});
