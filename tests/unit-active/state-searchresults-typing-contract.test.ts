/**
 * @file state-searchresults-typing-contract.test.ts
 *
 * Lock-in test for the engine-boundary refactor Phase 2-2: searchResults
 * field tightening. Ensures the appState.searchResults field is typed
 * `SearchResult[]` (not `Array<Record<string, unknown>>` or other loose types),
 * and that the SearchResult and SearchResultPoint interfaces are exported
 * from state-types.ts.
 *
 * Promotion history:
 *   - SearchResult + SearchResultPoint were local interfaces in
 *     src/lib/search/results-ui.ts
 *   - Phase 2-2 hoisted them to src/lib/state/state-types.ts so appState
 *     can declare the field's runtime shape without `Array<Record<string,
 *     unknown>>`.
 *
 * Run: npx vitest run tests/unit-active/state-searchresults-typing-contract.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')
const APP_STATE_PATH = path.join(ROOT, 'src', 'lib', 'state', 'app.svelte.ts')
const STATE_TYPES_PATH = path.join(ROOT, 'src', 'lib', 'state', 'state-types.ts')
const RESULTS_UI_PATH = path.join(ROOT, 'src', 'search', 'results-ui.ts')

function readSource(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

describe('engine-boundary refactor / Phase 2-2 / searchResults field typing', () => {
    it('appState declares searchResults with SearchResult[] type', () => {
        const appState = readSource('src/lib/state/app.svelte.ts')
        const declMatch = appState.match(/searchResults\s*=\s*\$state<([^>]+)>\(/)
        expect(declMatch, 'appState.searchResults declaration not found').not.toBeNull()
        const declaredType = declMatch![1]
        const normalized = declaredType.replace(/\s+/g, ' ').trim()
        expect(normalized, `appState.searchResults declared as "${declaredType}" — must be SearchResult[]`).toBe('SearchResult[]')
        // Negative: must not be loosely typed
        expect(declaredType).not.toMatch(/\bunknown\b/)
        expect(declaredType).not.toMatch(/\bany\b/)
        expect(declaredType).not.toMatch(/Record<string, unknown>/)
    })

    it('SearchResult interface is exported from state-types.ts with required fields', () => {
        const stateTypes = readSource('src/lib/state/state-types.ts')
        // Types are re-exported from state-types.ts (thin barrel) — check the actual definition
        const searchTypes = readSource('src/lib/state/types/search-types.ts')
        expect(searchTypes).toMatch(/export\s+interface\s+SearchResult\b/)
        // Required fields
        expect(searchTypes).toMatch(/interface\s+SearchResult\s*\{[\s\S]*point\s*:\s*SearchResultPoint/)
        expect(searchTypes).toMatch(/interface\s+SearchResult\s*\{[\s\S]*index\s*:\s*number/)
        expect(searchTypes).toMatch(/interface\s+SearchResult\s*\{[\s\S]*score\s*:\s*number/)
        // Optional fields
        expect(searchTypes).toMatch(/interface\s+SearchResult\s*\{[\s\S]*publicNote\?\s*:\s*string/)
        expect(searchTypes).toMatch(/interface\s+SearchResult\s*\{[\s\S]*publicDetail\?\s*:\s*string/)
        // Index signature for back-compat
        expect(searchTypes).toMatch(/interface\s+SearchResult\s*\{[\s\S]*\[key: string\]:\s*unknown/)
    })

    it('SearchResultPoint interface is exported from state-types.ts with required fields', () => {
        const stateTypes = readSource('src/lib/state/state-types.ts')
        // Types are re-exported from state-types.ts (thin barrel) — check the actual definition
        const searchTypes = readSource('src/lib/state/types/search-types.ts')
        expect(searchTypes).toMatch(/export\s+interface\s+SearchResultPoint\b/)
        // Optional fields
        expect(searchTypes).toMatch(/interface\s+SearchResultPoint\s*\{[\s\S]*lead_id\?\s*:\s*string\s*\|\s*number/)
        expect(searchTypes).toMatch(/interface\s+SearchResultPoint\s*\{[\s\S]*name\?\s*:\s*string/)
        expect(searchTypes).toMatch(/interface\s+SearchResultPoint\s*\{[\s\S]*city\?\s*:\s*string/)
        // Index signature for back-compat
        expect(searchTypes).toMatch(/interface\s+SearchResultPoint\s*\{[\s\S]*\[key: string\]:\s*unknown/)
    })

    it('results-ui.ts no longer has local SearchResult / SearchResultPoint interfaces', () => {
        const resultsUi = readSource('src/lib/search/results-ui.ts')
        // Local declaration would be `interface SearchResult` (without export)
        expect(resultsUi).not.toMatch(/^\s*interface\s+SearchResultPoint\b/m)
        expect(resultsUi).not.toMatch(/^\s*interface\s+SearchResult\b/m)
        // Must import the types from state-types.ts
        expect(resultsUi).toMatch(/import\s+type\s*\{[^}]*\bSearchResult\b[^}]*\}\s+from\s+['"][^'"]*state-types['"]/)
        expect(resultsUi).toMatch(/import\s+type\s*\{[^}]*\bSearchResultPoint\b[^}]*\}\s+from\s+['"][^'"]*state-types['"]/)
    })

    it('search-results field validation only checks array-ness (no narrow validation)', () => {
        // state-validation.ts uses passthrough-style array check for searchResults
        // — does NOT narrow the inner element type. Lock this in to detect
        // accidental over-validation that would conflict with SearchResult[].
        const validation = readSource('src/lib/state/state-validation.ts')
        expect(validation).toMatch(/searchResults:\s*\(value:\s*unknown\)\s*:\s*string\s*\|\s*null\s*=>\s*\{[\s\S]*Array\.isArray/)
    })

    it('runtime assignments to appState.searchResults use SearchResult[] shape or empty array', () => {
        const resultsUi = readSource('src/lib/search/results-ui.ts')
        // All 3 assignment sites: either `dedupedResults` (SearchResult[]) or `[]`
        const assignments = resultsUi.match(/appState\.searchResults\s*=\s*[^\n]+/g) || []
        expect(assignments.length).toBeGreaterThanOrEqual(3)
        assignments.forEach((a) => {
            const isValidShape = /=\s*\[\s*\]/.test(a) || /=\s*dedupedResults\b/.test(a)
            expect(isValidShape, `unexpected searchResults assignment: ${a}`).toBe(true)
        })
    })
})