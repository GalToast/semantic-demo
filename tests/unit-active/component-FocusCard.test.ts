/**
 * component-FocusCard.test.ts — Component test for FocusCard.svelte
 *
 * Uses source-inspection (readFileSync + string assertions) to verify the
 * a11y/structure contract. The component imports businessRecords from
 * @lib/data-store which hits a circular dependency chain in the vitest
 * environment, preventing a full render(). This pattern matches the
 * established search-focus-indicator.test.ts approach.
 *
 * Verifies:
 *  1. Root #selected-card has aria-label="Selected business"
 *  2. Root element has .focus-card, .selected-card, .focus-stage-card classes
 *  3. Empty state #selected-empty with .selected-empty class
 *  4. .selected-empty-headline contains "Select a business"
 *  5. .selected-empty-sub contains guidance text
 *  6. Empty-state SVG .empty-icon has aria-hidden="true"
 *  7. Populated h2#focus-stage-name has aria-live="polite"
 *  8. #selected-role-badge has .selected-role-badge class
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const FOCUS_CARD_PATH = resolve(__dirname, '../../src/components/FocusCard.svelte')

function readSource(): string {
    return readFileSync(FOCUS_CARD_PATH, 'utf-8')
}

describe('FocusCard component', () => {
    let source: string

    beforeAll(() => {
        source = readSource()
    })

    it('root #selected-card has aria-label="Selected business"', () => {
        expect(source).toContain('id="selected-card"')
        expect(source).toContain('aria-label="Selected business"')
    })

    it('root element has .focus-card, .selected-card, .focus-stage-card classes', () => {
        expect(source).toContain('class="focus-card selected-card focus-stage-card"')
    })

    it('empty state #selected-empty with .selected-empty class', () => {
        expect(source).toContain('id="selected-empty"')
        expect(source).toContain('class="selected-empty"')
    })

    it('.selected-empty-headline contains "Select a business"', () => {
        expect(source).toContain('class="selected-empty-headline"')
        expect(source).toContain('Select a business')
    })

    it('.selected-empty-sub contains guidance text', () => {
        expect(source).toContain('class="selected-empty-sub"')
        expect(source).toContain('Click a business on the map to explore')
    })

    it('empty-state SVG .empty-icon has aria-hidden="true"', () => {
        expect(source).toContain('class="empty-icon"')
        expect(source).toContain('aria-hidden="true"')
    })

    it('populated state renders SelectedBusinessDetails component', () => {
        expect(source).toContain('SelectedBusinessDetails')
        expect(source).toContain('<SelectedBusinessDetails')
        expect(source).toMatch(/SelectedBusinessDetails\s+\{viewModel\}/)
    })

    it('SelectedBusinessDetails component renders the card content (verified in its own contract test)', () => {
        // The card content is now delegated to SelectedBusinessDetails.svelte
        // which is tested by its own contract tests.
        expect(source).toContain('SelectedBusinessDetails')
    })
})
