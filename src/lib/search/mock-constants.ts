/**
 * @lib/search/mock-constants.ts — Shared constants and utilities for mock search.
 *
 * Extracted from mock-catalog.ts to break the circular dependency between
 * mock-catalog.ts ↔ scoring.ts. Both files import from this module instead
 * of from each other.
 */

export const MOCK_QUERY_ALIASES: Record<string, string[]> = {
    coffee: ['coffee', 'cafe', 'espresso', 'latte', 'roaster', 'bakery', 'brew'],
    roof: ['roof', 'roofing', 'roofer', 'shingle'],
    childcare: ['childcare', 'child care', 'daycare', 'day care'],
    dog: ['dog', 'pet', 'groom', 'grooming', 'paws', 'kennel']
}

export const MOCK_QUERY_NAICS_PREFIX: Readonly<Record<string, string>> = Object.freeze({
    coffee: '722515',
    roof: '238160',
    childcare: '624410',
    dog: '812910'
})

export const MOCK_QUERY_NAICS_DENY: Readonly<Record<string, string[]>> = Object.freeze({
    childcare: ['611512', '611710', '812910', '611110', '611610'],
    dog: ['624410', '611512', '722515'],
    coffee: ['238160', '624410'],
    roof: ['722515', '624410', '812910']
})

export function normalizeMockSearchText(value: unknown): string {
    return String(value || '')
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/[^a-z0-9\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}
