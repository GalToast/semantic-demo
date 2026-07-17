/**
 * search-back-affordance.test.ts
 *
 * Tests for Ticket UI-9: Visible back/escape affordance in search state.
 *
 * Per the M3 audit, search state had no visible way to return to
 * overview besides Esc. Added a small back button (←) in the search
 * input wrap that:
 * - Hides in idle (display: none)
 * - Shows in search state (display: inline-flex via body[data-panel-surface='search'])
 * - Clears the search query
 * - Sets data-panel-surface back to 'idle'
 *
 * Run: npx vitest run tests/unit-active/search-back-affordance.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// -- Helpers -----------------------------------------------------------------

function readSearchInput(): string {
    const srcPath = resolve(__dirname, '../../src/components/SearchInput.svelte')
    return readFileSync(srcPath, 'utf-8')
}

function readSearchDispatch(): string {
    const srcPath = resolve(__dirname, '../../src/lib/search/search-dispatch.ts')
    return readFileSync(srcPath, 'utf-8')
}

// -- Tests -------------------------------------------------------------------

describe('search-back-affordance (UI-9)', () => {
    let source: string
    let dispatchSource: string

    beforeEach(() => {
        source = readSearchInput()
        dispatchSource = readSearchDispatch()
    })

    describe('DOM structure', () => {
        it('renders a .search-back-btn button', () => {
            expect(source).toContain('class="search-back-btn"')
        })

        it('the button has aria-label="Back to overview"', () => {
            expect(source).toContain('aria-label="Back to overview"')
        })

        it('the button is inside .search-input-wrap', () => {
            // The button should appear between the opening .search-input-wrap div
            // and the search icon SVG
            const wrapIdx = source.indexOf('class="search-input-wrap"')
            const backBtnIdx = source.indexOf('class="search-back-btn"')
            const searchIconIdx = source.indexOf('class="search-icon"')
            expect(wrapIdx).toBeGreaterThan(-1)
            expect(backBtnIdx).toBeGreaterThan(wrapIdx)
            expect(searchIconIdx).toBeGreaterThan(backBtnIdx)
        })

        it('the button uses an SVG left-arrow icon', () => {
            expect(source).toContain('M19 12H5M12 5l-7 7 7 7')
        })

        it('the button has type="button" to prevent form submission', () => {
            expect(source).toContain('type="button"')
        })

        it('the button has tabindex="0" for keyboard accessibility', () => {
            expect(source).toContain('tabindex="0"')
        })
    })

    describe('click handler', () => {
        it('the button onclick calls handleClear', () => {
            expect(source).toContain('onclick={handleClear}')
        })

        it('handleClear delegates to the search dispatch controller', () => {
            expect(source).toContain('function handleClear')
            expect(source).toContain('dispatch.clear()')
        })

        it('SearchDispatch.clear returns to overview via RETURN_OVERVIEW', () => {
            expect(dispatchSource).toContain('RETURN_OVERVIEW')
        })

        it('SearchDispatch short-query path dispatches SET_SURFACE to idle', () => {
            expect(dispatchSource).toContain("surface: 'idle'")
        })
    })

    describe('CSS visibility', () => {
        it('the back button has display: none by default (hidden in idle)', () => {
            // Find the .search-back-btn style block and verify display: none
            const backBtnStyleMatch = source.match(/\.search-back-btn\s*\{[^}]*display:\s*none/)
            expect(backBtnStyleMatch).not.toBeNull()
        })

        it('the back button shows in search state via .search-active class', () => {
            // Phase 3 migration: body attribute CSS replaced with reactive class
            expect(source).toContain('.search-active .search-back-btn')
            expect(source).toContain('display: inline-flex')
        })

        it('does not use :global() body selector (migration complete)', () => {
            expect(source).not.toContain(':global(body[data-panel-surface')
        })
    })

    describe('state machine integration', () => {
        it('imports the SearchDispatch controller', () => {
            // Wave 2 search-layer cleanup: SearchInput delegates nav transitions
            // to the search-dispatch controller instead of importing them directly.
            expect(source).toContain("import { SearchDispatch } from '@lib/search/search-dispatch'")
            expect(source).toContain('new SearchDispatch')
            expect(source).toContain('dispatch.clear()')
        })

        it('SearchDispatch imports dispatchNavTransition for surface switching', () => {
            expect(dispatchSource).toMatch(/from\s+['"]@lib\/stores\/navigation\.svelte\.ts['"]/)
            expect(dispatchSource).toContain('dispatchNavTransition')
            expect(dispatchSource).toContain('NAV_TRANSITION_ACTIONS')
        })
    })
})
