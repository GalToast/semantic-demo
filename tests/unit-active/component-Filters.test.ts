/**
 * component-Filters.test.ts — Source-inspection test for Filters.svelte
 * (W48-F dynamic city population).
 *
 * The Filters component previously hardcoded 5 city options (Conroe, The
 * Woodlands, Spring, Magnolia, Montgomery) but the dataset has 32 unique
 * cities. Cities like Willis (1207 records), Cleveland (796), and Houston
 * (12) were unreachable through the filter — a real, user-visible UX gap.
 *
 * Source-inspection pattern from component-FocusCard.test.ts because
 * Filters imports from the @lib/data-store circular dependency chain.
 *
 * Verifies:
 *   1. Imports getBusinessRecords for dynamic city data
 *   2. cityOptions is a $derived.by that counts cities in business records
 *   3. cities are sorted by count DESC (most populous first)
 *   4. The <select> renders #city-filter + All Cities option + each city
 *   5. Each city <option> shows name + record count for context
 *   6. No hardcoded city list remains in the template
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const FILTERS_PATH = resolve(__dirname, '../../src/components/Filters.svelte')

function readFiltersSource(): string {
    return readFileSync(FILTERS_PATH, 'utf-8')
}

describe('Filters component (W48-F dynamic city population)', () => {
    it('imports getBusinessRecords for dynamic city data', () => {
        const src = readFiltersSource()
        expect(src).toMatch(
            /import \{ getBusinessRecords \} from '@lib\/data-store'/
        )
    })

    it('defines cityOptions as a $derived.by counting cities in business records', () => {
        const src = readFiltersSource()
        expect(src).toMatch(/const cityOptions = \$derived\.by\(\(\) => \{/)
        expect(src).toMatch(/for \(const r of records\) \{/)
        expect(src).toMatch(/counts\.set\(city, \(counts\.get\(city\) \?\? 0\) \+ 1\)/)
    })

    it('sorts cities by record count DESC (most populous first)', () => {
        const src = readFiltersSource()
        expect(src).toMatch(/\.sort\(\(a, b\) => b\[1\] - a\[1\]\)/)
    })

    it('renders the All Cities option with a record count', () => {
        const src = readFiltersSource()
        // All Cities option should still exist as the reset/empty value.
        expect(src).toMatch(/<option value="">All Cities/)
        // And it should show the total record count for context.
        expect(src).toMatch(/All Cities \(\{getBusinessRecords\(\)\.length\}\)/)
    })

    it('renders each city as an <option> with name and record count', () => {
        const src = readFiltersSource()
        expect(src).toMatch(/\{#each cityOptions as opt \(opt\.city\)\}/)
        expect(src).toMatch(/<option value=\{opt\.city\}>\{opt\.city\} \(\{opt\.count\}\)<\/option>/)
    })

    it('drops the hardcoded city list', () => {
        const src = readFiltersSource()
        // The old hardcoded 5 options must NOT be present anymore.
        expect(src).not.toMatch(/<option value="Conroe">Conroe<\/option>/)
        expect(src).not.toMatch(/<option value="The Woodlands">The Woodlands<\/option>/)
        expect(src).not.toMatch(/<option value="Magnolia">Magnolia<\/option>/)
        expect(src).not.toMatch(/<option value="Montgomery">Montgomery<\/option>/)
    })

    it('keeps the city-filter id and aria-label for contract tests', () => {
        const src = readFiltersSource()
        expect(src).toContain('id="city-filter"')
        expect(src).toContain('aria-label="Filter by city"')
    })
})