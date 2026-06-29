/**
 * @file state-searcherror-typing-contract.test.ts
 *
 * Lock-in test for the engine-boundary refactor Phase 2-1: searchError field
 * tightening. Ensures the appState.searchError field is typed
 * `SearchErrorData | null` (not `unknown | null` or other loose types), and
 * that the SearchErrorData interface is exported from state-types.ts.
 *
 * Promotion history:
 *   - SearchErrorData was a local interface in src/lib/search/results-ui.ts
 *   - Phase 2-1 hoisted it to src/lib/state/state-types.ts so appState can
 *     declare the field's runtime shape without `unknown`.
 *
 * Run: npx vitest run tests/unit-active/state-searcherror-typing-contract.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')
const APP_STATE_PATH = path.join(ROOT, 'src', 'lib', 'state', 'app.svelte.ts')
const STATE_TYPES_PATH = path.join(ROOT, 'src', 'lib', 'state', 'state-types.ts')
const RESULTS_UI_PATH = path.join(ROOT, 'src', 'search', 'results-ui.ts')
const SEARCH_STORE_PATH = path.join(ROOT, 'src', 'lib', 'stores', 'search.svelte.ts')

function readSource(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

describe('engine-boundary refactor / Phase 2-1 / searchError field typing', () => {
    it('appState declares searchError with SearchErrorData type (not unknown)', () => {
        // Phase 6b: searchError moved into appState.searchState sub-aggregate
        // The SearchAppState interface in state-types.ts declares the field type.
        const stateTypes = readSource('src/lib/state/state-types.ts')
        const declMatch = stateTypes.match(/searchError:\s*SearchErrorData\s*\|\s*null/)
        expect(declMatch, 'SearchAppState.searchError declaration not found').not.toBeNull()
        const declaredType = declMatch![0]
        expect(
            declType(declaredType),
            `SearchAppState.searchError declared as "${declaredType}" — must be "searchError: SearchErrorData | null"`
        ).toBe(true)
        // Negative: must not be loosely typed
        expect(declaredType).not.toMatch(/\bunknown\b/)
        expect(declaredType).not.toMatch(/\bany\b/)
    })

    it('SearchErrorData interface is exported from state-types.ts', () => {
        const stateTypes = readSource('src/lib/state/state-types.ts')
        // Must export the interface (not just declare it)
        expect(stateTypes).toMatch(/export\s+interface\s+SearchErrorData\b/)
        // Must contain the three required fields
        expect(stateTypes).toMatch(/interface\s+SearchErrorData\s*\{[\s\S]*query\s*:\s*string/)
        expect(stateTypes).toMatch(
            /interface\s+SearchErrorData\s*\{[\s\S]*type\s*:\s*['"]inline['"]\s*\|\s*['"]full['"]/
        )
        expect(stateTypes).toMatch(/interface\s+SearchErrorData\s*\{[\s\S]*message\s*:\s*string/)
    })

    it('results-ui.ts no longer has local SearchErrorData interface (imported instead)', () => {
        const resultsUi = readSource('src/lib/search/results-ui.ts')
        // Local declaration would be `interface SearchErrorData` (without export)
        expect(resultsUi).not.toMatch(/^\s*interface\s+SearchErrorData\b/m)
        // Must import the type from state-types.ts
        expect(resultsUi).toMatch(
            /import\s+type\s*\{[^}]*\bSearchErrorData\b[^}]*\}\s+from\s+['"][^'"]*state-types['"]/
        )
    })

    it('search.svelte.ts runtime assignment matches SearchErrorData shape', () => {
        const searchStore = readSource('src/lib/stores/search.svelte.ts')
        // The setSearchError function must set query, type, message
        const setSearchError = searchStore.match(/export\s+function\s+setSearchError[\s\S]*?\n\}/m)
        expect(setSearchError, 'setSearchError not found in search.svelte.ts').not.toBeNull()
        const body = setSearchError![0]
        // Phase 6b: searchError moved into searchState sub-aggregate
        expect(body).toMatch(/appState\.searchState\.searchError\s*=\s*\{[\s\S]*query[\s\S]*type[\s\S]*message/)
    })

    it('state-validation.ts treats searchError as passthrough (no narrow validation)', () => {
        // passthrough is fine — runtime validation shouldn't reject the
        // typed shape, but tightening the appState field type doesn't
        // require changing validation. Lock this in to detect accidental
        // over-validation.
        // Phase 6b: searchError lives in appState.searchState sub-aggregate
        const validation = readSource('src/lib/state/state-validation.ts')
        expect(validation).toMatch(/^\s*searchError:\s*passthrough,/m)
    })
})

function declType(declaredType: string): boolean {
    return declaredType.replace(/\s+/g, ' ').trim() === 'searchError: SearchErrorData | null'
}
