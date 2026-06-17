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
 *  4. .selected-empty-headline contains "Select a node"
 *  5. .selected-empty-sub contains guidance text
 *  6. Empty-state SVG .empty-icon has aria-hidden="true"
 *  7. Populated h2#focus-stage-name has aria-live="polite"
 *  8. #selected-role-badge has .selected-role-badge class
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FOCUS_CARD_PATH = resolve(__dirname, '../../src/components/FocusCard.svelte');

function readSource(): string {
    return readFileSync(FOCUS_CARD_PATH, 'utf-8');
}

describe('FocusCard component', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('root #selected-card has aria-label="Selected business"', () => {
        expect(source).toContain('id="selected-card"');
        expect(source).toContain('aria-label="Selected business"');
    });

    it('root element has .focus-card, .selected-card, .focus-stage-card classes', () => {
        expect(source).toContain('class="focus-card selected-card focus-stage-card"');
    });

    it('empty state #selected-empty with .selected-empty class', () => {
        expect(source).toContain('id="selected-empty"');
        expect(source).toContain('class="selected-empty"');
    });

    it('.selected-empty-headline contains "Select a node"', () => {
        expect(source).toContain('class="selected-empty-headline"');
        expect(source).toContain('Select a node');
    });

    it('.selected-empty-sub contains guidance text', () => {
        expect(source).toContain('class="selected-empty-sub"');
        expect(source).toContain('Click a business in the field to explore');
    });

    it('empty-state SVG .empty-icon has aria-hidden="true"', () => {
        expect(source).toContain('class="empty-icon"');
        expect(source).toContain('aria-hidden="true"');
    });

    it('populated h2#focus-stage-name has aria-live="polite"', () => {
        expect(source).toContain('id="focus-stage-name"');
        expect(source).toContain('aria-live="polite"');
        expect(source).toContain('class="selected-card-name focus-stage-name"');
    });

    it('#selected-role-badge has .selected-role-badge class', () => {
        expect(source).toContain('id="selected-role-badge"');
        expect(source).toContain('class="selected-role-badge"');
    });
});
