/**
 * url-state-no-synthetic-input.test.ts
 *
 * PR-O5 followup: verifies that url-state.ts no longer dispatches a
 * synthetic 'input' event on the #search-input element during URL
 * hydration. The event was the second trigger for runSearch (after
 * the url-state path itself called runSearch). Removing it eliminates
 * the second runSearch call entirely; the onMount guard in
 * SearchInput + the reactive sync effect keep the input value correct
 * without the event.
 *
 * Run: npx vitest run tests/unit-active/url-state-no-synthetic-input.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readUrlState(): string {
    const p = resolve(__dirname, '../../src/lib/orchestration/url-state.ts')
    return readFileSync(p, 'utf-8')
}

// Extract the body of `_restoreSearchFromParams` (the function that
// used to dispatch the synthetic input event). The body starts at the
// function signature and ends at the matching closing brace before
// the next top-level function (`_showToast`).
function extractSearchRestoreBlock(src: string): string {
    const start = src.indexOf('async function _restoreSearchFromParams')
    if (start === -1) return ''
    // Find the next top-level function declaration after the start
    const nextFn = src.indexOf('\nfunction _showToast', start)
    return src.slice(start, nextFn === -1 ? src.length : nextFn)
}

describe('PR-O5-followup: url-state no longer dispatches synthetic input', () => {
    it('does NOT dispatch a synthetic input event on #search-input', () => {
        const restoreBlock = extractSearchRestoreBlock(readUrlState())
        expect(restoreBlock).not.toMatch(/dispatchEvent\([\s\S]{0,40}['"]input['"]/)
    })

    it('still sets input.value to match the URL ?q= param (UI-7)', () => {
        const restoreBlock = extractSearchRestoreBlock(readUrlState())
        expect(restoreBlock).toMatch(/input\.value\s*=\s*query/)
    })

    it('comment explains why the synthetic event was removed (PR-O5-followup)', () => {
        const src = readUrlState()
        // The comment should reference the audit and explain the dedup
        expect(src).toMatch(/PR-O5[\s-]followup/)
        expect(src).toMatch(/performsearch-dup-audit/i)
    })
});
