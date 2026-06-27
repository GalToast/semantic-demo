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
// W46-B3: keyboard handler extracted to src/lib/keyboard/global-shortcuts.ts
// (the orchestrator that originally held this was deleted in W47 cleanup).
const keyboardSource = readFileSync(join(repoRoot, 'src', 'lib', 'keyboard', 'global-shortcuts.ts'), 'utf-8')
const searchInputSvelte = readFileSync(join(repoRoot, 'src', 'components', 'SearchInput.svelte'), 'utf-8')

describe('P1 quick-jump search shortcut', () => {
    it('global-shortcuts.ts registers a global keydown listener for / to focus search', () => {
        // The listener must add a keydown listener on window
        expect(keyboardSource).toContain("window.addEventListener('keydown'")
        // Must handle '/' key
        expect(keyboardSource).toContain("e.key === '/'")
        // Must focus the search input by id
        expect(keyboardSource).toContain("getElementById('search-input')")
        // Must call preventDefault to avoid literal '/' in the input
        expect(keyboardSource).toContain('e.preventDefault()')
    })

    it('global-shortcuts.ts handles Esc to clear the search input', () => {
        // Must handle 'Escape' key
        expect(keyboardSource).toContain("e.key === 'Escape'")
        // Must set the value to empty
        expect(keyboardSource).toContain("searchInput.value = ''")
        // Must dispatch an input event so the store updates
        expect(keyboardSource).toContain("new Event('input'")
    })

    it('global-shortcuts.ts skips the / shortcut when a form field is focused', () => {
        // Must check for input/textarea/select/contentEditable to skip shortcut
        expect(keyboardSource).toContain("tag === 'input'")
        expect(keyboardSource).toContain("tag === 'textarea'")
        expect(keyboardSource).toContain("tag === 'select'")
        expect(keyboardSource).toContain('isContentEditable')
        // Must check for modifier keys
        expect(keyboardSource).toContain('e.metaKey')
        expect(keyboardSource).toContain('e.ctrlKey')
        expect(keyboardSource).toContain('e.altKey')
    })

    it('SearchInput.svelte placeholder mentions the / shortcut', () => {
        expect(searchInputSvelte).toMatch(/press\s*\/|\/\s*to\s*search/i)
    })
})
