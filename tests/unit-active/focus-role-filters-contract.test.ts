import { describe, expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SRC = resolve(__dirname, '../../src/components/JourneyChrome.svelte')
// FocusNeighborhood.svelte owns role filter chips post-W54 extraction from JourneyChrome.
const FOCUS_NEIGHBORHOOD_SRC = resolve(__dirname, '../../src/lib/components/journey/FocusNeighborhood.svelte')

describe('Phase 3 filter chip contract', () => {
    test('filter chip container has correct a11y attributes', () => {
        const source = readFileSync(FOCUS_NEIGHBORHOOD_SRC, 'utf8')
        expect(source).toContain('id="focus-role-filters"')
        expect(source).toContain('role="group"')
        expect(source).toContain('aria-label="Filter neighbors by relationship"')
    })

    test('filter chips render as <button> with data-role-filter', () => {
        const source = readFileSync(FOCUS_NEIGHBORHOOD_SRC, 'utf8')
        // Each chip is a button with data-role-filter
        expect(source).toContain('data-role-filter=')
        // Active chip gets aria-pressed
        expect(source).toContain('aria-pressed={active}')
        // Click dispatches the filter setter
        expect(source).toContain('setPocketRoleFilter')
    })

    test('filter options include all four values', () => {
        const source = readFileSync(FOCUS_NEIGHBORHOOD_SRC, 'utf8')
        expect(source).toMatch(/ROLE_FILTER_OPTIONS.*=.*\[.*'all'.*'direct'.*'support'.*'civic'/s)
    })
})
