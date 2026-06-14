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

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const repoRoot = process.cwd();
const appSvelte = readFileSync(join(repoRoot, 'src', 'App.svelte'), 'utf-8');
const searchInputSvelte = readFileSync(
    join(repoRoot, 'src', 'components', 'SearchInput.svelte'),
    'utf-8'
);

describe('P1 quick-jump search shortcut', () => {
    it('App.svelte registers a global keydown listener for / to focus search', () => {
        // The effect must add a keydown listener on window
        expect(appSvelte).toContain("window.addEventListener('keydown'");
        // Must handle '/' key
        expect(appSvelte).toContain("e.key === '/'");
        // Must focus the search input by id
        expect(appSvelte).toContain("getElementById('search-input')");
        // Must call preventDefault to avoid literal '/' in the input
        expect(appSvelte).toContain('e.preventDefault()');
    });

    it('App.svelte handles Esc to clear the search input when focused', () => {
        // Must handle 'Escape' key
        expect(appSvelte).toContain("e.key === 'Escape'");
        // Must check that the search input is the active element
        expect(appSvelte).toContain('document.activeElement === searchInput');
        // Must set the value to empty
        expect(appSvelte).toContain("searchInput.value = ''");
        // Must dispatch an input event so the store updates
        expect(appSvelte).toContain("new Event('input'");
    });

    it('App.svelte skips the / shortcut when a form field is focused', () => {
        // Must check for input/textarea/select/contentEditable to skip shortcut
        expect(appSvelte).toContain("tag === 'input'");
        expect(appSvelte).toContain("tag === 'textarea'");
        expect(appSvelte).toContain("tag === 'select'");
        expect(appSvelte).toContain('isContentEditable');
        // Must check for modifier keys
        expect(appSvelte).toContain('e.metaKey');
        expect(appSvelte).toContain('e.ctrlKey');
        expect(appSvelte).toContain('e.altKey');
    });

    it('SearchInput.svelte placeholder mentions the / shortcut', () => {
        expect(searchInputSvelte).toMatch(/press\s*\/|\/\s*to\s*search/i);
    });
});
