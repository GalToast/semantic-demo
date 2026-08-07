/**
 * @vitest-environment jsdom
 *
 * quickjump-search-shortcut.test.ts (CONVERTED 2026-08-07)
 *
 * P1 quick-jump behaviors — previously source-inspection (readFileSync regex
 * on global-shortcuts.ts asserting the '/' + Escape wiring exists). Those
 * structural asserts are replaced with REAL behaviors: this file drives
 * setupGlobalShortcuts() with dispatched window keydown events and asserts
 * the observable DOM/store effects.
 *
 * Covered:
 *  - '/' focuses #search-input from a neutral body focus (P1)
 *  - '/' does NOT steal focus when a form field is focused (isFormField guard)
 *  - Escape clears the search store query via setSearchQuery('')
 */
import { describe, it, expect, afterEach } from 'vitest'
import { setupGlobalShortcuts } from '@lib/keyboard/global-shortcuts'

let cleanup: (() => void) | null = null
let inputEl: HTMLInputElement | null = null

afterEach(() => {
    cleanup?.()
    cleanup = null
    inputEl?.remove()
    inputEl = null
})

function mount(): HTMLInputElement {
    inputEl = document.createElement('input')
    inputEl.id = 'search-input'
    document.body.appendChild(inputEl)
    cleanup = setupGlobalShortcuts({})
    return inputEl
}

function pressKeydown(key: string, init: KeyboardEventInit = {}): boolean {
    return window.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    )
}

describe('P1 quick-jump search shortcut — behavioral', () => {
    it('"/" focuses #search-input from a neutral body focus and calls preventDefault', () => {
        const input = mount()
        document.body.focus?.()
        const notCancelled = pressKeydown('/')
        expect(notCancelled).toBe(false) // preventDefault called → no literal '/'
        expect(document.activeElement).toBe(input)
    })

    it('"/" does not steal focus when an inner <input> is focused (isFormField guard)', () => {
        const input = mount()
        input.focus()
        pressKeydown('/')
        expect(document.activeElement).toBe(input) // unchanged — shortcut suppressed
    })

    it('Escape clears the search query via the store (setSearchQuery(""))', async () => {
        const { appState } = await import('@lib/state/app.svelte')
        if (!appState.searchState.currentSearchSummary) {
            appState.searchState.currentSearchSummary = {
                query: 'seed',
                totalMatches: 1,
                totalSemanticMatches: 1,
                visibleMatches: 1,
                resultCount: 1,
                topScore: 0,
                anchorIndex: null,
                topIndex: null,
                resultIndices: [],
                summaryType: 'text',
            }
        } else {
            appState.searchState.currentSearchSummary.query = 'seed'
        }
        mount()
        pressKeydown('Escape', {})

        expect(appState.searchState.currentSearchSummary?.query).toBe('')
    })
})