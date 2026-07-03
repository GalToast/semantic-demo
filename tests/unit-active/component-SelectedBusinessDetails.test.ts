/**
 * component-SelectedBusinessDetails.test.ts — Source-inspection test for
 * SelectedBusinessDetails.svelte (W48-D external-link a11y).
 *
 * The component imports businessRecords from @lib/data-store which hits a
 * circular dependency chain in vitest, preventing a full render(). Uses
 * source inspection to verify the a11y contract, same pattern as
 * component-FocusCard.test.ts and component-SearchResults.test.ts.
 *
 * Verifies:
 *   1. External links carry aria-label="X (opens in new tab)"
 *   2. External links include a .sr-only "(opens in new tab)" suffix
 *   3. Internal links do NOT carry the "(opens in new tab)" announcement
 *   4. rel="noopener noreferrer" is preserved for external links
 *   5. .sr-only is the standard CSS class (defined in css/base.css)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SELECTED_DETAILS_PATH = resolve(__dirname, '../../src/components/SelectedBusinessDetails.svelte')

function readSelectedDetailsSource(): string {
    return readFileSync(SELECTED_DETAILS_PATH, 'utf8')
}

describe('SelectedBusinessDetails component (W48-D external-link a11y)', () => {
    it('external links carry an aria-label warning of new tab', () => {
        const src = readSelectedDetailsSource()
        // Template-level conditional aria-label: only set when isExternal.
        expect(src).toMatch(/aria-label=\{fact\.isExternal \? `\$\{fact\.label\} \(opens in new tab\)` : null\}/)
    })

    it('external links include a .sr-only "(opens in new tab)" suffix', () => {
        const src = readSelectedDetailsSource()
        // Screen reader reads the suffix even though it's visually hidden.
        expect(src).toMatch(/<span class="sr-only"[^>]*>\(opens in new tab\)<\/span>/)
    })

    it('does not announce "opens in new tab" for internal links', () => {
        const src = readSelectedDetailsSource()
        // The .sr-only span is wrapped in {#if fact.isExternal}.
        expect(src).toMatch(/\{#if fact\.isExternal\}[\s\S]*?sr-only/)
    })

    it('preserves rel="noopener noreferrer" for external links', () => {
        const src = readSelectedDetailsSource()
        expect(src).toMatch(/rel=\{fact\.isExternal \? 'noopener noreferrer' : null\}/)
    })

    it('preserves target="_blank" for external links', () => {
        const src = readSelectedDetailsSource()
        expect(src).toMatch(/target=\{fact\.isExternal \? '_blank' : null\}/)
    })

    it('uses standard .sr-only class (defined in css/base.css)', () => {
        // Sanity check: the .sr-only class exists in base.css so the
        // visually-hidden suffix actually hides visually.
        const baseCss = readFileSync(resolve(__dirname, '../../css/base.css'), 'utf8')
        expect(baseCss).toMatch(/\.sr-only\s*\{/)
    })
})

// W48-J: rename user-facing labels in the .selected-grid to drop
// engineering jargon. The ids stay the same (the contract tests lock
// them in), only the visible label text changes.
describe('SelectedBusinessDetails user-facing labels (W48-J)', () => {
    it('grid row labels are user-friendly (no "Thread", "Record", "Neighborhood", "Coordinates"?)', () => {
        const src = readSelectedDetailsSource()
        // Old labels must be gone.
        expect(src).not.toContain('Related Thread')
        expect(src).not.toContain('Semantic Neighborhood')
        expect(src).not.toContain('Record Status')
        // New friendly labels must be present.
        expect(src).toContain('Similar businesses')
        expect(src).toContain('Business type')
        expect(src).toContain('Status')
        // Location replaced raw Coordinates (raw lat/lng not useful to users).
        expect(src).toContain('Location')
    })

    it('grid row titles explain the value when hovered (screen-reader friendly)', () => {
        const src = readSelectedDetailsSource()
        // Title tooltips for the renamed labels. The engineer's old
        // copy ("strongest signal chain", "through recorded
        // relationships") is dropped in favor of plain user-language.
        expect(src).toMatch(/title="The kind of business this is[^"]*"/)
        expect(src).toMatch(/title="Other similar businesses in the area[^"]*"/)
    })
})
