/**
 * quickjump-search-shortcut.test.ts
 *
 * Verifies the P1 quick-jump search shortcut wiring in App.svelte.
 * The shortcut adds a global window keydown listener that:
 *   - `/` focuses #search-input (when not in a form field, no modifiers)
 *   - `Esc` clears #search-input when focused
 *
 * These are structural invariant tests — they read the source and assert
 * the listener logic is present, matching the unit-active test pattern.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const orchSource = readFileSync(join(repoRoot, 'src', 'lib', 'orchestration', 'app-orchestration.svelte.ts'), 'utf-8')
const searchInputSvelte = readFileSync(join(repoRoot, 'src', 'components', 'SearchInput.svelte'), 'utf-8')

describe('P1 quick-jump search shortcut', () => {
    it('app-orchestration.svelte.ts registers a global keydown listener for / to focus search', () => {
        // The listener must add a keydown listener on window
        expect(orchSource).toContain("window.addEventListener('keydown'")
        // Must handle '/' key
        expect(orchSource).toContain("e.key === '/'")
        // Must focus the search input by id
        expect(orchSource).toContain("getElementById('search-input')")
        // Must call preventDefault to avoid literal '/' in the input
        expect(orchSource).toContain('e.preventDefault()')
    })

    it('app-orchestration.svelte.ts handles Esc to clear the search input', () => {
        // Must handle 'Escape' key
        expect(orchSource).toContain("e.key === 'Escape'")
        // Must set the value to empty
        expect(orchSource).toContain("searchInput.value = ''")
        // Must dispatch an input event so the store updates
        expect(orchSource).toContain("new Event('input'")
    })

    it('app-orchestration.svelte.ts skips the / shortcut when a form field is focused', () => {
        // Must check for input/textarea/select/contentEditable to skip shortcut
        expect(orchSource).toContain("tag === 'input'")
        expect(orchSource).toContain("tag === 'textarea'")
        expect(orchSource).toContain("tag === 'select'")
        expect(orchSource).toContain('isContentEditable')
        // Must check for modifier keys
        expect(orchSource).toContain('e.metaKey')
        expect(orchSource).toContain('e.ctrlKey')
        expect(orchSource).toContain('e.altKey')
    })

    it('SearchInput.svelte placeholder mentions the / shortcut', () => {
        expect(searchInputSvelte).toMatch(/press\s*\/|\/\s*to\s*search/i)
    })
})
