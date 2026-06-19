/**
 * component-ModeChips.test.ts — Component test for Header.svelte mode chips
 *
 * Uses source-inspection (readFileSync + string assertions) to verify the
 * a11y/structure contract. The component imports stores from
 * @lib/stores/navigation.svelte which hits circular dependency chains in the
 * vitest environment, preventing a full render().
 *
 * Verifies:
 *  1. Root #mode-chips has role="radiogroup" and aria-label="View mode"
 *  2. Contains 6 mode-chip buttons (Overview, Search, Trail, Focus, Inside, Map)
 *  3. Each button has role="radio" with aria-checked attribute
 *  4. Each button has aria-label matching its label text
 *  5. Each button has title attribute with mode description
 *  6. Each button contains an SVG with aria-hidden="true"
 *  7. Each button contains a .chip-label span
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const HEADER_PATH = resolve(__dirname, '../../src/components/Header.svelte');

function readSource(): string {
    return readFileSync(HEADER_PATH, 'utf-8');
}

describe('Header mode chips', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('root #mode-chips has role="radiogroup" and aria-label="View mode"', () => {
        expect(source).toContain('id="mode-chips"');
        expect(source).toContain('role="radiogroup"');
        expect(source).toContain('aria-label="View mode"');
    });

    it('contains 6 mode options in the modes array', () => {
        // The {#each modes as mode} loop renders one button per entry.
        // Verify all 6 mode ids are defined.
        const modeIds = ['overview', 'search', 'trail', 'focus', 'inside', 'map'];
        for (const id of modeIds) {
            expect(source).toContain(`id: '${id}'`);
        }
    });

    it('each button has role="radio" with aria-checked', () => {
        expect(source).toContain('role="radio"');
        expect(source).toContain('aria-checked={isActive(mode.id)}');
    });

    it('each button has aria-label matching its label', () => {
        expect(source).toContain('aria-label={mode.label}');
        const labels = ['Overview', 'Search', 'Trail', 'Focus', 'Inside', 'Map'];
        for (const label of labels) {
            expect(source).toContain(`label: '${label}'`);
        }
    });

    it('each button has title attribute with mode description', () => {
        expect(source).toContain('title={mode.description}');
    });

    it('each button contains an SVG with aria-hidden="true"', () => {
        expect(source).toContain('class="chip-icon"');
        expect(source).toContain('aria-hidden="true"');
        expect(source).toContain('<use href="#{mode.iconId}"/>');
    });

    it('each button contains a .chip-label span', () => {
        expect(source).toContain('class="chip-label"');
        expect(source).toContain('{mode.label}</span>');
    });

    it('MODE_DESCRIPTIONS defines descriptions for all navigation modes', () => {
        expect(source).toContain('County-wide overview across all visible records');
        expect(source).toContain('Geographic map view of the county');
        expect(source).toContain('Focused path of related business entities');
        expect(source).toContain('Immersive exploration of local neighborhoods');
    });
});
